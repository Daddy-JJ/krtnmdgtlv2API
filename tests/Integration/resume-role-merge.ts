import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadMigrationFile } from '../../src/shared/database/migration-file.ts';
import { splitSqlStatements } from '../../src/shared/database/sql-statement-splitter.ts';

export async function verifyResumeRoleMerge(pool: Pool): Promise<void> {
  const c = await pool.getConnection();
  try {
    const [currentRoles] = await c.query<Array<RowDataPacket & { code: string }>>('SELECT code FROM roles ORDER BY code');
    assert.deepEqual(currentRoles.map(r => r.code), ['cv_specialist', 'member', 'resume_service_admin', 'super_admin']);
    await c.beginTransaction();
    const [oldRole] = await c.execute<ResultSetHeader>(`INSERT INTO roles(code,name,is_internal,created_at,updated_at)
      VALUES ('resume_quality_reviewer','Resume Quality Reviewer',1,UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
    const [rows] = await c.query<Array<RowDataPacket & { id: number; code: string }>>('SELECT id,code FROM roles');
    const roles = new Map(rows.map(r => [r.code, r.id]));
    const target = roles.get('resume_service_admin')!;
    // Verify union also preserves a locally customized reviewer permission.
    await c.execute(`INSERT INTO role_permissions(role_id,permission_id,created_at)
      SELECT ?,id,UTC_TIMESTAMP() FROM permissions WHERE code='settings.read'`, [oldRole.insertId]);
    const users: number[] = [];
    for (let index = 0; index < 5; index++) {
      const id = randomUUID();
      const [user] = await c.execute<ResultSetHeader>(`INSERT INTO users(public_id,email,password_hash,role,status,created_at,updated_at)
        VALUES (?,?,'disabled-test-credential','resume_quality_reviewer','active',UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [id, `${id}@example.test`]);
      users.push(user.insertId);
      await c.execute(`INSERT INTO user_roles(user_id,role_id,granted_at,revoked_at) VALUES (?,?,'2026-01-01',?)`,
        [user.insertId, oldRole.insertId, index === 1 ? '2026-02-01' : null]);
      if (index === 2 || index === 3) {
        await c.execute(`INSERT INTO user_roles(user_id,role_id,granted_at,revoked_at) VALUES (?,?,'2025-01-01',?)`,
          [user.insertId, target, index === 3 ? '2025-02-01' : null]);
      }
      if (index === 4) await c.execute(`INSERT INTO user_roles(user_id,role_id,granted_at) VALUES (?,?,UTC_TIMESTAMP())`, [user.insertId, roles.get('super_admin')!]);
    }
    const migration = await loadMigrationFile(new URL('../../database/migrations/009_merge_resume_reviewer_role.sql', import.meta.url));
    // A retry must not duplicate grants or audit entries.
    for (let pass = 0; pass < 2; pass++) {
      for (const sql of splitSqlStatements(migration.upSql)) await c.query(sql);
    }
    const [obsolete] = await c.query<RowDataPacket[]>(`SELECT id FROM roles WHERE code='resume_quality_reviewer'`);
    assert.equal(obsolete.length, 0);
    for (const [index, id] of users.entries()) {
      const [grants] = await c.execute<RowDataPacket[]>(`SELECT role_id FROM user_roles WHERE user_id=? AND role_id=? AND revoked_at IS NULL`, [id, target]);
      assert.equal(grants.length, index === 1 ? 0 : 1);
      const [user] = await c.execute<Array<RowDataPacket & { role: string }>>('SELECT role FROM users WHERE id=?', [id]);
      assert.equal(user[0]!.role, index === 1 ? 'member' : index === 4 ? 'super_admin' : 'resume_service_admin');
      const [audit] = await c.execute<RowDataPacket[]>(`SELECT metadata_text FROM activity_logs WHERE user_id=? AND event='rbac.resume-reviewer-merged'`, [id]);
      assert.equal(audit.length, 1);
    }
    const [permissions] = await c.execute<Array<RowDataPacket & { code: string }>>(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?`, [target]);
    for (const code of ['settings.read', 'resume.work', 'resume.admin', 'resume.quality_review', 'resume.release']) {
      assert.ok(permissions.some(p => p.code === code));
    }
  } finally {
    await c.rollback();
    c.release();
  }
}
