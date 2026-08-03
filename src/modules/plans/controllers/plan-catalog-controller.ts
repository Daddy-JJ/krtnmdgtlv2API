import type { Request, Response } from 'express';
import type { PlanCatalogRepository } from '../repositories/plan-catalog-repository.ts';

export class PlanCatalogController {
  readonly #repository: PlanCatalogRepository;

  constructor(repository: PlanCatalogRepository) {
    this.#repository = repository;
  }

  list = async (_request: Request, response: Response): Promise<void> => {
    response.json({
      success: true,
      message: 'Plans retrieved.',
      data: await this.#repository.listActivePlans(),
    });
  };
}
