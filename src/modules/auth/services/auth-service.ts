import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/http/errors.ts';
import type { Rs256AccessTokenService } from '../../../shared/security/access-token.ts';
import type { CsrfTokenService } from '../../../shared/security/csrf-token.ts';
import type { OpaqueTokenService } from '../../../shared/security/opaque-token.ts';
import type { OtpCodeService } from '../../../shared/security/otp-code.ts';
import type { PasswordHasher } from '../../../shared/security/password-hasher.ts';
import type { PlatformRole } from '../../../shared/security/roles.ts';
import type { MailerPort } from '../../email/mailer-port.ts';
import type { AuthRepository, RateLimiter, UserRecord } from '../repositories/auth-repository.ts';

type SessionResult = Readonly<{ accessToken: string; refreshToken: string; csrfToken: string; user: { publicId: string; email: string; role: PlatformRole } }>;

export type AuthServiceConfig = Readonly<{
  accessTtlSeconds: number;
  refreshTtlDays: number;
  otpExpiryMinutes: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
  otpSendLimitPerHour: number;
  appUrl: string;
}>;

export class AuthService {
  readonly #repository: AuthRepository;
  readonly #rateLimiter: RateLimiter;
  readonly #passwords: PasswordHasher;
  readonly #opaqueTokens: OpaqueTokenService;
  readonly #otpCodes: OtpCodeService;
  readonly #accessTokens: Rs256AccessTokenService;
  readonly #csrf: CsrfTokenService;
  readonly #mailer: MailerPort;
  readonly #config: AuthServiceConfig;
  readonly #dummyPasswordHash: string;

  constructor(dependencies: { repository: AuthRepository; rateLimiter: RateLimiter; passwords: PasswordHasher; opaqueTokens: OpaqueTokenService; otpCodes: OtpCodeService; accessTokens: Rs256AccessTokenService; csrf: CsrfTokenService; mailer: MailerPort; config: AuthServiceConfig; dummyPasswordHash: string }) {
    this.#repository = dependencies.repository;
    this.#rateLimiter = dependencies.rateLimiter;
    this.#passwords = dependencies.passwords;
    this.#opaqueTokens = dependencies.opaqueTokens;
    this.#otpCodes = dependencies.otpCodes;
    this.#accessTokens = dependencies.accessTokens;
    this.#csrf = dependencies.csrf;
    this.#mailer = dependencies.mailer;
    this.#config = dependencies.config;
    this.#dummyPasswordHash = dependencies.dummyPasswordHash;
  }

  async register(email: string, password: string, clientKey: string): Promise<void> {
    await this.#limit('register', `${clientKey}:${email}`, 5, 3600);
    const passwordHash = await this.#passwords.hash(password);
    const issued = await this.#issueRegistrationOtp(email, passwordHash, true);
    if (issued) await this.#deliverOtp(email, issued);
  }

  async resendOtp(email: string, clientKey: string): Promise<void> {
    await this.#limit('otp-resend', `${clientKey}:${email}`, 5, 3600);
    const issued = await this.#issueRegistrationOtp(email, null, false);
    if (issued) await this.#deliverOtp(email, issued);
  }

