import type { PlatformRole } from '../../../shared/security/roles.ts';

export type UserRecord = Readonly<{
  id: number;
  publicId: string;
  email: string;
  passwordHash: string;
  role: PlatformRole;
  status: string;
  emailVerifiedAt: Date | null;
}>;

export type OtpRecord = Readonly<{
  id: number;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  lastSentAt: Date;
}>;

export type RefreshRecord = Readonly<{
  id: number;
  userId: number;
  userPublicId: string;
  email: string;
  familyId: string;
  role: PlatformRole;
  status: string;
  emailVerifiedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}>;

export type ResetRecord = Readonly<{
  id: number;
  userId: number;
  expiresAt: Date;
  usedAt: Date | null;
}>;

export interface AuthTransaction {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  insertUser(publicId: string, email: string, passwordHash: string, now: Date): Promise<UserRecord>;
  markEmailVerified(userId: number, now: Date): Promise<void>;
  invalidateOtps(email: string, purpose: string, now: Date): Promise<void>;
  insertOtp(input: { publicId: string; userId: number; email: string; purpose: string; codeHash: string; maxAttempts: number; expiresAt: Date; now: Date }): Promise<void>;
  findActiveOtp(email: string, purpose: string): Promise<OtpRecord | null>;
  countRecentOtps(email: string, purpose: string, since: Date): Promise<number>;
  incrementOtpAttempts(id: number): Promise<void>;
  consumeOtp(id: number, now: Date): Promise<void>;
  insertRefresh(input: { userId: number; tokenHash: string; familyId: string; expiresAt: Date; now: Date }): Promise<void>;
  findRefresh(tokenHash: string): Promise<RefreshRecord | null>;
  markRefreshUsed(id: number, now: Date): Promise<void>;
  revokeRefreshFamily(familyId: string, now: Date): Promise<void>;
  revokeAllUserRefreshTokens(userId: number, now: Date): Promise<void>;
  insertPasswordReset(input: { userId: number; tokenHash: string; expiresAt: Date; now: Date }): Promise<void>;
  findPasswordReset(tokenHash: string): Promise<ResetRecord | null>;
  consumePasswordReset(id: number, now: Date): Promise<void>;
  updatePassword(userId: number, passwordHash: string, now: Date): Promise<void>;
  enqueuePasswordResetMail(input: { publicId: string; userId: number; email: string; now: Date }): Promise<void>;
}

export interface AuthRepository {
  transaction<T>(work: (transaction: AuthTransaction) => Promise<T>): Promise<T>;
}

export interface RateLimiter {
  consume(action: string, identifier: string, limit: number, windowSeconds: number, now?: Date): Promise<boolean>;
}
