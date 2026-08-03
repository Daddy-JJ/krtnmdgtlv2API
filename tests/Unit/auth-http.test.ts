import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { AuthController } from '../../src/modules/auth/controllers/auth-controller.ts';
import { createAuthRouter } from '../../src/modules/auth/routes/auth-router.ts';
import type { AuthService } from '../../src/modules/auth/services/auth-service.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import { CookiePolicy } from '../../src/shared/security/cookie-policy.ts';

const silentLogger: Logger = { info: () => undefined, error: () => undefined };
const session = { accessToken: 'access-value', refreshToken: 'refresh-value', csrfToken: 'csrf-value', user: { publicId: 'user-id', email: 'user@example.com', role: 'user' as const } };
const service = {
  register: async () => undefined,
  verifyEmailOtp: async () => undefined,
  resendOtp: async () => undefined,
  login: async () => session,
  refresh: async () => session,
  logout: async () => undefined,
  forgotPassword: async () => undefined,
  resetPassword: async () => undefined,
} as unknown as AuthService;

async function call(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const cookies = new CookiePolicy({ secure: true, sameSite: 'Lax', accessTtlSeconds: 900, refreshTtlDays: 30 });
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) }, environment: 'testing', logger: silentLogger, authRouter: createAuthRouter(new AuthController(service, cookies)) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    return await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('login sets HttpOnly credentials and a readable Secure CSRF cookie', async () => {
  const response = await call('/api/v1/auth/login', { email: 'user@example.com', password: 'password-strong' });
  const setCookies = response.headers.getSetCookie();
  assert.equal(response.status, 200);
  assert.equal(setCookies.some((value) => value.startsWith('access_token=') && value.includes('HttpOnly') && value.includes('Secure')), true);
  assert.equal(setCookies.some((value) => value.startsWith('refresh_token=') && value.includes('HttpOnly')), true);
  assert.equal(setCookies.some((value) => value.startsWith('csrf_token=') && !value.includes('HttpOnly')), true);
  assert.equal(setCookies.some((value) => value.startsWith('csrf_token=') && value.includes('Path=/;')), true);
});

test('Auth validator rejects unknown fields before the service boundary', async () => {
  const response = await call('/api/v1/auth/register', { email: 'user@example.com', password: 'password-strong', role: 'admin' });
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(body.errors));
});

test('refresh rejects a request without cookie and CSRF credentials', async () => {
  const response = await call('/api/v1/auth/refresh', {});
  assert.equal(response.status, 401);
});
