import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRole, normalizeRoles, platformRoles, primaryRole } from '../../src/shared/security/roles.ts';

test('canonical roles merge resume quality review into service administration', () => {
  assert.deepEqual([...platformRoles], ['member', 'cv_specialist', 'resume_service_admin', 'super_admin']);
  assert.equal(normalizeRole('resume_quality_reviewer'), null);
  assert.equal(normalizeRole('resume_service_admin'), 'resume_service_admin');
  assert.deepEqual(normalizeRoles(['member', 'resume_service_admin', 'cv_specialist', 'resume_service_admin']),
    ['resume_service_admin', 'cv_specialist', 'member']);
  assert.equal(primaryRole(['resume_service_admin', 'super_admin']), 'super_admin');
});
