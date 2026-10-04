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

  candidates = async (request: Request, response: Response): Promise<void> => {
    response.set('Cache-Control','no-store');
    const access=readCookie(request,'access_token');
    if(!access)throw new AppError(401,'AUTH_REQUIRED','Authentication is required.');
    const page=z.object({limit:z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(20)).default(20),
      offset:z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().int().min(0).max(1000)).default(0)}).strict().safeParse(request.query);
    if(!page.success)throw this.#validation(page.error.issues);
    response.json({success:true,message:'Starter claim candidates retrieved.',data:await this.#service.listCandidates(access,page.data.limit,page.data.offset)});
  };

  confirmCandidate = async (request: Request, response: Response): Promise<void> => {
    response.set('Cache-Control','no-store');
    const access=readCookie(request,'access_token'),csrf=request.header('x-csrf-token');
    if(!access)throw new AppError(401,'AUTH_REQUIRED','Authentication is required.');
    if(!csrf)throw new AppError(403,'CSRF_INVALID','CSRF validation failed.');
    const id=publicIdSchema.safeParse(request.params.publicId),body=z.object({confirm:z.literal(true)}).strict().safeParse(request.body);
    if(!id.success||!body.success)throw this.#validation([...(id.success?[]:id.error.issues),...(body.success?[]:body.error.issues)]);
    const result=await this.#service.claimCandidate(id.data,access,csrf);
    response.clearCookie('starter_manage',this.#cookies.clear('/api/v1/starter'));
    response.clearCookie('starter_csrf_token',this.#cookies.clear('/',false));
    response.json({success:true,message:result.alreadyOwned?'Starter card already belongs to this account.':'Starter card claimed.',data:result});
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const parsed = starterCardInputSchema.safeParse(request.body);
    if (!parsed.success) throw this.#validation(parsed.error.issues);
    const result = await this.#service.create(parsed.data, request.ip ?? 'unknown');
    this.#setManage(response, result);
    response.status(201).json({ success: true, message: 'Starter card created.', data: result.card });
  };

  openAccess = async (request: Request, response: Response): Promise<void> => {
    const parsed = z.object({ publicId: publicIdSchema, token: z.string().min(1).max(256) }).strict().safeParse(request.body);
    if (!parsed.success) throw this.#validation(parsed.error.issues);
    const result = await this.#service.openAccess(parsed.data.publicId, parsed.data.token, request.ip ?? 'unknown');
    this.#setManage(response, result);
    response.set('Cache-Control', 'no-store');
    response.json({ success: true, message: 'Starter access opened.', data: result.card });
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

  signupContext = async (request: Request, response: Response): Promise<void> => {
    response.set('Cache-Control', 'no-store');
    const publicId = publicIdSchema.safeParse(request.params.publicId);
    if (!publicId.success) throw this.#validation(publicId.error.issues);
    const manage = readCookie(request, 'starter_manage');
    if (!manage) throw new AppError(401, 'STARTER_TOKEN_INVALID', 'Starter management access is invalid.');
    const context = await this.#service.signupContext(publicId.data, manage);
    response.json({ success: true, data: context });
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
