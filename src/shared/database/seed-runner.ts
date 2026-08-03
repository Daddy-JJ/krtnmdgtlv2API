import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Pool } from 'mysql2/promise';
import { splitSqlStatements } from './sql-statement-splitter.ts';

export class SeedRunner {
  readonly #pool: Pool;
  readonly #directories: readonly string[];

  constructor(pool: Pool, directories: readonly string[]) {
    this.#pool = pool;
    this.#directories = directories;
  }

  async run(): Promise<string[]> {
    const completed: string[] = [];
    for (const path of await this.#files()) {
      const sql = await readFile(path, 'utf8');
      for (const statement of splitSqlStatements(sql)) await this.#pool.query(statement);
      completed.push(basename(path));
    }
    return completed;
  }

  async #files(): Promise<string[]> {
    const paths: string[] = [];
    for (const directory of this.#directories) {
      const names = (await readdir(directory)).filter((name) => name.endsWith('.sql'));
      paths.push(...names.map((name) => join(directory, name)));
    }
    return paths.sort();
  }
}
