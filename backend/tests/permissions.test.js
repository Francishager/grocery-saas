import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ALL_PERMISSION_KEYS, PERMISSION_METADATA, resolveEffectivePermissions } from '../src/utils/permissions.js';

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

test('tenancy reactivation is a separately assignable property-management permission', () => {
  const granted = resolveEffectivePermissions({ role: 'attendant' }, { canReactivateTenancies: true });
  const denied = resolveEffectivePermissions({ role: 'attendant' }, { canReactivateTenancies: false });
  const owner = resolveEffectivePermissions({ role: 'owner' });

  assert.ok(granted.includes('canReactivateTenancies'));
  assert.ok(!denied.includes('canReactivateTenancies'));
  assert.ok(owner.includes('canReactivateTenancies'));
  assert.equal(PERMISSION_METADATA.canReactivateTenancies.category, 'property_management');
});

test('property management edit permissions are separately assignable and legacy grants stay compatible', () => {
  const editOnly = resolveEffectivePermissions({ role: 'attendant' }, {
    canEditProperties: true,
    canEditPropertyUnits: true,
    canEditTenancies: true,
  }, [], new Set(['property_management.landlord']));
  const legacy = resolveEffectivePermissions({ role: 'attendant' }, {
    canManageProperties: true,
    canManagePropertyUnits: true,
    canManageTenancies: true,
  }, [], new Set(['property_management.landlord']));
  const editWithoutFeature = resolveEffectivePermissions({ role: 'attendant' }, {
    canEditTenancies: true,
  }, [], new Set());

  assert.ok(editOnly.includes('canEditProperties'));
  assert.ok(editOnly.includes('canEditPropertyUnits'));
  assert.ok(editOnly.includes('canEditTenancies'));
  assert.ok(!editOnly.includes('canCreateTenancies'));
  assert.ok(legacy.includes('canEditProperties'));
  assert.ok(legacy.includes('canEditPropertyUnits'));
  assert.ok(legacy.includes('canEditTenancies'));
  assert.ok(!editWithoutFeature.includes('canEditTenancies'));
  assert.ok(ALL_PERMISSION_KEYS.includes('canEditTenancies'));
  assert.equal(PERMISSION_METADATA.canEditTenancies.category, 'property_management');
});

test('prisma schema includes the separately assignable tenancy edit field', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');
  assert.match(schema, /canEditTenancies\s+Boolean\s+@default\(false\)/);
});

