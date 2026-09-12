import { resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/environment.ts';
import { MigrationRunner } from '../src/shared/database/migration-runner.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';

const environment = loadEnvironment();
if (environment.DB_DATABASE !== 'krtnmdgtlv2') {
  throw new Error('Database preflight refused an unexpected target database.');
}

const pool = createDatabasePool(environment);
try {
  const [identityRows] = await pool.query<Array<RowDataPacket & { databaseName: string; serverVersion: string }>>(
    'SELECT DATABASE() AS databaseName, VERSION() AS serverVersion',
  );
  const identity = identityRows[0];
  if (identity?.databaseName !== environment.DB_DATABASE) {
    throw new Error('Database preflight identity does not match configured target.');
  }

  const [slugRows] = await pool.query<Array<RowDataPacket & { indexName: string; nonUnique: number; columnCollation: string }>>(`
    SELECT s.INDEX_NAME AS indexName, s.NON_UNIQUE AS nonUnique, c.COLLATION_NAME AS columnCollation
    FROM INFORMATION_SCHEMA.STATISTICS s
    JOIN INFORMATION_SCHEMA.COLUMNS c
      ON c.TABLE_SCHEMA=s.TABLE_SCHEMA AND c.TABLE_NAME=s.TABLE_NAME AND c.COLUMN_NAME=s.COLUMN_NAME
    WHERE s.TABLE_SCHEMA=DATABASE() AND s.TABLE_NAME='cards' AND s.COLUMN_NAME='slug'
    ORDER BY s.INDEX_NAME
  `);
  const migrations = await new MigrationRunner(pool, resolve(import.meta.dirname, '../database/migrations')).status();
  const slugUniqueBinary = slugRows.some((row) => Number(row.nonUnique) === 0 && row.columnCollation === 'utf8mb4_bin');
  if (!slugUniqueBinary) throw new Error('cards.slug is not protected by a binary unique index.');

  process.stdout.write(`${JSON.stringify({
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    database: identity.databaseName,
    serverVersion: identity.serverVersion,
    slugUniqueBinary,
    migrations,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
