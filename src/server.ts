import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { loadEnvironment } from './config/environment.ts';
import { DatabaseHealthCheck } from './health/health-check.ts';
import { AuthController } from './modules/auth/controllers/auth-controller.ts';
import { MySqlAuthRepository } from './modules/auth/repositories/mysql-auth-repository.ts';
import { MySqlRateLimiter } from './modules/auth/repositories/mysql-rate-limiter.ts';
import { createAuthRouter } from './modules/auth/routes/auth-router.ts';
import { AuthService } from './modules/auth/services/auth-service.ts';
import { AccountController } from './modules/account/controllers/account-controller.ts';
import { MySqlAccountRepository } from './modules/account/repositories/mysql-account-repository.ts';
import { createAccountRouter } from './modules/account/routes/account-router.ts';
import { AccountService } from './modules/account/services/account-service.ts';
import { CpanelSmtpMailer } from './modules/email/cpanel-smtp-mailer.ts';
import { CardController } from './modules/cards/controllers/card-controller.ts';
import { CardCustomizationController } from './modules/cards/controllers/card-customization-controller.ts';
import { MySqlCardRepository } from './modules/cards/repositories/mysql-card-repository.ts';
import { createCardRouter, createPublicCardRouter } from './modules/cards/routes/card-router.ts';
import { CardService } from './modules/cards/services/card-service.ts';
import { CardCustomizationService } from './modules/cards/services/card-customization-service.ts';
import { CustomSlugService } from './modules/cards/services/custom-slug-service.ts';
import { MySqlPlanCapabilityReader } from './modules/plans/mysql-plan-capability-reader.ts';
import { PlanCatalogController } from './modules/plans/controllers/plan-catalog-controller.ts';
import { MySqlPlanCatalogRepository } from './modules/plans/repositories/mysql-plan-catalog-repository.ts';
import { createPlanRouter } from './modules/plans/routes/plan-router.ts';
import { PlanCapabilityService } from './modules/plans/plan-capability-service.ts';
import { Router } from 'express';
import { VCardRenderingService } from './modules/rendering/vcard/vcard-rendering-service.ts';
import { PublicVCardController } from './modules/rendering/vcard/public-vcard-controller.ts';
import { createPublicVCardRouter } from './modules/rendering/vcard/public-vcard-router.ts';
import { QrcodeRenderer } from './modules/rendering/qr/qrcode-renderer.ts';
import { QrFileCache } from './modules/rendering/qr/qr-file-cache.ts';
import { QrCodeRenderingService } from './modules/rendering/qr/qr-code-rendering-service.ts';
import { PublicQrController } from './modules/rendering/qr/public-qr-controller.ts';
import { createPublicQrRouter } from './modules/rendering/qr/public-qr-router.ts';
import { MySqlCardContentRepository } from './modules/card-content/repositories/mysql-card-content-repository.ts';
import { CardContentService } from './modules/card-content/services/card-content-service.ts';
import { CardContentController } from './modules/card-content/controllers/card-content-controller.ts';
import { createCardContentRouter } from './modules/card-content/routes/card-content-router.ts';
import { LogoImageProcessor } from './modules/uploads/logo/logo-image-processor.ts';
import { LogoFileStorage } from './modules/uploads/logo/logo-file-storage.ts';
import { LogoService } from './modules/uploads/logo/logo-service.ts';
import { LogoController } from './modules/uploads/logo/logo-controller.ts';
import { createLogoRouter,createPublicLogoRouter } from './modules/uploads/logo/logo-router.ts';
import { StarterController } from './modules/starter/controllers/starter-controller.ts';
import { MySqlStarterRepository } from './modules/starter/repositories/mysql-starter-repository.ts';
import { createStarterRouter } from './modules/starter/routes/starter-router.ts';
import { StarterService } from './modules/starter/services/starter-service.ts';
import { StarterSlugGenerator } from './modules/starter/services/starter-slug-generator.ts';
import { createDatabasePool } from './shared/database/pool.ts';
import { jsonLogger } from './shared/logging/logger.ts';
import { Rs256AccessTokenService } from './shared/security/access-token.ts';
import { CookiePolicy } from './shared/security/cookie-policy.ts';
import { CsrfTokenService } from './shared/security/csrf-token.ts';
import { OpaqueTokenService } from './shared/security/opaque-token.ts';
import { OtpCodeService } from './shared/security/otp-code.ts';
import { Argon2idPasswordHasher } from './shared/security/password-hasher.ts';
import { AuthenticatedActorService } from './shared/security/authenticated-actor.ts';
import { MySqlPaymentRepository } from './modules/payments/repositories/mysql-payment-repository.ts';
import { PaymentService } from './modules/payments/services/payment-service.ts';
import { PaymentController } from './modules/payments/controllers/payment-controller.ts';
import { createPaymentRouter, createSubscriptionRouter } from './modules/payments/routes/payment-router.ts';
import { MidtransGateway } from './modules/payments/gateways/midtrans-gateway.ts';
import { MySqlAdminRepository } from './modules/admin/repositories/mysql-admin-repository.ts';
import { AdminService } from './modules/admin/services/admin-service.ts';
import { AdminController } from './modules/admin/controllers/admin-controller.ts';
import { createAdminRouter } from './modules/admin/routes/admin-router.ts';
import { RbacService } from './shared/security/rbac-service.ts';
import { MySqlResumeRepository } from './modules/resume-service/repositories/mysql-resume-repository.ts';
import { ResumeService } from './modules/resume-service/services/resume-service.ts';
import { ResumeController } from './modules/resume-service/controllers/resume-controller.ts';
import { createAdminResumeRouter,createResumeRequestRouter,createResumeRouter } from './modules/resume-service/routes/resume-router.ts';
import { ResumePrivateStorage } from './modules/resume-service/files/resume-private-storage.ts';
import { ResumeFileService } from './modules/resume-service/files/resume-file-service.ts';
import { ResumeFileController } from './modules/resume-service/files/resume-file-controller.ts';
import { ResumeOperationsService } from './modules/resume-service/services/resume-operations-service.ts';
import { ResumeOperationsController } from './modules/resume-service/controllers/resume-operations-controller.ts';
import { SuperAdminService } from './modules/admin/services/super-admin-service.ts';
import { MySqlSuperAdminRepository } from './modules/admin/repositories/mysql-super-admin-repository.ts';
import { SuperAdminController } from './modules/admin/controllers/super-admin-controller.ts';
import { FeedbackController } from './modules/feedback/controllers/feedback-controller.ts';
import { MySqlFeedbackRepository } from './modules/feedback/repositories/mysql-feedback-repository.ts';
import { createFeedbackRouter } from './modules/feedback/routes/feedback-router.ts';
import { FeedbackService } from './modules/feedback/services/feedback-service.ts';

