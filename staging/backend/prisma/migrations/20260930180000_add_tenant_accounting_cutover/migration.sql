CREATE TABLE IF NOT EXISTS "tenant_accounting_cutovers" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_accounting_cutovers_tenantId_key" ON "tenant_accounting_cutovers"("tenantId");
CREATE INDEX IF NOT EXISTS "tenant_accounting_cutovers_status_cutoverAt_idx" ON "tenant_accounting_cutovers"("status", "cutoverAt");
DO $cutover_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_accounting_cutovers_tenantId_fkey') THEN
    ALTER TABLE "tenant_accounting_cutovers" ADD CONSTRAINT "tenant_accounting_cutovers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_accounting_cutovers_performedById_fkey') THEN
    ALTER TABLE "tenant_accounting_cutovers" ADD CONSTRAINT "tenant_accounting_cutovers_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$cutover_constraints$;
