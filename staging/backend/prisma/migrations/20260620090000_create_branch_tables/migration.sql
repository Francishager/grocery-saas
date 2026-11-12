-- Branch tables were present in schema.prisma but missing from earlier SQL migrations.
-- Use idempotent DDL so existing databases that were pushed manually keep working.

CREATE TABLE IF NOT EXISTS "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_branches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenantId_name_key" ON "branches"("tenantId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "user_branches_userId_branchId_key" ON "user_branches"("userId", "branchId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'branches_tenantId_fkey'
    ) THEN
        ALTER TABLE "branches"
        ADD CONSTRAINT "branches_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_branches_userId_fkey'
    ) THEN
        ALTER TABLE "user_branches"
        ADD CONSTRAINT "user_branches_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_branches_branchId_fkey'
    ) THEN
        ALTER TABLE "user_branches"
        ADD CONSTRAINT "user_branches_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
