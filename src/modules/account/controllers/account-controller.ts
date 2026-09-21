import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../../../shared/http/errors.ts';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import type { AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import { updateCurrentUserInputSchema } from '../dto/account-input.ts';
import type { AccountService } from '../services/account-service.ts';
import type { RbacService } from '../../../shared/security/rbac-service.ts';

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  }
  return result.data;
}

export class AccountController {
  readonly #service: AccountService;
  readonly #actors: AuthenticatedActorService;
  readonly #rbac: RbacService;
  constructor(service: AccountService, actors: AuthenticatedActorService, rbac: RbacService) { this.#service = service; this.#actors = actors; this.#rbac = rbac; }

  getCurrentUser = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#actors.authenticate(readCookie(request, 'access_token') ?? undefined);
    response.json({ success: true, message: 'Current user retrieved.', data: { user: await this.#service.currentUser(actor.userPublicId) } });
  };

  updateCurrentUser = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#actors.authorizeUnsafe(readCookie(request, 'access_token') ?? undefined, request.header('x-csrf-token'));
    const input = parse(updateCurrentUserInputSchema, request.body);
    await this.#rbac.assertRecentSession(actor.userPublicId, actor.sessionId);
    response.json({ success: true, message: 'Current user updated. Sign in again if the email changed.', data: { user: await this.#service.updateCurrentUser(actor.userPublicId, input.email, input.currentPassword) } });
  };
}
