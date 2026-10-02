import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { parseEnvironment } from '../../src/config/environment.ts';
import { createPaymentGateways } from '../../src/modules/payments/gateways/payment-gateways.ts';

test('retired provider SDK, type shim, runtime config and public contracts are removed', async () => {
  const read = (path: string) => readFile(new URL('../../' + path, import.meta.url), 'utf8');
  for (const path of ['package.json', 'package-lock.json']) {
    assert.doesNotMatch(await read(path), /midtrans-client/i);
  }
  for (const path of ['src/modules/payments/gateways/midtrans-gateway.ts', 'src/types/midtrans-client.d.ts']) {
    await assert.rejects(access(new URL('../../' + path, import.meta.url)), { code: 'ENOENT' });
  }
  for (const path of ['src/config/environment.ts', '.env.example', '.env.staging.example', '.env.production.example']) {
    assert.doesNotMatch(await read(path), /MIDTRANS_/);
  }
  const spec = JSON.parse(await read('docs/PAYMENTS.openapi.yaml'));
  assert.equal(spec.paths['/payments/midtrans/webhook'], undefined);
  assert.ok(spec.paths['/payments/{publicId}/reconcile'].post.responses['410']);
  assert.doesNotMatch(await read('qa/postman/KartuNamaDigital-API.postman_collection.json'), /midtrans/i);
});

test('backend starts with no gateway keys while checkout and processing are disabled', () => {
  const env = parseEnvironment({ DB_DATABASE: 'unit_test', DB_USERNAME: 'test', CSRF_HMAC_KEY: 'x'.repeat(32), OTP_HMAC_KEY: 'y'.repeat(32) });
  assert.equal(env.PAYMENT_PROVIDER, 'duitku');
  assert.equal(env.PAYMENT_CHECKOUT_ENABLED, false);
  assert.equal(env.DUITKU_ENABLED, false);
  assert.deepEqual(createPaymentGateways(env), []);
});
