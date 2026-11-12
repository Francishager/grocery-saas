ALTER TABLE "user_permissions" ADD COLUMN "canViewHR" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canCreateHREmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canEditHREmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canDeleteHREmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRStructure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canViewHRContracts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRContracts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canViewHRDocuments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRDocuments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canViewHRSalaries" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRSalaries" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canViewHRAttendance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRAttendance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canApproveHRAttendance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canViewHRShifts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRShifts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canAssignHRShifts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canApproveHRShifts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canViewHRLeave" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canRequestHRLeave" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRLeaveTypes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canApproveHRLeave" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canViewHRPayroll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_permissions" ADD COLUMN "canManageHRPayroll" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_permissions"
SET
  "canViewHR" = "canViewStaff",
  "canCreateHREmployee" = "canCreateStaff",
  "canEditHREmployee" = "canEditStaff",
  "canDeleteHREmployee" = "canDeleteStaff",
  "canManageHRStructure" = "canEditStaff",
  "canViewHRContracts" = "canViewStaff",
  "canManageHRContracts" = "canEditStaff",
  "canViewHRDocuments" = "canViewStaff",
  "canManageHRDocuments" = "canEditStaff",
  "canViewHRSalaries" = "canViewStaff",
  "canManageHRSalaries" = "canEditStaff",
  "canViewHRAttendance" = "canViewStaff",
  "canManageHRAttendance" = "canEditStaff",
  "canApproveHRAttendance" = "canEditStaff",
  "canViewHRShifts" = "canViewStaff",
  "canManageHRShifts" = "canEditStaff",
  "canAssignHRShifts" = "canEditStaff",
  "canApproveHRShifts" = "canEditStaff",
  "canViewHRLeave" = "canViewStaff",
  "canRequestHRLeave" = "canViewStaff",
  "canManageHRLeaveTypes" = "canEditStaff",
  "canApproveHRLeave" = "canEditStaff",
  "canViewHRPayroll" = "canViewStaff",
  "canManageHRPayroll" = "canEditStaff";
