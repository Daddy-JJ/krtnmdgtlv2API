import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/environment.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { ScryptPasswordHasher } from '../src/shared/security/password-hasher.ts';

const confirmationPhrase = 'PROVISION_INTERNAL_USERS';

export const internalAccounts = Object.freeze([
  Object.freeze({
    email: 'admin@kartunamadigital.id',
    role: 'super_admin',
    passwordEnvironmentKey: 'KND_SUPER_ADMIN_PASSWORD',
  }),
  Object.freeze({
    email: 'cv-specialist@kartunamadigital.id',
    role: 'cv_specialist',
    passwordEnvironmentKey: 'KND_CV_SPECIALIST_PASSWORD',
  }),
] as const);

export type InternalAccountInput = Readonly<{
  email: (typeof internalAccounts)[number]['email'];
  role: (typeof internalAccounts)[number]['role'];
  password: string;
}>;

function strongPassword(value: string): boolean {
  return value.length >= 14
    && value.length <= 128
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

export function parseProvisioningInput(environment: NodeJS.ProcessEnv): readonly InternalAccountInput[] {
  if (environment.KND_PROVISION_CONFIRM !== confirmationPhrase) {
    throw new Error(`Provisioning requires KND_PROVISION_CONFIRM=${confirmationPhrase}.`);
  }

  const inputs = internalAccounts.map((account) => {
    const password = environment[account.passwordEnvironmentKey] ?? '';
    if (!strongPassword(password)) {
      throw new Error(`${account.passwordEnvironmentKey} must contain 14-128 characters with uppercase, lowercase, number, and symbol.`);
    }
    return Object.freeze({ email: account.email, role: account.role, password });
  });

  if (inputs[0]!.password === inputs[1]!.password) {
    throw new Error('Internal accounts must use different passwords.');
  }

  return Object.freeze(inputs);
}

type RoleRow = RowDataPacket & { id: number; code: string };
type UserRow = RowDataPacket & { email: string };

async function loadRoleIds(connection: PoolConnection): Promise<Map<string, number>> {
  const [rows] = await connection.execute<RoleRow[]>(
    `SELECT id,code FROM roles WHERE code IN (?,?) FOR UPDATE`,
    internalAccounts.map((account) => account.role),
  );
  const roleIds = new Map(rows.map((row) => [row.code, row.id]));
  const missing = internalAccounts.filter((account) => !roleIds.has(account.role)).map((account) => account.role);
  if (missing.length > 0) throw new Error(`Required RBAC roles are missing: ${missing.join(', ')}. Run migrations first.`);
  return roleIds;
}

async function assertAccountsAreNew(connection: PoolConnection): Promise<void> {
  const [rows] = await connection.execute<UserRow[]>(
    `SELECT email FROM users WHERE email IN (?,?) FOR UPDATE`,
    internalAccounts.map((account) => account.email),
  );
  if (rows.length > 0) {
    throw new Error(`Provisioning stopped because an internal account already exists: ${rows.map((row) => row.email).join(', ')}.`);
  }
}

async function provision(): Promise<void> {
  const accounts = parseProvisioningInput(process.env);
  const environment = loadEnvironment();
  const pool = createDatabasePool(environment);
  const connection = await pool.getConnection();
  const hasher = new ScryptPasswordHasher();
  const created: Array<{ publicId: string; email: string; role: string }> = [];

  try {
    await connection.beginTransaction();
    const roleIds = await loadRoleIds(connection);
    await assertAccountsAreNew(connection);

    for (const account of accounts) {
      const roleId = roleIds.get(account.role);
      if (roleId === undefined) throw new Error(`Required RBAC role is missing: ${account.role}.`);
      const publicId = randomUUID();
      const passwordHash = await hasher.hash(account.password);
      const now = new Date();
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users(public_id,email,password_hash,role,status,email_verified_at,created_at,updated_at)
         VALUES(?,?,?,?,'active',?,?,?)`,
        [publicId, account.email, passwordHash, account.role, now, now, now],
      );
      await connection.execute(
        `INSERT INTO user_roles(user_id,role_id,granted_by_user_id,granted_at,revoked_at)
         VALUES(?,?,NULL,?,NULL)`,
        [insert.insertId, roleId, now],
      );
      await connection.execute(
        `INSERT INTO activity_logs(user_id,event,metadata_text,created_at) VALUES(?,?,?,?)`,
        [
          insert.insertId,
          'security.internal-account-provisioned',
          JSON.stringify({ role: account.role, mode: 'create-only' }),
          now,
        ],
      );
      created.push({ publicId, email: account.email, role: account.role });
    }

    await connection.commit();
    process.stdout.write(`${JSON.stringify({ success: true, created }, null, 2)}\n`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  void provision().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown provisioning failure.';
    process.stderr.write(`Internal user provisioning failed: ${message}\n`);
    process.exitCode = 1;
  });
}
