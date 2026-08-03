import type { Request, Response } from 'express';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import { AppError } from '../../../shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import { feedbackInputSchema } from '../dto/feedback-input.ts';
import type { FeedbackService } from '../services/feedback-service.ts';

export class FeedbackController {
  readonly #service: FeedbackService;
  readonly #actors: AuthenticatedActorService;
  constructor(service: FeedbackService, actors: AuthenticatedActorService) { this.#service = service; this.#actors = actors; }

  submit = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#actors.authorizeUnsafe(readCookie(request, 'access_token') ?? undefined, request.header('x-csrf-token'));
    const parsed = feedbackInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
    }
    response.status(201).json({ success: true, message: 'Feedback submitted.', data: { feedback: await this.#service.submit(actor.userPublicId, parsed.data.message) } });
  };
}
