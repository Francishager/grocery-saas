import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeAuditBranches, summarizePlatformAudit } from '../src/utils/platformAuditInsights.js';

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

test('peak-hour pages and feature rankings are grouped by business', () => {
  const summary = summarizePlatformAudit([
    { tenantId: 'shop-a', userId: 'user-a', model: 'Sales', action: 'view', createdAt: new Date('2026-10-17T21:15:00Z') },
    { tenantId: 'shop-a', userId: 'user-a', model: 'Inventory', action: 'view', createdAt: new Date('2026-10-17T21:20:00Z') },
    { tenantId: 'shop-a', userId: 'user-a', model: 'Sales', action: 'engagement', changes: { activeMs: 40_000, interactionCount: 5 }, createdAt: new Date('2026-10-17T21:25:00Z') },
    { tenantId: 'shop-b', userId: 'user-b', model: 'Reports', action: 'view', createdAt: new Date('2026-10-17T21:30:00Z') },
  ]);

  assert.deepEqual(summary.byHour[0].topPages, [
    { page: 'Inventory', views: 1 }, { page: 'Reports', views: 1 }, { page: 'Sales', views: 1 },
  ]);
  const shopA = summary.byBusiness.find(item => item.tenantId === 'shop-a');
  assert.equal(shopA.features[0].feature, 'Sales');
  assert.equal(shopA.features[0].activeMs, 40_000);
  assert(summary.byBusiness.some(item => item.tenantId === 'shop-b' && item.features[0].feature === 'Reports'));
});

test('branch analytics keeps branch events separate and discloses unassigned activity', () => {
  const summary = summarizePlatformAudit([
    { tenantId: 'shop-a', branchId: 'branch-1', branchName: 'Main', userId: 'u1', model: 'Sale', action: 'create', createdAt: new Date('2026-10-17T10:00:00Z') },
    { tenantId: 'shop-a', branchId: 'branch-2', branchName: 'Kampala Road', userId: 'u2', model: 'Inventory', action: 'update', createdAt: new Date('2026-10-17T10:01:00Z') },
    { tenantId: 'shop-a', userId: 'u1', model: 'Reports', action: 'view', changes: { activeMs: 5000 }, createdAt: new Date('2026-10-17T10:02:00Z') },
  ]);

  assert.equal(summary.byBranch.length, 3);
  assert.deepEqual(summary.byBranch.map(({ branchId, eventCount }) => [branchId, eventCount]).sort(), [
    ['branch-1', 1], ['branch-2', 1], [null, 1],
  ].sort());
  assert.equal(summary.byBranch.find(item => item.branchId === 'branch-2').branchName, 'Kampala Road');
});

test('missing branch IDs resolve from the actor primary or sole assignment without guessing among branches', () => {
  const logs = [
    { tenantId: 'shop-a', userId: 'primary-user', model: 'Sale', action: 'create' },
    { tenantId: 'shop-a', userId: 'single-user', model: 'Sale', action: 'create' },
    { tenantId: 'shop-a', userId: 'ambiguous-user', model: 'Sale', action: 'create' },
    { tenantId: 'shop-a', userId: 'system-job', model: 'Sync', action: 'update' },
  ];
  const assignments = [
    { userId: 'primary-user', branchId: 'branch-2', isPrimary: true, branch: { tenantId: 'shop-a', name: 'East' } },
    { userId: 'primary-user', branchId: 'branch-1', isPrimary: false, branch: { tenantId: 'shop-a', name: 'Main' } },
    { userId: 'single-user', branchId: 'branch-3', isPrimary: false, branch: { tenantId: 'shop-a', name: 'West' } },
    { userId: 'ambiguous-user', branchId: 'branch-1', isPrimary: false, branch: { tenantId: 'shop-a', name: 'Main' } },
    { userId: 'ambiguous-user', branchId: 'branch-2', isPrimary: false, branch: { tenantId: 'shop-a', name: 'East' } },
  ];

  const [primary, single, ambiguous, system] = attributeAuditBranches(logs, assignments);
  assert.deepEqual([primary.branchId, primary.branchName, primary.branchAttribution], ['branch-2', 'East', 'actor-primary-branch']);
  assert.deepEqual([single.branchId, single.branchName, single.branchAttribution], ['branch-3', 'West', 'actor-only-branch']);
  assert.equal(ambiguous.branchId, undefined);
  assert.equal(ambiguous.branchAttribution, 'no-branch-context');
  assert.equal(system.branchId, undefined);
});
