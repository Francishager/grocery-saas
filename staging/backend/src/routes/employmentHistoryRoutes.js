import express from 'express';
import employmentHistoryService from '../services/employmentHistoryService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /employment-history - Record status change
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { employeeId, previousStatus, newStatus, reason, ...otherData } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_STATUS_CHANGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const history = await employmentHistoryService.recordStatusChange(
      tenantId,
      employeeId,
      { previousStatus, newStatus, reason, ...otherData },
      userId
    );

    res.status(201).json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employment-history/employee/:employeeId - Get employment history
 */
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;
    const { skip, take, fromDate, toDate } = req.query;

    const history = await employmentHistoryService.getEmploymentHistory(tenantId, employeeId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      fromDate,
      toDate,
    });

    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employment-history/:id - Get history record
 */
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const history = await employmentHistoryService.getHistoryById(tenantId, req.params.id);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employment-history/employee/:employeeId/status-changes - Get status changes
 */
router.get('/employee/:employeeId/status-changes', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;
    const { fromDate, toDate } = req.query;

    const changes = await employmentHistoryService.getStatusChangesBetween(
      tenantId,
      employeeId,
      fromDate || new Date(new Date().getFullYear() - 1, 0, 1),
      toDate || new Date()
    );

    res.json({ success: true, data: changes });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employment-history/reason/:reason - Get changes by reason
 */
router.get('/reason/:reason', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { reason } = req.params;
    const { skip, take } = req.query;

    const changes = await employmentHistoryService.getChangesByReason(tenantId, reason, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
    });

    res.json({ success: true, data: changes });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employment-history/employee/:employeeId/current-status - Get current status
 */
router.get('/employee/:employeeId/current-status', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;

    const currentStatus = await employmentHistoryService.getCurrentStatus(tenantId, employeeId);
    res.json({ success: true, data: currentStatus });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employment-history/employee/:employeeId/status/:status/duration - Get status duration
 */
router.get('/employee/:employeeId/status/:status/duration', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId, status } = req.params;

    const duration = await employmentHistoryService.getStatusDuration(tenantId, employeeId, status);
    res.json({ success: true, data: duration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
