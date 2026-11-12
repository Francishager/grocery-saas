ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "subjectUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "subjectEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "branchId" TEXT,
  ADD COLUMN IF NOT EXISTS "branchName" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_tenantId_subjectUserId_idx"
  ON "audit_logs"("tenantId", "subjectUserId");

CREATE INDEX IF NOT EXISTS "audit_logs_tenantId_branchId_createdAt_idx"
  ON "audit_logs"("tenantId", "branchId", "createdAt");
