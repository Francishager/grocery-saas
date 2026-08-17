/**
 * Leave Routes - Phase 2 HR Module
 * Handles leave types, requests, and approval workflows
 */

import express from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import leaveTypeService from '../services/leaveTypeService.js';
import leaveRequestService from '../services/leaveRequestService.js';
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
 * Leave Type Management (Admin)
 */

// Get all leave types
router.get('/leave-types', async (req, res) => {
  try {
    const tenantId = req.tenant.id;

    const leaveTypes = await leaveTypeService.getLeaveTypes(tenantId);
    res.json({ success: true, data: leaveTypes });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Create leave type
router.post('/leave-types', requireHRPermission('LEAVE_TYPE_MANAGE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { name, code, daysAllowedPerYear, ...data } = req.body;

    if (!name || !code || !daysAllowedPerYear) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const leaveType = await leaveTypeService.createLeaveType(tenantId, {
      name,
      code,
      daysAllowedPerYear,
      ...data,
    });
    res.json({ success: true, data: leaveType, message: 'Leave type created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get single leave type
router.get('/leave-types/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const leaveType = await leaveTypeService.getLeaveType(tenantId, id);
    res.json({ success: true, data: leaveType });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update leave type
router.put('/leave-types/:id', requireHRPermission('LEAVE_TYPE_MANAGE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const leaveType = await leaveTypeService.updateLeaveType(tenantId, id, req.body);
    res.json({ success: true, data: leaveType, message: 'Leave type updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Deactivate leave type
router.delete('/leave-types/:id', requireHRPermission('LEAVE_TYPE_MANAGE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const leaveType = await leaveTypeService.deactivateLeaveType(tenantId, id);
    res.json({ success: true, data: leaveType, message: 'Leave type deactivated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Leave Request Workflow
 */

// Get all leave requests (filtered by status, employee)
router.get('/leave-requests', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { status, employeeId, page = 1, limit = 50 } = req.query;

    let requests;
    if (status) {
      const result = await leaveRequestService.getRequestsByStatus(tenantId, status, parseInt(page), parseInt(limit));
      requests = result;
    } else if (employeeId) {
      const data = await leaveRequestService.getEmployeeRequests(tenantId, employeeId);
      requests = { requests: data, pagination: { page, limit, total: data.length } };
    } else {
      const result = await leaveRequestService.getRequestsByStatus(tenantId, null, parseInt(page), parseInt(limit));
      requests = result;
    }

    res.json({ success: true, ...requests });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Create new leave request
router.post('/leave-requests', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const employeeId = req.body.employeeId;
    const { leaveTypeId, startDate, endDate, reason, contactDuringLeave, replacementEmployeeId } = req.body;

    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Employee, leave type, start date, and end date are required' });
    }

    const request = await leaveRequestService.createRequest(tenantId, employeeId, {
      leaveTypeId,
      startDate,
      endDate,
      reason,
      contactDuringLeave,
      replacementEmployeeId,
    });
    res.json({ success: true, data: request, message: 'Leave request created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get pending approvals for current user
router.get('/leave-requests/pending-approvals', async (req, res) => {
  try {
    const tenantId = req.tenant.id;

    const pending = await leaveRequestService.getPendingApprovals(tenantId, req.user.id);
    res.json({ success: true, data: pending });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get single leave request
router.get('/leave-requests/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const request = await leaveRequestService.getRequest(tenantId, id);
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update pending leave request
router.put('/leave-requests/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const request = await leaveRequestService.updateRequest(tenantId, id, req.body);
    res.json({ success: true, data: request, message: 'Leave request updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Submit for approval
router.post('/leave-requests/:id/submit', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const approverId = req.user.id;

    const request = await leaveRequestService.submitForApproval(tenantId, id, approverId);
    res.json({ success: true, data: request, message: 'Request submitted for approval' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Cancel leave request
router.delete('/leave-requests/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const { reason } = req.body;

    const request = await leaveRequestService.cancelRequest(tenantId, id, reason);
    res.json({ success: true, data: request, message: 'Request cancelled' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Leave Approval Workflow
 */

// Manager Level 1 approval
router.post('/leave-requests/:id/approve-l1', requireHRPermission('LEAVE_APPROVE_L1'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const { notes } = req.body;
    const approverId = req.user.id;

    const request = await leaveRequestService.approveLevel1(tenantId, id, approverId, notes);
    res.json({ success: true, data: request, message: 'Request approved by manager' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// HR Level 2 approval
router.post('/leave-requests/:id/approve-l2', requireHRPermission('LEAVE_APPROVE_L2'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const { notes } = req.body;
    const approverId = req.user.id;

    const request = await leaveRequestService.approveLevel2(tenantId, id, approverId, notes);
    res.json({ success: true, data: request, message: 'Request approved by HR' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Reject leave request
router.post('/leave-requests/:id/reject', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const { reason } = req.body;
    const approverId = req.user.id;

    const request = await leaveRequestService.rejectRequest(tenantId, id, approverId, reason);
    res.json({ success: true, data: request, message: 'Request rejected' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Leave Balance & Reporting
 */

// Get employee leave balance
router.get('/leave-balance/:employeeId', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId } = req.params;
    const year = new Date().getFullYear();

    // Get all leave types and their balances
    const summary = await leaveRequestService.getLeaveSummary(tenantId, employeeId, year);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get leave balance for specific year
router.get('/leave-balance/:employeeId/year/:year', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId, year } = req.params;

    const summary = await leaveRequestService.getLeaveSummary(tenantId, employeeId, parseInt(year));
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Check leave availability
router.get('/leave-availability/:employeeId/:leaveTypeId/:days', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId, leaveTypeId, days } = req.params;

    const availability = await leaveRequestService.checkLeaveAvailability(
      tenantId,
      employeeId,
      leaveTypeId,
      parseInt(days)
    );
    res.json({ success: true, data: availability });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Admin Operations
 */

// Allocate leave for new year
router.post('/leave-types/allocate/:year', requireHRPermission('LEAVE_ALLOCATE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { year } = req.params;

    const result = await leaveTypeService.allocateLeaveForYear(tenantId, parseInt(year));
    res.json({ success: true, data: result, message: 'Leave allocated for year' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Carryover leaves from one year to next
router.post('/leave-types/carryover/:fromYear/:toYear', requireHRPermission('LEAVE_ALLOCATE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { fromYear, toYear } = req.params;

    const result = await leaveTypeService.carryoverLeaves(tenantId, parseInt(fromYear), parseInt(toYear));
    res.json({ success: true, data: result, message: 'Leave carried over' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
