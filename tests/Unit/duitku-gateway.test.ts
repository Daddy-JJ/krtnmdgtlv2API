import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { DuitkuGateway, validateDuitkuRedirect } from '../../src/modules/payments/gateways/duitku-gateway.ts';
import { parseEnvironment } from '../../src/config/environment.ts';
import { createPaymentGateways } from '../../src/modules/payments/gateways/payment-gateways.ts';
import { readFile } from 'node:fs/promises';
import type { CreateGatewayCheckout } from '../../src/modules/payments/gateways/payment-gateway-port.ts';

const key='mock-only-merchant-key';
const config={environment:'sandbox' as const,merchantCode:'TEST1',apiKey:key,callbackUrl:'https://api.example.test/api/v1/payments/duitku/callback',returnUrl:'https://example.test/app/billing/result',expiryMinutes:60,timeoutSeconds:1};
const request:CreateGatewayCheckout={orderId:'KND_test_order',amount:55000,customer:{email:'user@example.test',firstName:'Test User'},item:{id:'basic',name:'Basic',quantity:1,price:55000}};
const hmac=(value:string)=>createHmac('sha256',key).update(value).digest('hex');
const callback=()=>({merchantCode:'TEST1',merchantOrderId:request.orderId,amount:'55000',reference:'TEST_REF',resultCode:'00',signature:hmac(`TEST155000${request.orderId}`)});

test('POP create uses timestamp-header HMAC, bounded HTTPS request, and backend invoice fields',async()=>{
  const transport=(async(url,init)=>{
    assert.equal(url,'https://api-sandbox.duitku.com/api/merchant/createInvoice');
    const headers=init!.headers as Record<string,string>, timestamp=headers['x-duitku-timestamp']!;
    assert.match(timestamp,/^\d{13}$/);assert.equal(headers['x-duitku-signature'],hmac(`TEST1${timestamp}`));
    assert.equal(init!.redirect,'error');assert.ok(init!.signal);assert.equal(headers['content-type'],'application/json');
    const body=JSON.parse(String(init!.body));assert.equal(body.paymentAmount,55000);assert.equal(body.expiryPeriod,60);
    assert.equal(body.callbackUrl,config.callbackUrl);assert.equal(body.returnUrl,config.returnUrl);
    assert.doesNotMatch(String(init!.body),/mock-only-merchant-key|signature|snapToken/);
    return Response.json({merchantCode:'TEST1',reference:'TEST_REF',paymentUrl:'https://app-sandbox.duitku.com/redirect_checkout?reference=TEST_REF',statusCode:'00'});
  }) as typeof fetch;
  const result=await new DuitkuGateway(config,transport).createCheckout(request);
  assert.equal(result.reference,'TEST_REF');assert.equal('token' in result,false);
});

test('callback HMAC authenticates merchant + original amount + order; unsigned result is not payment evidence',async()=>{
  const gateway=new DuitkuGateway(config);
  const verified=await gateway.verifyNotification({...callback(),email:'private@example.test',tokenId:'private-token'});
  assert.equal(verified.status,'pending');assert.equal(verified.transactionStatus,'callback');
  assert.doesNotMatch(JSON.stringify(verified),/private-token|private@example|signature|mock-only/);
  assert.equal((await gateway.verifyNotification({...callback(),resultCode:'01'})).status,'pending');
  for(const value of [undefined,{}, {...callback(),signature:undefined},{...callback(),signature:'abc'},{...callback(),signature:'z'.repeat(64)},{...callback(),amount:['55000']},{...callback(),amount:'-1'}])
    await assert.rejects(gateway.verifyNotification(value),{code:'PAYMENT_NOTIFICATION_INVALID'});
  await assert.rejects(gateway.verifyNotification({...callback(),signature:'0'.repeat(64)}),{code:'PAYMENT_SIGNATURE_INVALID'});
  await assert.rejects(gateway.verifyNotification({...callback(),amount:'55001'}),{code:'PAYMENT_SIGNATURE_INVALID'});
  await assert.rejects(gateway.verifyNotification({...callback(),merchantOrderId:'other'}),{code:'PAYMENT_SIGNATURE_INVALID'});
  await assert.rejects(gateway.verifyNotification({...callback(),merchantCode:'OTHER'}),{code:'PAYMENT_MERCHANT_MISMATCH'});
});

