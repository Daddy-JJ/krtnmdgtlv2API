import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import type { ClaimUserRecord,RecoveryCard,StarterRepository,StarterTransaction } from '../../src/modules/starter/repositories/starter-repository.ts';
import { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { StarterSlugGenerator } from '../../src/modules/starter/services/starter-slug-generator.ts';
import type { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import { createApp } from '../../src/app.ts';
import { StarterController } from '../../src/modules/starter/controllers/starter-controller.ts';
import { createStarterRouter } from '../../src/modules/starter/routes/starter-router.ts';
import { CookiePolicy } from '../../src/shared/security/cookie-policy.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import { readFile } from 'node:fs/promises';

test('recovery OpenAPI specifies private discovery, explicit confirmation and bounded results',async()=>{
  const spec=JSON.parse(await readFile(new URL('../../docs/STARTER-RECOVERY.openapi.json',import.meta.url),'utf8'));
  assert.deepEqual(spec.security,[{CookieSession:[]}]);
  const get=spec.paths['/starter/claim-candidates'].get;
  assert.equal(get.parameters[0].schema.maximum,20);
  const post=spec.paths['/starter/claim-candidates/{publicId}/claim'].post;
  const schema=post.requestBody.content['application/json'].schema;
  assert.equal(schema.properties.confirm.const,true);assert.equal(schema.additionalProperties,false);
  assert.ok(post.parameters.some((p:{name:string})=>p.name==='X-CSRF-Token'));
  assert.deepEqual(Object.keys(spec.components.schemas.Candidate.properties).sort(),['createdAt','displayName','publicId','slug']);
});

function fixture(){
  const user:{-readonly[K in keyof ClaimUserRecord]:ClaimUserRecord[K]}={id:1,publicId:randomUUID(),email:'Test.Name+tag@example.test',status:'active',emailVerifiedAt:new Date()};
  const cards:RecoveryCard[]=Array.from({length:3},(_,i)=>({id:i+1,publicId:randomUUID(),userId:null,email:' test.name+tag@example.test ',planCode:'starter',status:'published',deletedAt:null,displayName:`Card ${i}`,slug:`Abcdef${i}`,createdAt:new Date()}));
  let revoked=0,audits=0,limited=false,failAudit=false;
  const csrf=new CsrfTokenService('unit-only-csrf-secret-'.repeat(3));
  const tx={findUser:async()=>user,
    listCandidates:async(email:string,limit:number,offset:number)=>cards.filter(c=>c.userId===null&&c.email.trim().toLowerCase()===email&&c.planCode==='starter'&&!c.deletedAt&&['draft','published'].includes(c.status)).slice(offset,offset+limit).map(({publicId,displayName,slug,createdAt})=>({publicId,displayName,slug,createdAt})),
    findRecoveryCard:async(id:string)=>cards.find(c=>c.publicId===id)??null,
    userHasCard:async()=>cards.some(c=>c.userId===user.id&&!c.deletedAt),
    claimCard:async(id:number,owner:number)=>{const index=cards.findIndex(c=>c.id===id);cards[index]={...cards[index]!,userId:owner};},
    revokeManageTokens:async()=>{revoked++;},
    auditRecoveryClaim:async()=>{if(failAudit)throw new Error('mock audit failure');audits++;},
  } as unknown as StarterTransaction;
  let queue=Promise.resolve();
  const repository={transaction:async<T>(work:(tx:StarterTransaction)=>Promise<T>)=>{
    const previous=queue;let unlock!:()=>void;queue=new Promise(resolve=>{unlock=resolve;});await previous;
    const snapshot=[...cards],oldRevoked=revoked,oldAudits=audits;
    try{return await work(tx);}catch(error){cards.splice(0,cards.length,...snapshot);revoked=oldRevoked;audits=oldAudits;throw error;}finally{unlock();}
  }} as StarterRepository;
  const service=new StarterService({repository,rateLimiter:{consume:async()=>!limited},csrf,tokens:new OpaqueTokenService(),slugs:new StarterSlugGenerator(),appUrl:'https://example.test',
    accessTokens:{verify:(token:string)=>token==='valid'?{sub:user.publicId,sid:'session'}:null} as Rs256AccessTokenService});
  return {user,cards,service,csrf:csrf.issue('session'),get revoked(){return revoked;},get audits(){return audits;},limit:()=>{limited=true;},failAudit:()=>{failAudit=true;}};
}

test('verified session finds minimal paginated candidates but discovery never claims',async()=>{
  const f=fixture(),page=await f.service.listCandidates('valid',2,0);
  assert.equal(page.items.length,2);assert.equal(page.hasMore,true);
  assert.deepEqual(Object.keys(page.items[0]!).sort(),['createdAt','displayName','publicId','slug']);
  assert.equal((await f.service.listCandidates('valid',2,2)).items.length,1);
  assert.equal((await f.service.listCandidates('valid',2,20)).items.length,0);
  assert.ok(f.cards.every(c=>c.userId===null));assert.equal(f.revoked,0);
  f.user.email='testname@example.test';assert.deepEqual((await f.service.listCandidates('valid')).items,[]);
});
test('confirmed claim is minimal, revokes credentials, audits once and supports double-submit',async()=>{
  const f=fixture(),id=f.cards[0]!.publicId;
  const results=await Promise.all(Array.from({length:4},()=>f.service.claimCandidate(id,'valid',f.csrf)));
  assert.equal(results.filter(r=>!r.alreadyOwned).length,1);assert.equal(f.revoked,1);assert.equal(f.audits,1);
  assert.equal(f.cards[0]!.userId,f.user.id);
  assert.deepEqual(Object.keys(results[0]!.card).sort(),['createdAt','displayName','publicId','slug']);
});
test('parallel different candidates respect one-card account limit',async()=>{
  const f=fixture(),results=await Promise.allSettled(f.cards.map(c=>f.service.claimCandidate(c.publicId,'valid',f.csrf)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.status==='rejected'&&r.reason.code==='PLAN_LIMIT_REACHED'));
  assert.equal(f.revoked,1);
});
test('unverified, inactive, invalid session and invalid CSRF cannot claim',async()=>{
  const f=fixture(),id=f.cards[0]!.publicId;
  await assert.rejects(f.service.listCandidates('expired'),{code:'AUTH_REQUIRED'});
  await assert.rejects(f.service.claimCandidate(id,'expired',f.csrf),{code:'AUTH_REQUIRED'});
  await assert.rejects(f.service.claimCandidate(id,'valid','bad'),{code:'CSRF_INVALID'});
  f.user.emailVerifiedAt=null;
  await assert.rejects(f.service.listCandidates('valid'),{code:'EMAIL_VERIFICATION_REQUIRED'});
  await assert.rejects(f.service.claimCandidate(id,'valid',f.csrf),{code:'EMAIL_VERIFICATION_REQUIRED'});
  f.user.status='suspended';await assert.rejects(f.service.listCandidates('valid'),{code:'AUTH_REQUIRED'});
  assert.equal(f.revoked,0);
});
test('email mismatch, owned by other account, suspended/deleted and non-Starter reject safely',async()=>{
  for(const change of [{email:'test.name@example.test'},{userId:99},{status:'suspended'},{deletedAt:new Date()},{planCode:'pro'}]){
    const f=fixture();f.cards[0]={...f.cards[0]!,...change};
    await assert.rejects(f.service.claimCandidate(f.cards[0]!.publicId,'valid',f.csrf),{code:'userId' in change?'STARTER_ALREADY_OWNED':'STARTER_NOT_ELIGIBLE'});
    assert.equal(f.revoked,0);assert.equal(f.audits,0);
  }
});
test('failed audit rolls back ownership/revocation; rate limit and pagination are bounded',async()=>{
  const f=fixture();f.failAudit();await assert.rejects(f.service.claimCandidate(f.cards[0]!.publicId,'valid',f.csrf));
  assert.equal(f.cards[0]!.userId,null);assert.equal(f.revoked,0);
  await assert.rejects(f.service.listCandidates('valid',21),{code:'VALIDATION_ERROR'});
  f.limit();await assert.rejects(f.service.listCandidates('valid'),{code:'RATE_LIMITED'});
  await assert.rejects(f.service.claimCandidate(f.cards[0]!.publicId,'valid',f.csrf),{code:'RATE_LIMITED'});
});

test('HTTP recovery uses access cookie and session CSRF; rejects browser authority and missing confirmation',async()=>{
  const f=fixture();let revokedSession=false;
  const app=createApp({environment:'testing',logger:{info:()=>{},error:()=>{}},databaseHealth:{check:async()=>({healthy:true,latencyMs:0})},
    privateSessionGuard:(req,_res,next)=>{if(revokedSession||!req.headers.cookie?.includes('access_token=valid'))return next(new AppError(401,'AUTH_REQUIRED','Authentication is required.'));next();},
    starterRouter:createStarterRouter(new StarterController(f.service,new CookiePolicy({secure:true,sameSite:'Lax',accessTtlSeconds:900,refreshTtlDays:30})))});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/starter`,path=`${base}/claim-candidates/${f.cards[0]!.publicId}/claim`;
  const headers={cookie:'access_token=valid','content-type':'application/json','x-csrf-token':f.csrf};
  try{
    assert.equal((await fetch(`${base}/claim-candidates`)).status,401);
    const list=await fetch(`${base}/claim-candidates?limit=2`,{headers});assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(`${base}/claim-candidates?email=x@example.test`,{headers})).status,422);
    for(const body of [{},{confirm:false},{confirm:true,userId:f.user.publicId},{confirm:true,email:f.user.email}])assert.equal((await fetch(path,{method:'POST',headers,body:JSON.stringify(body)})).status,422);
    assert.equal((await fetch(path,{method:'POST',headers:{...headers,'x-csrf-token':'bad'},body:'{"confirm":true}'})).status,403);
    revokedSession=true;assert.equal((await fetch(path,{method:'POST',headers,body:'{"confirm":true}'})).status,401);revokedSession=false;
    const response=await fetch(path,{method:'POST',headers,body:'{"confirm":true}'});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.getSetCookie().filter(c=>c.includes('Max-Age=0')||c.includes('Expires=Thu, 01 Jan 1970')).length,2);
    assert.doesNotMatch(await response.text(),/test.name|session|token|email|userId/);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
