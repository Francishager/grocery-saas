ALTER TABLE "Customer" ALTER COLUMN "trustScore" SET DEFAULT 0;
UPDATE "Customer" SET "trustScore" = 0 WHERE "trustScore" = 50;
