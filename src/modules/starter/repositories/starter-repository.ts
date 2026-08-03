import type { StarterCardInput } from '../../auth/dto/starter-input.ts';

export type StarterCardRecord = Readonly<{
  id: number;
  publicId: string;
  userId: number | null;
  slug: string;
  planCode: 'starter';
  themeCode: string;
  locale: 'id' | 'en';
  status: string;
  contact: StarterCardInput['contact'];
}>;

export type ManagedStarterRecord = Readonly<{ tokenId: number; tokenHash: string; card: StarterCardRecord }>;
export type ClaimUserRecord = Readonly<{ id: number; publicId: string; status: string; emailVerifiedAt: Date | null }>;

export interface StarterTransaction {
  slugExists(slug: string): Promise<boolean>;
  insertStarter(input: { publicId: string; slug: string; tokenHash: string; data: StarterCardInput; now: Date }): Promise<StarterCardRecord>;
  findManaged(publicId: string, tokenHash: string): Promise<ManagedStarterRecord | null>;
  updateStarter(cardId: number, data: StarterCardInput, now: Date): Promise<void>;
  rotateManageToken(cardId: number, currentTokenId: number, newTokenHash: string, now: Date): Promise<void>;
  findUser(publicId: string): Promise<ClaimUserRecord | null>;
  userHasCard(userId: number): Promise<boolean>;
  claimCard(cardId: number, userId: number, now: Date): Promise<void>;
  revokeManageTokens(cardId: number, now: Date): Promise<void>;
  loadCard(cardId: number): Promise<StarterCardRecord>;
}

export interface StarterRepository {
  transaction<T>(work: (transaction: StarterTransaction) => Promise<T>): Promise<T>;
}
