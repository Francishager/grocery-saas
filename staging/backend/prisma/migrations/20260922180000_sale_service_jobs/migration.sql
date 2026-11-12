CREATE TABLE IF NOT EXISTS "product_service_links" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "serviceProductId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_service_links_productId_serviceProductId_key" ON "product_service_links"("productId", "serviceProductId");
CREATE INDEX IF NOT EXISTS "product_service_links_tenantId_serviceProductId_idx" ON "product_service_links"("tenantId", "serviceProductId");
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "saleId" TEXT REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "saleItemId" TEXT REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "saleReceiptNo" TEXT;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "soldProductName" TEXT;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "serviceSource" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "serviceQuantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "servicePrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "serviceRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "productRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "serviceRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "sale_record_items" ADD COLUMN IF NOT EXISTS "productRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "sale_record_items" ADD COLUMN IF NOT EXISTS "serviceRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "service_job_cards_saleItemId_productId_key" ON "service_job_cards"("saleItemId", "productId");
CREATE INDEX IF NOT EXISTS "service_job_cards_saleId_idx" ON "service_job_cards"("saleId");
