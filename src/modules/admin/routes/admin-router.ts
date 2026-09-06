import { Router } from 'express';
import type { AdminController } from '../controllers/admin-controller.ts';
import type { SuperAdminController } from '../controllers/super-admin-controller.ts';
import type { AdminMailController } from '../controllers/admin-mail-controller.ts';
import type { EmailTemplateAdminController } from '../controllers/email-template-admin-controller.ts';

export function createAdminRouter(controller: AdminController, superAdmin?: SuperAdminController, mail?: AdminMailController, templates?: EmailTemplateAdminController): Router {
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
  if (mail) {
    router.get('/mail/outbox', mail.list);
    router.post('/mail/outbox/:publicId/retry', mail.retry);
  }
  if (templates) {
    router.get('/mail/templates', templates.list);
    router.get('/mail/templates/:key', templates.detail);
    router.put('/mail/templates/:key/draft', templates.save);
    router.post('/mail/templates/:key/preview', templates.preview);
    router.post('/mail/templates/:key/test-send', templates.testSend);
    router.get('/mail/templates/:key/test-sends/:testId', templates.testStatus);
    router.post('/mail/templates/:key/publish', templates.publish);
    router.get('/mail/templates/:key/versions', templates.versions);
    router.get('/mail/templates/:key/versions/:version', templates.version);
    router.post('/mail/templates/:key/restore', templates.restore);
  }
  return router;
}
