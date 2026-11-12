import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe('ALTER TABLE "property_tenancies" ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT')
  await prisma.$executeRawUnsafe('ALTER TABLE "property_tenancies" ADD COLUMN IF NOT EXISTS "advanceMonthsRequired" INTEGER')
  await prisma.$executeRawUnsafe('ALTER TABLE "property_tenancies" ADD COLUMN IF NOT EXISTS "depositMonthsRequired" INTEGER')
  console.log('Property tenancy contact and move-in terms schema is ready.')
} catch (error) {
  console.error('Unable to prepare property tenancy alternate phone schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
