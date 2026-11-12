ALTER TABLE "user_permissions"
  ADD COLUMN "canCreateMarketplaceListing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canChangeMarketplacePrice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canRecordProcurementPayment" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the effective access of existing users while making each action independently assignable.
UPDATE "user_permissions"
SET
  "canCreateMarketplaceListing" = "canManageMarketplaceCatalogue",
  "canChangeMarketplacePrice" = "canManageMarketplaceCatalogue",
  "canRecordProcurementPayment" = "canApproveProcurementPayment";
