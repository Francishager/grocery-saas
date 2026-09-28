import prisma from '../db.js';
import { checkUsageLimit } from '../utils/usageLimits.js';

export const TRASH_RETENTION_DAYS = 30;
const inactive = { isActive: false };
// Only existing soft-delete operations are recoverable here. Financial reversals stay in their own workflows.
export const TRASH_MODELS = {
  product: { label: 'Inventory item', permissions: ['canDeleteProduct', 'canDeleteService', 'canDeleteRental'], fields: inactive },
  user: { label: 'Staff', permissions: ['canDeleteStaff'], fields: inactive },
  cashAccount: { label: 'Transaction account', permissions: ['canDeleteTransactionAccount'], fields: inactive },
  employee: { label: 'Employee', permissions: ['canDeleteHREmployee'], fields: () => ({ status: 'inactive', terminationDate: new Date() }) },
  attendanceRecord: { label: 'Attendance', permissions: ['canDeleteHRAttendance'], fields: inactive },
  department: { label: 'Department', permissions: ['canManageHRStructure'], fields: inactive },
  position: { label: 'Position', permissions: ['canManageHRStructure'], fields: inactive },
  unit: { label: 'HR unit', permissions: ['canManageHRStructure'], fields: inactive },
  team: { label: 'HR team', permissions: ['canManageHRStructure'], fields: inactive },
  shiftTemplate: { label: 'Shift template', permissions: ['canManageHRShifts'], fields: inactive },
  shiftAssignment: { label: 'Shift assignment', permissions: ['canAssignHRShifts'], fields: () => ({ isActive: false, status: 'ended', assignmentEndDate: new Date() }) },
  leaveType: { label: 'Leave type', permissions: ['canManageHRLeaveTypes'], fields: inactive },
};
export const TRASH_PERMISSIONS = [...new Set(Object.values(TRASH_MODELS).flatMap(config => config.permissions))];
const json = value => JSON.parse(JSON.stringify(value ?? null));
export const trashError = (status, message) => Object.assign(new Error(message), { status, statusCode: status });

export async function trashedRecordIds(model, tenantId, client = prisma) {
  const rows = await client.trashEntry.findMany({ where: { tenantId, model, status: { not: 'restored' } }, select: { recordId: true } });
  return rows.map(row => row.recordId);
}

export async function assertOutsideTrash(model, tenantId, recordId, client = prisma) {
  const entry = await client.trashEntry.findUnique({ where: { tenantId_model_recordId: { tenantId, model, recordId } }, select: { status: true } });
  if (entry && entry.status !== 'restored') throw trashError(409, 'This record was deleted. Restore it from Trash before making changes, if recovery is still available.');
}

export function allowedTrashPermissions(user) {
  const permissions = user?.permissions || [];
  if (permissions.includes('*')) return TRASH_PERMISSIONS;
  return TRASH_PERMISSIONS.filter(permission => permissions.includes(permission)
    || (permission === 'canDeleteHRAttendance' && permissions.includes('canManageHRAttendance')));
}

async function audit(tx, tenantId, actor, action, model, recordId) {
  await tx.auditLog.create({ data: {
    tenantId, userId: actor?.id || 'SYSTEM', userEmail: actor?.email || '', action, model, recordId,
    changes: { retentionDays: TRASH_RETENTION_DAYS },
  } });
}

