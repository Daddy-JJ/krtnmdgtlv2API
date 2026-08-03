import assert from 'node:assert/strict';
import test from 'node:test';
import type { PaymentGatewayPort } from '../../src/modules/payments/gateways/payment-gateway-port.ts';
import type { CheckoutAuthority, PaymentRecord, PaymentRepository } from '../../src/modules/payments/repositories/payment-repository.ts';
import { PaymentService } from '../../src/modules/payments/services/payment-service.ts';

const authority: CheckoutAuthority = { userId: 1, email: 'user@example.com', fullName: 'Arwan', currentPlanCode: 'starter', targetPlan: { code: 'basic', name: 'Basic', amount: 100000, currency: 'IDR', durationDays: 365 } };
const pending = (publicId = 'id', amount = 55000): PaymentRecord => ({ publicId, merchantOrderId: 'KND_order', targetPlanCode: 'basic', planName: 'Basic', durationDays: 365, amount, currency: 'IDR', status: 'pending', gatewayStatus: null, redirectUrl: null, paidAt: null, expiresAt: null, createdAt: new Date() });
const callbacks = { finish: 'https://example.com/f', unfinish: 'https://example.com/u', error: 'https://example.com/e' };

test('checkout persists authoritative snapshot before gateway and returns only current Snap token', async () => {
  const calls: string[] = []; let stored = pending();
  const repository = { findCheckoutAuthority: async () => authority, insertPending: async (input: { publicId: string; authority: CheckoutAuthority }) => { calls.push('insert'); stored = pending(input.publicId,input.authority.targetPlan.amount); return stored; }, attachGatewayCheckout: async (_id: string, url: string) => { calls.push('attach'); stored = { ...stored, redirectUrl: url, gatewayStatus: 'pending' }; return stored; }, markCheckoutFailed: async () => { calls.push('failed'); }, listOwned: async () => [stored], findOwned: async () => stored } as unknown as PaymentRepository;
  const gateway = { createCheckout: async (input: { amount: number; item: { price: number; name: string } }) => { calls.push('gateway'); assert.equal(input.amount, 55000); assert.equal(input.item.price, 55000); assert.match(input.item.name,/Upgrade STARTER ke Basic/); return { token: 'one-time-snap', redirectUrl: 'https://sandbox.midtrans.com/redirect' }; } } as unknown as PaymentGatewayPort;
  const service = new PaymentService({ repository, gateway, callbacks }); const result = await service.checkout('user', { planCode: 'basic' });
  assert.deepEqual(calls, ['insert', 'gateway', 'attach']); assert.equal(result.amount, 55000); assert.equal(result.snapToken, 'one-time-snap'); assert.equal('snapToken' in (await service.list('user'))[0]!, false);
});

test('checkout uses the locked fixed upgrade fee for every allowed transition', async () => {
  const cases = [
    { currentPlanCode: 'starter', planCode: 'basic', amount: 55000 },
    { currentPlanCode: 'starter', planCode: 'pro', amount: 97000 },
    { currentPlanCode: 'basic', planCode: 'pro', amount: 55000 },
  ] as const;
  for (const item of cases) {
    let stored = pending('id', item.amount);
    const repository = {
      findCheckoutAuthority: async () => ({ ...authority, currentPlanCode: item.currentPlanCode, targetPlan: { ...authority.targetPlan, code: item.planCode, name: item.planCode === 'pro' ? 'Pro' : 'Basic', amount: 999999 } }),
      insertPending: async (input: { authority: CheckoutAuthority }) => { stored = pending('id', input.authority.targetPlan.amount); return stored; },
      attachGatewayCheckout: async () => stored,
      markCheckoutFailed: async () => undefined,
    } as unknown as PaymentRepository;
    const gateway = { createCheckout: async (input: { amount: number; item: { price: number } }) => { assert.equal(input.amount, item.amount); assert.equal(input.item.price, item.amount); return { token: 'snap', redirectUrl: 'https://pay.example' }; } } as unknown as PaymentGatewayPort;
    const result = await new PaymentService({ repository, gateway, callbacks }).checkout('user', { planCode: item.planCode });
    assert.equal(result.amount, item.amount);
  }
});

test('gateway failure marks pending payment failed and disabled gateway writes nothing', async () => {
  let inserted = 0, failed = 0;
  const repository = { findCheckoutAuthority: async () => authority, insertPending: async (input: { publicId: string }) => { inserted += 1; return pending(input.publicId); }, attachGatewayCheckout: async () => null, markCheckoutFailed: async () => { failed += 1; }, listOwned: async () => [], findOwned: async () => null } as unknown as PaymentRepository;
  const failing = { createCheckout: async () => { throw new Error('gateway down'); } } as unknown as PaymentGatewayPort;
  await assert.rejects(new PaymentService({ repository, gateway: failing, callbacks }).checkout('user', { planCode: 'basic' })); assert.equal(inserted, 1); assert.equal(failed, 1);
  await assert.rejects(new PaymentService({ repository, callbacks }).checkout('user', { planCode: 'basic' }), { status: 503, code: 'PAYMENT_GATEWAY_UNAVAILABLE' }); assert.equal(inserted, 1);
});

