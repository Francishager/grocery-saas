ALTER TABLE "user_permissions"
  ADD COLUMN "canRecordHRAttendance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canEditHRAttendance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canDeleteHRAttendance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canImportHRAttendance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canConfigureHRAttendance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCreateHRPayroll" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canApproveHRPayroll" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canPostHRPayroll" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canPayHRPayroll" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageHRPayrollSettings" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_permissions"
SET
  "canRecordHRAttendance" = COALESCE("canManageHRAttendance", false),
  "canEditHRAttendance" = COALESCE("canManageHRAttendance", false),
  "canDeleteHRAttendance" = COALESCE("canManageHRAttendance", false),
  "canImportHRAttendance" = COALESCE("canManageHRAttendance", false),
  "canConfigureHRAttendance" = COALESCE("canManageHRAttendance", false),
  "canCreateHRPayroll" = COALESCE("canManageHRPayroll", false),
  "canApproveHRPayroll" = COALESCE("canManageHRPayroll", false),
  "canPostHRPayroll" = COALESCE("canManageHRPayroll", false),
  "canPayHRPayroll" = COALESCE("canManageHRPayroll", false),
  "canManageHRPayrollSettings" = COALESCE("canManageHRPayroll", false)
WHERE
  COALESCE("canManageHRAttendance", false) = true
  OR COALESCE("canManageHRPayroll", false) = true;
