import { Router } from 'express';
import type { AuthController } from '../controllers/auth-controller.ts';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  router.post('/register', controller.register);
  router.post('/email/verify-otp', controller.verifyOtp);
  router.post('/email/resend-otp', controller.resendOtp);
  router.post('/login', controller.login);
  router.get('/csrf', controller.csrf);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);
  return router;
}
