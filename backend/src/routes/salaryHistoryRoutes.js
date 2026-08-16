import express from 'express';
import salaryHistoryService from '../services/salaryHistoryService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /salary-history - Record salary change (IMMUTABLE - CREATION ONLY)
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { employeeId, basicSalary, reason, ...otherData } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_SALARY_RECORD'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const salaryRecord = await salaryHistoryService.recordSalaryChange(
      tenantId,
      employeeId,
      { basicSalary, ...otherData },
      reason,
      userId
    );

    res.status(201).json({ success: true, data: salaryRecord, message: 'Salary change recorded (immutable)' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /salary-history/employee/:employeeId - Get salary history
 */
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;
    const { skip, take, fromDate, toDate } = req.query;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_SALARY_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const salaryHistory = await salaryHistoryService.getSalaryHistory(tenantId, employeeId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      fromDate,
      toDate,
    });

    res.json({ success: true, data: salaryHistory });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /salary-history/:id - Get salary record
 */
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;

    const salaryHistory = await salaryHistoryService.getSalaryHistory(tenantId, req.params.id);
    res.json({ success: true, data: salaryHistory });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /salary-history/employee/:employeeId/current - Get current salary
 */
router.get('/employee/:employeeId/current', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;

    const currentSalary = await salaryHistoryService.getCurrentSalary(tenantId, employeeId);
    res.json({ success: true, data: currentSalary });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /salary-history/employee/:employeeId/date/:date - Get salary for date
 */
router.get('/employee/:employeeId/date/:date', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId, date } = req.params;

    const salary = await salaryHistoryService.getSalaryForDate(tenantId, employeeId, date);
    res.json({ success: true, data: salary });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /salary-history/employee/:employeeId/range - Get salary records between dates
 */
router.get('/employee/:employeeId/range', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;
    const { fromDate, toDate } = req.query;

    const salaries = await salaryHistoryService.getSalaryRecordsBetween(tenantId, employeeId, fromDate, toDate);
    res.json({ success: true, data: salaries });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /salary-history/:id/update - Forbidden (immutability enforcement)
 */
router.post('/:id/update', async (req, res) => {
  res.status(403).json({ error: 'FORBIDDEN: Salary history is immutable. Cannot update records. Create new record instead.' });
});

/**
 * DELETE /salary-history/:id - Forbidden (immutability enforcement)
 */
router.delete('/:id', async (req, res) => {
  res.status(403).json({ error: 'FORBIDDEN: Salary history is immutable. Cannot delete records.' });
});

/**
 * GET /salary-history/verify/integrity - Verify salary history integrity
 */
router.get('/verify/integrity/:employeeId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;

    await salaryHistoryService.verifyIntegrity(tenantId, employeeId);
    res.json({ success: true, message: 'Salary history integrity verified' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
