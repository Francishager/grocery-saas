ALTER TABLE "property_units"
  ADD COLUMN IF NOT EXISTS "areaSize" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "areaUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "frontage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "depth" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "dimensionUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "plotNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "blockNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "titleReference" TEXT,
  ADD COLUMN IF NOT EXISTS "landTenure" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_units_areaSize_positive_check') THEN
    ALTER TABLE "property_units" ADD CONSTRAINT "property_units_areaSize_positive_check" CHECK ("areaSize" IS NULL OR "areaSize" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_units_frontage_positive_check') THEN
    ALTER TABLE "property_units" ADD CONSTRAINT "property_units_frontage_positive_check" CHECK ("frontage" IS NULL OR "frontage" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_units_depth_positive_check') THEN
    ALTER TABLE "property_units" ADD CONSTRAINT "property_units_depth_positive_check" CHECK ("depth" IS NULL OR "depth" > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "property_units_plotNumber_blockNumber_idx" ON "property_units"("plotNumber", "blockNumber");
