ALTER TABLE "business_messages"
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "imagePublicId" TEXT;

ALTER TABLE "jibu_network_messages"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "imagePublicId" TEXT;
