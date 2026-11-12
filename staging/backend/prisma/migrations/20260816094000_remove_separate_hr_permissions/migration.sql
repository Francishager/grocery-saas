DO $$
BEGIN
  IF to_regclass('public.hr_permissions') IS NOT NULL THEN
    WITH mapped_permissions AS (
      SELECT
        up."id",
        COALESCE(bool_or(TRUE), false) AS "canViewHR",
        COALESCE(bool_or(code IN ('HR_EMPLOYEE_CREATE')), false) AS "canCreateHREmployee",
        COALESCE(bool_or(code IN ('HR_EMPLOYEE_UPDATE', 'HR_EMPLOYEE_TRANSFER', 'HR_EMPLOYEE_PROMOTE', 'HR_EMPLOYEE_STATUS_CHANGE')), false) AS "canEditHREmployee",
        COALESCE(bool_or(code IN ('HR_EMPLOYEE_DELETE')), false) AS "canDeleteHREmployee",
        COALESCE(bool_or(code IN ('HR_DEPARTMENT_CREATE', 'HR_DEPARTMENT_UPDATE', 'HR_DEPARTMENT_DELETE', 'HR_POSITION_CREATE', 'HR_POSITION_UPDATE', 'HR_POSITION_DELETE', 'HR_UNIT_CREATE', 'HR_UNIT_UPDATE', 'HR_UNIT_DELETE', 'HR_TEAM_CREATE', 'HR_TEAM_UPDATE', 'HR_TEAM_DELETE')), false) AS "canManageHRStructure",
        COALESCE(bool_or(code IN ('HR_CONTRACT_VIEW')), false) AS "canViewHRContracts",
        COALESCE(bool_or(code IN ('HR_CONTRACT_CREATE', 'HR_CONTRACT_UPDATE', 'HR_CONTRACT_TERMINATE')), false) AS "canManageHRContracts",
        COALESCE(bool_or(code IN ('HR_DOCUMENT_VIEW')), false) AS "canViewHRDocuments",
        COALESCE(bool_or(code IN ('HR_DOCUMENT_CREATE', 'HR_DOCUMENT_UPDATE', 'HR_DOCUMENT_DELETE')), false) AS "canManageHRDocuments",
        COALESCE(bool_or(code IN ('HR_SALARY_VIEW')), false) AS "canViewHRSalaries",
        COALESCE(bool_or(code IN ('HR_SALARY_RECORD')), false) AS "canManageHRSalaries",
        COALESCE(bool_or(code IN ('ATTENDANCE_VIEW')), false) AS "canViewHRAttendance",
        COALESCE(bool_or(code IN ('ATTENDANCE_EDIT', 'ATTENDANCE_IMPORT', 'ATTENDANCE_CONFIG')), false) AS "canManageHRAttendance",
        COALESCE(bool_or(code IN ('ATTENDANCE_APPROVE')), false) AS "canApproveHRAttendance",
        COALESCE(bool_or(code IN ('SHIFT_VIEW')), false) AS "canViewHRShifts",
        COALESCE(bool_or(code IN ('SHIFT_MANAGE')), false) AS "canManageHRShifts",
        COALESCE(bool_or(code IN ('SHIFT_ASSIGN')), false) AS "canAssignHRShifts",
        COALESCE(bool_or(code IN ('SHIFT_APPROVE')), false) AS "canApproveHRShifts",
        COALESCE(bool_or(code IN ('LEAVE_VIEW')), false) AS "canViewHRLeave",
        COALESCE(bool_or(code IN ('LEAVE_REQUEST')), false) AS "canRequestHRLeave",
        COALESCE(bool_or(code IN ('LEAVE_TYPE_MANAGE', 'LEAVE_ALLOCATE')), false) AS "canManageHRLeaveTypes",
        COALESCE(bool_or(code IN ('LEAVE_APPROVE_L1', 'LEAVE_APPROVE_L2')), false) AS "canApproveHRLeave",
        COALESCE(bool_or(code IN ('HR_PAYROLL_VIEW')), false) AS "canViewHRPayroll",
        COALESCE(bool_or(code IN ('HR_PAYROLL_MANAGE')), false) AS "canManageHRPayroll"
      FROM "user_permissions" up
      JOIN "users" u ON u."id" = up."userId"
      JOIN (
        SELECT
          hp."tenantId",
          hp."roleId",
          UPPER(REPLACE(hp."permissionCode", '.', '_')) AS code
        FROM "hr_permissions" hp
      ) hp ON hp."tenantId" = u."tenantId" AND (hp."roleId" = u."role"::text OR hp."roleId" = u."id")
      GROUP BY up."id"
    )
    UPDATE "user_permissions" up
    SET
      "canViewHR" = up."canViewHR" OR mapped_permissions."canViewHR",
      "canCreateHREmployee" = up."canCreateHREmployee" OR mapped_permissions."canCreateHREmployee",
      "canEditHREmployee" = up."canEditHREmployee" OR mapped_permissions."canEditHREmployee",
      "canDeleteHREmployee" = up."canDeleteHREmployee" OR mapped_permissions."canDeleteHREmployee",
      "canManageHRStructure" = up."canManageHRStructure" OR mapped_permissions."canManageHRStructure",
      "canViewHRContracts" = up."canViewHRContracts" OR mapped_permissions."canViewHRContracts",
      "canManageHRContracts" = up."canManageHRContracts" OR mapped_permissions."canManageHRContracts",
      "canViewHRDocuments" = up."canViewHRDocuments" OR mapped_permissions."canViewHRDocuments",
      "canManageHRDocuments" = up."canManageHRDocuments" OR mapped_permissions."canManageHRDocuments",
      "canViewHRSalaries" = up."canViewHRSalaries" OR mapped_permissions."canViewHRSalaries",
      "canManageHRSalaries" = up."canManageHRSalaries" OR mapped_permissions."canManageHRSalaries",
      "canViewHRAttendance" = up."canViewHRAttendance" OR mapped_permissions."canViewHRAttendance",
      "canManageHRAttendance" = up."canManageHRAttendance" OR mapped_permissions."canManageHRAttendance",
      "canApproveHRAttendance" = up."canApproveHRAttendance" OR mapped_permissions."canApproveHRAttendance",
      "canViewHRShifts" = up."canViewHRShifts" OR mapped_permissions."canViewHRShifts",
      "canManageHRShifts" = up."canManageHRShifts" OR mapped_permissions."canManageHRShifts",
      "canAssignHRShifts" = up."canAssignHRShifts" OR mapped_permissions."canAssignHRShifts",
      "canApproveHRShifts" = up."canApproveHRShifts" OR mapped_permissions."canApproveHRShifts",
      "canViewHRLeave" = up."canViewHRLeave" OR mapped_permissions."canViewHRLeave",
      "canRequestHRLeave" = up."canRequestHRLeave" OR mapped_permissions."canRequestHRLeave",
      "canManageHRLeaveTypes" = up."canManageHRLeaveTypes" OR mapped_permissions."canManageHRLeaveTypes",
      "canApproveHRLeave" = up."canApproveHRLeave" OR mapped_permissions."canApproveHRLeave",
      "canViewHRPayroll" = up."canViewHRPayroll" OR mapped_permissions."canViewHRPayroll",
      "canManageHRPayroll" = up."canManageHRPayroll" OR mapped_permissions."canManageHRPayroll"
    FROM mapped_permissions
    WHERE up."id" = mapped_permissions."id";
  END IF;
END $$;

DROP TABLE IF EXISTS "hr_permissions";
