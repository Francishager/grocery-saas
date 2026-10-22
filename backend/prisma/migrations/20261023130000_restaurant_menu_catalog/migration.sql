CREATE TABLE IF NOT EXISTS "restaurant_menu_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "productId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "description" TEXT,
  "station" TEXT NOT NULL DEFAULT 'kitchen',
  "price" DOUBLE PRECISION NOT NULL,
  "isAvailable" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_menu_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "restaurant_menu_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "restaurant_menu_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "restaurant_menu_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_menu_entries_productId_key"
  ON "restaurant_menu_entries"("productId");
CREATE INDEX IF NOT EXISTS "restaurant_menu_entries_tenantId_branchId_isAvailable_sortOrder_idx"
  ON "restaurant_menu_entries"("tenantId", "branchId", "isAvailable", "sortOrder");

INSERT INTO "restaurant_menu_entries" ("id", "tenantId", "branchId", "productId", "category", "station", "price")
SELECT 'rmi_' || substr(md5(p."id"), 1, 24), p."tenantId", p."branchId", p."id",
       COALESCE(NULLIF(c."name", ''), 'General'), 'kitchen', p."price"
FROM "products" p
LEFT JOIN "categories" c ON c."id" = p."categoryId"
WHERE p."isActive" = TRUE
ON CONFLICT ("productId") DO NOTHING;
