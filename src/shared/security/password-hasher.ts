import { randomBytes, timingSafeEqual } from 'node:crypto';
import { argon2id, hash as argon2Hash } from 'argon2';

const memory = 65_536;
const passes = 3;
const parallelism = 1;
const tagLength = 32;
const version = 19;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return argon2Hash(password, {
    type: argon2id,
    version,
    memoryCost: memory,
    timeCost: passes,
    parallelism,
    hashLength: tagLength,
    salt,
    raw: true,
  });
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await derive(password, salt);
    return `$argon2id$v=${version}$m=${memory},t=${passes},p=${parallelism}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parts = encodedHash.split('$');
    if (parts.length !== 6 || parts[1] !== 'argon2id' || parts[2] !== `v=${version}` || parts[3] !== `m=${memory},t=${passes},p=${parallelism}`) {
      return false;
    }

    try {
      const salt = Buffer.from(parts[4] ?? '', 'base64url');
      const expected = Buffer.from(parts[5] ?? '', 'base64url');
      if (salt.length !== 16 || expected.length !== tagLength) return false;
      const actual = await derive(password, salt);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
