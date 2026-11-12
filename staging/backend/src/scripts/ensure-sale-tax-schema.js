import prisma from '../db.js'

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'")
    await tx.$executeRaw`ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION`
    await tx.$executeRaw`ALTER TABLE "sale_record_items" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION`
    await tx.$executeRaw`ALTER TABLE "sale_returns" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION`
    await tx.$executeRaw`ALTER TABLE "sale_return_items" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION`
    await tx.$executeRaw`ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION`
  }, { timeout: 30000 })
  console.log('Sale and return tax snapshot schema ready.')
} catch (error) {
  console.error('Unable to prepare sale tax snapshots. Apply the additive tax snapshot migration before starting the backend.', error.code || '')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
