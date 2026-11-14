import prisma from '../db.js';

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026111401)');
    for (const table of ['purchase_items', 'supplier_purchase_items', 'sale_return_items']) {
      await tx.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "${table}"
        ADD COLUMN IF NOT EXISTS "enteredQuantity" DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "unitName" TEXT,
        ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION
      `);
    }
  }, { timeout: 30000 });
  console.log('Inventory line unit snapshots are ready. Existing stock quantities were not changed.');
} catch (error) {
  console.error('Unable to prepare inventory line unit snapshot schema:', error.code || '', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
