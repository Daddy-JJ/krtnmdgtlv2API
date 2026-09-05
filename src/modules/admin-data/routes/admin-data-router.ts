import { Router, type Router as ExpressRouter } from 'express';
import type { AdminDataController } from '../controllers/admin-data-controller.ts';

export function createAdminDataRouter(controller: AdminDataController): ExpressRouter {
  const router = Router();
  router.get('/', controller.catalog);
  router.get('/:resource', controller.list);
  router.get('/:resource/:identifier', controller.get);
  router.post('/:resource', controller.create);
  router.put('/:resource/:identifier', controller.update);
  router.delete('/:resource/:identifier', controller.delete);
  return router;
}
