ALTER TABLE "property_tenancies"
  ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "spouseNames" TEXT,
  ADD COLUMN IF NOT EXISTS "childrenCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "householdSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "placeOfOrigin" TEXT;

ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canViewTenantPersonalDetails" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageTenantPersonalDetails" BOOLEAN NOT NULL DEFAULT false;
