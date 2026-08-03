import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { AccountController } from '../../src/modules/account/controllers/account-controller.ts';
import { createAccountRouter } from '../../src/modules/account/routes/account-router.ts';
import type { AccountService } from '../../src/modules/account/services/account-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';

const logger: Logger = { info: () => undefined, error: () => undefined };
const user = { publicId: 'user-public-id', email: 'user@example.com', role: 'user' as const, status: 'active', emailVerified: true };
const service = {
  currentUser: async () => user,
  updateCurrentUser: async (_userPublicId: string, email: string) => ({ ...user, email, emailVerified: false }),
} as unknown as AccountService;
const actors = {
  authenticate: (token: string | undefined) => {
    if (token !== 'access-value') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return { userPublicId: user.publicId, sessionId: 'session-id', role: 'user' as const };
  },
  authorizeUnsafe: (token: string | undefined, csrf: string | undefined) => {
    if (token !== 'access-value') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    if (csrf !== 'valid-csrf') throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    return { userPublicId: user.publicId, sessionId: 'session-id', role: 'user' as const };
  },
} as unknown as AuthenticatedActorService;

async function call(method: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing',
    logger,
    accountRouter: createAccountRouter(new AccountController(service, actors)),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/me`, {
      method,
      headers: { 'content-type': 'application/json', cookie: 'access_token=access-value', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('GET /me returns the current authenticated user', async () => {
  const response = await call('GET');
  const body = await response.json() as { data: { user: typeof user } };
  assert.equal(response.status, 200);
  assert.deepEqual(body.data.user, user);
});

test('PUT /me requires session-bound CSRF and returns updated email as unverified', async () => {
  const rejected = await call('PUT', { email: 'new@example.com' });
  assert.equal(rejected.status, 403);

  const accepted = await call('PUT', { email: 'new@example.com' }, { 'x-csrf-token': 'valid-csrf' });
  const body = await accepted.json() as { data: { user: typeof user } };
  assert.equal(accepted.status, 200);
  assert.equal(body.data.user.email, 'new@example.com');
  assert.equal(body.data.user.emailVerified, false);
});

test('PUT /me rejects unknown fields before the service boundary', async () => {
  const response = await call('PUT', { email: 'new@example.com', role: 'admin' }, { 'x-csrf-token': 'valid-csrf' });
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});
