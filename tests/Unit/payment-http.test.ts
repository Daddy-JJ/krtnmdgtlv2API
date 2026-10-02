import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { PaymentController } from '../../src/modules/payments/controllers/payment-controller.ts';
import { createPaymentRouter } from '../../src/modules/payments/routes/payment-router.ts';
import type { PaymentService } from '../../src/modules/payments/services/payment-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';
import { duitkuCallbackSchema } from '../../src/modules/payments/gateways/duitku-gateway.ts';

let checkoutCalls=0,callbackCalls=0;
const service={
  checkout:async()=>{checkoutCalls++;return{publicId:randomUUID(),provider:'duitku',status:'pending',redirectUrl:'https://app-sandbox.duitku.com/redirect_checkout?reference=REF'};},
  duitkuCallback:async(payload:unknown)=>{callbackCalls++;if(!duitkuCallbackSchema.safeParse(payload).success)throw new AppError(400,'PAYMENT_NOTIFICATION_INVALID','Invalid payment callback.');return{result:'processed'};},
  capabilities:()=>({checkoutEnabled:false,provider:'duitku',environment:'sandbox',idempotencyKeyRequired:true}),
  list:async()=>[],get:async()=>({publicId:'id'}),reconcile:async()=>({result:'processed'}),
}as unknown as PaymentService;
const actor={userPublicId:'user',sessionId:'s',role:'user'};
const actors={
  authenticate:(token:string|undefined)=>{if(!token)throw new AppError(401,'AUTH_REQUIRED','Authentication required.');return actor;},
  authorizeUnsafe:(token:string|undefined,csrf:string|undefined)=>{if(!token)throw new AppError(401,'AUTH_REQUIRED','Authentication required.');if(csrf!=='valid')throw new AppError(403,'CSRF_INVALID','CSRF validation failed.');return actor;},
}as unknown as AuthenticatedActorService;
const logger:Logger={info:()=>undefined,error:()=>undefined};
async function call(method:string,path:string,body?:unknown,csrf?:string,options:{form?:boolean;anonymous?:boolean;key?:string|null;blockedGuard?:boolean}={}){
  const app=createApp({databaseHealth:{check:async()=>({healthy:true,latencyMs:0})},environment:'testing',logger,
    ...(options.blockedGuard?{privateSessionGuard:((_r,_s,next)=>next(new AppError(401,'AUTH_REQUIRED','Inactive cookie.')))as import('express').RequestHandler}:{}),
    paymentRouter:createPaymentRouter(new PaymentController(service,actors))});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  try{return await fetch(`http://127.0.0.1:${(server.address()as AddressInfo).port}${path}`,{method,headers:{
    ...(options.anonymous?{}:{cookie:'access_token=x'}),...(csrf?{'x-csrf-token':csrf}:{}),
    ...(options.key===null?{}:{'idempotency-key':options.key??randomUUID()}),
    ...(body!==undefined?{'content-type':options.form?'application/x-www-form-urlencoded':'application/json'}:{}),
  },...(body!==undefined?{body:options.form?new URLSearchParams(body as Record<string,string>).toString():JSON.stringify(body)}:{})});}
  finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
test('checkout requires auth, CSRF, UUID idempotency and rejects client amount/order/status',async()=>{
  checkoutCalls=0;
  assert.equal((await call('POST','/api/v1/payments/checkout',{planCode:'basic'},undefined,{anonymous:true})).status,401);
  assert.equal((await call('POST','/api/v1/payments/checkout',{planCode:'basic'})).status,403);
  assert.equal((await call('POST','/api/v1/payments/checkout',{planCode:'pro',amount:1,orderId:'x',status:'paid'},'valid')).status,422);
  assert.equal((await call('POST','/api/v1/payments/checkout',{planCode:'pro'},'valid',{key:null})).status,422);
  assert.equal(checkoutCalls,0);
  assert.equal((await call('POST','/api/v1/payments/checkout',{planCode:'pro'},'valid')).status,201);
  assert.equal(checkoutCalls,1);
});
test('capabilities and history are private; reconcile still requires CSRF; browser return is not a payment mutation',async()=>{
  assert.equal((await call('GET','/api/v1/payments/capabilities',undefined,undefined,{anonymous:true})).status,401);
  const response=await call('GET','/api/v1/payments/capabilities');assert.equal(response.status,200);assert.equal(((await response.json())as{data:{checkoutEnabled:boolean}}).data.checkoutEnabled,false);
  assert.equal((await call('GET','/api/v1/payments')).status,200);
  assert.equal((await call('GET','/api/v1/payments/not-a-uuid')).status,422);
  assert.equal((await call('POST',`/api/v1/payments/${randomUUID()}/reconcile`)).status,403);
  assert.equal((await call('GET','/api/v1/payments/return?resultCode=00&merchantOrderId=other')).status,422);
});
test('only exact Duitku form callback bypasses unrelated session guard, never retired or sibling routes',async()=>{
  callbackCalls=0;
  assert.equal((await call('POST','/api/v1/payments/midtrans/webhook',{})).status,404);
  assert.equal((await call('POST','/api/v1/payments/midtrans/webhook',{},undefined,{blockedGuard:true})).status,401);
  const payload={merchantCode:'TEST1',merchantOrderId:'KND_order',reference:'REF',resultCode:'00',amount:'55000',signature:'0'.repeat(64)};
  const response=await call('POST','/api/v1/payments/duitku/callback',payload,undefined,{form:true,blockedGuard:true});
  assert.equal(response.status,200);assert.equal(await response.text(),'OK');assert.equal(callbackCalls,1);
  assert.equal((await call('POST','/api/v1/payments/duitku/callback/other',payload,undefined,{form:true,blockedGuard:true})).status,401);
});
test('Duitku callback rejects JSON, malformed forms and oversized/too-many parameter bodies',async()=>{
  assert.equal((await call('POST','/api/v1/payments/duitku/callback',{})).status,415);
  assert.equal((await call('POST','/api/v1/payments/duitku/callback',{amount:'1'},undefined,{form:true})).status,400);
  assert.equal((await call('POST','/api/v1/payments/duitku/callback',{extra:'x'.repeat(17000)},undefined,{form:true})).status,413);
  assert.equal((await call('POST','/api/v1/payments/duitku/callback',Object.fromEntries(Array.from({length:41},(_,i)=>[`x${i}`,'1'])),undefined,{form:true})).status,413);
});
