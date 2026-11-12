ALTER TABLE "sale_records"
  ADD COLUMN IF NOT EXISTS "legacyPaidAmountAtCutover" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "legacySaleAmountPaidAtCutover" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "legacyLinkedPaymentsAtCutover" DOUBLE PRECISION;

ALTER TABLE "customer_payments"
  ADD COLUMN IF NOT EXISTS "allocationMode" TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canViewReceivableReconciliation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canReviewReceivableReconciliation" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "customer_payment_allocations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'sale',
  "saleId" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_payment_allocations_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_payment_allocations_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_payment_allocations_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "customer_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_payment_allocations_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_payment_allocations_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_payment_allocations_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "customer_payment_allocations_target_check"
    CHECK (("targetType" = 'sale' AND "saleId" IS NOT NULL) OR ("targetType" = 'customer_account' AND "saleId" IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_payment_allocations_paymentId_saleId_key"
  ON "customer_payment_allocations"("paymentId", "saleId");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_payment_allocations_paymentId_account_target_key"
  ON "customer_payment_allocations"("paymentId") WHERE "targetType" = 'customer_account';
CREATE INDEX IF NOT EXISTS "customer_payment_allocations_tenantId_saleId_createdAt_idx"
  ON "customer_payment_allocations"("tenantId", "saleId", "createdAt");
CREATE INDEX IF NOT EXISTS "customer_payment_allocations_tenantId_customerId_createdAt_idx"
  ON "customer_payment_allocations"("tenantId", "customerId", "createdAt");

CREATE TABLE IF NOT EXISTS "customer_receivable_reconciliation_reviews" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "recordedSaleAmountPaid" DECIMAL(18,2) NOT NULL,
  "linkedPaymentTotal" DECIMAL(18,2) NOT NULL,
  "provisionalPaidAmount" DECIMAL(18,2) NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_receivable_reconciliation_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_receivable_reconciliation_reviews_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_receivable_reconciliation_reviews_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_receivable_reconciliation_reviews_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_receivable_reconciliation_reviews_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_receivable_reconciliation_reviews_decision_check"
    CHECK ("decision" IN ('sale_amount_confirmed', 'receipt_rows_confirmed', 'requires_adjustment', 'investigate_duplicate'))
);

CREATE INDEX IF NOT EXISTS "customer_receivable_reconciliation_reviews_tenantId_saleId_reviewedAt_idx"
  ON "customer_receivable_reconciliation_reviews"("tenantId", "saleId", "reviewedAt");
CREATE INDEX IF NOT EXISTS "customer_receivable_reconciliation_reviews_tenantId_sourceFingerprint_idx"
  ON "customer_receivable_reconciliation_reviews"("tenantId", "sourceFingerprint");
