import prisma from '../db.js';

const permissionColumns = [
  'canViewCustomerIdentity',
  'canCancelRental',
  'canRecordRentalPayment',
  'canRefundRentalDeposit',
  'canRefundRentalAdvance',
  'canForfeitRentalDeposit',
  'canViewPlanner',
  'canManagePlanner',
  'canViewCRM',
  'canCreateCRM',
  'canEditCRM',
  'canDeleteCRM',
  'canReactivateTenancies',
  'canEditRentPeriods',
  'canApplyTenantDepositToRent',
];

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026110101)');
    for (const column of permissionColumns) {
      await tx.$executeRawUnsafe(`ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "${column}" BOOLEAN NOT NULL DEFAULT false`);
    }
    await tx.$executeRawUnsafe('ALTER TABLE IF EXISTS "property_rent_payments" ADD COLUMN IF NOT EXISTS "mobileProvider" TEXT');
    await tx.$executeRawUnsafe('ALTER TABLE IF EXISTS "property_rent_payments" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT');
  }, { timeout: 30000 });
  console.log('Payment permission and rent mobile-money columns are ready.');
} catch (error) {
  console.error('Failed to ensure payment permission and rent mobile-money columns:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
