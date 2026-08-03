import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export type PasswordResetJob = Readonly<{ id: number; userId: number; email: string; attempts: number; maxAttempts: number }>;
export type ResumeMailJob=PasswordResetJob&Readonly<{templateKey:string;subject:string;payloadText:string|null}>;

export class MySqlMailOutboxRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async claimPasswordReset(now = new Date()): Promise<PasswordResetJob | null> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<Array<RowDataPacket & { id: number; user_id: number; recipient_email: string; attempts: number; max_attempts: number }>>(`SELECT id, user_id, recipient_email, attempts, max_attempts
        FROM mail_outbox WHERE template_key = 'auth.password-reset' AND status = 'queued' AND available_at <= ?
        ORDER BY priority ASC, id ASC LIMIT 1 FOR UPDATE`, [now]);
      const row = rows[0];
      if (!row) { await connection.commit(); return null; }
      await connection.execute("UPDATE mail_outbox SET status = 'processing', locked_at = ?, updated_at = ? WHERE id = ?", [now, now, row.id]);
      await connection.commit();
      return { id: row.id, userId: row.user_id, email: row.recipient_email, attempts: row.attempts, maxAttempts: row.max_attempts };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async claimResume(now=new Date()):Promise<ResumeMailJob|null>{
    const connection=await this.#pool.getConnection();
    try{
      await connection.beginTransaction();
      const[rows]=await connection.execute<Array<RowDataPacket&{id:number;user_id:number;recipient_email:string;attempts:number;max_attempts:number;template_key:string;subject:string;payload_text:string|null}>>(`SELECT id,user_id,recipient_email,attempts,max_attempts,template_key,subject,payload_text FROM mail_outbox WHERE template_key LIKE 'resume.%' AND status='queued' AND available_at<=? ORDER BY priority ASC,id ASC LIMIT 1 FOR UPDATE`,[now]);
      const row=rows[0];
      if(!row){await connection.commit();return null;}
      await connection.execute(`UPDATE mail_outbox SET status='processing',locked_at=?,updated_at=? WHERE id=?`,[now,now,row.id]);
      await connection.commit();
      return{id:row.id,userId:row.user_id,email:row.recipient_email,attempts:row.attempts,maxAttempts:row.max_attempts,templateKey:row.template_key,subject:row.subject,payloadText:row.payload_text};
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }

  async markSent(job: PasswordResetJob, now = new Date()): Promise<void> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE mail_outbox SET status = 'sent', sent_at = ?, locked_at = NULL, updated_at = ? WHERE id = ?", [now, now, job.id]);
      await connection.execute(`INSERT INTO mail_delivery_logs(outbox_id,message_id,transport,recipient_masked,status,response_code,response_message,created_at)
        VALUES (?,NULL,'smtp',?,'sent','ACCEPTED','Accepted by SMTP transport',?)`, [job.id, this.#mask(job.email), now]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async markFailed(job: PasswordResetJob, now = new Date()): Promise<void> {
    const attempts = job.attempts + 1;
    const terminal = attempts >= job.maxAttempts;
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(`UPDATE mail_outbox SET status = ?, attempts = ?, available_at = ?, locked_at = NULL,
        failed_at = ?, last_error_code = 'DELIVERY_FAILED', last_error_message = 'SMTP delivery failed', updated_at = ? WHERE id = ?`,
      [terminal ? 'failed' : 'queued', attempts, new Date(now.getTime() + attempts * 60_000), terminal ? now : null, now, job.id]);
      await connection.execute(`INSERT INTO mail_delivery_logs(outbox_id,message_id,transport,recipient_masked,status,response_code,response_message,created_at)
        VALUES (?,NULL,'smtp',?,'failed','DELIVERY_FAILED','SMTP delivery failed',?)`, [job.id, this.#mask(job.email), now]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  #mask(email: string): string {
    const separator = email.lastIndexOf('@');
    if (separator <= 0) return '***';
    return `${email.slice(0, 1)}***${email.slice(separator)}`;
  }
}
