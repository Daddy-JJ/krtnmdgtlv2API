import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import type { SuperAdminRepository } from '../../src/modules/admin/repositories/super-admin-repository.ts';
import { SuperAdminService } from '../../src/modules/admin/services/super-admin-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { RbacService } from '../../src/shared/security/rbac-service.ts';

let writes = 0;
const repository: SuperAdminRepository = {
  statistics: async () => ({}),
  user: async () => null,
  specialists: async () => [],
  subscriptions: async () => [],
  usage: async () => [],
  interventions: async () => [],
  settings: async () => [],
  intervene: async (_actor, _target, input) => {
    writes += 1;
    return { action: input.action, previousValue: null, newValue: input.roleCode ?? null };
  },
};
const rbac = {
  assert: async () => undefined,
} as unknown as RbacService;
const service = new SuperAdminService(repository, rbac);

test('Super Admin statistics aggregate current Starter, Basic, and Pro membership server-side',async()=>{
  const source=await readFile(resolve(import.meta.dirname,'../../src/modules/admin/repositories/mysql-super-admin-repository.ts'),'utf8');
  for(const key of['starterUsers','basicUsers','proUsers'])assert.match(source,new RegExp(key));
  assert.match(source,/s\.status='active'/);
  assert.match(source,/s\.starts_at<=UTC_TIMESTAMP\(\)/);
  assert.match(source,/s\.ends_at>UTC_TIMESTAMP\(\)/);
});

test('Super Admin service rejects invalid or irrelevant intervention fields before persistence', async () => {
  writes = 0;
  await assert.rejects(
    service.intervene('actor', 'target', { action: 'GRANT_ROLE', roleCode: 'admin', reason: 'invalid legacy role' }, null),
    (error: unknown) => error instanceof AppError && error.code === 'INVALID_ROLE',
  );
  await assert.rejects(
    service.intervene('actor', 'target', { action: 'SUSPEND_USER', days: 10, reason: 'irrelevant field' }, null),
    (error: unknown) => error instanceof AppError && error.code === 'VALIDATION_ERROR',
  );
  assert.equal(writes, 0);
});

test('Super Admin service permits only canonical role grants', async () => {
  writes = 0;
  const result = await service.intervene(
    'actor',
    'target',
    { action: 'GRANT_ROLE', roleCode: 'cv_specialist', reason: 'approved staffing change' },
    'request-id',
  );
  assert.equal(result.newValue, 'cv_specialist');
  assert.equal(writes, 1);
});

test('system settings remain read-only in router and OpenAPI contracts', async () => {
  const router = await readFile(new URL('../../src/modules/admin/routes/admin-router.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(router, /settings\/:key|updateSetting/);
  const contractUrl = new URL('../../../openapi/openapi.yaml', import.meta.url);
  if (existsSync(contractUrl)) {
    const contract = await readFile(contractUrl, 'utf8');
    assert.doesNotMatch(contract, /\/admin\/settings\/\{key\}/);
  }
});
