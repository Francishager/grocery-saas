CREATE TABLE "customer_withdrawals" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cashAccountId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
  "mobileProvider" TEXT,
  "phoneNumber" TEXT,
  "transactionId" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_withdrawals_tenantId_branchId_idx" ON "customer_withdrawals"("tenantId", "branchId");
CREATE INDEX "customer_withdrawals_customerId_idx" ON "customer_withdrawals"("customerId");
CREATE INDEX "customer_withdrawals_cashAccountId_idx" ON "customer_withdrawals"("cashAccountId");

ALTER TABLE "customer_withdrawals"
  ADD CONSTRAINT "customer_withdrawals_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_withdrawals"
  ADD CONSTRAINT "customer_withdrawals_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_withdrawals"
  ADD CONSTRAINT "customer_withdrawals_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_withdrawals"
  ADD CONSTRAINT "customer_withdrawals_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_withdrawals"
  ADD CONSTRAINT "customer_withdrawals_cashAccountId_fkey"
  FOREIGN KEY ("cashAccountId") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
