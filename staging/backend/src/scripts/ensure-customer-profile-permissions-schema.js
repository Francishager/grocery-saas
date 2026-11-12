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
  'canViewCustomerNotes',
  'canRecordCustomerPayment',
  'canPrintCustomerReceipts',
];

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026102412)');
    const existingColumns = await tx.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'user_permissions'
    `;
    const existing = new Set(existingColumns.map((row) => row.column_name));
    for (const column of permissionColumns) {
      await tx.$executeRawUnsafe(`ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "${column}" BOOLEAN NOT NULL DEFAULT false`);
    }
    if (!existing.has('canViewCustomerNotes')) {
      await tx.$executeRawUnsafe('UPDATE "user_permissions" SET "canViewCustomerNotes" = "canViewCustomer"');
    }
    if (!existing.has('canRecordCustomerPayment')) {
      await tx.$executeRawUnsafe('UPDATE "user_permissions" SET "canRecordCustomerPayment" = "canCreateReceivable"');
    }
    if (!existing.has('canPrintCustomerReceipts')) {
      await tx.$executeRawUnsafe(`UPDATE "user_permissions" SET "canPrintCustomerReceipts" =
        "canViewCustomerSalesHistory" OR "canViewCustomerPaymentsHistory" OR
        "canViewCustomerReturnsHistory" OR "canViewCustomerCreditNotesHistory" OR "canViewCustomerWithdrawalsHistory"`);
    }
  }, { timeout: 30000 });
  console.log('Customer profile permission columns are ready.');
} catch (error) {
  console.error('Failed to ensure customer profile permission columns:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
