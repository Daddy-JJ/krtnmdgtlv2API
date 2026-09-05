import type { Request, Response } from 'express';
import { AppError } from '../../../shared/http/errors.ts';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import type { AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import type { RbacService } from '../../../shared/security/rbac-service.ts';
import type { AdminDataListInput, AdminDataRepository } from '../repositories/admin-data-repository.ts';
import { isAdminDataResource, type AdminDataResource } from '../resources/admin-data-resources.ts';

function objectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, field: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AppError(422, 'VALIDATION_ERROR', `${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export class AdminDataController {
  readonly #repository: AdminDataRepository;
  readonly #actors: AuthenticatedActorService;
  readonly #rbac: RbacService;

  constructor(repository: AdminDataRepository, actors: AuthenticatedActorService, rbac: RbacService) {
    this.#repository = repository;
    this.#actors = actors;
    this.#rbac = rbac;
  }

  catalog = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#authenticate(request, false);
    await this.#rbac.assert(actor.userPublicId, 'data.read');
    response.json({ success: true, message: 'Administrative data resources retrieved.', data: await this.#repository.catalog() });
  };

  list = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#authenticate(request, false);
    await this.#rbac.assert(actor.userPublicId, 'data.read');
    const result = await this.#repository.list(this.#resource(request), this.#listInput(request));
    response.json({ success: true, message: 'Records retrieved.', data: result.items, meta: result.pagination });
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#authenticate(request, false);
    await this.#rbac.assert(actor.userPublicId, 'data.read');
    response.json({ success: true, message: 'Record retrieved.', data: await this.#repository.get(this.#resource(request), this.#identifier(request)) });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#authenticate(request, true);
    await this.#rbac.assert(actor.userPublicId, 'data.manage');
    const data = await this.#repository.create(this.#resource(request), objectBody(request.body), {
      actorPublicId: actor.userPublicId,
      requestId: this.#requestId(response),
    });
    response.status(201).json({ success: true, message: 'Record created.', data });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#authenticate(request, true);
    await this.#rbac.assert(actor.userPublicId, 'data.manage');
    const data = await this.#repository.update(this.#resource(request), this.#identifier(request), objectBody(request.body), {
      actorPublicId: actor.userPublicId,
      requestId: this.#requestId(response),
    });
    response.json({ success: true, message: 'Record updated.', data });
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    const actor = this.#authenticate(request, true);
    await this.#rbac.assert(actor.userPublicId, 'data.manage');
    const data = await this.#repository.delete(this.#resource(request), this.#identifier(request), {
      actorPublicId: actor.userPublicId,
      requestId: this.#requestId(response),
    });
    response.json({ success: true, message: 'Record deleted.', data });
  };

  #authenticate(request: Request, unsafe: boolean) {
    const token = readCookie(request, 'access_token') ?? undefined;
    return unsafe
      ? this.#actors.authorizeUnsafe(token, request.header('x-csrf-token'))
      : this.#actors.authenticate(token);
  }

  #resource(request: Request): AdminDataResource {
    const resource = String(request.params.resource ?? '');
    if (!isAdminDataResource(resource)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Administrative data resource was not found.');
    return resource;
  }

  #identifier(request: Request): string {
    const identifier = String(request.params.identifier ?? '');
    if (identifier.length === 0 || identifier.length > 500) throw new AppError(422, 'VALIDATION_ERROR', 'Record identifier is invalid.');
    return identifier;
  }

  #listInput(request: Request): AdminDataListInput {
    const page = boundedInteger(request.query.page, 1, 1, 1_000_000, 'page');
    const limit = boundedInteger(request.query.limit, 20, 1, 100, 'limit');
    const orderValue = queryString(request.query.order)?.toLowerCase() ?? 'desc';
    if (orderValue !== 'asc' && orderValue !== 'desc') throw new AppError(422, 'VALIDATION_ERROR', 'order must be asc or desc.');
    const sort = queryString(request.query.sort);
    if (sort && !/^[a-z][a-z0-9_]*$/i.test(sort)) throw new AppError(422, 'VALIDATION_ERROR', 'sort is invalid.');
    const search = queryString(request.query.search)?.trim();
    if (search && search.length > 200) throw new AppError(422, 'VALIDATION_ERROR', 'search must not exceed 200 characters.');
    const filters: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.query)) {
      const match = /^filter\[([a-z][a-z0-9_]*)\]$/i.exec(key);
      if (match?.[1] && typeof value === 'string') filters[match[1]] = value;
    }
    return {
      page,
      limit,
      order: orderValue,
      filters,
      ...(sort ? { sort } : {}),
      ...(search ? { search } : {}),
    };
  }

  #requestId(response: Response): string | null {
    const value = response.locals.requestId;
    return typeof value === 'string' && value !== '' ? value : null;
  }
}
