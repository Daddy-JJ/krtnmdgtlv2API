import { resolve } from 'node:path';
import { loadEnvironment } from '../src/config/environment.ts';
import { MigrationRunner } from '../src/shared/database/migration-runner.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';

const action = process.argv[2] ?? 'up';
if (!['up', 'down', 'status'].includes(action)) throw new Error(`Unknown migration action: ${action}`);

const pool = createDatabasePool(loadEnvironment());
const runner = new MigrationRunner(pool, resolve(import.meta.dirname, '../database/migrations'));

try {
  const result = action === 'up'
    ? await runner.migrate()
    : action === 'down'
      ? await runner.rollbackLastBatch()
      : await runner.status();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await pool.end();
}
