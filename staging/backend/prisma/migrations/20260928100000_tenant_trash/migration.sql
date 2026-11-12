CREATE TABLE IF NOT EXISTS "trash_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "model" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "branchId" TEXT,
  "deletedById" TEXT NOT NULL,
  "deletedBy" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "restoreFields" JSONB NOT NULL,
  "deletedFields" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "resolvedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "trash_entries_tenantId_model_recordId_key" ON "trash_entries"("tenantId", "model", "recordId");
CREATE INDEX IF NOT EXISTS "trash_entries_tenantId_status_expiresAt_idx" ON "trash_entries"("tenantId", "status", "expiresAt");