test('route permissions and Prisma permission columns stay registered', () => {
  const root = path.resolve(process.cwd(), 'src/routes');
  const routeFiles = readdirSync(root).filter(file => file.endsWith('.js'));
  const source = routeFiles.map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
  const routeKeys = [...source.matchAll(/require(?:Any)?Permission\s*\(\s*(?:\[([^\]]*)\]|'([^']+)'|"([^"]+)")/g)]
    .flatMap(match => (match[1] || match[2] || match[3] || '').match(/['"](can[A-Za-z0-9]+)['"]/g) || [])
    .map(match => match.replace(/['"]/g, ''));
  const missingRouteKeys = [...new Set(routeKeys)].filter(key => !ALL_PERMISSION_KEYS.includes(key));
  const schema = readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const missingColumns = ALL_PERMISSION_KEYS.filter(key => !new RegExp(`\\b${key}\\s+Boolean`).test(schema));

  assert.deepEqual(missingRouteKeys, []);
  assert.deepEqual(missingColumns, []);
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

test('customer credit-limit create and edit permissions are independent; legacy grants remain compatible', () => {
  const limitedUser = resolveEffectivePermissions({ role: 'attendant' }, {
    canViewCustomerBalance: true,
    canViewCustomerCreditLimit: true,
  }, [], new Set(['customers', 'receivables']));
  const manager = resolveEffectivePermissions({ role: 'attendant' }, {
    canManageCustomerCreditLimit: true,
  }, [], new Set(['customers', 'receivables']));
  const createOnly = resolveEffectivePermissions({ role: 'attendant' }, {
    canCreateCustomerCreditLimit: true,
  }, [], new Set(['customers', 'receivables']));
  const editOnly = resolveEffectivePermissions({ role: 'attendant' }, {
    canEditCustomerCreditLimit: true,
  }, [], new Set(['customers', 'receivables']));

  assert.ok(limitedUser.includes('canViewCustomerCreditLimit'));
  assert.ok(!limitedUser.includes('canManageCustomerCreditLimit'));
  assert.ok(manager.includes('canCreateCustomerCreditLimit'));
  assert.ok(manager.includes('canEditCustomerCreditLimit'));
  assert.ok(!manager.includes('canManageCustomerCreditLimit'));
  assert.ok(manager.includes('canViewCustomerCreditLimit'));
  assert.ok(createOnly.includes('canCreateCustomerCreditLimit'));
  assert.ok(createOnly.includes('canViewCustomerCreditLimit'));
  assert.ok(!createOnly.includes('canEditCustomerCreditLimit'));
  assert.ok(editOnly.includes('canEditCustomerCreditLimit'));
  assert.ok(editOnly.includes('canViewCustomerCreditLimit'));
  assert.ok(!editOnly.includes('canCreateCustomerCreditLimit'));
  assert.equal(PERMISSION_METADATA.canViewCustomerCreditLimit.category, 'customers');
  assert.equal(PERMISSION_METADATA.canManageCustomerCreditLimit.category, 'customers');
  assert.equal(PERMISSION_METADATA.canCreateCustomerCreditLimit.category, 'customers');
  assert.equal(PERMISSION_METADATA.canEditCustomerCreditLimit.category, 'customers');
});

test('customer credit-limit create and edit permissions are present in the Prisma permission record', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /canCreateCustomerCreditLimit\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /canEditCustomerCreditLimit\s+Boolean\s+@default\(false\)/);
});

test('clinic, pharmacy, and bar permissions expose independent supported actions', () => {
  const groups = {
    clinic_patients: ['canViewClinicPatients', 'canCreateClinicPatients', 'canEditClinicPatients'],
    clinic_appointments: ['canViewClinicAppointments', 'canCreateClinicAppointments', 'canEditClinicAppointments'],
    clinic_encounters: ['canViewClinicEncounters', 'canCreateClinicEncounters'],
    clinic_prescriptions: ['canViewClinicPrescriptions', 'canCreateClinicPrescriptions'],
    pharmacy_catalogue: ['canViewPharmacyCatalogue', 'canCreatePharmacyCatalogue', 'canEditPharmacyCatalogue'],
    pharmacy_batches: ['canViewPharmacyBatches', 'canCreatePharmacyBatches'],
    bar_menu: ['canViewBarMenu', 'canCreateBarMenu', 'canEditBarMenu', 'canDeleteBarMenu'],
    bar_orders: ['canViewBarOrders', 'canCreateBarOrders', 'canEditBarOrders', 'canCancelBarOrders'],
  };
  for (const [category, keys] of Object.entries(groups)) {
    for (const key of keys) {
      assert.ok(ALL_PERMISSION_KEYS.includes(key), `${key} is registered`);
      assert.equal(PERMISSION_METADATA[key]?.category, category);
      assert.ok(PERMISSION_METADATA[key]?.name);
    }
  }
  assert.ok(ALL_PERMISSION_KEYS.includes('canDispensePharmacyPrescriptions'));
  assert.ok(ALL_PERMISSION_KEYS.includes('canApproveSalonCommission'));
});

test('legacy clinic, pharmacy, and restaurant grants retain their old effective access', () => {
  const granted = resolveEffectivePermissions(
    { role: 'attendant' },
    { canManageClinicPatients: true, canManagePharmacyCatalogue: true, canCreateRestaurant: true },
    [],
    new Set(['clinic_management', 'pharmacy_management', 'bar']),
  );
  for (const key of ['canCreateClinicPatients', 'canEditClinicPatients', 'canCreatePharmacyCatalogue', 'canEditPharmacyCatalogue', 'canCreateBarMenu', 'canCreateBarOrders']) {
    assert.ok(granted.includes(key), `${key} remains granted for a legacy assignment`);
  }
  assert.ok(!granted.includes('canEditBarOrders'), 'legacy create-order access does not grant order editing');
});

test('recording receivables stays unavailable when the SaaS tenant lacks the receivables feature', () => {
  const permissions = resolveEffectivePermissions({ role: 'attendant' }, { canCreateReceivable: true }, [], new Set(['customers']));
  assert.ok(!permissions.includes('canCreateReceivable'));
});
