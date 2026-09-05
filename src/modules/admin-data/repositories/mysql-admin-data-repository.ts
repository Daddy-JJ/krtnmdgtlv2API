import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
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

const integerTypes = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'year']);
const decimalTypes = new Set(['decimal', 'numeric', 'float', 'double', 'real']);
const dateTypes = new Set(['date', 'datetime', 'timestamp', 'time']);
const textTypes = new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'enum', 'set']);

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) throw new Error('Unsafe SQL identifier rejected.');
  return `\`${value}\``;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      if (!columnMap.has(name)) throw new AppError(422, 'VALIDATION_ERROR', `Unknown filter column: ${name}.`);
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
    const sort = input.sort ?? schema.primaryKey[0] ?? schema.columns[0]?.name;
    if (!sort || !columnMap.has(sort)) throw new AppError(422, 'VALIDATION_ERROR', 'Unknown sort column.');
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

  async create(resource: AdminDataResource, input: Record<string, unknown>, audit: AdminDataAudit): Promise<Record<string, unknown>> {
    const schema = await this.#schema(resource);
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const prepared = this.#normalizeBody(schema, input, 'create');
      const columns = Object.keys(prepared);
      const expressions = columns.map(() => '?');
      const values = Object.values(prepared);

      for (const automatic of ['created_at', 'updated_at'] as const) {
        if (schema.columns.some((column) => column.name === automatic) && !columns.includes(automatic)) {
          columns.push(automatic);
          expressions.push('UTC_TIMESTAMP()');
        }
      }

      const publicId = schema.columns.find((column) => column.name === 'public_id');
      if (publicId?.insertable && !columns.includes('public_id')) {
        columns.push('public_id');
        expressions.push('?');
        values.push(randomUUID());
        prepared.public_id = values.at(-1);
      }

      const sql = columns.length === 0
        ? `INSERT INTO ${quoteIdentifier(resource)} () VALUES ()`
        : `INSERT INTO ${quoteIdentifier(resource)} (${columns.map(quoteIdentifier).join(',')}) VALUES (${expressions.join(',')})`;
      const [result] = await connection.query<ResultSetHeader>(sql, values);
      const identifier = schema.primaryKey.map((name) => {
        const column = schema.columns.find((candidate) => candidate.name === name);
        if (column?.autoIncrement) return String(result.insertId);
        const value = prepared[name];
        if (value === undefined || value === null) throw new Error(`Primary key value was not produced: ${name}`);
        return encodeURIComponent(String(value));
      }).join('~');
      const record = await this.#read(connection, schema, identifier);
      await this.#audit(connection, audit, 'create', resource, identifier);
      await connection.commit();
      return record;
    } catch (error) {
      await connection.rollback();
      translateDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async update(resource: AdminDataResource, identifier: string, input: Record<string, unknown>, audit: AdminDataAudit): Promise<Record<string, unknown>> {
    const schema = await this.#schema(resource);
    const prepared = this.#normalizeBody(schema, input, 'update');
    const columns = Object.keys(prepared);
    if (columns.length === 0) throw new AppError(422, 'VALIDATION_ERROR', 'At least one updatable field is required.');
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const target = this.#identifier(schema, identifier);
      const assignments = columns.map((name) => `${quoteIdentifier(name)} = ?`);
      const values = Object.values(prepared);
      if (schema.columns.some((column) => column.name === 'updated_at')) assignments.push('`updated_at` = UTC_TIMESTAMP()');
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE ${quoteIdentifier(resource)} SET ${assignments.join(',')} WHERE ${target.sql}`,
        [...values, ...target.values],
      );
      if (result.affectedRows === 0) await this.#read(connection, schema, identifier);
      const record = await this.#read(connection, schema, identifier);
      await this.#audit(connection, audit, 'update', resource, identifier);
      await connection.commit();
      return record;
    } catch (error) {
      await connection.rollback();
      translateDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async delete(resource: AdminDataResource, identifier: string, audit: AdminDataAudit): Promise<Record<string, unknown>> {
    const schema = await this.#schema(resource);
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const record = await this.#read(connection, schema, identifier);
      const target = this.#identifier(schema, identifier);
      const [result] = await connection.query<ResultSetHeader>(
        `DELETE FROM ${quoteIdentifier(resource)} WHERE ${target.sql}`,
        target.values,
      );
      if (result.affectedRows === 0) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested record was not found.');
      await this.#audit(connection, audit, 'delete', resource, identifier);
      await connection.commit();
      return record;
    } catch (error) {
      await connection.rollback();
      translateDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async #schema(resource: AdminDataResource): Promise<AdminDataSchema> {
    const existing = this.#schemas.get(resource);
    if (existing) return existing;
    const pending = this.#loadSchema(resource);
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
      const managedTimestamp = row.name === 'updated_at';
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
        insertable: !autoIncrement && !generated,
        updatable: !autoIncrement && !generated && !primary && !managedTimestamp,
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
    const parts = identifier.split('~').map((part) => decodeURIComponent(part));
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

  #normalizeBody(schema: AdminDataSchema, input: Record<string, unknown>, mode: 'create' | 'update'): Record<string, unknown> {
    if (!isPlainObject(input)) throw new AppError(422, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    const columns = new Map(schema.columns.map((column) => [column.name, column]));
    const prepared: Record<string, unknown> = {};
    const issues: Array<{ field: string; message: string }> = [];

    for (const [name, value] of Object.entries(input)) {
      const column = columns.get(name);
      if (!column || (mode === 'create' ? !column.insertable : !column.updatable)) {
        issues.push({ field: name, message: 'Field is unknown or not writable.' });
        continue;
      }
      try {
        prepared[name] = this.#normalizeValue(column, value);
      } catch (error) {
        issues.push({ field: name, message: error instanceof Error ? error.message : 'Invalid value.' });
      }
    }

    if (mode === 'create') {
      for (const column of schema.columns) {
        const automatic = column.autoIncrement || column.generated || column.hasDefault || column.nullable
          || column.name === 'public_id' || column.name === 'created_at' || column.name === 'updated_at';
        if (column.insertable && !automatic && !Object.hasOwn(prepared, column.name)) {
          issues.push({ field: column.name, message: 'Field is required.' });
        }
      }
    }

    if (issues.length > 0) throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', issues);
    return prepared;
  }

  #normalizeValue(column: AdminDataColumn, value: unknown): unknown {
    if (value === null) {
      if (!column.nullable) throw new Error('Field cannot be null.');
      return null;
    }
    if (column.columnType.toLowerCase() === 'tinyint(1)') {
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value === 0 || value === 1) return value;
      throw new Error('Expected a boolean or 0/1.');
    }
    if (integerTypes.has(column.dataType)) {
      if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
      if (typeof value === 'string' && /^-?[0-9]+$/.test(value)) return value;
      throw new Error('Expected an integer.');
    }
    if (decimalTypes.has(column.dataType)) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && /^-?(?:[0-9]+\.?[0-9]*|\.[0-9]+)$/.test(value)) return value;
      throw new Error('Expected a number.');
    }
    if (dateTypes.has(column.dataType)) {
      if (typeof value !== 'string' || value.trim() === '') throw new Error('Expected a date/time string.');
      return value;
    }
    if (column.dataType === 'json') {
      try {
        return typeof value === 'string' ? JSON.stringify(JSON.parse(value)) : JSON.stringify(value);
      } catch {
        throw new Error('Expected valid JSON.');
      }
    }
    if (textTypes.has(column.dataType)) {
      if (typeof value !== 'string') throw new Error('Expected a string.');
      if (column.maximumLength !== null && value.length > column.maximumLength) {
        throw new Error(`Maximum length is ${column.maximumLength} characters.`);
      }
      return value;
    }
    if (typeof value === 'object') throw new Error('Expected a scalar value.');
    return value;
  }

  async #audit(connection: PoolConnection, audit: AdminDataAudit, action: 'create' | 'update' | 'delete', resource: AdminDataResource, identifier: string): Promise<void> {
    await connection.execute(
      `INSERT INTO activity_logs(user_id,event,request_id,metadata_text,created_at)
       SELECT id,?,?,?,UTC_TIMESTAMP() FROM users WHERE public_id=? AND status='active' LIMIT 1`,
      [`admin.data.${action}`, audit.requestId, JSON.stringify({ resource, identifier }), audit.actorPublicId],
    );
  }
}
