import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export class OtpCodeService {
  readonly #secret: Buffer;
  constructor(secret: string) {
    this.#secret = Buffer.from(secret, 'utf8');
    if (this.#secret.length < 32) throw new Error('OTP HMAC key must contain at least 32 bytes.');
  }
  issue(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }
  hash(email: string, purpose: string, code: string): string {
    return createHmac('sha256', this.#secret).update(`${purpose}\0${email}\0${code}`).digest('hex');
  }
  verify(expectedHash: string, email: string, purpose: string, code: string): boolean {
    const supplied = Buffer.from(this.hash(email, purpose, code), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
}
