import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { AdminDataController } from '../../src/modules/admin-data/controllers/admin-data-controller.ts';
import type { AdminDataRepository } from '../../src/modules/admin-data/repositories/admin-data-repository.ts';
import { createAdminDataRouter } from '../../src/modules/admin-data/routes/admin-data-router.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';
import type { RbacService } from '../../src/shared/security/rbac-service.ts';

let allowed = false;
const mutations: string[] = [];
const repository: AdminDataRepository = {
  catalog: async () => [{
    resource: 'users', primaryKey: ['id'], identifierFormat: '{id}', columns: [],
  }],
  list: async (_resource, input) => ({ items: [{ id: 1 }], pagination: { page: input.page, limit: input.limit, total: 1, pages: 1 } }),
  get: async () => ({ id: 1 }),
  create: async (resource) => { mutations.push(`create:${resource}`); return { id: 2 }; },
  update: async (resource, identifier) => { mutations.push(`update:${resource}:${identifier}`); return { id: Number(identifier) }; },
  delete: async (resource, identifier) => { mutations.push(`delete:${resource}:${identifier}`); return { id: Number(identifier) }; },
};
const actors = {
  authenticate: () => ({ userPublicId: 'actor', sessionId: 'session', role: 'super_admin' }),
  authorizeUnsafe: (_token: string | undefined, csrf: string | undefined) => {
    if (csrf !== 'valid') throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    return { userPublicId: 'actor', sessionId: 'session', role: 'super_admin' };
  },
} as unknown as AuthenticatedActorService;
const rbac = {
  assert: async () => {
    if (!allowed) throw new AppError(403, 'PERMISSION_REQUIRED', 'Required permission is missing.');
  },
} as unknown as RbacService;
const logger: Logger = { info: () => undefined, error: () => undefined };

async function call(method: string, path: string, body?: unknown, csrf?: string): Promise<Response> {
  const controller = new AdminDataController(repository, actors, rbac);
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing',
    logger,
    adminDataRouter: createAdminDataRouter(controller),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
      method,
      headers: {
        cookie: 'access_token=test',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('admin data reads require data.read and reject resources outside the allowlist', async () => {
  allowed = false;
  assert.equal((await call('GET', '/api/v1/admin/data/users')).status, 403);
  allowed = true;
  assert.equal((await call('GET', '/api/v1/admin/data')).status, 200);
  assert.equal((await call('GET', '/api/v1/admin/data/users?page=2&limit=10&order=asc')).status, 200);
  assert.equal((await call('GET', '/api/v1/admin/data/schema_migrations')).status, 404);
});

test('admin data mutations require CSRF and support create, update, and delete', async () => {
  allowed = true;
  mutations.length = 0;
  assert.equal((await call('POST', '/api/v1/admin/data/users', { email: 'test@example.com' })).status, 403);
  assert.equal((await call('POST', '/api/v1/admin/data/users', { email: 'test@example.com' }, 'valid')).status, 201);
  assert.equal((await call('PUT', '/api/v1/admin/data/users/2', { status: 'active' }, 'valid')).status, 200);
  assert.equal((await call('DELETE', '/api/v1/admin/data/users/2', undefined, 'valid')).status, 200);
  assert.deepEqual(mutations, ['create:users', 'update:users:2', 'delete:users:2']);
});
