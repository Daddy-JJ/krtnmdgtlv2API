import type { Request, Response } from 'express';
import { z } from 'zod';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import { AppError } from '../../../shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import type { RbacService } from '../../../shared/security/rbac-service.ts';
import type { SuperAdminService } from '../services/super-admin-service.ts';

const reason = z.string().trim().min(10).max(1000);
const confirmed = { reason, confirm: z.literal(true) };
const intervention = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SUSPEND_USER'), ...confirmed }).strict(),
  z.object({ action: z.literal('ACTIVATE_USER'), ...confirmed }).strict(),
  z.object({
    action: z.literal('GRANT_ROLE'),
    roleCode: z.enum(['member', 'cv_specialist', 'resume_quality_reviewer', 'resume_service_admin', 'super_admin']),
    ...confirmed,
  }).strict(),
  z.object({
    action: z.literal('EXTEND_SUBSCRIPTION'),
    days: z.number().int().min(1).max(3650),
    ...confirmed,
  }).strict(),
  z.object({ action: z.literal('RESET_RESUME_ENTITLEMENT'), ...confirmed }).strict(),
]);

export class SuperAdminController {
  readonly #service: SuperAdminService;
  readonly #actors: AuthenticatedActorService;
  readonly #rbac: RbacService;

  constructor(service: SuperAdminService, actors: AuthenticatedActorService, rbac: RbacService) {
    this.#service = service;
    this.#actors = actors;
    this.#rbac = rbac;
  }

  statistics = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.json({ success: true, message: 'Operational statistics retrieved.', data: await this.#service.statistics(actor.userPublicId) });
  };

  user = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.json({ success: true, message: 'User detail retrieved.', data: await this.#service.user(actor.userPublicId, String(request.params.publicId)) });
  };

  specialists = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.json({ success: true, message: 'CV specialists retrieved.', data: await this.#service.specialists(actor.userPublicId) });
  };

  subscriptions = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.json({ success: true, message: 'Subscriptions retrieved.', data: await this.#service.subscriptions(actor.userPublicId) });
  };

  usage = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.json({ success: true, message: 'Usage adjustments retrieved.', data: await this.#service.usage(actor.userPublicId) });
  };

  interventions = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.json({ success: true, message: 'Interventions retrieved.', data: await this.#service.interventions(actor.userPublicId) });
  };

  settings = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.json({ success: true, message: 'Sanitized read-only settings retrieved.', data: await this.#service.settings(actor.userPublicId) });
  };

  intervene = async (request: Request, response: Response) => {
    const actor = this.#unsafe(request);
    const parsed = intervention.safeParse(request.body);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.');
    await this.#rbac.assertRecentSession(actor.userPublicId, actor.sessionId);
    response.json({
      success: true,
      message: 'Controlled intervention applied.',
      data: await this.#service.intervene(
        actor.userPublicId,
        String(request.params.publicId),
        parsed.data,
        String(response.locals.requestId ?? ''),
      ),
    });
  };

  #safe(request: Request) {
    return this.#actors.authenticate(readCookie(request, 'access_token') ?? undefined);
  }

  #unsafe(request: Request) {
    return this.#actors.authorizeUnsafe(readCookie(request, 'access_token') ?? undefined, request.header('x-csrf-token'));
  }
}
