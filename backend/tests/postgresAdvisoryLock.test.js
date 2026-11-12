import test from 'node:test';
import assert from 'node:assert/strict';
import { withPostgresAdvisoryLock } from '../src/utils/postgresAdvisoryLock.js';

function fakeClient({ acquired = true } = {}) {
  const calls = [];
  return {
    calls,
    async connect() { calls.push('connect'); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired }] };
      return { rows: [] };
    },
    async end() { calls.push('end'); },
  };
}

test('advisory lock executes the task and releases the lock', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  const client = fakeClient();
  let ran = false;
  const result = await withPostgresAdvisoryLock({
    key: 77,
    task: async () => { ran = true; return 'done'; },
    createClient: () => client,
  });
  assert.deepEqual(result, { acquired: true, value: 'done' });
  assert.equal(ran, true);
  assert.ok(client.calls.some(call => typeof call === 'object' && call.sql.includes('pg_advisory_unlock')));
  assert.equal(client.calls.at(-1), 'end');
});

test('a busy lock skips scheduled work and closes its client', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  const client = fakeClient({ acquired: false });
  let ran = false;
  const result = await withPostgresAdvisoryLock({
    key: 78,
    task: async () => { ran = true; },
    createClient: () => client,
  });
  assert.deepEqual(result, { acquired: false });
  assert.equal(ran, false);
  assert.equal(client.calls.at(-1), 'end');
});

test('a failing task still releases its advisory lock', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  const client = fakeClient();
  await assert.rejects(withPostgresAdvisoryLock({
    key: 79,
    task: async () => { throw new Error('task failed'); },
    createClient: () => client,
  }), /task failed/);
  assert.ok(client.calls.some(call => typeof call === 'object' && call.sql.includes('pg_advisory_unlock')));
  assert.equal(client.calls.at(-1), 'end');
});
