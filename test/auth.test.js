const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCredentials, publicUser } = require('../src/services/auth.service');

test('credential dinormalisasi dan hanya menerima email/password', () => {
  assert.deepEqual(
    validateCredentials({ email: ' User@Example.COM ', password: 'rahasia123' }),
    { email: 'user@example.com', password: 'rahasia123' }
  );
  assert.throws(
    () => validateCredentials({ email: 'user@example.com', password: 'rahasia123', role: 'admin' }),
    /Hanya email dan password/
  );
});

test('credential menolak email atau password tidak valid', () => {
  assert.throws(() => validateCredentials({ email: 'salah', password: 'rahasia123' }), /Format email/);
  assert.throws(() => validateCredentials({ email: 'user@example.com', password: 'pendek' }), /8 sampai 72/);
});

test('publicUser tidak mengekspos password_hash', () => {
  const result = publicUser({ id: 1, public_id: 'uuid', email: 'a@b.com', role: 'user', status: 'active', created_at: 'now', password_hash: 'secret' });
  assert.equal(result.password_hash, undefined);
});
