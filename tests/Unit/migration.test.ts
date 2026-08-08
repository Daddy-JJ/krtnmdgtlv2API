import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadMigrationFile } from '../../src/shared/database/migration-file.ts';
import { MigrationRunner } from '../../src/shared/database/migration-runner.ts';
import { splitSqlStatements } from '../../src/shared/database/sql-statement-splitter.ts';

test('migration file requires up/down markers and has a SHA-256 checksum', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knd-node-migration-'));
  const path = join(directory, '001_example.sql');
  await writeFile(path, '-- +migrate Up\nCREATE TABLE example (id INT);\n-- +migrate Down\nDROP TABLE example;\n');

  try {
    const migration = await loadMigrationFile(path);
    assert.match(migration.upSql, /CREATE TABLE/);
    assert.match(migration.downSql, /DROP TABLE/);
    assert.equal(migration.checksum.length, 64);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('SQL splitter preserves semicolons inside quoted values', () => {
  const statements = splitSqlStatements("INSERT INTO x VALUES ('a;b'); UPDATE x SET value = 'c';");
  assert.equal(statements.length, 2);
  assert.match(statements[0] ?? '', /'a;b'/);
});

test('migration status is read-only for the runtime database account', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knd-node-migration-status-'));
  await writeFile(directory + '/001_example.sql', '-- +migrate Up\nCREATE TABLE example (id INT);\n-- +migrate Down\nDROP TABLE example;\n');
  const executeCalls: string[] = [];
  const pool = {
    execute: async (sql: string) => {
      executeCalls.push(sql);
      return [[{ migration: '001_example.sql', checksum: 'recorded-checksum' }], []];
    },
    query: async () => {
      throw new Error('status must not issue DDL');
    },
  } as never;

  try {
    const runner = new MigrationRunner(pool, directory);
    assert.deepEqual(await runner.status(), { '001_example.sql': true });
    assert.deepEqual(executeCalls, ['SELECT migration, checksum FROM schema_migrations']);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('authoritative migration includes every required table and safe down statements', async () => {
  const migration = await loadMigrationFile(new URL('../../database/migrations/001_initial_schema.sql', import.meta.url).pathname);
  const tables = [
    'users', 'plans', 'plan_features', 'themes', 'plan_theme_access', 'subscriptions',
    'cards', 'card_contacts', 'starter_manage_tokens', 'refresh_tokens', 'password_reset_tokens',
    'email_otps', 'card_social_links', 'catalog_items', 'payments', 'payment_events',
    'mail_outbox', 'mail_delivery_logs', 'activity_logs',
  ];

  for (const table of tables) {
    assert.match(migration.upSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(migration.downSql, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
});

test('Phase 2 rate-limit migration has a hashed bucket and safe rollback', async () => {
  const migration = await loadMigrationFile(new URL('../../database/migrations/002_auth_rate_limits.sql', import.meta.url).pathname);
  assert.match(migration.upSql, /CREATE TABLE IF NOT EXISTS auth_rate_limits/);
  assert.match(migration.upSql, /bucket_hash CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(migration.downSql, /DROP TABLE IF EXISTS auth_rate_limits/);
});

test('feedback migration enforces ownership, 300-character storage, indexes, and safe rollback', async () => {
  const migration = await loadMigrationFile(new URL('../../database/migrations/004_user_feedback.sql', import.meta.url).pathname);
  assert.match(migration.upSql, /CREATE TABLE IF NOT EXISTS user_feedback/);
  assert.match(migration.upSql, /message VARCHAR\(300\) NOT NULL/);
  assert.match(migration.upSql, /FOREIGN KEY \(user_id\) REFERENCES users\(id\)/);
  assert.match(migration.upSql, /idx_user_feedback_status_created/);
  assert.match(migration.downSql, /DROP TABLE IF EXISTS user_feedback/);
});

test('theme catalog migration renames all designs and enforces cumulative plan access', async () => {
  const migration = await loadMigrationFile(new URL('../../database/migrations/005_theme_catalog_names_and_access.sql', import.meta.url).pathname);

  for (const name of ['Aksara', 'Bayu', 'Baskara', 'Nilam', 'Prasasti', 'Padma', 'Kanaka', 'Naya', 'Kirana', 'Mahardika']) {
    assert.match(migration.upSql, new RegExp(`THEN '${name}'`));
  }
  assert.match(migration.upSql, /p\.code = 'starter' AND t\.code = 'starter-clean'/);
  assert.match(migration.upSql, /p\.code = 'basic' AND t\.code IN \('starter-clean', 'basic-blue-line', 'basic-soft-geometry'\)/);
  assert.match(migration.upSql, /p\.code = 'pro' AND t\.code IN/);
  assert.match(migration.downSql, /THEN 'Starter Clean'/);
});
