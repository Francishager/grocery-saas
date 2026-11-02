import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS rentals
      ADD COLUMN IF NOT EXISTS "cancellationChargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancellationChargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancellationTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancellationChargeBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancellationRefundDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancellationRefundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
      ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "cancelledById" TEXT
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS rental_accounting_configs
      ADD COLUMN IF NOT EXISTS "cancellationFeeRevenueAccountId" TEXT
  `)
  console.log('Rental cancellation accounting fields are ready.')
} catch (error) {
  console.error('Unable to prepare rental cancellation schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
