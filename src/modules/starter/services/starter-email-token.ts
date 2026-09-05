import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Encrypt the cookie credential so an email bearer cannot bypass the exchange
// deadline by extracting it and setting a management cookie directly.
export class StarterEmailToken {
  readonly #key: Buffer;
  constructor(key: string) {
    if (key.length < 32) throw new Error('Starter email signing key is too short.');
    this.#key = createHash('sha256').update(`starter-email:v1:${key}`).digest();
  }
  issue(publicId: string, credential: string, now = Date.now()): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    cipher.setAAD(Buffer.from(publicId));
    const value = `${credential}.${Math.floor(now / 1000) + 86400}`;
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }
  verify(publicId: string, token: string, now = Date.now()): string | null {
    if (!/^[A-Za-z0-9_-]{110}$/.test(token)) return null;
    try {
      const bytes = Buffer.from(token, 'base64url');
      if (bytes.toString('base64url') !== token) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(publicId));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const value = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
      const match = /^([A-Za-z0-9_-]{43})\.(\d{10})$/.exec(value);
      return match && Number(match[2]) > Math.floor(now / 1000) ? match[1]! : null;
    } catch { return null; }
  }
}
