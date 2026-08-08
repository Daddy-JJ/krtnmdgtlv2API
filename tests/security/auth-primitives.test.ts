import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import { CookiePolicy } from '../../src/shared/security/cookie-policy.ts';
import { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { Argon2idPasswordHasher } from '../../src/shared/security/password-hasher.ts';

test('passwords use salted Argon2id hashes and constant-time verification', async () => {
  const hasher = new Argon2idPasswordHasher();
  const first = await hasher.hash('correct horse battery staple');
  const second = await hasher.hash('correct horse battery staple');

  assert.match(first, /^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
  assert.notEqual(first, second);
  assert.equal(await hasher.verify('correct horse battery staple', first), true);
  assert.equal(await hasher.verify('wrong password', first), false);
  assert.equal(await hasher.verify('correct horse battery staple', 'malformed'), false);
});

test('password verification accepts the legacy Node 24 base64url PHC encoding', async () => {
  const hasher = new Argon2idPasswordHasher();
  const current = await hasher.hash('migration-compatible-password');
  const legacy = current.replace(/\$([^$]+)\$([^$]+)$/, (_whole, salt, hash) => {
    const encode = (value: string) => Buffer.from(value, 'base64').toString('base64url');
    return `$${encode(salt)}$${encode(hash)}`;
  });

  assert.equal(await hasher.verify('migration-compatible-password', legacy), true);
  assert.equal(await hasher.verify('incorrect-password', legacy), false);
});

test('opaque credentials contain at least 256 bits and persist only SHA-256 hashes', () => {
  const tokens = new OpaqueTokenService();
  const first = tokens.issue();
  const second = tokens.issue();

  assert.notEqual(first.plaintext, second.plaintext);
  assert.equal(first.hash.length, 64);
  assert.equal(first.hash, tokens.hash(first.plaintext));
  assert.doesNotMatch(first.hash, new RegExp(first.plaintext));
  assert.throws(() => tokens.issue(16), /256 bits/);
});

test('CSRF token is signed and bound to exactly one authenticated session', () => {
  const csrf = new CsrfTokenService('0123456789abcdef0123456789abcdef');
  const token = csrf.issue('session-family-a');

  assert.equal(csrf.verify(token, 'session-family-a'), true);
  assert.equal(csrf.verify(token, 'session-family-b'), false);
  assert.equal(csrf.verify(`${token}tampered`, 'session-family-a'), false);
});

test('RS256 access token validates signature, issuer, audience, session, and expiry', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const service = new Rs256AccessTokenService({
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    issuer: 'kartunamadigital.id',
    audience: 'kartunamadigital-web',
    ttlSeconds: 900,
  });
  const now = new Date('2026-07-18T12:00:00.000Z');
  const token = service.issue({ userPublicId: 'user-public-id', sessionId: 'family-id', role: 'user' }, now);
  const claims = service.verify(token, new Date('2026-07-18T12:10:00.000Z'));

  assert.equal(claims?.sub, 'user-public-id');
  assert.equal(claims?.sid, 'family-id');
  assert.equal(service.verify(token, new Date('2026-07-18T12:16:00.000Z')), null);
  const replacement = token.endsWith('A') ? 'B' : 'A';
  assert.equal(service.verify(`${token.slice(0, -1)}${replacement}`, now), null);
});

test('cookie policy keeps credentials HttpOnly and enforces Secure for SameSite=None', () => {
  const policy = new CookiePolicy({ secure: true, sameSite: 'Lax', accessTtlSeconds: 900, refreshTtlDays: 30 });

  assert.equal(policy.access().httpOnly, true);
  assert.equal(policy.refresh().path, '/api/v1/auth');
  assert.equal(policy.starterManage().httpOnly, true);
  assert.equal(policy.csrf().httpOnly, false);
  assert.equal(policy.csrf().secure, true);
  assert.throws(
    () => new CookiePolicy({ secure: false, sameSite: 'None', accessTtlSeconds: 900, refreshTtlDays: 30 }),
    /requires Secure/,
  );
});
