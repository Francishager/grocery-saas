import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailwayStatusService } from '../src/services/railwayStatusService.js';

const healthySummary = {
  components: [{ name: 'API', status: 'OPERATIONAL', type: 'component' }],
  incidents: [],
  maintenances: [],
};

test('Railway status service normalizes public health and active incidents', async () => {
  const service = createRailwayStatusService({
    now: () => 1_000,
    fetchImpl: async () => ({ ok: true, json: async () => ({
      ...healthySummary,
      components: [{ name: 'Deployments', type: 'group', components: [{ name: 'Builds', status: 'DEGRADED', type: 'component' }] }],
      incidents: [{ name: 'Build delays', status: 'investigating', impact: 'major', components: [{ name: 'Builds' }] }],
    }) }),
  });

  const result = await service();
  assert.equal(result.status, 'degraded');
  assert.equal(result.description, '1 active Railway incident');
  assert.deepEqual(result.affectedComponents, [{ name: 'Deployments / Builds', status: 'DEGRADED' }]);
  assert.equal(result.incidents[0].name, 'Build delays');
  assert.equal(result.stale, false);
});

test('Railway status service caches results and uses stale cache during provider failure', async () => {
  let time = 1_000;
  let fail = false;
  let calls = 0;
  const service = createRailwayStatusService({
    now: () => time,
    cacheTtlMs: 100,
    staleTtlMs: 1_000,
    fetchImpl: async () => {
      calls += 1;
      if (fail) throw new Error('network unavailable');
      return { ok: true, json: async () => healthySummary };
    },
  });

  assert.equal((await service()).stale, false);
  time += 50;
  assert.equal((await service()).stale, false);
  assert.equal(calls, 1);
  time += 100;
  fail = true;
  assert.equal((await service()).stale, true);
  assert.equal(calls, 2);
});
