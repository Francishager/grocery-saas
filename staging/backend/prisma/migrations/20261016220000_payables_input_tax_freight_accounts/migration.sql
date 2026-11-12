ALTER TABLE "payables_accounting_configs"
  ADD COLUMN "inputTaxAccountId" TEXT,
  ADD COLUMN "freightInventoryAccountId" TEXT,
  ADD COLUMN "freightExpenseAccountId" TEXT;

ALTER TABLE "procurement_invoices"
  ADD COLUMN "freightInventoryAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "freightExpenseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "payables_accounting_configs"
  ADD CONSTRAINT "payables_accounting_configs_inputTaxAccountId_fkey" FOREIGN KEY ("inputTaxAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "payables_accounting_configs_freightInventoryAccountId_fkey" FOREIGN KEY ("freightInventoryAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "payables_accounting_configs_freightExpenseAccountId_fkey" FOREIGN KEY ("freightExpenseAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
