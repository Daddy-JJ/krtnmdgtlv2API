import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

type Item = { item?: Item[]; request?: { method?: string; url?: string | { raw?: string } } };

test('Postman collection covers the deploy-gate CRUD and public contracts', async () => {
  const monorepoCollection = new URL('../../../qa/postman/KartuNamaDigital-API.postman_collection.json', import.meta.url);
  const standaloneCollection = new URL('../../qa/postman/KartuNamaDigital-API.postman_collection.json', import.meta.url);
  const collectionUrl = existsSync(monorepoCollection) ? monorepoCollection : standaloneCollection;
  const collection = JSON.parse(await readFile(collectionUrl, 'utf8')) as { item: Item[] };
  const requests: Array<{ method: string; url: string }> = [];
  const visit = (items: Item[]) => items.forEach((item) => {
    if (item.request) requests.push({
      method: String(item.request.method ?? '').toUpperCase(),
      url: typeof item.request.url === 'string' ? item.request.url : String(item.request.url?.raw ?? ''),
    });
    if (item.item) visit(item.item);
  });
  visit(collection.item);

  const required = [
    ['GET', '/health'], ['POST', '/auth/register'], ['POST', '/auth/login'], ['GET', '/me'],
    ['GET', '/cards'], ['POST', '/cards'], ['GET', '/cards/{{cardPublicId}}'],
    ['PUT', '/cards/{{cardPublicId}}'], ['DELETE', '/cards/{{cardPublicId}}'],
    ['GET', '/social-links'], ['POST', '/social-links'], ['PUT', '/social-links/{{socialLinkId}}'], ['DELETE', '/social-links/{{socialLinkId}}'],
    ['GET', '/catalog-items'], ['POST', '/catalog-items'], ['PUT', '/catalog-items/{{catalogItemId}}'], ['DELETE', '/catalog-items/{{catalogItemId}}'],
    ['GET', '/public/cards/{{publicSlug}}'], ['GET', '/qr'], ['GET', '/vcard'],
    ['POST', '/payments/checkout'], ['GET', '/payments'], ['GET', '/subscriptions/current'],
  ] as const;

  for (const [method, suffix] of required) {
    assert.ok(requests.some((request) => request.method === method && request.url.endsWith(suffix)), `missing ${method} *${suffix}`);
  }
});
