ALTER TABLE "user_permissions"
  ADD COLUMN "canViewProcurement" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageSupplierNetwork" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageMarketplaceCatalogue" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCreateProcurementRFQ" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canRespondToProcurementRFQ" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageProcurementQuotes" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "procurement_profiles" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "website" TEXT,
  "discoverable" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "procurement_profiles_tenantId_key" ON "procurement_profiles"("tenantId");
CREATE INDEX "procurement_profiles_discoverable_category_idx" ON "procurement_profiles"("discoverable", "category");

CREATE TABLE "procurement_relationships" (
  "id" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_relationships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "procurement_relationships_buyerTenantId_sellerTenantId_key" ON "procurement_relationships"("buyerTenantId", "sellerTenantId");
CREATE INDEX "procurement_relationships_sellerTenantId_status_idx" ON "procurement_relationships"("sellerTenantId", "status");
CREATE INDEX "procurement_relationships_buyerTenantId_status_idx" ON "procurement_relationships"("buyerTenantId", "status");

CREATE TABLE "marketplace_listings" (
  "id" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "linkedProductId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL,
  "brand" TEXT,
  "supplierCode" TEXT,
  "unit" TEXT NOT NULL,
  "packaging" TEXT,
  "price" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "minimumQty" DECIMAL(18,3) NOT NULL DEFAULT 1,
  "availableQty" DECIMAL(18,3),
  "leadTimeDays" INTEGER,
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "status" TEXT NOT NULL DEFAULT 'active',
  "priceValidTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_listings_price_nonnegative" CHECK ("price" >= 0),
  CONSTRAINT "marketplace_listings_minimumQty_positive" CHECK ("minimumQty" > 0),
  CONSTRAINT "marketplace_listings_visibility_check" CHECK ("visibility" IN ('public','private'))
);
CREATE INDEX "marketplace_listings_sellerTenantId_status_idx" ON "marketplace_listings"("sellerTenantId", "status");
CREATE INDEX "marketplace_listings_visibility_status_category_idx" ON "marketplace_listings"("visibility", "status", "category");
CREATE INDEX "marketplace_listings_name_idx" ON "marketplace_listings"("name");

CREATE TABLE "marketplace_price_changes" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "oldPrice" DECIMAL(18,2) NOT NULL,
  "newPrice" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "changedById" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_price_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_price_changes_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "marketplace_price_changes_listingId_createdAt_idx" ON "marketplace_price_changes"("listingId", "createdAt");
CREATE INDEX "marketplace_price_changes_sellerTenantId_createdAt_idx" ON "marketplace_price_changes"("sellerTenantId", "createdAt");

CREATE TABLE "procurement_rfqs" (
  "id" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "status" TEXT NOT NULL DEFAULT 'open',
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "deliveryAddress" TEXT,
  "closesAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_rfqs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_rfqs_visibility_check" CHECK ("visibility" IN ('open','private'))
);
CREATE INDEX "procurement_rfqs_buyerTenantId_status_createdAt_idx" ON "procurement_rfqs"("buyerTenantId", "status", "createdAt");
CREATE INDEX "procurement_rfqs_visibility_status_closesAt_idx" ON "procurement_rfqs"("visibility", "status", "closesAt");

CREATE TABLE "procurement_rfq_lines" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "specification" TEXT NOT NULL DEFAULT '',
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "acceptableAlternatives" TEXT NOT NULL DEFAULT '',
  "desiredDelivery" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_rfq_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_rfq_lines_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_rfq_lines_quantity_positive" CHECK ("quantity" > 0)
);
CREATE INDEX "procurement_rfq_lines_rfqId_idx" ON "procurement_rfq_lines"("rfqId");

CREATE TABLE "procurement_rfq_recipients" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_rfq_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_rfq_recipients_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "procurement_rfq_recipients_rfqId_sellerTenantId_key" ON "procurement_rfq_recipients"("rfqId", "sellerTenantId");
CREATE INDEX "procurement_rfq_recipients_sellerTenantId_rfqId_idx" ON "procurement_rfq_recipients"("sellerTenantId", "rfqId");

CREATE TABLE "procurement_quotes" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "notes" TEXT NOT NULL DEFAULT '',
  "deliveryDays" INTEGER,
  "deliveryFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "paymentTerms" TEXT NOT NULL DEFAULT '',
  "validUntil" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_quotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_quotes_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_quotes_deliveryFee_nonnegative" CHECK ("deliveryFee" >= 0)
);
CREATE UNIQUE INDEX "procurement_quotes_rfqId_sellerTenantId_version_key" ON "procurement_quotes"("rfqId", "sellerTenantId", "version");
CREATE INDEX "procurement_quotes_rfqId_sellerTenantId_status_idx" ON "procurement_quotes"("rfqId", "sellerTenantId", "status");

CREATE TABLE "procurement_quote_lines" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "rfqLineId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "taxRate" DECIMAL(7,4),
  "alternative" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_quote_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "procurement_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_quote_lines_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "procurement_rfq_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_quote_lines_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "procurement_quote_lines_unitPrice_nonnegative" CHECK ("unitPrice" >= 0)
);
CREATE UNIQUE INDEX "procurement_quote_lines_quoteId_rfqLineId_key" ON "procurement_quote_lines"("quoteId", "rfqLineId");
CREATE INDEX "procurement_quote_lines_quoteId_idx" ON "procurement_quote_lines"("quoteId");

CREATE TABLE "procurement_messages" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "quoteId" TEXT,
  "senderTenantId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_messages_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_messages_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "procurement_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "procurement_messages_rfqId_createdAt_idx" ON "procurement_messages"("rfqId", "createdAt");

INSERT INTO "features" ("id", "name", "displayName", "description", "module", "category", "isActive", "createdAt")
VALUES ('procurement_marketplace_v1', 'procurement.marketplace', 'Procurement Network', 'Supplier discovery, marketplace listings, and private/open requests for quotation.', 'procurement', 'module', true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