  async verifyEmailOtp(email: string, code: string): Promise<void> {
    const outcome = await this.#repository.transaction(async (transaction) => {
      const user = await transaction.findUserByEmail(email);
      const otp = await transaction.findActiveOtp(email, 'registration');
      const now = new Date();
      if (!user || !otp || otp.expiresAt <= now) return 'invalid' as const;
      if (otp.attempts >= otp.maxAttempts) return 'attempts' as const;
      if (!this.#otpCodes.verify(otp.codeHash, email, 'registration', code)) {
        await transaction.incrementOtpAttempts(otp.id);
        return otp.attempts + 1 >= otp.maxAttempts ? 'attempts' as const : 'invalid' as const;
      }
      await transaction.consumeOtp(otp.id, now);
      await transaction.markEmailVerified(user.id, now);
      await transaction.invalidateOtps(email, 'registration', now);
      return 'verified' as const;
    });
    if (outcome === 'attempts') throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many verification attempts.');
    if (outcome !== 'verified') throw new AppError(422, 'OTP_INVALID_OR_EXPIRED', 'The verification code is invalid or expired.');
  }

  async login(email: string, password: string, clientKey: string): Promise<SessionResult> {
    await this.#limit('login', `${clientKey}:${email}`, 10, 900);
    const user = await this.#repository.transaction((transaction) => transaction.findUserByEmail(email));
    const valid = await this.#passwords.verify(password, user?.passwordHash ?? this.#dummyPasswordHash);
    if (!user || !valid || user.status !== 'active') throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email verification is required.');
    return this.#createSession(user);
  }

  async refresh(refreshPlaintext: string, csrfToken: string): Promise<SessionResult> {
    const replacement = this.#opaqueTokens.issue();
    const now = new Date();
    const outcome = await this.#repository.transaction(async (transaction) => {
      const current = await transaction.findRefresh(this.#opaqueTokens.hash(refreshPlaintext));
      if (!current) return null;
      if (!this.#csrf.verify(csrfToken, current.familyId) || current.usedAt || current.revokedAt || current.expiresAt <= now || current.status !== 'active' || !current.emailVerifiedAt) {
        await transaction.revokeRefreshFamily(current.familyId, now);
        return null;
      }
      await transaction.markRefreshUsed(current.id, now);
      await transaction.insertRefresh({ userId: current.userId, tokenHash: replacement.hash, familyId: current.familyId, expiresAt: new Date(now.getTime() + this.#config.refreshTtlDays * 86_400_000), now });
      return current;
    });
    if (!outcome) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return {
      accessToken: this.#accessTokens.issue({ userPublicId: outcome.userPublicId, sessionId: outcome.familyId, role: outcome.role }, now),
      refreshToken: replacement.plaintext,
      csrfToken: this.#csrf.issue(outcome.familyId),
      user: { publicId: outcome.userPublicId, email: outcome.email, role: outcome.role },
    };
  }

  async logout(accessToken: string, csrfToken: string): Promise<void> {
    const claims = this.#accessTokens.verify(accessToken);
    if (!claims || !this.#csrf.verify(csrfToken, claims.sid)) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    await this.#repository.transaction((transaction) => transaction.revokeRefreshFamily(claims.sid, new Date()));
  }

  issueCsrf(accessToken: string): string {
    const claims = this.#accessTokens.verify(accessToken);
    if (!claims) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return this.#csrf.issue(claims.sid);
  }

  async forgotPassword(email: string, clientKey: string): Promise<void> {
    await this.#limit('forgot-password', `${clientKey}:${email}`, 5, 3600);
    await this.#repository.transaction(async (transaction) => {
      const found = await transaction.findUserByEmail(email);
      if (found) await transaction.enqueuePasswordResetMail({ publicId: randomUUID(), userId: found.id, email, now: new Date() });
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await this.#passwords.hash(password);
    const ok = await this.#repository.transaction(async (transaction) => {
      const reset = await transaction.findPasswordReset(this.#opaqueTokens.hash(token));
      const now = new Date();
      if (!reset || reset.usedAt || reset.expiresAt <= now) return false;
      await transaction.updatePassword(reset.userId, passwordHash, now);
      await transaction.consumePasswordReset(reset.id, now);
      await transaction.revokeAllUserRefreshTokens(reset.userId, now);
      return true;
    });
    if (!ok) throw new AppError(422, 'VALIDATION_ERROR', 'The reset token is invalid or expired.');
  }

  async #createSession(user: UserRecord): Promise<SessionResult> {
    const refresh = this.#opaqueTokens.issue();
    const familyId = randomUUID();
    const now = new Date();
    await this.#repository.transaction((transaction) => transaction.insertRefresh({ userId: user.id, tokenHash: refresh.hash, familyId, expiresAt: new Date(now.getTime() + this.#config.refreshTtlDays * 86_400_000), now }));
    return { accessToken: this.#accessTokens.issue({ userPublicId: user.publicId, sessionId: familyId, role: user.role }, now), refreshToken: refresh.plaintext, csrfToken: this.#csrf.issue(familyId), user: { publicId: user.publicId, email: user.email, role: user.role } };
  }

  async #issueRegistrationOtp(email: string, passwordHash: string | null, createUser: boolean): Promise<string | null> {
    const code = this.#otpCodes.issue();
    return this.#repository.transaction(async (transaction) => {
      let user = await transaction.findUserByEmail(email);
      if (!user && createUser && passwordHash) user = await transaction.insertUser(randomUUID(), email, passwordHash, new Date());
      if (!user || user.emailVerifiedAt) return null;
      const now = new Date();
      const active = await transaction.findActiveOtp(email, 'registration');
      if (active && now.getTime() - active.lastSentAt.getTime() < this.#config.otpResendCooldownSeconds * 1000) throw new AppError(429, 'OTP_RESEND_COOLDOWN', 'Please wait before requesting another code.');
      if (await transaction.countRecentOtps(email, 'registration', new Date(now.getTime() - 3_600_000)) >= this.#config.otpSendLimitPerHour) throw new AppError(429, 'RATE_LIMITED', 'Too many requests.');
      await transaction.invalidateOtps(email, 'registration', now);
      await transaction.insertOtp({ publicId: randomUUID(), userId: user.id, email, purpose: 'registration', codeHash: this.#otpCodes.hash(email, 'registration', code), maxAttempts: this.#config.otpMaxAttempts, expiresAt: new Date(now.getTime() + this.#config.otpExpiryMinutes * 60_000), now });
      return code;
    });
  }

  async #deliverOtp(email: string, code: string): Promise<void> {
    try { await this.#mailer.sendRegistrationOtp(email, code, this.#config.otpExpiryMinutes); }
    catch { throw new AppError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Email delivery is temporarily unavailable.'); }
  }

  async #limit(action: string, identifier: string, limit: number, seconds: number): Promise<void> {
    if (!await this.#rateLimiter.consume(action, identifier, limit, seconds)) throw new AppError(429, 'RATE_LIMITED', 'Too many requests.');
  }
}
