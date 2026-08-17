/**
 * Payroll Processing Routes - Phase 4 Payroll Management
 * Endpoints for salary processing, salary slips, and payroll reporting
 */

import express from 'express';
import { requireAuth, requirePermission, requireTenant } from '../middleware/auth.js';
import payrollProcessingService from '../services/payrollProcessingService.js';
import salaryStructureService from '../services/salaryStructureService.js';

const router = express.Router();
router.use(requireAuth);
router.use(requireTenant);

// ========== Payroll Processing ==========

/**
 * POST /api/payroll/processing/process-cycle
 * Process payroll for a cycle
 */
router.post('/process-cycle', requirePermission('PAYROLL_PROCESS'), async (req, res) => {
  try {
    const { cycleId } = req.body;
    if (!cycleId) throw new Error('Cycle ID required');

    const result = await payrollProcessingService.processPayroll(
      req.tenant.id,
      cycleId,
      req.user.id
    );
    res.json({ success: true, data: result, message: 'Payroll processed' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/payroll/processing/approve-cycle
 * Approve payroll cycle for processing
 */
router.post('/approve-cycle', requirePermission('PAYROLL_APPROVE'), async (req, res) => {
  try {
    const { cycleId } = req.body;
    if (!cycleId) throw new Error('Cycle ID required');

    const result = await payrollProcessingService.approvePayroll(
      req.tenant.id,
      cycleId,
      req.user.id
    );
    res.json({ success: true, data: result, message: 'Payroll approved' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/payroll/processing/summary/:cycleId
 * Get payroll summary for cycle
 */
router.get('/summary/:cycleId', requirePermission('PAYROLL_VIEW'), async (req, res) => {
  try {
    const summary = await payrollProcessingService.getPayrollSummary(
      req.tenant.id,
      req.params.cycleId
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/payroll/processing/lock-cycle/:cycleId
 * Lock/finalize payroll cycle
 */
router.post('/lock-cycle/:cycleId', requirePermission('PAYROLL_APPROVE'), async (req, res) => {
  try {
    const result = await payrollProcessingService.lockPayrollCycle(
      req.tenant.id,
      req.params.cycleId
    );
    res.json({ success: true, data: result, message: 'Payroll cycle locked' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Salary Structure ==========

/**
 * POST /api/payroll/salary-structure
 * Create/update salary structure
 */
router.post('/salary-structure', requirePermission('PAYROLL_MANAGE'), async (req, res) => {
  try {
    const structure = await salaryStructureService.createStructure(
      req.tenant.id,
      req.body
    );
    res.json({ success: true, data: structure, message: 'Salary structure created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/payroll/salary-structure/:employeeId
 * Get employee salary structure
 */
router.get('/salary-structure/:employeeId', requirePermission('PAYROLL_VIEW'), async (req, res) => {
  try {
    const structure = await salaryStructureService.getStructure(
      req.tenant.id,
      req.params.employeeId
    );
    res.json({ success: true, data: structure });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/payroll/salary-structure/:employeeId
 * Update salary structure
 */
router.put('/salary-structure/:employeeId', requirePermission('PAYROLL_MANAGE'), async (req, res) => {
  try {
    const structure = await salaryStructureService.updateStructure(
      req.tenant.id,
      req.params.employeeId,
      req.body
    );
    res.json({ success: true, data: structure, message: 'Salary structure updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Salary Slips ==========

/**
 * POST /api/payroll/salary-slip/generate
 * Generate salary slip for employee
 */
router.post('/salary-slip/generate', requirePermission('PAYROLL_PROCESS'), async (req, res) => {
  try {
    const { employeeId, cycleId } = req.body;
    if (!employeeId || !cycleId) {
      throw new Error('Employee ID and Cycle ID required');
    }

    const slip = await payrollProcessingService.generateSalarySlip(
      req.tenant.id,
      employeeId,
      cycleId
    );
    res.json({ success: true, data: slip, message: 'Salary slip generated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/payroll/salary-slip/:employeeId/:month/:year
 * Get salary slip
 */
router.get('/salary-slip/:employeeId/:month/:year', requirePermission('PAYROLL_VIEW'), async (req, res) => {
  try {
    const slip = await db.salarySlip.findFirst({
      where: {
        tenantId: req.tenant.id,
        employeeId: req.params.employeeId,
        month: parseInt(req.params.month),
        year: parseInt(req.params.year),
      },
    });

    if (!slip) throw new Error('Salary slip not found');
    res.json({ success: true, data: slip });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/payroll/history/:employeeId/:year
 * Get employee payroll history
 */
router.get('/history/:employeeId/:year', requirePermission('PAYROLL_VIEW'), async (req, res) => {
  try {
    const history = await payrollProcessingService.getEmployeePayrollHistory(
      req.tenant.id,
      req.params.employeeId,
      parseInt(req.params.year)
    );
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Bonus Allocation ==========

/**
 * POST /api/payroll/bonus/allocate
 * Allocate bonus to employee
 */
router.post('/bonus/allocate', requirePermission('PAYROLL_MANAGE'), async (req, res) => {
  try {
    const bonus = await db.bonusAllocation.create({
      data: {
        tenantId: req.tenant.id,
        employeeId: req.body.employeeId,
        year: req.body.year,
        bonusType: req.body.bonusType,
        amount: req.body.amount,
        percentage: req.body.percentage,
        allocatedDate: new Date(),
      },
    });
    res.json({ success: true, data: bonus, message: 'Bonus allocated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/payroll/bonus/:employeeId/:year
 * Get employee bonuses
 */
router.get('/bonus/:employeeId/:year', requirePermission('PAYROLL_VIEW'), async (req, res) => {
  try {
    const bonuses = await db.bonusAllocation.findMany({
      where: {
        tenantId: req.tenant.id,
        employeeId: req.params.employeeId,
        year: parseInt(req.params.year),
      },
    });
    res.json({ success: true, data: bonuses });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Deduction Configuration ==========

/**
 * POST /api/payroll/deductions
 * Create deduction type
 */
router.post('/deductions', requirePermission('PAYROLL_MANAGE'), async (req, res) => {
  try {
    const deduction = await db.deduction.create({
      data: {
        tenantId: req.tenant.id,
        type: req.body.type,
        description: req.body.description,
        rate: req.body.rate,
        isPercentage: req.body.isPercentage,
        maxAmount: req.body.maxAmount,
        effectiveFrom: new Date(req.body.effectiveFrom),
      },
    });
    res.json({ success: true, data: deduction, message: 'Deduction created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/payroll/deductions
 * List active deductions
 */
router.get('/deductions', requirePermission('PAYROLL_VIEW'), async (req, res) => {
  try {
    const deductions = await db.deduction.findMany({
      where: {
        tenantId: req.tenant.id,
        isActive: true,
      },
    });
    res.json({ success: true, data: deductions });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
