import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import type { HealthCheck } from '../../src/health/health-check.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';

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
  assert.equal((body.data as Record<string, unknown>).database, 'available');
});

test('health endpoint reports database failure without leaking an exception', async () => {
  const response = await request({ check: async () => ({ healthy: false, latencyMs: 1 }) }, '/api/v1/health');
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.equal(body.code, 'SERVICE_UNAVAILABLE');
  assert.deepEqual(body.data, { status: 'unhealthy', database: 'unavailable' });
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

  const rejected = await optionsFromOrigin('https://evil.example');
  assert.equal(rejected.status, 204);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});
