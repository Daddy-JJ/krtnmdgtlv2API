import assert from 'node:assert/strict';
import test from 'node:test';
import { PlanCapabilityService, type CapabilityValue } from '../../src/modules/plans/plan-capability-service.ts';

const values = new Map<string, CapabilityValue>([['basic:custom_slug_enabled', true], ['starter:custom_slug_enabled', false], ['basic:design_limit', 3]]);
const service = new PlanCapabilityService({ async get(plan, feature) { return values.get(`${plan}:${feature}`) ?? null; } });

test('PlanCapabilityService enforces flags and integer limits', async () => {
  assert.equal(await service.isEnabled('basic', 'custom_slug_enabled'), true);
  await assert.rejects(service.assertEnabled('starter', 'custom_slug_enabled'), { code: 'CAPABILITY_NOT_AVAILABLE', status: 403 });
  await service.assertWithinLimit('basic', 'design_limit', 2);
  await assert.rejects(service.assertWithinLimit('basic', 'design_limit', 3), { code: 'PLAN_LIMIT_REACHED', status: 409 });
});

test('PlanCapabilityService fails closed on malformed capability data', async () => {
  await assert.rejects(service.getLimit('basic', 'missing'), { code: 'CAPABILITY_CONFIG_INVALID', status: 500 });
});
