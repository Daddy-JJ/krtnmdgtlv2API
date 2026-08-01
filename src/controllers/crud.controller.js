const { pool } = require('../config/database');
const { getTableSchema } = require('../services/schema.service');
const { parsePagination } = require('../lib/query');
const HttpError = require('../lib/http-error');

const quote = (identifier) => `\`${identifier.replace(/`/g, '``')}\``;

function writableColumns(columns) {
  return columns.filter((column) =>
    !column.EXTRA.includes('auto_increment') && !column.EXTRA.includes('GENERATED'));
}

function selectBody(body, columns) {
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw new HttpError(400, 'Body harus berupa object JSON');
  }
  const allowed = new Set(writableColumns(columns).map((column) => column.COLUMN_NAME));
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw new HttpError(400, 'Body mengandung kolom yang tidak diizinkan', { columns: unknown });
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)));
}

async function list(req, res) {
  const { columns, primaryKey } = await getTableSchema(req.params.table);
  const { page, limit, offset } = parsePagination(req.query);
  const columnNames = new Set(columns.map((column) => column.COLUMN_NAME));
  const sort = req.query.sort && columnNames.has(req.query.sort) ? req.query.sort : primaryKey;
  const order = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const filters = Object.entries(req.query)
    .filter(([key]) => key.startsWith('filter[') && key.endsWith(']'))
    .map(([key, value]) => [key.slice(7, -1), value])
    .filter(([key]) => columnNames.has(key));
  const where = filters.length ? ` WHERE ${filters.map(([key]) => `${quote(key)} = ?`).join(' AND ')}` : '';
  const values = filters.map(([, value]) => value);
  const table = quote(req.params.table);
  const [[count], [rows]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM ${table}${where}`, values),
    pool.query(`SELECT * FROM ${table}${where} ORDER BY ${quote(sort)} ${order} LIMIT ? OFFSET ?`, [...values, limit, offset])
  ]);
  res.json({ success: true, data: rows, meta: { page, limit, total: count[0].total, totalPages: Math.ceil(count[0].total / limit) } });
}

async function show(req, res) {
  const { primaryKey } = await getTableSchema(req.params.table);
  const [rows] = await pool.query(`SELECT * FROM ${quote(req.params.table)} WHERE ${quote(primaryKey)} = ? LIMIT 1`, [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'Data tidak ditemukan');
  res.json({ success: true, data: rows[0] });
}

async function create(req, res) {
  const { columns, primaryKey } = await getTableSchema(req.params.table);
  const data = selectBody(req.body, columns);
  if (!Object.keys(data).length) throw new HttpError(400, 'Body tidak boleh kosong');
  const keys = Object.keys(data);
  const [result] = await pool.query(
    `INSERT INTO ${quote(req.params.table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    Object.values(data)
  );
  const id = result.insertId || data[primaryKey];
  const [rows] = await pool.query(`SELECT * FROM ${quote(req.params.table)} WHERE ${quote(primaryKey)} = ? LIMIT 1`, [id]);
  res.status(201).json({ success: true, data: rows[0] || { [primaryKey]: id } });
}

async function update(req, res) {
  const { columns, primaryKey } = await getTableSchema(req.params.table);
  const data = selectBody(req.body, columns);
  delete data[primaryKey];
  const keys = Object.keys(data);
  if (!keys.length) throw new HttpError(400, 'Tidak ada kolom yang dapat diperbarui');
  const [result] = await pool.query(
    `UPDATE ${quote(req.params.table)} SET ${keys.map((key) => `${quote(key)} = ?`).join(', ')} WHERE ${quote(primaryKey)} = ?`,
    [...Object.values(data), req.params.id]
  );
  if (!result.affectedRows) throw new HttpError(404, 'Data tidak ditemukan');
  const [rows] = await pool.query(`SELECT * FROM ${quote(req.params.table)} WHERE ${quote(primaryKey)} = ? LIMIT 1`, [req.params.id]);
  res.json({ success: true, data: rows[0] });
}

async function remove(req, res) {
  const { primaryKey } = await getTableSchema(req.params.table);
  const [result] = await pool.query(`DELETE FROM ${quote(req.params.table)} WHERE ${quote(primaryKey)} = ?`, [req.params.id]);
  if (!result.affectedRows) throw new HttpError(404, 'Data tidak ditemukan');
  res.status(204).send();
}

module.exports = { list, show, create, update, remove, selectBody, writableColumns };
