import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_DATA_RESOURCES } from '../../src/modules/admin-data/resources/admin-data-resources.ts';

test('generated SQL references and Postman collections stay synchronized', async () => {
  const [rootSql, referenceSql, rootCollection, docsCollection] = await Promise.all([
    readFile(new URL('../../krtnmdgtlv2.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../database/schema-reference.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../collection.json', import.meta.url), 'utf8'),
    readFile(new URL('../../docs/collection.json', import.meta.url), 'utf8'),
  ]);
  assert.equal(rootSql, referenceSql);
  assert.equal(rootCollection, docsCollection);
  const tableNames = [...rootSql.matchAll(/CREATE TABLE IF NOT EXISTS `?([a-z][a-z0-9_]*)`?/gi)].map(match => match[1]);
  assert.deepEqual([...tableNames].sort(), [...ADMIN_DATA_RESOURCES].sort());
  assert.doesNotMatch(
    rootSql,
    /CREATE TABLE IF NOT EXISTS `?schema_migrations`?/i,
  );
});

test('all-table dummy seed names every application table directly or relies on canonical base seeds', async () => {
  const source = await readFile(new URL('../../database/development-seeds/902-all-tables-dummy.sql', import.meta.url), 'utf8');
  const canonical = new Set(['plans', 'plan_features', 'themes', 'plan_theme_access', 'roles', 'permissions', 'role_permissions', 'email_templates']);
  for (const table of ADMIN_DATA_RESOURCES) {
    assert.ok(canonical.has(table) || new RegExp(`INSERT\\s+INTO\\s+${table}\\b`, 'i').test(source), table);
  }
});
