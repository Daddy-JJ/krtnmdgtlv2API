import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { StarterController } from '../../src/modules/starter/controllers/starter-controller.ts';
import { createStarterRouter } from '../../src/modules/starter/routes/starter-router.ts';
import type { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import { CookiePolicy } from '../../src/shared/security/cookie-policy.ts';
import { duplicateCardEmail, identityReview } from '../../src/shared/security/card-email-identity.ts';
import { AppError } from '../../src/shared/http/errors.ts';

const silentLogger: Logger = { info: () => undefined, error: () => undefined };
const card = { publicId: '7fe91d39-c2a8-4b29-bc1d-b5304c7bfc61', slug: 'aBcDeFg', planCode: 'starter' as const, themeCode: 'starter-clean', locale: 'id' as const, status: 'published', canonicalUrl: 'https://kartunamadigital.id/aBcDeFg', qrImageUrl: '/api/v1/public/cards/aBcDeFg/qr', contact: { fullName: 'Starter', jobTitle: '', organization: '', officePhone: '021', mobilePhone: '0812', email: 'starter@example.com', websiteUrl: 'https://example.com', addressText: 'Jakarta' } };
const service = {
  create: async () => ({ card, manageToken: 'manage-value', csrfToken: 'csrf-value' }),
  openAccess: async () => ({ card, manageToken: 'email-manage', csrfToken: 'email-csrf' }),
  signupContext: async () => ({ email: card.contact.email }),
  update: async () => ({ card, manageToken: 'rotated-manage', csrfToken: 'rotated-csrf' }),
  claim: async () => ({ card, csrfToken: 'access-csrf' }),
} as unknown as StarterService;

async function call(method: string, path: string, body: unknown, headers: Record<string, string> = {}, currentService:StarterService=service): Promise<Response> {
  const cookies = new CookiePolicy({ secure: true, sameSite: 'Lax', accessTtlSeconds: 900, refreshTtlDays: 30 });
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) }, environment: 'testing', logger: silentLogger, starterRouter: createStarterRouter(new StarterController(currentService, cookies)) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    return await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
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

test('Starter update without CSRF is denied before any mutation', async () => {
  const response = await call('PUT', `/api/v1/starter/cards/${card.publicId}`, { contact: card.contact }, { cookie: 'starter_manage=manage-value' });
  assert.equal(response.status, 403);
});

test('anonymous duplicate response is exact, private-data-free and never sets cookies',async()=>{
  const duplicate={create:async()=>{throw duplicateCardEmail();}} as unknown as StarterService;
  const response=await call('POST','/api/v1/starter/cards',{contact:card.contact},{cookie:'access_token=unrelated-expired-session'},duplicate);
  assert.equal(response.status,409);
  assert.deepEqual(await response.json(),{success:false,message:'A card already exists for this email.',code:'STARTER_EMAIL_ALREADY_EXISTS',data:null});
  assert.deepEqual(response.headers.getSetCookie(),[]);
});

test('Starter email exchange sets HttpOnly credentials without returning the token', async () => {
  const response = await call('POST', '/api/v1/starter/access', { publicId: card.publicId, token: 'email-link-token' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith('starter_manage=') && value.includes('HttpOnly')));
  assert.doesNotMatch(await response.text(), /email-manage|email-link-token/);
  const invalid = await call('POST', '/api/v1/starter/access', { publicId: card.publicId });
  assert.equal(invalid.status, 422);
});

test('Starter signup context requires management cookie and is never cached', async () => {
  const missing = await call('GET', `/api/v1/starter/cards/${card.publicId}/signup-context`, null);
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal((await missing.json() as { code: string }).code, 'STARTER_TOKEN_INVALID');
  const response = await call('GET', `/api/v1/starter/cards/${card.publicId}/signup-context`, null, { cookie: 'starter_manage=manage-value' });
  const body = await response.json() as { data: Record<string, unknown> };
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(body.data, { email: card.contact.email });
  assert.deepEqual(Object.keys(body.data), ['email']);
});

test('Starter claim requires access and manage cookies', async () => {
  const response = await call('POST', `/api/v1/starter/cards/${card.publicId}/claim`, {}, { cookie: 'starter_manage=manage-value', 'x-csrf-token': 'csrf-value' });
  assert.equal(response.status, 401);
});

test('incomplete identity guard returns safe 503 without management cookies',async()=>{
  const unavailable={create:async()=>{throw new AppError(503,'CARD_EMAIL_GUARD_UNAVAILABLE','Card creation is temporarily unavailable.');}} as unknown as StarterService;
  const response=await call('POST','/api/v1/starter/cards',{contact:card.contact},{},unavailable);
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{success:false,message:'Card creation is temporarily unavailable.',code:'CARD_EMAIL_GUARD_UNAVAILABLE',data:null});
  assert.deepEqual(response.headers.getSetCookie(),[]);
});

test('valid legacy signup context returns private no-store review with no credential rotation',async()=>{
  const review={signupContext:async()=>{throw identityReview();}} as unknown as StarterService;
  const response=await call('GET',`/api/v1/starter/cards/${card.publicId}/signup-context`,null,{cookie:'starter_manage=fixture'},review);
  assert.equal(response.status,409);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{success:false,message:'Card identity requires support review.',code:'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED',data:null});
  assert.deepEqual(response.headers.getSetCookie(),[]);
});
