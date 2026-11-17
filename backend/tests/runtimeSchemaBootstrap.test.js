import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runSchemaGroup } from '../src/utils/runtimeSchemaBootstrap.js';

function fakeClient(initial = {}) {
  const checksums = new Map(Object.entries(initial));
  return {
    checksums,
    async query(sql, params = []) {
      if (sql.includes('SELECT checksum')) {
        const row = checksums.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('INSERT INTO jibusales_runtime_schema_steps')) {
        checksums.set(params[0], {
          checksum: params[1],
          status: sql.includes("'failed'") ? 'failed' : 'succeeded',
          deployment_id: params[2] ?? null,
        });
      }
      return { rows: [] };
    },
  };
}

const quietLogger = { log() {}, warn() {} };

test('schema bootstrap records completed scripts and skips them on later replicas', async () => {
  const client = fakeClient();
  const ran = [];
  const options = {
    client,
    scripts: ['a.js', 'b.js'],
    readScript: async (script) => `contents:${script}`,
    runScript: async (script) => { ran.push(script); },
    logger: quietLogger,
  };

  await runSchemaGroup(options);
  await runSchemaGroup(options);

  assert.deepEqual(ran, ['a.js', 'b.js']);
  assert.equal(client.checksums.size, 2);
});

test('changed schema script is rerun while unchanged scripts stay ready', async () => {
  const client = fakeClient();
  const ran = [];
  let changed = false;
  const options = {
    client,
    scripts: ['a.js', 'b.js'],
    readScript: async (script) => `contents:${script}${changed && script === 'b.js' ? ':updated' : ''}`,
    runScript: async (script) => { ran.push(script); },
    logger: quietLogger,
  };

  await runSchemaGroup(options);
  changed = true;
  await runSchemaGroup(options);

  assert.deepEqual(ran, ['a.js', 'b.js', 'b.js']);
});

test('failed optional schema step is skipped across replicas but retried on a new deployment', async () => {
  const client = fakeClient();
  let attempts = 0;
  const options = {
    client,
    scripts: ['optional.js'],
    optional: true,
    deploymentId: 'deployment-1',
    readScript: async () => 'optional schema',
    runScript: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary failure');
    },
    logger: quietLogger,
  };

  await runSchemaGroup(options);
  await runSchemaGroup(options);
  await runSchemaGroup({ ...options, deploymentId: 'deployment-2' });

  assert.equal(attempts, 2);
  assert.equal(client.checksums.get('optional.js').status, 'succeeded');
});

test('JibuSales Network reply foreign key check matches PostgreSQL lowercase constraint names', async () => {
  const ensureScript = await readFile(new URL('../src/scripts/ensure-jibu-network-schema.js', import.meta.url), 'utf8');
  assert.match(ensureScript, /conrelid = 'jibu_network_messages'::regclass/);
  assert.match(ensureScript, /lower\(conname\) = 'jibu_network_messages_replytomessageid_fkey'/);
  assert.match(ensureScript, /ADD CONSTRAINT jibu_network_messages_replyToMessageId_fkey/);
});
