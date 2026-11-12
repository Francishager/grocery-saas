ALTER TABLE "sale_items" ADD COLUMN "cost" DOUBLE PRECISION;
ALTER TABLE "sale_record_items" ADD COLUMN "cost" DOUBLE PRECISION;

UPDATE "sale_items" AS item
SET "cost" = COALESCE(products."cost", 0) * COALESCE(item."conversionFactor", 1)
FROM "products" AS products
WHERE item."productId" = products."id"
  AND item."cost" IS NULL;

UPDATE "sale_record_items" AS item
SET "cost" = COALESCE(products."cost", 0) * COALESCE(item."conversionFactor", 1)
FROM "products" AS products
WHERE item."productId" = products."id"
  AND item."cost" IS NULL;
