import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_DATA_RESOURCES } from '../../src/modules/admin-data/resources/admin-data-resources.ts';

type Item = Readonly<{ name: string; item?: readonly Item[]; request?: Readonly<{ method: string; url: Readonly<{ raw: string }> }> }>;

test('generated collection copies cover every administrative table and enforce read-only exceptions', async () => {
  const [rootSource, docsSource] = await Promise.all([
    readFile(new URL('../../collection.json', import.meta.url), 'utf8'),
    readFile(new URL('../../docs/collection.json', import.meta.url), 'utf8'),
  ]);
  assert.equal(docsSource, rootSource);
  const collection = JSON.parse(rootSource) as {
    variable: Array<{ key: string; value: string }>;
    item: Item[];
  };
  assert.equal(collection.variable.find((entry) => entry.key === 'baseUrl')?.value, 'http://127.0.0.1:3000/api/v1');
  const admin = collection.item.find((entry) => entry.name === 'Administrative Data CRUD');
  assert.ok(admin?.item);
  const operations = collection.item.find((entry) => entry.name === 'Super Admin Operations');
  assert.ok(operations?.item);
  const operationRequests = operations.item.map((entry) => ({ method: entry.request?.method, url: entry.request?.url.raw ?? '' }));
  for (const [method, path] of [
    ['GET', '/admin/feedback'],
    ['PATCH', '/admin/feedback/{{feedbackPublicId}}/status'],
    ['GET', '/admin/cards/{{adminCardPublicId}}'],
    ['POST', '/admin/cards/{{adminCardPublicId}}/interventions'],
    ['GET', '/admin/reports'],
    ['GET', '/admin/system'],
    ['GET', '/admin/security'],
  ] as const) {
    assert.ok(operationRequests.some((entry) => entry.method === method && entry.url.includes(path)), `${method} ${path}`);
  }
  for (const resource of ADMIN_DATA_RESOURCES) {
    const folder: Item | undefined = admin.item.find((entry: Item) => entry.name === resource);
    assert.ok(folder?.item, resource);
    const requests: Array<{ method: string | undefined; url: string }> = folder.item.map((entry: Item) => ({ method: entry.request?.method, url: entry.request?.url.raw ?? '' }));
    const expectedMethods = ['GET'];
    for (const method of expectedMethods) {
      assert.ok(requests.some((entry: { method: string | undefined; url: string }) => entry.method === method && entry.url.includes(`/admin/data/${resource}`)), `${method} ${resource}`);
    }
    {
      assert.equal(requests.some((entry: { method: string | undefined; url: string }) => ['POST', 'PUT', 'DELETE'].includes(String(entry.method))), false);
    }
  }
  assert.equal(admin.item.some((entry) => entry.name === 'schema_migrations'), false);
});
