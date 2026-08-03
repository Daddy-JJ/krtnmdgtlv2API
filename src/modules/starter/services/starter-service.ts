import { randomUUID } from 'node:crypto';
import type { StarterCardInput } from '../../auth/dto/starter-input.ts';
import type { RateLimiter } from '../../auth/repositories/auth-repository.ts';
import { AppError } from '../../../shared/http/errors.ts';
import type { Rs256AccessTokenService } from '../../../shared/security/access-token.ts';
import type { CsrfTokenService } from '../../../shared/security/csrf-token.ts';
import type { OpaqueTokenService } from '../../../shared/security/opaque-token.ts';
import type { StarterCardRecord, StarterRepository } from '../repositories/starter-repository.ts';
import type { StarterSlugGenerator } from './starter-slug-generator.ts';

export type StarterCardResponse = Readonly<{
  publicId: string;
  slug: string;
  planCode: 'starter';
  themeCode: string;
  locale: 'id' | 'en';
  status: string;
  canonicalUrl: string;
  qrImageUrl: string;
  contact: StarterCardInput['contact'];
}>;

export class StarterService {
  readonly #repository: StarterRepository;
  readonly #rateLimiter: RateLimiter;
  readonly #slugs: StarterSlugGenerator;
  readonly #tokens: OpaqueTokenService;
  readonly #csrf: CsrfTokenService;
  readonly #accessTokens: Rs256AccessTokenService;
  readonly #appUrl: string;
  readonly #requireHttpsUrls: boolean;

  constructor(dependencies: { repository: StarterRepository; rateLimiter: RateLimiter; slugs: StarterSlugGenerator; tokens: OpaqueTokenService; csrf: CsrfTokenService; accessTokens: Rs256AccessTokenService; appUrl: string; requireHttpsUrls?: boolean }) {
    this.#repository = dependencies.repository;
    this.#rateLimiter = dependencies.rateLimiter;
    this.#slugs = dependencies.slugs;
    this.#tokens = dependencies.tokens;
    this.#csrf = dependencies.csrf;
    this.#accessTokens = dependencies.accessTokens;
    this.#appUrl = dependencies.appUrl.replace(/\/$/, '');
    this.#requireHttpsUrls = dependencies.requireHttpsUrls ?? false;
  }

  async create(data: StarterCardInput, clientKey: string): Promise<{ card: StarterCardResponse; manageToken: string; csrfToken: string }> {
    this.#validateUrls(data);
    if (!await this.#rateLimiter.consume('starter-create', clientKey, 10, 3600)) throw new AppError(429, 'RATE_LIMITED', 'Too many requests.');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const slug = this.#slugs.generate();
      const manage = this.#tokens.issue();
      try {
        const created = await this.#repository.transaction(async (transaction) => {
          if (await transaction.slugExists(slug)) return null;
          return transaction.insertStarter({ publicId: randomUUID(), slug, tokenHash: manage.hash, data, now: new Date() });
        });
        if (created) return { card: this.#response(created), manageToken: manage.plaintext, csrfToken: this.#csrf.issue(`starter:${manage.hash}`) };
      } catch (error) {
        if (!this.#duplicate(error)) throw error;
      }
    }
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'A unique Starter URL could not be allocated.');
  }

  async update(publicId: string, managePlaintext: string, csrfToken: string, data: StarterCardInput): Promise<{ card: StarterCardResponse; manageToken: string; csrfToken: string }> {
    this.#validateUrls(data);
    const currentHash = this.#tokens.hash(managePlaintext);
    if (!this.#csrf.verify(csrfToken, `starter:${currentHash}`)) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    const replacement = this.#tokens.issue();
    const updated = await this.#repository.transaction(async (transaction) => {
      const managed = await transaction.findManaged(publicId, currentHash);
      if (!managed) return null;
      const now = new Date();
      await transaction.updateStarter(managed.card.id, data, now);
      await transaction.rotateManageToken(managed.card.id, managed.tokenId, replacement.hash, now);
      return transaction.loadCard(managed.card.id);
    });
    if (!updated) throw new AppError(401, 'STARTER_TOKEN_INVALID', 'Starter management access is invalid.');
    return { card: this.#response(updated), manageToken: replacement.plaintext, csrfToken: this.#csrf.issue(`starter:${replacement.hash}`) };
  }

  async claim(publicId: string, managePlaintext: string, csrfToken: string, accessToken: string): Promise<{ card: StarterCardResponse; csrfToken: string }> {
    const claims = this.#accessTokens.verify(accessToken);
    if (!claims) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    const manageHash = this.#tokens.hash(managePlaintext);
    if (!this.#csrf.verify(csrfToken, `starter:${manageHash}`)) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    const outcome = await this.#repository.transaction(async (transaction) => {
      const user = await transaction.findUser(claims.sub);
      if (!user || user.status !== 'active' || !user.emailVerifiedAt) return { kind: 'auth' as const };
      const managed = await transaction.findManaged(publicId, manageHash);
      if (!managed) return { kind: 'manage' as const };
      if (await transaction.userHasCard(user.id)) return { kind: 'conflict' as const };
      const now = new Date();
      await transaction.claimCard(managed.card.id, user.id, now);
      await transaction.revokeManageTokens(managed.card.id, now);
      return { kind: 'claimed' as const, card: await transaction.loadCard(managed.card.id) };
    });
    if (outcome.kind === 'auth') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    if (outcome.kind === 'manage') throw new AppError(401, 'STARTER_TOKEN_INVALID', 'Starter management access is invalid.');
    if (outcome.kind === 'conflict') throw new AppError(409, 'PLAN_LIMIT_REACHED', 'The account already has an active card.');
    return { card: this.#response(outcome.card), csrfToken: this.#csrf.issue(claims.sid) };
  }

  #response(card: StarterCardRecord): StarterCardResponse {
    return { publicId: card.publicId, slug: card.slug, planCode: 'starter', themeCode: card.themeCode, locale: card.locale, status: card.status, canonicalUrl: `${this.#appUrl}/${card.slug}`, qrImageUrl: `/api/v1/public/cards/${encodeURIComponent(card.slug)}/qr`, contact: card.contact };
  }

  #duplicate(error: unknown): boolean {
    return !!error && typeof error === 'object' && (((error as { code?: unknown }).code === 'ER_DUP_ENTRY') || ((error as { errno?: unknown }).errno === 1062));
  }

  #validateUrls(data: StarterCardInput): void {
    if (this.#requireHttpsUrls && !data.contact.websiteUrl.startsWith('https://')) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', [{ field: 'contact.websiteUrl', message: 'Production URLs must use HTTPS.' }]);
    }
  }
}
