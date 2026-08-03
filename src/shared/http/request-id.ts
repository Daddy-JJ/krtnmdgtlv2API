import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const validRequestId = /^[A-Za-z0-9._-]{8,100}$/;

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const candidate = request.header('x-request-id');
  const requestId = candidate && validRequestId.test(candidate) ? candidate : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-ID', requestId);
  next();
};
