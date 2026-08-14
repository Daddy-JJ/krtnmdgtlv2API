import type { RbacService } from '../../../shared/security/rbac-service.ts';
import type { LandingContent } from '../dto/landing-content.ts';
import type { LandingContentRepository } from '../repositories/landing-content-repository.ts';

export class LandingContentService {
  private readonly repository: LandingContentRepository;
  private readonly rbac: RbacService;
  constructor(repository: LandingContentRepository, rbac: RbacService) { this.repository = repository; this.rbac = rbac; }
  publicContent(): Promise<LandingContent> { return this.repository.read(); }
  async adminContent(actor: string): Promise<LandingContent> { await this.rbac.assert(actor, 'settings.manage'); return this.repository.read(); }
  async update(actor: string, sessionId: string, content: LandingContent, reason: string): Promise<{ updatedAt: string }> {
    await this.rbac.assert(actor, 'settings.manage');
    await this.rbac.assertRecentSession(actor, sessionId);
    return this.repository.update(actor, content, reason);
  }
}
