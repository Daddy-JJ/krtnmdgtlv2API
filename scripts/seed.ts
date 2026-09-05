import { resolve } from 'node:path';
import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { SeedRunner } from '../src/shared/database/seed-runner.ts';

const pool = createDatabasePool(loadEnvironment());
// This project root is self-contained. Keep every seed inside database/seeders
// so development, QA, and deployment always use the same canonical inputs.
const runner = new SeedRunner(pool, [resolve(import.meta.dirname, '../database/seeders')]);

try {
  process.stdout.write(`${JSON.stringify(await runner.run(), null, 2)}\n`);
} finally {
  await pool.end();
}
