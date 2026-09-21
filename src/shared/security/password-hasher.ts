import { randomBytes, scrypt as deriveScrypt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../http/errors.ts';

const version = 1;
const logN = 16;
const cost = 2 ** logN;
const blockSize = 8;
const parallelization = 1;
const saltLength = 16;
const keyLength = 32;
const maxmem = 128 * 1024 * 1024;
const encodedPattern = /^\$scrypt\$v=1\$ln=16,r=8,p=1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

let activeDerivations = 0;
const maximumDerivations = 2;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Process-wide, including simultaneous hashing and verification. Never build
  // an unbounded in-memory queue of passwords or scrypt allocations.
  if (activeDerivations >= maximumDerivations) throw new AppError(503, 'AUTH_BUSY', 'Authentication is temporarily busy. Please try again.');
  activeDerivations++;
  try { return await new Promise<Buffer>((resolve, reject) => {
    deriveScrypt(password, salt, keyLength, { N: cost, r: blockSize, p: parallelization, maxmem }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  }); } finally { activeDerivations--; }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(saltLength);
    const hash = await derive(password, salt);
    return `$scrypt$v=${version}$ln=${logN},r=${blockSize},p=${parallelization}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    if (typeof encodedHash !== 'string' || encodedHash.length === 0) return false;
    const match = encodedPattern.exec(encodedHash);
    if (!match) return false;
    try {
      const salt = Buffer.from(match[1]!, 'base64url');
      const expected = Buffer.from(match[2]!, 'base64url');
      if (salt.length !== saltLength || expected.length !== keyLength) return false;
      const actual = await derive(password, salt);
      return timingSafeEqual(actual, expected);
    } catch (error) {
      if (error instanceof AppError) throw error;
      return false;
    }
  }
}
