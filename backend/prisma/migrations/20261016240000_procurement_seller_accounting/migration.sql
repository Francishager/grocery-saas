ALTER TABLE "sale_records"
  ADD COLUMN "freightAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "receivables_accounting_configs"
  ADD COLUMN "marketplaceSettlementAccountId" TEXT;

ALTER TABLE "procurement_invoices"
  ADD COLUMN "sellerCustomerId" TEXT,
  ADD COLUMN "sellerSaleRecordId" TEXT;

ALTER TABLE "procurement_invoice_lines"
  ADD COLUMN "sellerProductId" TEXT;

CREATE TABLE "procurement_customer_links" (
  "id" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_customer_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procurement_customer_links_customerId_key"
  ON "procurement_customer_links"("customerId");
CREATE UNIQUE INDEX "procurement_customer_links_sellerTenantId_buyerTenantId_key"
  ON "procurement_customer_links"("sellerTenantId", "buyerTenantId");
CREATE INDEX "procurement_customer_links_buyerTenantId_idx"
  ON "procurement_customer_links"("buyerTenantId");
CREATE UNIQUE INDEX "procurement_invoices_sellerSaleRecordId_key"
  ON "procurement_invoices"("sellerSaleRecordId");

ALTER TABLE "procurement_customer_links"
  ADD CONSTRAINT "procurement_customer_links_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receivables_accounting_configs"
  ADD CONSTRAINT "receivables_accounting_configs_marketplaceSettlementAccountId_fkey"
  FOREIGN KEY ("marketplaceSettlementAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_invoices"
  ADD CONSTRAINT "procurement_invoices_sellerSaleRecordId_fkey"
  FOREIGN KEY ("sellerSaleRecordId") REFERENCES "sale_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_invoices"
  ADD CONSTRAINT "procurement_invoices_sellerCustomerId_fkey"
  FOREIGN KEY ("sellerCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_invoice_lines"
  ADD CONSTRAINT "procurement_invoice_lines_sellerProductId_fkey"
  FOREIGN KEY ("sellerProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
