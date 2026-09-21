import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AccountProfile, AccountRepository } from './account-repository.ts';
import { normalizeRoles, primaryRole } from '../../../shared/security/roles.ts';

type AccountRow = RowDataPacket & { id: number; public_id: string; email: string; password_hash: string; active_roles: string | null; permissions: string | null; status: string; email_verified_at: Date | null };

const authorityColumns = `
  (SELECT GROUP_CONCAT(DISTINCT r.code ORDER BY FIELD(r.code,'super_admin','resume_service_admin','cv_specialist','member'))
   FROM user_roles ur JOIN roles r ON r.id=ur.role_id
   WHERE ur.user_id=u.id AND ur.revoked_at IS NULL) active_roles,
  (SELECT GROUP_CONCAT(DISTINCT p.code ORDER BY p.code)
   FROM user_roles ur
   JOIN role_permissions rp ON rp.role_id=ur.role_id
   JOIN permissions p ON p.id=rp.permission_id
   WHERE ur.user_id=u.id AND ur.revoked_at IS NULL) permissions`;

function profile(row: AccountRow): AccountProfile {
  const roles = normalizeRoles(row.active_roles?.split(',') ?? []);
  const role = primaryRole(roles);
  if (!role) throw new Error('Account has no active canonical role.');
  const permissions = [...new Set((row.permissions?.split(',') ?? []).filter((value) => value !== ''))].sort();
  return { publicId: row.public_id, email: row.email, role, roles, permissions, status: row.status, emailVerifiedAt: row.email_verified_at };
}

export class MySqlAccountRepository implements AccountRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async findByPublicId(publicId: string): Promise<AccountProfile | null> {
    const [rows] = await this.#pool.execute<AccountRow[]>(`SELECT u.id,u.public_id,u.email,${authorityColumns},u.status,u.email_verified_at FROM users u WHERE u.public_id=? LIMIT 1`, [publicId]);
    return rows[0] ? profile(rows[0]) : null;
  }

  async findPasswordHash(publicId: string): Promise<string | null> {
    const [rows] = await this.#pool.execute<Array<RowDataPacket & { password_hash: string }>>(`SELECT password_hash FROM users WHERE public_id=? AND status='active' LIMIT 1`, [publicId]);
    return rows[0]?.password_hash ?? null;
  }

  async updateEmail(publicId: string, email: string, expectedPasswordHash: string, now: Date): Promise<AccountProfile | 'email_taken' | null> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const [currentRows] = await connection.execute<AccountRow[]>(`SELECT u.id,u.public_id,u.email,u.password_hash,${authorityColumns},u.status,u.email_verified_at FROM users u WHERE u.public_id=? FOR UPDATE`, [publicId]);
      const current = currentRows[0];
      if (!current || current.status !== 'active' || current.password_hash !== expectedPasswordHash) {
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
      if (current.email !== email) {
        await connection.execute('UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', [now, current.id]);
        await connection.execute('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL', [now, current.id]);
        await connection.execute('UPDATE email_otps SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL', [now, current.id]);
        await connection.execute(`INSERT INTO activity_logs(user_id,event,created_at) VALUES(?,'account.email-changed',?)`, [current.id, now]);
      }
      const [rows] = await connection.execute<AccountRow[]>(`SELECT u.id,u.public_id,u.email,${authorityColumns},u.status,u.email_verified_at FROM users u WHERE u.public_id=? LIMIT 1`, [publicId]);
      await connection.commit();
      return rows[0] ? profile(rows[0]) : null;
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') return 'email_taken';
      throw error;
    } finally {
      connection.release();
    }
  }
}
