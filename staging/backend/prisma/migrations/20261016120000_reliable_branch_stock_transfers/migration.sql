ALTER TABLE "stock_transfer_items"
  ADD COLUMN IF NOT EXISTS "destinationProductId" TEXT;

ALTER TABLE "stock_transfers"
  ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;

CREATE INDEX IF NOT EXISTS "stock_transfer_items_destinationProductId_idx"
  ON "stock_transfer_items"("destinationProductId");

CREATE INDEX IF NOT EXISTS "stock_transfers_reversalOfId_idx"
  ON "stock_transfers"("reversalOfId");

DO $$ BEGIN
  ALTER TABLE "stock_transfer_items"
    ADD CONSTRAINT "stock_transfer_items_destinationProductId_fkey"
    FOREIGN KEY ("destinationProductId") REFERENCES "products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "stock_transfers"
    ADD CONSTRAINT "stock_transfers_reversalOfId_fkey"
    FOREIGN KEY ("reversalOfId") REFERENCES "stock_transfers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
