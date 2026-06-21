-- Branch-scope tenant business data so inventory, customers, suppliers, and
-- related transactions can be reported per branch.

-- Ensure every tenant has at least one branch for backfilling old records.
INSERT INTO "branches" ("id", "name", "tenantId", "isActive", "createdAt", "updatedAt")
SELECT
  concat('branch_', substr(md5(t.id), 1, 24)),
  'Main Branch',
  t.id,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "branches" b WHERE b."tenantId" = t.id
);

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "sale_records" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "customer_payments" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "supplier_purchases" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
)
UPDATE "products" p
SET "branchId" = tb.id
FROM tenant_branch tb
WHERE p."tenantId" = tb."tenantId" AND p."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
)
UPDATE "customers" c
SET "branchId" = tb.id
FROM tenant_branch tb
WHERE c."tenantId" = tb."tenantId" AND c."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
)
UPDATE "suppliers" s
SET "branchId" = tb.id
FROM tenant_branch tb
WHERE s."tenantId" = tb."tenantId" AND s."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
),
user_branch AS (
  SELECT DISTINCT ON (ub."userId") ub."userId", ub."branchId"
  FROM "user_branches" ub
  JOIN "branches" b ON b.id = ub."branchId"
  ORDER BY ub."userId", ub."isPrimary" DESC, ub."createdAt" ASC
)
UPDATE "sales" s
SET "branchId" = COALESCE(ub."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN user_branch ub ON ub."userId" = s."userId"
WHERE s."tenantId" = tb."tenantId" AND s."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
),
user_branch AS (
  SELECT DISTINCT ON (ub."userId") ub."userId", ub."branchId"
  FROM "user_branches" ub
  JOIN "branches" b ON b.id = ub."branchId"
  ORDER BY ub."userId", ub."isPrimary" DESC, ub."createdAt" ASC
)
UPDATE "purchases" p
SET "branchId" = COALESCE(ub."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN user_branch ub ON ub."userId" = p."userId"
WHERE p."tenantId" = tb."tenantId" AND p."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
),
user_branch AS (
  SELECT DISTINCT ON (ub."userId") ub."userId", ub."branchId"
  FROM "user_branches" ub
  JOIN "branches" b ON b.id = ub."branchId"
  ORDER BY ub."userId", ub."isPrimary" DESC, ub."createdAt" ASC
)
UPDATE "sale_records" sr
SET "branchId" = COALESCE(ub."branchId", c."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN user_branch ub ON ub."userId" = sr."userId"
LEFT JOIN "customers" c ON c.id = sr."customerId"
WHERE sr."tenantId" = tb."tenantId" AND sr."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
),
user_branch AS (
  SELECT DISTINCT ON (ub."userId") ub."userId", ub."branchId"
  FROM "user_branches" ub
  JOIN "branches" b ON b.id = ub."branchId"
  ORDER BY ub."userId", ub."isPrimary" DESC, ub."createdAt" ASC
)
UPDATE "supplier_purchases" sp
SET "branchId" = COALESCE(ub."branchId", s."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN user_branch ub ON ub."userId" = sp."userId"
LEFT JOIN "suppliers" s ON s.id = sp."supplierId"
WHERE sp."tenantId" = tb."tenantId" AND sp."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
)
UPDATE "customer_payments" cp
SET "branchId" = COALESCE(sr."branchId", c."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN "sale_records" sr ON sr.id = cp."saleId"
LEFT JOIN "customers" c ON c.id = cp."customerId"
WHERE cp."tenantId" = tb."tenantId" AND cp."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
)
UPDATE "supplier_payments" sp
SET "branchId" = COALESCE(p."branchId", s."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN "supplier_purchases" p ON p.id = sp."purchaseId"
LEFT JOIN "suppliers" s ON s.id = sp."supplierId"
WHERE sp."tenantId" = tb."tenantId" AND sp."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
)
UPDATE "invoices" i
SET "branchId" = COALESCE(sr."branchId", c."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN "sale_records" sr ON sr.id = i."saleId"
LEFT JOIN "customers" c ON c.id = i."customerId"
WHERE i."tenantId" = tb."tenantId" AND i."branchId" IS NULL;

WITH tenant_branch AS (
  SELECT DISTINCT ON ("tenantId") "tenantId", id
  FROM "branches"
  ORDER BY "tenantId", "isActive" DESC, "createdAt" ASC
),
user_branch AS (
  SELECT DISTINCT ON (ub."userId") ub."userId", ub."branchId"
  FROM "user_branches" ub
  JOIN "branches" b ON b.id = ub."branchId"
  ORDER BY ub."userId", ub."isPrimary" DESC, ub."createdAt" ASC
)
UPDATE "expenses" e
SET "branchId" = COALESCE(ub."branchId", tb.id)
FROM tenant_branch tb
LEFT JOIN user_branch ub ON ub."userId" = e."userId"
WHERE e."tenantId" = tb."tenantId" AND e."branchId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_branchId_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_branchId_fkey') THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_branchId_fkey') THEN
    ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_branchId_fkey') THEN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_records_branchId_fkey') THEN
    ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_payments_branchId_fkey') THEN
    ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_branchId_fkey') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_branchId_fkey') THEN
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_purchases_branchId_fkey') THEN
    ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_branchId_fkey') THEN
    ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_branchId_fkey') THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "products_tenantId_sku_key";
DROP INDEX IF EXISTS "products_tenantId_barcode_key";
DROP INDEX IF EXISTS "customers_tenantId_phone_key";
DROP INDEX IF EXISTS "suppliers_tenantId_phone_key";

CREATE UNIQUE INDEX IF NOT EXISTS "products_tenantId_branchId_sku_key" ON "products"("tenantId", "branchId", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenantId_branchId_barcode_key" ON "products"("tenantId", "branchId", "barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_tenantId_branchId_phone_key" ON "customers"("tenantId", "branchId", "phone");
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_tenantId_branchId_phone_key" ON "suppliers"("tenantId", "branchId", "phone");

CREATE INDEX IF NOT EXISTS "products_tenantId_branchId_idx" ON "products"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "sales_tenantId_branchId_idx" ON "sales"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "purchases_tenantId_branchId_idx" ON "purchases"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "customers_tenantId_branchId_idx" ON "customers"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "sale_records_tenantId_branchId_idx" ON "sale_records"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "customer_payments_tenantId_branchId_idx" ON "customer_payments"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "invoices_tenantId_branchId_idx" ON "invoices"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "suppliers_tenantId_branchId_idx" ON "suppliers"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "supplier_purchases_tenantId_branchId_idx" ON "supplier_purchases"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "supplier_payments_tenantId_branchId_idx" ON "supplier_payments"("tenantId", "branchId");
CREATE INDEX IF NOT EXISTS "expenses_tenantId_branchId_idx" ON "expenses"("tenantId", "branchId");
