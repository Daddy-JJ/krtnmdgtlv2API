import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import type { RowDataPacket } from 'mysql2/promise';
import { parseEnvironment } from '../../src/config/environment.ts';
import { MigrationRunner } from '../../src/shared/database/migration-runner.ts';
import { SeedRunner } from '../../src/shared/database/seed-runner.ts';
import { createDatabasePool } from '../../src/shared/database/pool.ts';
import { MySqlAuthRepository } from '../../src/modules/auth/repositories/mysql-auth-repository.ts';
import { MySqlRateLimiter } from '../../src/modules/auth/repositories/mysql-rate-limiter.ts';
import { AuthService } from '../../src/modules/auth/services/auth-service.ts';
import type { MailerPort } from '../../src/modules/email/mailer-port.ts';
import { MySqlMailOutboxRepository } from '../../src/modules/email/mail-outbox-repository.ts';
import { PasswordResetMailWorker } from '../../src/modules/email/password-reset-mail-worker.ts';
import { Rs256AccessTokenService } from '../../src/shared/security/access-token.ts';
import { CsrfTokenService } from '../../src/shared/security/csrf-token.ts';
import { OpaqueTokenService } from '../../src/shared/security/opaque-token.ts';
import { OtpCodeService } from '../../src/shared/security/otp-code.ts';
import { ScryptPasswordHasher } from '../../src/shared/security/password-hasher.ts';
import { MySqlStarterRepository } from '../../src/modules/starter/repositories/mysql-starter-repository.ts';
import { StarterService } from '../../src/modules/starter/services/starter-service.ts';
import { StarterSlugGenerator } from '../../src/modules/starter/services/starter-slug-generator.ts';
import { MySqlCardRepository } from '../../src/modules/cards/repositories/mysql-card-repository.ts';
import { CardService } from '../../src/modules/cards/services/card-service.ts';
import { CardCustomizationService } from '../../src/modules/cards/services/card-customization-service.ts';
import { CustomSlugService } from '../../src/modules/cards/services/custom-slug-service.ts';
import { PlanCapabilityService } from '../../src/modules/plans/plan-capability-service.ts';
import { MySqlPlanCapabilityReader } from '../../src/modules/plans/mysql-plan-capability-reader.ts';
import { MySqlCardContentRepository } from '../../src/modules/card-content/repositories/mysql-card-content-repository.ts';
import { CardContentService } from '../../src/modules/card-content/services/card-content-service.ts';
import { MySqlPaymentRepository } from '../../src/modules/payments/repositories/mysql-payment-repository.ts';
import { PaymentService } from '../../src/modules/payments/services/payment-service.ts';
import type { PaymentGatewayPort } from '../../src/modules/payments/gateways/payment-gateway-port.ts';
import { MySqlAdminRepository } from '../../src/modules/admin/repositories/mysql-admin-repository.ts';
import { AdminService } from '../../src/modules/admin/services/admin-service.ts';

const enabled = process.env.RUN_DB_TESTS === 'true' || process.env.RUN_DB_TESTS === '1';

