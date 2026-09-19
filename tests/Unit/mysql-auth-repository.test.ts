import assert from 'node:assert/strict';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import test from 'node:test';
import { MySqlAuthRepository } from '../../src/modules/auth/repositories/mysql-auth-repository.ts';

test('user lookup fails closed when no active canonical role is assigned', async () => {
  const row = {
    id: 7,
    public_id: 'user-public-id',
    email: 'user@example.com',
    password_hash: null,
    active_roles: null,
    status: 'active',
    email_verified_at: new Date('2026-01-01T00:00:00.000Z'),
  } as unknown as RowDataPacket;
  const connection = {
    beginTransaction: async () => undefined,
    execute: async () => [[row], []],
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  } as unknown as PoolConnection;
  const pool = { getConnection: async () => connection } as unknown as Pool;
  const repository = new MySqlAuthRepository(pool);

  const result = await repository.transaction((transaction) => transaction.findUserByEmail('user@example.com'));

  assert.equal(result, null);
});
