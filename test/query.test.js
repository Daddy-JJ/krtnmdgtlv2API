const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination } = require('../src/lib/query');

test('pagination memakai nilai default', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, offset: 0 });
});

test('pagination membatasi limit maksimal 100', () => {
  assert.deepEqual(parsePagination({ page: '2', limit: '500' }), { page: 2, limit: 100, offset: 100 });
});

test('pagination menolak nilai tidak valid', () => {
  assert.throws(() => parsePagination({ page: 'abc' }), /bilangan bulat positif/);
});
