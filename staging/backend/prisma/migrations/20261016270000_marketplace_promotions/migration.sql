ALTER TABLE "user_permissions"
  ADD COLUMN "canCreateMarketplacePromotion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canRunMarketplaceAds" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageMarketplacePromotions" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "marketplace_promotions" (
  "id" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "campaignType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_promotions_type_check" CHECK ("campaignType" IN ('promotion', 'ad')),
  CONSTRAINT "marketplace_promotions_status_check" CHECK ("status" IN ('active', 'paused', 'cancelled')),
  CONSTRAINT "marketplace_promotions_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "marketplace_promotions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "marketplace_promotions_sellerTenantId_status_startsAt_endsAt_idx"
  ON "marketplace_promotions"("sellerTenantId", "status", "startsAt", "endsAt");
CREATE INDEX "marketplace_promotions_listingId_status_startsAt_idx"
  ON "marketplace_promotions"("listingId", "status", "startsAt");
