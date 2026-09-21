import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import type { Pool } from 'mysql2/promise';
import { ResumeFileService } from '../../src/modules/resume-service/files/resume-file-service.ts';
import { ClamAvResumeScanner } from '../../src/modules/resume-service/files/resume-malware-scanner.ts';
import type { ResumePrivateStorage } from '../../src/modules/resume-service/files/resume-private-storage.ts';
import type { RbacService } from '../../src/shared/security/rbac-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import { PasswordResetMailWorker } from '../../src/modules/email/password-reset-mail-worker.ts';
import type { MySqlMailOutboxRepository } from '../../src/modules/email/mail-outbox-repository.ts';
import type { AuthRepository, AuthTransaction } from '../../src/modules/auth/repositories/auth-repository.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';

test('resume upload cannot persist or submit a document when scanner is missing or rejects it', async () => {
  for (const scanner of [new ClamAvResumeScanner(), { assertClean: async () => { throw new AppError(422, 'RESUME_FILE_UNSAFE', 'Rejected.'); } }]) {
    let removed = false, writes = 0;
    const pool = { execute: async (sql: string) => {
      if (/^(INSERT|UPDATE)/.test(sql)) writes++;
      return [[{ id: 1, user_id: 2, owner_public_id: 'owner', assigned_public_id: null, status: 'DRAFT' }]];
    } } as unknown as Pool;
    const storage = { write: async () => ({ storedFilename: 'opaque.pdf', storagePath: 'private.pdf' }), remove: async () => { removed = true; } } as unknown as ResumePrivateStorage;
    const files = new ResumeFileService(pool, storage, {} as RbacService, scanner);
    await assert.rejects(() => files.upload('owner', 'request', 'SOURCE_RESUME', { originalname: 'cv.pdf', buffer: Buffer.from('%PDF-1.7') }), error => error instanceof AppError && [422, 503].includes(error.status));
    assert.equal(writes, 0); assert.equal(removed, true);
  }
});
test('resume upload binds ownership before storage or scanning and only records antivirus-clean files', async () => {
  let stored = false, scanned = false, scanValue: unknown;
  const pool = { execute: async (sql: string, values: unknown[]) => {
    if (sql.startsWith('INSERT INTO resume_request_files')) { assert.equal(scanned, true); scanValue = values.at(-1); }
    return [[{ id: 1, user_id: 2, owner_public_id: 'owner', assigned_public_id: null, status: 'SUBMITTED' }]];
  } } as unknown as Pool;
  const storage = { write: async () => { stored = true; return { storedFilename: 'opaque.pdf', storagePath: 'private.pdf' }; }, remove: async () => {} } as unknown as ResumePrivateStorage;
  const files = new ResumeFileService(pool, storage, {} as RbacService, { assertClean: async () => { scanned = true; } });
  await assert.rejects(() => files.upload('other-user', 'request', 'SOURCE_RESUME', { originalname: 'cv.pdf', buffer: Buffer.from('%PDF-1.7') }), { status: 404 });
  assert.equal(stored, false);
  assert.equal((await files.upload('owner', 'request', 'SOURCE_RESUME', { originalname: 'cv.pdf', buffer: Buffer.from('%PDF-1.7') })).scanStatus, 'CLEAN_ANTIVIRUS');
  assert.equal(scanValue, 'CLEAN_ANTIVIRUS');
});

test('password reset mail uses fragment only and drops stale email jobs without sending', async () => {
  for (const eligible of [true, false]) {
    let sent = '', inserted = false, finished = false, obsolete = false;
    const tx = { findUserByEmail: async () => eligible ? { id: 7, status: 'active' } : null, insertPasswordReset: async () => { inserted = true; } } as unknown as AuthTransaction;
    const outbox = { claimPasswordReset: async () => ({ id: 1, userId: 7, email: 'test@example.test', templateVersion: null }), markSent: async () => { finished = true; }, markObsolete: async () => { obsolete = true; }, markFailed: async () => assert.fail('should not fail') } as unknown as MySqlMailOutboxRepository;
    const worker = new PasswordResetMailWorker({ outbox, auth: { transaction: async work => work(tx) } as AuthRepository, tokens: new OpaqueTokenService(), appUrl: 'https://example.test', mailer: { sendRegistrationOtp: async () => {}, sendPasswordReset: async (_email, url) => { sent = url; } } });
    assert.equal(await worker.runOnce(), true); assert.equal(finished, eligible); assert.equal(obsolete, !eligible); assert.equal(inserted, eligible);
    if (eligible) { const url = new URL(sent); assert.equal(url.search, ''); assert.match(url.hash, /^#token=.+/); }
    else assert.equal(sent, '');
  }
});

test('fatal exception/rejection terminates without exposing exception contents', async () => {
  const moduleUrl = new URL('../../src/shared/http/process-safety.ts', import.meta.url).href;
  for (const trigger of ["Promise.reject(new Error('SECRET_PASSWORD'))", "process.nextTick(() => { throw new Error('SECRET_PASSWORD'); })"]) {
    const result = await new Promise<{ code: number | string | null | undefined; stdout: string; stderr: string }>(resolve => {
      execFile(process.execPath, ['--input-type=module', '-e', `import { installProcessSafety } from ${JSON.stringify(moduleUrl)}; installProcessSafety({}, async()=>{}, {info(){},error(){}}); ${trigger};`], { timeout: 5000, windowsHide: true }, (error, stdout, stderr) => resolve({ code: error?.code, stdout, stderr }));
    });
    assert.equal(result.code, 1); assert.doesNotMatch(result.stderr + result.stdout, /SECRET_PASSWORD|Error:| at /); assert.match(result.stderr, /process\.(uncaught-exception|unhandled-rejection)/);
  }
});
