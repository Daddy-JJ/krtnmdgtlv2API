import assert from 'node:assert/strict';
import test from 'node:test';
import { StarterEmailToken } from '../../src/modules/starter/services/starter-email-token.ts';
import { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';
import { StarterSlugGenerator } from '../../src/modules/starter/services/starter-slug-generator.ts';
import type { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import type { StarterTransaction, StarterCardRecord } from '../../src/modules/starter/repositories/starter-repository.ts';

const tokens = new StarterEmailToken('test-key-'.repeat(8));
test('email token binds card and deadline and rejects tampering', () => {
  const credential = new OpaqueTokenService().issue().plaintext;
  const now = 1800000000000;
  const token = tokens.issue('card-a', credential, now);
  assert.equal(tokens.verify('card-a', token, now), credential);
  assert.equal(tokens.verify('card-b', token, now), null);
  assert.equal(tokens.verify('card-a', token, now + 86400000), null);
  assert.equal(tokens.verify('card-a', (token[0] === 'A' ? 'B' : 'A') + token.slice(1), now), null);
  assert.equal(token.includes(credential), false);
  assert.equal(tokens.verify('card-a', credential, now), null);
  assert.equal(tokens.verify('card-a', token + 'x', now), null);
});

function fixture(failMail = false, requireHttpsUrls = false) {
  let record: StarterCardRecord;
  let activeHash = '';
  let manageUrl = '';
  let inserts = 0;
  const transaction: StarterTransaction = {
    updateStarter: async (_cardId, data) => { record = { ...record, locale: data.locale, contact: data.contact }; },
    findUser: async () => ({ id: 2, publicId: 'user-id', status: 'active', emailVerifiedAt: new Date() }),
    userHasCard: async () => false,
    claimCard: async (_cardId, userId) => { record = { ...record, userId }; },
    revokeManageTokens: async () => { activeHash = ''; },
    loadCard: async () => record,
    slugExists: async () => false,
    insertStarter: async input => {
      inserts++;
      activeHash = input.tokenHash;
      record = { id: 1, publicId: input.publicId, userId: null, slug: input.slug, planCode: 'starter', themeCode: 'starter-clean', status: 'published', ...input.data };
      return record;
    },
    findManaged: async (id, hash) => id === record.publicId && hash === activeHash ? { tokenId: 1, tokenHash: hash, card: record } : null,
    rotateManageToken: async (_id, _tokenId, hash) => { activeHash = hash; },
  };
  const service = new StarterService({
    repository: {
      transaction: async work => work(transaction),
      findManagedSignupContext: async (id, hash) => id === record.publicId && hash === activeHash && record.userId === null ? { email: record.contact.email } : null,
    },
    rateLimiter: { consume: async () => true },
    slugs: new StarterSlugGenerator(), tokens: new OpaqueTokenService(),
    csrf: new CsrfTokenService('test-csrf-'.repeat(8)), accessTokens: { verify: (value: string) => value === 'access' ? { sub: 'user-id', sid: 'session-id' } : null } as Rs256AccessTokenService,
    appUrl: 'http://127.0.0.1:8080',
    requireHttpsUrls,
    email: { tokens, sendManagement: async (_email, values) => {
      manageUrl = values.manageUrl;
      if (failMail) throw new Error('SMTP unavailable');
    } },
  });
  const input = { locale: 'id' as const, contact: { fullName: 'Test', jobTitle: '', organization: '', officePhone: '021', mobilePhone: '0812', email: 'test@example.test', websiteUrl: 'https://example.test', addressText: 'Jakarta' } };
  return { service, input, manageUrl: () => manageUrl, inserts: () => inserts };
}

test('Starter sends a fragment link, exchanges it once and rotates the cookie credential', async () => {
  const f = fixture();
  const created = await f.service.create(f.input, 'test');
  assert.equal(created.card.emailSent, true);
  assert.equal(f.inserts(), 1);
  const link = new URL(f.manageUrl());
  assert.equal(link.pathname, '/starter/manage/');
  const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
  assert.equal(link.searchParams.get('token'), null);
  assert.equal(JSON.stringify(created.card).includes(token), false);
  const access = await f.service.openAccess(created.card.publicId, token, 'test');
  assert.notEqual(access.manageToken, created.manageToken);
  assert.equal(access.card.publicId, created.card.publicId);
  await assert.rejects(f.service.openAccess(created.card.publicId, token, 'test'), { code: 'STARTER_TOKEN_INVALID' });
});

test('SMTP failure preserves the created card and reports emailSent false', async () => {
  const f = fixture(true);
  const created = await f.service.create(f.input, 'test');
  assert.equal(created.card.emailSent, false);
  assert.equal(created.card.status, 'published');
  assert.equal(f.inserts(), 1);
  assert.ok(created.manageToken);
});

test('Starter without website supports signup context, update, claim, and claimed-context revocation', async () => {
  const f = fixture(false, true);
  const input = { ...f.input, contact: { ...f.input.contact, websiteUrl: '' } };
  const created = await f.service.create(input, 'test');
  assert.equal(created.card.contact.websiteUrl, '');
  assert.deepEqual(await f.service.signupContext(created.card.publicId, created.manageToken), { email: input.contact.email });
  await assert.rejects(f.service.signupContext(created.card.publicId, 'wrong-token'), { code: 'STARTER_TOKEN_INVALID' });
  const updated = await f.service.update(created.card.publicId, created.manageToken, created.csrfToken, input);
  assert.equal(updated.card.contact.websiteUrl, '');
  const claimed = await f.service.claim(updated.card.publicId, updated.manageToken, updated.csrfToken, 'access');
  assert.equal(claimed.card.contact.websiteUrl, '');
  await assert.rejects(f.service.signupContext(claimed.card.publicId, updated.manageToken), { code: 'STARTER_TOKEN_INVALID' });
});
