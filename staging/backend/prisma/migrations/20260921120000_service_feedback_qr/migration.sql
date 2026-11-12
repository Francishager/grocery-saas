ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "productId" TEXT REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_feedback" ADD COLUMN IF NOT EXISTS "productId" TEXT REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "service_job_cards_tenantId_productId_idx" ON "service_job_cards"("tenantId", "productId");
CREATE INDEX IF NOT EXISTS "service_feedback_tenantId_productId_idx" ON "service_feedback"("tenantId", "productId");
CREATE TABLE IF NOT EXISTS "service_feedback_links" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "workOrderId" TEXT,
  "contractId" TEXT,
  "branchId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "service_feedback_links_tokenHash_key" ON "service_feedback_links"("tokenHash");
CREATE INDEX IF NOT EXISTS "service_feedback_links_tenantId_productId_idx" ON "service_feedback_links"("tenantId", "productId");
CREATE INDEX IF NOT EXISTS "service_feedback_links_tenantId_createdAt_idx" ON "service_feedback_links"("tenantId", "createdAt");
