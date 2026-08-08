import { Router } from 'express';
import type { AdminController } from '../controllers/admin-controller.ts';
import type { SuperAdminController } from '../controllers/super-admin-controller.ts';

export function createAdminRouter(controller: AdminController, superAdmin?: SuperAdminController): Router {
  const router = Router();
  router.get('/plans', controller.plans);
  router.put('/plans/:code', controller.updatePlan);
  router.get('/payments', controller.payments);
  router.get('/users', controller.users);
  router.get('/cards', controller.cards);
  router.get('/themes', controller.themes);
  router.put('/themes/:code', controller.updateTheme);
  router.get('/activity', controller.activity);
  if (superAdmin) {
    router.get('/statistics', superAdmin.statistics);
    router.get('/users/:publicId', superAdmin.user);
    router.post('/users/:publicId/interventions', superAdmin.intervene);
    router.get('/cv-specialists', superAdmin.specialists);
    router.get('/subscriptions', superAdmin.subscriptions);
    router.get('/usage', superAdmin.usage);
    router.get('/interventions', superAdmin.interventions);
    router.get('/settings', superAdmin.settings);
  }
  return router;
}
