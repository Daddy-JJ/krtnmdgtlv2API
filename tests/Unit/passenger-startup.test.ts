import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import test from 'node:test';

test('LiteSpeed Passenger bridge is CommonJS and defers the async ESM graph', async () => {
  const source = await readFile(new URL('../../passenger.cjs', import.meta.url), 'utf8');

  assert.match(source, /^'use strict';/);
  assert.match(source, /import\('\.\/src\/server\.ts'\)/);
  assert.match(source, /\.catch\(/);
  assert.doesNotMatch(source, /require\(['"]\.\/src\/server\.ts['"]\)/);
  assert.doesNotMatch(source, /^\s*await\s/m);
});

test('default Passenger app.js is a physical CommonJS dynamic-import bridge', async () => {
  const appUrl = new URL('../../app.js', import.meta.url);
  const metadata = await lstat(appUrl);
  const source = await readFile(appUrl, 'utf8');

  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.match(source, /^'use strict';/);
  assert.match(source, /import\('\.\/src\/server\.ts'\)/);
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /^\s*await\s/m);
});

test('package boundaries keep the Passenger root CommonJS and application code ESM', async () => {
  const readType = async (relativePath: string) => {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return (JSON.parse(source) as { type?: string }).type;
  };

  assert.equal(await readType('../../package.json'), 'commonjs');
  assert.equal(await readType('../../src/package.json'), 'module');
  assert.equal(await readType('../../scripts/package.json'), 'module');
  assert.equal(await readType('../package.json'), 'module');
});
