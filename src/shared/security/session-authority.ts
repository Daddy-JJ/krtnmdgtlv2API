import type { Pool, RowDataPacket } from 'mysql2/promise';

export interface SessionAuthority {
  isActive(userPublicId: string, sessionId: string, now?: Date): Promise<boolean>;
}

export class MySqlSessionAuthority implements SessionAuthority {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async isActive(userPublicId: string, sessionId: string, now = new Date()): Promise<boolean> {
    const [rows] = await this.#pool.execute<RowDataPacket[]>(
      `SELECT 1
       FROM refresh_tokens rt
       JOIN users u ON u.id=rt.user_id
       WHERE u.public_id=?
         AND u.status='active'
         AND rt.family_id=?
         AND rt.revoked_at IS NULL
         AND rt.used_at IS NULL
         AND rt.expires_at>?
       LIMIT 1`,
      [userPublicId, sessionId, now],
    );
    return rows.length === 1;
  }
}
