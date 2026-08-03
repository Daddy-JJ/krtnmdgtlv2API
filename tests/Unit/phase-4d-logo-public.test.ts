import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import type { CardContentRepository } from '../../src/modules/card-content/repositories/card-content-repository.ts';
import type { CardRepository, OwnedCard } from '../../src/modules/cards/repositories/card-repository.ts';
import { CardService } from '../../src/modules/cards/services/card-service.ts';
import type { PlanCapabilityService } from '../../src/modules/plans/plan-capability-service.ts';
import { LogoFileStorage } from '../../src/modules/uploads/logo/logo-file-storage.ts';
import { LogoImageProcessor } from '../../src/modules/uploads/logo/logo-image-processor.ts';
import { LogoService } from '../../src/modules/uploads/logo/logo-service.ts';

const card = (planCode: 'starter' | 'basic' | 'pro' = 'pro'): OwnedCard => ({
  id: 1, publicId: '7fe91d39-c2a8-4b29-bc1d-b5304c7bfc61', slug: 'arwan-sales', planCode,
  themeCode: `${planCode}-theme`, locale: 'id', status: 'published', logoPath: null,
  contact: { fullName: 'Arwan', jobTitle: '', organization: '', officePhone: '', mobilePhone: '0812 3456 7890', email: 'a@example.com', websiteUrl: 'https://example.com', addressText: '', mapsUrl: 'https://maps.google.com/example' },
});

test('logo processor verifies image bytes and produces bounded WebP', async () => {
  const source = await sharp({ create: { width: 2400, height: 1200, channels: 4, background: '#336699' } }).png().toBuffer();
  const output = await new LogoImageProcessor().process(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  await assert.rejects(new LogoImageProcessor().process(Buffer.from('not-an-image')), { status: 422, code: 'IMAGE_INVALID' });
});

test('logo upload enforces Pro before processing and replaces stored file safely', async () => {
  let processed = 0; let removed: Array<string | null> = [];
  const cards = { findOwned: async () => card('basic'), updateOwnedLogo: async () => null } as unknown as CardRepository;
  const denied = new LogoService({ cards, capabilities: { assertEnabled: async () => { throw Object.assign(new Error('denied'), { status: 403, code: 'CAPABILITY_NOT_AVAILABLE' }); } } as unknown as PlanCapabilityService, processor: { process: async () => { processed += 1; return Buffer.from('x'); } } as LogoImageProcessor, storage: { write: async () => 'new.webp', remove: async (value: string | null) => { removed.push(value); } } as unknown as LogoFileStorage });
  await assert.rejects(denied.upload('user', card().publicId, Buffer.from('x')), { status: 403, code: 'CAPABILITY_NOT_AVAILABLE' });
  assert.equal(processed, 0);

  const proCard = { ...card('pro'), logoPath: 'old.webp' };
  const allowedCards = { findOwned: async () => proCard, updateOwnedLogo: async () => ({ card: { ...proCard, logoPath: 'new.webp' }, previousPath: 'old.webp' }) } as unknown as CardRepository;
  const allowed = new LogoService({ cards: allowedCards, capabilities: { assertEnabled: async () => undefined } as unknown as PlanCapabilityService, processor: { process: async value => value } as LogoImageProcessor, storage: { write: async () => 'new.webp', remove: async (value: string | null) => { removed.push(value); } } as unknown as LogoFileStorage });
  assert.equal((await allowed.upload('user', proCard.publicId, Buffer.from('webp'))).logoUrl, '/api/v1/public/cards/arwan-sales/logo');
  assert.deepEqual(removed, ['old.webp']);
});

test('logo storage uses opaque keys and rejects traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knd-logo-test-'));
  const storage = new LogoFileStorage(directory);
  try { const key = await storage.write(Buffer.from('image')); assert.match(key, /^[0-9a-f-]{36}\.webp$/); assert.deepEqual(await storage.read(key), Buffer.from('image')); await assert.rejects(storage.read('../secret')); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

test('public aggregate applies authoritative limits and hides unpublished catalog', async () => {
  const repository = { findPublished: async () => card('pro') } as unknown as CardRepository;
  const content = {
    listPublishedSocial: async (_slug: string, limit: number) => [{ id: 1, platform: 'linkedin', url: 'https://linkedin.com/in/a', sortOrder: 1 }].slice(0, limit),
    listPublishedCatalog: async (_slug: string, limit: number) => [{ publicId: 'item', title: 'Public', description: null, targetUrl: null, sortOrder: 1, isPublished: true }].slice(0, limit),
  } as unknown as CardContentRepository;
  const capabilities = { getLimit: async (_plan: string, key: string) => key === 'social_link_limit' ? 5 : 10 } as unknown as PlanCapabilityService;
  const result = await new CardService({ repository, content, capabilities, appUrl: 'https://kartunamadigital.id' }).publicCard('arwan-sales');
  assert.equal(result.socialLinks.length, 1); assert.equal(result.catalogItems.length, 1);
  assert.equal(result.whatsappUrl, 'https://wa.me/6281234567890'); assert.equal(result.contact.mapsUrl, 'https://maps.google.com/example');
});
