import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from '../../src/modules/auth/services/auth-service.ts';
import type { AuthRepository, AuthTransaction, UserRecord } from '../../src/modules/auth/repositories/auth-repository.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { OtpCodeService } from '../../src/shared/security/otp-code.ts';
import type { PasswordHasher } from '../../src/shared/security/password-hasher.ts';
import type { RateLimiter } from '../../src/modules/auth/repositories/auth-repository.ts';
import type { MailerPort } from '../../src/modules/email/mailer-port.ts';
import type { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import type { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';

const dummyPasswordHash = 'dummy-password-hash';

function activeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 7,
    publicId: 'user-public-id',
    email: 'user@example.com',
    passwordHash: 'stored-password-hash',
    role: 'member',
    roles: ['member'],
    status: 'active',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeAuth(user: UserRecord | null, verifyResult: boolean, lookupError: Error | null = null) {
  const verifyCalls: Array<{ password: string; encodedHash: string }> = [];
  let refreshInserted = false;
  const transaction = {
    findUserByEmail: async () => {
      if (lookupError) throw lookupError;
      return user;
    },
    insertRefresh: async () => { refreshInserted = true; },
  } as unknown as AuthTransaction;
  const repository: AuthRepository = { transaction: async (work) => work(transaction) };
  const rateLimiter: RateLimiter = { consume: async () => true };
  const passwords: PasswordHasher = {
    hash: async () => 'unused-hash',
    verify: async (password, encodedHash) => {
      verifyCalls.push({ password, encodedHash });
      return verifyResult;
    },
  };
  const accessTokens = { issue: () => 'access-token' } as unknown as Rs256AccessTokenService;
  const csrf = { issue: () => 'csrf-token' } as unknown as CsrfTokenService;
  const mailer: MailerPort = {
    sendRegistrationOtp: async () => undefined,
    sendPasswordReset: async () => undefined,
  };
  const auth = new AuthService({
    repository,
    rateLimiter,
    passwords,
    opaqueTokens: new OpaqueTokenService(),
    otpCodes: new OtpCodeService('x'.repeat(32)),
    accessTokens,
    csrf,
    mailer,
    config: {
      accessTtlSeconds: 900,
      refreshTtlDays: 30,
      otpExpiryMinutes: 10,
      otpMaxAttempts: 5,
      otpResendCooldownSeconds: 60,
      otpSendLimitPerHour: 5,
      appUrl: 'https://example.com',
    },
    dummyPasswordHash,
  });
  return { auth, verifyCalls, get refreshInserted() { return refreshInserted; } };
}

async function assertInvalidCredentials(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'INVALID_CREDENTIALS');
    return true;
  });
}

test('unknown email returns 401 and verifies against a safe dummy hash', async () => {
  const setup = makeAuth(null, false);
  await assertInvalidCredentials(() => setup.auth.login('unknown@example.com', 'password', 'test-client'));
  assert.deepEqual(setup.verifyCalls, [{ password: 'password', encodedHash: dummyPasswordHash }]);
});

test('wrong password returns 401', async () => {
  const setup = makeAuth(activeUser(), false);
  await assertInvalidCredentials(() => setup.auth.login('user@example.com', 'wrong-password', 'test-client'));
  assert.deepEqual(setup.verifyCalls, [{ password: 'wrong-password', encodedHash: 'stored-password-hash' }]);
});

test('missing password hash returns 401 without passing an empty hash to the verifier', async () => {
  const setup = makeAuth(activeUser({ passwordHash: '' }), false);
  await assertInvalidCredentials(() => setup.auth.login('user@example.com', 'password', 'test-client'));
  assert.deepEqual(setup.verifyCalls, [{ password: 'password', encodedHash: dummyPasswordHash }]);
});

test('valid credentials create a session and return 200-equivalent session data', async () => {
  const setup = makeAuth(activeUser(), true);
  const result = await setup.auth.login('user@example.com', 'correct-password', 'test-client');
  assert.equal(result.accessToken, 'access-token');
  assert.equal(result.csrfToken, 'csrf-token');
  assert.equal(result.user.email, 'user@example.com');
  assert.equal(result.user.role, 'member');
  assert.equal(setup.refreshInserted, true);
});

test('database lookup failure propagates without attempting password verification', async () => {
  const databaseError = new Error('simulated database failure');
  const setup = makeAuth(null, false, databaseError);
  await assert.rejects(
    () => setup.auth.login('user@example.com', 'password', 'test-client'),
    (error: unknown) => error === databaseError,
  );
  assert.deepEqual(setup.verifyCalls, []);
});
