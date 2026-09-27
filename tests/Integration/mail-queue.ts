import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { MySqlAuthRepository } from '../../src/modules/auth/repositories/mysql-auth-repository.ts';
import { MySqlMailOutboxRepository } from '../../src/modules/email/mail-outbox-repository.ts';
import { MySqlAdminMailRepository } from '../../src/modules/admin/repositories/mysql-admin-mail-repository.ts';
import { PasswordResetMailWorker } from '../../src/modules/email/password-reset-mail-worker.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { withMailWorkerLock } from '../../src/modules/email/mail-worker-lock.ts';
import { createDatabasePool } from '../../src/shared/database/pool.ts';
import { parseEnvironment } from '../../src/config/environment.ts';

export async function verifyMailQueue(pool: Pool): Promise<void> {
  const auth = new MySqlAuthRepository(pool), outbox = new MySqlMailOutboxRepository(pool);
  const admin = new MySqlAdminMailRepository(pool);
  const user = await auth.transaction(tx => tx.insertUser(randomUUID(), 'mail-queue@example.test', 'unused-test-hash', new Date()));
  const actor = await auth.transaction(tx => tx.insertUser(randomUUID(), 'mail-admin@example.test', 'unused-test-hash', new Date()));
  const enqueue = () => auth.transaction(tx => tx.enqueuePasswordResetMail({ publicId: randomUUID(), userId: user.id, email: user.email, now: new Date() }));
  const jobs = async () => (await pool.query<Array<RowDataPacket & { id: number; public_id: string; status: string; available_at: Date; attempts: number }>>(
    "SELECT id,public_id,status,available_at,attempts FROM mail_outbox WHERE user_id=? AND template_key='auth.password-reset' ORDER BY id", [user.id],
  ))[0];
  await Promise.all(Array.from({ length: 8 }, enqueue));
  assert.equal((await jobs()).length, 1, 'concurrent submissions must coalesce');
  const first = (await jobs())[0]!;
  const later = new Date(Math.floor(Date.now() / 1000) * 1000 + 600000);
  await pool.execute('UPDATE mail_outbox SET available_at=?,attempts=1 WHERE id=?', [later, first.id]);
  await enqueue();
  assert.equal((await jobs())[0]!.available_at.getTime(), later.getTime());
  assert.equal((await jobs())[0]!.attempts, 1);
  await pool.execute('UPDATE mail_outbox SET available_at=UTC_TIMESTAMP() WHERE id=?', [first.id]);
  const processing = await outbox.claimPasswordReset();
  assert.equal(processing?.id, first.id);
  await Promise.all([enqueue(), enqueue()]);
  assert.equal((await jobs()).length, 1, 'processing job also coalesces');
  await outbox.markFailed(processing!);
  await enqueue();
  assert.equal((await jobs()).length, 1, 'retry backoff must not create another job');
  // Make it terminal, then race an admin retry against a new request. Exactly
  // one queued job survives, regardless of which transaction obtains user lock.
  await pool.execute("UPDATE mail_outbox SET status='failed',attempts=3 WHERE id=?", [first.id]);
  const outcomes = await Promise.allSettled([
    admin.retry(actor.publicId, first.public_id, 'Retry for isolated regression test', null), enqueue(),
  ]);
  for (const result of outcomes) if (result.status === 'rejected') assert.equal(result.reason.code, 'MAIL_RETRY_NOT_ALLOWED');
  assert.equal((await jobs()).filter(job => job.status === 'queued').length, 1);
  // Verify a failed historical job cannot be retried beside a pending reset.
  const failedId = randomUUID();
  await pool.execute(`INSERT INTO mail_outbox(public_id,user_id,template_key,recipient_email,subject,payload_text,status,attempts,max_attempts,available_at,created_at,updated_at)
    VALUES(?,?,'auth.password-reset',?,'test','{}','failed',3,3,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [failedId, user.id, user.email]);
  await assert.rejects(admin.retry(actor.publicId, failedId, 'Duplicate retry must be blocked', null), { code: 'MAIL_RETRY_NOT_ALLOWED' });
  let delivered = '', sends = 0;
  const tokens = new OpaqueTokenService();
  const worker = new PasswordResetMailWorker({ outbox, auth, tokens, appUrl: 'https://example.test',
    mailer: { sendRegistrationOtp: async () => assert.fail('no OTP'), sendPasswordReset: async (_email, url) => { sends++; delivered = url; } },
  });
  const [dbRows] = await pool.query<Array<RowDataPacket & { name: string }>>('SELECT DATABASE() AS name');
  const database = dbRows[0]!.name;
  const smallPoolEnvironment = parseEnvironment({
    APP_ENV: 'testing', DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    DB_PORT: process.env.TEST_DB_PORT ?? '3306', DB_SOCKET: process.env.TEST_DB_SOCKET ?? '',
    DB_DATABASE: database, DB_USERNAME: process.env.TEST_DB_USERNAME ?? 'root',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? '', DB_CONNECTION_LIMIT: '1',
    CSRF_HMAC_KEY: randomUUID(), OTP_HMAC_KEY: randomUUID(),
  });
  const lockPool = createDatabasePool(smallPoolEnvironment), workPool = createDatabasePool(smallPoolEnvironment);
  try {
    assert.equal(await withMailWorkerLock(lockPool, database, async assertHeld => {
      await assertHeld();
      // Lock ownership must not occupy the only application-work connection.
      await workPool.query({ sql: 'SELECT 1', timeout: 5000 });
    }), true);
  } finally { await Promise.all([lockPool.end(), workPool.end()]); }
  assert.equal(await withMailWorkerLock(pool, database, async assertHeld => {
    assert.equal(await withMailWorkerLock(pool, database, async () => assert.fail('overlap must skip')), false);
    await assertHeld();
    assert.equal(await worker.runOnce(), true);
    assert.equal(await worker.runOnce(), false);
  }), true);
  assert.equal(sends, 1);
  const resetToken = new URLSearchParams(new URL(delivered).hash.slice(1)).get('token')!;
  const reset = await auth.transaction(tx => tx.findPasswordReset(tokens.hash(resetToken)));
  assert.ok(reset && !reset.usedAt && reset.expiresAt.getTime() > Date.now() + 29 * 60000);
  await auth.transaction(tx => tx.consumePasswordReset(reset!.id, new Date()));
  assert.ok((await auth.transaction(tx => tx.findPasswordReset(tokens.hash(resetToken))))?.usedAt);
  // A genuinely new request after delivery remains allowed.
  await enqueue();
  assert.equal((await jobs()).filter(job => job.status === 'queued').length, 1);
  assert.equal(await worker.runOnce(), true);
  assert.equal(sends, 2);
  // Retry remains available if there is no competing job, but stale recipients fail closed.
  assert.equal((await admin.retry(actor.publicId, failedId, 'Retry after pending mail completed', null)).status, 'queued');
  const retry = await outbox.claimPasswordReset();
  assert.ok(retry);
  await outbox.markObsolete(retry!);
  await pool.execute('UPDATE users SET email=? WHERE id=?', ['changed-mail@example.test', user.id]);
  await assert.rejects(admin.retry(actor.publicId, failedId, 'Old address must not receive reset', null), { code: 'MAIL_RETRY_NOT_ALLOWED' });
  // Enqueue using the former email must not create a new reset job.
  await auth.transaction(tx => tx.enqueuePasswordResetMail({ publicId: randomUUID(), userId: user.id, email: user.email, now: new Date() }));
  assert.equal((await jobs()).filter(job => job.status === 'queued').length, 0);
}
