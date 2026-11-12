import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PERMISSION_KEYS, PERMISSION_METADATA, REPORT_PERMISSION_ITEMS, userHasReportAccess } from '../src/utils/permissions.js';

test('each report has an individually assignable permission in its report category', () => {
  for (const [id, name, category] of REPORT_PERMISSION_ITEMS) {
    const key = `canViewReport${id[0].toUpperCase()}${id.slice(1)}`;
    assert(ALL_PERMISSION_KEYS.includes(key), `${key} is registered`);
    assert.equal(PERMISSION_METADATA[key].name, `View ${name}`);
    assert.equal(PERMISSION_METADATA[key].category, category);
  }
});

test('a specific report is granted only by its own permission after legacy access is migrated', () => {
  const permissions = { canViewInventoryReport: true, canViewReportInventoryStock: true };
  assert.equal(userHasReportAccess('inventoryStock', [], permissions), true);
  assert.equal(userHasReportAccess('inventoryValuation', [], permissions), false);
});

test('legacy broad permission alone does not bypass granular report access', () => {
  assert.equal(userHasReportAccess('financialTax', ['canViewFinancialReport'], { canViewFinancialReport: true }), false);
});
