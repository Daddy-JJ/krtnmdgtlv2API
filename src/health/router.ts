import { Router } from 'express';
import type { HealthCheck } from './health-check.ts';

export function createHealthRouter(database: HealthCheck, environment: string): Router {
  const router = Router();

  router.get('/', async (_request, response, next) => {
    try {
      const result = await database.check();

      if (!result.healthy) {
        response.status(503).json({
          success: false,
          message: 'Service is unavailable.',
          code: 'SERVICE_UNAVAILABLE',
          data: { status: 'unhealthy', database: 'unavailable' },
        });
        return;
      }

      response.json({
        success: true,
        message: 'Healthy',
        data: {
          status: 'healthy',
          environment,
          database: 'available',
          databaseLatencyMs: result.latencyMs,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
