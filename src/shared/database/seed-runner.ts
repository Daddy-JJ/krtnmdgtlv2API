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
      const statements = splitSqlStatements(sql);
      for (const [index, statement] of statements.entries()) {
        try {
          await this.#pool.query(statement);
        } catch (error) {
          throw new Error(
            `Seed ${basename(path)} failed at statement ${index + 1}: ${statement.slice(0, 160)}`,
            { cause: error },
          );
        }
      }
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
