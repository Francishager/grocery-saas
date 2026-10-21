import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "customer_credit_applications" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "branchId" TEXT,
      "customerId" TEXT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "saleId" TEXT NOT NULL REFERENCES "sale_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "amount" DECIMAL(18,2) NOT NULL,
      "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "customer_credit_applications_tenant_source_sale_key" ON "customer_credit_applications"("tenantId", "sourceType", "sourceId", "saleId")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "customer_credit_applications_tenant_customer_created_idx" ON "customer_credit_applications"("tenantId", "customerId", "createdAt")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "customer_credit_applications_tenant_sale_idx" ON "customer_credit_applications"("tenantId", "saleId")`)
  console.log('Customer credit application schema is ready')
} catch (error) {
  console.error('Failed to prepare customer credit application schema:', error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
