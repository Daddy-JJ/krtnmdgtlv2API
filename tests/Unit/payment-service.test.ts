import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { GatewayTransactionStatus, PaymentGatewayPort } from '../../src/modules/payments/gateways/payment-gateway-port.ts';
import type { CheckoutAuthority, PaymentRecord, PaymentRepository } from '../../src/modules/payments/repositories/payment-repository.ts';
import { PaymentService } from '../../src/modules/payments/services/payment-service.ts';
import { priceCheckout } from '../../src/modules/payments/services/payment-policy.ts';
import type { RateLimiter } from '../../src/modules/auth/repositories/auth-repository.ts';

const authority:CheckoutAuthority={userId:1,email:'user@example.test',fullName:'User',currentPlanCode:'starter',targetPlan:{code:'basic',name:'Basic',amount:55000,currency:'IDR',durationDays:365}};
const record=():PaymentRecord=>({publicId:randomUUID(),merchantOrderId:'KND_test_order',targetPlanCode:'basic',planName:'Basic',durationDays:365,amount:55000,currency:'IDR',status:'pending',gatewayStatus:null,redirectUrl:null,paidAt:null,expiresAt:new Date(Date.now()+3600000),createdAt:new Date(),provider:'duitku',environment:'sandbox',merchantCode:'TEST1',reference:null,invoiceState:'creating'});
const notice=()=>({merchantCode:'TEST1',merchantOrderId:'KND_test_order',amount:'55000',reference:'REF',resultCode:'00',signature:'0'.repeat(64)});
function fixture(){
  let stored=record(),creates=0,statusCalls=0,applied=0,reserved=false,allowed=true,claimed=true;
  const evidence:{-readonly[K in keyof GatewayTransactionStatus]:GatewayTransactionStatus[K]}={orderId:'KND_test_order',grossAmount:'55000.00',statusCode:'00',transactionStatus:'paid',status:'paid',transactionId:'REF',fraudStatus:null,raw:{status:'paid'}};
  const gateway:PaymentGatewayPort={provider:'duitku',environment:'sandbox',merchantCode:'TEST1',
    createCheckout:async input=>{creates++;assert.equal(input.amount,55000);return{reference:'REF',redirectUrl:'https://app-sandbox.duitku.com/redirect_checkout?reference=REF'};},
    verifyNotification:async()=>({...evidence,orderId:'KND_test_order',grossAmount:'55000.00',transactionId:'REF',status:'pending',transactionStatus:'callback',eventKey:'trigger'}),
    getTransactionStatus:async()=>{statusCalls++;return evidence;},
  };
  const repository={
    reserveCheckout:async()=>{const created=!reserved;reserved=true;return{payment:stored,authority:created?authority:null,created};},
    attachInvoice:async(_id:string,reference:string,url:string)=>{stored={...stored,reference,redirectUrl:url,invoiceState:'ready'};return stored;},
    markCheckoutUncertain:async()=>{if(stored.status==='pending')stored={...stored,invoiceState:'unknown'};},
    findOwned:async(user:string)=>user==='other'?null:stored,findByOrder:async()=>stored,listOwned:async()=>[stored],
    claimStatusCheck:async()=>claimed,
    applyVerifiedNotification:async(value:GatewayTransactionStatus)=>{applied++;stored={...stored,status:value.status,reference:value.transactionId};return{result:'processed',paymentPublicId:stored.publicId,paymentStatus:stored.status};},
  }as unknown as PaymentRepository;
  const rateLimiter={consume:async()=>allowed}as RateLimiter;
  const service=new PaymentService({repository,gateways:[gateway],checkoutEnabled:true,rateLimiter,sandboxAllowedUserPublicIds:['user']});
  return{service,repository,gateway,rateLimiter,evidence,get stored(){return stored;},set stored(v:PaymentRecord){stored=v;},get creates(){return creates;},get statusCalls(){return statusCalls;},get applied(){return applied;},deny:()=>{allowed=false;},throttle:()=>{claimed=false;}};
}
test('disabled checkout writes nothing even with configured processing gateway',async()=>{
  const f=fixture(),service=new PaymentService({repository:f.repository,gateways:[f.gateway],rateLimiter:f.rateLimiter});
  assert.equal(service.capabilities().checkoutEnabled,false);
  await assert.rejects(service.checkout('user',{planCode:'basic'},randomUUID()),{code:'PAYMENT_CHECKOUT_DISABLED'});
  assert.equal(f.creates,0);
  await service.duitkuCallback(notice());
  assert.equal(f.stored.status,'paid');
});
test('unsupported checkout provider fails closed before reserving or creating an invoice',()=>{
  const f=fixture();
  assert.throws(()=>new PaymentService({repository:f.repository,gateways:[f.gateway],provider:'retired-provider' as never,checkoutEnabled:true,rateLimiter:f.rateLimiter}),{code:'PAYMENT_CONFIG_INVALID'});
  assert.equal(f.creates,0);
});
test('sandbox requires exact authenticated allowlist membership before any reservation or gateway call',async()=>{
  const f=fixture();let reservations=0;
  f.repository.reserveCheckout=async()=>{reservations++;throw new Error('must not reserve');};
  for(const sandboxAllowedUserPublicIds of [[],['user-other']]) {
    const service=new PaymentService({repository:f.repository,gateways:[f.gateway],checkoutEnabled:true,rateLimiter:f.rateLimiter,sandboxAllowedUserPublicIds});
    assert.equal(service.capabilities('user').checkoutEnabled,false);
    assert.equal(service.capabilities().checkoutEnabled,false);
    await assert.rejects(service.checkout('user',{planCode:'basic'},randomUUID()),{status:403,code:'PAYMENT_SANDBOX_FORBIDDEN'});
  }
  assert.equal(reservations,0);assert.equal(f.creates,0);
  assert.equal(f.service.capabilities('user').checkoutEnabled,true);
  assert.equal(f.service.capabilities('other').checkoutEnabled,false);
  assert.equal('sandboxAllowedUserPublicIds' in f.service.capabilities('user'),false);
});
test('production checkout is not governed by sandbox allowlist',async()=>{
  const f=fixture();const gateway:PaymentGatewayPort={...f.gateway,environment:'production',
    createCheckout:async()=>({reference:'REF',redirectUrl:'https://app-prod.duitku.com/redirect_checkout?reference=REF'})};
  const service=new PaymentService({repository:f.repository,gateways:[gateway],environment:'production',checkoutEnabled:true,rateLimiter:f.rateLimiter});
  assert.equal(service.capabilities('user').checkoutEnabled,true);
  assert.ok((await service.checkout('user',{planCode:'basic'},randomUUID())).redirectUrl);
});
test('checkout returns neutral authoritative fields and hides reference/merchant/token',async()=>{
  const f=fixture(),response=await f.service.checkout('user',{planCode:'basic'},randomUUID());
  assert.equal(response.amount,55000);assert.equal(response.provider,'duitku');assert.equal(response.durationDays,365);
  assert.ok(response.redirectUrl);assert.ok(response.expiresAt);
  for(const field of ['reference','merchantCode','snapToken','token','apiKey','signature'])assert.equal(field in response,false);
  assert.equal((await f.service.list('user')).length,1);
});
test('parallel service requests do not invoke create again for an already reserved attempt',async()=>{
  const f=fixture();
  await Promise.all(Array.from({length:8},()=>f.service.checkout('user',{planCode:'basic'},randomUUID())));
  assert.equal(f.creates,1);
});
test('timeout create remains uncertain and retry does not send another create',async()=>{
  const f=fixture();let sends=0;f.gateway.createCheckout=async()=>{sends++;throw new Error('mock timeout contains secret');};
  const key=randomUUID(),first=await f.service.checkout('user',{planCode:'basic'},key);
  assert.equal(first.status,'pending');assert.equal(first.invoiceState,'unknown');assert.equal(first.redirectUrl,null);
  await f.service.checkout('user',{planCode:'basic'},key);await f.service.checkout('user',{planCode:'basic'},randomUUID());
  assert.equal(sends,1);
});
test('locked business policy preserves upgrade prices, IDR and annual term',()=>{
  for(const [from,to,price] of [['starter','basic',55000],['starter','pro',97000],['basic','pro',55000]]as const)
    assert.equal(priceCheckout({...authority,currentPlanCode:from,targetPlan:{...authority.targetPlan,code:to,amount:999999}}).targetPlan.amount,price);
  assert.throws(()=>priceCheckout({...authority,currentPlanCode:'pro'}),{code:'PLAN_UPGRADE_NOT_AVAILABLE'});
  assert.throws(()=>priceCheckout({...authority,targetPlan:{...authority.targetPlan,durationDays:30}}),{code:'PLAN_NOT_PURCHASABLE'});
  assert.throws(()=>priceCheckout({...authority,targetPlan:{...authority.targetPlan,currency:'USD'}}),{code:'PLAN_NOT_PURCHASABLE'});
});
test('Duitku callback always uses server status, ignores unsigned result code and ACKs paid replay',async()=>{
  const f=fixture();f.evidence.status='pending';f.evidence.transactionStatus='pending';f.evidence.statusCode='01';
  await f.service.duitkuCallback(notice());assert.equal(f.stored.status,'pending');
  f.evidence.status='paid';f.evidence.transactionStatus='paid';f.evidence.statusCode='00';
  await f.service.duitkuCallback({...notice(),resultCode:'01'});assert.equal(f.stored.status,'paid');
  const applied=f.applied,checks=f.statusCalls;
  assert.equal((await f.service.duitkuCallback(notice())).result,'duplicate');assert.equal(f.applied,applied);assert.equal(f.statusCalls,checks);
});
test('callback before create response cannot regress paid state when invoice is attached',async()=>{
  const f=fixture();let resolveInvoice!:(v:{reference:string;redirectUrl:string})=>void;
  f.gateway.createCheckout=()=>new Promise(resolve=>{resolveInvoice=resolve;});
  const checkout=f.service.checkout('user',{planCode:'basic'},randomUUID());
  while(!resolveInvoice)await new Promise(resolve=>setTimeout(resolve,0));
  await f.service.duitkuCallback(notice());
  resolveInvoice({reference:'REF',redirectUrl:'https://app-sandbox.duitku.com/redirect_checkout?reference=REF'});
  const response=await checkout;assert.equal(response.status,'paid');assert.equal(response.redirectUrl,null);
});
test('callback external failure/throttle or mismatched order/amount/reference never applies entitlement',async()=>{
  for(const kind of ['timeout','throttle','amount','order','reference']as const){
    const f=fixture();if(kind==='timeout')f.gateway.getTransactionStatus=async()=>{throw new Error('mock timeout');};
    if(kind==='throttle')f.throttle();if(kind==='amount')f.evidence.grossAmount='1.00';
    if(kind==='order')f.evidence.orderId='OTHER';if(kind==='reference')f.evidence.transactionId='OTHER';
    await assert.rejects(f.service.duitkuCallback(notice()));assert.equal(f.applied,0);assert.equal(f.stored.status,'pending');
  }
});
test('reconcile checks ownership before provider request and enforces frequency limit',async()=>{
  const f=fixture();
  await assert.rejects(f.service.reconcile('other',f.stored.publicId),{code:'PAYMENT_NOT_FOUND'});assert.equal(f.statusCalls,0);
  f.throttle();await assert.rejects(f.service.reconcile('user',f.stored.publicId),{status:429,code:'RATE_LIMITED'});
  assert.equal(f.statusCalls,0);
});
test('retired historical provider is readable but never redirected or reconciled through Duitku',async()=>{
  const f=fixture();f.stored={...f.stored,provider:'retired-provider',environment:null,merchantCode:null,redirectUrl:'https://retired.example.test/pay'};
  const service=new PaymentService({repository:f.repository,gateways:[f.gateway],rateLimiter:f.rateLimiter});
  assert.equal((await service.get('user',f.stored.publicId)).provider,'retired-provider');
  assert.equal((await service.get('user',f.stored.publicId)).redirectUrl,null);
  await assert.rejects(service.reconcile('user',f.stored.publicId),{status:410,code:'PAYMENT_PROVIDER_RETIRED'});
  assert.equal(f.statusCalls,0);assert.equal(f.applied,0);
  await assert.rejects(f.service.duitkuCallback(notice()),{code:'PAYMENT_PROVIDER_MISMATCH'});
});
test('outbound invalid redirect and failed verification cannot leak provider secrets to API',async()=>{
  const f=fixture();f.gateway.createCheckout=async()=>({reference:'REF',redirectUrl:'https://evil.test/payment'});
  await assert.rejects(f.service.checkout('user',{planCode:'basic'},randomUUID()),{code:'PAYMENT_REDIRECT_INVALID'});
  assert.equal(f.stored.status,'pending');assert.equal(f.stored.invoiceState,'unknown');
});
