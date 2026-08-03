import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { FeedbackController } from '../../src/modules/feedback/controllers/feedback-controller.ts';
import { createFeedbackRouter } from '../../src/modules/feedback/routes/feedback-router.ts';
import type { FeedbackService } from '../../src/modules/feedback/services/feedback-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';

const logger: Logger = { info: () => undefined, error: () => undefined };
const submitted: string[] = [];
const service = { submit: async (_user: string, message: string) => { submitted.push(message); return { publicId: 'feedback-id', status: 'new' as const }; } } as FeedbackService;
const actors = {
  authorizeUnsafe: (token: string | undefined, csrf: string | undefined) => {
    if (token !== 'access-value') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    if (csrf !== 'valid-csrf') throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    return { userPublicId: 'user-id', sessionId: 'session-id', role: 'user' as const };
  },
} as AuthenticatedActorService;

async function call(body: unknown, csrf = 'valid-csrf'): Promise<Response> {
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing',
    logger,
    feedbackRouter: createFeedbackRouter(new FeedbackController(service, actors)),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'access_token=access-value', 'x-csrf-token': csrf },
      body: JSON.stringify(body),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('POST /feedback requires CSRF and accepts a trimmed 1-300 character message', async () => {
  assert.equal((await call({ message: 'Improve QR analytics' }, 'wrong')).status, 403);
  const response = await call({ message: '  Improve QR analytics  ' });
  assert.equal(response.status, 201);
  assert.equal(submitted.at(-1), 'Improve QR analytics');
});

test('POST /feedback rejects empty, oversized, and unknown fields', async () => {
  assert.equal((await call({ message: '' })).status, 422);
  assert.equal((await call({ message: 'x'.repeat(301) })).status, 422);
  assert.equal((await call({ message: 'Valid', role: 'admin' })).status, 422);
});
