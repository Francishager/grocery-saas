import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PERMISSION_KEYS, LEGACY_COMBINED_PERMISSION_KEYS, PERMISSION_METADATA, permissionAllowedForTenant, resolveEffectivePermissions, ROLE_DEFAULTS } from '../src/utils/permissions.js';
import { validateProtectedManualJournalPosting } from '../src/utils/manualJournalPolicy.js';

const managed = { id: 'system-expense', name: 'System expense', isSystemManaged: true };
const normal = { id: 'normal-expense', name: 'Office supplies', isSystemManaged: false };

test('protected account posting is rejected without its dedicated permission', () => {
  const result = validateProtectedManualJournalPosting({
    accounts: [managed],
    protectedAccountIds: new Set(),
    canPostToProtectedAccounts: false,
    reason: 'Correction',
    reference: 'JV-12',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test('authorized protected corrections require both reason and reference', () => {
  const result = validateProtectedManualJournalPosting({
    accounts: [managed],
    protectedAccountIds: new Set(),
    canPostToProtectedAccounts: true,
    reason: '   ',
    reference: '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('documented protected correction passes; normal entries need no exception', () => {
  const corrected = validateProtectedManualJournalPosting({
    accounts: [managed],
    protectedAccountIds: new Set(),
    canPostToProtectedAccounts: true,
    reason: 'Correct misclassified cash surplus',
    reference: 'COUNT-2026-11-05',
  });
  assert.equal(corrected.ok, true);
  assert.equal(corrected.protectedAccounts.length, 1);
  assert.equal(validateProtectedManualJournalPosting({ accounts: [normal] }).ok, true);
});

test('override permission is separately registered, accounting-gated, and off by default for staff', () => {
  assert.ok(ALL_PERMISSION_KEYS.includes('canPostToProtectedAccounts'));
  assert.equal(PERMISSION_METADATA.canPostToProtectedAccounts.category, 'accounting');
  assert.equal(permissionAllowedForTenant('canPostToProtectedAccounts', new Set(['accounting'])), true);
  assert.equal(permissionAllowedForTenant('canPostToProtectedAccounts', new Set()), false);
  assert.equal(ROLE_DEFAULTS.accountant.canPostToProtectedAccounts, false);
});

test('stock-in and stock-out permissions remain independent and editable', () => {
  assert.ok(ALL_PERMISSION_KEYS.includes('canAdjustStock'));
  assert.ok(ALL_PERMISSION_KEYS.includes('canRecordStockIn'));
  assert.equal(LEGACY_COMBINED_PERMISSION_KEYS.includes('canAdjustStock'), false);
  const effective = resolveEffectivePermissions(
    { id: 'staff', role: 'attendant' },
    { canAdjustStock: true, canRecordStockIn: false },
    [],
    new Set(['inventory']),
  );
  assert.ok(effective.includes('canAdjustStock'));
  assert.equal(effective.includes('canRecordStockIn'), false);
  assert.equal(permissionAllowedForTenant('canRecordStockIn', new Set(['inventory'])), true);
});
