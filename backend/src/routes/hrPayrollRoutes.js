/**
 * Payroll Routes
 * Handles payroll processing with accounting integration
 */

import { Router } from "express";
import payrollService from "../services/payrollService.js";
import { authenticateToken, requirePermission, requireTenant } from "../../middleware/auth.js";

const router = Router();
const tenantIdFromRequest = (req) => req.user.tenantId || req.user.tenant_id || req.user.business_id || req.tenantId;
const userIdFromRequest = (req) => req.user.id || req.user.userId;

// Check authentication and tenant
router.use(authenticateToken, requireTenant);

/**
 * POST /api/hr/payroll
 * Create a new payroll record
 */
router.post("/", requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const userId = userIdFromRequest(req);
    const {
      employeeId,
      period,
      basicSalary,
      allowances,
      bonus,
      overtime,
      otherEarnings,
      paye,
      socialSecurityTax,
      healthInsurance,
      otherDeductions,
      salaryAdvanceRecovery,
      notes,
    } = req.body;

    if (!employeeId || !period) {
      return res.status(400).json({
        error: "Missing required fields: employeeId, period (YYYY-MM)",
      });
    }

    const result = await payrollService.createPayroll({
      tenantId,
      employeeId,
      period,
      basicSalary: basicSalary || 0,
      allowances: allowances || 0,
      bonus: bonus || 0,
      overtime: overtime || 0,
      otherEarnings: otherEarnings || 0,
      paye: paye || 0,
      socialSecurityTax: socialSecurityTax || 0,
      healthInsurance: healthInsurance || 0,
      otherDeductions: otherDeductions || 0,
      salaryAdvanceRecovery: salaryAdvanceRecovery || 0,
      notes,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      payroll: result.payroll,
    });
  } catch (error) {
    console.error("Error creating payroll:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/payroll/:id
 * Get payroll details
 */
router.get("/:id", requirePermission("canViewHRPayroll"), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id } = req.params;

    const payroll = await payrollService.getPayroll(tenantId, id);

    if (!payroll) {
      return res.status(404).json({ error: "Payroll not found" });
    }

    res.json(payroll);
  } catch (error) {
    console.error("Error fetching payroll:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/payroll
 * Get payrolls for a period (with optional branch filter)
 */
router.get("/", requirePermission("canViewHRPayroll"), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { period, branchId } = req.query;

    if (!period) {
      return res.status(400).json({
        error: "Period query parameter is required (YYYY-MM)",
      });
    }

    const { summary, payrolls } =
      await payrollService.getPayrollSummary(
        tenantId,
        period,
        branchId
      );

    res.json({
      summary,
      payrolls,
    });
  } catch (error) {
    console.error("Error fetching payroll summary:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hr/payroll/:id/approve
 * Approve payroll (change status from draft to approved)
 */
router.post("/:id/approve", requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const userId = userIdFromRequest(req);
    const { id } = req.params;

    const result = await payrollService.approvePayroll({
      tenantId,
      payrollId: id,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      payroll: result.payroll,
    });
  } catch (error) {
    console.error("Error approving payroll:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hr/payroll/:id/post
 * Post payroll to accounting
 * Creates journal entries and processes advance recoveries
 */
router.post("/:id/post", requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const userId = userIdFromRequest(req);
    const { id } = req.params;

    const result = await payrollService.postPayroll({
      tenantId,
      payrollId: id,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      payroll: result.payroll,
      journalEntry: result.journalEntry,
    });
  } catch (error) {
    console.error("Error posting payroll:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hr/payroll/:id/pay
 * Record salary payment
 */
router.post("/:id/pay", requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const userId = userIdFromRequest(req);
    const { id } = req.params;
    const { amount, paymentAccountId, paymentMethod, referenceNo } = req.body;

    if (!amount || amount <= 0 || !paymentAccountId) {
      return res.status(400).json({
        error:
          "Missing required fields: amount (positive), paymentAccountId",
      });
    }

    const result = await payrollService.paySalary({
      tenantId,
      payrollId: id,
      amount,
      paymentAccountId,
      paymentMethod: paymentMethod || "cash",
      referenceNo,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      payment: result.payment,
      payroll: result.payroll,
      journalEntry: result.journalEntry,
    });
  } catch (error) {
    console.error("Error paying salary:", error);
    res.status(error.statusCode || error.status || 500).json({ error: error.message });
  }
});

export default router;
