ALTER TABLE "user_permissions"
ADD COLUMN IF NOT EXISTS "canReverseAccountingEntry" BOOLEAN NOT NULL DEFAULT false;