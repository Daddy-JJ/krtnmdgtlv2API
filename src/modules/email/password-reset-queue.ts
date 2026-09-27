import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

// All reset enqueue/retry writers must first lock the recipient's users row.
// A locking read sees the latest committed queue state under REPEATABLE READ.
export async function hasPendingPasswordReset(
  connection: PoolConnection, userId: number, email: string,
): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id FROM mail_outbox
    WHERE user_id=? AND recipient_email=? AND template_key='auth.password-reset'
      AND status IN ('queued','processing')
    ORDER BY id LIMIT 1 FOR UPDATE`, [userId, email]);
  return rows.length > 0;
}
