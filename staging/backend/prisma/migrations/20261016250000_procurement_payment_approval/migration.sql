ALTER TABLE "user_permissions"
  ADD COLUMN "canApproveProcurementPayment" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "supplier_payments"
  ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "supplier_payments_idempotencyKey_key"
  ON "supplier_payments"("idempotencyKey");

CREATE TABLE "procurement_payment_approvals" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "supplierPaymentId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "initiatedBySide" TEXT NOT NULL DEFAULT 'buyer',
  "receivedPaymentMethod" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "sellerCustomerPaymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_payment_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_payment_approvals_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "procurement_payment_approvals_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "procurement_payment_approvals_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "procurement_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_payment_approvals_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_payment_approvals_sellerCustomerPaymentId_fkey" FOREIGN KEY ("sellerCustomerPaymentId") REFERENCES "customer_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "procurement_payment_approvals_supplierPaymentId_key"
  ON "procurement_payment_approvals"("supplierPaymentId");
CREATE UNIQUE INDEX "procurement_payment_approvals_sellerCustomerPaymentId_key"
  ON "procurement_payment_approvals"("sellerCustomerPaymentId");
CREATE INDEX "procurement_payment_approvals_sellerTenantId_status_createdAt_idx"
  ON "procurement_payment_approvals"("sellerTenantId", "status", "createdAt");
CREATE INDEX "procurement_payment_approvals_buyerTenantId_status_createdAt_idx"
  ON "procurement_payment_approvals"("buyerTenantId", "status", "createdAt");
CREATE INDEX "procurement_payment_approvals_invoiceId_createdAt_idx"
  ON "procurement_payment_approvals"("invoiceId", "createdAt");
