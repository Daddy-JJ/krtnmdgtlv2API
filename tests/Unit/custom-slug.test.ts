import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomSlugService } from '../../src/modules/cards/services/custom-slug-service.ts';

const slugs = new CustomSlugService();
test('custom slugs normalize lowercase and reject malformed or reserved roots', () => {
  assert.equal(slugs.normalize(' Arwan-Sales '), 'arwan-sales');
  for (const value of ['api', 'Admin', '-bad', 'bad-', 'bad--slug', 'ab', 'favicon.ico']) assert.throws(() => slugs.normalize(value), { code: 'SLUG_INVALID' });
});
test('suggestion follows name plus normalized local phone and includes privacy-safe alternatives', () => {
  const result = slugs.suggest('Arwan Prabowo', '0812-3456-7890');
  assert.equal(result.suggestion, 'ar081234567890');
  assert.equal(result.exposesMobilePhone, true);
  assert.match(result.privacyWarning, /phone number/i);
  assert.equal(result.alternatives.length, 2);
  assert.ok(result.alternatives.every((value) => !value.includes('081234567890')));
});
test('short names and missing phone receive valid randomized fallbacks', () => {
  assert.match(slugs.suggest('É', '').suggestion, /^[a-z]{2}[0-9]{4}$/);
});
