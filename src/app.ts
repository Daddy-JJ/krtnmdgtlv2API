import express, { type Express } from 'express';
import helmet from 'helmet';
import type { HealthCheck } from './health/health-check.ts';
import { createHealthRouter } from './health/router.ts';
import type { Router } from 'express';
import { errorHandler, notFoundHandler } from './shared/http/error-handler.ts';
import { requestIdMiddleware } from './shared/http/request-id.ts';
import { jsonLogger, type Logger } from './shared/logging/logger.ts';

export type AppDependencies = Readonly<{
  databaseHealth: HealthCheck;
  environment: string;
  debug?: boolean;
  logger?: Logger;
  corsAllowedOrigins?: readonly string[];
  authRouter?: Router;
  accountRouter?: Router;
  starterRouter?: Router;
  cardRouter?: Router;
  planRouter?: Router;
  themeRouter?: Router;
  publicCardRouter?: Router;
  publicVCardRouter?: Router;
  publicQrRouter?: Router;
  cardContentRouter?: Router;
  logoRouter?:Router;
  publicLogoRouter?:Router;
  paymentRouter?:Router;
  subscriptionRouter?:Router;
  adminRouter?:Router;
  resumeRouter?:Router;
  resumeRequestRouter?:Router;
  adminResumeRouter?:Router;
  feedbackRouter?:Router;
  publicLandingContentRouter?: Router;
  adminLandingContentRouter?: Router;
}>;

export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  const logger = dependencies.logger ?? jsonLogger;

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb', strict: true }));
  app.use((request, response, next) => {
    const origin = request.header('origin');
    if (origin && dependencies.corsAllowedOrigins?.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Request-ID');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      response.append('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });
  app.use(requestIdMiddleware);
  app.use((request, response, next) => {
    const startedAt = performance.now();
    response.on('finish', () => {
      logger.info('request.completed', {
        request_id: String(response.locals.requestId ?? ''),
        route: request.path,
        method: request.method,
        status: response.statusCode,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    });
    next();
  });

  app.use('/api/v1/health', createHealthRouter(dependencies.databaseHealth, dependencies.environment));
  if (dependencies.authRouter) app.use('/api/v1/auth', dependencies.authRouter);
  if (dependencies.accountRouter) app.use('/api/v1/me', dependencies.accountRouter);
  if (dependencies.starterRouter) app.use('/api/v1/starter', dependencies.starterRouter);
  if (dependencies.cardRouter) app.use('/api/v1/cards', dependencies.cardRouter);
  if (dependencies.cardContentRouter) app.use('/api/v1/cards', dependencies.cardContentRouter);
  if(dependencies.logoRouter)app.use('/api/v1/cards',dependencies.logoRouter);
  if (dependencies.planRouter) app.use('/api/v1/plans', dependencies.planRouter);
  if (dependencies.themeRouter) app.use('/api/v1/themes', dependencies.themeRouter);
  if (dependencies.publicCardRouter) app.use('/api/v1/public/cards', dependencies.publicCardRouter);
  if (dependencies.publicVCardRouter) app.use('/api/v1/public/cards', dependencies.publicVCardRouter);
  if (dependencies.publicQrRouter) app.use('/api/v1/public/cards', dependencies.publicQrRouter);
  if(dependencies.publicLogoRouter)app.use('/api/v1/public/cards',dependencies.publicLogoRouter);
  if (dependencies.publicLandingContentRouter) app.use('/api/v1/public/content', dependencies.publicLandingContentRouter);
  if(dependencies.paymentRouter)app.use('/api/v1/payments',dependencies.paymentRouter);
  if(dependencies.subscriptionRouter)app.use('/api/v1/subscriptions',dependencies.subscriptionRouter);
  if(dependencies.adminRouter)app.use('/api/v1/admin',dependencies.adminRouter);
  if (dependencies.adminLandingContentRouter) app.use('/api/v1/admin', dependencies.adminLandingContentRouter);
  if(dependencies.resumeRouter)app.use('/api/v1/resume-service',dependencies.resumeRouter);
  if(dependencies.resumeRequestRouter)app.use('/api/v1/resume-requests',dependencies.resumeRequestRouter);
  if(dependencies.adminResumeRouter)app.use('/api/v1/admin/resume-requests',dependencies.adminResumeRouter);
  if(dependencies.feedbackRouter)app.use('/api/v1/feedback',dependencies.feedbackRouter);
  app.use(notFoundHandler());
  app.use(errorHandler(logger, dependencies.debug ?? false));

  return app;
}
