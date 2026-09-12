import assert from 'node:assert/strict';
import test from 'node:test';
import type { StarterCardInput } from '../../src/modules/auth/dto/starter-input.ts';
import type { StarterRepository, StarterTransaction } from '../../src/modules/starter/repositories/starter-repository.ts';
import { StarterService } from '../../src/modules/starter/services/starter-service.ts';
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

const input: StarterCardInput = {
  locale: 'id',
  contact: { fullName: 'Starter QA', jobTitle: '', organization: '', officePhone: '', mobilePhone: '08123456789', email: 'starter@example.test', websiteUrl: '', addressText: '' },
};

function service(repository: StarterRepository, slugs: { generate(): string }): StarterService {
  return new StarterService({
    repository,
    rateLimiter: { consume: async () => true },
    slugs: slugs as StarterSlugGenerator,
    tokens: { issue: () => ({ plaintext: 'manage-token', hash: 'manage-hash' }) },
    csrf: { issue: () => 'csrf-token' },
    accessTokens: {},
    appUrl: 'https://kartunamadigital.id',
  } as unknown as ConstructorParameters<typeof StarterService>[0]);
}

function created(slug: string) {
  return { id: 1, publicId: '7fe91d39-c2a8-4b29-bc1d-b5304c7bfc61', userId: null, slug, planCode: 'starter' as const, themeCode: 'starter-clean', locale: 'id' as const, status: 'published', contact: input.contact };
}

test('Starter allocation retries a checked collision and keeps the second seven-letter slug', async () => {
  const candidates = ['aaaaaaa', 'bBbBbBb'];
  let inserted = '';
  const transaction = {
    slugExists: async (slug: string) => slug === 'aaaaaaa',
    insertStarter: async (value: { slug: string }) => { inserted = value.slug; return created(value.slug); },
  } as unknown as StarterTransaction;
  const repository = { transaction: async <T>(work: (value: StarterTransaction) => Promise<T>) => work(transaction) } as StarterRepository;
  const result = await service(repository, { generate: () => candidates.shift()! }).create(input, 'client');
  assert.equal(result.card.slug, 'bBbBbBb');
  assert.equal(inserted, 'bBbBbBb');
});

test('Starter allocation retries a database unique race and fails safely after ten collisions', async () => {
  let inserts = 0;
  const raceTransaction = {
    slugExists: async () => false,
    insertStarter: async (value: { slug: string }) => {
      inserts += 1;
      if (inserts === 1) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      return created(value.slug);
    },
  } as unknown as StarterTransaction;
  const raceRepository = { transaction: async <T>(work: (value: StarterTransaction) => Promise<T>) => work(raceTransaction) } as StarterRepository;
  assert.equal((await service(raceRepository, { generate: () => 'cCcCcCc' }).create(input, 'client')).card.slug, 'cCcCcCc');
  assert.equal(inserts, 2);

  let attempts = 0;
  const collisionTransaction = { slugExists: async () => { attempts += 1; return true; } } as unknown as StarterTransaction;
  const collisionRepository = { transaction: async <T>(work: (value: StarterTransaction) => Promise<T>) => work(collisionTransaction) } as StarterRepository;
  await assert.rejects(service(collisionRepository, { generate: () => 'dDdDdDd' }).create(input, 'client'), { status: 503, code: 'SERVICE_UNAVAILABLE' });
  assert.equal(attempts, 10);
});
