import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS rental_accounting_configs
      ADD COLUMN IF NOT EXISTS "renterCreditPayableAccountId" TEXT
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rental_credit_notes (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL REFERENCES tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "rentalId" TEXT NOT NULL REFERENCES rentals("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "noteNo" TEXT NOT NULL,
      "idempotencyKey" TEXT,
      "amount" DOUBLE PRECISION NOT NULL,
      "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "appliedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "refundDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "reason" TEXT NOT NULL,
      "notes" TEXT,
      "status" TEXT NOT NULL DEFAULT 'issued',
      "userId" TEXT NOT NULL REFERENCES users("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "rental_credit_notes_amounts_nonnegative" CHECK (
        "amount" > 0 AND "taxAmount" >= 0 AND "appliedAmount" >= 0 AND
        "refundDue" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "refundDue"
      )
    )
  `)
  await prisma.$executeRawUnsafe(`ALTER TABLE rental_credit_notes ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT`)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE rental_payments ADD COLUMN IF NOT EXISTS "rentalCreditNoteId" TEXT
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF to_regclass('public.rental_payments') IS NOT NULL
        AND to_regclass('public.rental_credit_notes') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass('public.rental_payments')
            AND lower(conname) = lower('rental_payments_rentalCreditNoteId_fkey')
        ) THEN
        ALTER TABLE rental_payments ADD CONSTRAINT rental_payments_rentalCreditNoteId_fkey
          FOREIGN KEY ("rentalCreditNoteId") REFERENCES rental_credit_notes("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "rental_credit_notes_tenantId_noteNo_key" ON rental_credit_notes("tenantId", "noteNo")`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "rental_credit_notes_tenantId_idempotencyKey_key" ON rental_credit_notes("tenantId", "idempotencyKey")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_credit_notes_tenantId_rentalId_createdAt_idx" ON rental_credit_notes("tenantId", "rentalId", "createdAt")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payments_rentalCreditNoteId_idx" ON rental_payments("rentalCreditNoteId")`)
  console.log('Rental credit note schema is ready.')
} catch (error) {
  console.error('Unable to prepare rental credit note schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
