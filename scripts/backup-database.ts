import { access, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';

const environment = loadEnvironment();
if (environment.DB_DATABASE !== 'krtnmdgtlv2') {
  throw new Error('Database backup refused an unexpected target database.');
}

const pool = createDatabasePool(environment);
try {
  const [rows] = await pool.query<Array<RowDataPacket & { databaseName: string }>>('SELECT DATABASE() AS databaseName');
  if (rows[0]?.databaseName !== environment.DB_DATABASE) throw new Error('Database backup identity mismatch.');
} finally {
  await pool.end();
}

const executable = process.env.MYSQLDUMP_BINARY
  ?? (process.platform === 'win32' ? 'C:\\xampp\\mysql\\bin\\mysqldump.exe' : 'mysqldump');
if (process.platform === 'win32') await access(executable);
const directory = resolve(import.meta.dirname, '../storage/backups');
await mkdir(directory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(directory, `${environment.DB_DATABASE}-${timestamp}.sql`);
const args = [
  `--host=${environment.DB_HOST}`,
  `--port=${environment.DB_PORT}`,
  `--user=${environment.DB_USERNAME}`,
  '--single-transaction',
  '--routines',
  '--triggers',
  '--events',
  '--default-character-set=utf8mb4',
  `--result-file=${output}`,
  environment.DB_DATABASE,
];
const exitCode = await new Promise<number | null>((resolveExit, reject) => {
  const child = spawn(executable, args, {
    env: { ...process.env, MYSQL_PWD: environment.DB_PASSWORD },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let diagnostic = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (value: string) => { diagnostic += value; });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code !== 0) reject(new Error(`Database backup failed with exit code ${code}; ${diagnostic.trim() || 'no diagnostic'}.`));
    else resolveExit(code);
  });
});
if (exitCode !== 0) throw new Error('Database backup did not complete.');
const metadata = await stat(output);
if (metadata.size === 0) throw new Error('Database backup produced an empty file.');
process.stdout.write(`${JSON.stringify({ success: true, database: environment.DB_DATABASE, output, bytes: metadata.size }, null, 2)}\n`);
