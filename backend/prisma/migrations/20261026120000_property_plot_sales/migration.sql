ALTER TABLE "property_units"
  ADD COLUMN IF NOT EXISTS "acquisitionCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "property_owner_payouts"
  ADD COLUMN IF NOT EXISTS "payoutType" TEXT NOT NULL DEFAULT 'rent';

ALTER TABLE "property_accounting_configs"
  ADD COLUMN IF NOT EXISTS "landSaleReceivableAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "landSaleRevenueAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "landInventoryAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "landCostOfSalesAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "saleCommissionRevenueAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "saleOwnerPayableAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "saleCustomerAdvanceAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "landInventoryOpeningEquityAccountId" TEXT;

ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canViewPropertySales" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canCreatePropertySale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canRecordPropertySalePayment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canVoidPropertySalePayment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canCancelPropertySale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManagePropertyLandInventory" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "property_sales" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "ownerId" TEXT,
  "createdById" TEXT NOT NULL,
  "saleNo" TEXT NOT NULL,
  "saleMode" TEXT NOT NULL,
  "salePrice" DOUBLE PRECISION NOT NULL,
  "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costBasis" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recognitionMoment" TEXT NOT NULL DEFAULT 'contract',
  "paymentPlan" TEXT NOT NULL DEFAULT 'full',
  "installmentCount" INTEGER NOT NULL DEFAULT 1,
  "installmentFrequency" TEXT NOT NULL DEFAULT 'monthly',
  "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "property_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_sale_installments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'unpaid',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "property_sale_installments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_sale_payments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "cashAccountId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
  "transactionRef" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "voidReason" TEXT,
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "property_sale_payment_allocations" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_sale_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "property_sales_tenantId_saleNo_key" ON "property_sales"("tenantId", "saleNo");
CREATE INDEX IF NOT EXISTS "property_sales_tenantId_buyerId_saleDate_idx" ON "property_sales"("tenantId", "buyerId", "saleDate");
CREATE INDEX IF NOT EXISTS "property_sales_tenantId_unitId_status_idx" ON "property_sales"("tenantId", "unitId", "status");
CREATE INDEX IF NOT EXISTS "property_sales_tenantId_ownerId_status_idx" ON "property_sales"("tenantId", "ownerId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "property_sale_installments_saleId_sequence_key" ON "property_sale_installments"("saleId", "sequence");
CREATE INDEX IF NOT EXISTS "property_sale_installments_tenantId_dueDate_status_idx" ON "property_sale_installments"("tenantId", "dueDate", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "property_sale_payments_tenantId_receiptNo_key" ON "property_sale_payments"("tenantId", "receiptNo");
CREATE UNIQUE INDEX IF NOT EXISTS "property_sale_payments_tenantId_idempotencyKey_key" ON "property_sale_payments"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "property_sale_payments_tenantId_paymentDate_idx" ON "property_sale_payments"("tenantId", "paymentDate");
CREATE INDEX IF NOT EXISTS "property_sale_payments_saleId_paymentDate_idx" ON "property_sale_payments"("saleId", "paymentDate");
CREATE UNIQUE INDEX IF NOT EXISTS "property_sale_payment_allocations_paymentId_installmentId_key" ON "property_sale_payment_allocations"("paymentId", "installmentId");
CREATE INDEX IF NOT EXISTS "property_sale_payment_allocations_installmentId_idx" ON "property_sale_payment_allocations"("installmentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sales_tenantId_fkey') THEN
    ALTER TABLE "property_sales" ADD CONSTRAINT "property_sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sales_propertyId_fkey') THEN
    ALTER TABLE "property_sales" ADD CONSTRAINT "property_sales_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "managed_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sales_unitId_fkey') THEN
    ALTER TABLE "property_sales" ADD CONSTRAINT "property_sales_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sales_buyerId_fkey') THEN
    ALTER TABLE "property_sales" ADD CONSTRAINT "property_sales_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sales_ownerId_fkey') THEN
    ALTER TABLE "property_sales" ADD CONSTRAINT "property_sales_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "property_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sales_createdById_fkey') THEN
    ALTER TABLE "property_sales" ADD CONSTRAINT "property_sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sale_installments_saleId_fkey') THEN
    ALTER TABLE "property_sale_installments" ADD CONSTRAINT "property_sale_installments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "property_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sale_payments_tenantId_fkey') THEN
    ALTER TABLE "property_sale_payments" ADD CONSTRAINT "property_sale_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sale_payments_saleId_fkey') THEN
    ALTER TABLE "property_sale_payments" ADD CONSTRAINT "property_sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "property_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sale_payments_cashAccountId_fkey') THEN
    ALTER TABLE "property_sale_payments" ADD CONSTRAINT "property_sale_payments_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sale_payments_createdById_fkey') THEN
    ALTER TABLE "property_sale_payments" ADD CONSTRAINT "property_sale_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sale_payment_allocations_paymentId_fkey') THEN
    ALTER TABLE "property_sale_payment_allocations" ADD CONSTRAINT "property_sale_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "property_sale_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_sale_payment_allocations_installmentId_fkey') THEN
    ALTER TABLE "property_sale_payment_allocations" ADD CONSTRAINT "property_sale_payment_allocations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "property_sale_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_landSaleReceivableAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_landSaleReceivableAccountId_fkey" FOREIGN KEY ("landSaleReceivableAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_landSaleRevenueAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_landSaleRevenueAccountId_fkey" FOREIGN KEY ("landSaleRevenueAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_landInventoryAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_landInventoryAccountId_fkey" FOREIGN KEY ("landInventoryAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_landCostOfSalesAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_landCostOfSalesAccountId_fkey" FOREIGN KEY ("landCostOfSalesAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_saleCommissionRevenueAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_saleCommissionRevenueAccountId_fkey" FOREIGN KEY ("saleCommissionRevenueAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_saleOwnerPayableAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_saleOwnerPayableAccountId_fkey" FOREIGN KEY ("saleOwnerPayableAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_saleCustomerAdvanceAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_saleCustomerAdvanceAccountId_fkey" FOREIGN KEY ("saleCustomerAdvanceAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_accounting_configs_landInventoryOpeningEquityAccountId_fkey') THEN
    ALTER TABLE "property_accounting_configs" ADD CONSTRAINT "property_accounting_configs_landInventoryOpeningEquityAccountId_fkey" FOREIGN KEY ("landInventoryOpeningEquityAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
