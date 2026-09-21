import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../../../shared/http/errors.ts';
import {
  ADMIN_DATA_RESOURCES,
  isSensitiveAdminDataColumn,
  type AdminDataResource,
} from '../resources/admin-data-resources.ts';
import type {
  AdminDataAudit,
  AdminDataColumn,
  AdminDataListInput,
  AdminDataListResult,
  AdminDataRepository,
  AdminDataSchema,
} from './admin-data-repository.ts';

type ColumnRow = RowDataPacket & {
  name: string;
  dataType: string;
  columnType: string;
  nullable: 'YES' | 'NO';
  hasDefault: number;
  columnKey: string;
  extra: string;
  maximumLength: number | null;
};

type CountRow = RowDataPacket & { total: number | string };

const textTypes = new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'enum', 'set']);

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) throw new Error('Unsafe SQL identifier rejected.');
  return `\`${value}\``;
}

function mysqlErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function translateDatabaseError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const code = mysqlErrorCode(error);
  if (code === 'ER_DUP_ENTRY') throw new AppError(409, 'RESOURCE_CONFLICT', 'A unique value already exists.');
  if (code === 'ER_NO_REFERENCED_ROW_2') throw new AppError(409, 'FOREIGN_KEY_CONFLICT', 'A referenced resource does not exist.');
  if (code === 'ER_ROW_IS_REFERENCED_2') throw new AppError(409, 'FOREIGN_KEY_CONFLICT', 'The resource is still referenced by another record.');
  if (code && new Set([
    'ER_BAD_NULL_ERROR',
    'ER_NO_DEFAULT_FOR_FIELD',
    'ER_DATA_TOO_LONG',
    'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
    'ER_WARN_DATA_OUT_OF_RANGE',
    'ER_CHECK_CONSTRAINT_VIOLATED',
  ]).has(code)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The supplied values do not satisfy the database schema.');
  }
  throw error;
}

