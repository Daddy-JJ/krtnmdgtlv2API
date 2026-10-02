import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { Router } from 'express';
import { createApp } from '../../src/app.ts';
import type { HealthCheck } from '../../src/health/health-check.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import { AppError } from '../../src/shared/http/errors.ts';

const silentLogger: Logger = { info: () => undefined, error: () => undefined };

async function request(health: HealthCheck, path: string, requestId?: string): Promise<Response> {
  const app = createApp({ databaseHealth: health, environment: 'testing', logger: silentLogger });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, {
      ...(requestId ? { headers: { 'x-request-id': requestId } } : {}),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function optionsFromOrigin(origin: string): Promise<Response> {
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing',
    logger: silentLogger,
    corsAllowedOrigins: ['https://frontend-staging.example.test'],
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    return await fetch(`http://127.0.0.1:${port}/api/v1/health`, { method: 'OPTIONS', headers: { origin } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('health endpoint preserves the Phase 1 success contract and security headers', async () => {
  const response = await request({ check: async () => ({ healthy: true, latencyMs: 2 }) }, '/api/v1/health', 'request-12345678');
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'request-12345678');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(body.success, true);
  assert.deepEqual(body.data, { status: 'healthy' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('health endpoint reports database failure without leaking an exception', async () => {
  const response = await request({ check: async () => ({ healthy: false, latencyMs: 1 }) }, '/api/v1/health');
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.equal(body.code, 'SERVICE_UNAVAILABLE');
  assert.deepEqual(body.data, { status: 'unhealthy' });
});

test('unknown API route returns the common JSON 404 shape', async () => {
  const response = await request({ check: async () => ({ healthy: true, latencyMs: 0 }) }, '/api/v1/unknown');
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 404);
  assert.equal(body.code, 'NOT_FOUND');
});

test('credentialed CORS is allowlist-only for an exact frontend staging origin', async () => {
  const allowed = await optionsFromOrigin('https://frontend-staging.example.test');
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://frontend-staging.example.test');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(allowed.headers.get('access-control-expose-headers'), 'Retry-After, X-Request-ID');
  assert.ok(allowed.headers.get('access-control-allow-headers')?.split(', ').includes('Idempotency-Key'));
  assert.ok(allowed.headers.get('vary')?.split(/,\s*/).includes('Origin'));

  const rejected = await optionsFromOrigin('https://evil.example');
  assert.equal(rejected.status, 204);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  assert.equal(rejected.headers.get('access-control-allow-credentials'), null);
  assert.equal(rejected.headers.get('access-control-expose-headers'), null);
  assert.equal(rejected.headers.get('access-control-allow-headers'), null);
  assert.ok(rejected.headers.get('vary')?.split(/,\s*/).includes('Origin'));
});

async function rateLimitedResponse(retryAfter: string, origin?: string): Promise<Response> {
  const paymentRouter = Router().post('/:publicId/reconcile', (_request, response, next) => {
    response.vary('Accept-Encoding');
    response.setHeader('Retry-After', retryAfter);
    next(new AppError(429, 'RATE_LIMITED', 'Payment verification is temporarily limited.'));
  });
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing', logger: silentLogger, paymentRouter,
    corsAllowedOrigins: ['https://frontend-staging.example.test', 'http://127.0.0.1:8080'],
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/payments/fixture/reconcile`, {
      method: 'POST', credentials: 'include',
      headers: { 'x-request-id': 'cors-rate-limit-123', ...(origin ? { origin } : {}) },
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

for (const [format, retryAfter] of [['seconds', '30'], ['HTTP date', 'Fri, 02 Oct 2026 12:00:00 GMT']] as const) {
  test(`credentialed allowed origins expose Retry-After (${format}) and request ID on a 429 error`, async () => {
    for (const origin of ['https://frontend-staging.example.test', 'http://127.0.0.1:8080']) {
      const response = await rateLimitedResponse(retryAfter, origin);
      assert.equal(response.status, 429);
      assert.equal((await response.json() as { code: string }).code, 'RATE_LIMITED');
      assert.equal(response.headers.get('retry-after'), retryAfter);
      assert.equal(response.headers.get('x-request-id'), 'cors-rate-limit-123');
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
      assert.equal(response.headers.get('access-control-expose-headers'), 'Retry-After, X-Request-ID');
      assert.deepEqual(response.headers.get('vary')?.split(/,\s*/), ['Origin', 'Accept-Encoding']);
    }
  });
}

test('429 responses grant no CORS header exposure to rejected, lookalike, opaque or absent origins', async () => {
  for (const origin of ['https://evil.example', 'https://frontend-staging.example.test.evil.example', 'null', undefined]) {
    for (const retryAfter of ['30', 'Fri, 02 Oct 2026 12:00:00 GMT']) {
      const response = await rateLimitedResponse(retryAfter, origin);
      assert.equal(response.status, 429);
      assert.equal(response.headers.get('retry-after'), retryAfter);
      for (const header of ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-expose-headers', 'access-control-allow-headers']) {
        assert.equal(response.headers.get(header), null, `${origin ?? 'no origin'}: ${header}`);
      }
      assert.deepEqual(response.headers.get('vary')?.split(/,\s*/), ['Origin', 'Accept-Encoding']);
    }
  }
});
