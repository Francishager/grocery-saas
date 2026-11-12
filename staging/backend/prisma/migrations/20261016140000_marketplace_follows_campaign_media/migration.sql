ALTER TABLE "user_permissions"
ADD COLUMN IF NOT EXISTS "canFollowMarketplaceSellers" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "marketplace_promotions"
ADD COLUMN IF NOT EXISTS "images" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "marketplace_seller_follows" (
  "id" TEXT NOT NULL,
  "followerTenantId" TEXT NOT NULL,
  "followerUserId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_seller_follows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_seller_follows_followerTenantId_fkey"
    FOREIGN KEY ("followerTenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "marketplace_seller_follows_followerUserId_fkey"
    FOREIGN KEY ("followerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "marketplace_seller_follows_sellerTenantId_fkey"
    FOREIGN KEY ("sellerTenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_seller_follows_followerUserId_sellerTenantId_key"
ON "marketplace_seller_follows"("followerUserId", "sellerTenantId");

CREATE INDEX IF NOT EXISTS "marketplace_seller_follows_sellerTenantId_createdAt_idx"
ON "marketplace_seller_follows"("sellerTenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "marketplace_seller_follows_followerTenantId_followerUserId_idx"
ON "marketplace_seller_follows"("followerTenantId", "followerUserId");
