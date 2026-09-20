import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { AuthController } from '../../src/modules/auth/controllers/auth-controller.ts';
import type { AuthRepository, AuthTransaction, RateLimiter } from '../../src/modules/auth/repositories/auth-repository.ts';
import { createAuthRouter } from '../../src/modules/auth/routes/auth-router.ts';
import { AuthService } from '../../src/modules/auth/services/auth-service.ts';
import type { MailerPort } from '../../src/modules/email/mailer-port.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import { CookiePolicy } from '../../src/shared/security/cookie-policy.ts';
import { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { OtpCodeService } from '../../src/shared/security/otp-code.ts';
import type { PasswordHasher } from '../../src/shared/security/password-hasher.ts';

const logger: Logger = { info: () => undefined, error: () => undefined };
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKey = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function createHarness() {
  const revokedFamilies: string[] = [];
  const transaction = {
    revokeRefreshFamily: async (familyId: string) => { revokedFamilies.push(familyId); },
  } as unknown as AuthTransaction;
  const repository: AuthRepository = { transaction: async (work) => work(transaction) };
  const rateLimiter: RateLimiter = { consume: async () => true };
  const passwords: PasswordHasher = {
    hash: async () => 'unused-hash',
    verify: async () => false,
  };
  const mailer: MailerPort = {
    sendRegistrationOtp: async () => undefined,
    sendPasswordReset: async () => undefined,
  };
  const accessTokens = new Rs256AccessTokenService({
    privateKey,
    publicKey,
    issuer: 'kartunamadigital.id',
    audience: 'kartunamadigital-web',
    ttlSeconds: 900,
  });
  const csrf = new CsrfTokenService('logout-test-csrf-secret-at-least-32-bytes');
  const auth = new AuthService({
    repository,
    rateLimiter,
    passwords,
    opaqueTokens: new OpaqueTokenService(),
    otpCodes: new OtpCodeService('logout-test-otp-secret-at-least-32-bytes'),
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
      appUrl: 'https://example.test',
    },
    dummyPasswordHash: 'unused-dummy-hash',
  });
  return { auth, accessTokens, csrf, revokedFamilies };
}

async function logout(auth: AuthService, headers: Record<string, string> = {}): Promise<Response> {
  const cookies = new CookiePolicy({ secure: true, sameSite: 'Lax', accessTtlSeconds: 900, refreshTtlDays: 30 });
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing',
    logger,
    authRouter: createAuthRouter(new AuthController(auth, cookies)),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    return await fetch(`http://127.0.0.1:${port}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: '{}',
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('valid logout revokes the refresh-token family and clears all session cookies', async () => {
  const setup = createHarness();
  const accessToken = setup.accessTokens.issue({ userPublicId: 'user-public-id', sessionId: 'family-valid', role: 'member' });
  const csrfToken = setup.csrf.issue('family-valid');

  const response = await logout(setup.auth, {
    cookie: `access_token=${accessToken}; refresh_token=refresh-value; csrf_token=${csrfToken}`,
    'x-csrf-token': csrfToken,
  });
  const body = await response.json() as { success: boolean; message: string };
  const setCookies = response.headers.getSetCookie();

  assert.equal(response.status, 200);
  assert.deepEqual(setup.revokedFamilies, ['family-valid']);
  assert.equal(body.success, true);
  assert.equal(body.message, 'Logged out.');
  assert.equal(setCookies.some((value) => value.startsWith('access_token=;') && value.includes('Path=/api/v1;') && value.includes('HttpOnly')), true);
  assert.equal(setCookies.some((value) => value.startsWith('refresh_token=;') && value.includes('Path=/api/v1/auth;') && value.includes('HttpOnly')), true);
  assert.equal(setCookies.some((value) => value.startsWith('csrf_token=;') && value.includes('Path=/;') && !value.includes('HttpOnly')), true);
});

test('expired access token returns HTTP 401 AUTH_REQUIRED before CSRF validation', async () => {
  const setup = createHarness();
  const expiredAt = new Date(Date.now() - 3_600_000);
  const accessToken = setup.accessTokens.issue({ userPublicId: 'user-public-id', sessionId: 'family-expired', role: 'member' }, expiredAt);

  const response = await logout(setup.auth, { cookie: `access_token=${accessToken}` });
  const body = await response.json() as { code: string };

  assert.equal(response.status, 401);
  assert.equal(body.code, 'AUTH_REQUIRED');
  assert.deepEqual(setup.revokedFamilies, []);
});

test('invalid access token returns HTTP 401 AUTH_REQUIRED', async () => {
  const setup = createHarness();
  const response = await logout(setup.auth, { cookie: 'access_token=invalid-token', 'x-csrf-token': 'invalid-csrf' });
  const body = await response.json() as { code: string };

  assert.equal(response.status, 401);
  assert.equal(body.code, 'AUTH_REQUIRED');
  assert.deepEqual(setup.revokedFamilies, []);
});

test('valid access token with invalid CSRF returns HTTP 403 CSRF_INVALID', async () => {
  const setup = createHarness();
  const accessToken = setup.accessTokens.issue({ userPublicId: 'user-public-id', sessionId: 'family-csrf', role: 'member' });

  const response = await logout(setup.auth, {
    cookie: `access_token=${accessToken}`,
    'x-csrf-token': 'invalid-csrf',
  });
  const body = await response.json() as { code: string };

  assert.equal(response.status, 403);
  assert.equal(body.code, 'CSRF_INVALID');
  assert.deepEqual(setup.revokedFamilies, []);
});

test('missing access token returns HTTP 401 AUTH_REQUIRED', async () => {
  const setup = createHarness();
  const response = await logout(setup.auth, { 'x-csrf-token': 'invalid-csrf' });
  const body = await response.json() as { code: string };

  assert.equal(response.status, 401);
  assert.equal(body.code, 'AUTH_REQUIRED');
  assert.deepEqual(setup.revokedFamilies, []);
});
