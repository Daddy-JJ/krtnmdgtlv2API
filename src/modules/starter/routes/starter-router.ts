import { Router } from 'express';
import type { StarterController } from '../controllers/starter-controller.ts';

export function createStarterRouter(controller: StarterController): Router {
  const router = Router();
  router.post('/cards', controller.create);
  router.put('/cards/:publicId', controller.update);
  router.post('/cards/:publicId/claim', controller.claim);
  return router;
}
