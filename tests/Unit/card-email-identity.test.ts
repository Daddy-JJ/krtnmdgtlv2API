import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolConnection } from 'mysql2/promise';
import { reserveCardEmail, reserveCurrentOwnerEmail, bindCardEmail, normalizeCardEmail } from '../../src/shared/security/card-email-identity.ts';
import { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import type { StarterTransaction,StarterRepository } from '../../src/modules/starter/repositories/starter-repository.ts';
import { readFile } from 'node:fs/promises';
import { MySqlStarterRepository } from '../../src/modules/starter/repositories/mysql-starter-repository.ts';
import type { Pool } from 'mysql2/promise';
import { MySqlCardRepository } from '../../src/modules/cards/repositories/mysql-card-repository.ts';

test('OpenAPI preserves anonymous publication and exact non-disclosing duplicate contract',async()=>{
  const spec=JSON.parse(await readFile(new URL('../../docs/STARTER-EMAIL-IDENTITY.openapi.json',import.meta.url),'utf8'));
  assert.deepEqual(spec.paths['/starter/cards'].post.security,[]);
  assert.ok(spec.paths['/starter/cards'].post.responses['201']);
  assert.ok(spec.paths['/starter/cards'].post.responses['409']);
  const duplicate=spec.components.schemas.Duplicate;
  assert.equal(duplicate.additionalProperties,false);
  assert.deepEqual(Object.keys(duplicate.properties).sort(),['code','data','message','success']);
  assert.equal(duplicate.properties.data.type,'null');
  assert.equal(duplicate.properties.code.const,'STARTER_EMAIL_ALREADY_EXISTS');
});

test('normalization preserves dots and plus tags, normalizes casing and spaces only',()=>{
  assert.equal(normalizeCardEmail(' Test.Name+tag@EXAMPLE.TEST '),'test.name+tag@example.test');
  assert.notEqual(normalizeCardEmail('test.name@example.test'),normalizeCardEmail('testname@example.test'));
  assert.notEqual(normalizeCardEmail('test+tag@example.test'),normalizeCardEmail('test@example.test'));
});

test('migration trim catalogue matches JavaScript whitespace without stripping interior or excluded characters',async()=>{
  const sql=await readFile(new URL('../../database/migrations/015_legacy_card_email_holds.sql',import.meta.url),'utf8');
  const hex=sql.match(/CONVERT\(0x([0-9a-f]+) USING utf8mb4\)/i)?.[1];
  assert.ok(hex,'Public normalization pattern must be present');
  const decoded=Buffer.from(hex,'hex').toString('ascii');
  assert.ok(decoded.startsWith('(?-mU)'),'Pin MULTILINE/UNGREEDY independently of server defaults');
  const pattern=decoded.slice('(?-mU)'.length).replace(/\\x\{/g,'\\u{');
  const trim=new RegExp(pattern,'gu');
  const points=[9,10,11,12,13,32,0xa0,0x1680,...Array.from({length:11},(_,i)=>0x2000+i),0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff];
  for(const cp of [...points,0x85,0x180e,0x200b,0x2060]) {
    const ch=String.fromCodePoint(cp),value=ch+' TEST.Name+tag@EXAMPLE.TEST '+ch;
    assert.equal(value.replace(trim,'').toLowerCase(),normalizeCardEmail(value));
  }
  assert.equal('a\tb@example.test'.replace(trim,''),'a\tb@example.test');
});

test('email primary-key conflict yields safe 409, not credential issuance, mail or slug retry',async()=>{
  let issued=0,inserted=0,reserved=0;
  const tx={reserveEmail:async()=>{reserved++;throw Object.assign(new Error('private'),{errno:1062,sqlMessage:"Duplicate entry for key 'uq_cards_registration_email'"});},slugExists:async()=>false,insertStarter:async()=>{inserted++;}} as unknown as StarterTransaction;
  const service=new StarterService({repository:{transaction:async work=>work(tx)} as StarterRepository,
    rateLimiter:{consume:async()=>true},tokens:{issue:()=>{issued++;throw new Error('must not issue');}},slugs:{generate:()=> 'AbcDefg'},appUrl:'https://example.test'} as unknown as ConstructorParameters<typeof StarterService>[0]);
  await assert.rejects(service.create({locale:'id',contact:{fullName:'Test',jobTitle:'',organization:'',officePhone:'',mobilePhone:'',email:' Test@example.test ',websiteUrl:'',addressText:''}},'test'),{status:409,code:'STARTER_EMAIL_ALREADY_EXISTS',message:'A card already exists for this email.',details:null});
  assert.equal(reserved,1);assert.equal(issued,0);assert.equal(inserted,0);
});

test('reservation blocks only the held email; fresh emails and same-card aliases remain available',async()=>{
  for(const kind of ['duplicate','legacy','fresh','same-card'] as const){
    const c={execute:async(sql:string)=>{
      if(sql.includes('FROM schema_migrations'))return [[{migration:'ready'}]];
      if(sql.startsWith('INSERT')&&['duplicate','same-card'].includes(kind))throw Object.assign(new Error('private'),{code:'ER_DUP_ENTRY'});
      if(sql.includes('SELECT card_id')&&kind==='duplicate')return [[{card_id:99}]];
      if(sql.includes('SELECT card_id')&&kind==='same-card')return [[{card_id:1}]];
      if(sql.includes('FROM card_email_legacy_holds')&&kind==='legacy')return [[{email:'test@example.test'}]];
      return [[]];
    }} as unknown as PoolConnection;
    const result=reserveCardEmail(c,'test@example.test',new Date(),1);
    if(kind==='same-card'||kind==='fresh')await result;
    else await assert.rejects(result,{code:'STARTER_EMAIL_ALREADY_EXISTS'});
  }
});

test('incomplete cutover fails closed before inserting a reservation',async()=>{
  let writes=0;
  const c={execute:async(sql:string)=>{if(sql.startsWith('INSERT'))writes++;return [[]];}} as unknown as PoolConnection;
  await assert.rejects(reserveCardEmail(c,'fresh@example.test',new Date()),{status:503,code:'CARD_EMAIL_GUARD_UNAVAILABLE',details:null});
  assert.equal(writes,0);
});

test('only a verified existing owner can retain the current held email as alias',async()=>{
  for(const owned of [false,true]) {
    const c={execute:async(sql:string)=>{
      if(sql.includes('SELECT u.email'))return [owned?[{email:'owner@example.test'}]:[]];
      if(sql.includes('FROM schema_migrations'))return [[{migration:'ready'}]];
      if(sql.includes('FROM card_email_legacy_holds'))return [[{email:'owner@example.test'}]];
      return [[]];
    }} as unknown as PoolConnection;
    if(owned)await reserveCurrentOwnerEmail(c,1,1,new Date());
    else await assert.rejects(reserveCurrentOwnerEmail(c,2,1,new Date()),{code:'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED'});
  }
});

test('binding without a reserved email rolls back instead of silently accepting an unguarded card',async()=>{
  const c={execute:async()=>[{affectedRows:0}]} as unknown as PoolConnection;
  await assert.rejects(bindCardEmail(c,'fresh@example.test',1),{code:'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED'});
});

test('valid legacy management context requests identity review, never falls back to mutable contact',async()=>{
  const repository=new MySqlStarterRepository({execute:async()=>[[{email:null}]]} as unknown as Pool);
  await assert.rejects(repository.findManagedSignupContext('fixture','hash'),{
    status:409,code:'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED',details:null,
  });
});

test('theme mutation rechecks current verified ownership instead of trusting an earlier read',async()=>{
  let calls=0;
  const pool={execute:async(sql:string)=>{
    calls++;
    if(calls===1)return [[{id:1,public_id:'fixture',plan_code:'starter',status:'published'}]];
    if(calls===2)return [[{id:1}]];
    assert.match(sql,/UPDATE cards c JOIN users u/);
    assert.match(sql,/email_verified_at IS NOT NULL/);
    assert.match(sql,/u\.public_id=\? AND c\.public_id=\?/);
    assert.match(sql,/c\.deleted_at IS NULL/);
    return [{affectedRows:0}]; // Concurrent release/deletion invalidates authority.
  }} as unknown as Pool;
  assert.equal(await new MySqlCardRepository(pool).updateOwnedTheme('owner','fixture','starter-clean',new Date()),null);
  assert.equal(calls,3);
});
