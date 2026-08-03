import { resolve } from 'node:path';
import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { SeedRunner } from '../src/shared/database/seed-runner.ts';

const pool = createDatabasePool(loadEnvironment());
const runner = new SeedRunner(pool, [
  resolve(import.meta.dirname, '../database/seeders'),
  resolve(import.meta.dirname, '../../database/seeds'),
]);

try {
  process.stdout.write(`${JSON.stringify(await runner.run(), null, 2)}\n`);
} finally {
  await pool.end();
}
