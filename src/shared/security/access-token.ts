import { createSign, createVerify } from 'node:crypto';
import { normalizeRole, type CompatibleRole, type PlatformRole } from './roles.ts';

type AccessTokenClaims = Readonly<{
  sub: string;
  sid: string;
  role: PlatformRole;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}>;

export type AccessTokenInput = Readonly<{
  userPublicId: string;
  sessionId: string;
  role: CompatibleRole;
}>;

export type AccessTokenConfig = Readonly<{
  privateKey: string;
  publicKey: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}>;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export class Rs256AccessTokenService {
  readonly #config: AccessTokenConfig;

  constructor(config: AccessTokenConfig) {
    this.#config = config;
  }

  issue(input: AccessTokenInput, now = new Date()): string {
    const role = normalizeRole(input.role);
    if (!role) throw new Error('Unsupported account role.');
    const issuedAt = Math.floor(now.getTime() / 1000);
    const header = encode({ alg: 'RS256', typ: 'JWT' });
    const payload = encode({
      sub: input.userPublicId,
      sid: input.sessionId,
      role,
      iss: this.#config.issuer,
      aud: this.#config.audience,
      iat: issuedAt,
      exp: issuedAt + this.#config.ttlSeconds,
    } satisfies AccessTokenClaims);
    const signingInput = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${signer.sign(this.#config.privateKey).toString('base64url')}`;
  }

  verify(token: string, now = new Date()): AccessTokenClaims | null {
    const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature || extra !== undefined) return null;

    try {
      const header = decodeJson(encodedHeader);
      if (!header || typeof header !== 'object' || (header as Record<string, unknown>).alg !== 'RS256') return null;
      const verifier = createVerify('RSA-SHA256');
      verifier.update(`${encodedHeader}.${encodedPayload}`);
      verifier.end();
      const signature = Buffer.from(encodedSignature, 'base64url');
      if (signature.toString('base64url') !== encodedSignature) return null;
      if (!verifier.verify(this.#config.publicKey, signature)) return null;

      const claims = decodeJson(encodedPayload);
      if (!this.#validClaims(claims, Math.floor(now.getTime() / 1000))) return null;
      return claims;
    } catch {
      return null;
    }
  }

  #validClaims(value: unknown, now: number): value is AccessTokenClaims {
    if (!value || typeof value !== 'object') return false;
    const claims = value as Record<string, unknown>;
    const role = typeof claims.role === 'string' ? normalizeRole(claims.role) : null;
    if (role) claims.role = role;
    return typeof claims.sub === 'string'
      && typeof claims.sid === 'string'
      && role !== null
      && claims.iss === this.#config.issuer
      && claims.aud === this.#config.audience
      && typeof claims.iat === 'number'
      && typeof claims.exp === 'number'
      && claims.iat <= now
      && claims.exp > now;
  }
}
