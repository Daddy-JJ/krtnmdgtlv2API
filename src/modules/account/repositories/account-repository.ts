import type { PlatformRole } from '../../../shared/security/roles.ts';

export type AccountProfile = Readonly<{
  publicId: string;
  email: string;
  role: PlatformRole;
  status: string;
  emailVerifiedAt: Date | null;
}>;

export interface AccountRepository {
  findByPublicId(publicId: string): Promise<AccountProfile | null>;
  updateEmail(publicId: string, email: string, now: Date): Promise<AccountProfile | 'email_taken' | null>;
}
