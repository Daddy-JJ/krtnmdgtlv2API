import type { Request, Response } from 'express';
import { z } from 'zod';
import { starterCardInputSchema } from '../../auth/dto/starter-input.ts';
import { AppError } from '../../../shared/http/errors.ts';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import type { CookiePolicy } from '../../../shared/security/cookie-policy.ts';
import type { StarterService } from '../services/starter-service.ts';

const publicIdSchema = z.uuid();

export class StarterController {
  readonly #service: StarterService;
  readonly #cookies: CookiePolicy;
  constructor(service: StarterService, cookies: CookiePolicy) { this.#service = service; this.#cookies = cookies; }

  create = async (request: Request, response: Response): Promise<void> => {
    const parsed = starterCardInputSchema.safeParse(request.body);
    if (!parsed.success) throw this.#validation(parsed.error.issues);
    const result = await this.#service.create(parsed.data, request.ip ?? 'unknown');
    this.#setManage(response, result);
    response.status(201).json({ success: true, message: 'Starter card created.', data: result.card });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const publicId = publicIdSchema.safeParse(request.params.publicId);
    const input = starterCardInputSchema.safeParse(request.body);
    if (!publicId.success || !input.success) throw this.#validation([...(publicId.success ? [] : publicId.error.issues), ...(input.success ? [] : input.error.issues)]);
    const manage = readCookie(request, 'starter_manage');
    const csrf = request.header('x-csrf-token');
    if (!manage) throw new AppError(401, 'STARTER_TOKEN_INVALID', 'Starter management access is invalid.');
    if (!csrf) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    const result = await this.#service.update(publicId.data, manage, csrf, input.data);
    this.#setManage(response, result);
    response.json({ success: true, message: 'Starter card updated.', data: result.card });
  };

  claim = async (request: Request, response: Response): Promise<void> => {
    const publicId = publicIdSchema.safeParse(request.params.publicId);
    if (!publicId.success) throw this.#validation(publicId.error.issues);
    const manage = readCookie(request, 'starter_manage');
    const access = readCookie(request, 'access_token');
    const csrf = request.header('x-csrf-token');
    if (!access) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    if (!manage) throw new AppError(401, 'STARTER_TOKEN_INVALID', 'Starter management access is invalid.');
    if (!csrf) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    const result = await this.#service.claim(publicId.data, manage, csrf, access);
    response.clearCookie('starter_manage', this.#cookies.clear('/api/v1/starter'));
    response.clearCookie('starter_csrf_token', this.#cookies.clear('/', false));
    response.cookie('csrf_token', result.csrfToken, this.#cookies.csrf());
    response.json({ success: true, message: 'Starter card claimed.', data: result.card });
  };

  #setManage(response: Response, result: { manageToken: string; csrfToken: string }): void {
    response.cookie('starter_manage', result.manageToken, this.#cookies.starterManage());
    response.cookie('starter_csrf_token', result.csrfToken, this.#cookies.csrf());
  }

  #validation(issues: readonly { path: PropertyKey[]; message: string }[]): AppError {
    return new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  }
}
