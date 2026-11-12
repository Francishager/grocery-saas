CREATE TABLE "payables_accounting_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payableAccountId" TEXT,
    "openingBalanceEquityAccountId" TEXT,
    "purchaseExpenseAccountId" TEXT,
    "inventoryAccountId" TEXT,
    "purchaseReturnsAccountId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "configuredBy" TEXT,
    "configuredAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payables_accounting_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "accounts" ADD COLUMN "isSystemManaged" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "payables_accounting_configs_tenantId_key" ON "payables_accounting_configs"("tenantId");
CREATE INDEX "payables_accounting_configs_tenantId_idx" ON "payables_accounting_configs"("tenantId");
ALTER TABLE "payables_accounting_configs" ADD CONSTRAINT "payables_accounting_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payables_accounting_configs" ADD CONSTRAINT "payables_accounting_configs_payableAccountId_fkey" FOREIGN KEY ("payableAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables_accounting_configs" ADD CONSTRAINT "payables_accounting_configs_openingBalanceEquityAccountId_fkey" FOREIGN KEY ("openingBalanceEquityAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables_accounting_configs" ADD CONSTRAINT "payables_accounting_configs_purchaseExpenseAccountId_fkey" FOREIGN KEY ("purchaseExpenseAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables_accounting_configs" ADD CONSTRAINT "payables_accounting_configs_inventoryAccountId_fkey" FOREIGN KEY ("inventoryAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables_accounting_configs" ADD CONSTRAINT "payables_accounting_configs_purchaseReturnsAccountId_fkey" FOREIGN KEY ("purchaseReturnsAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
