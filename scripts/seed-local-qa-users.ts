import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { splitSqlStatements } from '../src/shared/database/sql-statement-splitter.ts';

const environment = loadEnvironment();
if (!['local', 'testing'].includes(environment.APP_ENV)) throw new Error('Local QA users require APP_ENV=local or testing.');
const pool = createDatabasePool(environment);
try {
  const filename = '901-local-qa-users.sql';
  const sql = await readFile(resolve(import.meta.dirname, `../../database/development-seeds/${filename}`), 'utf8');
  for (const statement of splitSqlStatements(sql)) await pool.query(statement);
  process.stdout.write(`${JSON.stringify({ environment: environment.APP_ENV, completed: [filename] }, null, 2)}\n`);
} finally {
  await pool.end();
}
