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
    roleCode: z.enum(['member', 'cv_specialist', 'resume_service_admin', 'super_admin']),
    ...confirmed,
  }).strict(),
  z.object({
    action: z.literal('EXTEND_SUBSCRIPTION'),
    days: z.number().int().min(1).max(3650),
    ...confirmed,
  }).strict(),
  z.object({ action: z.literal('RESET_RESUME_ENTITLEMENT'), ...confirmed }).strict(),
]);

const feedbackStatus = z.enum(['new', 'in_review', 'planned', 'resolved', 'dismissed']);
const feedbackQuery = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: feedbackStatus.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict();
const feedbackUpdate = z.object({ status: feedbackStatus, ...confirmed }).strict();
const reportQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict();
const cardIntervention = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CONNECT_MATCHING_VERIFIED_ACCOUNT'), ...confirmed }).strict(),
  z.object({ action: z.literal('RELEASE_CARD'), ...confirmed }).strict(),
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

  card = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ success: true, message: 'Card detail retrieved.', data: await this.#service.card(actor.userPublicId, String(request.params.publicId)) });
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

  feedback = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    const parsed = feedbackQuery.safeParse(request.query);
    if (!parsed.success || (parsed.data?.from && parsed.data?.to && parsed.data.from > parsed.data.to)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Feedback filters are invalid.');
    }
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.#service.feedback(actor.userPublicId, parsed.data);
    response.json({ success: true, message: 'Feedback retrieved.', data: result.items, meta: result.pagination });
  };

  updateFeedbackStatus = async (request: Request, response: Response) => {
    const actor = this.#unsafe(request);
    const parsed = feedbackUpdate.safeParse(request.body);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.');
    await this.#rbac.assertRecentSession(actor.userPublicId, actor.sessionId);
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      success: true,
      message: 'Feedback status updated.',
      data: await this.#service.updateFeedbackStatus(
        actor.userPublicId,
        String(request.params.publicId),
        parsed.data,
        String(response.locals.requestId ?? ''),
      ),
    });
  };

  reports = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    const parsed = reportQuery.safeParse(request.query);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Report filters are invalid.');
    response.setHeader('Cache-Control', 'no-store');
    response.json({ success: true, message: 'Operational report retrieved.', data: await this.#service.reports(actor.userPublicId, parsed.data.days) });
  };

  system = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ success: true, message: 'Sanitized system status retrieved.', data: await this.#service.system(actor.userPublicId) });
  };

  security = async (request: Request, response: Response) => {
    const actor = this.#safe(request);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ success: true, message: 'Sanitized security status retrieved.', data: await this.#service.security(actor.userPublicId) });
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

  interveneCard = async (request: Request, response: Response) => {
    const actor = this.#unsafe(request);
    const parsed = cardIntervention.safeParse(request.body);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.');
    await this.#rbac.assertRecentSession(actor.userPublicId, actor.sessionId);
    response.json({
      success: true,
      message: 'Controlled card intervention applied.',
      data: await this.#service.interveneCard(
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
