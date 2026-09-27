import { createHash } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';

export class MailWorkerLockError extends Error {
  constructor() { super('Mail worker lock is unavailable or lost.'); }
}

// Reserve a connection from a separate one-connection pool. Holding a connection
// from the work pool would deadlock when DB_CONNECTION_LIMIT is one.
export async function withMailWorkerLock(
  pool: Pick<Pool, 'getConnection'>,
  database: string,
  work: (assertHeld: () => Promise<void>) => Promise<void>,
): Promise<boolean> {
  const connection = await pool.getConnection();
  const name = `knd.mail.${createHash('sha256').update(database).digest('hex').slice(0, 48)}`;
  let acquired = false, lost = false;
  const onLost = () => { lost = true; };
  connection.on('error', onLost);
  connection.on('end', onLost);
  const assertHeld = async () => {
    if (lost) throw new MailWorkerLockError();
    try {
      const [rows] = await connection.query<Array<RowDataPacket & { owned: number | null }>>({
        sql: 'SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS owned', timeout: 5000,
      }, [name]);
      if (lost || Number(rows[0]?.owned) !== 1) throw new MailWorkerLockError();
    } catch { lost = true; throw new MailWorkerLockError(); }
  };
  try {
    const [rows] = await connection.query<Array<RowDataPacket & { acquired: number | null }>>({
      sql: 'SELECT GET_LOCK(?, 0) AS acquired', timeout: 5000,
    }, [name]);
    if (rows[0]?.acquired === 0) return false;
    if (lost || Number(rows[0]?.acquired) !== 1) throw new MailWorkerLockError();
    acquired = true;
    await assertHeld();
    await work(assertHeld);
    return true;
  } finally {
    try {
      if (acquired && !lost) await connection.query({ sql: 'SELECT RELEASE_LOCK(?)', timeout: 5000 }, [name]);
    } finally {
      // Never return a session carrying an advisory lock to a pool, even if
      // explicit release failed. Closing the session releases its server lock.
      connection.destroy();
    }
  }
}
