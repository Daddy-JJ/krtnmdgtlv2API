import { AppError } from '../../../shared/http/errors.ts';
import type { RbacService } from '../../../shared/security/rbac-service.ts';
import type { Intervention, SuperAdminRepository } from '../repositories/super-admin-repository.ts';

const CANONICAL_ROLES = new Set([
  'member',
  'cv_specialist',
  'resume_quality_reviewer',
  'resume_service_admin',
  'super_admin',
]);

export class SuperAdminService {
  readonly #repository: SuperAdminRepository;
  readonly #rbac: RbacService;

  constructor(repository: SuperAdminRepository, rbac: RbacService) {
    this.#repository = repository;
    this.#rbac = rbac;
  }

  async statistics(actor: string) {
    await this.#rbac.assert(actor, 'statistics.read');
    return this.#repository.statistics();
  }

  async user(actor: string, publicId: string) {
    await this.#rbac.assert(actor, 'users.read');
    const user = await this.#repository.user(publicId);
    if (!user) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'User was not found.');
    return user;
  }

  async specialists(actor: string) {
    await this.#rbac.assert(actor, 'specialists.manage');
    return this.#repository.specialists();
  }

  async subscriptions(actor: string) {
    await this.#rbac.assert(actor, 'subscriptions.read');
    return this.#repository.subscriptions();
  }

  async usage(actor: string) {
    await this.#rbac.assert(actor, 'usage.read');
    return this.#repository.usage();
  }

  async interventions(actor: string) {
    await this.#rbac.assert(actor, 'audit.read');
    return this.#repository.interventions();
  }

  async settings(actor: string) {
    await this.#rbac.assert(actor, 'settings.read');
    return this.#repository.settings();
  }

  async intervene(actor: string, targetPublicId: string, input: Intervention, correlationId: string | null) {
    const permission = input.action === 'EXTEND_SUBSCRIPTION'
      ? 'subscriptions.intervene'
      : input.action === 'RESET_RESUME_ENTITLEMENT'
        ? 'resume.admin'
        : 'users.manage';
    await this.#rbac.assert(actor, permission);
    this.#validateIntervention(input);
    return this.#repository.intervene(actor, targetPublicId, input, correlationId);
  }

  #validateIntervention(input: Intervention): void {
    if (input.action === 'GRANT_ROLE') {
      if (!input.roleCode || !CANONICAL_ROLES.has(input.roleCode)) {
        throw new AppError(422, 'INVALID_ROLE', 'A canonical roleCode is required.');
      }
      if (input.days !== undefined) throw new AppError(422, 'VALIDATION_ERROR', 'days is not allowed for role grants.');
      return;
    }
    if (input.action === 'EXTEND_SUBSCRIPTION') {
      if (!input.days || input.days < 1 || input.days > 3650) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Valid days are required.');
      }
      if (input.roleCode !== undefined) throw new AppError(422, 'VALIDATION_ERROR', 'roleCode is not allowed for subscription extensions.');
      return;
    }
    if (input.roleCode !== undefined || input.days !== undefined) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Unexpected intervention fields.');
    }
  }
}
