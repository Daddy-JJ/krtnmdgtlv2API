import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AccountProfile, AccountRepository } from './account-repository.ts';
import { normalizeRole } from '../../../shared/security/roles.ts';

type AccountRow = RowDataPacket & { id: number; public_id: string; email: string; role: string; status: string; email_verified_at: Date | null };

function profile(row: AccountRow): AccountProfile {
  const role = normalizeRole(row.role);
  if (!role) throw new Error('Unsupported account role.');
  return { publicId: row.public_id, email: row.email, role, status: row.status, emailVerifiedAt: row.email_verified_at };
}

export class MySqlAccountRepository implements AccountRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async findByPublicId(publicId: string): Promise<AccountProfile | null> {
    const [rows] = await this.#pool.execute<AccountRow[]>('SELECT public_id, email, role, status, email_verified_at FROM users WHERE public_id = ? LIMIT 1', [publicId]);
    return rows[0] ? profile(rows[0]) : null;
  }

  async updateEmail(publicId: string, email: string, now: Date): Promise<AccountProfile | 'email_taken' | null> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const [currentRows] = await connection.execute<AccountRow[]>('SELECT id, public_id, email, role, status, email_verified_at FROM users WHERE public_id = ? FOR UPDATE', [publicId]);
      const current = currentRows[0];
      if (!current || current.status !== 'active') {
        await connection.rollback();
        return null;
      }
      if (current.email !== email) {
        const [existingRows] = await connection.execute<Array<RowDataPacket & { public_id: string }>>('SELECT public_id FROM users WHERE email = ? FOR UPDATE', [email]);
        if (existingRows[0]) {
          await connection.rollback();
          return 'email_taken';
        }
      }
      const emailVerifiedAt = current.email === email ? current.email_verified_at : null;
      const [result] = await connection.execute<ResultSetHeader>('UPDATE users SET email = ?, email_verified_at = ?, updated_at = ? WHERE id = ?', [email, emailVerifiedAt, now, current.id]);
      if (result.affectedRows !== 1) throw new Error('Failed to update current user email.');
      const [rows] = await connection.execute<AccountRow[]>('SELECT public_id, email, role, status, email_verified_at FROM users WHERE public_id = ? LIMIT 1', [publicId]);
      await connection.commit();
      return rows[0] ? profile(rows[0]) : null;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
