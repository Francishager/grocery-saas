ALTER TABLE "receivables_accounting_configs"
  ADD COLUMN "openingBalanceEquityAccountId" TEXT;

ALTER TABLE "receivables_accounting_configs"
  ADD CONSTRAINT "receivables_accounting_configs_openingBalanceEquityAccountId_fkey"
  FOREIGN KEY ("openingBalanceEquityAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
