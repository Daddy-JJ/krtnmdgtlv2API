import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadMigrationFile, type MigrationFile } from './migration-file.ts';
import { splitSqlStatements } from './sql-statement-splitter.ts';

type AppliedMigrationRow = RowDataPacket & { migration: string; checksum: string };
type BatchRow = RowDataPacket & { batch: number };

export class MigrationRunner {
  readonly #pool: Pool;
  readonly #directory: string;

  constructor(pool: Pool, directory: string) {
    this.#pool = pool;
    this.#directory = directory;
  }

  async migrate(): Promise<string[]> {
    await this.#ensureRepository();
    const applied = await this.#appliedMigrations();
    const completed: string[] = [];
    const batch = await this.#nextBatch();

    for (const migration of await this.#files()) {
      const checksum = applied.get(migration.name);
      if (checksum !== undefined) {
        if (checksum !== migration.checksum) {
          throw new Error(`Applied migration checksum changed: ${migration.name}`);
        }
        continue;
      }

      await this.#executeSql(migration.upSql);
      await this.#pool.execute(
        'INSERT INTO schema_migrations (migration, checksum, batch, applied_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
        [migration.name, migration.checksum, batch],
      );
      completed.push(migration.name);
    }

    return completed;
  }

  async rollbackLastBatch(): Promise<string[]> {
    await this.#ensureRepository();
    const [batchRows] = await this.#pool.execute<BatchRow[]>(
      'SELECT COALESCE(MAX(batch), 0) AS batch FROM schema_migrations',
    );
    const batch = Number(batchRows[0]?.batch ?? 0);
    if (batch === 0) return [];

    const [nameRows] = await this.#pool.execute<Array<RowDataPacket & { migration: string }>>(
      'SELECT migration FROM schema_migrations WHERE batch = ? ORDER BY id DESC',
      [batch],
    );
    const files = new Map((await this.#files()).map((file) => [file.name, file]));
    const rolledBack: string[] = [];

    for (const row of nameRows) {
      const migration = files.get(row.migration);
      if (!migration) throw new Error(`Applied migration file is missing: ${row.migration}`);
      await this.#executeSql(migration.downSql);
      await this.#pool.execute('DELETE FROM schema_migrations WHERE migration = ?', [row.migration]);
      rolledBack.push(row.migration);
    }

    return rolledBack;
  }

  async status(): Promise<Record<string, boolean>> {
    await this.#ensureRepository();
    const applied = await this.#appliedMigrations();
    return Object.fromEntries((await this.#files()).map((file) => [file.name, applied.has(file.name)]));
  }

  async #ensureRepository(): Promise<void> {
    await this.#pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      migration VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      batch INT UNSIGNED NOT NULL,
      applied_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async #appliedMigrations(): Promise<Map<string, string>> {
    const [rows] = await this.#pool.execute<AppliedMigrationRow[]>(
      'SELECT migration, checksum FROM schema_migrations',
    );
    return new Map(rows.map((row) => [row.migration, row.checksum]));
  }

  async #files(): Promise<MigrationFile[]> {
    const names = (await readdir(this.#directory)).filter((name) => name.endsWith('.sql')).sort();
    return Promise.all(names.map((name) => loadMigrationFile(join(this.#directory, name))));
  }

  async #nextBatch(): Promise<number> {
    const [rows] = await this.#pool.execute<BatchRow[]>(
      'SELECT COALESCE(MAX(batch), 0) + 1 AS batch FROM schema_migrations',
    );
    return Number(rows[0]?.batch ?? 1);
  }

  async #executeSql(sql: string): Promise<void> {
    for (const statement of splitSqlStatements(sql)) await this.#pool.query(statement);
  }
}
