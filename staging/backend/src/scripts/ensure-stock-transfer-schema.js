import prisma from '../db.js';

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('ALTER TABLE "stock_transfer_items" ADD COLUMN IF NOT EXISTS "destinationProductId" TEXT');
    await tx.$executeRawUnsafe('ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT');
    await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "stock_transfer_items_destinationProductId_idx" ON "stock_transfer_items"("destinationProductId")');
    await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "stock_transfers_reversalOfId_idx" ON "stock_transfers"("reversalOfId")');
    await tx.$executeRawUnsafe(`DO $transfer_constraints$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfer_items_destinationProductId_fkey') THEN
          ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_destinationProductId_fkey"
            FOREIGN KEY ("destinationProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_reversalOfId_fkey') THEN
          ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_reversalOfId_fkey"
            FOREIGN KEY ("reversalOfId") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $transfer_constraints$`);
  }, { timeout: 30000 });
  console.log('Branch stock transfer schema ready.');
} catch (error) {
  console.error('Unable to prepare branch stock transfer schema.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
