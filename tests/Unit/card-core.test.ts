import assert from 'node:assert/strict';
import test from 'node:test';
import { cardInputSchema } from '../../src/modules/cards/dto/card-input.ts';
import type { CardRepository } from '../../src/modules/cards/repositories/card-repository.ts';
import { CardService } from '../../src/modules/cards/services/card-service.ts';

const input = { locale: 'id' as const, contact: { fullName: 'Arwan', jobTitle: '', organization: '', officePhone: '', mobilePhone: '0812', email: 'user@example.com', websiteUrl: 'https://example.com', addressText: '' } };

test('Card DTO rejects plan, slug, theme, logo, and unsafe Maps injection', () => {
  for (const extra of [{ planCode: 'pro' }, { slug: 'mine' }, { themeCode: 'pro-luxury-frame' }, { logoPath: '/x' }]) {
    assert.equal(cardInputSchema.safeParse({ ...input, ...extra }).success, false);
  }
  assert.equal(cardInputSchema.safeParse({ ...input, contact: { ...input.contact, mapsUrl: 'https://maps.example' } }).success, true);
  assert.equal(cardInputSchema.safeParse({ ...input, contact: { ...input.contact, mapsUrl: 'javascript:alert(1)' } }).success, false);
  assert.equal(cardInputSchema.safeParse({ ...input, contact: { ...input.contact, websiteUrl: '' } }).success, true);
  assert.equal(cardInputSchema.safeParse({ ...input, contact: { ...input.contact, websiteUrl: 'ftp://example.com' } }).success, false);
});

test('claimed card can be saved without a website, including in HTTPS-only production mode', async () => {
  let savedWebsite = 'not-called';
  const owned = { id: 1, publicId: 'card-id', slug: 'card-slug', planCode: 'starter' as const, themeCode: 'starter-clean', locale: 'id' as const, status: 'published', contact: { ...input.contact, websiteUrl: '', mapsUrl: null } };
  const repository = {
    findOwned: async () => owned,
    updateOwned: async (_userId: string, _cardId: string, data: { contact: { websiteUrl: string } }) => { savedWebsite = data.contact.websiteUrl; return owned; },
  } as unknown as CardRepository;
  const result = await new CardService({ repository, appUrl: 'https://kartunamadigital.id', requireHttpsUrls: true }).update('user-id', 'card-id', { ...input, contact: { ...input.contact, websiteUrl: '' } });
  assert.equal(savedWebsite, '');
  assert.equal(result.contact.websiteUrl, '');
  await assert.rejects(new CardService({ repository, appUrl: 'https://kartunamadigital.id', requireHttpsUrls: true }).update('user-id', 'card-id', { ...input, contact: { ...input.contact, websiteUrl: 'http://example.com' } }), { status: 422, code: 'VALIDATION_ERROR' });
});

test('WhatsApp CTA is derived for every tier from valid Indonesian mobile numbers', async () => {
  const cases = [
    ['081328219697', 'https://wa.me/6281328219697'],
    ['81328219697', 'https://wa.me/6281328219697'],
    ['6281328219697', 'https://wa.me/6281328219697'],
    ['+62 813-2821-(9697)', 'https://wa.me/6281328219697'],
    ['', null],
    ['not-a-phone', null],
    ['0215550188', null],
  ] as const;
  for (const planCode of ['starter', 'basic', 'pro'] as const) {
    for (const [mobilePhone, expected] of cases) {
      const owned = { id: 1, publicId: 'card-id', slug: 'card-slug', planCode, themeCode: 'theme', locale: 'id' as const, status: 'published', contact: { ...input.contact, mobilePhone, mapsUrl: null } };
      const repository = { findOwned: async () => owned } as unknown as CardRepository;
      const result = await new CardService({ repository, appUrl: 'https://kartunamadigital.id' }).get('user-id', 'card-id');
      assert.equal(result.whatsappUrl, expected, `${planCode}:${mobilePhone}`);
    }
  }
});

test('public lookup rejects malformed slugs before repository access', async () => {
  let lookups = 0;
  const repository = { findPublished: async () => { lookups += 1; return null; } } as unknown as CardRepository;
  const service = new CardService({ repository, appUrl: 'https://kartunamadigital.id' });
  for (const slug of ['ab', 'A1b2C3D', 'Bad_Slug', '-bad', 'bad-', 'a'.repeat(101)]) {
    await assert.rejects(service.publicCard(slug), { status: 404, code: 'CARD_NOT_FOUND' });
  }
  assert.equal(lookups, 0);
  await assert.rejects(service.publicCard('aBcDeFg'), { status: 404, code: 'CARD_NOT_FOUND' });
  await assert.rejects(service.publicCard('basic-custom'), { status: 404, code: 'CARD_NOT_FOUND' });
  assert.equal(lookups, 2);
});

test('Card creation fails closed without active Basic/Pro entitlement', async () => {
  const repository: CardRepository = {
    async transaction(work) { return work({
      async findEntitledUserForUpdate() { return null; }, async userHasActiveCard() { return false; },
      async findDefaultTheme() { return null; }, async slugExists() { return false; },
      async insertOwnedCard() { throw new Error('must not insert'); },
    }); },
    async listOwned() { return []; }, async findOwned() { return null; }, async updateOwned() { return null; }, async softDeleteOwned() { return false; },
    async findEffectivePlan() { return null; }, async isSlugAvailable() { return true; }, async updateOwnedSlug() { return null; }, async listThemes() { return []; }, async updateOwnedTheme() { return null; },
    async publishOwned() { return null; }, async findPublished() { return null; }, async updateOwnedLogo() { return null; },
  };
  const service = new CardService({ repository, appUrl: 'https://kartunamadigital.id' });
  await assert.rejects(service.create('user-id', input), { status: 403, code: 'PAID_ENTITLEMENT_REQUIRED' });
});

test('ownership misses use the same non-enumerating 404 response', async () => {
  const repository = { async listOwned(){return [];}, async findOwned(){return null;}, async updateOwned(){return null;}, async softDeleteOwned(){return false;} } as unknown as CardRepository;
  const service = new CardService({ repository, appUrl: 'https://kartunamadigital.id' });
  await assert.rejects(service.get('actor', 'card'), { status: 404, code: 'CARD_NOT_FOUND' });
  await assert.rejects(service.update('actor', 'card', input), { status: 404, code: 'CARD_NOT_FOUND' });
  await assert.rejects(service.delete('actor', 'card'), { status: 404, code: 'CARD_NOT_FOUND' });
});
