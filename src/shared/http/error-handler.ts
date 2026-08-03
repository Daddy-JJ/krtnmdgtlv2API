import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../logging/logger.ts';
import { AppError } from './errors.ts';

export function notFoundHandler(): RequestHandler {
  return (_request, response) => {
    response.status(404).json({
      success: false,
      message: 'Resource not found.',
      code: 'NOT_FOUND',
      data: null,
    });
  };
}

export function errorHandler(logger: Logger, debug: boolean): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    const known = error instanceof AppError;
    const status = known ? error.status : 500;
    const code = known ? error.code : 'INTERNAL_SERVER_ERROR';
    const message = known ? error.message : 'An unexpected error occurred.';

    logger.error('request.failed', {
      request_id: String(response.locals.requestId ?? ''),
      route: request.path,
      method: request.method,
      status,
      error_name: error instanceof Error ? error.name : 'UnknownError',
    });

    response.status(status).json({
      success: false,
      message,
      code,
      ...(known && code === 'VALIDATION_ERROR' ? { errors: error.details } : { data: known ? error.details : null }),
      ...(debug && error instanceof Error ? { debug: error.message } : {}),
    });
  };
}
