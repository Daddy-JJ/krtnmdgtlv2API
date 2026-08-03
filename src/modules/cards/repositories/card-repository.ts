import type { NormalizedCardInput } from '../dto/card-input.ts';

export type PlanCode = 'starter' | 'basic' | 'pro';
export type OwnedCard = Readonly<{ id: number; publicId: string; slug: string; planCode: PlanCode; themeCode: string; locale: 'id' | 'en'; status: string; logoPath?: string | null; contact: NormalizedCardInput['contact'] }>;
export type EntitledUser = Readonly<{ id: number; planCode: 'basic' | 'pro' }>;
export type ThemeOption = Readonly<{ code: string; name: string; orientation: string; previewPath: string; displayOrder: number; isAvailable: boolean }>;

export interface CardTransaction {
  findEntitledUserForUpdate(userPublicId: string): Promise<EntitledUser | null>;
  userHasActiveCard(userId: number): Promise<boolean>;
  findDefaultTheme(planCode: 'basic' | 'pro'): Promise<{ id: number; code: string } | null>;
  slugExists(slug: string): Promise<boolean>;
  insertOwnedCard(input: { publicId: string; userId: number; planCode: 'basic' | 'pro'; themeId: number; slug: string; data: NormalizedCardInput; now: Date }): Promise<OwnedCard>;
}

export interface CardRepository {
  transaction<T>(work: (transaction: CardTransaction) => Promise<T>): Promise<T>;
  listOwned(userPublicId: string): Promise<OwnedCard[]>;
  findOwned(userPublicId: string, publicId: string): Promise<OwnedCard | null>;
  updateOwned(userPublicId: string, publicId: string, data: NormalizedCardInput, now: Date): Promise<OwnedCard | null>;
  softDeleteOwned(userPublicId: string, publicId: string, now: Date): Promise<boolean>;
  findEffectivePlan(userPublicId: string): Promise<'basic' | 'pro' | null>;
  isSlugAvailable(slug: string, excludePublicId?: string): Promise<boolean>;
  updateOwnedSlug(userPublicId: string, publicId: string, slug: string, now: Date): Promise<OwnedCard | null>;
  listThemes(planCode: PlanCode): Promise<ThemeOption[]>;
  updateOwnedTheme(userPublicId: string, publicId: string, themeCode: string, now: Date): Promise<OwnedCard | 'forbidden' | null>;
  publishOwned(userPublicId: string, publicId: string, now: Date): Promise<OwnedCard | null>;
  findPublished(slug: string): Promise<OwnedCard | null>;
  updateOwnedLogo(userPublicId:string,publicId:string,logoPath:string,now:Date):Promise<{card:OwnedCard;previousPath:string|null}|null>;
}
