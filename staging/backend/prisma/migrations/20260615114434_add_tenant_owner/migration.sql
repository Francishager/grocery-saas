-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "ownerId" TEXT;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
