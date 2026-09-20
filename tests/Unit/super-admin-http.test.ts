import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { AdminController } from '../../src/modules/admin/controllers/admin-controller.ts';
import { SuperAdminController } from '../../src/modules/admin/controllers/super-admin-controller.ts';
import type { SuperAdminRepository } from '../../src/modules/admin/repositories/super-admin-repository.ts';
import { createAdminRouter } from '../../src/modules/admin/routes/admin-router.ts';
import type { AdminService } from '../../src/modules/admin/services/admin-service.ts';
import { SuperAdminService } from '../../src/modules/admin/services/super-admin-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import type { RbacService } from '../../src/shared/security/rbac-service.ts';

const calls = { feedbackStatus: '', feedbackReason: '', cardAction: '', reportDays: 0, recent: 0 };
const repository: SuperAdminRepository = {
  statistics: async () => ({ newFeedback: 2 }),
  user: async () => null,
  card: async (publicId) => ({ card: { publicId, slug: 'AbcDefg' }, owner: null, audit: [] }),
  specialists: async () => [],
  subscriptions: async () => [],
  usage: async () => [],
  interventions: async () => [],
  settings: async () => [],
  feedback: async (input) => ({
    items: [{ publicId: 'feedback-1', email: 'masked@example.test', message: 'Please improve this.', status: input.status ?? 'new' }],
    pagination: { page: input.page, limit: input.limit, total: 1, pages: 1 },
  }),
  updateFeedbackStatus: async (_actor, publicId, input) => {
    calls.feedbackStatus = input.status;
    calls.feedbackReason = input.reason;
    return { publicId, status: input.status };
  },
  reports: async (days) => { calls.reportDays = days; return { days }; },
  system: async () => ({ database: 'available' }),
  security: async () => ({ summary: {}, rateLimits: [], events: [] }),
  intervene: async (_actor, _target, input) => ({ action: input.action, previousValue: null, newValue: null }),
  interveneCard: async (_actor, _target, input) => {
    calls.cardAction = input.action;
    return { action: input.action, previousOwnerPublicId: null, newOwnerPublicId: 'user-1' };
  },
};
let permitted = true;
const rbac = {
  assert: async () => {
    if (!permitted) throw new AppError(403, 'PERMISSION_REQUIRED', 'Required permission is missing.');
  },
  assertRecentSession: async () => { calls.recent += 1; },
} as unknown as RbacService;
const actors = {
  authenticate: () => ({ userPublicId: 'admin-1', sessionId: 'session-1', role: 'super_admin' }),
  authorizeUnsafe: (_token: string | undefined, csrf: string | undefined) => {
    if (csrf !== 'valid') throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    return { userPublicId: 'admin-1', sessionId: 'session-1', role: 'super_admin' };
  },
} as unknown as AuthenticatedActorService;
const logger: Logger = { info: () => undefined, error: () => undefined };
const adminService = {
  listPlans: async () => [], listPayments: async () => [], listUsers: async () => [], listCards: async () => [],
  listThemes: async () => [], listActivity: async () => [],
} as unknown as AdminService;

async function call(method: string, path: string, body?: unknown, csrf?: string): Promise<Response> {
  const controller = new SuperAdminController(new SuperAdminService(repository, rbac), actors, rbac);
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing',
    logger,
    adminRouter: createAdminRouter(new AdminController(adminService, actors, rbac), controller),
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

test('feedback inbox is paginated, permission protected, and never cached', async () => {
  permitted = false;
  assert.equal((await call('GET', '/api/v1/admin/feedback')).status, 403);
  permitted = true;
  const response = await call('GET', '/api/v1/admin/feedback?status=new&page=2&limit=10&search=improve');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as { data: Array<{ status: string }>; meta: { page: number; limit: number; total: number; pages: number } };
  assert.equal(body.data[0]?.status, 'new');
  assert.deepEqual(body.meta, { page: 2, limit: 10, total: 1, pages: 1 });
});

test('feedback status mutation requires CSRF, recent authentication, valid status, confirmation, and reason', async () => {
  permitted = true;
  calls.recent = 0;
  assert.equal((await call('PATCH', '/api/v1/admin/feedback/feedback-1/status', { status: 'resolved', reason: 'Reviewed and completed', confirm: true })).status, 403);
  assert.equal((await call('PATCH', '/api/v1/admin/feedback/feedback-1/status', { status: 'invalid', reason: 'Reviewed and completed', confirm: true }, 'valid')).status, 422);
  const response = await call('PATCH', '/api/v1/admin/feedback/feedback-1/status', { status: 'resolved', reason: 'Reviewed and completed', confirm: true }, 'valid');
  assert.equal(response.status, 200);
  assert.equal(calls.feedbackStatus, 'resolved');
  assert.equal(calls.feedbackReason, 'Reviewed and completed');
  assert.equal(calls.recent, 1);
});

test('card detail and controlled relationship intervention use the implemented routes', async () => {
  permitted = true;
  calls.recent = 0;
  const detail = await call('GET', '/api/v1/admin/cards/card-1');
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get('cache-control'), 'no-store');
  const intervention = await call('POST', '/api/v1/admin/cards/card-1/interventions', {
    action: 'CONNECT_MATCHING_VERIFIED_ACCOUNT', reason: 'Verified ownership recovery', confirm: true,
  }, 'valid');
  assert.equal(intervention.status, 200);
  assert.equal(calls.cardAction, 'CONNECT_MATCHING_VERIFIED_ACCOUNT');
  assert.equal(calls.recent, 1);
});

test('reports, system, and security have separate read-only contracts', async () => {
  permitted = true;
  const [reports, system, security] = await Promise.all([
    call('GET', '/api/v1/admin/reports?days=90'),
    call('GET', '/api/v1/admin/system'),
    call('GET', '/api/v1/admin/security'),
  ]);
  assert.deepEqual([reports.status, system.status, security.status], [200, 200, 200]);
  assert.equal(calls.reportDays, 90);
  assert.equal(system.headers.get('cache-control'), 'no-store');
  assert.equal(security.headers.get('cache-control'), 'no-store');
});
