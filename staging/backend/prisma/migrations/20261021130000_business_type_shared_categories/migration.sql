ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "businessType" TEXT;

UPDATE "categories" AS category
SET "businessType" = tenant."businessType"
FROM "tenants" AS tenant
WHERE category."tenantId" = tenant."id"
  AND category."slug" LIKE 'custom-%'
  AND tenant."businessType" IS NOT NULL
  AND BTRIM(tenant."businessType") <> ''
  AND category."businessType" IS NULL;

CREATE INDEX IF NOT EXISTS "categories_businessType_categoryType_idx"
  ON "categories"("businessType", "categoryType");
