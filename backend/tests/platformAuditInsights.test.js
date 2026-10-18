import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePlatformAudit } from '../src/utils/platformAuditInsights.js';

test('feature ranking includes Dashboard but ranks measured time and counts one active day per business-user-feature', () => {
  const summary = summarizePlatformAudit([
    { tenantId: 'a', userId: 'u1', model: 'Dashboard', action: 'view', changes: { activeMs: 10_000 }, createdAt: new Date('2026-10-17T20:10:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Dashboard', action: 'engagement', changes: { activeMs: 20_000, interactionCount: 2, maxScrollDepth: 45 }, createdAt: new Date('2026-10-17T20:10:15Z') },
    { tenantId: 'a', userId: 'u1', model: 'Inventory', action: 'view', changes: { activeMs: 0 }, createdAt: new Date('2026-10-17T21:10:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Inventory', action: 'engagement', changes: { activeMs: 45_000, interactionCount: 1, maxScrollDepth: 80 }, createdAt: new Date('2026-10-17T23:10:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Inventory', action: 'view', createdAt: new Date('2026-10-18T21:10:00Z') },
    { tenantId: 'b', userId: 'u1', model: 'Inventory', action: 'view', createdAt: new Date('2026-10-17T21:10:00Z') },
  ]);

  assert.equal(summary.byFeature[0].feature, 'Inventory');
  assert.equal(summary.byFeature[0].activeMs, 45_000);
  assert.equal(summary.byFeature.find(item => item.feature === 'Dashboard').activeMs, 30_000);
  assert.equal(summary.byFeature.find(item => item.feature === 'Dashboard').count, 1);
  assert.match(summary.featureRankingRule, /including Dashboard/);
});

test('hourly activity uses Kampala local time and returns all 24 hours', () => {
  const summary = summarizePlatformAudit([
    { tenantId: 'a', userId: 'u1', model: 'Sale', action: 'create', createdAt: new Date('2026-10-17T20:15:00Z') },
    { tenantId: 'a', userId: 'u1', model: 'Sales', action: 'view', changes: { activeMs: 15_000, interactionCount: 3 }, createdAt: new Date('2026-10-17T21:15:00Z') },
  ]);

  assert.equal(summary.byHour.length, 24);
  assert.equal(summary.byHour[23].count, 1);
  assert.equal(summary.byHour[0].count, 1);
  assert.equal(summary.byHour[0].activeMs, 15_000);
  assert.equal(summary.byHour[0].interactionCount, 3);
});
