import { Router } from 'express';
import type { PlanCatalogController } from '../controllers/plan-catalog-controller.ts';

export function createPlanRouter(controller: PlanCatalogController): Router {
  const router = Router();
  router.get('/', controller.list);
  return router;
}
