import prisma from '../db.js';

const PLATFORM_ROLES = new Set(['saas_admin', 'platform_admin', 'super_admin']);

const HR_PERMISSION_DEFINITIONS = [
  ['HR_DASHBOARD_VIEW', 'canViewHR', 'View HR dashboard'],
  ['HR_EMPLOYEE_VIEW', 'canViewHR', 'View HR employees'],
  ['HR_EMPLOYEE_CREATE', 'canCreateHREmployee', 'Create HR employees'],
  ['HR_EMPLOYEE_UPDATE', 'canEditHREmployee', 'Edit HR employees'],
  ['HR_EMPLOYEE_TRANSFER', 'canEditHREmployee', 'Transfer HR employees'],
  ['HR_EMPLOYEE_PROMOTE', 'canEditHREmployee', 'Promote HR employees'],
  ['HR_EMPLOYEE_STATUS_CHANGE', 'canEditHREmployee', 'Change HR employee status'],
  ['HR_EMPLOYEE_DELETE', 'canDeleteHREmployee', 'Deactivate HR employees'],
  ['HR_DEPARTMENT_VIEW', 'canViewHR', 'View HR departments'],
  ['HR_DEPARTMENT_CREATE', 'canManageHRStructure', 'Create HR departments'],
  ['HR_DEPARTMENT_UPDATE', 'canManageHRStructure', 'Edit HR departments'],
  ['HR_DEPARTMENT_DELETE', 'canManageHRStructure', 'Deactivate HR departments'],
  ['HR_POSITION_VIEW', 'canViewHR', 'View HR positions'],
  ['HR_POSITION_CREATE', 'canManageHRStructure', 'Create HR positions'],
  ['HR_POSITION_UPDATE', 'canManageHRStructure', 'Edit HR positions'],
  ['HR_POSITION_DELETE', 'canManageHRStructure', 'Deactivate HR positions'],
  ['HR_UNIT_VIEW', 'canViewHR', 'View HR units'],
  ['HR_UNIT_CREATE', 'canManageHRStructure', 'Create HR units'],
  ['HR_UNIT_UPDATE', 'canManageHRStructure', 'Edit HR units'],
  ['HR_UNIT_DELETE', 'canManageHRStructure', 'Deactivate HR units'],
  ['HR_TEAM_VIEW', 'canViewHR', 'View HR teams'],
  ['HR_TEAM_CREATE', 'canManageHRStructure', 'Create HR teams'],
  ['HR_TEAM_UPDATE', 'canManageHRStructure', 'Edit HR teams'],
  ['HR_TEAM_DELETE', 'canManageHRStructure', 'Deactivate HR teams'],
  ['HR_CONTRACT_VIEW', 'canViewHRContracts', 'View HR contracts'],
  ['HR_CONTRACT_CREATE', 'canManageHRContracts', 'Create HR contracts'],
  ['HR_CONTRACT_UPDATE', 'canManageHRContracts', 'Edit HR contracts'],
  ['HR_CONTRACT_TERMINATE', 'canManageHRContracts', 'Terminate HR contracts'],
  ['HR_DOCUMENT_VIEW', 'canViewHRDocuments', 'View HR documents'],
  ['HR_DOCUMENT_CREATE', 'canManageHRDocuments', 'Upload HR documents'],
  ['HR_DOCUMENT_UPDATE', 'canManageHRDocuments', 'Edit HR documents'],
  ['HR_DOCUMENT_DELETE', 'canManageHRDocuments', 'Delete HR documents'],
  ['HR_SALARY_VIEW', 'canViewHRSalaries', 'View HR salaries'],
  ['HR_SALARY_RECORD', 'canManageHRSalaries', 'Record HR salary changes'],
  ['ATTENDANCE_VIEW', 'canViewHRAttendance', 'View HR attendance'],
  ['ATTENDANCE_EDIT', 'canManageHRAttendance', 'Edit HR attendance'],
  ['ATTENDANCE_IMPORT', 'canManageHRAttendance', 'Import HR attendance'],
  ['ATTENDANCE_CONFIG', 'canManageHRAttendance', 'Configure HR attendance'],
  ['ATTENDANCE_APPROVE', 'canApproveHRAttendance', 'Approve HR attendance'],
  ['SHIFT_VIEW', 'canViewHRShifts', 'View HR shifts'],
  ['SHIFT_MANAGE', 'canManageHRShifts', 'Manage HR shifts'],
  ['SHIFT_ASSIGN', 'canAssignHRShifts', 'Assign HR shifts'],
  ['SHIFT_APPROVE', 'canApproveHRShifts', 'Approve HR shift changes'],
  ['LEAVE_VIEW', 'canViewHRLeave', 'View HR leave'],
  ['LEAVE_REQUEST', 'canRequestHRLeave', 'Request HR leave'],
  ['LEAVE_TYPE_MANAGE', 'canManageHRLeaveTypes', 'Manage HR leave types'],
  ['LEAVE_ALLOCATE', 'canManageHRLeaveTypes', 'Allocate HR leave'],
  ['LEAVE_APPROVE_L1', 'canApproveHRLeave', 'Approve HR leave'],
  ['LEAVE_APPROVE_L2', 'canApproveHRLeave', 'Final approve HR leave'],
  ['HR_PAYROLL_VIEW', 'canViewHRPayroll', 'View HR payroll'],
  ['HR_PAYROLL_MANAGE', 'canManageHRPayroll', 'Manage HR payroll'],
];

