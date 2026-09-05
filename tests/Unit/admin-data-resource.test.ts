import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_DATA_RESOURCES,
  isAdminDataResource,
  isSensitiveAdminDataColumn,
} from '../../src/modules/admin-data/resources/admin-data-resources.ts';

test('admin data allowlist contains every non-internal database table exactly once', () => {
  assert.equal(ADMIN_DATA_RESOURCES.length, 43);
  assert.equal(new Set(ADMIN_DATA_RESOURCES).size, 43);
  assert.equal(isAdminDataResource('users'), true);
  assert.equal(isAdminDataResource('resume_retention_notices'), true);
  assert.equal(isAdminDataResource('schema_migrations'), false);
  assert.equal(isAdminDataResource('users; DROP TABLE users'), false);
});

test('credential and token material is classified as sensitive', () => {
  for (const column of ['password_hash', 'token_hash', 'code_hash', 'actor_ip_hash', 'sha256']) {
    assert.equal(isSensitiveAdminDataColumn(column), true, column);
  }
  for (const column of ['public_id', 'email', 'created_at']) {
    assert.equal(isSensitiveAdminDataColumn(column), false, column);
  }
});
