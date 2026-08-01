ALTER TABLE "customers" ADD COLUMN "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "customers" ADD COLUMN "openingBalanceDate" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN "openingBalanceNote" TEXT;

ALTER TABLE "suppliers" ADD COLUMN "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "suppliers" ADD COLUMN "openingBalanceDate" TIMESTAMP(3);
ALTER TABLE "suppliers" ADD COLUMN "openingBalanceNote" TEXT;
