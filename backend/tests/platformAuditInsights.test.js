import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePlatformAudit } from '../src/utils/platformAuditInsights.js';

test('feature ranking excludes Dashboard and counts one visit per business-user-Kampala-day', () => {
  const summary = summarizePlatformAudit([
    { tenantId: 'a', userId: 'u1', model: 'Dashboard', action: 'view', createdAt: new Date('2026-10-17T20:10:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Inventory', action: 'view', createdAt: new Date('2026-10-17T21:10:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Inventory', action: 'view', createdAt: new Date('2026-10-17T23:10:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Inventory', action: 'view', createdAt: new Date('2026-10-18T21:10:00Z') },
    { tenantId: 'b', userId: 'u1', model: 'Inventory', action: 'view', createdAt: new Date('2026-10-17T21:10:00Z') },
  ]);

  assert.deepEqual(summary.byFeature, [{ feature: 'Inventory', count: 3 }]);
  assert.match(summary.featureRankingRule, /Dashboard excluded/);
});

test('hourly activity uses Kampala local time and returns all 24 hours', () => {
  const summary = summarizePlatformAudit([
    { tenantId: 'a', userId: 'u1', model: 'Sale', action: 'create', createdAt: new Date('2026-10-17T20:15:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Sale', action: 'create', createdAt: new Date('2026-10-17T21:15:00Z') },
  ]);

  assert.equal(summary.byHour.length, 24);
  assert.equal(summary.byHour[23].count, 1);
  assert.equal(summary.byHour[0].count, 1);
});
