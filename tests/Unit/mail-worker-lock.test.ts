import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { MailWorkerLockError, withMailWorkerLock } from '../../src/modules/email/mail-worker-lock.ts';
import { EmailTemplateDelivery } from '../../src/modules/email/templates/email-template-delivery.ts';
import { defaults } from '../../src/modules/email/templates/template-content.ts';
import type { CpanelSmtpMailer } from '../../src/modules/email/cpanel-smtp-mailer.ts';

function fixture() {
  let owner: EventEmitter | null = null, destroyed = 0, releaseFails = false, acquireNull = false;
  const sessions: EventEmitter[] = [];
  const pool = { getConnection: async () => {
    const connection = Object.assign(new EventEmitter(), {
      query: async ({ sql }: { sql: string }) => {
        if (sql.includes('GET_LOCK')) {
          if (acquireNull) return [[{ acquired: null }]];
          if (owner) return [[{ acquired: 0 }]];
          owner = connection;
          return [[{ acquired: 1 }]];
        }
        if (sql.includes('IS_USED_LOCK')) return [[{ owned: owner === connection ? 1 : 0 }]];
        if (sql.includes('RELEASE_LOCK')) {
          if (releaseFails) throw new Error('release unavailable');
          if (owner === connection) owner = null;
          return [[{ released: 1 }]];
        }
        throw new Error('Unexpected query');
      },
      destroy: () => { destroyed++; if (owner === connection) owner = null; },
    });
    sessions.push(connection);
    return connection;
  } } as unknown as Pool;
  return { pool, sessions, get destroyed() { return destroyed; },
    failRelease: () => { releaseFails = true; }, nullAcquire: () => { acquireNull = true; },
    lose: () => { const prior = owner; owner = null; prior?.emit('error', new Error('connection lost')); },
  };
}

test('overlapping mail workers skip without processing or releasing the active worker lock', async () => {
  const f = fixture(); let secondRan = false;
  assert.equal(await withMailWorkerLock(f.pool, 'queue_test', async assertHeld => {
    assert.equal(await withMailWorkerLock(f.pool, 'queue_test', async () => { secondRan = true; }), false);
    await assertHeld();
  }), true);
  assert.equal(secondRan, false);
  assert.equal(f.destroyed, 2);
  assert.equal(await withMailWorkerLock(f.pool, 'queue_test', async () => {}), true);
});

test('work failure releases the lock and allows the next invocation', async () => {
  const f = fixture();
  await assert.rejects(withMailWorkerLock(f.pool, 'queue_test', async () => { throw new Error('work failed'); }), /work failed/);
  assert.equal(f.destroyed, 1);
  assert.equal(await withMailWorkerLock(f.pool, 'queue_test', async () => {}), true);
});

test('release failure still destroys the reserved connection', async () => {
  const f = fixture(); f.failRelease();
  await assert.rejects(withMailWorkerLock(f.pool, 'queue_test', async () => {}), /release unavailable/);
  assert.equal(f.destroyed, 1);
});

test('NULL lock acquisition fails closed and never runs jobs', async () => {
  const f = fixture(); f.nullAcquire();
  await assert.rejects(withMailWorkerLock(f.pool, 'queue_test', async () => assert.fail('must not run')), MailWorkerLockError);
  assert.equal(f.destroyed, 1);
});

test('connection loss stops further work and closes the lock session', async () => {
  const f = fixture();
  await assert.rejects(withMailWorkerLock(f.pool, 'queue_test', async assertHeld => {
    f.lose(); await assertHeld(); assert.fail('must stop');
  }), MailWorkerLockError);
  assert.equal(f.destroyed, 1);
});

test('all rendered delivery and template tests check worker lock immediately before SMTP', async () => {
  let sent = 0, finished = 0;
  const delivery = new EmailTemplateDelivery({
    appUrl: 'https://example.test', beforeSend: async () => { throw new MailWorkerLockError(); },
    mailer: { sendRendered: async () => { sent++; } } as unknown as CpanelSmtpMailer,
    repository: {
      published: async key => ({ content: defaults(key), version: null }),
      claimTest: async () => ({ testId: 'test', key: 'auth.password-reset', email: 'test@example.test', content: defaults('auth.password-reset') }),
      finishTest: async () => { finished++; },
    },
  });
  await assert.rejects(delivery.send('auth.password-reset', 'test@example.test', { resetUrl: 'https://example.test/reset-password/#token=test' }), MailWorkerLockError);
  await assert.rejects(delivery.workTest(), MailWorkerLockError);
  assert.equal(sent, 0); assert.equal(finished, 0);
});
