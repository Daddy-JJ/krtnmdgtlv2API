import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from '../../src/modules/auth/services/auth-service.ts';
import type { AuthRepository, AuthTransaction, RateLimiter } from '../../src/modules/auth/repositories/auth-repository.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { ScryptPasswordHasher } from '../../src/shared/security/password-hasher.ts';
import { AccountService } from '../../src/modules/account/services/account-service.ts';
import type { AccountRepository } from '../../src/modules/account/repositories/account-repository.ts';

function fixture(transaction: Partial<AuthTransaction> = {}, limiter: RateLimiter = { consume: async () => true }) {
  let hashes = 0, verifications = 0;
  const repository: AuthRepository = { transaction: work => work(transaction as AuthTransaction) };
  const service = new AuthService({ repository, rateLimiter: limiter, opaqueTokens: new OpaqueTokenService(),
    passwords: { hash: async () => { hashes++; return 'hashed'; }, verify: async () => { verifications++; return false; } },
    dummyPasswordHash: 'dummy',
  } as unknown as ConstructorParameters<typeof AuthService>[0]);
  return { service, get hashes() { return hashes; }, get verifications() { return verifications; } };
}

test('invalid, expired and already-used reset tokens never invoke scrypt', async () => {
  const now = new Date();
  for (const reset of [null, { id: 1, userId: 1, expiresAt: new Date(0), usedAt: null }, { id: 1, userId: 1, expiresAt: new Date(Date.now() + 60000), usedAt: now }]) {
    const f = fixture({ findPasswordReset: async () => reset });
    await assert.rejects(() => f.service.resetPassword('fake-token', 'password', 'ip'), { code: 'VALIDATION_ERROR' });
    assert.equal(f.hashes, 0);
  }
});
test('reset rechecks token under lock after hashing, concurrent consumption cannot update password', async () => {
  let calls = 0, writes = 0;
  const f = fixture({ findPasswordReset: async () => ({ id: 1, userId: 1, expiresAt: new Date(Date.now() + 60000), usedAt: ++calls === 1 ? null : new Date() }), updatePassword: async () => { writes++; } });
  await assert.rejects(() => f.service.resetPassword('valid-before-race', 'password', 'ip'), { code: 'VALIDATION_ERROR' });
  assert.equal(f.hashes, 1); assert.equal(writes, 0);
});
test('login enforces independent IP and identity buckets before password work', async () => {
  const calls: Array<[string, string]> = [];
  const f = fixture({ findUserByEmail: async () => null }, { consume: async (action, identity) => { calls.push([action, identity]); return action !== 'login:identity'; } });
  await assert.rejects(() => f.service.login('user@example.test', 'password', 'ip-one'), { code: 'RATE_LIMITED' });
  assert.deepEqual(calls, [['login:ip', 'ip-one'], ['login:identity', 'user@example.test']]); assert.equal(f.verifications, 0);
});
test('IP rate limit stops register/reset before hashing even with new email/token', async () => {
  const f = fixture({}, { consume: async () => false });
  await assert.rejects(() => f.service.register('new@example.test', 'password', 'same-ip'), { status: 429 });
  await assert.rejects(() => f.service.resetPassword('new-token', 'password', 'same-ip'), { status: 429 });
  assert.equal(f.hashes, 0);
});
test('scrypt concurrency is process-wide, bounded and recovers after completion', async () => {
  const first = new ScryptPasswordHasher(), second = new ScryptPasswordHasher();
  const pending = [first.hash('password-a'), second.hash('password-b')];
  await assert.rejects(() => first.hash('password-c'), { status: 503, code: 'AUTH_BUSY' });
  await Promise.all(pending);
  assert.match(await first.hash('password-d'), /^\$scrypt\$/);
});
test('email change verifies current password before any mutation', async () => {
  let written = false;
  const repository = { findPasswordHash: async () => 'existing-hash', updateEmail: async () => { written = true; return null; } } as unknown as AccountRepository;
  const service = new AccountService(repository, { hash: async () => '', verify: async () => false }, { consume: async () => true });
  await assert.rejects(() => service.updateCurrentUser('owner', 'new@example.test', 'wrong'), { status: 401, code: 'INVALID_CREDENTIALS' });
  assert.equal(written, false);
});
