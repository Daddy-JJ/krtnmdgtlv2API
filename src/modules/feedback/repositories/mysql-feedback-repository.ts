import type { Pool, ResultSetHeader } from 'mysql2/promise';
import type { FeedbackRepository } from './feedback-repository.ts';

export class MySqlFeedbackRepository implements FeedbackRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async create(userPublicId: string, publicId: string, message: string, now: Date): Promise<boolean> {
    const [result] = await this.#pool.execute<ResultSetHeader>(
      `INSERT INTO user_feedback (public_id, user_id, message, status, created_at, updated_at)
       SELECT ?, id, ?, 'new', ?, ? FROM users WHERE public_id = ? AND status = 'active'`,
      [publicId, message, now, now, userPublicId],
    );
    return result.affectedRows === 1;
  }
}
