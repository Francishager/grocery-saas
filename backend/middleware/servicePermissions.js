import { requirePermission } from './auth.js';
import { SERVICE_PERMISSION_DEFINITIONS } from '../src/utils/servicePermissions.js';

export function servicePermission(tab, action) {
  return SERVICE_PERMISSION_DEFINITIONS.find(p => p.tab === tab && p.action === action)?.id;
}

const updateFields = {
  appointments: ['status', 'technicianId', 'scheduledDate', 'scheduledTime', 'endTime', 'duration', 'price', 'actualPrice', 'notes', 'cancelledReason'],
  'work-orders': ['status', 'technicianId', 'priority', 'serviceCategory', 'estimatedCost', 'actualCost', 'laborCost', 'partsCost', 'startDate', 'endDate', 'diagnostics', 'warrantyInfo', 'notes'],
  contracts: ['title', 'description', 'serviceCategory', 'endDate', 'renewalDate', 'autoRenew', 'nextBillingDate', 'value', 'billingCycle', 'discountPercent', 'status', 'terms'],
  technicians: ['name', 'email', 'phone', 'role', 'skills', 'specializations', 'hourlyRate', 'availability', 'isActive', 'notes'],
  'job-cards': ['status', 'technicianId', 'priority', 'actualStart', 'actualEnd', 'laborHours', 'laborCost', 'partsCost', 'partsUsed', 'qualityCheckPassed', 'qualityNotes', 'completionNotes', 'customerSignature', 'productId', 'serviceTitle', 'serviceDescription'],
  feedback: ['status', 'response'],
  'car-wash': ['vehicle', 'serviceType', 'amount', 'attendantId', 'notes'],
  garage: ['vehicle', 'service', 'cost', 'attendantId', 'status', 'notes'],
};

export function requiredServiceUpdatePermissions(tab, body = {}) {
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !updateFields[tab]?.includes(key))) return null;
  return [...new Set(keys.map(key => {
    let action = 'Edit';
    if (key === 'status' || key === 'cancelledReason') action = tab === 'feedback' ? 'Moderate' : 'UpdateStatus';
    else if (key === 'technicianId') action = 'Assign';
    else if (['qualityCheckPassed', 'qualityNotes'].includes(key)) action = 'CheckQuality';
    else if (key === 'response') action = 'Respond';
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

export const requireServiceAssignment = tab => (req, res, next) => {
  if (!req.body.technicianId) return next();
  return requirePermission(servicePermission(tab, 'Assign'))(req, res, next);
};
