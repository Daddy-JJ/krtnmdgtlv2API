import { Router } from 'express';
import type { AccountController } from '../controllers/account-controller.ts';

export function createAccountRouter(controller: AccountController): Router {
  const router = Router();
  router.get('/', controller.getCurrentUser);
  router.put('/', controller.updateCurrentUser);
  return router;
}
