/**
 * Shift Routes - Phase 2 HR Module
 * Handles shift templates, assignments, and swaps
 */

import express from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import shiftService from '../services/shiftService.js';
import shiftSwapService from '../services/shiftSwapService.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

// Middleware
router.use(requireAuth);
router.use(requireTenant);

const requireHRPermission = (permissionCode) => async (req, res, next) => {
  const tenantId = req.tenant?.id || req.user?.tenantId || req.user?.tenant_id;
  if (await hrPermissionService.hasPermission(tenantId, req.user.id, permissionCode)) return next();
  return res.status(403).json({ success: false, message: 'Permission denied', required: permissionCode });
};

/**
 * Shift Template Management
 */

// Get all shift templates
router.get('/shifts/templates', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { branchId } = req.query;

    const templates = await shiftService.getTemplates(tenantId, branchId || null);
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Create shift template
router.post('/shifts/templates', requireHRPermission('SHIFT_MANAGE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { branchId, ...data } = req.body;

    if (!data.name || !data.code || !data.startTime || !data.endTime) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const template = await shiftService.createTemplate(tenantId, branchId || null, data);
    res.json({ success: true, data: template, message: 'Shift template created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get single shift template
router.get('/shifts/templates/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const template = await shiftService.getTemplate(tenantId, id);
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update shift template
router.put('/shifts/templates/:id', requireHRPermission('SHIFT_MANAGE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const template = await shiftService.updateTemplate(tenantId, id, req.body);
    res.json({ success: true, data: template, message: 'Shift template updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Soft-delete shift template
router.delete('/shifts/templates/:id', requireHRPermission('SHIFT_MANAGE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const template = await shiftService.deleteTemplate(tenantId, id);
    res.json({ success: true, data: template, message: 'Template deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Shift Assignment Management
 */

// Get all shift assignments (filtered)
router.get('/shifts/assignments', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId, status, page = 1, limit = 50 } = req.query;

    const result = await shiftService.getAssignments(tenantId, { employeeId, status }, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Assign shift to employee
router.post('/shifts/assignments', requireHRPermission('SHIFT_ASSIGN'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId, shiftTemplateId, startDate, endDate } = req.body;

    if (!employeeId || !shiftTemplateId || !startDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const assignment = await shiftService.assignShift(
      tenantId,
      employeeId,
      shiftTemplateId,
      startDate,
      endDate || null,
      { ...req.body, approvedBy: req.user.id }
    );
    res.json({ success: true, data: assignment, message: 'Shift assigned' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get single assignment
router.get('/shifts/assignments/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const assignment = await shiftService.getAssignment(tenantId, id);
    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update shift assignment
router.put('/shifts/assignments/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const assignment = await shiftService.updateAssignment(tenantId, id, req.body);
    res.json({ success: true, data: assignment, message: 'Assignment updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// End shift assignment
router.delete('/shifts/assignments/:id', requireHRPermission('SHIFT_ASSIGN'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const assignment = await shiftService.endAssignment(tenantId, id);
    res.json({ success: true, data: assignment, message: 'Assignment ended' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Schedule Views
 */

// Get employee schedule
router.get('/shifts/schedule/:employeeId/:month', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId, month } = req.params;

    const shift = await shiftService.getCurrentShift(tenantId, employeeId);
    res.json({ success: true, data: shift, message: 'Employee schedule for month' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get employee current shift
router.get('/shifts/current/:employeeId', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId } = req.params;

    const shift = await shiftService.getCurrentShift(tenantId, employeeId);
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get employee shift history
router.get('/shifts/history/:employeeId', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId } = req.params;

    const history = await shiftService.getShiftHistory(tenantId, employeeId);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Shift Swap Workflow
 */

// Request shift swap
router.post('/shifts/swaps', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const requesterId = req.user.id;
    const { targetEmployeeId, originalDate, swapDate, reason } = req.body;

    if (!targetEmployeeId || !originalDate || !swapDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const swap = await shiftSwapService.requestSwap(
      tenantId,
      requesterId,
      targetEmployeeId,
      originalDate,
      swapDate,
      reason
    );
    res.json({ success: true, data: swap, message: 'Shift swap requested' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get pending swaps for approver
router.get('/shifts/swaps', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const managerId = req.user.id;

    const swaps = await shiftSwapService.getPendingSwaps(tenantId, managerId);
    res.json({ success: true, data: swaps });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Approve shift swap
router.post('/shifts/swaps/:id/approve', requireHRPermission('SHIFT_APPROVE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const approverId = req.user.id;

    const swap = await shiftSwapService.approveSwap(tenantId, id, approverId);
    res.json({ success: true, data: swap, message: 'Shift swap approved' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Reject shift swap
router.post('/shifts/swaps/:id/reject', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const { reason } = req.body;
    const approverId = req.user.id;

    const swap = await shiftSwapService.rejectSwap(tenantId, id, approverId, reason);
    res.json({ success: true, data: swap, message: 'Shift swap rejected' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Execute swap
router.post('/shifts/swaps/:id/execute', requireHRPermission('SHIFT_APPROVE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const result = await shiftSwapService.executeSwap(tenantId, id);
    res.json({ success: true, data: result, message: 'Shift swap executed' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get employee swap history
router.get('/shifts/swaps/history/:employeeId', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId } = req.params;

    const history = await shiftSwapService.getEmployeeSwapHistory(tenantId, employeeId);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
