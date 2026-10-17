ALTER TABLE "procurement_rfq_lines"
  ADD COLUMN "sourceListingId" TEXT,
  ADD COLUMN "sourceCampaignId" TEXT,
  ADD COLUMN "referencePrice" DECIMAL(18,2),
  ADD COLUMN "referenceCurrency" TEXT;

CREATE INDEX "procurement_rfq_lines_sourceListingId_idx"
  ON "procurement_rfq_lines"("sourceListingId");
