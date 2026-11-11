import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Salon & Spa is opt-in and server routes enforce module, subfeature, and action permissions', async () => {
  const router = await read('../routes/salon.js');
  const schemaSetup = await read('../src/scripts/ensure-salon-spa-schema.js');
  assert.match(router, /router\.use\(authenticateToken, requireTenant, requireFeature\('salon_spa'\)\)/);
  for (const permission of ['canViewSalonChair', 'canCreateSalonChair', 'canEditSalonChair', 'canDeactivateSalonChair', 'canAssignSalonChair', 'canViewSalonCommission', 'canConfigureSalonCommission', 'canApproveSalonCommission', 'canIncludeSalonCommissionInPayroll', 'canPaySalonCommission', 'canAssignSalonStylist']) {
    assert.match(router, new RegExp(permission));
    assert.match(schemaSetup, new RegExp(`'${permission}'`));
  }
  for (const permission of ['canViewSalonStylist', 'canCreateSalonStylist', 'canEditSalonStylist', 'canDeactivateSalonStylist']) {
    assert.match(router, new RegExp(permission));
    assert.match(schemaSetup, new RegExp(`'${permission}'`));
  }
  assert.match(router, /router\.get\('\/stylists'/);
  assert.match(router, /router\.post\('\/stylists'/);
  assert.match(schemaSetup, /salon\.chair_scheduling/);
  assert.match(schemaSetup, /salon\.stylist_commissions/);
  assert.doesNotMatch(schemaSetup, /tenantFeature\.create|planFeature\.create/);
});

test('Bar queue has independent view/update permissions and does not grant restaurant-wide access', async () => {
  const restaurant = await read('../routes/restaurant.js');
  const permissions = await read('../src/utils/permissions.js');
  const schema = await read('../prisma/schema.prisma');
  assert.match(restaurant, /router\.get\('\/bar\/orders'.*canViewRestaurant', 'canViewBarQueue/);
  assert.match(restaurant, /canUpdateBarQueue/);
  assert.match(permissions, /"canViewBarQueue", "canUpdateBarQueue"/);
  assert.match(schema, /canViewBarQueue\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /canUpdateBarQueue\s+Boolean\s+@default\(false\)/);
});

test('chair scheduling serializes concurrent bookings and rejects overlapping time slots', async () => {
  const serviceRoutes = await read('../routes/service.js');
  assert.match(serviceRoutes, /pg_advisory_xact_lock/);
  assert.match(serviceRoutes, /start < otherEnd && otherStart < end/);
  assert.match(serviceRoutes, /That chair is already booked during this time/);
  assert.match(serviceRoutes, /salonChairId/);
});

test('completed appointments snapshot commissions and approved commissions can only be claimed once by payroll', async () => {
  const serviceRoutes = await read('../routes/service.js');
  const payroll = await read('../src/services/payrollService.js');
  assert.match(serviceRoutes, /saveSalonCommission\(appt\)/);
  assert.match(serviceRoutes, /serviceRevenue, commissionType: stylist\.commissionType/);
  assert.match(payroll, /status: 'approved'/);
  assert.match(payroll, /status: 'included_in_payroll'/);
  assert.match(payroll, /claimed\.count !== ids\.length/);
  assert.match(payroll, /payrollAdjustment\.createMany/);
});

test('Salon walk-ins use Salon stylist profiles and do not require an HR employee', async () => {
  const serviceRoutes = await read('../routes/service.js');
  const salonRoutes = await read('../routes/salon.js');
  const schema = await read('../prisma/schema.prisma');
  const migration = await read('../src/scripts/ensure-salon-spa-schema.js');
  assert.match(serviceRoutes, /bookingType === 'walk_in' \? 'Walk-in customer'/);
  assert.match(serviceRoutes, /status: bookingType === 'walk_in' \? 'in_progress' : 'scheduled'/);
  assert.match(serviceRoutes, /salonStylistId \? \{ id: appointment\.salonStylistId \}/);
  assert.match(schema, /salonStylistId\s+String\?/);
  assert.match(schema, /bookingType\s+String\s+@default\("appointment"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "salonStylistId" TEXT/);
  assert.match(salonRoutes, /const employeeId = String\(req\.body\.employeeId \|\| ''\)\.trim\(\) \|\| null/);
  assert.match(salonRoutes, /canPaySalonCommission/);
});

test('direct stylist commission payouts are permission checked, idempotent GL postings and excluded from payroll', async () => {
  const salonRoutes = await read('../routes/salon.js');
  const permissions = await read('../src/utils/servicePermissions.js');
  const payroll = await read('../src/services/payrollService.js');
  assert.match(permissions, /id: "canPaySalonCommission"/);
  assert.match(salonRoutes, /requirePermission\('canPaySalonCommission'\)/);
  assert.match(salonRoutes, /canUseTransactionAccountForPayment\(req, cashAccount, cashAccount\.type\)/);
  assert.match(salonRoutes, /sourceType: 'SALON_COMMISSION_DIRECT_PAYOUT'/);
  assert.match(salonRoutes, /debit: commission\.commissionAmount/);
  assert.match(salonRoutes, /credit: commission\.commissionAmount/);
  assert.match(salonRoutes, /status: 'paid_directly'/);
  assert.match(payroll, /status: 'approved'/);
  assert.match(salonRoutes, /ensureSalonCommissionExpenseAccount/);
  assert.match(salonRoutes, /ensureSalonCashLedgerAccount/);
});

test('Salon coordinator can be delegated stylist and chair assignment separately from general appointment editing', async () => {
  const serviceRoutes = await read('../routes/service.js');
  const permissions = await read('../src/utils/servicePermissions.js');
  const frontendPermissions = await read('../../frontend/src/lib/servicePermissions.ts');
  for (const key of ['canAssignSalonStylist', 'canAssignSalonChair']) {
    assert.match(permissions, new RegExp(`id: "${key}"`));
    assert.match(frontendPermissions, new RegExp(`id: "${key}"`));
  }
  assert.match(serviceRoutes, /appointments\/:id\/salon-assignment/);
  assert.match(serviceRoutes, /You do not have permission to assign a Salon stylist/);
  assert.match(serviceRoutes, /You do not have permission to assign a Salon chair/);
  assert.match(serviceRoutes, /validateChairSlot\(tx, \{ tenantId: tenant, chairId/);
});
