import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { PlanCatalogController } from '../../src/modules/plans/controllers/plan-catalog-controller.ts';
import type { PlanCatalogRepository } from '../../src/modules/plans/repositories/plan-catalog-repository.ts';
import { createPlanRouter } from '../../src/modules/plans/routes/plan-router.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';

const logger: Logger = { info: () => undefined, error: () => undefined };

async function call(path: string, repository: PlanCatalogRepository) {
  const app = createApp({
    databaseHealth: { check: async () => ({ healthy: true, latencyMs: 0 }) },
    environment: 'testing',
    logger,
    planRouter: createPlanRouter(new PlanCatalogController(repository)),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('public plans endpoint returns active plan catalog without authentication', async () => {
  const response = await call('/api/v1/plans', {
    listActivePlans: async () => [
      { code: 'starter', name: 'Starter', price: 0, durationDays: 0, features: { custom_slug: false } },
      { code: 'basic', name: 'Basic', price: 99000, durationDays: 365, features: { custom_slug: true } },
    ],
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { success: boolean; data: Array<{ code: string; features: Record<string, unknown> }> };
  assert.equal(body.success, true);
  assert.deepEqual(body.data.map((plan) => plan.code), ['starter', 'basic']);
  assert.equal(body.data[0]?.features.custom_slug, false);
});
