import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { MySqlAccountRepository } from '../../src/modules/account/repositories/mysql-account-repository.ts';
import { MySqlCardRepository } from '../../src/modules/cards/repositories/mysql-card-repository.ts';
import { CardService } from '../../src/modules/cards/services/card-service.ts';
import { MySqlStarterRepository } from '../../src/modules/starter/repositories/mysql-starter-repository.ts';
import { StarterEmailToken } from '../../src/modules/starter/services/starter-email-token.ts';
import { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import { StarterSlugGenerator } from '../../src/modules/starter/services/starter-slug-generator.ts';
import { loadMigrationFile } from '../../src/shared/database/migration-file.ts';
import { splitSqlStatements } from '../../src/shared/database/sql-statement-splitter.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';
import { OpaqueTokenService, type IssuedOpaqueToken } from '../../src/shared/security/opaque-token.ts';

type FixtureUser = { id: number; publicId: string; email: string };
type FixtureCard = {
  id: number; publicId: string; slug: string; email: string;
  owner: FixtureUser | null; manage: IssuedOpaqueToken;
};

// Caller supplies the migrated/seeded isolated server and owns its teardown.
// Importing this helper opens no connection and registers no database tests.
export async function verifyLegacyCardEmailCompatibility(pool: Pool): Promise<void> {
  const [target] = await pool.query<RowDataPacket[]>('SELECT DATABASE() AS name');
  assert.ok(typeof target[0]?.name === 'string' && /_test$/i.test(target[0].name),
    'An explicit isolated _test database is required');

  const prefix = `legacy-${randomUUID().replaceAll('-', '')}`;
  const address = (label: string) => `${prefix}.${label}@example.test`;
  const input = (email: string) => ({
    locale: 'id' as const,
    contact: { fullName: 'Synthetic Fixture', jobTitle: '', organization: '', officePhone: '',
      mobilePhone: '', email, websiteUrl: '', addressText: '' },
  });
  const rows = async (sql: string, values: Array<string | number> = []) =>
    (await pool.execute<RowDataPacket[]>(sql, values))[0];
  const count = async (sql: string, values: Array<string | number> = []) =>
    Number((await rows(sql, values))[0]!.n);
  const same = (actual: unknown, expected: unknown, message: string) =>
    assert.ok(isDeepStrictEqual(actual, expected), message); // Never dump rows or credentials.
  const unchangedRows = async () => {
    const [cards, contacts, owners, tokens, identities] = await Promise.all([
      rows('SELECT * FROM cards ORDER BY id'),
      rows('SELECT * FROM card_contacts ORDER BY id'),
      rows('SELECT * FROM users ORDER BY id'),
      rows('SELECT * FROM starter_manage_tokens ORDER BY id'),
      rows('SELECT * FROM card_email_identities ORDER BY email'),
    ]);
    return { cards, contacts, owners, tokens, identities };
  };
  const holds = () => rows('SELECT HEX(email) AS email_key,created_at FROM card_email_legacy_holds ORDER BY email');
  const emailKey = (email: string) => Buffer.from(email.trim().toLowerCase()).toString('hex').toUpperCase();
  async function expectedHoldKeys(): Promise<string[]> {
    const [previous, sources] = await Promise.all([
      holds(),
      rows(`SELECT cc.email FROM cards c JOIN card_contacts cc ON cc.card_id=c.id WHERE c.registration_email IS NULL
        UNION ALL SELECT u.email FROM cards c JOIN users u ON u.id=c.user_id WHERE c.registration_email IS NULL`),
    ]);
    // Independent JS oracle: SQL TRIM alone does not remove tabs, NBSP or FEFF.
    const normalized = sources.map(row => String(row.email).trim().toLowerCase())
      .filter(email => Buffer.byteLength(email) >= 1 && Buffer.byteLength(email) <= 254);
    return [...new Set([...previous.map(row => String(row.email_key)), ...normalized.map(emailKey)])].sort();
  }
  async function verifiedUser(email: string): Promise<FixtureUser> {
    const publicId = randomUUID();
    const [user] = await pool.execute<ResultSetHeader>(`INSERT INTO users
      (public_id,email,password_hash,role,status,email_verified_at,created_at,updated_at)
      VALUES (?,?,'disabled-synthetic-credential','member','active',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
    [publicId, email]);
    const [grant] = await pool.execute<ResultSetHeader>(`INSERT INTO user_roles(user_id,role_id,granted_at)
      SELECT ?,id,UTC_TIMESTAMP() FROM roles WHERE code='member'`, [user.insertId]);
    assert.equal(grant.affectedRows, 1, 'Synthetic account requires a canonical member role');
    return { id: user.insertId, publicId, email };
  }

  const groupSizes = [13, 3, 3, 3, 2, 2, 2];
  const contactEmails = groupSizes.map((_, index) => address(`contact-${index}+legacy`));
  const owners: FixtureUser[] = [];
  for (let index = 0; index < 4; index++) owners.push(await verifiedUser(address(`owner-${index}`)));
  const tokens = new OpaqueTokenService();
  const fixture: FixtureCard[] = [];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [themes] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM themes WHERE code='starter-clean' AND is_active=1 LIMIT 1");
    assert.equal(themes.length, 1, 'Seeded Starter theme is required');
    for (const [group, size] of groupSizes.entries()) {
      for (let index = 0; index < size; index++) {
        const email = contactEmails[group]!;
        const owner = group < 2 && index < 2 ? owners[group * 2 + index]! : null;
        const publicId = randomUUID(), slug = `${prefix}-${group}-${index}`;
        // Generate usable opaque credentials BEFORE the migration snapshots.
        const manage = tokens.issue();
        const [card] = await connection.execute<ResultSetHeader>(`INSERT INTO cards
          (public_id,user_id,slug,slug_kind,plan_code,theme_id,locale,status,published_at,registration_email,created_at,updated_at)
          VALUES (?,?,?,'random','starter',?,'id','published',UTC_TIMESTAMP(),NULL,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [publicId, owner?.id ?? null, slug, themes[0]!.id]);
        await connection.execute(`INSERT INTO card_contacts
          (card_id,full_name,job_title,organization,office_phone,mobile_phone,email,website_url,address_text,maps_url,created_at,updated_at)
          VALUES (?,'Synthetic Fixture','','','','',?,'','',NULL,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [card.insertId, index % 2 ? ` ${email.toUpperCase()} ` : email]);
        await connection.execute('INSERT INTO starter_manage_tokens(card_id,token_hash,created_at) VALUES (?,?,UTC_TIMESTAMP())',
          [card.insertId, manage.hash]);
        fixture.push({ id: card.insertId, publicId, slug, email, owner, manage });
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const ids = fixture.map(card => card.id);
  const placeholders = ids.map(() => '?').join(',');
  const legacyRows = () => rows(`SELECT * FROM cards WHERE id IN (${placeholders}) ORDER BY id`, ids);
  const owned = fixture.find(card => card.owner !== null)!;
  const unmanaged = fixture.find(card => card.email === contactEmails[2] && card.owner === null)!;
  const expectedFixtureKeys = [...contactEmails, ...owners.map(owner => owner.email)].map(emailKey).sort();

  let sent = 0, issued = 0;
  const issue = tokens.issue.bind(tokens);
  tokens.issue = () => { issued++; return issue(); };
  const csrf = new CsrfTokenService('synthetic-legacy-csrf-secret-'.repeat(3));
  const sessionId = 'synthetic-legacy-session';
  const starter = new StarterService({
    repository: new MySqlStarterRepository(pool), tokens, csrf, slugs: new StarterSlugGenerator(),
    rateLimiter: { consume: async () => true }, appUrl: 'https://example.test',
    accessTokens: { verify: (sub: string) => ({ sub, sid: sessionId }) } as Rs256AccessTokenService,
    email: { tokens: new StarterEmailToken('synthetic-legacy-email-secret-'.repeat(3)),
      sendManagement: async () => { sent++; } },
  });
  const cards = new CardService({ repository: new MySqlCardRepository(pool), appUrl: 'https://example.test' });
  const accounts = new MySqlAccountRepository(pool);
  const effects = async () => ({
    cards: await count('SELECT COUNT(*) AS n FROM cards'),
    credentials: await count('SELECT COUNT(*) AS n FROM starter_manage_tokens'),
    identities: await count('SELECT COUNT(*) AS n FROM card_email_identities'),
    issued, sent,
  });
  const duplicate = (error: unknown) => {
    assert.ok(error instanceof AppError, 'Expected a controlled duplicate-email error');
    assert.equal(error.status, 409);
    assert.equal(error.code, 'STARTER_EMAIL_ALREADY_EXISTS');
    assert.equal(error.details, null);
    return true;
  };
  async function blocked(emails: string[], label: string): Promise<void> {
    const before = await effects();
    for (const [index, email] of emails.entries()) {
      await assert.rejects(starter.create(input(email), `${label}-${index}`), duplicate);
    }
    same(await effects(), before, 'Blocked creation must issue no credentials, rows or email');
  }
  const migration = await loadMigrationFile(new URL('../../database/migrations/015_legacy_card_email_holds.sql', import.meta.url));
  const applyHolds = async () => {
    for (const statement of splitSqlStatements(migration.upSql)) await pool.query(statement);
  };

  await test('legacy fixture: seven groups, 28 published NULL identities, 24 unowned and four verified owners', async () => {
    const before = await legacyRows();
    assert.equal(before.length, 28);
    assert.equal(before.filter(card => card.user_id === null).length, 24);
    assert.equal(before.filter(card => card.user_id !== null).length, 4);
    assert.ok(before.every(card => card.status === 'published' && card.registration_email === null && card.deleted_at === null));
    const groups = await rows(`SELECT HEX(BINARY LOWER(TRIM(cc.email))) AS email_key,COUNT(*) AS n,
      SUM(c.user_id IS NOT NULL) AS owned FROM cards c JOIN card_contacts cc ON cc.card_id=c.id
      WHERE c.id IN (${placeholders}) GROUP BY BINARY LOWER(TRIM(cc.email)) ORDER BY email_key`, ids);
    assert.deepEqual(groups.map(group => Number(group.n)), groupSizes);
    assert.deepEqual(groups.map(group => Number(group.owned)), [2, 2, 0, 0, 0, 0, 0]);
    assert.equal(new Set(owners.map(owner => owner.id)).size, 4);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM users WHERE id IN (?,?,?,?) AND email_verified_at IS NOT NULL`,
      owners.map(owner => owner.id)), 4);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM starter_manage_tokens WHERE card_id IN (${placeholders}) AND revoked_at IS NULL`, ids), 28);
    const persisted = await rows(`SELECT card_id,token_hash FROM starter_manage_tokens WHERE card_id IN (${placeholders})`, ids);
    assert.ok(fixture.every(card => tokens.hash(card.manage.plaintext) === card.manage.hash
      && persisted.some(token => token.card_id === card.id && token.token_hash === card.manage.hash)),
    'Every synthetic management credential must match its stored opaque hash');
  });

  await test('migration 015 preserves existing rows and records seven contact plus four owner holds without a winner', async () => {
    const before = await unchangedRows();
    const previousHolds = await holds();
    const expected = await expectedHoldKeys();
    await applyHolds();
    same(await unchangedRows(), before, 'Migration must preserve every card, contact, owner, token and identity row');
    const after = await holds();
    same(after.map(row => String(row.email_key)).sort(), expected, 'Migration must hold exactly the normalized legacy source keys');
    same(after.filter(row => expectedFixtureKeys.includes(String(row.email_key))).map(row => String(row.email_key)).sort(),
      expectedFixtureKeys, 'Fixture must contribute exactly 11 distinct hold keys');
    same(after.filter(row => previousHolds.some(old => old.email_key === row.email_key)), previousHolds,
      'Existing hold timestamps must remain unchanged');
    assert.ok((await legacyRows()).every(card => card.registration_email === null));
    assert.equal(await count(`SELECT COUNT(*) AS n FROM card_email_identities WHERE card_id IN (${placeholders})`, ids), 0);
  });

  await test('migration 015 is snapshot-idempotent with no duplicate holds or credentials', async () => {
    const before = { data: await unchangedRows(), holds: await holds() };
    await applyHolds();
    same({ data: await unchangedRows(), holds: await holds() }, before, 'Repeated migration must preserve the entire snapshot');
  });

  await test('eight concurrent case/space legacy creates all return 409 without issuing credentials or email', async () => {
    const before = { data: await unchangedRows(), holds: await holds(), effects: await effects() };
    const email = contactEmails[0]!;
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      starter.create(input(index % 2 ? ` ${email.toUpperCase()} ` : email), `held-race-${index}`)));
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 0);
    for (const outcome of outcomes) {
      assert.equal(outcome.status, 'rejected');
      if (outcome.status === 'rejected') duplicate(outcome.reason);
    }
    same({ data: await unchangedRows(), holds: await holds(), effects: await effects() }, before,
      'Held legacy races must leave no reservation, credential, email or row mutation');
    await blocked([...contactEmails, ...owners.map(owner => owner.email)], 'all-legacy-keys');
  });

  const freshEmail = address('fresh');
  let fresh: Awaited<ReturnType<StarterService['create']>> | undefined;
  await test('unrelated fresh Starter creation succeeds while all 28 legacy identities remain NULL', async () => {
    const before = await effects();
    const legacy = await legacyRows();
    fresh = await starter.create(input(freshEmail), 'fresh-alongside-legacy');
    assert.equal(fresh.card.status, 'published');
    assert.equal(fresh.card.emailSent, true);
    assert.ok(fresh.manageToken.length > 0 && fresh.csrfToken.length > 0);
    const created = await rows('SELECT id,registration_email FROM cards WHERE public_id=?', [fresh.card.publicId]);
    assert.ok(created[0]?.registration_email?.toString() === freshEmail, 'Fresh identity must be normalized and stored');
    assert.equal(await count('SELECT COUNT(*) AS n FROM starter_manage_tokens WHERE card_id=? AND token_hash=? AND revoked_at IS NULL',
      [created[0]!.id, tokens.hash(fresh.manageToken)]), 1);
    same(await effects(), { cards: before.cards + 1, credentials: before.credentials + 1,
      identities: before.identities + 1, issued: before.issued + 1, sent: before.sent + 1 }, 'Only the fresh creation may issue credentials and mock email');
    same(await legacyRows(), legacy, 'Fresh creation must not depend on a legacy identity backfill');
  });

  await test('eight concurrent fresh case/space creates have exactly one winner alongside NULL legacy cards', async () => {
    const before = await effects();
    const email = address('fresh-race');
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      starter.create(input(index % 2 ? ` ${email.toUpperCase()} ` : email), `fresh-race-${index}`)));
    const successes = outcomes.filter(outcome => outcome.status === 'fulfilled');
    assert.equal(successes.length, 1);
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 7);
    for (const outcome of outcomes) if (outcome.status === 'rejected') duplicate(outcome.reason);
    same(await effects(), { cards: before.cards + 1, credentials: before.credentials + 1,
      identities: before.identities + 1, issued: before.issued + 1, sent: before.sent + 1 }, 'Only one fresh race winner may issue credentials and mock email');
    assert.equal(await count('SELECT COUNT(*) AS n FROM cards WHERE registration_email=?', [email]), 1);
    assert.ok((await legacyRows()).every(card => card.registration_email === null));
  });

  for (const [label, email] of [
    ['dots', contactEmails[0]!.replace('.contact-', 'contact-')],
    ['plus tags', contactEmails[0]!.replace('+legacy', '')],
  ] as const) {
    await test(`normalization keeps ${label} distinct from a held legacy contact`, async () => {
      const before = await effects();
      const created = await starter.create(input(email), `distinct-${label}`);
      assert.equal(created.card.status, 'published');
      assert.ok(created.card.contact.email === email, 'Distinct address must be retained');
      assert.equal(issued, before.issued + 1);
      assert.equal(sent, before.sent + 1);
      await blocked([` ${email.toUpperCase()} `], 'normalized-distinct-duplicate');
    });
  }

  await test('published legacy cards remain publicly readable with or without an owner', async () => {
    for (const legacy of [owned, unmanaged]) {
      const published = await cards.publicCard(legacy.slug);
      assert.ok(published.publicId === legacy.publicId && published.contact.email.trim().toLowerCase() === legacy.email,
        'Public read must retain the legacy card and display contact');
      assert.equal(published.status, 'published');
    }
  });

  const matching = await verifiedUser(unmanaged.email);
  const wrong = await verifiedUser(address('wrong-account'));
  const manageCsrf = csrf.issue(`starter:${unmanaged.manage.hash}`);
  await test('valid management signup/claim requires identity review even for a matching verified contact account', async () => {
    const before = await unchangedRows();
    await assert.rejects(starter.signupContext(unmanaged.publicId, unmanaged.manage.plaintext),
      { status: 409, code: 'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED' });
    for (const account of [matching, wrong]) {
      await assert.rejects(starter.claim(unmanaged.publicId, unmanaged.manage.plaintext, manageCsrf, account.publicId),
        { status: 409, code: 'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED' });
    }
    await assert.rejects(starter.update(unmanaged.publicId, unmanaged.manage.plaintext, manageCsrf, input(wrong.email)),
      { status: 403, code: 'STARTER_CLAIM_REQUIRED' });
    for (const legacy of [unmanaged, owned]) {
      await assert.rejects(cards.update(wrong.publicId, legacy.publicId, input(wrong.email)),
        { status: 404, code: 'CARD_NOT_FOUND' });
    }
    same(await unchangedRows(), before, 'Valid legacy credentials must not assign ownership or mutate credentials');
  });

  await test('mutable contact email cannot become signup, ownership or recovery identity for a NULL legacy card', async () => {
    // Simulate historical mutable display data, without approving an identity mapping.
    await pool.execute('UPDATE card_contacts SET email=? WHERE card_id=?', [wrong.email, unmanaged.id]);
    const before = await unchangedRows();
    await assert.rejects(starter.signupContext(unmanaged.publicId, unmanaged.manage.plaintext),
      { status: 409, code: 'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED' });
    await assert.rejects(starter.claim(unmanaged.publicId, unmanaged.manage.plaintext, manageCsrf, wrong.publicId),
      { status: 409, code: 'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED' });
    await assert.rejects(cards.update(wrong.publicId, unmanaged.publicId, input(wrong.email)),
      { status: 404, code: 'CARD_NOT_FOUND' });
    for (const account of [matching, wrong]) {
      const candidates = await starter.listCandidates(account.publicId);
      assert.equal(candidates.items.length, 0);
      assert.equal(candidates.hasMore, false);
      await assert.rejects(starter.claimCandidate(unmanaged.publicId, account.publicId, csrf.issue(sessionId)),
        { status: 404, code: 'STARTER_NOT_ELIGIBLE' });
    }
    same(await unchangedRows(), before, 'Listing and attempted recovery must not auto-claim or change NULL legacy identity');
    await blocked([unmanaged.email], 'original-contact-after-mutable-edit');
  });

  const editedContact = address('edited-contact'), alias = address('owner-alias');
  async function verifyOwnerEmail(email: string): Promise<void> {
    // Synthetic confirmation only; account changes require fresh verification.
    const [verified] = await pool.execute<ResultSetHeader>(
      'UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE public_id=? AND email=?', [owned.owner!.publicId, email]);
    assert.equal(verified.affectedRows, 1);
  }
  await test('existing legacy owner can edit contact and change account email without assigning registration identity', async () => {
    const owner = owned.owner!;
    const updated = await cards.update(owner.publicId, owned.publicId, input(editedContact));
    assert.ok(updated.contact.email === editedContact, 'Owner contact edit must succeed');
    await blocked([owned.email, owner.email], 'after-owner-contact-edit');
    const profile = await accounts.updateEmail(owner.publicId, alias, 'disabled-synthetic-credential', new Date());
    assert.ok(profile !== null && profile !== 'email_taken', 'Legacy owner account email change must succeed');
    assert.ok(profile.email === alias && profile.emailVerifiedAt === null, 'Fresh alias must require verification');
    const [legacy] = await rows('SELECT user_id,registration_email FROM cards WHERE id=?', [owned.id]);
    assert.ok(legacy?.user_id === owner.id && legacy.registration_email === null,
      'Owner alias must not infer original registration identity');
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_identities WHERE email IN (?,?) AND card_id=?',
      [owner.email, alias, owned.id]), 2, 'The verified old owner email and fresh alias must both stay bound to this card');
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_identities WHERE email=? AND card_id=?', [alias, owned.id]), 1);
    await blocked([owned.email, owner.email, alias], 'after-owner-alias');
  });

  await test('legacy owner cannot select a new alias targeting another held legacy email', async () => {
    await verifyOwnerEmail(alias);
    const held = contactEmails[4]!;
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_identities WHERE email=?', [held]), 0);
    const before = { data: await unchangedRows(), holds: await holds(), effects: await effects() };
    await assert.rejects(accounts.updateEmail(owned.owner!.publicId, held, 'disabled-synthetic-credential', new Date()), duplicate);
    same({ data: await unchangedRows(), holds: await holds(), effects: await effects() }, before,
      'A rejected new held alias must atomically preserve the current email, verification and reservations');
  });

  await test('verified legacy owner email can roundtrip through a held same-card alias while registration remains NULL', async () => {
    const owner = owned.owner!;
    await verifyOwnerEmail(alias);
    const before = await effects();
    const restored = await accounts.updateEmail(owner.publicId, owner.email, 'disabled-synthetic-credential', new Date());
    assert.ok(restored !== null && restored !== 'email_taken', 'Returning to a held same-card owner alias must succeed');
    assert.ok(restored.email === owner.email && restored.emailVerifiedAt === null, 'Restored alias requires verification');
    await verifyOwnerEmail(owner.email);
    const repeated = await accounts.updateEmail(owner.publicId, alias, 'disabled-synthetic-credential', new Date());
    assert.ok(repeated !== null && repeated !== 'email_taken', 'Reusing the fresh same-card alias must succeed');
    assert.ok(repeated.email === alias && repeated.emailVerifiedAt === null);
    const [legacy] = await rows('SELECT user_id,registration_email FROM cards WHERE id=?', [owned.id]);
    assert.ok(legacy?.user_id === owner.id && legacy.registration_email === null,
      'Alias roundtrips must never approve a legacy registration identity');
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_identities WHERE email IN (?,?) AND card_id=?',
      [owner.email, alias, owned.id]), 2);
    same(await effects(), before, 'Same-card alias replay must not duplicate credentials or reservations, or send email');
    await blocked([owned.email, owner.email, alias], 'after-owner-roundtrip');
  });

  await test('deleting legacy owner card retains old contact, owner snapshot and alias exclusions', async () => {
    const owner = owned.owner!;
    await verifyOwnerEmail(alias);
    await cards.delete(owner.publicId, owned.publicId);
    const [deleted] = await rows('SELECT status,deleted_at,registration_email,user_id FROM cards WHERE id=?', [owned.id]);
    assert.ok(deleted?.status === 'deleted' && deleted.deleted_at !== null && deleted.registration_email === null
      && deleted.user_id === owner.id, 'Deletion must preserve legacy identity and ownership history');
    await assert.rejects(cards.publicCard(owned.slug), { status: 404, code: 'CARD_NOT_FOUND' });
    await blocked([owned.email, owner.email, alias], 'after-legacy-delete');
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_legacy_holds WHERE email IN (?,?)', [owned.email, owner.email]), 2);
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_identities WHERE email=? AND card_id=?', [alias, owned.id]), 1);
  });

  await test('modern identity recovery requires explicit confirmation and revokes management credentials once', async () => {
    assert.ok(fresh, 'Fresh Starter fixture is required');
    const account = await verifiedUser(freshEmail);
    const before = await unchangedRows();
    const candidates = await starter.listCandidates(account.publicId);
    assert.equal(candidates.items.length, 1);
    assert.ok(candidates.items[0]!.publicId === fresh.card.publicId, 'Only the original stored identity is recoverable');
    same(await unchangedRows(), before, 'Candidate listing must not assign ownership');
    const confirmed = await starter.claimCandidate(fresh.card.publicId, account.publicId, csrf.issue(sessionId));
    assert.equal(confirmed.alreadyOwned, false);
    const repeated = await starter.claimCandidate(fresh.card.publicId, account.publicId, csrf.issue(sessionId));
    assert.equal(repeated.alreadyOwned, true);
    await assert.rejects(starter.signupContext(fresh.card.publicId, fresh.manageToken),
      { status: 401, code: 'STARTER_TOKEN_INVALID' });
    assert.equal(await count(`SELECT COUNT(*) AS n FROM activity_logs
      WHERE card_id=(SELECT id FROM cards WHERE public_id=?) AND event='starter.claim-confirmed-by-verified-email'`, [fresh.card.publicId]), 1);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM starter_manage_tokens
      WHERE card_id=(SELECT id FROM cards WHERE public_id=?) AND revoked_at IS NULL`, [fresh.card.publicId]), 0);
    const legacy = await legacyRows();
    assert.equal(legacy.filter(card => card.user_id === null).length, 24);
    assert.ok(legacy.every(card => card.registration_email === null), 'No legacy card may be silently mapped by recovery');
  });

  await test('separate legacy whitespace fixture holds JS-trimmed tab, NBSP and FEFF contact and owner emails', async () => {
    const email = address('whitespace-contact'), ownerEmail = address('whitespace-owner');
    const padding = '\t\u00a0\ufeff';
    const padded = `${padding}${email.toUpperCase()}${padding}`;
    const owner = await verifiedUser(`${padding}${ownerEmail.toUpperCase()}${padding}`);
    const manage = new OpaqueTokenService().issue();
    const publicId = randomUUID(), slug = `${prefix}-whitespace`;
    const c = await pool.getConnection();
    let cardId: number;
    try {
      await c.beginTransaction();
      const [card] = await c.execute<ResultSetHeader>(`INSERT INTO cards
        (public_id,user_id,slug,slug_kind,plan_code,theme_id,locale,status,published_at,registration_email,created_at,updated_at)
        SELECT ?,?,?,'random','starter',theme_id,'id','published',UTC_TIMESTAMP(),NULL,UTC_TIMESTAMP(),UTC_TIMESTAMP()
        FROM cards WHERE id=?`, [publicId, owner.id, slug, owned.id]);
      assert.equal(card.affectedRows, 1);
      cardId = card.insertId;
      await c.execute(`INSERT INTO card_contacts
        (card_id,full_name,job_title,organization,office_phone,mobile_phone,email,website_url,address_text,maps_url,created_at,updated_at)
        VALUES (?,'Synthetic Whitespace Fixture','','','','',?,'','',NULL,UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [cardId, padded]);
      await c.execute('INSERT INTO starter_manage_tokens(card_id,token_hash,created_at) VALUES (?,?,UTC_TIMESTAMP())', [cardId, manage.hash]);
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
    const before = await unchangedRows();
    const expected = await expectedHoldKeys();
    await applyHolds();
    same(await unchangedRows(), before, 'Whitespace normalization must preserve the original contact, owner, card and credential rows');
    same((await holds()).map(row => String(row.email_key)).sort(), expected,
      'Migration hold keys must match independent JavaScript trim/lowercase normalization');
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_legacy_holds WHERE email IN (?,?)', [email, ownerEmail]), 2);
    assert.equal(await count('SELECT COUNT(*) AS n FROM card_email_identities WHERE card_id=?', [cardId]), 0);
    await blocked([email, padded, ownerEmail, owner.email], 'whitespace-legacy-holds');
    const idempotent = { data: await unchangedRows(), holds: await holds() };
    await applyHolds();
    same({ data: await unchangedRows(), holds: await holds() }, idempotent,
      'Whitespace hold seeding must also be snapshot-idempotent');
  });
}
