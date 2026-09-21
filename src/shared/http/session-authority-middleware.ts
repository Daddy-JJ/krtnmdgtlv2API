import type { RequestHandler } from 'express';
import { readCookie } from './cookie-reader.ts';
import { AppError } from './errors.ts';
import type { AuthenticatedActorService } from '../security/authenticated-actor.ts';
import type { SessionAuthority } from '../security/session-authority.ts';
import type { RateLimiter } from '../../modules/auth/repositories/auth-repository.ts';

export function sessionAuthorityMiddleware(actors: AuthenticatedActorService, authority: SessionAuthority, limiter?: RateLimiter): RequestHandler {
  return async (request, _response, next) => {
    try {
      const accessToken = readCookie(request, 'access_token');
      if (!accessToken) {
        throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
      }
      const actor = actors.authenticate(accessToken);
      if (!await authority.isActive(actor.userPublicId, actor.sessionId)) {
        throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
      }
      const upload = request.method === 'POST' && /^\/(cards\/[^/]+\/logo|resume-requests\/[^/]+\/files)\/?$/i.test(request.path);
      // Reject forged cross-site uploads before multer allocates file buffers.
      if (upload) actors.authorizeUnsafe(accessToken, request.header('x-csrf-token'));
      if (limiter && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const action = upload ? 'private-upload' : 'private-mutation';
        if (!await limiter.consume(`${action}:ip`, request.ip ?? 'unknown', upload ? 30 : 240, 60)
          || !await limiter.consume(`${action}:user`, actor.userPublicId, upload ? 10 : 120, 60)) {
          throw new AppError(429, 'RATE_LIMITED', 'Too many requests.');
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