export async function moveToTrash(model, where, actor) {
  const config = TRASH_MODELS[model];
  if (!config || !where.tenantId) throw trashError(400, 'This record does not support Trash.');
  return prisma.$transaction(async tx => {
    const row = await tx[model].findFirst({ where });
    if (!row) throw trashError(404, 'Record not found.');
    if (model === 'user' && (row.role === 'owner' || row.id === actor?.id)) throw trashError(403, 'The business owner and your own login cannot be deleted.');
    const key = { tenantId: where.tenantId, model, recordId: row.id };
    const existing = await tx.trashEntry.findUnique({ where: { tenantId_model_recordId: key } });
    if (existing?.status === 'active') throw trashError(409, 'This record is already in Trash.');
    const fields = typeof config.fields === 'function' ? config.fields() : config.fields;
    const stateField = Object.hasOwn(fields, 'isActive') ? 'isActive' : 'status';
    if (row[stateField] === fields[stateField]) throw trashError(409, 'This record is already inactive.');
    const restoreFields = Object.fromEntries(Object.keys(fields).map(field => [field, row[field] ?? null]));
    const deleted = await tx[model].update({ where: { id: row.id }, data: fields });
    const now = new Date();
    let label = row.name || [row.firstName || row.fname, row.lastName || row.lname].filter(Boolean).join(' ') || config.label;
    let branchId = row.branchId || null;
    if (row.employeeId) {
      const employee = await tx.employee.findFirst({ where: { id: row.employeeId, tenantId: where.tenantId }, select: { firstName: true, lastName: true, branchId: true } });
      if (employee) { label = `${config.label}: ${employee.firstName} ${employee.lastName}`; branchId ||= employee.branchId; }
    }
    const permission = model === 'product'
      ? ({ service: 'canDeleteService', rental: 'canDeleteRental' }[row.itemType] || 'canDeleteProduct') : config.permissions[0];
    const data = {
      ...key, label: String(label).slice(0, 250), permission, branchId: branchId || null,
      deletedById: actor?.id || 'SYSTEM', deletedBy: actor?.name || [actor?.fname, actor?.lname].filter(Boolean).join(' ') || 'Business user',
      deletedAt: now, expiresAt: new Date(now.getTime() + TRASH_RETENTION_DAYS * 86400000),
      restoreFields: json(restoreFields), deletedFields: json(fields), status: 'active', resolvedAt: null,
    };
    await tx.trashEntry.upsert({ where: { tenantId_model_recordId: key }, create: data, update: data });
    await audit(tx, where.tenantId, actor, 'move_to_trash', model, row.id);
    return deleted;
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}

export async function trashScope(user, client = prisma) {
  const tenantId = user?.tenantId || user?.tenant_id || user?.business_id;
  if (!tenantId || user?.isPlatformUser) throw trashError(403, 'Business tenant access required.');
  const permissions = allowedTrashPermissions(user);
  if (!permissions.length) throw trashError(403, 'A delete permission is required to access Trash.');
  const scope = { tenantId, permission: { in: permissions } };
  if (user.role !== 'owner' && !user.permissions?.includes('*')) {
    const assignments = await client.userBranch.findMany({ where: { userId: user.id, branch: { tenantId } }, select: { branchId: true } });
    scope.OR = [{ branchId: null }, { branchId: { in: assignments.map(row => row.branchId) } }];
  }
  return scope;
}

export async function expireTrash(client = prisma) {
  return client.trashEntry.updateMany({
    where: { status: 'active', expiresAt: { lte: new Date() } },
    data: { status: 'expired', resolvedAt: new Date() },
  });
}

export async function resolveTrash(scope, id, action, actor) {
  if (!['restore', 'delete'].includes(action)) throw trashError(400, 'Choose Restore or Delete.');
  return prisma.$transaction(async tx => {
    const now = new Date();
    const entry = await tx.trashEntry.findFirst({ where: { ...scope, id, status: 'active', expiresAt: { gt: now } } });
    if (!entry) throw trashError(404, 'Trash item is unavailable, expired, or outside your permissions.');
    const claimed = await tx.trashEntry.updateMany({ where: { id, status: 'active', expiresAt: { gt: now } }, data: { status: 'processing' } });
    if (!claimed.count) throw trashError(409, 'This item is already being processed. Refresh Trash.');
    const config = TRASH_MODELS[entry.model];
    if (!config) throw trashError(409, 'This item cannot be restored safely.');
    if (action === 'restore') {
      const row = await tx[entry.model].findFirst({ where: { id: entry.recordId, tenantId: entry.tenantId } });
      if (!row || (Object.hasOwn(row, 'branchId') && (row.branchId || null) !== entry.branchId)
        || Object.entries(entry.deletedFields).some(([field, value]) => JSON.stringify(json(row[field])) !== JSON.stringify(value))) {
        throw trashError(409, 'The original record has changed. Review it before restoring.');
      }
      const permittedFields = Object.keys(typeof config.fields === 'function' ? config.fields() : config.fields);
      if (Object.keys(entry.restoreFields).some(field => !permittedFields.includes(field))) throw trashError(409, 'Invalid restoration fields.');
      if (entry.model === 'user' || entry.model === 'product') {
        await checkUsageLimit(entry.tenantId, entry.model === 'user' ? 'users' : 'products', tx);
      }
      // Never overwrite stock, balances, permissions, or login credentials with old values.
      await tx[entry.model].update({ where: { id: row.id }, data: entry.restoreFields });
    }
    // Delete ends recovery only; inactive records and linked accounting history are retained.
    await tx.trashEntry.update({ where: { id }, data: { status: action === 'restore' ? 'restored' : 'removed', resolvedAt: now } });
    await audit(tx, entry.tenantId, actor, action === 'restore' ? 'restore_from_trash' : 'remove_from_trash', entry.model, entry.recordId);
    return { id, label: entry.label };
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}
