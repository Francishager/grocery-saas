CREATE TABLE "customer_credit_applications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_credit_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_credit_applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_credit_applications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_credit_applications_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_credit_applications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_credit_applications_tenant_source_sale_key" ON "customer_credit_applications"("tenantId", "sourceType", "sourceId", "saleId");
CREATE INDEX "customer_credit_applications_tenant_customer_created_idx" ON "customer_credit_applications"("tenantId", "customerId", "createdAt");
CREATE INDEX "customer_credit_applications_tenant_sale_idx" ON "customer_credit_applications"("tenantId", "saleId");
