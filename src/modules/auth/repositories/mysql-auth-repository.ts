import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthRepository, AuthTransaction, OtpRecord, RefreshRecord, ResetRecord, UserRecord } from './auth-repository.ts';
import { normalizeRoles, primaryRole } from '../../../shared/security/roles.ts';

type UserRow = RowDataPacket & { id: number; public_id: string; email: string; password_hash: string; active_roles: string | null; status: string; email_verified_at: Date | null };

const activeRolesSql = `(SELECT GROUP_CONCAT(DISTINCT r.code ORDER BY FIELD(r.code,'super_admin','resume_service_admin','resume_quality_reviewer','cv_specialist','member'))
  FROM user_roles ur JOIN roles r ON r.id=ur.role_id
  WHERE ur.user_id=u.id AND ur.revoked_at IS NULL)`;

function user(row: UserRow): UserRecord {
  const roles = normalizeRoles(row.active_roles?.split(',') ?? []);
  const role = primaryRole(roles);
  if (!role) throw new Error('Account has no active canonical role.');
  return { id: row.id, publicId: row.public_id, email: row.email, passwordHash: row.password_hash, role, roles, status: row.status, emailVerifiedAt: row.email_verified_at };
}

class MySqlAuthTransaction implements AuthTransaction {
  readonly #connection: PoolConnection;
  constructor(connection: PoolConnection) { this.#connection = connection; }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [rows] = await this.#connection.execute<UserRow[]>(`SELECT u.id,u.public_id,u.email,u.password_hash,${activeRolesSql} active_roles,u.status,u.email_verified_at FROM users u WHERE u.email=? FOR UPDATE`, [email]);
    return rows[0] ? user(rows[0]) : null;
  }

  async insertUser(publicId: string, email: string, passwordHash: string, now: Date): Promise<UserRecord> {
    const [result] = await this.#connection.execute<ResultSetHeader>('INSERT INTO users (public_id, email, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [publicId, email, passwordHash, 'member', 'active', now, now]);
    await this.#connection.execute(`INSERT INTO user_roles(user_id,role_id,granted_at) SELECT ?,id,? FROM roles WHERE code='member'`, [result.insertId, now]);
    return { id: result.insertId, publicId, email, passwordHash, role: 'member', roles: ['member'], status: 'active', emailVerifiedAt: null };
  }

  async markEmailVerified(userId: number, now: Date): Promise<void> {
    await this.#connection.execute('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?', [now, now, userId]);
  }

  async invalidateOtps(email: string, purpose: string, now: Date): Promise<void> {
    await this.#connection.execute('UPDATE email_otps SET consumed_at = ? WHERE destination_email = ? AND purpose = ? AND consumed_at IS NULL', [now, email, purpose]);
  }

  async insertOtp(input: { publicId: string; userId: number; email: string; purpose: string; codeHash: string; maxAttempts: number; expiresAt: Date; now: Date }): Promise<void> {
    await this.#connection.execute('INSERT INTO email_otps (public_id, user_id, destination_email, purpose, code_hash, attempts, max_attempts, expires_at, last_sent_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)', [input.publicId, input.userId, input.email, input.purpose, input.codeHash, input.maxAttempts, input.expiresAt, input.now, input.now]);
  }

  async findActiveOtp(email: string, purpose: string): Promise<OtpRecord | null> {
    const [rows] = await this.#connection.execute<Array<RowDataPacket & { id: number; code_hash: string; attempts: number; max_attempts: number; expires_at: Date; last_sent_at: Date }>>('SELECT id, code_hash, attempts, max_attempts, expires_at, last_sent_at FROM email_otps WHERE destination_email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE', [email, purpose]);
    const row = rows[0];
    return row ? { id: row.id, codeHash: row.code_hash, attempts: row.attempts, maxAttempts: row.max_attempts, expiresAt: row.expires_at, lastSentAt: row.last_sent_at } : null;
  }

  async countRecentOtps(email: string, purpose: string, since: Date): Promise<number> {
    const [rows] = await this.#connection.execute<Array<RowDataPacket & { count: number }>>('SELECT COUNT(*) AS count FROM email_otps WHERE destination_email = ? AND purpose = ? AND created_at >= ?', [email, purpose, since]);
    return Number(rows[0]?.count ?? 0);
  }

