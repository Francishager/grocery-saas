CREATE TABLE IF NOT EXISTS "receivables_accounting_configs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "receivableAccountId" TEXT,
  "salesRevenueAccountId" TEXT,
  "taxPayableAccountId" TEXT,
  "salesReturnsAccountId" TEXT,
  "costOfGoodsSoldAccountId" TEXT,
  "inventoryAccountId" TEXT,
  "customerAdvancesAccountId" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "configuredBy" TEXT,
  "configuredAt" TIMESTAMP(3),
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receivables_accounting_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receivables_accounting_configs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "receivables_accounting_configs_receivableAccountId_fkey"
    FOREIGN KEY ("receivableAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivables_accounting_configs_salesRevenueAccountId_fkey"
    FOREIGN KEY ("salesRevenueAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivables_accounting_configs_taxPayableAccountId_fkey"
    FOREIGN KEY ("taxPayableAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivables_accounting_configs_salesReturnsAccountId_fkey"
    FOREIGN KEY ("salesReturnsAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivables_accounting_configs_costOfGoodsSoldAccountId_fkey"
    FOREIGN KEY ("costOfGoodsSoldAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivables_accounting_configs_inventoryAccountId_fkey"
    FOREIGN KEY ("inventoryAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivables_accounting_configs_customerAdvancesAccountId_fkey"
    FOREIGN KEY ("customerAdvancesAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "receivables_accounting_configs_tenantId_key"
  ON "receivables_accounting_configs"("tenantId");

CREATE TABLE IF NOT EXISTS "receivables_gl_migration_batches" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "approvedByUserId" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actionCount" INTEGER NOT NULL,
  "blockedCount" INTEGER NOT NULL,
  "plan" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receivables_gl_migration_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receivables_gl_migration_batches_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "receivables_gl_migration_batches_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "receivables_gl_migration_batches_tenantId_fingerprint_key"
  ON "receivables_gl_migration_batches"("tenantId", "fingerprint");
CREATE INDEX IF NOT EXISTS "receivables_gl_migration_batches_tenantId_appliedAt_idx"
  ON "receivables_gl_migration_batches"("tenantId", "appliedAt");
