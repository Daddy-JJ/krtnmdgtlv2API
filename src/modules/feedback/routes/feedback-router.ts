import { Router } from 'express';
import type { FeedbackController } from '../controllers/feedback-controller.ts';

export function createFeedbackRouter(controller: FeedbackController): Router {
  const router = Router();
  router.post('/', controller.submit);
  return router;
}
