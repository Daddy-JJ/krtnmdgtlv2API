import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('documentation declares only the current canonical backend workspace', async () => {
  const [readme, development, frontend, recovery] = await Promise.all([
    read('README.md'),
    read('docs/DEVELOPMENT.md'),
    read('docs/FRONTEND-INTEGRATION.md'),
    read('docs/STARTUP-RECOVERY.md'),
  ]);
  const documentation = [readme, development, frontend, recovery].join('\n');

  assert.match(readme, /C:\\xampp\\htdocs\\krtnmdgtlv2API/);
  const obsoleteNestedRoot = new RegExp(`KartuNamaDigital${'-v2'}[\\\\/]backend`, 'i');
  const obsoleteRepository = new RegExp(`KartuNamaDigital${'-API'} repository`, 'i');
  assert.doesNotMatch(documentation, obsoleteNestedRoot);
  assert.doesNotMatch(documentation, obsoleteRepository);
  assert.match(documentation, /http:\/\/127\.0\.0\.1:3000\/api\/v1/);
  assert.match(documentation, /http:\/\/127\.0\.0\.1:8080/);
});

test('development documentation preserves database-test and secret safety rules', async () => {
  const [readme, development, recovery, runner] = await Promise.all([
    read('README.md'),
    read('docs/DEVELOPMENT.md'),
    read('docs/STARTUP-RECOVERY.md'),
    read('scripts/run-database-tests.ts'),
  ]);
  const documentation = [readme, development, recovery].join('\n');

  assert.match(documentation, /_test/);
  assert.match(documentation, /Jangan commit.*\.env|\.env.*tidak boleh di-commit/i);
  assert.match(runner, /testDatabase === productionLikeDatabase/);
  assert.match(runner, /\/_test\$\/i/);
});
