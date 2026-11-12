ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canViewPropertyLandPurchases" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canCreatePropertyLandPurchase" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canRecordPropertyLandPurchasePayment" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "property_land_purchases" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "purchaseNo" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "supplierRef" TEXT,
  "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "purchasePrice" DOUBLE PRECISION NOT NULL,
  "capitalizedCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recoverableTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costBasis" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
  "dueDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "property_land_purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_land_purchase_payments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "cashAccountId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "balanceAfter" DOUBLE PRECISION NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transactionRef" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_land_purchase_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "property_land_purchases_unitId_key" ON "property_land_purchases"("unitId");
CREATE UNIQUE INDEX IF NOT EXISTS "property_land_purchases_tenantId_purchaseNo_key" ON "property_land_purchases"("tenantId", "purchaseNo");
CREATE UNIQUE INDEX IF NOT EXISTS "property_land_purchases_tenantId_idempotencyKey_key" ON "property_land_purchases"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "property_land_purchases_tenantId_supplierId_purchaseDate_idx" ON "property_land_purchases"("tenantId", "supplierId", "purchaseDate");
CREATE INDEX IF NOT EXISTS "property_land_purchases_tenantId_dueDate_paymentStatus_idx" ON "property_land_purchases"("tenantId", "dueDate", "paymentStatus");
CREATE UNIQUE INDEX IF NOT EXISTS "property_land_purchase_payments_tenantId_receiptNo_key" ON "property_land_purchase_payments"("tenantId", "receiptNo");
CREATE UNIQUE INDEX IF NOT EXISTS "property_land_purchase_payments_tenantId_idempotencyKey_key" ON "property_land_purchase_payments"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "property_land_purchase_payments_tenantId_supplierId_paymentDate_idx" ON "property_land_purchase_payments"("tenantId", "supplierId", "paymentDate");
CREATE INDEX IF NOT EXISTS "property_land_purchase_payments_purchaseId_paymentDate_idx" ON "property_land_purchase_payments"("purchaseId", "paymentDate");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchases_tenantId_fkey') THEN
    ALTER TABLE "property_land_purchases" ADD CONSTRAINT "property_land_purchases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchases_propertyId_fkey') THEN
    ALTER TABLE "property_land_purchases" ADD CONSTRAINT "property_land_purchases_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "managed_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchases_unitId_fkey') THEN
    ALTER TABLE "property_land_purchases" ADD CONSTRAINT "property_land_purchases_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchases_supplierId_fkey') THEN
    ALTER TABLE "property_land_purchases" ADD CONSTRAINT "property_land_purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchases_createdById_fkey') THEN
    ALTER TABLE "property_land_purchases" ADD CONSTRAINT "property_land_purchases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchase_payments_tenantId_fkey') THEN
    ALTER TABLE "property_land_purchase_payments" ADD CONSTRAINT "property_land_purchase_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchase_payments_purchaseId_fkey') THEN
    ALTER TABLE "property_land_purchase_payments" ADD CONSTRAINT "property_land_purchase_payments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "property_land_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchase_payments_supplierId_fkey') THEN
    ALTER TABLE "property_land_purchase_payments" ADD CONSTRAINT "property_land_purchase_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchase_payments_cashAccountId_fkey') THEN
    ALTER TABLE "property_land_purchase_payments" ADD CONSTRAINT "property_land_purchase_payments_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_land_purchase_payments_createdById_fkey') THEN
    ALTER TABLE "property_land_purchase_payments" ADD CONSTRAINT "property_land_purchase_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
