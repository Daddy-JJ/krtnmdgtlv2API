import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('database migrations preserve the locked integrity and indexing baseline', async () => {
  const [initial, rateLimits, activeCard, annualTerm, pool] = await Promise.all([
    read('database/migrations/001_initial_schema.sql'),
    read('database/migrations/002_auth_rate_limits.sql'),
    read('database/migrations/003_active_card_uniqueness.sql'),
    read('database/migrations/005_annual_subscription_term.sql'),
    read('src/shared/database/pool.ts'),
  ]);
  const tables = [
    'users', 'plans', 'plan_features', 'themes', 'plan_theme_access', 'subscriptions',
    'cards', 'card_contacts', 'starter_manage_tokens', 'refresh_tokens', 'password_reset_tokens',
    'email_otps', 'card_social_links', 'catalog_items', 'payments', 'payment_events',
    'mail_outbox', 'mail_delivery_logs', 'activity_logs',
  ];

  for (const table of tables) assert.match(initial, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
  assert.equal((initial.match(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/g) ?? []).length, tables.length);
  assert.match(initial, /slug VARCHAR\(100\) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE/);
  assert.match(initial, /UNIQUE KEY uq_plan_feature \(plan_id, feature_key\)/);
  assert.match(initial, /UNIQUE KEY uq_plan_theme \(plan_id, theme_id\)/);
  assert.match(initial, /UNIQUE KEY gateway_event_key|gateway_event_key VARCHAR\(190\) NOT NULL UNIQUE/);
  assert.match(initial, /KEY idx_mail_outbox_worker \(status, available_at, priority\)/);
  assert.match(rateLimits, /bucket_hash CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(rateLimits, /KEY idx_auth_rate_expiry \(expires_at\)/);
  assert.match(activeCard, /GENERATED ALWAYS AS/);
  assert.match(activeCard, /ADD UNIQUE KEY uq_cards_active_user \(active_user_id\)/);
  assert.match(annualTerm,/duration_days=365/);
  assert.match(annualTerm,/code IN \('basic','pro'\)/);
  assert.match(pool, /timezone:\s*'Z'/);
  assert.match(pool, /SET time_zone = '\+00:00'/);
});

test('standalone deployment keeps every seed inside its repository', async () => {
  const [seedScript, plans, themes] = await Promise.all([
    read('scripts/seed.ts'),
    read('database/seeders/001_plans_and_features.sql'),
    read('database/seeders/002_card_themes.sql'),
  ]);

  assert.doesNotMatch(seedScript, /\.\.\/\.\.\/database\/seeds/);
  assert.match(plans, /'starter'/);
  assert.match(plans, /'basic'/);
  assert.match(plans, /'pro'/);
  assert.match(themes, /starter-clean/);
  assert.match(themes, /pro-vertical-modern-dark/);
});

test('business modules retain repository interfaces and MySQL adapter boundaries', async () => {
  const pairs = [
    ['src/modules/account/repositories/account-repository.ts', 'src/modules/account/repositories/mysql-account-repository.ts'],
    ['src/modules/auth/repositories/auth-repository.ts', 'src/modules/auth/repositories/mysql-auth-repository.ts'],
    ['src/modules/starter/repositories/starter-repository.ts', 'src/modules/starter/repositories/mysql-starter-repository.ts'],
    ['src/modules/cards/repositories/card-repository.ts', 'src/modules/cards/repositories/mysql-card-repository.ts'],
    ['src/modules/card-content/repositories/card-content-repository.ts', 'src/modules/card-content/repositories/mysql-card-content-repository.ts'],
    ['src/modules/payments/repositories/payment-repository.ts', 'src/modules/payments/repositories/mysql-payment-repository.ts'],
    ['src/modules/plans/repositories/plan-catalog-repository.ts', 'src/modules/plans/repositories/mysql-plan-catalog-repository.ts'],
    ['src/modules/admin/repositories/admin-repository.ts', 'src/modules/admin/repositories/mysql-admin-repository.ts'],
  ] as const;

  for (const [contractPath, adapterPath] of pairs) {
    const [contract, adapter] = await Promise.all([read(contractPath), read(adapterPath)]);
    assert.match(contract, /export interface /, contractPath);
    assert.match(adapter, /export class MySql/, adapterPath);
    assert.doesNotMatch(adapter, /\.query\s*\(/, `${adapterPath} must use prepared execute()`);
  }
});

test('owner-managed card aggregates expose complete scoped CRUD routes', async () => {
  const [cards, content] = await Promise.all([
    read('src/modules/cards/routes/card-router.ts'),
    read('src/modules/card-content/routes/card-content-router.ts'),
  ]);

  for (const route of [
    "router.get('/', controller.list)", "router.post('/', controller.create)",
    "router.get('/:publicId', controller.get)", "router.put('/:publicId', controller.update)",
    "router.delete('/:publicId', controller.delete)",
  ]) assert.ok(cards.includes(route), `missing card route: ${route}`);

  for (const route of [
    "r.get('/:publicId/social-links'", "r.post('/:publicId/social-links'",
    "r.put('/:publicId/social-links/:linkId'", "r.delete('/:publicId/social-links/:linkId'",
    "r.get('/:publicId/catalog-items'", "r.post('/:publicId/catalog-items'",
    "r.put('/:publicId/catalog-items/:itemId'", "r.delete('/:publicId/catalog-items/:itemId'",
  ]) assert.ok(content.includes(route), `missing card-content route: ${route}`);
});
