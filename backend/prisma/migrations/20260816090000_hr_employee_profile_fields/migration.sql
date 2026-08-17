ALTER TABLE "employees" ADD COLUMN "employeeNumber" TEXT;
ALTER TABLE "employees" ADD COLUMN "profilePhoto" TEXT;
ALTER TABLE "employees" ADD COLUMN "nextOfKinName" TEXT;
ALTER TABLE "employees" ADD COLUMN "nextOfKinPhone" TEXT;
ALTER TABLE "employees" ADD COLUMN "nextOfKinRelationship" TEXT;
ALTER TABLE "employees" ADD COLUMN "employmentType" TEXT NOT NULL DEFAULT 'permanent';
ALTER TABLE "employees" ADD COLUMN "workLocation" TEXT;
ALTER TABLE "employees" ADD COLUMN "costCentre" TEXT;
ALTER TABLE "employees" ADD COLUMN "probationStartDate" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "probationEndDate" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "contractStartDate" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "contractEndDate" TIMESTAMP(3);

CREATE INDEX "employees_tenantId_employeeNumber_idx" ON "employees"("tenantId", "employeeNumber");