test('status endpoint uses form HMAC(merchant+order), separate codes, and exact production host',async()=>{
  for(const [code,status] of [['00','paid'],['01','pending'],['02','canceled']] as const){
    const gateway=new DuitkuGateway({...config,environment:'production'},(async(url,init)=>{
      assert.equal(url,'https://passport.duitku.com/webapi/api/merchant/transactionStatus');
      const body=new URLSearchParams(String(init!.body));assert.equal(body.get('signature'),hmac(`TEST1${request.orderId}`));
      assert.equal((init!.headers as Record<string,string>)['content-type'],'application/x-www-form-urlencoded');
      return Response.json({merchantOrderId:request.orderId,reference:'TEST_REF',amount:'55000',statusCode:code,customerName:'private'});
    }) as typeof fetch);
    const result=await gateway.getTransactionStatus(request.orderId);assert.equal(result.status,status);assert.doesNotMatch(JSON.stringify(result),/private/);
  }
});

test('gateway errors and invalid responses never expose transport credentials or provider messages',async()=>{
  const timeout=new DuitkuGateway(config,(async()=>{throw new Error('API_KEY=private');}) as typeof fetch);
  await assert.rejects(timeout.createCheckout(request),(e:unknown)=>{assert.equal((e as Error).message,'Payment verification is temporarily unavailable.');return true;});
  for(const result of [{merchantOrderId:'wrong',reference:'TEST_REF',amount:'55000',statusCode:'00'}, {merchantOrderId:request.orderId,reference:'TEST_REF',amount:'55000',statusCode:'99'}]){
    await assert.rejects(new DuitkuGateway(config,(async()=>Response.json(result)) as typeof fetch).getTransactionStatus(request.orderId),{code:'PAYMENT_GATEWAY_INVALID_RESPONSE'});
  }
  await assert.rejects(new DuitkuGateway(config,(async()=>new Response('secret', {status:500})) as typeof fetch).getTransactionStatus(request.orderId),{code:'PAYMENT_GATEWAY_UNAVAILABLE'});
});

test('redirect allowlist rejects hostile hosts, mixed environments, userinfo, schemes and reference mismatches',()=>{
  for(const url of ['http://app-sandbox.duitku.com/redirect_checkout?reference=TEST_REF','https://app-sandbox.duitku.com.evil.test/redirect_checkout?reference=TEST_REF','https://app-prod.duitku.com/redirect_checkout?reference=TEST_REF','https://user:pass@app-sandbox.duitku.com/redirect_checkout?reference=TEST_REF','https://app-sandbox.duitku.com:444/redirect_checkout?reference=TEST_REF','https://app-sandbox.duitku.com/redirect_checkout?reference=OTHER','https://app-sandbox.duitku.com/redirect_checkout?reference=TEST_REF&reference=OTHER'])
    assert.throws(()=>validateDuitkuRedirect(url,'sandbox','TEST_REF'),{code:'PAYMENT_REDIRECT_INVALID'});
  assert.match(validateDuitkuRedirect('https://app-prod.duitku.com/redirect_checkout?reference=TEST_REF','production','TEST_REF'),/^https:/);
});

