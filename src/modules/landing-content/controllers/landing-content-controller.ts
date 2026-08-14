import type { Request, Response } from 'express';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import { AppError } from '../../../shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import { landingContentUpdateSchema } from '../dto/landing-content.ts';
import type { LandingContentService } from '../services/landing-content-service.ts';

export class LandingContentController {
  private readonly service: LandingContentService;
  private readonly actors: AuthenticatedActorService;
  constructor(service: LandingContentService, actors: AuthenticatedActorService) { this.service = service; this.actors = actors; }
  public = async (_request: Request, response: Response): Promise<void> => { response.set('Cache-Control', 'no-store').json({ success: true, message: 'Landing content retrieved.', data: await this.service.publicContent() }); };
  admin = async (request: Request, response: Response): Promise<void> => { const actor = this.actors.authenticate(readCookie(request, 'access_token') ?? undefined); response.json({ success: true, message: 'Landing content retrieved.', data: await this.service.adminContent(actor.userPublicId) }); };
  update = async (request: Request, response: Response): Promise<void> => {
    const actor = this.actors.authorizeUnsafe(readCookie(request, 'access_token') ?? undefined, request.header('x-csrf-token'));
    const parsed = landingContentUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
    const result = await this.service.update(actor.userPublicId, actor.sessionId, parsed.data.content, parsed.data.reason);
    response.json({ success: true, message: 'Landing content published.', data: { content: await this.service.adminContent(actor.userPublicId), ...result } });
  };
}
