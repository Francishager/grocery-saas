import { requirePermission } from './auth.js';
import { SERVICE_PERMISSION_DEFINITIONS } from '../src/utils/servicePermissions.js';
import { resolveServiceTechnician } from '../src/services/serviceTechnicianIdentity.js';

export function servicePermission(tab, action) {
  return SERVICE_PERMISSION_DEFINITIONS.find(p => p.tab === tab && p.action === action)?.id;
}

const updateFields = {
  appointments: ['status', 'technicianId', 'scheduledDate', 'scheduledTime', 'endTime', 'duration', 'price', 'actualPrice', 'notes', 'cancelledReason'],
  'work-orders': ['status', 'technicianId', 'priority', 'serviceCategory', 'estimatedCost', 'actualCost', 'laborCost', 'partsCost', 'startDate', 'endDate', 'diagnostics', 'warrantyInfo', 'notes'],
  contracts: ['title', 'description', 'serviceCategory', 'endDate', 'renewalDate', 'autoRenew', 'nextBillingDate', 'value', 'billingCycle', 'discountPercent', 'status', 'terms'],
  technicians: ['name', 'email', 'phone', 'role', 'skills', 'specializations', 'hourlyRate', 'availability', 'isActive', 'notes', 'hireDate'],
  'job-cards': ['status', 'technicianId', 'priority', 'actualStart', 'actualEnd', 'laborHours', 'laborCost', 'partsCost', 'partsUsed', 'qualityCheckPassed', 'qualityNotes', 'completionNotes', 'customerSignature', 'productId', 'serviceTitle', 'serviceDescription'],
  feedback: ['status', 'response'],
  'car-wash': ['vehicle', 'serviceType', 'amount', 'attendantId', 'notes'],
  garage: ['vehicle', 'service', 'cost', 'attendantId', 'status', 'notes'],
};

export function requiredServiceUpdatePermissions(tab, body = {}) {
  const keys = Object.keys(body);
  const fields = tab === 'job-cards' ? [...updateFields[tab], 'customerName', 'customerPhone', 'scheduledStart', 'scheduledEnd'] : updateFields[tab];
  if (!keys.length || keys.some(key => !fields?.includes(key))) return null;
  return [...new Set(keys.map(key => {
    let action = 'Edit';
    if (key === 'status' || key === 'cancelledReason') action = tab === 'feedback' ? 'Moderate' : 'UpdateStatus';
    else if (key === 'technicianId') action = 'Assign';
    else if (['qualityCheckPassed', 'qualityNotes'].includes(key)) action = 'CheckQuality';
    else if (key === 'response') action = 'Respond';
    else if (tab === 'job-cards' && key === 'completionNotes') action = 'UpdateStatus';
    return servicePermission(tab, action);
  }))];
}

export const requireServiceUpdate = tab => async (req, res, next) => {
  const permissions = requiredServiceUpdatePermissions(tab, req.body);
  if (!permissions || permissions.some(p => !p)) return res.status(400).json({ error: 'Unsupported service update fields' });
  for (const permission of permissions) {
    let allowed = false;
    await requirePermission(permission)(req, res, () => { allowed = true; });
    if (!allowed) return;
  }
  next();
};

export const requireServiceAssignment = tab => async (req, res, next) => {
  if (!req.body.technicianId) return next();
  const id = req.user?.id || req.user?.userId || req.user?.sub;
  if (tab === 'work-orders' && req.body.technicianId === id) return next();
  if (tab === 'job-cards') {
    try {
      const technician = await resolveServiceTechnician(req.user.tenantId || req.user.tenant_id, id);
      if (technician?.id === req.body.technicianId) return next();
    } catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  }
  return requirePermission(servicePermission(tab, 'Assign'))(req, res, next);
};
