import prisma from '../db.js'

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'")
    await tx.$executeRaw`ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "walletAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`
    await tx.$executeRaw`ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "creditDisposition" TEXT`
    await tx.$executeRaw`ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "creditDispositionSaleId" TEXT`
  }, { timeout: 30000 })
  console.log('Credit note customer settlement schema is ready.')
} catch (error) {
  console.error('Unable to prepare credit note customer settlement fields.', error.code || '')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
