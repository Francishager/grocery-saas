ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "imagePublicId" TEXT;

ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "servedBy" TEXT;

ALTER TABLE "waiters"
  ADD COLUMN IF NOT EXISTS "pinHash" TEXT,
  ADD COLUMN IF NOT EXISTS "pinUpdatedAt" TIMESTAMP(3);

UPDATE "sales" AS sale
SET "servedBy" = waiter.name
FROM "restaurant_orders" AS restaurant_order
JOIN "waiters" AS waiter ON waiter.id = restaurant_order."waiterId"
WHERE restaurant_order."saleId" = sale.id
  AND sale."servedBy" IS NULL;
