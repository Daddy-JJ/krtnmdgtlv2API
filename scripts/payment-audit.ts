import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';

// Read-only inventory. No credentials, recipients, redirect URLs or references.
const pool = createDatabasePool(loadEnvironment());
try {
  const [columns] = await pool.query(`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME IN ('payments','payment_events','subscriptions','subscription_periods')
    ORDER BY TABLE_NAME,ORDINAL_POSITION`);
  const [counts] = await pool.query('SELECT gateway,status,COUNT(*) AS records FROM payments GROUP BY gateway,status');
  process.stdout.write(`${JSON.stringify({ columns, counts }, null, 2)}\n`);
} finally { await pool.end(); }
