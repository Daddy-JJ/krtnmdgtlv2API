import type { LandingContent } from '../dto/landing-content.ts';

export interface LandingContentRepository {
  read(): Promise<LandingContent>;
  update(actorPublicId: string, content: LandingContent, reason: string): Promise<{ updatedAt: string }>;
}
