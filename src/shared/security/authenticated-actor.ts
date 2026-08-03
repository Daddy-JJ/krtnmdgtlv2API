import { AppError } from '../http/errors.ts';
import type { Rs256AccessTokenService } from './access-token.ts';
import type { CsrfTokenService } from './csrf-token.ts';
import type { CompatibleRole } from './roles.ts';

export type AuthenticatedActor = Readonly<{ userPublicId: string; sessionId: string; role: CompatibleRole }>;

export class AuthenticatedActorService {
  readonly #accessTokens: Rs256AccessTokenService;
  readonly #csrf: CsrfTokenService;
  constructor(accessTokens: Rs256AccessTokenService, csrf: CsrfTokenService) { this.#accessTokens = accessTokens; this.#csrf = csrf; }

  authenticate(accessToken: string | undefined): AuthenticatedActor {
    const claims = accessToken ? this.#accessTokens.verify(accessToken) : null;
    if (!claims) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return { userPublicId: claims.sub, sessionId: claims.sid, role: claims.role };
  }

  authorizeUnsafe(accessToken: string | undefined, csrfToken: string | undefined): AuthenticatedActor {
    const actor = this.authenticate(accessToken);
    if (!csrfToken || !this.#csrf.verify(csrfToken, actor.sessionId)) {
      throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    }
    return actor;
  }
}
