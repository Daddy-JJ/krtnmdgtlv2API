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

test('reset enqueue preserves a pending job without changing its schedule, attempts or token', async () => {
  for (const pending of [true, false]) {
    const queries: string[] = [];
    const connection = {
      beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
      execute: async (sql: string) => {
        queries.push(sql);
        if (sql.startsWith('SELECT id FROM users')) return [[{ id: 7 }]];
        if (sql.startsWith('SELECT id FROM mail_outbox')) return [pending ? [{ id: 9 }] : []];
        if (sql.startsWith('INSERT INTO mail_outbox')) return [{ affectedRows: 1 }];
        assert.fail('Unexpected mutation');
      },
    } as unknown as PoolConnection;
    const repo = new MySqlAuthRepository({ getConnection: async () => connection } as unknown as Pool);
    await repo.transaction(tx => tx.enqueuePasswordResetMail({ publicId: 'job', userId: 7, email: 'test@example.test', now: new Date() }));
    assert.match(queries[0]!, /users.*FOR UPDATE/);
    assert.match(queries[1]!, /status IN \('queued','processing'\)/);
    assert.equal(queries.some(sql => sql.startsWith('INSERT')), !pending);
    assert.equal(queries.some(sql => sql.startsWith('UPDATE')), false);
  }
});
