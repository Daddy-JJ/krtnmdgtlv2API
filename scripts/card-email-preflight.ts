import { resolve } from 'node:path';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { loadMigrationFile } from '../src/shared/database/migration-file.ts';
import { normalizeCardEmail } from '../src/shared/security/card-email-identity.ts';

// SELECT only. Never repairs schema, snapshots data, assigns identity or logs PII.
// --cutover checks the snapshot BEFORE reopening writers; later contact edits are
// display data and must not be interpreted as registration identity or new holds.
let pool: Pool | undefined;
try {
  const flags=process.argv.slice(2);
  if(flags.some(flag=>flag!=='--cutover'))throw new Error('INVALID_ARGUMENT');
  const cutover=flags.includes('--cutover');
  pool=createDatabasePool(loadEnvironment());
  const checks:Array<{name:string;passed:boolean}>=[];
  const check=(name:string,passed:boolean)=>checks.push({name,passed});
  const [tables]=await pool.query<RowDataPacket[]>(`SELECT TABLE_NAME name,ENGINE engine FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cards','card_contacts','users','schema_migrations','card_email_identities','card_email_legacy_holds')`);
  check('required_tables',tables.length===6);
  check('transactional_tables',tables.length===6&&tables.every(t=>String(t.engine).toLowerCase()==='innodb'));
  const [columns]=await pool.query<RowDataPacket[]>(`SELECT DATA_TYPE dataType,CHARACTER_MAXIMUM_LENGTH maxLength,IS_NULLABLE nullable
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cards' AND COLUMN_NAME='registration_email'`);
  check('nullable_binary_registration_identity',columns[0]?.dataType==='varbinary'&&Number(columns[0]?.maxLength)===254&&columns[0]?.nullable==='YES');
  const [privateColumns]=await pool.query<RowDataPacket[]>(`SELECT TABLE_NAME tableName,DATA_TYPE dataType,
    CHARACTER_MAXIMUM_LENGTH maxLength,IS_NULLABLE nullable FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('card_email_identities','card_email_legacy_holds') AND COLUMN_NAME='email'`);
  check('private_binary_email_keys',privateColumns.length===2&&privateColumns.every(c=>
    c.dataType==='varbinary'&&Number(c.maxLength)===254&&c.nullable==='NO'));
  const [foreignKeys]=await pool.query<RowDataPacket[]>(`SELECT k.COLUMN_NAME columnName,k.REFERENCED_TABLE_NAME targetTable,
    k.REFERENCED_COLUMN_NAME targetColumn,r.DELETE_RULE deleteRule
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='card_email_identities'`);
  check('registry_restrict_foreign_key',foreignKeys.some(k=>k.columnName==='card_id'&&k.targetTable==='cards'
    &&k.targetColumn==='id'&&k.deleteRule==='RESTRICT'));
  const [indexes]=await pool.query<RowDataPacket[]>(`SELECT TABLE_NAME tableName,INDEX_NAME indexName,NON_UNIQUE nonUnique,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) columnsList FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cards','card_email_identities','card_email_legacy_holds')
    GROUP BY TABLE_NAME,INDEX_NAME,NON_UNIQUE`);
  for(const [tableName,columnsList] of [['cards','registration_email'],['card_email_identities','email'],['card_email_legacy_holds','email']]) {
    check(tableName+'_unique_identity',indexes.some(i=>i.tableName===tableName&&i.columnsList===columnsList&&Number(i.nonUnique)===0));
  }
  if(tables.some(t=>t.name==='schema_migrations')) {
    for(const name of ['014_card_email_identity.sql','015_legacy_card_email_holds.sql']) {
      const file=await loadMigrationFile(resolve(import.meta.dirname,'../database/migrations',name));
      const [rows]=await pool.execute<RowDataPacket[]>('SELECT checksum FROM schema_migrations WHERE migration=?',[name]);
      check(name+'_checksum',rows[0]?.checksum===file.checksum);
    }
  }
  let summary:Record<string,number>|null=null;
  if(checks.every(c=>c.passed)) {
    const [rows]=await pool.query<RowDataPacket[]>(`SELECT
      (SELECT COUNT(*) FROM cards WHERE registration_email IS NULL) unreviewedLegacyCards,
      (SELECT COUNT(*) FROM card_email_legacy_holds) heldLegacyEmails,
      (SELECT COUNT(*) FROM cards c LEFT JOIN card_email_identities i ON i.email=c.registration_email
        WHERE c.registration_email IS NOT NULL AND (i.card_id IS NULL OR i.card_id<>c.id)) missingBindings,
      (SELECT COUNT(*) FROM card_email_identities WHERE card_id IS NULL) unboundReservations,
      (SELECT COUNT(*) FROM card_email_identities i LEFT JOIN cards c ON c.id=i.card_id
        WHERE i.card_id IS NOT NULL AND c.id IS NULL) danglingBindings`);
    summary=Object.fromEntries(Object.entries(rows[0]!).map(([k,v])=>[k,Number(v)]));
    check('registration_bindings_complete',summary.missingBindings===0);
    check('no_unbound_reservations',summary.unboundReservations===0);
    check('no_dangling_bindings',summary.danglingBindings===0);
    if(cutover) {
      const [legacy]=await pool.query<RowDataPacket[]>(`
        SELECT cc.email FROM cards c JOIN card_contacts cc ON cc.card_id=c.id
          WHERE c.registration_email IS NULL
        UNION ALL
        SELECT u.email FROM cards c JOIN users u ON u.id=c.user_id
          WHERE c.registration_email IS NULL`);
      const [held]=await pool.query<RowDataPacket[]>('SELECT email FROM card_email_legacy_holds');
      const heldEmails=new Set(held.map(row=>(row.email as Buffer).toString('utf8')));
      const observed=new Set(legacy.map(row=>normalizeCardEmail(row.email as string)));
      const reservable=[...observed].filter(email=>email&&Buffer.byteLength(email)<=254);
      summary.unreservableLegacyValues=observed.size-reservable.length;
      check('cutover_snapshot_coverage',reservable.every(email=>heldEmails.has(email)));
      check('snapshot_normalization', [...heldEmails].every(email=>normalizeCardEmail(email)===email));
    }
  }
  const success=checks.every(c=>c.passed);
  console.log(JSON.stringify({success,scope:'CLI read-only; not proof of Passenger environment',cutover,checks,summary},null,2));
  if(!success)process.exitCode=1;
} catch(error) {
  const code=(error as {code?:string})?.code;
  console.error(JSON.stringify({success:false,code:'CARD_EMAIL_PREFLIGHT_FAILED',category:code&&/^[A-Z0-9_]+$/.test(code)?code:'CHECK_FAILED'}));
  process.exitCode=1;
} finally {await pool?.end();}
