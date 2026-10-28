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

test('subscription invoice payment is a separately assignable staff permission', () => {
  const granted = resolveEffectivePermissions({ role: 'attendant' }, { canPaySubscriptionInvoice: true });
  const denied = resolveEffectivePermissions({ role: 'attendant' }, { canPaySubscriptionInvoice: false });
  const owner = resolveEffectivePermissions({ role: 'owner' });

  assert.ok(granted.includes('canPaySubscriptionInvoice'));
  assert.ok(!denied.includes('canPaySubscriptionInvoice'));
  assert.ok(owner.includes('canPaySubscriptionInvoice'));
  assert.equal(PERMISSION_METADATA.canPaySubscriptionInvoice.category, 'subscription_billing');
});

test('prisma schema exposes the staff till sheet permission field', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(schema, /canViewStaffTillSheet\s+Boolean/);
});

test('prisma schema exposes the subscription invoice payment permission field', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');
  assert.match(schema, /canPaySubscriptionInvoice\s+Boolean/);
});

test('prisma schema exposes transaction account and withdrawal permission fields', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(schema, /canViewTransactionAccount\s+Boolean/);
  assert.match(schema, /canUseAnyTransactionAccount\s+Boolean/);
  assert.match(schema, /canUseOtherCashAccount\s+Boolean/);
  assert.match(schema, /canCreateTransactionAccount\s+Boolean/);
  assert.match(schema, /canEditTransactionAccount\s+Boolean/);
  assert.match(schema, /canDeleteTransactionAccount\s+Boolean/);
  assert.match(schema, /canCreateWithdrawal\s+Boolean/);
  assert.match(schema, /canViewChartOfAccounts\s+Boolean/);
  assert.match(schema, /canCreateChartOfAccounts\s+Boolean/);
  assert.match(schema, /canEditChartOfAccounts\s+Boolean/);
});

test('new transaction permissions are grouped separately from accounting permissions', () => {
  assert.equal(PERMISSION_METADATA.canViewPriceHistory.category, 'inventory');
  assert.equal(PERMISSION_METADATA.canCreateAccounting.category, 'accounting');
  assert.equal(PERMISSION_METADATA.canViewChartOfAccounts.category, 'accounting');
  assert.equal(PERMISSION_METADATA.canCreateChartOfAccounts.category, 'accounting');
  assert.equal(PERMISSION_METADATA.canEditChartOfAccounts.category, 'accounting');
  assert.equal(PERMISSION_METADATA.canUseAnyTransactionAccount.category, 'transactions');
  assert.equal(PERMISSION_METADATA.canUseOtherCashAccount.category, 'transactions');
  assert.equal(PERMISSION_METADATA.canCreateTransactionAccount.category, 'transactions');
  assert.equal(PERMISSION_METADATA.canCreateWithdrawal.category, 'transactions');
});

test('team messaging permissions are separate from generic communication permissions', () => {
  const messagingPermissions = resolveEffectivePermissions(
    { role: 'attendant' },
    { canViewCommunication: true, canCreateCommunication: true },
    [],
    new Set(['communication', 'communication.team_messaging']),
  );
  const explicitlyGranted = resolveEffectivePermissions(
    { role: 'attendant' },
    { canViewTeamMessaging: true, canSendTeamMessages: false },
    [],
    new Set(['communication.team_messaging']),
  );

  assert.ok(!messagingPermissions.includes('canViewTeamMessaging'));
  assert.ok(!messagingPermissions.includes('canSendTeamMessages'));
  assert.ok(explicitlyGranted.includes('canViewTeamMessaging'));
  assert.ok(!explicitlyGranted.includes('canSendTeamMessages'));
  assert.equal(PERMISSION_METADATA.canViewTeamMessaging.category, 'team_messaging');
  assert.equal(PERMISSION_METADATA.canSendTeamMessages.category, 'team_messaging');
});

test('receivable reconciliation access and review are independently permissioned', () => {
  assert.equal(PERMISSION_METADATA.canViewReceivableReconciliation.category, 'customers');
  assert.equal(PERMISSION_METADATA.canApplyReceivableReconciliation.category, 'customers');
  assert.equal(PERMISSION_METADATA.canReviewReceivableReconciliation.category, 'customers');
  assert.notEqual(
    PERMISSION_METADATA.canViewReceivableReconciliation.id,
    PERMISSION_METADATA.canReviewReceivableReconciliation.id,
  );
  assert.match(PERMISSION_METADATA.canReviewReceivableReconciliation.description, /does not post or change balances/i);
});

test('customer credit-limit visibility and editing are separate customer permissions', () => {
  const limitedUser = resolveEffectivePermissions({ role: 'attendant' }, {
    canViewCustomerBalance: true,
    canViewCustomerCreditLimit: true,
  }, [], new Set(['customers', 'receivables']));
  const manager = resolveEffectivePermissions({ role: 'attendant' }, {
    canManageCustomerCreditLimit: true,
  }, [], new Set(['customers', 'receivables']));

  assert.ok(limitedUser.includes('canViewCustomerCreditLimit'));
  assert.ok(!limitedUser.includes('canManageCustomerCreditLimit'));
  assert.ok(manager.includes('canManageCustomerCreditLimit'));
  assert.ok(manager.includes('canViewCustomerCreditLimit'));
  assert.equal(PERMISSION_METADATA.canViewCustomerCreditLimit.category, 'customers');
  assert.equal(PERMISSION_METADATA.canManageCustomerCreditLimit.category, 'customers');
});

test('recording receivables stays unavailable when the SaaS tenant lacks the receivables feature', () => {
  const permissions = resolveEffectivePermissions({ role: 'attendant' }, { canCreateReceivable: true }, [], new Set(['customers']));
  assert.ok(!permissions.includes('canCreateReceivable'));
});
