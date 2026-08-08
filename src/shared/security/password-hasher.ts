import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const memory = 65_536;
const passes = 3;
const parallelism = 1;
const tagLength = 32;
const version = 19;

const phcPattern = /^\$argon2id\$v=19\$(?:m=65536,t=3,p=1|m=65536,p=1,t=3)\$([A-Za-z0-9+/_-]+)\$([A-Za-z0-9+/_-]+)$/;

function standardBase64(value: Buffer): string {
  return value.toString('base64').replace(/=+$/, '');
}

/**
 * The former Node 24 native adapter used base64url in its PHC-like output.
 * Convert only hashes with the locked parameters so existing accounts remain
 * valid after the Node 22 runtime migration.
 */
function normalizeLockedHash(encodedHash: string): string | null {
  const match = phcPattern.exec(encodedHash);
  if (!match) return null;

  try {
    const salt = Buffer.from(match[1]!, 'base64url');
    const hash = Buffer.from(match[2]!, 'base64url');
    if (salt.length !== 16 || hash.length !== tagLength) return null;
    return `$argon2id$v=${version}$m=${memory},p=${parallelism},t=${passes}$${standardBase64(salt)}$${standardBase64(hash)}`;
  } catch {
    return null;
  }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      version,
      memoryCost: memory,
      timeCost: passes,
      parallelism,
      hashLength: tagLength,
      salt: randomBytes(16),
    });
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const normalized = normalizeLockedHash(encodedHash);
    if (!normalized) return false;
    try {
      return await argon2.verify(normalized, password);
    } catch {
      return false;
    }
  }
}
