import prisma from '../db.js'

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'")
    await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "tenant_accounting_cutovers" (
      "id" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "cutoverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "performedById" TEXT NOT NULL,
      "sourceFingerprint" TEXT NOT NULL,
      "openingJournalId" TEXT,
      "snapshot" JSONB NOT NULL,
      "exceptions" JSONB NOT NULL,
      "exceptionCount" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'active_with_exceptions',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "tenant_accounting_cutovers_pkey" PRIMARY KEY ("id")
    )`)
    await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "tenant_accounting_cutovers_tenantId_key" ON "tenant_accounting_cutovers"("tenantId")')
    await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "tenant_accounting_cutovers_status_cutoverAt_idx" ON "tenant_accounting_cutovers"("status", "cutoverAt")')
    await tx.$executeRawUnsafe(`DO $cutover_constraints$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_accounting_cutovers_tenantId_fkey') THEN
          ALTER TABLE "tenant_accounting_cutovers" ADD CONSTRAINT "tenant_accounting_cutovers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_accounting_cutovers_performedById_fkey') THEN
          ALTER TABLE "tenant_accounting_cutovers" ADD CONSTRAINT "tenant_accounting_cutovers_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
      END
      $cutover_constraints$`)
  }, { timeout: 30000 })
  console.log('Tenant accounting cutover schema ready.')
} catch (error) {
  console.error('Unable to prepare tenant accounting cutover schema.', error.code || '')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