test('migrations and seeds are idempotent on MariaDB/MySQL', { skip: !enabled }, async () => {
  const pool = createDatabasePool(parseEnvironment({
    APP_ENV: 'testing',
    DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    DB_PORT: String(process.env.TEST_DB_PORT ?? 3306),
    DB_SOCKET: process.env.TEST_DB_SOCKET ?? '',
    DB_USERNAME: process.env.TEST_DB_USERNAME ?? 'root',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? '',
    DB_DATABASE: process.env.TEST_DB_DATABASE ?? 'digital_identity_test',
    CSRF_HMAC_KEY: '0123456789abcdef0123456789abcdef',
    OTP_HMAC_KEY: 'abcdef0123456789abcdef0123456789',
  }));
  const backendRoot = resolve(import.meta.dirname, '../..');
  const projectRoot = resolve(backendRoot, '..');
  const migrations = new MigrationRunner(pool, resolve(backendRoot, 'database/migrations'));
  const seeds = new SeedRunner(pool, [resolve(backendRoot, 'database/seeders'), resolve(projectRoot, 'database/seeds')]);

  try {
    const [timezoneRows] = await pool.query<Array<RowDataPacket & { sessionTimezone: string }>>(
      'SELECT @@session.time_zone AS sessionTimezone',
    );
    assert.equal(timezoneRows[0]?.sessionTimezone, '+00:00');
    while ((await migrations.rollbackLastBatch()).length > 0) {
      // Reset the dedicated integration database so the first migration assertion is repeatable.
    }
    assert.deepEqual(await migrations.migrate(), [
      '001_initial_schema.sql',
      '002_auth_rate_limits.sql',
      '003_active_card_uniqueness.sql',
      '004_phase9_rbac_resume_service.sql',
      '004_user_feedback.sql',
      '005_annual_subscription_term.sql',
      '005_theme_catalog_names_and_access.sql',
    ]);
    assert.deepEqual(await migrations.migrate(), []);
    assert.equal((await seeds.run()).length, 2);

    for (const [table, count] of [['plans', 3], ['plan_features', 33], ['themes', 10], ['plan_theme_access', 14]] as const) {
      const [rows] = await pool.execute<Array<RowDataPacket & { count: number }>>(`SELECT COUNT(*) AS count FROM ${table}`);
      assert.equal(Number(rows[0]?.count), count);
    }

    const [themeAccessRows] = await pool.execute<Array<RowDataPacket & { code: string; count: number }>>(
      `SELECT p.code, COUNT(*) AS count
       FROM plan_theme_access pta
       JOIN plans p ON p.id = pta.plan_id
       GROUP BY p.code
       ORDER BY FIELD(p.code, 'starter', 'basic', 'pro')`,
    );
    assert.deepEqual(
      themeAccessRows.map((row) => [row.code, Number(row.count)]),
      [['starter', 1], ['basic', 3], ['pro', 10]],
    );

    const [themeNameRows] = await pool.execute<Array<RowDataPacket & { name: string }>>(
      'SELECT name FROM themes ORDER BY display_order',
    );
    assert.deepEqual(
      themeNameRows.map((row) => row.name),
      ['Aksara', 'Bayu', 'Baskara', 'Nilam', 'Prasasti', 'Padma', 'Kanaka', 'Naya', 'Kirana', 'Mahardika'],
    );

    const [collationRows] = await pool.execute<Array<RowDataPacket & { collation: string }>>(
      `SELECT COLLATION_NAME AS collation FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['cards', 'slug'],
    );
    assert.equal(collationRows[0]?.collation, 'utf8mb4_bin');
    assert.equal((await seeds.run()).length, 2);

    const delivered: { otp?: string; resetUrl?: string } = {};
    const mailer: MailerPort = {
      sendRegistrationOtp: async (_email, code) => { delivered.otp = code; },
      sendPasswordReset: async (_email, resetUrl) => { delivered.resetUrl = resetUrl; },
    };
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const passwords = new ScryptPasswordHasher();
    const auth = new AuthService({
      repository: new MySqlAuthRepository(pool),
      rateLimiter: new MySqlRateLimiter(pool),
      passwords,
      opaqueTokens: new OpaqueTokenService(),
      otpCodes: new OtpCodeService('abcdef0123456789abcdef0123456789'),
      accessTokens: new Rs256AccessTokenService({
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        issuer: 'kartunamadigital.id', audience: 'kartunamadigital-web', ttlSeconds: 900,
      }),
      csrf: new CsrfTokenService('0123456789abcdef0123456789abcdef'),
      mailer,
      config: { accessTtlSeconds: 900, refreshTtlDays: 30, otpExpiryMinutes: 10, otpMaxAttempts: 5, otpResendCooldownSeconds: 60, otpSendLimitPerHour: 5, appUrl: 'https://kartunamadigital.id' },
      dummyPasswordHash: await passwords.hash('nonexistent-account-timing-placeholder'),
    });

    const email = 'phase2b@example.com';
    const password = 'phase2b-password';
    await auth.register(email, password, 'integration-client');
    assert.match(delivered.otp ?? '', /^[0-9]{6}$/);
    await auth.verifyEmailOtp(email, delivered.otp ?? '');
    const firstSession = await auth.login(email, password, 'integration-client');
    const rotated = await auth.refresh(firstSession.refreshToken, firstSession.csrfToken);
    await assert.rejects(() => auth.refresh(firstSession.refreshToken, firstSession.csrfToken));
    await assert.rejects(() => auth.refresh(rotated.refreshToken, rotated.csrfToken));

    const resetSession = await auth.login(email, password, 'integration-client');
    await auth.forgotPassword(email, 'integration-client');
    const resetWorker = new PasswordResetMailWorker({ outbox: new MySqlMailOutboxRepository(pool), auth: new MySqlAuthRepository(pool), tokens: new OpaqueTokenService(), mailer, appUrl: 'https://kartunamadigital.id' });
    assert.equal(await resetWorker.runOnce(), true);
    const resetUrl = new URL(delivered.resetUrl ?? '');
    assert.equal(resetUrl.pathname, '/reset-password/');
    const resetToken = resetUrl.searchParams.get('token');
    assert.ok(resetToken);
    await auth.resetPassword(resetToken, 'phase2b-new-password');
    await assert.rejects(() => auth.refresh(resetSession.refreshToken, resetSession.csrfToken));
    await assert.rejects(() => auth.login(email, password, 'integration-client'));
    const claimSession = await auth.login(email, 'phase2b-new-password', 'integration-client');
    assert.equal(claimSession.user.email, email);

    const [secretRows] = await pool.execute<Array<RowDataPacket & { password_hash: string; code_hash: string | null; refresh_hash: string | null; reset_hash: string | null }>>(`SELECT
      u.password_hash,
      (SELECT code_hash FROM email_otps WHERE user_id = u.id ORDER BY id DESC LIMIT 1) AS code_hash,
      (SELECT token_hash FROM refresh_tokens WHERE user_id = u.id ORDER BY id DESC LIMIT 1) AS refresh_hash,
      (SELECT token_hash FROM password_reset_tokens WHERE user_id = u.id ORDER BY id DESC LIMIT 1) AS reset_hash
      FROM users u WHERE u.email = ?`, [email]);
    assert.notEqual(secretRows[0]?.password_hash, password);
    assert.notEqual(secretRows[0]?.code_hash, delivered.otp);
    assert.notEqual(secretRows[0]?.refresh_hash, firstSession.refreshToken);
    assert.notEqual(secretRows[0]?.reset_hash, resetToken);
    const [outboxRows] = await pool.execute<Array<RowDataPacket & { payload_text: string; status: string }>>("SELECT payload_text, status FROM mail_outbox WHERE template_key = 'auth.password-reset' ORDER BY id DESC LIMIT 1");
    assert.equal(outboxRows[0]?.status, 'sent');
    assert.doesNotMatch(outboxRows[0]?.payload_text ?? '', new RegExp(resetToken));
    const [deliveryRows] = await pool.execute<Array<RowDataPacket & { recipient_masked: string; status: string; response_message: string }>>(
      "SELECT recipient_masked,status,response_message FROM mail_delivery_logs ORDER BY id DESC LIMIT 1",
    );
    assert.equal(deliveryRows[0]?.status, 'sent');
    assert.notEqual(deliveryRows[0]?.recipient_masked, email);
    assert.doesNotMatch(deliveryRows[0]?.response_message ?? '', new RegExp(resetToken));

    const starter = new StarterService({
      repository: new MySqlStarterRepository(pool), rateLimiter: new MySqlRateLimiter(pool), slugs: new StarterSlugGenerator(),
      tokens: new OpaqueTokenService(), csrf: new CsrfTokenService('0123456789abcdef0123456789abcdef'),
      accessTokens: new Rs256AccessTokenService({ privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(), issuer: 'kartunamadigital.id', audience: 'kartunamadigital-web', ttlSeconds: 900 }),
      appUrl: 'https://kartunamadigital.id',
    });
    const starterInput = { locale: 'id' as const, contact: { fullName: 'Starter Integration', jobTitle: 'Tester', organization: 'KND', officePhone: '', mobilePhone: '081234567890', email: 'starter@example.com', websiteUrl: 'https://example.com', addressText: 'Jakarta' } };
    const createdStarter = await starter.create(starterInput, 'starter-client');
    assert.match(createdStarter.card.slug, /^[a-zA-Z]{7}$/);
    assert.equal(createdStarter.card.themeCode, 'starter-clean');
    const updatedStarter = await starter.update(createdStarter.card.publicId, createdStarter.manageToken, createdStarter.csrfToken, { ...starterInput, contact: { ...starterInput.contact, fullName: 'Starter Updated' } });
    await assert.rejects(() => starter.update(createdStarter.card.publicId, createdStarter.manageToken, createdStarter.csrfToken, starterInput));
    const claimed = await starter.claim(updatedStarter.card.publicId, updatedStarter.manageToken, updatedStarter.csrfToken, claimSession.accessToken);
    const [ownerRows] = await pool.execute<Array<RowDataPacket & { user_id: number | null }>>('SELECT user_id FROM cards WHERE public_id = ?', [claimed.card.publicId]);
    assert.ok(ownerRows[0]?.user_id);
    await assert.rejects(() => starter.update(updatedStarter.card.publicId, updatedStarter.manageToken, updatedStarter.csrfToken, starterInput));
    const secondStarter = await starter.create(starterInput, 'starter-client-2');
    await assert.rejects(() => starter.claim(secondStarter.card.publicId, secondStarter.manageToken, secondStarter.csrfToken, claimSession.accessToken));
    const [manageRows] = await pool.execute<Array<RowDataPacket & { token_hash: string; revoked_at: Date | null }>>('SELECT token_hash, revoked_at FROM starter_manage_tokens WHERE card_id = (SELECT id FROM cards WHERE public_id = ?) ORDER BY id DESC', [claimed.card.publicId]);
    assert.notEqual(manageRows[0]?.token_hash, updatedStarter.manageToken);
    assert.ok(manageRows.every((row) => row.revoked_at !== null));

    const paidEmail = 'phase3b@example.com';
    await auth.register(paidEmail, password, 'phase3b-client');
    assert.match(delivered.otp ?? '', /^[0-9]{6}$/);
    await auth.verifyEmailOtp(paidEmail, delivered.otp ?? '');
    const [paidUsers] = await pool.execute<Array<RowDataPacket & { id: number; public_id: string }>>('SELECT id, public_id FROM users WHERE email = ?', [paidEmail]);
    const paidUser = paidUsers[0]!;
    await pool.execute(`INSERT INTO subscriptions(public_id,user_id,plan_id,status,starts_at,ends_at,created_at,updated_at) SELECT UUID(),?,id,'active',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY),UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM plans WHERE code='basic'`, [paidUser.id]);
    const cardRepository = new MySqlCardRepository(pool);
    const contentRepository = new MySqlCardContentRepository(pool);
    const capabilities = new PlanCapabilityService(new MySqlPlanCapabilityReader(pool));
    const cards = new CardService({ repository: cardRepository, content: contentRepository, capabilities, appUrl: 'https://kartunamadigital.id' });
    const cardInput = { ...starterInput, contact: { ...starterInput.contact, email: paidEmail } };
    const paidCard = await cards.create(paidUser.public_id, cardInput);
    assert.equal(paidCard.planCode, 'basic');
    assert.equal((await cards.list(paidUser.public_id)).length, 1);
    assert.equal((await cards.get(paidUser.public_id, paidCard.publicId)).publicId, paidCard.publicId);
    await assert.rejects(() => cards.get(claimSession.user.publicId, paidCard.publicId), { code: 'CARD_NOT_FOUND' });
    await assert.rejects(() => cards.create(paidUser.public_id, cardInput), { code: 'PLAN_LIMIT_REACHED' });
    const mapsUrl = 'https://maps.google.com/?q=Jakarta';
    const updatedPaid = await cards.update(paidUser.public_id, paidCard.publicId, { ...cardInput, contact: { ...cardInput.contact, fullName: 'Paid Updated', mapsUrl } });
    assert.equal(updatedPaid.contact.fullName, 'Paid Updated');
    assert.equal((await cards.get(paidUser.public_id, paidCard.publicId)).contact.mapsUrl, mapsUrl);
    await cards.delete(paidUser.public_id, paidCard.publicId);
    await assert.rejects(() => cards.get(paidUser.public_id, paidCard.publicId), { code: 'CARD_NOT_FOUND' });
    const replacement = await cards.create(paidUser.public_id, cardInput);
    assert.notEqual(replacement.publicId, paidCard.publicId);
    const customization = new CardCustomizationService({ repository: new MySqlCardRepository(pool), slugs: new CustomSlugService(), capabilities: new PlanCapabilityService(new MySqlPlanCapabilityReader(pool)), appUrl: 'https://kartunamadigital.id' });
    const themes = await customization.cardThemes(paidUser.public_id, replacement.publicId);
    assert.equal(themes.filter((theme) => theme.isAvailable).length, 3);
    assert.equal((await customization.updateTheme(paidUser.public_id, replacement.publicId, 'basic-blue-line')).themeCode, 'basic-blue-line');
    await assert.rejects(() => customization.updateTheme(paidUser.public_id, replacement.publicId, 'pro-luxury-frame'), { code: 'THEME_NOT_ALLOWED' });
    const renamed = await customization.updateSlug(paidUser.public_id, replacement.publicId, 'Arwan-Sales');
    assert.equal(renamed.slug, 'arwan-sales');
    assert.equal((await customization.availability('arwan-sales')).available, false);
    await assert.rejects(() => customization.updateSlug(paidUser.public_id, replacement.publicId, paidCard.slug), { code: 'SLUG_UNAVAILABLE' });
    await assert.rejects(() => customization.updateSlug(paidUser.public_id, replacement.publicId, 'admin'), { code: 'SLUG_INVALID' });
    await assert.rejects(() => cards.publicCard('arwan-sales'), { code: 'CARD_NOT_FOUND' });
    await assert.rejects(() => cards.publish(claimSession.user.publicId, replacement.publicId), { code: 'CARD_NOT_FOUND' });
    const published = await cards.publish(paidUser.public_id, replacement.publicId);
    assert.equal(published.status, 'published');
    assert.equal((await cards.publicCard('arwan-sales')).publicId, replacement.publicId);
    const content = new CardContentService({ cards: cardRepository, content: contentRepository, capabilities });
    const socialTwo = await content.createSocial(paidUser.public_id, replacement.publicId, { platform: 'linkedin', url: 'https://linkedin.com/in/arwan', sortOrder: 2 });
    const socialOne = await content.createSocial(paidUser.public_id, replacement.publicId, { platform: 'instagram', url: 'https://instagram.com/arwan', sortOrder: 1 });
    assert.deepEqual((await content.listSocial(paidUser.public_id, replacement.publicId)).map((link) => link.id), [socialOne.id, socialTwo.id]);
    await assert.rejects(() => content.createSocial(paidUser.public_id, replacement.publicId, { platform: 'x', url: 'https://x.com/arwan', sortOrder: 3 }), { code: 'PLAN_LIMIT_REACHED' });
    await assert.rejects(() => content.listSocial(claimSession.user.publicId, replacement.publicId), { code: 'CARD_CONTENT_NOT_FOUND' });
    assert.equal((await content.updateSocial(paidUser.public_id, replacement.publicId, socialTwo.id, { ...socialTwo, sortOrder: 0 })).sortOrder, 0);
    await content.deleteSocial(paidUser.public_id, replacement.publicId, socialOne.id);
    await content.createSocial(paidUser.public_id, replacement.publicId, { platform: 'x', url: 'https://x.com/arwan', sortOrder: 3 });

    const catalogTwo = await content.createCatalog(paidUser.public_id, replacement.publicId, { title: 'Second', description: null, targetUrl: null, sortOrder: 2, isPublished: true });
    const catalogOne = await content.createCatalog(paidUser.public_id, replacement.publicId, { title: 'First', description: 'Plain text', targetUrl: 'https://example.com/first', sortOrder: 1, isPublished: true });
    assert.deepEqual((await content.listCatalog(paidUser.public_id, replacement.publicId)).map((item) => item.publicId), [catalogOne.publicId, catalogTwo.publicId]);
    await assert.rejects(() => content.createCatalog(paidUser.public_id, replacement.publicId, { title: 'Third', description: null, targetUrl: null, sortOrder: 3, isPublished: true }), { code: 'PLAN_LIMIT_REACHED' });
    assert.equal((await content.updateCatalog(paidUser.public_id, replacement.publicId, catalogTwo.publicId, { ...catalogTwo, title: 'Updated' })).title, 'Updated');
    await content.deleteCatalog(paidUser.public_id, replacement.publicId, catalogOne.publicId);
    await content.createCatalog(paidUser.public_id, replacement.publicId, { title: 'Replacement', description: null, targetUrl: null, sortOrder: 3, isPublished: false });

    await pool.execute(`UPDATE cards SET plan_code='pro' WHERE public_id=?`, [replacement.publicId]);
    for (const link of await content.listSocial(paidUser.public_id, replacement.publicId)) await content.deleteSocial(paidUser.public_id, replacement.publicId, link.id);
    for (let index = 0; index < 5; index += 1) await content.createSocial(paidUser.public_id, replacement.publicId, { platform: 'other', url: `https://example.com/social/${index}`, sortOrder: index });
    await assert.rejects(() => content.createSocial(paidUser.public_id, replacement.publicId, { platform: 'other', url: 'https://example.com/social/overflow', sortOrder: 6 }), { code: 'PLAN_LIMIT_REACHED' });
    for (const item of await content.listCatalog(paidUser.public_id, replacement.publicId)) await content.deleteCatalog(paidUser.public_id, replacement.publicId, item.publicId);
    for (let index = 0; index < 10; index += 1) await content.createCatalog(paidUser.public_id, replacement.publicId, { title: `Item ${index}`, description: null, targetUrl: null, sortOrder: index, isPublished: true });
    await assert.rejects(() => content.createCatalog(paidUser.public_id, replacement.publicId, { title: 'Overflow', description: null, targetUrl: null, sortOrder: 11, isPublished: true }), { code: 'PLAN_LIMIT_REACHED' });
    const logoUpdate = await cardRepository.updateOwnedLogo(paidUser.public_id, replacement.publicId, '11111111-1111-4111-8111-111111111111.webp', new Date());
    assert.equal(logoUpdate?.card.logoPath, '11111111-1111-4111-8111-111111111111.webp');
    const publicAggregate = await cards.publicCard('arwan-sales');
    assert.equal(publicAggregate.socialLinks.length, 5);
    assert.equal(publicAggregate.catalogItems.length, 10);
    assert.equal(publicAggregate.logoUrl, '/api/v1/public/cards/arwan-sales/logo');
    assert.equal(publicAggregate.whatsappUrl, 'https://wa.me/6281234567890');
    await cards.delete(paidUser.public_id, replacement.publicId);
    await assert.rejects(() => cards.publicCard('arwan-sales'), { code: 'CARD_NOT_FOUND' });

    await pool.execute(`UPDATE plans SET price_amount=100000,duration_days=365 WHERE code='basic'`);
    await pool.execute(`UPDATE plans SET price_amount=200000,duration_days=365 WHERE code='pro'`);
    const paymentRepository = new MySqlPaymentRepository(pool);
    const paymentGateway = { createCheckout: async (input: { orderId: string }) => ({ token: `token-${input.orderId}`, redirectUrl: `https://sandbox.midtrans.com/${input.orderId}` }) } as unknown as PaymentGatewayPort;
    const payments = new PaymentService({ repository: paymentRepository, gateway: paymentGateway, callbacks: { finish: 'https://kartunamadigital.id/app/billing/result', unfinish: 'https://kartunamadigital.id/app/billing/result', error: 'https://kartunamadigital.id/app/billing/result' } });
    const checkout = await payments.checkout(claimSession.user.publicId, { planCode: 'basic' });
    assert.equal(checkout.amount, 55000);
    assert.equal(checkout.durationDays, 365);
    assert.match(checkout.snapToken, /^token-KND_/);
    assert.equal((await payments.list(claimSession.user.publicId)).length, 1);
    assert.equal((await payments.get(claimSession.user.publicId, checkout.publicId)).publicId, checkout.publicId);
    await assert.rejects(() => payments.get(paidUser.public_id, checkout.publicId), { code: 'PAYMENT_NOT_FOUND' });
    await pool.execute(`UPDATE plans SET price_amount=200000,duration_days=365 WHERE code='basic'`);
    assert.equal((await payments.get(claimSession.user.publicId, checkout.publicId)).amount, 55000);
    const notificationGateway = { verifyNotification: async (payload: unknown) => payload } as unknown as PaymentGatewayPort;
    const notifications = new PaymentService({ repository: paymentRepository, gateway: notificationGateway, callbacks: { finish: '', unfinish: '', error: '' } });
    const settlement = { orderId: checkout.merchantOrderId, statusCode: '200', grossAmount: '55000.00', transactionStatus: 'settlement', transactionId: 'midtrans-trx-1', fraudStatus: 'accept', eventKey: 'event-settlement-1', raw: { order_id: checkout.merchantOrderId, transaction_status: 'settlement' } };
    assert.equal((await notifications.notification(settlement)).result, 'processed');
    assert.equal((await notifications.notification(settlement)).result, 'duplicate');
    assert.equal((await payments.get(claimSession.user.publicId, checkout.publicId)).status, 'paid');
    const [activated] = await pool.execute<Array<RowDataPacket & { plan_code: string; card_plan: string; ends_at: Date; events: number }>>(`SELECT p.code plan_code,c.plan_code card_plan,s.ends_at,(SELECT COUNT(*) FROM payment_events WHERE payment_id=pay.id) events FROM payments pay JOIN subscriptions s ON s.id=pay.subscription_id JOIN plans p ON p.id=s.plan_id JOIN cards c ON c.user_id=pay.user_id WHERE pay.public_id=? LIMIT 1`, [checkout.publicId]);
    assert.equal(activated[0]?.plan_code, 'basic'); assert.equal(activated[0]?.card_plan, 'basic'); assert.equal(Number(activated[0]?.events), 1);
    assert.equal((await payments.currentSubscription(claimSession.user.publicId))?.planCode, 'basic');
    const mismatched = await payments.checkout(claimSession.user.publicId, { planCode: 'pro' });
    const mismatchNotice = { ...settlement, orderId: mismatched.merchantOrderId, grossAmount: '1.00', transactionId: 'midtrans-trx-2', eventKey: 'event-mismatch-2', raw: { order_id: mismatched.merchantOrderId, transaction_status: 'settlement', gross_amount: '1.00' } };
    await assert.rejects(() => notifications.notification(mismatchNotice), { code: 'PAYMENT_AMOUNT_MISMATCH' });
    assert.equal((await payments.get(claimSession.user.publicId, mismatched.publicId)).status, 'pending');
    const [rejectedEvents] = await pool.execute<Array<RowDataPacket & { count: number }>>(`SELECT COUNT(*) count FROM payment_events WHERE payment_id=(SELECT id FROM payments WHERE public_id=?) AND processing_status='rejected'`, [mismatched.publicId]);
    assert.equal(Number(rejectedEvents[0]?.count), 1);
    const upgrade = await payments.checkout(claimSession.user.publicId, { planCode: 'pro' });
    assert.equal(upgrade.amount, 55000);
    const upgradeNotice = { ...settlement, orderId: upgrade.merchantOrderId, grossAmount: '55000.00', transactionId: 'midtrans-trx-3', eventKey: 'event-settlement-3', raw: { order_id: upgrade.merchantOrderId, transaction_status: 'settlement' } };
    assert.equal((await notifications.notification(upgradeNotice)).result, 'processed');
    const [upgraded] = await pool.execute<Array<RowDataPacket & { plan_code: string; card_plan: string; ends_at: Date }>>(`SELECT p.code plan_code,c.plan_code card_plan,s.ends_at FROM payments pay JOIN subscriptions s ON s.id=pay.subscription_id JOIN plans p ON p.id=s.plan_id JOIN cards c ON c.user_id=pay.user_id WHERE pay.public_id=? LIMIT 1`, [upgrade.publicId]);
    assert.equal(upgraded[0]?.plan_code, 'pro'); assert.equal(upgraded[0]?.card_plan, 'pro');
    assert.ok((upgraded[0]?.ends_at.getTime() ?? 0) >= (activated[0]?.ends_at.getTime() ?? 0) - 1000);
    assert.equal((await payments.currentSubscription(claimSession.user.publicId))?.planCode, 'pro');
    await assert.rejects(() => payments.checkout(claimSession.user.publicId, { planCode: 'pro' }), { code: 'PLAN_UPGRADE_NOT_AVAILABLE' });
    await pool.execute(`UPDATE users SET role='admin' WHERE public_id=?`, [claimSession.user.publicId]);
    const admin = new AdminService(new MySqlAdminRepository(pool));
    assert.equal((await admin.listPayments()).length, 3);
    const updatedPlan = await admin.updatePlan(claimSession.user.publicId, 'pro', { price: 300000, durationDays: 365, isActive: true, reason: 'Approved annual Pro pricing for integration test' });
    assert.equal(updatedPlan.price, 300000);
    assert.ok((await admin.listUsers()).length >= 2); assert.ok((await admin.listCards()).length >= 2); assert.equal((await admin.listThemes()).length, 10);
    const updatedTheme = await admin.updateTheme(claimSession.user.publicId, 'starter-clean', { displayOrder: 1, isActive: true, reason: 'Approved theme ordering integration test' });
    assert.equal(updatedTheme.code, 'starter-clean'); assert.ok((await admin.listActivity()).some(entry => entry.event === 'admin.theme-updated'));
    const [adminAudit] = await pool.execute<Array<RowDataPacket & { count: number }>>(`SELECT COUNT(*) count FROM activity_logs a JOIN users u ON u.id=a.user_id WHERE a.event='admin.plan-updated' AND u.public_id=?`, [claimSession.user.publicId]);
    assert.equal(Number(adminAudit[0]?.count), 1);

    assert.deepEqual(await migrations.rollbackLastBatch(), [
      '005_theme_catalog_names_and_access.sql',
      '005_annual_subscription_term.sql',
      '004_user_feedback.sql',
      '004_phase9_rbac_resume_service.sql',
      '003_active_card_uniqueness.sql',
      '002_auth_rate_limits.sql',
      '001_initial_schema.sql',
    ]);
    assert.deepEqual(await migrations.migrate(), [
      '001_initial_schema.sql',
      '002_auth_rate_limits.sql',
      '003_active_card_uniqueness.sql',
      '004_phase9_rbac_resume_service.sql',
      '004_user_feedback.sql',
      '005_annual_subscription_term.sql',
      '005_theme_catalog_names_and_access.sql',
    ]);
    assert.equal((await seeds.run()).length, 2);
  } finally {
    await pool.end();
  }
});
