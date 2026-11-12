CREATE TABLE IF NOT EXISTS "fuel_stock_movements" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tankId" TEXT NOT NULL,
  "branchId" TEXT,
  "movementType" TEXT NOT NULL,
  "litresDelta" DOUBLE PRECISION NOT NULL,
  "balanceAfter" DOUBLE PRECISION NOT NULL,
  "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "stockValueDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "stockValueAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "reason" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuel_stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fuel_stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fuel_stock_movements_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "fuel_stock_movements_tenantId_sourceType_sourceId_key"
  ON "fuel_stock_movements"("tenantId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "fuel_stock_movements_tenantId_tankId_createdAt_idx"
  ON "fuel_stock_movements"("tenantId", "tankId", "createdAt");
CREATE INDEX IF NOT EXISTS "fuel_stock_movements_tenantId_branchId_createdAt_idx"
  ON "fuel_stock_movements"("tenantId", "branchId", "createdAt");
ALTER TABLE "fuel_stock_movements"
  ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stockValueDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stockValueAfter" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "fuel_stock_adjustments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tankId" TEXT NOT NULL,
  "branchId" TEXT,
  "litresDelta" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "reviewNote" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "fuel_stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fuel_stock_adjustments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fuel_stock_adjustments_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "fuel_stock_adjustments_tenantId_status_requestedAt_idx"
  ON "fuel_stock_adjustments"("tenantId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "fuel_stock_adjustments_tenantId_tankId_requestedAt_idx"
  ON "fuel_stock_adjustments"("tenantId", "tankId", "requestedAt");
ALTER TABLE "fuel_shift_reports"
  ADD COLUMN IF NOT EXISTS "expectedFuelSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "actualTenderTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reportedSalesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reconciliationVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "varianceReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT,
  ADD COLUMN IF NOT EXISTS "cashAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "mobileAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseAccountId" TEXT;

UPDATE "fuel_shift_reports"
SET "reportedSalesTotal" = "actualTenderTotal"
WHERE "reportedSalesTotal" = 0 AND "actualTenderTotal" <> 0;

CREATE INDEX IF NOT EXISTS "fuel_shift_reports_tenantId_cashAccountId_idx" ON "fuel_shift_reports"("tenantId", "cashAccountId");
CREATE INDEX IF NOT EXISTS "fuel_shift_reports_tenantId_mobileAccountId_idx" ON "fuel_shift_reports"("tenantId", "mobileAccountId");
CREATE INDEX IF NOT EXISTS "fuel_shift_reports_tenantId_expenseAccountId_idx" ON "fuel_shift_reports"("tenantId", "expenseAccountId");

ALTER TABLE "fuel_meter_readings"
  ADD COLUMN IF NOT EXISTS "priceOverrideReason" TEXT;

INSERT INTO "fuel_stock_movements" (
  "id", "tenantId", "tankId", "branchId", "movementType", "litresDelta",
  "balanceAfter", "unitCost", "stockValueDelta", "stockValueAfter", "sourceType", "sourceId", "reason"
)
SELECT MD5(tank."id" || ':opening-fuel-stock'), tank."tenantId", tank."id", tank."branchId",
       'opening_balance', tank."currentStock", tank."currentStock", tank."unitCost",
       tank."currentStock" * tank."unitCost", tank."currentStock" * tank."unitCost", 'opening_balance', tank."id",
       'Opening stock snapshot at fuel stock ledger activation'
FROM "fuel_tanks" AS tank
ON CONFLICT ("tenantId", "sourceType", "sourceId") DO NOTHING;
