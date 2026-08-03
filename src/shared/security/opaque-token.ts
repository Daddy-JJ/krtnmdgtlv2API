import { createHash, randomBytes } from 'node:crypto';

export type IssuedOpaqueToken = Readonly<{ plaintext: string; hash: string }>;

export class OpaqueTokenService {
  issue(byteLength = 32): IssuedOpaqueToken {
    if (byteLength < 32) throw new Error('Opaque tokens require at least 256 bits of entropy.');
    const plaintext = randomBytes(byteLength).toString('base64url');
    return { plaintext, hash: this.hash(plaintext) };
  }

  hash(plaintext: string): string {
    return createHash('sha256').update(plaintext, 'utf8').digest('hex');
  }
}
