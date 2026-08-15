CREATE TABLE "product_price_history" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "oldCost" DOUBLE PRECISION,
  "newCost" DOUBLE PRECISION,
  "oldPrice" DOUBLE PRECISION,
  "newPrice" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'manual_update',
  "reference" TEXT,
  "reason" TEXT,
  "changedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_price_history_tenantId_branchId_idx" ON "product_price_history"("tenantId", "branchId");
CREATE INDEX "product_price_history_productId_createdAt_idx" ON "product_price_history"("productId", "createdAt");

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
