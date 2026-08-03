import assert from 'node:assert/strict';
import test from 'node:test';
import { StarterSlugGenerator } from '../../src/modules/starter/services/starter-slug-generator.ts';

test('Starter slug generator emits only seven case-sensitive ASCII letters', () => {
  const generator = new StarterSlugGenerator();
  const values = new Set<string>();
  let hasUppercase = false;
  let hasLowercase = false;
  for (let index = 0; index < 1000; index += 1) {
    const slug = generator.generate();
    assert.match(slug, /^[a-zA-Z]{7}$/);
    hasUppercase ||= /[A-Z]/.test(slug);
    hasLowercase ||= /[a-z]/.test(slug);
    values.add(slug);
  }
  assert.equal(hasUppercase, true);
  assert.equal(hasLowercase, true);
  assert.ok(values.size > 990);
});
