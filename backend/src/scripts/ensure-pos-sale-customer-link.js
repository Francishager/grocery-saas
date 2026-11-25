import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe('ALTER TABLE sales ADD COLUMN IF NOT EXISTS "customerId" TEXT')
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE lower(conname) = lower('sales_customerId_fkey')
        AND conrelid = 'sales'::regclass
    ) THEN
      ALTER TABLE sales ADD CONSTRAINT "sales_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`)
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS sales_tenant_customer_created_idx ON sales ("tenantId", "customerId", "createdAt")')
  await prisma.$executeRawUnsafe(`UPDATE sales AS sale
    SET "customerId" = customer.id
    FROM customers AS customer
    WHERE sale."customerId" IS NULL
      AND sale."tenantId" = customer."tenantId"
      AND (customer."branchId" IS NULL OR customer."branchId" = sale."branchId")
      AND NULLIF(trim(sale."customerName"), '') IS NOT NULL
      AND lower(trim(sale."customerName")) = lower(trim(customer.name))
      AND NOT EXISTS (
        SELECT 1 FROM customers AS other
        WHERE other."tenantId" = sale."tenantId"
          AND (other."branchId" IS NULL OR other."branchId" = sale."branchId")
          AND lower(trim(other.name)) = lower(trim(sale."customerName"))
          AND other.id <> customer.id
      )`)
  console.log('POS sale customer links are ready; uniquely matching historical names were linked.')
} catch (error) {
  console.error('Unable to prepare POS sale customer links:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