const CODE_TO_PERMISSION = new Map(HR_PERMISSION_DEFINITIONS.map(([code, field]) => [code, field]));
const DEFINITION_BY_CODE = new Map(HR_PERMISSION_DEFINITIONS.map(([code, field, description]) => [code, { code, field, description }]));

function normalizeCode(code = '') {
  return String(code).replace(/\./g, '_').toUpperCase();
}

class HRPermissionService {
  async getUserWithPermissions(tenantId, userId) {
    return prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        role: true,
        permissions: true,
      },
    });
  }

  async hasPermission(tenantId, userId, permissionCode) {
    if (!tenantId || !userId) return false;
    const user = await this.getUserWithPermissions(tenantId, userId);
    if (!user) return false;
    if (PLATFORM_ROLES.has(user.role) || user.role === 'owner') return true;

    const normalized = normalizeCode(permissionCode);
    const permissionField = CODE_TO_PERMISSION.get(normalized) || 'canViewHR';
    const permissionRecord = Array.isArray(user.permissions) ? user.permissions[0] : null;
    return Boolean(permissionRecord?.[permissionField]);
  }

  async getPermissionsByUser(tenantId, userId) {
    const user = await this.getUserWithPermissions(tenantId, userId);
    if (!user) return [];
    const permissionRecord = Array.isArray(user.permissions) ? user.permissions[0] : null;
    return this.permissionsFromRecord(permissionRecord, user.role);
  }

  async getPermissionsByRole(tenantId, roleId) {
    const user = await prisma.user.findFirst({
      where: { tenantId, role: roleId },
      select: { permissions: true, role: true },
    });
    const permissionRecord = Array.isArray(user?.permissions) ? user.permissions[0] : null;
    return this.permissionsFromRecord(permissionRecord, roleId);
  }

  async getAllPermissions() {
    return HR_PERMISSION_DEFINITIONS.map(([permissionCode, field, description]) => ({
      id: permissionCode,
      permissionCode,
      code: permissionCode,
      field,
      permissionName: permissionCode,
      name: permissionCode,
      description,
      status: 'active',
    }));
  }

  async grantPermission() {
    throw new Error('HR permissions are managed on the main Roles & Permissions page.');
  }

  async revokePermission() {
    throw new Error('HR permissions are managed on the main Roles & Permissions page.');
  }

  async updateUserPermissions() {
    throw new Error('HR permissions are managed on the main Roles & Permissions page.');
  }

  async getPermissionById(_tenantId, permissionId) {
    const normalized = normalizeCode(permissionId);
    const definition = DEFINITION_BY_CODE.get(normalized);
    if (!definition) throw new Error('Permission not found');
    return {
      id: definition.code,
      permissionCode: definition.code,
      code: definition.code,
      field: definition.field,
      name: definition.code,
      description: definition.description,
      status: 'active',
    };
  }

  permissionsFromRecord(permissionRecord, role = '') {
    const ownerLike = role === 'owner' || PLATFORM_ROLES.has(role);
    return HR_PERMISSION_DEFINITIONS
      .filter(([, field]) => ownerLike || Boolean(permissionRecord?.[field]))
      .map(([permissionCode, field, description]) => ({
        id: permissionCode,
        permissionCode,
        code: permissionCode,
        field,
        permissionName: permissionCode,
        name: permissionCode,
        description,
        status: 'active',
      }));
  }
}

export default new HRPermissionService();
