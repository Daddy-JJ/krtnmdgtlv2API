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
