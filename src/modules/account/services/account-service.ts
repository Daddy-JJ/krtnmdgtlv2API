import { AppError } from '../../../shared/http/errors.ts';
import type { PlatformRole } from '../../../shared/security/roles.ts';
import type { AccountProfile, AccountRepository } from '../repositories/account-repository.ts';
import type { PasswordHasher } from '../../../shared/security/password-hasher.ts';
import type { RateLimiter } from '../../auth/repositories/auth-repository.ts';

export type AccountProfileDto = Readonly<{
  publicId: string;
  email: string;
  role: PlatformRole;
  roles: readonly PlatformRole[];
  permissions: readonly string[];
  status: string;
  emailVerified: boolean;
}>;

function dto(profile: AccountProfile): AccountProfileDto {
  return { publicId: profile.publicId, email: profile.email, role: profile.role, roles: profile.roles, permissions: profile.permissions, status: profile.status, emailVerified: profile.emailVerifiedAt !== null };
}

export class AccountService {
  readonly #repository: AccountRepository;
  readonly #passwords: PasswordHasher;
  readonly #limiter: RateLimiter;
  constructor(repository: AccountRepository, passwords: PasswordHasher, limiter: RateLimiter) {
    this.#repository = repository; this.#passwords = passwords; this.#limiter = limiter;
  }

  async currentUser(userPublicId: string): Promise<AccountProfileDto> {
    const profile = await this.#repository.findByPublicId(userPublicId);
    if (!profile || profile.status !== 'active') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return dto(profile);
  }

  async updateCurrentUser(userPublicId: string, email: string, currentPassword: string): Promise<AccountProfileDto> {
    if (!await this.#limiter.consume('account-email-change', userPublicId, 5, 900)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.');
    }
    const hash = await this.#repository.findPasswordHash(userPublicId);
    if (!hash || !await this.#passwords.verify(currentPassword, hash)) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
    }
    const profile = await this.#repository.updateEmail(userPublicId, email, hash, new Date());
    if (profile === 'email_taken') throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email is already registered.');
    if (!profile || profile.status !== 'active') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return dto(profile);
  }
}