test('checkout rejects transitions without an approved fixed upgrade fee', async () => {
  let inserted = 0; const repository = { findCheckoutAuthority: async () => ({ ...authority, currentPlanCode: 'pro', targetPlan: { ...authority.targetPlan, code: 'pro', amount: 0 } }), insertPending: async () => { inserted += 1; return pending(); } } as unknown as PaymentRepository;
  await assert.rejects(new PaymentService({ repository, gateway: {} as PaymentGatewayPort, callbacks }).checkout('user', { planCode: 'pro' }), { code: 'PLAN_UPGRADE_NOT_AVAILABLE' }); assert.equal(inserted, 0);
});

test('checkout rejects paid plans that drift from the locked annual 365-day term',async()=>{
  let inserted=0;const repository={findCheckoutAuthority:async()=>({...authority,targetPlan:{...authority.targetPlan,durationDays:30}}),insertPending:async()=>{inserted+=1;return pending();}}as unknown as PaymentRepository;
  await assert.rejects(new PaymentService({repository,gateway:{}as PaymentGatewayPort,callbacks}).checkout('user',{planCode:'basic'}),{code:'PLAN_NOT_PURCHASABLE'});assert.equal(inserted,0);
});

test('notification is verified before repository mutation and duplicate is acknowledged', async () => {
  let applied = 0;
  const verified = { orderId: 'KND_order', statusCode: '200', grossAmount: '100000.00', transactionStatus: 'settlement', transactionId: 'trx', fraudStatus: 'accept', eventKey: 'event', raw: { order_id: 'KND_order' } };
  const gateway = { verifyNotification: async () => verified } as unknown as PaymentGatewayPort;
  const repository = { applyVerifiedNotification: async (_notification: unknown, hash: string) => { applied += 1; assert.match(hash, /^[a-f0-9]{64}$/); return { result: 'duplicate', paymentPublicId: 'payment', paymentStatus: 'paid' }; } } as unknown as PaymentRepository;
  const result = await new PaymentService({ repository, gateway, callbacks }).notification({ attacker: 'payload' });
  assert.equal(result.result, 'duplicate'); assert.equal(applied, 1);
});

test('unknown order, amount mismatch, and event conflict fail closed', async () => {
  const verified = { orderId: 'KND_order', statusCode: '200', grossAmount: '1.00', transactionStatus: 'settlement', transactionId: null, fraudStatus: null, eventKey: 'event', raw: {} };
  const gateway = { verifyNotification: async () => verified } as unknown as PaymentGatewayPort;
  for (const [result, code] of [['unknown_order', 'PAYMENT_ORDER_UNKNOWN'], ['amount_mismatch', 'PAYMENT_AMOUNT_MISMATCH'], ['event_conflict', 'PAYMENT_EVENT_CONFLICT']] as const) {
    const repository = { applyVerifiedNotification: async () => ({ result, paymentPublicId: null, paymentStatus: null }) } as unknown as PaymentRepository;
    await assert.rejects(new PaymentService({ repository, gateway, callbacks }).notification({}), { code });
  }
});

test('reconciliation is ownership-first and applies server-fetched gateway status', async () => {
  let statusCalls=0,applied=0;
  const repository={findOwned:async()=>pending('payment-id'),applyVerifiedNotification:async()=>{applied+=1;return{result:'processed',paymentPublicId:'payment-id',paymentStatus:'paid'};}}as unknown as PaymentRepository;
  const gateway={getTransactionStatus:async(orderId:string)=>{statusCalls+=1;assert.equal(orderId,'KND_order');return{orderId,statusCode:'200',grossAmount:'100000.00',transactionStatus:'settlement',transactionId:'trx',fraudStatus:'accept',raw:{source:'get-status'}};}}as unknown as PaymentGatewayPort;
  const result=await new PaymentService({repository,gateway,callbacks}).reconcile('user','payment-id');assert.equal(result.paymentStatus,'paid');assert.equal(statusCalls,1);assert.equal(applied,1);
  const missing={findOwned:async()=>null}as unknown as PaymentRepository;await assert.rejects(new PaymentService({repository:missing,gateway,callbacks}).reconcile('other','payment-id'),{code:'PAYMENT_NOT_FOUND'});assert.equal(statusCalls,1);
});
