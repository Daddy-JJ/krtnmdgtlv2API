import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/environment.ts';
import { MigrationRunner } from '../src/shared/database/migration-runner.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { ADMIN_DATA_RESOURCES } from '../src/modules/admin-data/resources/admin-data-resources.ts';

type CollectionItem = Readonly<{ name: string; item?: readonly CollectionItem[] }>;
type Collection = Readonly<{
  variable: readonly Readonly<{ key: string; value: string }>[];
  item: readonly CollectionItem[];
}>;

const environment = loadEnvironment();
if (!['local', 'testing'].includes(environment.APP_ENV)) {
  throw new Error('Local integration preflight only supports APP_ENV=local or testing.');
}

const root = resolve(import.meta.dirname, '..');
const expectedApiBaseUrl = `http://127.0.0.1:${environment.PORT}/api/v1`;
const frontendOrigin = new URL(environment.APP_URL).origin;
const corsOrigins = environment.CORS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
const checks: Array<Readonly<{ name: string; passed: boolean }>> = [];
const check = (name: string, passed: boolean): void => { checks.push({ name, passed }); };

await Promise.all([
  access(resolve(root, environment.JWT_PRIVATE_KEY_PATH)),
  access(resolve(root, environment.JWT_PUBLIC_KEY_PATH)),
]);
check('jwt_keys_readable', true);
check('frontend_origin_allowed_by_cors', corsOrigins.includes(frontendOrigin));
check('frontend_and_api_ports_are_separate', new URL(environment.APP_URL).port !== String(environment.PORT));

const collection = JSON.parse(await readFile(resolve(root, 'collection.json'), 'utf8')) as Collection;
const collectionBaseUrl = collection.variable.find((entry) => entry.key === 'baseUrl')?.value;
const adminFolder = collection.item.find((entry) => entry.name === 'Administrative Data CRUD');
const collectionResources = new Set(adminFolder?.item?.slice(1).map((entry) => entry.name) ?? []);
check('collection_base_url_matches_backend', collectionBaseUrl === expectedApiBaseUrl);
check('collection_covers_admin_resources', ADMIN_DATA_RESOURCES.every((resource) => collectionResources.has(resource)) && collectionResources.size === ADMIN_DATA_RESOURCES.length);

const pool = createDatabasePool(environment);
try {
  const [identityRows] = await pool.query<Array<RowDataPacket & { databaseName: string; accountName: string }>>(
    'SELECT DATABASE() AS databaseName,CURRENT_USER() AS accountName',
  );
  const identity = identityRows[0];
  check('database_selected', identity?.databaseName === environment.DB_DATABASE);

  const migrations = new MigrationRunner(pool, resolve(root, 'database/migrations'));
  const migrationStatus = await migrations.status();
  check('all_migrations_applied', Object.values(migrationStatus).every(Boolean));

  const [tableRows] = await pool.query<Array<RowDataPacket & { tableName: string }>>(
    'SELECT TABLE_NAME AS tableName FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()',
  );
  const tables = new Set(tableRows.map((row) => row.tableName));
  check('all_admin_resource_tables_exist', ADMIN_DATA_RESOURCES.every((resource) => tables.has(resource)));

  const failures = checks.filter((entry) => !entry.passed).map((entry) => entry.name);
  if (failures.length > 0) throw new Error(`Integration preflight failed: ${failures.join(', ')}.`);

  process.stdout.write(`${JSON.stringify({
    success: true,
    projectRoot: root,
    frontendOrigin,
    apiBaseUrl: expectedApiBaseUrl,
    database: identity?.databaseName ?? null,
    databaseAccount: identity?.accountName ?? null,
    migrations: Object.keys(migrationStatus).length,
    adminResources: ADMIN_DATA_RESOURCES.length,
    checks,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
