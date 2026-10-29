import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe('ALTER TABLE "property_tenancies" ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT')
  console.log('Property tenancy alternate phone schema is ready.')
} catch (error) {
  console.error('Unable to prepare property tenancy alternate phone schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