const environment = loadEnvironment();
const pool = createDatabasePool(environment);
const backendRoot = resolve(import.meta.dirname, '..');
const [privateKey, publicKey] = await Promise.all([
  readFile(resolve(backendRoot, environment.JWT_PRIVATE_KEY_PATH), 'utf8'),
  readFile(resolve(backendRoot, environment.JWT_PUBLIC_KEY_PATH), 'utf8'),
]);
const passwords = new Argon2idPasswordHasher();
const opaqueTokens = new OpaqueTokenService();
const csrfTokens = new CsrfTokenService(environment.CSRF_HMAC_KEY);
const rateLimiter = new MySqlRateLimiter(pool);
const accessTokens = new Rs256AccessTokenService({
  privateKey,
  publicKey,
  issuer: environment.JWT_ISSUER,
  audience: environment.JWT_AUDIENCE,
  ttlSeconds: environment.ACCESS_TOKEN_TTL_SECONDS,
});
const cookies = new CookiePolicy({
  secure: environment.COOKIE_SECURE,
  sameSite: environment.COOKIE_SAMESITE,
  accessTtlSeconds: environment.ACCESS_TOKEN_TTL_SECONDS,
  refreshTtlDays: environment.REFRESH_TOKEN_TTL_DAYS,
  ...(environment.COOKIE_DOMAIN ? { domain: environment.COOKIE_DOMAIN } : {}),
});
const authService = new AuthService({
  repository: new MySqlAuthRepository(pool),
  rateLimiter,
  passwords,
  opaqueTokens,
  otpCodes: new OtpCodeService(environment.OTP_HMAC_KEY),
  accessTokens,
  csrf: csrfTokens,
  mailer: new CpanelSmtpMailer({
    host: environment.MAIL_HOST,
    port: environment.MAIL_PORT,
    encryption: environment.MAIL_ENCRYPTION,
    username: environment.MAIL_USERNAME,
    password: environment.MAIL_PASSWORD,
    fromAddress: environment.MAIL_FROM_ADDRESS,
    fromName: environment.MAIL_FROM_NAME,
    replyToAddress: environment.MAIL_REPLY_TO_ADDRESS,
    timeoutSeconds: environment.MAIL_TIMEOUT_SECONDS,
    verifyPeer: environment.MAIL_VERIFY_PEER,
  }),
  config: {
    accessTtlSeconds: environment.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: environment.REFRESH_TOKEN_TTL_DAYS,
    otpExpiryMinutes: environment.OTP_EXPIRY_MINUTES,
    otpMaxAttempts: environment.OTP_MAX_ATTEMPTS,
    otpResendCooldownSeconds: environment.OTP_RESEND_COOLDOWN_SECONDS,
    otpSendLimitPerHour: environment.OTP_SEND_LIMIT_PER_HOUR,
    appUrl: environment.APP_URL,
  },
  dummyPasswordHash: await passwords.hash('nonexistent-account-timing-placeholder'),
});
const cardRepository = new MySqlCardRepository(pool);
const actors = new AuthenticatedActorService(accessTokens, csrfTokens);
const rbac=new RbacService(pool);
const resumeController=new ResumeController(new ResumeService(new MySqlResumeRepository(pool)),actors,rbac);
const resumeFileController=new ResumeFileController(new ResumeFileService(pool,new ResumePrivateStorage(resolve(backendRoot,'storage/private/resume-service')),rbac),actors);
const resumeOperationsController=new ResumeOperationsController(new ResumeOperationsService(pool,rbac),actors);
const superAdminController=new SuperAdminController(new SuperAdminService(new MySqlSuperAdminRepository(pool),rbac),actors,rbac);
const customizationController = new CardCustomizationController(new CardCustomizationService({repository:cardRepository,slugs:new CustomSlugService(),capabilities:new PlanCapabilityService(new MySqlPlanCapabilityReader(pool)),appUrl:environment.APP_URL}),actors);
const capabilities=new PlanCapabilityService(new MySqlPlanCapabilityReader(pool));
const contentRepository=new MySqlCardContentRepository(pool);
const contentController=new CardContentController(new CardContentService({cards:cardRepository,content:contentRepository,capabilities}),actors);
const themeRouter=Router();themeRouter.get('/',customizationController.catalog);
const cardService=new CardService({ repository: cardRepository, appUrl: environment.APP_URL, requireHttpsUrls: environment.APP_ENV === 'production',capabilities,content:contentRepository });
const cardController=new CardController(cardService,actors);
const logoController=new LogoController(new LogoService({cards:cardRepository,capabilities,processor:new LogoImageProcessor(),storage:new LogoFileStorage(resolve(backendRoot,'storage/public/uploads/logos'))}),actors);
const paymentGateway=environment.MIDTRANS_ENABLED?new MidtransGateway({environment:environment.MIDTRANS_ENV,serverKey:environment.MIDTRANS_SERVER_KEY,clientKey:environment.MIDTRANS_CLIENT_KEY}):undefined;
const paymentController=new PaymentController(new PaymentService({repository:new MySqlPaymentRepository(pool),...(paymentGateway?{gateway:paymentGateway}:{}),callbacks:{finish:environment.MIDTRANS_FINISH_URL??`${environment.APP_URL}/app/billing/result`,unfinish:environment.MIDTRANS_UNFINISH_URL??`${environment.APP_URL}/app/billing/result`,error:environment.MIDTRANS_ERROR_URL??`${environment.APP_URL}/app/billing/result`}}),actors);
const app = createApp({
  databaseHealth: new DatabaseHealthCheck(pool),
  environment: environment.APP_ENV,
  debug: environment.APP_DEBUG && environment.APP_ENV !== 'production',
  corsAllowedOrigins: environment.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter((origin) => origin !== ''),
  authRouter: createAuthRouter(new AuthController(authService, cookies)),
  accountRouter: createAccountRouter(new AccountController(new AccountService(new MySqlAccountRepository(pool)), actors)),
  starterRouter: createStarterRouter(new StarterController(new StarterService({
    repository: new MySqlStarterRepository(pool),
    rateLimiter,
    slugs: new StarterSlugGenerator(),
    tokens: opaqueTokens,
    csrf: csrfTokens,
    accessTokens,
    appUrl: environment.APP_URL,
    requireHttpsUrls: environment.APP_ENV === 'production',
  }), cookies)),
  cardRouter: createCardRouter(cardController,customizationController),
  cardContentRouter:createCardContentRouter(contentController),
  logoRouter:createLogoRouter(logoController),
  planRouter:createPlanRouter(new PlanCatalogController(new MySqlPlanCatalogRepository(pool))),
  themeRouter,
  publicCardRouter:createPublicCardRouter(cardController),
  publicVCardRouter:createPublicVCardRouter(new PublicVCardController(cardService, new VCardRenderingService())),
  publicQrRouter:createPublicQrRouter(new PublicQrController(new QrCodeRenderingService({cards:cardService,renderer:new QrcodeRenderer(),cache:new QrFileCache(resolve(backendRoot,'storage/cache/qr')),rateLimiter}))),
  publicLogoRouter:createPublicLogoRouter(logoController),
  paymentRouter:createPaymentRouter(paymentController),
  subscriptionRouter:createSubscriptionRouter(paymentController),
  adminRouter:createAdminRouter(new AdminController(new AdminService(new MySqlAdminRepository(pool)),actors),superAdminController),
  resumeRouter:createResumeRouter(resumeController),
  resumeRequestRouter:createResumeRequestRouter(resumeController,resumeFileController),
  adminResumeRouter:createAdminResumeRouter(resumeController,resumeOperationsController),
  feedbackRouter:createFeedbackRouter(new FeedbackController(new FeedbackService(new MySqlFeedbackRepository(pool)),actors)),
});

const server = app.listen(environment.PORT, () => {
  jsonLogger.info('server.started', {
    environment: environment.APP_ENV,
    port: environment.PORT,
  });
});

async function shutdown(signal: string): Promise<void> {
  jsonLogger.info('server.stopping', { signal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
