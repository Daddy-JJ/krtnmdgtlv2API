import assert from 'node:assert/strict';
import test from 'node:test';
import { Router } from 'express';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../../src/app.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import { sessionAuthorityMiddleware } from '../../src/shared/http/session-authority-middleware.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';
import { MySqlSessionAuthority } from '../../src/shared/security/session-authority.ts';
import { MySqlAdminDataRepository } from '../../src/modules/admin-data/repositories/mysql-admin-data-repository.ts';
import { parseEnvironment } from '../../src/config/environment.ts';

const logger = { info() {}, error() {} };
const actors = { authenticate(token: string) {
  if (token !== 'valid') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  return { userPublicId: 'owner', sessionId: 'family', role: 'member' };
} } as unknown as AuthenticatedActorService;

async function serve<T>(app: ReturnType<typeof createApp>, action: (base: string) => Promise<T>): Promise<T> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { return await action(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('all private route families reject missing, invalid and revoked sessions before handlers', async () => {
  let active = false, hits = 0;
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 1 }) }, environment: 'testing', logger,
    privateSessionGuard: sessionAuthorityMiddleware(actors, { isActive: async (user, family) => { assert.equal(user, 'owner'); assert.equal(family, 'family'); return active; } }),
  });
  await serve(app, async base => {
    for (const path of ['/me', '/cards', '/themes', '/payments', '/subscriptions', '/admin/feedback', '/resume-service', '/resume-requests', '/feedback', '/auth/csrf', '/auth/logout', '/starter/cards/card-id/claim', '/ADMIN/SECURITY/']) {
      for (const cookie of ['', 'access_token=expired', 'access_token=valid']) {
        const response = await fetch(base + path, { headers: { cookie } });
        assert.equal(response.status, 401, path);
        assert.equal((await response.json() as { code: string }).code, 'AUTH_REQUIRED');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        hits++;
      }
    }
    active = true;
    // With no router injected, a valid session reaches the 404 handler.
    assert.equal((await fetch(base + '/me', { headers: { cookie: 'access_token=valid' } })).status, 404);
  });
  assert.equal(hits, 39);
});

test('signed payment webhook and public auth do not inherit browser session failures', async () => {
  const payment = Router().post('/midtrans/webhook', (_req, res) => { res.json({ signedWebhookHandlerReached: true }); });
  const auth = Router().post('/login', (_req, res) => { res.json({ loginHandlerReached: true }); });
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 1 }) }, environment: 'production', logger, paymentRouter: payment, authRouter: auth,
    privateSessionGuard: sessionAuthorityMiddleware(actors, { isActive: async () => { throw new Error('must not query'); } }),
  });
  await serve(app, async base => {
    for (const path of ['/payments/midtrans/webhook', '/auth/login']) assert.equal((await fetch(base + path, { method: 'POST', headers: { cookie: 'access_token=stale' } })).status, 200);
  });
});

test('production errors are generic even if debug accidentally enabled, JSON size remains bounded', async () => {
  const router = Router().post('/login', () => { throw new Error('SELECT secret_hash password=never-expose'); });
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 1 }) }, environment: 'production', debug: true, logger, authRouter: router });
  await serve(app, async base => {
    const response = await fetch(base + '/auth/login', { method: 'POST' });
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /SELECT|secret_hash|password|debug|stack/);
    const large = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'a'.repeat(270000) }) });
    assert.equal(large.status, 413); assert.equal((await large.json() as { code: string }).code, 'PAYLOAD_TOO_LARGE');
  });
});

test('database session authority binds user, family, active status, expiry and revocation', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const pool = { execute: async (sql: string, values: unknown[]) => { queries.push({ sql, values }); return [[{ valid: 1 }]]; } } as unknown as Pool;
  const now = new Date();
  assert.equal(await new MySqlSessionAuthority(pool).isActive('user-a', 'family-a', now), true);
  assert.deepEqual(queries[0]?.values, ['user-a', 'family-a', now]);
  for (const condition of ["u.status='active'", 'rt.revoked_at IS NULL', 'rt.used_at IS NULL', 'rt.expires_at>?']) assert.ok(queries[0]?.sql.includes(condition));
});

test('production fails closed when session authority is not wired', async () => {
  const router = Router().get('/', (_req, res) => { res.json({ unsafe: true }); });
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 1 }) }, environment: 'production', logger, accountRouter: router });
  await serve(app, async base => {
    const response = await fetch(base + '/me', { headers: { cookie: 'access_token=valid' } });
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /unsafe/);
  });
});

test('private upload CSRF and mutation rate limits run before the upload handler', async () => {
  let hits = 0;
  const cards = Router().post('/card/logo', (_req, res) => { hits++; res.end(); });
  const uploadActors = { ...actors, authorizeUnsafe: (_token: string, csrf: string) => {
    if (csrf !== 'valid') throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
  } } as unknown as AuthenticatedActorService;
  const guard = sessionAuthorityMiddleware(uploadActors, { isActive: async () => true }, { consume: async () => false });
  const app = createApp({ databaseHealth: { check: async () => ({ healthy: true, latencyMs: 1 }) }, environment: 'testing', logger, privateSessionGuard: guard, cardRouter: cards });
  await serve(app, async base => {
    const headers = { cookie: 'access_token=valid' };
    assert.equal((await fetch(base + '/cards/card/logo', { method: 'POST', headers })).status, 403);
    assert.equal((await fetch(base + '/cards/card/logo', { method: 'POST', headers: { ...headers, 'x-csrf-token': 'valid' } })).status, 429);
  });
  assert.equal(hits, 0);
});

test('generic data repository refuses writes before any database call', async () => {
  const repo = new MySqlAdminDataRepository({ getConnection: () => { throw new Error('must not connect'); } } as unknown as Pool);
  const audit = { actorPublicId: 'admin', requestId: 'id' };
  for (const action of [() => repo.create('users', { password_hash: 'bypass' }, audit), () => repo.update('user_roles', '1', { revoked_at: null }, audit), () => repo.delete('activity_logs', '1', audit)]) {
    await assert.rejects(action, { status: 405, code: 'RESOURCE_READ_ONLY' });
  }
});

test('CORS rejects wildcard, opaque and path origins; proxy trust defaults to zero', () => {
  const base = { DB_DATABASE: 'test_db', DB_USERNAME: 'test_user', CSRF_HMAC_KEY: 'x'.repeat(32), OTP_HMAC_KEY: 'y'.repeat(32) };
  for (const origin of ['*', 'null', 'https://example.test/path', 'https://user:pass@example.test']) assert.throws(() => parseEnvironment({ ...base, CORS_ALLOWED_ORIGINS: origin }), /CORS_ALLOWED_ORIGINS/);
  assert.equal(parseEnvironment(base).TRUST_PROXY_HOPS, 0);
  assert.throws(() => parseEnvironment({ ...base, TRUST_PROXY_HOPS: 'true' }), /TRUST_PROXY_HOPS/);
});
