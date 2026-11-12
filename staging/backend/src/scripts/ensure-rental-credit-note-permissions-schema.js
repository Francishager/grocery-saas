import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS user_permissions
      ADD COLUMN IF NOT EXISTS "canViewRentalCreditNotes" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "canCreateRentalCreditNote" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "canEditRentalCreditNote" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "canRefundRentalCreditNote" BOOLEAN NOT NULL DEFAULT false
  `)
  console.log('Rental credit note permissions schema is ready.')
} catch (error) {
  console.error('Unable to prepare rental credit note permission columns:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
