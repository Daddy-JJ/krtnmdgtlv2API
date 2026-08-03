import { createHash } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { RateLimiter } from './auth-repository.ts';

export class MySqlRateLimiter implements RateLimiter {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async consume(action: string, identifier: string, limit: number, windowSeconds: number, now = new Date()): Promise<boolean> {
    const windowMs = windowSeconds * 1000;
    const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const expiresAt = new Date(windowStartedAt.getTime() + windowMs);
    const bucketHash = createHash('sha256').update(`${action}\0${identifier}\0${windowStartedAt.toISOString()}`).digest('hex');
    await this.#pool.execute(`INSERT INTO auth_rate_limits (bucket_hash, action, hits, window_started_at, expires_at, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE hits = hits + 1, updated_at = VALUES(updated_at)`, [bucketHash, action, windowStartedAt, expiresAt, now, now]);
    const [rows] = await this.#pool.execute<Array<RowDataPacket & { hits: number }>>('SELECT hits FROM auth_rate_limits WHERE bucket_hash = ?', [bucketHash]);
    return Number(rows[0]?.hits ?? limit + 1) <= limit;
  }
}