test('configuration stays disabled by default and separates sandbox/production credentials',()=>{
  const base={DB_DATABASE:'unit_test',DB_USERNAME:'test',CSRF_HMAC_KEY:'x'.repeat(32),OTP_HMAC_KEY:'y'.repeat(32)};
  const defaults=parseEnvironment(base);assert.equal(defaults.PAYMENT_CHECKOUT_ENABLED,false);assert.equal(defaults.PAYMENT_PROVIDER,'duitku');
  assert.throws(()=>parseEnvironment({...base,PAYMENT_PROVIDER:'midtrans'}),/PAYMENT_PROVIDER/);
  assert.throws(()=>parseEnvironment({...base,PAYMENT_CHECKOUT_ENABLED:'true'}),/PAYMENT_CHECKOUT_ENABLED/);
  const configured={...base,DUITKU_ENABLED:'true',DUITKU_SANDBOX_MERCHANT_CODE:'TEST1',DUITKU_SANDBOX_API_KEY:key,DUITKU_SANDBOX_CALLBACK_URL:config.callbackUrl,DUITKU_SANDBOX_RETURN_URL:config.returnUrl};
  assert.equal(parseEnvironment(configured).DUITKU_ENV,'sandbox');
  assert.throws(()=>parseEnvironment({...configured,NODE_TLS_REJECT_UNAUTHORIZED:'0'}),/NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.throws(()=>parseEnvironment({...configured,DUITKU_ENV:'production'}),/DUITKU_PRODUCTION/);
  assert.throws(()=>parseEnvironment({...configured,DUITKU_SANDBOX_CALLBACK_URL:'https://api.example.test/wrong'}),/DUITKU_SANDBOX_CALLBACK_URL/);
});

test('gateway registry retains processing with checkout disabled and separates both environment merchants',()=>{
  const base={DB_DATABASE:'unit_test',DB_USERNAME:'test',CSRF_HMAC_KEY:'x'.repeat(32),OTP_HMAC_KEY:'y'.repeat(32)};
  const env=parseEnvironment({...base,DUITKU_ENABLED:'true',DUITKU_ENV:'production',
    DUITKU_SANDBOX_MERCHANT_CODE:'TEST1',DUITKU_SANDBOX_API_KEY:key,DUITKU_SANDBOX_CALLBACK_URL:config.callbackUrl,DUITKU_SANDBOX_RETURN_URL:config.returnUrl,
    DUITKU_PRODUCTION_MERCHANT_CODE:'LIVE1',DUITKU_PRODUCTION_API_KEY:'mock-production-key',DUITKU_PRODUCTION_CALLBACK_URL:config.callbackUrl,DUITKU_PRODUCTION_RETURN_URL:config.returnUrl});
  assert.equal(env.PAYMENT_CHECKOUT_ENABLED,false);
  assert.deepEqual(createPaymentGateways(env).map(g=>[g.environment,g.merchantCode]),[['sandbox','TEST1'],['production','LIVE1']]);
  assert.throws(()=>parseEnvironment({...Object.fromEntries(Object.entries(env).map(([k,v])=>[k,String(v??'')])),DUITKU_PRODUCTION_CALLBACK_URL:'http://api.example.test/api/v1/payments/duitku/callback'}),/DUITKU_PRODUCTION_CALLBACK_URL/);
});

test('oversized gateway response and undocumented redirect query fail closed',async()=>{
  await assert.rejects(new DuitkuGateway(config,(async()=>new Response('x'.repeat(32769)))as typeof fetch).getTransactionStatus(request.orderId),{code:'PAYMENT_GATEWAY_UNAVAILABLE'});
  assert.throws(()=>validateDuitkuRedirect('https://app-sandbox.duitku.com/redirect_checkout?reference=TEST_REF&returnUrl=https://evil.test','sandbox','TEST_REF'),{code:'PAYMENT_REDIRECT_INVALID'});
  await assert.rejects(new DuitkuGateway(config,(async()=>Response.json({merchantCode:'OTHER',reference:'TEST_REF',paymentUrl:'https://app-sandbox.duitku.com/redirect_checkout?reference=TEST_REF',statusCode:'00'}))as typeof fetch).createCheckout(request),{code:'PAYMENT_GATEWAY_INVALID_RESPONSE'});
});

test('backend-owned OpenAPI module parses, references resolve, and cookie/CSRF/checkout contracts agree',async()=>{
  // JSON is a YAML 1.2 subset; module file is deliberately parseable without a new dependency.
  const spec=JSON.parse(await readFile(new URL('../../docs/PAYMENTS.openapi.yaml',import.meta.url),'utf8'));
  assert.equal(spec.openapi,'3.1.0');
  const walk=(value:unknown):void=>{
    if(!value||typeof value!=='object')return;
    for(const [key,child]of Object.entries(value)){
      if(key==='$ref'){const name=String(child).split('/').at(-1)!;assert.ok(spec.components.schemas[name],name);}else walk(child);
    }
  };walk(spec);
  assert.deepEqual(spec.paths['/payments/duitku/callback'].post.security,[]);
  assert.equal(spec.paths['/payments/checkout'].post.parameters[1].name,'Idempotency-Key');
  assert.equal(spec.paths['/payments/checkout'].post.requestBody.content['application/json'].schema.additionalProperties,false);
  assert.ok(spec.paths['/payments/checkout'].post.responses['202']);
  assert.equal(spec.components.schemas.Capabilities.properties.provider.const,'duitku');
  assert.equal('snapToken'in spec.components.schemas.Payment.properties,false);
  assert.equal(spec.paths['/payments/midtrans/webhook'],undefined);
});
