import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_DATA_RESOURCES } from '../../src/modules/admin-data/resources/admin-data-resources.ts';

type Item = Readonly<{ name: string; item?: readonly Item[]; request?: Readonly<{ method: string; url: Readonly<{ raw: string }> }> }>;

test('generated collection copies are identical and cover CRUD for every application table', async () => {
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
  for (const resource of ADMIN_DATA_RESOURCES) {
    const folder = admin.item.find((entry) => entry.name === resource);
    assert.ok(folder?.item, resource);
    const requests = folder.item.map((entry) => ({ method: entry.request?.method, url: entry.request?.url.raw ?? '' }));
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      assert.ok(requests.some((entry) => entry.method === method && entry.url.includes(`/admin/data/${resource}`)), `${method} ${resource}`);
    }
  }
  assert.equal(admin.item.some((entry) => entry.name === 'schema_migrations'), false);
});
