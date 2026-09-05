import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const environmentFile = resolve(import.meta.dirname, '../.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

const productionLikeDatabase = process.env.DB_DATABASE ?? '';
const testDatabase = process.env.TEST_DB_DATABASE ?? '';
if (!testDatabase) throw new Error('TEST_DB_DATABASE is required for database integration tests.');
if (testDatabase === productionLikeDatabase || !/_test$/i.test(testDatabase)) {
  throw new Error('Database integration tests require a dedicated database whose name ends with _test.');
}

const result = spawnSync(process.execPath, ['--test', 'tests/Integration/database.test.ts'], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, RUN_DB_TESTS: 'true' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
