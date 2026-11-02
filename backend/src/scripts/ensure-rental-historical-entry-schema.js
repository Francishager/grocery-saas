import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS rentals
      ADD COLUMN IF NOT EXISTS "isHistoricalRecord" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "historicalImportKey" TEXT,
      ADD COLUMN IF NOT EXISTS "historicalReference" TEXT,
      ADD COLUMN IF NOT EXISTS "isHistoricalReceivable" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "historicalReceivableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF to_regclass('public.rentals') IS NOT NULL THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "rentals_tenantId_historicalImportKey_key" ON rentals("tenantId", "historicalImportKey")';
      END IF;
    END $$
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS customer_payment_allocations
      ADD COLUMN IF NOT EXISTS "rentalId" TEXT
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF to_regclass('public.customer_payment_allocations') IS NOT NULL
        AND to_regclass('public.rentals') IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'customer_payment_allocations_rentalId_fkey'
        ) THEN
          ALTER TABLE customer_payment_allocations
            ADD CONSTRAINT customer_payment_allocations_rentalId_fkey
            FOREIGN KEY ("rentalId") REFERENCES rentals(id) ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
        CREATE UNIQUE INDEX IF NOT EXISTS "customer_payment_allocations_paymentId_rentalId_key"
          ON customer_payment_allocations("paymentId", "rentalId");
        CREATE INDEX IF NOT EXISTS "customer_payment_allocations_tenantId_rentalId_createdAt_idx"
          ON customer_payment_allocations("tenantId", "rentalId", "createdAt");
      END IF;
    END $$
  `)
  console.log('Rental historical-entry fields are ready.')
} catch (error) {
  console.error('Unable to prepare rental historical-entry fields:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
