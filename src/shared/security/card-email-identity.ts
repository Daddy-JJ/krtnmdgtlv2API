import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../http/errors.ts';

export const normalizeCardEmail = (email: string): string => email.trim().toLowerCase();
export const duplicateCardEmail = () => new AppError(409, 'STARTER_EMAIL_ALREADY_EXISTS', 'A card already exists for this email.');
export const identityReview = () => new AppError(409, 'CARD_EMAIL_IDENTITY_REVIEW_REQUIRED', 'Card identity requires support review.');

// Caller owns transaction. PK serializes absent emails; never release on deletion.
export async function reserveCardEmail(c: PoolConnection, email: string, now: Date, cardId?: number): Promise<void> {
  return reserveIdentity(c,email,now,cardId,false);
}

async function reserveIdentity(c: PoolConnection, email: string, now: Date, cardId: number | undefined, currentOwnerEmail: boolean): Promise<void> {
  const normalized = normalizeCardEmail(email);
  if (!normalized || Buffer.byteLength(normalized) > 254) throw new AppError(422,'VALIDATION_ERROR','Invalid registration email.');
  // A partially applied cutover must never expose an empty/incomplete hold set.
  // The migration ledger entry is written only AFTER the snapshot succeeds.
  const [ready]=await c.execute<RowDataPacket[]>(
    "SELECT migration FROM schema_migrations WHERE migration='015_legacy_card_email_holds.sql' LIMIT 1");
  if(!ready.length)throw new AppError(503,'CARD_EMAIL_GUARD_UNAVAILABLE','Card creation is temporarily unavailable.');
  try {
    await c.execute('INSERT INTO card_email_identities(email,card_id,created_at) VALUES(?,?,?)',[normalized,cardId??null,now]);
  } catch (error) {
    if ((error as {code?:string})?.code !== 'ER_DUP_ENTRY' && (error as {errno?:number})?.errno !== 1062) throw error;
    // INSERT already proves the conflict. Do not upgrade duplicate shared locks
    // to FOR UPDATE on creation (parallel duplicate inserts would deadlock).
    if(cardId===undefined)throw duplicateCardEmail();
    const [rows] = await c.execute<Array<RowDataPacket & {card_id:number|null}>>('SELECT card_id FROM card_email_identities WHERE email=? FOR UPDATE',[normalized]);
    if (rows[0]?.card_id !== cardId) throw duplicateCardEmail();
    // A previously proven alias for THIS card is an idempotent replay, even if
    // the legacy exclusion snapshot also contains the same address.
    return;
  }
  // Cutover snapshots are exclusion evidence, NEVER an ownership assignment.
  // They survive contact/account edits and deletion, including duplicate legacy
  // groups. Unknown identities must not block unrelated, genuinely new emails.
  const [legacy] = await c.execute<RowDataPacket[]>(
    'SELECT email FROM card_email_legacy_holds WHERE email=? LIMIT 1', [normalized]);
  if (legacy.length && !currentOwnerEmail) throw duplicateCardEmail();
}

// Only a locked, currently verified EXISTING owner may retain their current
// database email as an alias. This never sets registration identity or claims a
// legacy card. It cannot authorize a NEW alias to somebody else's legacy hold.
export async function reserveCurrentOwnerEmail(c: PoolConnection, userId: number, cardId: number, now: Date): Promise<void> {
  const [rows]=await c.execute<Array<RowDataPacket & {email:string}>>(`SELECT u.email FROM users u
    JOIN cards c ON c.user_id=u.id WHERE u.id=? AND c.id=? AND u.status='active'
    AND u.email_verified_at IS NOT NULL FOR UPDATE`,[userId,cardId]);
  if(!rows[0])throw identityReview();
  await reserveIdentity(c,rows[0].email,now,cardId,true);
}

export async function reserveAnonymousEmail(c:PoolConnection,email:string,now:Date):Promise<void> {
  const [users] = await c.execute<Array<RowDataPacket & {id:number}>>('SELECT id FROM users WHERE BINARY LOWER(TRIM(email))=BINARY ?',[normalizeCardEmail(email)]);
  if (users[0]) {
    await c.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[users[0].id]);
    const [cards] = await c.execute<RowDataPacket[]>('SELECT id FROM cards WHERE user_id=? LIMIT 1 FOR UPDATE',[users[0].id]);
    if (cards.length) throw duplicateCardEmail();
  }
  await reserveCardEmail(c,email,now);
}

export async function bindCardEmail(c:PoolConnection,email:string,cardId:number):Promise<void> {
  const [result] = await c.execute<ResultSetHeader>(
    'UPDATE card_email_identities SET card_id=? WHERE email=? AND card_id IS NULL', [cardId,normalizeCardEmail(email)]);
  if(result.affectedRows!==1)throw identityReview();
}
