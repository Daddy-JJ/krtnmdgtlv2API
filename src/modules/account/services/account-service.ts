import { AppError } from '../../../shared/http/errors.ts';
import type { PlatformRole } from '../../../shared/security/roles.ts';
import type { AccountProfile, AccountRepository } from '../repositories/account-repository.ts';

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
  constructor(repository: AccountRepository) { this.#repository = repository; }

  async currentUser(userPublicId: string): Promise<AccountProfileDto> {
    const profile = await this.#repository.findByPublicId(userPublicId);
    if (!profile || profile.status !== 'active') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return dto(profile);
  }

  async updateCurrentUser(userPublicId: string, email: string): Promise<AccountProfileDto> {
    const profile = await this.#repository.updateEmail(userPublicId, email, new Date());
    if (profile === 'email_taken') throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email is already registered.');
    if (!profile || profile.status !== 'active') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return dto(profile);
  }
}
