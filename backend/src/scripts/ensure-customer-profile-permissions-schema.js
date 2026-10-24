import prisma from '../db.js';

const permissionColumns = [
  'canViewCustomerPhone',
  'canViewCustomerEmail',
  'canViewCustomerAddress',
  'canViewCustomerBalance',
  'canViewCustomerSalesHistory',
  'canViewCustomerPaymentsHistory',
  'canViewCustomerReturnsHistory',
  'canViewCustomerCreditNotesHistory',
  'canViewCustomerWithdrawalsHistory',
  'canViewCustomerBusinessActivity',
];

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026102412)');
    for (const column of permissionColumns) {
      await tx.$executeRawUnsafe(`ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "${column}" BOOLEAN NOT NULL DEFAULT false`);
    }
  }, { timeout: 30000 });
  console.log('Customer profile permission columns are ready.');
} catch (error) {
  console.error('Failed to ensure customer profile permission columns:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
