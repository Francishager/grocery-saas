import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS rental_charge_lines
      ADD COLUMN IF NOT EXISTS "lineType" TEXT NOT NULL DEFAULT 'service',
      ADD COLUMN IF NOT EXISTS "productId" TEXT,
      ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "stockConsumedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS rental_items
      ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS rental_accounting_configs
      ADD COLUMN IF NOT EXISTS "inventoryAccountId" TEXT,
      ADD COLUMN IF NOT EXISTS "costOfGoodsSoldAccountId" TEXT,
      ADD COLUMN IF NOT EXISTS "salesRevenueAccountId" TEXT
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF to_regclass('public.rental_charge_lines') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS "rental_charge_lines_productId_idx" ON rental_charge_lines("productId")';
      END IF;
      IF to_regclass('public.rental_charge_lines') IS NOT NULL
        AND to_regclass('public.products') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass('public.rental_charge_lines')
            AND lower(conname) = lower('rental_charge_lines_productId_fkey')
        ) THEN
        ALTER TABLE rental_charge_lines ADD CONSTRAINT rental_charge_lines_productId_fkey
          FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$
  `)
  console.log('Rental mixed-booking fields are ready.')
} catch (error) {
  console.error('Unable to prepare rental mixed-booking fields:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
