import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import { MySqlStarterRepository } from '../../src/modules/starter/repositories/mysql-starter-repository.ts';
import { StarterSlugGenerator } from '../../src/modules/starter/services/starter-slug-generator.ts';
import { StarterEmailToken } from '../../src/modules/starter/services/starter-email-token.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';
import type { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import { MySqlCardRepository } from '../../src/modules/cards/repositories/mysql-card-repository.ts';
import { CardService } from '../../src/modules/cards/services/card-service.ts';
import { MySqlAccountRepository } from '../../src/modules/account/repositories/mysql-account-repository.ts';
import { reserveCardEmail } from '../../src/shared/security/card-email-identity.ts';

export async function verifyCardEmailIdentity(pool:Pool) {
  const [target]=await pool.query<RowDataPacket[]>('SELECT DATABASE() name');assert.match(target[0]!.name,/_test$/);
  let mail=0,issued=0;
  const tokens=new OpaqueTokenService(),issue=tokens.issue.bind(tokens);tokens.issue=()=>{issued++;return issue();};
  const csrf=new CsrfTokenService('isolated-test-secret-'.repeat(3));
  const slugs=new StarterSlugGenerator();
  const starter=new StarterService({repository:new MySqlStarterRepository(pool),rateLimiter:{consume:async()=>true},tokens,csrf,
    accessTokens:{verify:(sub:string)=>({sub,sid:'session'})} as Rs256AccessTokenService,slugs,appUrl:'https://example.test',
    email:{tokens:new StarterEmailToken('isolated-email-secret-'.repeat(3)),sendManagement:async()=>{mail++;}}});
  const input=(email:string)=>({locale:'id' as const,contact:{fullName:'Identity Test',jobTitle:'',organization:'',officePhone:'',mobilePhone:'',email,websiteUrl:'',addressText:''}});
  async function user(email:string){const id=randomUUID();await pool.execute("INSERT INTO users(public_id,email,password_hash,role,status,email_verified_at,created_at,updated_at) VALUES(?,?,'fixture','member','active',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())",[id,email]);await pool.execute("INSERT INTO user_roles(user_id,role_id,granted_at) SELECT u.id,r.id,UTC_TIMESTAMP() FROM users u JOIN roles r ON r.code='member' WHERE u.public_id=?",[id]);return id;}

  const email='identity.race+tag@example.test';
  const results=await Promise.allSettled(Array.from({length:8},(_,i)=>starter.create(input(i%2?' IDENTITY.RACE+TAG@EXAMPLE.TEST ':email),'race-'+i)));
  const success=results.filter(r=>r.status==='fulfilled');assert.equal(success.length,1);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.status==='rejected'&&r.reason.code==='STARTER_EMAIL_ALREADY_EXISTS'),JSON.stringify(results.filter(r=>r.status==='rejected').map(r=>r.status==='rejected'?r.reason.code:'')));
  assert.equal(mail,1);assert.equal(issued,1);
  const created=success[0]!;assert.equal(created.status,'fulfilled');if(created.status!=='fulfilled')throw new Error('No card');
  assert.equal(created.value.card.status,'published');
  const [credentials]=await pool.execute<RowDataPacket[]>('SELECT COUNT(*) n FROM starter_manage_tokens WHERE card_id=(SELECT id FROM cards WHERE public_id=?)',[created.value.card.publicId]);
  assert.equal(Number(credentials[0]!.n),1);
  await assert.rejects(starter.create(input(email),'sequential'),{code:'STARTER_EMAIL_ALREADY_EXISTS',details:null});
  assert.equal(mail,1);assert.equal(issued,1);
  await starter.create(input('identityrace+tag@example.test'),'dots');
  await starter.create(input('identity.race@example.test'),'plus');

  const attacker=await user('different@example.test'),victim=await user(email),id=created.value.card.publicId;
  // Tampering mutable display email must not redirect ownership/signup identity.
  await pool.execute('UPDATE card_contacts SET email=? WHERE card_id=(SELECT id FROM cards WHERE public_id=?)',['different@example.test',id]);
  assert.deepEqual(await starter.signupContext(id,created.value.manageToken),{email});
  await assert.rejects(starter.claim(id,created.value.manageToken,created.value.csrfToken,attacker),{code:'STARTER_EMAIL_MISMATCH'});
  await assert.rejects(starter.update(id,created.value.manageToken,created.value.csrfToken,input(email)),{code:'STARTER_CLAIM_REQUIRED'});
  const candidates=await starter.listCandidates(victim);assert.equal(candidates.items.length,1);
  const claims=await Promise.all(Array.from({length:4},()=>starter.claimCandidate(id,victim,csrf.issue('session'))));
  assert.equal(claims.filter(r=>!r.alreadyOwned).length,1);
  await assert.rejects(starter.signupContext(id,created.value.manageToken),{code:'STARTER_TOKEN_INVALID'});
  const [audits]=await pool.execute<RowDataPacket[]>("SELECT COUNT(*) n FROM activity_logs WHERE card_id=(SELECT id FROM cards WHERE public_id=?) AND event='starter.claim-confirmed-by-verified-email'",[id]);assert.equal(Number(audits[0]!.n),1);
  const cards=new CardService({repository:new MySqlCardRepository(pool),appUrl:'https://example.test'});
  await assert.rejects(cards.update(attacker,id,input('anything@example.test')),{code:'CARD_NOT_FOUND'});
  await cards.update(victim,id,input('editable-contact@example.test'));
  await assert.rejects(starter.create(input(email),'after-contact-edit'),{code:'STARTER_EMAIL_ALREADY_EXISTS'});
  await assert.rejects(starter.claimCandidate(id,attacker,csrf.issue('session')),{code:'STARTER_NOT_ELIGIBLE'});

  const accounts=new MySqlAccountRepository(pool);
  await accounts.updateEmail(victim,'new-account@example.test','fixture',new Date());
  await assert.rejects(starter.create(input(email),'old-account'),{code:'STARTER_EMAIL_ALREADY_EXISTS'});
  await assert.rejects(starter.create(input('new-account@example.test'),'new-account'),{code:'STARTER_EMAIL_ALREADY_EXISTS'});
  await assert.rejects(cards.update(victim,id,input(email)),{code:'CARD_NOT_FOUND'});
  await pool.execute('UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE public_id=?',[victim]);
  await cards.delete(victim,id);
  await assert.rejects(starter.create(input(email),'deleted'),{code:'STARTER_EMAIL_ALREADY_EXISTS'});

  const firstEmail='registered-first@example.test',firstUser=await user(firstEmail);
  const first=await starter.create(input(firstEmail),'registered-no-card');assert.equal(first.card.status,'published');
  await starter.claim(first.card.publicId,first.manageToken,first.csrfToken,firstUser);

  const paidEmail='paid-identity@example.test',paid=await user(paidEmail);
  await pool.execute("INSERT INTO subscriptions(public_id,user_id,plan_id,status,starts_at,ends_at,created_at,updated_at) SELECT UUID(),u.id,p.id,'active',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 365 DAY),UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users u JOIN plans p ON p.code='basic' WHERE u.public_id=?",[paid]);
  const paidCard=await cards.create(paid,input('display-only@example.test'));
  await assert.rejects(starter.create(input(paidEmail),'paid-duplicate'),{code:'STARTER_EMAIL_ALREADY_EXISTS'});
  await assert.rejects(cards.create(paid,input('other@example.test')),{code:'PLAN_LIMIT_REACHED'});
  const raceEmail='paid-vs-anonymous@example.test',raceUser=await user(raceEmail);
  await pool.execute("INSERT INTO subscriptions(public_id,user_id,plan_id,status,starts_at,ends_at,created_at,updated_at) SELECT UUID(),u.id,p.id,'active',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 365 DAY),UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users u JOIN plans p ON p.code='pro' WHERE u.public_id=?",[raceUser]);
  const competing=await Promise.allSettled([cards.create(raceUser,input(raceEmail)),starter.create(input(raceEmail),'cross-path')]);
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  assert.ok(competing.some(r=>r.status==='rejected'&&r.reason.code==='STARTER_EMAIL_ALREADY_EXISTS'));
  const generate=slugs.generate.bind(slugs);let collision=true;
  slugs.generate=()=>{if(collision){collision=false;return first.card.slug;}return generate();};
  const slugRetry=await starter.create(input('slug-retry@example.test'),'slug-retry');
  assert.notEqual(slugRetry.card.slug,first.card.slug);
  const [bound]=await pool.execute<RowDataPacket[]>('SELECT COUNT(*) n FROM card_email_identities i JOIN cards c ON c.id=i.card_id WHERE c.public_id=?',[slugRetry.card.publicId]);
  assert.equal(Number(bound[0]!.n),1);
  // A legacy NULL on an unrelated card must not stop genuinely new emails.
  const c=await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.execute('UPDATE cards SET registration_email=NULL WHERE public_id=?',[first.card.publicId]);
    await reserveCardEmail(c,'fresh-after-legacy@example.test',new Date());
  } finally {await c.rollback();c.release();}
  await cards.delete(paid,paidCard.publicId);
  await assert.rejects(cards.create(paid,input('other@example.test')),{code:'PLAN_LIMIT_REACHED'});
}
