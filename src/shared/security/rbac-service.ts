import type { Pool, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../http/errors.ts';

export class RbacService {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async permissions(userPublicId: string): Promise<Set<string>> {
    const [rows] = await this.#pool.execute<Array<RowDataPacket & { code: string }>>(
      `SELECT DISTINCT p.code FROM users u
       JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL
       JOIN role_permissions rp ON rp.role_id=ur.role_id
       JOIN permissions p ON p.id=rp.permission_id
       WHERE u.public_id=? AND u.status='active'`,
      [userPublicId],
    );
    return new Set(rows.map((row) => row.code));
  }

  async assert(userPublicId: string, permission: string): Promise<void> {
    if (!(await this.permissions(userPublicId)).has(permission)) {
      throw new AppError(403, 'PERMISSION_REQUIRED', 'Required permission is missing.');
    }
  }

  async assertRecentSession(userPublicId:string,sessionId:string,maxAgeMinutes=15):Promise<void>{
    const [rows]=await this.#pool.execute<Array<RowDataPacket&{created_at:Date}>>(`SELECT MIN(rt.created_at) created_at FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE u.public_id=? AND rt.family_id=? AND rt.revoked_at IS NULL GROUP BY rt.family_id`,[userPublicId,sessionId]);
    const created=rows[0]?.created_at;
    if(!created||Date.now()-created.getTime()>maxAgeMinutes*60_000)throw new AppError(403,'RECENT_AUTH_REQUIRED','Please authenticate again before this action.');
  }
}
