const HttpError = require('./http-error');

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
    throw new HttpError(400, 'Parameter pagination harus berupa bilangan bulat positif');
  }
  return Math.min(Number(value), maximum);
}

function parsePagination(query) {
  const page = parsePositiveInteger(query.page, 1);
  const limit = parsePositiveInteger(query.limit, 20, 100);
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { parsePositiveInteger, parsePagination };
