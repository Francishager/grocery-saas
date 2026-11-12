import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`ALTER TABLE IF EXISTS customers ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT`)
  console.log('Customer alternate phone field is ready.')
} catch (error) {
  console.error('Unable to prepare customer alternate phone schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
