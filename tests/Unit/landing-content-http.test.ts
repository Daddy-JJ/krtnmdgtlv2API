import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { LandingContentController } from '../../src/modules/landing-content/controllers/landing-content-controller.ts';
import { landingContentDefaults } from '../../src/modules/landing-content/dto/landing-content.ts';
import { createAdminLandingContentRouter, createPublicLandingContentRouter } from '../../src/modules/landing-content/routes/landing-content-router.ts';
import type { LandingContentService } from '../../src/modules/landing-content/services/landing-content-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';

let writes = 0;
const service = {
  publicContent: async () => landingContentDefaults,
  adminContent: async () => landingContentDefaults,
  update: async () => { writes += 1; return { updatedAt: '2026-08-12T00:00:00.000Z' }; },
} as unknown as LandingContentService;
const actors = {
  authenticate: () => ({ userPublicId: 'admin', sessionId: 'session', role: 'super_admin' }),
  authorizeUnsafe: (_token: string | undefined, csrf: string | undefined) => {
    if (csrf !== 'valid') throw new AppError(403, 'CSRF_INVALID', 'CSRF invalid.');
    return { userPublicId: 'admin', sessionId: 'session', role: 'super_admin' };
  },
} as unknown as AuthenticatedActorService;
const logger: Logger = { info: () => undefined, error: () => undefined };

async function call(method: string, path: string, body?: unknown, csrf?: string) {
  const controller = new LandingContentController(service, actors);
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) }, environment: 'testing', logger, publicLandingContentRouter: createPublicLandingContentRouter(controller), adminLandingContentRouter: createAdminLandingContentRouter(controller) });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  try { return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { method, headers: { cookie: 'access_token=value', ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('public landing wording is readable without authentication', async () => {
  const response = await call('GET', '/api/v1/public/content/landing');
  assert.equal(response.status, 200); assert.equal((await response.json() as { data: { heroTitle: string } }).data.heroTitle, landingContentDefaults.heroTitle);
});

test('landing wording publication requires CSRF and a complete valid plain-text payload', async () => {
  writes = 0;
  assert.equal((await call('PUT', '/api/v1/admin/landing-content', { content: landingContentDefaults, reason: 'Approved homepage wording update' })).status, 403);
  assert.equal((await call('PUT', '/api/v1/admin/landing-content', { content: { ...landingContentDefaults, heroTitle: '<script>' }, reason: 'Approved homepage wording update' }, 'valid')).status, 422);
  assert.equal((await call('PUT', '/api/v1/admin/landing-content', { content: landingContentDefaults, reason: 'Approved homepage wording update' }, 'valid')).status, 200);
  assert.equal(writes, 1);
});
