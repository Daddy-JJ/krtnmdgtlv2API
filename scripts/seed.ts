import { resolve } from 'node:path';
import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { SeedRunner } from '../src/shared/database/seed-runner.ts';

const pool = createDatabasePool(loadEnvironment());
// The standalone deployment repository is self-contained. Keep every seed
// inside its database/seeders directory so a hosting checkout never depends
// on a sibling source-of-truth repository path.
const runner = new SeedRunner(pool, [resolve(import.meta.dirname, '../database/seeders')]);

try {
  process.stdout.write(`${JSON.stringify(await runner.run(), null, 2)}\n`);
} finally {
  await pool.end();
}
