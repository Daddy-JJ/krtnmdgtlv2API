import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { ADMIN_DATA_RESOURCES } from '../src/modules/admin-data/resources/admin-data-resources.ts';

const root = resolve(import.meta.dirname, '..');
process.loadEnvFile(resolve(root, '.env'));
const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD ?? '', database: process.env.DB_DATABASE,
});

try {
  const [tableRows] = await connection.query(`SELECT TABLE_NAME AS tableName
    FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME`);
  const actual = tableRows.map((row) => row.tableName).filter((name) => name !== 'schema_migrations');
  const missing = ADMIN_DATA_RESOURCES.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !ADMIN_DATA_RESOURCES.includes(name));
  if (missing.length || extra.length) throw new Error(`Schema/CRUD drift. Missing: ${missing.join(', ') || '-'}; extra: ${extra.join(', ') || '-'}.`);

  const definitions = [];
  for (const table of actual) {
    const [rows] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
    const sql = String(rows[0]['Create Table'])
      .replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/ AUTO_INCREMENT=\d+/g, '');
    definitions.push(`${sql};`);
  }
  const [triggerRows] = await connection.query('SHOW TRIGGERS');
  const triggers = [];
  for (const row of triggerRows) {
    const [rows] = await connection.query(`SHOW CREATE TRIGGER \`${row.Trigger}\``);
    const sql = String(rows[0]['SQL Original Statement'] ?? rows[0]['Create Trigger'])
      .replace(/^CREATE DEFINER=`[^`]+`@`[^`]+`\s+/i, 'CREATE ');
    triggers.push(`${sql};`);
  }
  const output = [
    '-- GENERATED FILE. Run: npm run schema:generate',
    `-- Application tables: ${actual.length}. Internal schema_migrations is intentionally omitted.`,
    'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;', '', ...definitions,
    ...(triggers.length ? ['', '-- Triggers', ...triggers] : []),
    '', 'SET FOREIGN_KEY_CHECKS=1;',
  ].join('\n\n') + '\n';
  await mkdir(resolve(root, 'database'), { recursive: true });
  await Promise.all([
    writeFile(resolve(root, 'database/schema-reference.sql'), output),
    writeFile(resolve(root, 'krtnmdgtlv2.sql'), output),
  ]);
  process.stdout.write(`Schema reference generated for ${actual.length} application tables.\n`);
} finally { await connection.end(); }
