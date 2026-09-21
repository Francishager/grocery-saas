-- Service assignment and sharing support
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "createdByTechnicianId" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "sharedWithUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "sharedWithTechnicianIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "createdByTechnicianId" TEXT;
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "sharedWithUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "service_job_cards" ADD COLUMN IF NOT EXISTS "sharedWithTechnicianIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "service_technicians" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;

CREATE TABLE IF NOT EXISTS "service_share_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "requesterUserId" TEXT,
  "requesterTechnicianId" TEXT,
  "targetUserId" TEXT,
  "targetTechnicianId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "approvedByUserId" TEXT,
  "approvedByTechnicianId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "service_share_requests_tenant_record_idx" ON "service_share_requests"("tenantId", "recordType", "recordId");
CREATE INDEX IF NOT EXISTS "service_share_requests_tenant_status_idx" ON "service_share_requests"("tenantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "service_share_requests_unique_pending_target" ON "service_share_requests"("tenantId", "recordType", "recordId", "targetTechnicianId") WHERE "status" = 'pending';
