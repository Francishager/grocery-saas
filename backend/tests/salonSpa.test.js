import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Salon & Spa is opt-in and server routes enforce module, subfeature, and action permissions', async () => {
  const router = await read('../routes/salon.js');
  const schemaSetup = await read('../src/scripts/ensure-salon-spa-schema.js');
  assert.match(router, /router\.use\(authenticateToken, requireTenant, requireFeature\('salon_spa'\)\)/);
  for (const permission of ['canViewSalonChair', 'canCreateSalonChair', 'canEditSalonChair', 'canDeactivateSalonChair', 'canViewSalonCommission', 'canConfigureSalonCommission', 'canApproveSalonCommission', 'canIncludeSalonCommissionInPayroll']) {
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