  async incrementOtpAttempts(id: number): Promise<void> { await this.#connection.execute('UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?', [id]); }
  async consumeOtp(id: number, now: Date): Promise<void> { await this.#connection.execute('UPDATE email_otps SET consumed_at = ? WHERE id = ?', [now, id]); }

  async insertRefresh(input: { userId: number; tokenHash: string; familyId: string; expiresAt: Date; now: Date }): Promise<void> {
    await this.#connection.execute('INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', [input.userId, input.tokenHash, input.familyId, input.expiresAt, input.now]);
  }

  async findRefresh(tokenHash: string): Promise<RefreshRecord | null> {
    const [rows] = await this.#connection.execute<Array<RowDataPacket & { id: number; user_id: number; user_public_id: string; email: string; family_id: string; active_roles: string | null; status: string; email_verified_at: Date | null; expires_at: Date; used_at: Date | null; revoked_at: Date | null }>>(`SELECT rt.id,rt.user_id,u.public_id AS user_public_id,u.email,rt.family_id,${activeRolesSql} active_roles,u.status,u.email_verified_at,rt.expires_at,rt.used_at,rt.revoked_at FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=? FOR UPDATE`, [tokenHash]);
    const row = rows[0];
    if (!row) return null;
    const roles = normalizeRoles(row.active_roles?.split(',') ?? []);
    const role = primaryRole(roles);
    if (!role) throw new Error('Account has no active canonical role.');
    return { id: row.id, userId: row.user_id, userPublicId: row.user_public_id, email: row.email, familyId: row.family_id, role, roles, status: row.status, emailVerifiedAt: row.email_verified_at, expiresAt: row.expires_at, usedAt: row.used_at, revokedAt: row.revoked_at };
  }

  async markRefreshUsed(id: number, now: Date): Promise<void> { await this.#connection.execute('UPDATE refresh_tokens SET used_at = ? WHERE id = ?', [now, id]); }
  async revokeRefreshFamily(familyId: string, now: Date): Promise<void> { await this.#connection.execute('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?', [now, familyId]); }
  async revokeAllUserRefreshTokens(userId: number, now: Date): Promise<void> { await this.#connection.execute('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?', [now, userId]); }

  async insertPasswordReset(input: { userId: number; tokenHash: string; expiresAt: Date; now: Date }): Promise<void> {
    await this.#connection.execute('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [input.now, input.userId]);
    await this.#connection.execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)', [input.userId, input.tokenHash, input.expiresAt, input.now]);
  }

  async findPasswordReset(tokenHash: string): Promise<ResetRecord | null> {
    const [rows] = await this.#connection.execute<Array<RowDataPacket & { id: number; user_id: number; expires_at: Date; used_at: Date | null }>>('SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? FOR UPDATE', [tokenHash]);
    const row = rows[0];
    return row ? { id: row.id, userId: row.user_id, expiresAt: row.expires_at, usedAt: row.used_at } : null;
  }

  async consumePasswordReset(id: number, now: Date): Promise<void> { await this.#connection.execute('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', [now, id]); }
  async updatePassword(userId: number, passwordHash: string, now: Date): Promise<void> { await this.#connection.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash, now, userId]); }

  async enqueuePasswordResetMail(input: { publicId: string; userId: number; email: string; now: Date }): Promise<void> {
    await this.#connection.execute(`INSERT INTO mail_outbox
      (public_id, user_id, template_key, recipient_email, subject, payload_text, priority, status, attempts, max_attempts, available_at, created_at, updated_at)
      VALUES (?, ?, 'auth.password-reset', ?, 'Reset password Kartunama Digital', ?, 50, 'queued', 0, 3, ?, ?, ?)`,
    [input.publicId, input.userId, input.email, JSON.stringify({ userId: input.userId }), input.now, input.now, input.now]);
  }
}

export class MySqlAuthRepository implements AuthRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }
  async transaction<T>(work: (transaction: AuthTransaction) => Promise<T>): Promise<T> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(new MySqlAuthTransaction(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
