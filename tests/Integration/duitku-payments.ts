import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DuitkuGateway } from '../../src/modules/payments/gateways/duitku-gateway.ts';
import { MySqlPaymentRepository } from '../../src/modules/payments/repositories/mysql-payment-repository.ts';
import { PaymentService } from '../../src/modules/payments/services/payment-service.ts';
import type { RateLimiter } from '../../src/modules/auth/repositories/auth-repository.ts';
import { loadMigrationFile } from '../../src/shared/database/migration-file.ts';
import { splitSqlStatements } from '../../src/shared/database/sql-statement-splitter.ts';

const apiKey='mock-only-merchant-key',merchantCode='TEST1';
export async function verifyDuitkuPayments(pool:Pool) {
  const [target]=await pool.query<Array<RowDataPacket&{name:string}>>('SELECT DATABASE() name');
  assert.match(target[0]!.name,/_test$/);
  const repository=new MySqlPaymentRepository(pool),limits:RateLimiter={consume:async()=>true};
  async function owner(){
    const id=randomUUID();
    await pool.execute(`INSERT INTO users(public_id,email,password_hash,role,status,email_verified_at,created_at,updated_at) VALUES(?,?,?,'member','active',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[id,`duitku-${id}@example.test`,'not-a-login-hash']);
    await pool.execute(`INSERT INTO cards(public_id,user_id,slug,theme_id,created_at,updated_at) SELECT ?,u.id,?,t.id,UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users u JOIN themes t ON t.code='starter-clean' WHERE u.public_id=?`,[randomUUID(),randomUUID().replaceAll('-',''),id]);
    return id;
  }
  function fixture(options:{defer?:boolean;timeout?:boolean}={}){
    let creates=0,checks=0,order='',amount=0,resolveInvoice!:(value:Response)=>void;
    const ref=`REF_${randomUUID().replaceAll('-','')}`;
    let status='00',statusRef=ref,statusAmount:string|undefined;
    const response=()=>new Response(JSON.stringify({statusCode:'00',merchantCode,reference:ref,paymentUrl:`https://app-sandbox.duitku.com/redirect_checkout?reference=${ref}`}));
    const gateway=new DuitkuGateway({environment:'sandbox',merchantCode,apiKey,callbackUrl:'https://api.example.test/api/v1/payments/duitku/callback',returnUrl:'https://example.test/app/billing/result/',expiryMinutes:60,timeoutSeconds:1},(async(url,init)=>{
      if(String(url).includes('createInvoice')){
        creates++;const body=JSON.parse(String(init?.body));order=body.merchantOrderId;amount=body.paymentAmount;
        if(options.timeout)throw new Error('simulated timeout');
        if(options.defer)return new Promise<Response>(resolve=>{resolveInvoice=resolve;});
        return response();
      }
      checks++;return new Response(JSON.stringify({statusCode:status,merchantOrderId:order,amount:statusAmount??String(amount),reference:statusRef}));
    })as typeof fetch);
    const service=new PaymentService({repository,gateways:[gateway],rateLimiter:limits,checkoutEnabled:true});
    const payload=()=>({merchantCode,merchantOrderId:order,amount:String(amount),reference:ref,resultCode:'00',signature:createHmac('sha256',apiKey).update(merchantCode+String(amount)+order).digest('hex')});
    return{service,payload,finish:()=>resolveInvoice(response()),get started(){return !!resolveInvoice;},get creates(){return creates;},get checks(){return checks;},set status(value:string){status=value;},set statusRef(value:string){statusRef=value;},set statusAmount(value:string){statusAmount=value;}};
  }
  async function count(sql:string,args:string[]){const [r]=await pool.execute<Array<RowDataPacket&{n:number}>>(sql,args);return Number(r[0]?.n);}
  async function periods(publicId:string){return count('SELECT COUNT(*) n FROM subscription_periods WHERE source_payment_id=(SELECT id FROM payments WHERE public_id=?)',[publicId]);}
  async function unthrottle(publicId:string){await pool.execute('UPDATE payments SET next_status_check_at=NULL WHERE public_id=?',[publicId]);}
  const user=await owner(),f=fixture(),key=randomUUID();
  const responses=await Promise.all(Array.from({length:8},(_,i)=>f.service.checkout(user,{planCode:'basic'},i<4?key:randomUUID())));
  const payment=responses[0]!;
  assert.ok(responses.every(x=>x.publicId===payment.publicId));assert.equal(f.creates,1);
  assert.equal(await count('SELECT COUNT(*) n FROM payments p JOIN users u ON u.id=p.user_id WHERE u.public_id=?',[user]),1);
  // Stress independent owners while invoice attachment races idempotency aliases.
  // Regression: INSERT...SELECT formerly inverted PRIMARY/public_id lock order.
  for (let round=0; round<8; round++) {
    const concurrentOwner=await owner(),concurrent=fixture(),sharedKey=randomUUID();
    const attempts=await Promise.all(Array.from({length:8},(_,i)=>concurrent.service.checkout(concurrentOwner,{planCode:'basic'},i<4?sharedKey:randomUUID())));
    assert.equal(concurrent.creates,1);
    assert.ok(attempts.every(value=>value.publicId===attempts[0]!.publicId));
    assert.equal((await concurrent.service.get(concurrentOwner,attempts[0]!.publicId)).invoiceState,'ready');
    assert.equal(await count('SELECT COUNT(*) n FROM payments p JOIN users u ON u.id=p.user_id WHERE u.public_id=?',[concurrentOwner]),1);
  }
  await assert.rejects(f.service.checkout(user,{planCode:'pro'},key),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(f.service.checkout(user,{planCode:'pro'},randomUUID()),{code:'CHECKOUT_PENDING_EXISTS'});
  const outsider=await owner();
  await assert.rejects(f.service.reconcile(outsider,payment.publicId),{code:'PAYMENT_NOT_FOUND'});assert.equal(f.checks,0);
  f.status='01';await f.service.duitkuCallback(f.payload());assert.equal(await periods(payment.publicId),0);
  await assert.rejects(f.service.reconcile(user,payment.publicId),{code:'RATE_LIMITED'});
  await assert.rejects(f.service.duitkuCallback(f.payload()),{code:'PAYMENT_VERIFICATION_BUSY'});
  await unthrottle(payment.publicId);f.status='00';
  const callbacks=await Promise.allSettled(Array.from({length:8},()=>f.service.duitkuCallback(f.payload())));
  assert.ok(callbacks.some(x=>x.status==='fulfilled'));assert.equal(await periods(payment.publicId),1);
  assert.equal((await f.service.get(user,payment.publicId)).status,'paid');
  const before=f.checks;await f.service.duitkuCallback(f.payload());assert.equal(f.checks,before);
  await unthrottle(payment.publicId);f.status='02';await f.service.reconcile(user,payment.publicId);
  assert.equal((await f.service.get(user,payment.publicId)).status,'paid');assert.equal(await periods(payment.publicId),1);
  const [period]=await pool.execute<Array<RowDataPacket&{days:number}>>('SELECT TIMESTAMPDIFF(DAY,period_start,period_end) days FROM subscription_periods WHERE source_payment_id=(SELECT id FROM payments WHERE public_id=?)',[payment.publicId]);
  assert.equal(period[0]?.days,365);
  assert.equal((await f.service.checkout(user,{planCode:'basic'},key)).publicId,payment.publicId);assert.equal(f.creates,1);
  const earlyUser=await owner(),early=fixture({defer:true});
  const request=early.service.checkout(earlyUser,{planCode:'basic'},randomUUID());
  while(!early.started)await new Promise(resolve=>setTimeout(resolve,1));
  await early.service.duitkuCallback(early.payload());early.finish();
  const earlyPayment=await request;
  assert.equal(earlyPayment.status,'paid');assert.equal(earlyPayment.redirectUrl,null);assert.equal(await periods(earlyPayment.publicId),1);
  const timeoutUser=await owner(),timeout=fixture({timeout:true}),timeoutKey=randomUUID();
  const uncertain=await timeout.service.checkout(timeoutUser,{planCode:'pro'},timeoutKey);
  assert.equal(uncertain.invoiceState,'unknown');assert.equal(uncertain.status,'pending');
  assert.equal((await timeout.service.checkout(timeoutUser,{planCode:'pro'},timeoutKey)).publicId,uncertain.publicId);
  assert.equal((await timeout.service.checkout(timeoutUser,{planCode:'pro'},randomUUID())).publicId,uncertain.publicId);
  assert.equal(timeout.creates,1);assert.equal(await periods(uncertain.publicId),0);
  const mismatchUser=await owner(),mismatch=fixture(),m=await mismatch.service.checkout(mismatchUser,{planCode:'basic'},randomUUID());
  mismatch.statusRef='OTHER';
  await assert.rejects(mismatch.service.duitkuCallback(mismatch.payload()),{code:'PAYMENT_REFERENCE_MISMATCH'});
  assert.equal(await periods(m.publicId),0);
  await unthrottle(m.publicId);mismatch.statusRef=mismatch.payload().reference;mismatch.statusAmount='1';
  await assert.rejects(mismatch.service.duitkuCallback(mismatch.payload()),{code:'PAYMENT_AMOUNT_MISMATCH'});
  assert.equal(await periods(m.publicId),0);
  const evidence={orderId:m.merchantOrderId,statusCode:'00',grossAmount:'55000.00',status:'paid' as const,transactionStatus:'paid',transactionId:mismatch.payload().reference,fraudStatus:null,eventKey:randomUUID(),environment:'sandbox' as const,merchantCode};
  assert.equal((await repository.applyVerifiedNotification({...evidence,provider:'retired-provider' as never},'0'.repeat(64),new Date())).result,'provider_mismatch');
  assert.equal((await repository.applyVerifiedNotification({...evidence,provider:'duitku',transactionId:'OTHER'},'0'.repeat(64),new Date())).result,'reference_mismatch');
  assert.equal(await periods(m.publicId),0);
  const migration=await loadMigrationFile(new URL('../../database/migrations/013_payment_provider_transition.sql',import.meta.url).pathname);
  for(const statement of splitSqlStatements(migration.upSql))await pool.query(statement);
  assert.equal((await repository.findOwned(user,payment.publicId))?.provider,'duitku');
}
