import { resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/environment.ts';
import { ADMIN_DATA_RESOURCES } from '../src/modules/admin-data/resources/admin-data-resources.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { SeedRunner } from '../src/shared/database/seed-runner.ts';

const environment = loadEnvironment();
if (!['local', 'testing'].includes(environment.APP_ENV)) {
  throw new Error('Dummy all-table seeding is restricted to APP_ENV=local or testing.');
}
const root = resolve(import.meta.dirname, '..');
const pool = createDatabasePool(environment);
try {
  const base = new SeedRunner(pool, [resolve(root, 'database/seeders')]);
  const dummy = new SeedRunner(pool, [resolve(root, 'database/development-seeds')]);
  const completed = [...await base.run(), ...await dummy.run()];
  const counts = new Map<string, number>();
  for (const resource of ADMIN_DATA_RESOURCES) {
    const [countRows] = await pool.query<Array<RowDataPacket & { records: number | string }>>(`SELECT COUNT(*) AS records FROM \`${resource}\``);
    counts.set(resource, Number(countRows[0]?.records ?? 0));
  }
  const missing = ADMIN_DATA_RESOURCES.filter((resource) => (counts.get(resource) ?? 0) === 0);
  if (missing.length) throw new Error(`Dummy seed left empty application tables: ${missing.join(', ')}.`);
  process.stdout.write(`${JSON.stringify({ database: environment.DB_DATABASE, completed, tablesWithData: counts.size }, null, 2)}\n`);
} finally { await pool.end(); }
