const { pool, databaseName } = require('../config/database');
const HttpError = require('../lib/http-error');

let schemaCache;

async function loadSchema() {
  if (schemaCache) return schemaCache;
  const [columns] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_KEY
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [databaseName]
  );

  schemaCache = new Map();
  for (const column of columns) {
    if (!schemaCache.has(column.TABLE_NAME)) schemaCache.set(column.TABLE_NAME, []);
    schemaCache.get(column.TABLE_NAME).push(column);
  }
  return schemaCache;
}

async function getTableSchema(tableName) {
  const schema = await loadSchema();
  const columns = schema.get(tableName);
  if (!columns) throw new HttpError(404, `Tabel '${tableName}' tidak tersedia`);
  const primaryKey = columns.find((column) => column.COLUMN_KEY === 'PRI');
  if (!primaryKey) throw new HttpError(422, `Tabel '${tableName}' tidak memiliki primary key`);
  return { columns, primaryKey: primaryKey.COLUMN_NAME };
}

function clearSchemaCache() {
  schemaCache = undefined;
}

module.exports = { loadSchema, getTableSchema, clearSchemaCache };
