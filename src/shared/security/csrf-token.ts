import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class CsrfTokenService {
  readonly #secret: Buffer;

  constructor(secret: string) {
    this.#secret = Buffer.from(secret, 'utf8');
    if (this.#secret.length < 32) throw new Error('CSRF HMAC key must contain at least 32 bytes.');
  }

  issue(bindingId: string): string {
    const nonce = randomBytes(32).toString('base64url');
    return `${nonce}.${this.#signature(bindingId, nonce)}`;
  }

  verify(token: string, bindingId: string): boolean {
    const [nonce, suppliedSignature, extra] = token.split('.');
    if (!nonce || !suppliedSignature || extra !== undefined) return false;
    const expectedSignature = this.#signature(bindingId, nonce);
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    const expected = Buffer.from(expectedSignature, 'base64url');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  #signature(bindingId: string, nonce: string): string {
    return createHmac('sha256', this.#secret).update(`${bindingId}.${nonce}`, 'utf8').digest('base64url');
  }
}
