import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe('ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS "createdById" TEXT')
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'customer_payments_createdbyid_fkey'
        AND conrelid = 'customer_payments'::regclass
    ) THEN
      ALTER TABLE customer_payments
        ADD CONSTRAINT customer_payments_createdbyid_fkey
        FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$`)
  await prisma.$executeRawUnsafe(`WITH matched_cashiers AS (
    SELECT DISTINCT ON (payment.id) payment.id AS payment_id, cash."userId" AS user_id
    FROM customer_payments payment
    JOIN cash_transactions cash
      ON cash."tenantId" = payment."tenantId"
      AND cash.reference = COALESCE(NULLIF(payment.reference, ''), payment.id)
      AND cash."userId" IS NOT NULL
    WHERE payment."createdById" IS NULL
    ORDER BY payment.id, cash."createdAt" DESC, cash.id DESC
  )
  UPDATE customer_payments payment
  SET "createdById" = matched_cashiers.user_id
  FROM matched_cashiers
  WHERE payment.id = matched_cashiers.payment_id`)
  const [column] = await prisma.$queryRaw`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'customer_payments'
      AND column_name = 'createdById'
  ) AS present`
  if (!column?.present) throw new Error('customer_payments.createdById was not created')
  console.log('Customer payment cashier attribution is ready.')
} catch (error) {
  console.error('Unable to prepare customer payment cashier attribution:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
