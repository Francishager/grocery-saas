ALTER TABLE "procurement_rfq_lines"
  ADD COLUMN "productId" TEXT;

CREATE INDEX "procurement_rfq_lines_productId_idx"
  ON "procurement_rfq_lines"("productId");
