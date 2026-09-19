import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../logging/logger.ts';
import { AppError } from './errors.ts';

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Z0-9_-]{1,80}$/.test(code) ? code : null;
}

function safeStackFrames(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  const frames = error.stack.split(/\r?\n/).slice(1, 6).map((line) => line.trim()).filter(Boolean);
  return frames.length > 0 ? frames.join(' | ') : null;
}

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
    const invalidJson = error instanceof SyntaxError
      && typeof error === 'object'
      && (error as { status?: unknown }).status === 400
      && (error as { type?: unknown }).type === 'entity.parse.failed';
    const status = known ? error.status : invalidJson ? 400 : 500;
    const code = known ? error.code : invalidJson ? 'INVALID_JSON' : 'INTERNAL_SERVER_ERROR';
    const message = known ? error.message : invalidJson ? 'Request body contains invalid JSON.' : 'An unexpected error occurred.';

    logger.error('request.failed', {
      request_id: String(response.locals.requestId ?? ''),
      route: request.path,
      method: request.method,
      status,
      error_name: error instanceof Error ? error.name : 'UnknownError',
      error_code: safeErrorCode(error),
      error_stack: safeStackFrames(error),
    });

    response.status(status).json({
      success: false,
      message,
      code,
      ...(known && code === 'VALIDATION_ERROR' ? { errors: error.details } : { data: known ? error.details : null }),
      ...(debug && !invalidJson && error instanceof Error ? { debug: error.message } : {}),
    });
  };
}