export class MySqlAdminDataRepository implements AdminDataRepository {
  readonly #pool: Pool;
  readonly #schemas = new Map<AdminDataResource, Promise<AdminDataSchema>>();

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async catalog(): Promise<readonly AdminDataSchema[]> {
    return Promise.all(ADMIN_DATA_RESOURCES.map((resource) => this.#schema(resource)));
  }

  async list(resource: AdminDataResource, input: AdminDataListInput): Promise<AdminDataListResult> {
    const schema = await this.#schema(resource);
    const table = quoteIdentifier(resource);
    const visibleColumns = this.#visibleColumns(schema);
    const columnMap = new Map(schema.columns.map((column) => [column.name, column]));
    const conditions: string[] = [];
    const values: unknown[] = [];

    for (const [name, value] of Object.entries(input.filters)) {
      const column = columnMap.get(name);
      if (!column || column.sensitive) throw new AppError(422, 'VALIDATION_ERROR', `Unknown filter column: ${name}.`);
      conditions.push(`${quoteIdentifier(name)} = ?`);
      values.push(value);
    }

    if (input.search) {
      const searchable = schema.columns.filter((column) => textTypes.has(column.dataType) && !column.sensitive);
      if (searchable.length === 0) throw new AppError(422, 'VALIDATION_ERROR', 'This resource has no searchable columns.');
      conditions.push(`(${searchable.map((column) => `${quoteIdentifier(column.name)} LIKE ?`).join(' OR ')})`);
      values.push(...searchable.map(() => `%${input.search}%`));
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const sort = input.sort ?? schema.primaryKey.find((name) => !isSensitiveAdminDataColumn(name)) ?? visibleColumns[0];
    if (!sort || !columnMap.has(sort) || columnMap.get(sort)?.sensitive) throw new AppError(422, 'VALIDATION_ERROR', 'Unknown sort column.');
    const offset = (input.page - 1) * input.limit;

    try {
      const [countRows] = await this.#pool.query<CountRow[]>(`SELECT COUNT(*) AS total FROM ${table}${where}`, values);
      const [rows] = await this.#pool.query<RowDataPacket[]>(
        `SELECT ${visibleColumns.map(quoteIdentifier).join(',')} FROM ${table}${where} ORDER BY ${quoteIdentifier(sort)} ${input.order.toUpperCase()} LIMIT ? OFFSET ?`,
        [...values, input.limit, offset],
      );
      const total = Number(countRows[0]?.total ?? 0);
      return {
        items: rows.map((row) => ({ ...row })),
        pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
      };
    } catch (error) {
      translateDatabaseError(error);
    }
  }

  async get(resource: AdminDataResource, identifier: string): Promise<Record<string, unknown>> {
    const schema = await this.#schema(resource);
    try {
      return await this.#read(this.#pool, schema, identifier);
    } catch (error) {
      translateDatabaseError(error);
    }
  }

  async create(_resource: AdminDataResource, _input: Record<string, unknown>, _audit: AdminDataAudit): Promise<Record<string, unknown>> {
    throw new AppError(405, 'RESOURCE_READ_ONLY', 'Use the purpose-specific administrative endpoint.');
  }

  async update(_resource: AdminDataResource, _identifier: string, _input: Record<string, unknown>, _audit: AdminDataAudit): Promise<Record<string, unknown>> {
    throw new AppError(405, 'RESOURCE_READ_ONLY', 'Use the purpose-specific administrative endpoint.');
  }

  async delete(_resource: AdminDataResource, _identifier: string, _audit: AdminDataAudit): Promise<Record<string, unknown>> {
    throw new AppError(405, 'RESOURCE_READ_ONLY', 'Use the purpose-specific administrative endpoint.');
  }

  async #schema(resource: AdminDataResource): Promise<AdminDataSchema> {
    const existing = this.#schemas.get(resource);
    if (existing) return existing;
    const pending = this.#loadSchema(resource).catch(error => { this.#schemas.delete(resource); throw error; });
    this.#schemas.set(resource, pending);
    return pending;
  }

  async #loadSchema(resource: AdminDataResource): Promise<AdminDataSchema> {
    const [rows] = await this.#pool.execute<ColumnRow[]>(
      `SELECT COLUMN_NAME AS name,DATA_TYPE AS dataType,COLUMN_TYPE AS columnType,
              IS_NULLABLE AS nullable,(COLUMN_DEFAULT IS NOT NULL) AS hasDefault,
              COLUMN_KEY AS columnKey,EXTRA AS extra,CHARACTER_MAXIMUM_LENGTH AS maximumLength
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?
       ORDER BY ORDINAL_POSITION`,
      [resource],
    );
    if (rows.length === 0) throw new Error(`Allowlisted database resource is missing: ${resource}`);
    const columns: AdminDataColumn[] = rows.map((row) => {
      const autoIncrement = row.extra.toLowerCase().includes('auto_increment');
      const generated = row.extra.toLowerCase().includes('generated');
      const primary = row.columnKey === 'PRI';
      return {
        name: row.name,
        dataType: row.dataType,
        columnType: row.columnType,
        nullable: row.nullable === 'YES',
        primary,
        autoIncrement,
        generated,
        hasDefault: Boolean(row.hasDefault),
        maximumLength: row.maximumLength === null ? null : Number(row.maximumLength),
        sensitive: isSensitiveAdminDataColumn(row.name),
        insertable: false,
        updatable: false,
      };
    });
    const primaryKey = columns.filter((column) => column.primary).map((column) => column.name);
    if (primaryKey.length === 0) throw new Error(`Allowlisted database resource has no primary key: ${resource}`);
    return {
      resource,
      primaryKey,
      identifierFormat: primaryKey.map((column) => `{${column}}`).join('~'),
      columns,
    };
  }

  #visibleColumns(schema: AdminDataSchema): string[] {
    const visible = schema.columns.filter((column) => !column.sensitive).map((column) => column.name);
    if (visible.length === 0) throw new Error(`Resource has no visible columns: ${schema.resource}`);
    return visible;
  }

  #identifier(schema: AdminDataSchema, identifier: string): { sql: string; values: string[] } {
    let parts: string[];
    try { parts = identifier.split('~').map((part) => decodeURIComponent(part)); }
    catch { throw new AppError(422, 'VALIDATION_ERROR', 'Malformed resource identifier.'); }
    if (parts.length !== schema.primaryKey.length || parts.some((part) => part === '')) {
      throw new AppError(422, 'VALIDATION_ERROR', `Identifier must use format ${schema.identifierFormat}.`);
    }
    return {
      sql: schema.primaryKey.map((name) => `${quoteIdentifier(name)} = ?`).join(' AND '),
      values: parts,
    };
  }

  async #read(connection: Pool | PoolConnection, schema: AdminDataSchema, identifier: string): Promise<Record<string, unknown>> {
    const target = this.#identifier(schema, identifier);
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT ${this.#visibleColumns(schema).map(quoteIdentifier).join(',')} FROM ${quoteIdentifier(schema.resource)} WHERE ${target.sql} LIMIT 1`,
      target.values,
    );
    const row = rows[0];
    if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested record was not found.');
    return { ...row };
  }

}
