import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import type { RowDataPacket } from 'mysql2/promise';

// Read-only counts. No email, hash, token, credential or card identifiers printed.
const env=loadEnvironment();
if(!['localhost','127.0.0.1','::1'].includes(env.DB_HOST))throw new Error('Non-loopback target requires a separately approved audit.');
const pool=createDatabasePool(env);
try {
  const [contacts]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) duplicateGroups,COALESCE(SUM(n-1),0) extraCards
    FROM (SELECT COUNT(*) n FROM card_contacts GROUP BY BINARY LOWER(TRIM(email)) HAVING COUNT(*)>1) duplicates`);
  const [owners]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) duplicateOwnerGroups FROM
    (SELECT user_id FROM cards WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*)>1) duplicates`);
  const [summary]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) cards,
    COALESCE(SUM(c.deleted_at IS NOT NULL OR c.status='deleted'),0) deletedCards,
    COALESCE(SUM(c.user_id IS NULL),0) unownedCards,
    COALESCE(SUM(u.id IS NOT NULL AND BINARY LOWER(TRIM(u.email))<>BINARY LOWER(TRIM(cc.email))),0) ownerContactMismatch
    FROM cards c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN card_contacts cc ON cc.card_id=c.id`);
  const [columns]=await pool.query<RowDataPacket[]>("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cards' AND COLUMN_NAME='registration_email'");
  let identities:RowDataPacket[]|null=null;
  if(columns.length) [identities]=await pool.query<RowDataPacket[]>('SELECT COUNT(*) cards,COALESCE(SUM(registration_email IS NULL),0) unreviewedIdentities FROM cards');
  console.log(JSON.stringify({scope:'CLI database read-only; loopback is not proof of local/hosting or Passenger target; contact is not proven registration identity',summary:summary[0],contacts:contacts[0],owners:owners[0],identitySchemaPresent:!!columns.length,identities},null,2));
} catch(error) {
  const code=(error as {code?:string})?.code;
  console.error(JSON.stringify({error:'CARD_EMAIL_AUDIT_FAILED',code:code&&/^[A-Z0-9_]+$/.test(code)?code:'UNKNOWN'}));process.exitCode=1;
} finally {await pool.end();}
