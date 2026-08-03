import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { StarterController } from '../../src/modules/starter/controllers/starter-controller.ts';
import { createStarterRouter } from '../../src/modules/starter/routes/starter-router.ts';
import type { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import { CookiePolicy } from '../../src/shared/security/cookie-policy.ts';

const silentLogger: Logger = { info: () => undefined, error: () => undefined };
const card = { publicId: '7fe91d39-c2a8-4b29-bc1d-b5304c7bfc61', slug: 'aBcDeFg', planCode: 'starter' as const, themeCode: 'starter-clean', locale: 'id' as const, status: 'published', canonicalUrl: 'https://kartunamadigital.id/aBcDeFg', qrImageUrl: '/api/v1/public/cards/aBcDeFg/qr', contact: { fullName: 'Starter', jobTitle: '', organization: '', officePhone: '021', mobilePhone: '0812', email: 'starter@example.com', websiteUrl: 'https://example.com', addressText: 'Jakarta' } };
const service = {
  create: async () => ({ card, manageToken: 'manage-value', csrfToken: 'csrf-value' }),
  update: async () => ({ card, manageToken: 'rotated-manage', csrfToken: 'rotated-csrf' }),
  claim: async () => ({ card, csrfToken: 'access-csrf' }),
} as unknown as StarterService;

async function call(method: string, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const cookies = new CookiePolicy({ secure: true, sameSite: 'Lax', accessTtlSeconds: 900, refreshTtlDays: 30 });
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) }, environment: 'testing', logger: silentLogger, starterRouter: createStarterRouter(new StarterController(service, cookies)) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    return await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('Starter create exposes card data but keeps manage credential in HttpOnly cookie', async () => {
  const response = await call('POST', '/api/v1/starter/cards', { contact: card.contact });
  const body = await response.json() as { data: Record<string, unknown> };
  assert.equal(response.status, 201);
  assert.equal(body.data.slug, 'aBcDeFg');
  assert.doesNotMatch(JSON.stringify(body), /manage-value/);
  assert.equal(response.headers.getSetCookie().some((value) => value.startsWith('starter_manage=') && value.includes('HttpOnly')), true);
  assert.equal(response.headers.getSetCookie().some((value) => value.startsWith('starter_csrf_token=') && !value.includes('HttpOnly')), true);
  assert.equal(response.headers.getSetCookie().some((value) => value.startsWith('starter_csrf_token=') && value.includes('Path=/;')), true);
});

test('Starter update requires both manage and CSRF credentials', async () => {
  const response = await call('PUT', `/api/v1/starter/cards/${card.publicId}`, { contact: card.contact }, { cookie: 'starter_manage=manage-value' });
  assert.equal(response.status, 403);
});

test('Starter claim requires access and manage cookies', async () => {
  const response = await call('POST', `/api/v1/starter/cards/${card.publicId}/claim`, {}, { cookie: 'starter_manage=manage-value', 'x-csrf-token': 'csrf-value' });
  assert.equal(response.status, 401);
});
