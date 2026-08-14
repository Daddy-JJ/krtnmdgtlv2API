import { Router } from 'express';
import type { LandingContentController } from '../controllers/landing-content-controller.ts';

export function createPublicLandingContentRouter(controller: LandingContentController): Router { const router = Router(); router.get('/landing', controller.public); return router; }
export function createAdminLandingContentRouter(controller: LandingContentController): Router { const router = Router(); router.get('/landing-content', controller.admin); router.put('/landing-content', controller.update); return router; }
