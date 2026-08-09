import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('LiteSpeed Passenger bridge is CommonJS and defers the async ESM graph', async () => {
  const source = await readFile(new URL('../../passenger.cjs', import.meta.url), 'utf8');

  assert.match(source, /^'use strict';/);
  assert.match(source, /import\('\.\/src\/server\.ts'\)/);
  assert.match(source, /\.catch\(/);
  assert.doesNotMatch(source, /require\(['"]\.\/src\/server\.ts['"]\)/);
  assert.doesNotMatch(source, /^\s*await\s/m);
});
