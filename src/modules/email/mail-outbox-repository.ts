import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type PasswordResetJob = Readonly<{ id: number; userId: number; email: string; attempts: number; maxAttempts: number; templateVersion:number|null }>;
export type ResumeMailJob=PasswordResetJob&Readonly<{templateKey:string;subject:string;payloadText:string|null}>;

export class MySqlMailOutboxRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }
  async requeueStaleProcessing(now = new Date(), staleAfterMs = 10 * 60_000): Promise<number> {
    const cutoff = new Date(now.getTime() - staleAfterMs);
    const [result] = await this.#pool.execute<ResultSetHeader>(
      `UPDATE mail_outbox
       SET status = 'queued', locked_at = NULL, available_at = ?, updated_at = ?
       WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at <= ?`,
      [now, now, cutoff],
    );
    return Number(result.affectedRows);
  }

  async claimPasswordReset(now = new Date()): Promise<PasswordResetJob | null> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<Array<RowDataPacket & { id: number; user_id: number; recipient_email: string; attempts: number; max_attempts: number;template_version:number|null }>>(`SELECT id, user_id, recipient_email, attempts, max_attempts,template_version
        FROM mail_outbox WHERE template_key = 'auth.password-reset' AND status = 'queued' AND available_at <= ?
        ORDER BY priority ASC, id ASC LIMIT 1 FOR UPDATE`, [now]);
      const row = rows[0];
      if (!row) { await connection.commit(); return null; }
      await connection.execute("UPDATE mail_outbox SET status = 'processing', locked_at = ?, updated_at = ? WHERE id = ?", [now, now, row.id]);
      await connection.commit();
      return { id: row.id, userId: row.user_id, email: row.recipient_email, attempts: row.attempts, maxAttempts: row.max_attempts,templateVersion:row.template_version===null?null:Number(row.template_version) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async claimResume(now=new Date()):Promise<ResumeMailJob|null>{
    const connection=await this.#pool.getConnection();
    try{
      await connection.beginTransaction();
      const[rows]=await connection.execute<Array<RowDataPacket&{id:number;user_id:number;recipient_email:string;attempts:number;max_attempts:number;template_key:string;subject:string;payload_text:string|null;template_version:number|null}>>(`SELECT id,user_id,recipient_email,attempts,max_attempts,template_key,subject,payload_text,template_version FROM mail_outbox WHERE template_key LIKE 'resume.%' AND status='queued' AND available_at<=? ORDER BY priority ASC,id ASC LIMIT 1 FOR UPDATE`,[now]);
      const row=rows[0];
      if(!row){await connection.commit();return null;}
      await connection.execute(`UPDATE mail_outbox SET status='processing',locked_at=?,updated_at=? WHERE id=?`,[now,now,row.id]);
      await connection.commit();
      return{id:row.id,userId:row.user_id,email:row.recipient_email,attempts:row.attempts,maxAttempts:row.max_attempts,templateVersion:row.template_version===null?null:Number(row.template_version),templateKey:row.template_key,subject:row.subject,payloadText:row.payload_text};
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }

  async markObsolete(job: PasswordResetJob, now = new Date()): Promise<void> {
    // Terminal, but not a successful SMTP delivery; never fabricate an ACCEPTED log.
    await this.#pool.execute(`UPDATE mail_outbox SET status='failed',attempts=max_attempts,
      failed_at=?,locked_at=NULL,last_error_code='RECIPIENT_CHANGED',
      last_error_message='Reset request is no longer eligible.',updated_at=?
      WHERE id=? AND status='processing'`, [now, now, job.id]);
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
