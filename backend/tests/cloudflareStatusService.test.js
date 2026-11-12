import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudflareStatusService } from '../src/services/cloudflareStatusService.js';

const summary = {
  status: { indicator: 'none', description: 'All Systems Operational' },
  components: [{ name: 'Cloudflare Workers', status: 'operational' }],
  incidents: [],
  scheduled_maintenances: [],
};

test('Cloudflare status includes provider incidents and the configured frontend probe', async () => {
  const service = createCloudflareStatusService({
    now: () => 2_000,
    frontendUrl: 'https://example.workers.dev',
    fetchImpl: async (url, options) => {
      assert.ok(options.headers['User-Agent']);
      if (String(url).includes('cloudflarestatus.com')) {
        return { ok: true, status: 200, json: async () => ({
          ...summary,
          status: { indicator: 'major', description: 'Partial System Outage' },
          incidents: [{ name: 'Workers degradation', status: 'investigating', impact: 'major', components: [{ name: 'Cloudflare Workers' }] }],
        }) };
      }
      return { ok: true, status: 200, body: { cancel: async () => {} } };
    },
  });

  const result = await service();
  assert.equal(result.status, 'degraded');
  assert.equal(result.frontend.status, 'reachable');
  assert.equal(result.incidents[0].name, 'Workers degradation');
  assert.equal(result.stale, false);
});

test('Cloudflare status does not report operational when the frontend probe fails', async () => {
  const service = createCloudflareStatusService({
    now: () => 3_000,
    fetchImpl: async url => {
      if (String(url).includes('cloudflarestatus.com')) return { ok: true, status: 200, json: async () => summary };
      return { ok: false, status: 503, body: { cancel: async () => {} } };
    },
  });

  const result = await service();
  assert.equal(result.status, 'degraded');
  assert.equal(result.frontend.status, 'unreachable');
  assert.equal(result.frontend.httpStatus, 503);
});
