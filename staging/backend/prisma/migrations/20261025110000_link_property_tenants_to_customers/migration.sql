ALTER TABLE "property_tenancies"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT;

CREATE INDEX IF NOT EXISTS "property_tenancies_tenantId_customerId_idx"
  ON "property_tenancies"("tenantId", "customerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_tenancies_customerId_fkey') THEN
    ALTER TABLE "property_tenancies"
      ADD CONSTRAINT "property_tenancies_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "property_tenant_identities" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tenancyId" TEXT NOT NULL,
  "profilePhotoUrl" TEXT,
  "nationalIdFrontUrl" TEXT,
  "nationalIdBackUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "property_tenant_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "property_tenant_identities_tenancyId_key"
  ON "property_tenant_identities"("tenancyId");
CREATE INDEX IF NOT EXISTS "property_tenant_identities_tenantId_idx"
  ON "property_tenant_identities"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_tenant_identities_tenantId_fkey') THEN
    ALTER TABLE "property_tenant_identities"
      ADD CONSTRAINT "property_tenant_identities_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_tenant_identities_tenancyId_fkey') THEN
    ALTER TABLE "property_tenant_identities"
      ADD CONSTRAINT "property_tenant_identities_tenancyId_fkey"
      FOREIGN KEY ("tenancyId") REFERENCES "property_tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
