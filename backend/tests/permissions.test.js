import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PERMISSION_METADATA, resolveEffectivePermissions } from '../src/utils/permissions.js';

test('returns explicit permissions from a user permission record', () => {
  const result = resolveEffectivePermissions(
    { role: 'manager' },
    { canViewDashboard: true, canCreateSale: false, canViewSale: true }
  );

  assert.deepEqual(result, ['canViewDashboard', 'canViewSale']);
});

test('returns full permissions for owners and platform admins', () => {
  const ownerPermissions = resolveEffectivePermissions({ role: 'owner' });
  const platformPermissions = resolveEffectivePermissions({ role: 'saas_admin' });

  assert.ok(ownerPermissions.includes('canViewDashboard'));
  assert.ok(ownerPermissions.includes('canCreateSale'));
  assert.deepEqual(platformPermissions, ['*']);
});

test('owner permissions respect tenant feature access', () => {
  const allowed = resolveEffectivePermissions({ role: 'owner' }, null, [], new Set(['inventory.products', 'sales']));
  const denied = resolveEffectivePermissions({ role: 'owner' }, null, [], new Set(['sales']));

  assert.ok(allowed.includes('canCreateProduct'));
  assert.ok(allowed.includes('canCreateSale'));
  assert.ok(!denied.includes('canCreateProduct'));
  assert.ok(denied.includes('canViewDashboard'));
});

test('owners keep branch and staff permissions even without tenant features', () => {
  const permissions = resolveEffectivePermissions({ role: 'owner' }, null, [], new Set());

  assert.ok(permissions.includes('canViewBranch'));
  assert.ok(permissions.includes('canCreateBranch'));
  assert.ok(permissions.includes('canViewStaff'));
  assert.ok(permissions.includes('canCreateStaff'));
});

test('prisma schema exposes the staff till sheet permission field', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(schema, /canViewStaffTillSheet\s+Boolean/);
});

test('prisma schema exposes transaction account and withdrawal permission fields', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(schema, /canViewTransactionAccount\s+Boolean/);
  assert.match(schema, /canUseAnyTransactionAccount\s+Boolean/);
  assert.match(schema, /canCreateTransactionAccount\s+Boolean/);
  assert.match(schema, /canEditTransactionAccount\s+Boolean/);
  assert.match(schema, /canDeleteTransactionAccount\s+Boolean/);
  assert.match(schema, /canCreateWithdrawal\s+Boolean/);
});

test('new transaction permissions are grouped separately from accounting permissions', () => {
  assert.equal(PERMISSION_METADATA.canViewPriceHistory.category, 'inventory');
  assert.equal(PERMISSION_METADATA.canCreateAccounting.category, 'accounting');
  assert.equal(PERMISSION_METADATA.canUseAnyTransactionAccount.category, 'transactions');
  assert.equal(PERMISSION_METADATA.canCreateTransactionAccount.category, 'transactions');
  assert.equal(PERMISSION_METADATA.canCreateWithdrawal.category, 'transactions');
});
