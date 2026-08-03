import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import jsQrModule from 'jsqr';
import { PNG } from 'pngjs';
import type { RateLimiter } from '../../src/modules/auth/repositories/auth-repository.ts';
import type { CardResponse, CardService } from '../../src/modules/cards/services/card-service.ts';
import { QrCodeRenderingService } from '../../src/modules/rendering/qr/qr-code-rendering-service.ts';
import { QrFileCache } from '../../src/modules/rendering/qr/qr-file-cache.ts';
import { QrcodeRenderer } from '../../src/modules/rendering/qr/qrcode-renderer.ts';

const decodeQr = jsQrModule as unknown as (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const base: CardResponse = { publicId: '7fe91d39-c2a8-4b29-bc1d-b5304c7bfc61', slug: 'aBcDeFg', planCode: 'starter', themeCode: 'starter-clean', locale: 'id', status: 'published', canonicalUrl: 'https://kartunamadigital.id/aBcDeFg', qrImageUrl: '/qr', logoUrl: null, contact: { fullName: 'Arwan', jobTitle: '', organization: '', officePhone: '', mobilePhone: '0812', email: 'a@example.com', websiteUrl: 'https://example.com', addressText: '', mapsUrl: null } };

test('QR PNG decodes to exact canonical URL and content-addressed cache is reused', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knd-qr-test-'));
  let card = base;
  const cards = { publicCard: async () => card } as unknown as CardService;
  const limiter = { consume: async () => true } as RateLimiter;
  let renders = 0;
  const adapter = new QrcodeRenderer();
  const renderer = { renderPng: async (payload: string, options: Parameters<QrcodeRenderer['renderPng']>[1]) => { renders += 1; return adapter.renderPng(payload, options); } };
  const service = new QrCodeRenderingService({ cards, renderer, cache: new QrFileCache(directory), rateLimiter: limiter });
  try {
    const first = await service.get(card.slug, 'client');
    assert.equal(first.cacheHit, false);
    assert.equal(first.png.subarray(1, 4).toString('ascii'), 'PNG');
    const decodedPng = PNG.sync.read(first.png);
    assert.equal(decodeQr(new Uint8ClampedArray(decodedPng.data), decodedPng.width, decodedPng.height)?.data, card.canonicalUrl);
    const second = await service.get(card.slug, 'client');
    assert.equal(second.cacheHit, true);
    assert.equal(second.etag, first.etag);
    assert.equal(renders, 1);
    card = { ...card, slug: 'new-slug', canonicalUrl: 'https://kartunamadigital.id/new-slug' };
    await service.get(card.slug, 'client');
    assert.equal(renders, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('QR rate limit fails before published-card lookup', async () => {
  let lookedUp = false;
  const cards = { publicCard: async () => { lookedUp = true; return base; } } as unknown as CardService;
  const service = new QrCodeRenderingService({ cards, renderer: new QrcodeRenderer(), cache: new QrFileCache('/unused'), rateLimiter: { consume: async () => false } as RateLimiter });
  await assert.rejects(service.get('aBcDeFg', 'client'), { status: 429, code: 'RATE_LIMITED' });
  assert.equal(lookedUp, false);
});
