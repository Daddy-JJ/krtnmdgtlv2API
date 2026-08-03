import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { checkoutInputSchema } from '../../src/modules/payments/dto/payment-input.ts';
import { MidtransGateway } from '../../src/modules/payments/gateways/midtrans-gateway.ts';

const serverKey = 'SB-Mid-server-secret';
const signed = (overrides: Record<string, unknown> = {}) => {
  const payload = { order_id: 'KND_12345678', status_code: '200', gross_amount: '150000.00', transaction_status: 'settlement', transaction_id: 'trx-1', fraud_status: 'accept', ...overrides };
  return { ...payload, signature_key: createHash('sha512').update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`).digest('hex') };
};

test('checkout DTO allows only Basic or Pro and rejects client-controlled amount/order fields', () => {
  assert.equal(checkoutInputSchema.safeParse({ planCode: 'basic' }).success, true);
  assert.equal(checkoutInputSchema.safeParse({ planCode: 'starter' }).success, false);
  assert.equal(checkoutInputSchema.safeParse({ planCode: 'pro', amount: 1, orderId: 'attacker' }).success, false);
});

test('Midtrans notification requires a valid exact-string SHA-512 signature', async () => {
  const gateway = new MidtransGateway({ environment: 'sandbox', serverKey, clientKey: 'client' }, {} as never);
  const verified = await gateway.verifyNotification(signed());
  assert.equal(verified.orderId, 'KND_12345678');
  assert.equal(verified.transactionStatus, 'settlement');
  assert.match(verified.eventKey, /^[a-f0-9]{64}$/);
  assert.equal('signature_key' in verified.raw, false);
  await assert.rejects(gateway.verifyNotification({ ...signed(), signature_key: '0'.repeat(128) }), { status: 400, code: 'PAYMENT_SIGNATURE_INVALID' });
  await assert.rejects(gateway.verifyNotification({ order_id: 'x' }), { status: 400, code: 'PAYMENT_NOTIFICATION_INVALID' });
});

test('checkout sends backend-owned amount and never sends Server Key in transaction body', async () => {
  let request: Record<string, unknown> | undefined;
  const snap = { createTransaction: async (value: Record<string, unknown>) => { request = value; return { token: 'snap-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/token' }; }, transaction: { status: async () => ({}) } };
  const gateway = new MidtransGateway({ environment: 'sandbox', serverKey, clientKey: 'client' }, snap as never);
  const result = await gateway.createCheckout({ orderId: 'KND_12345678', amount: 150000, customer: { email: 'user@example.com', firstName: 'Arwan' }, item: { id: 'pro', name: 'Pro', quantity: 1, price: 150000 }, callbacks: { finish: 'https://example.com/finish', unfinish: 'https://example.com/unfinish', error: 'https://example.com/error' } });
  assert.equal(result.token, 'snap-token');
  assert.doesNotMatch(JSON.stringify(request), new RegExp(serverKey));
  assert.deepEqual(request?.transaction_details, { order_id: 'KND_12345678', gross_amount: 150000 });
  await assert.rejects(gateway.createCheckout({ orderId: 'KND_12345678', amount: 1, customer: { email: 'user@example.com', firstName: 'Arwan' }, item: { id: 'pro', name: 'Pro', quantity: 1, price: 150000 }, callbacks: { finish: 'https://example.com', unfinish: 'https://example.com', error: 'https://example.com' } }), { code: 'PAYMENT_AMOUNT_INVALID' });
});
