/**
 * Salary Advance Routes
 * Handles salary advance operations with accounting integration
 */

const express = require("express");
const router = express.Router();
const salaryAdvanceService = require("../services/salaryAdvanceService");
const { requireAuth, requireTenant } = require("../middleware/auth");

// Check HR configuration and permissions
router.use(requireAuth, requireTenant);

/**
 * POST /api/hr/salary-advances
 * Issue a new salary advance
 */
router.post("/", async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const {
      employeeId,
      amount,
      paymentAccountId,
      date,
      reason,
      recoveryMethod,
      recoveryPlan,
      recoveryAmount,
    } = req.body;

    // Validation
    if (!employeeId || !amount || amount <= 0 || !paymentAccountId) {
      return res.status(400).json({
        error: "Missing required fields: employeeId, amount, paymentAccountId",
      });
    }

    const result = await salaryAdvanceService.issueSalaryAdvance({
      tenantId,
      employeeId,
      amount,
      paymentAccountId,
      date: date || new Date(),
      reason,
      recoveryMethod,
      recoveryPlan,
      recoveryAmount,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        missingAccounts: result.missingAccounts,
      });
    }

    res.status(201).json({
      success: true,
      advance: result.advance,
      journalEntry: result.journalEntry,
    });
  } catch (error) {
    console.error("Error issuing salary advance:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/salary-advances/:id
 * Get salary advance details
 */
router.get("/:id", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const advance = await salaryAdvanceService.getSalaryAdvance(tenantId, id);

    if (!advance) {
      return res.status(404).json({ error: "Salary advance not found" });
    }

    res.json(advance);
  } catch (error) {
    console.error("Error fetching salary advance:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/salary-advances/employee/:employeeId
 * Get all salary advances for an employee
 */
router.get("/employee/:employeeId", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;

    const advances =
      await salaryAdvanceService.getEmployeeSalaryAdvances(
        tenantId,
        employeeId
      );

    res.json({
      advances,
      total: advances.length,
    });
  } catch (error) {
    console.error("Error fetching employee salary advances:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/salary-advances
 * Get outstanding salary advances (with optional branch filter)
 */
router.get("/", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { branchId } = req.query;

    const summary =
      await salaryAdvanceService.getSalaryAdvancesSummary(
        tenantId,
        branchId
      );

    res.json({
      summary,
      advances: summary.advances,
    });
  } catch (error) {
    console.error("Error fetching salary advances summary:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hr/salary-advances/:id/direct-repayment
 * Record direct salary advance repayment
 */
router.post("/:id/direct-repayment", async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;
    const { amount, paymentAccountId, date, notes } = req.body;

    if (!amount || amount <= 0 || !paymentAccountId) {
      return res.status(400).json({ error: "Missing required fields: amount, paymentAccountId" });
    }

    const result = await salaryAdvanceService.recordDirectRepayment({
      tenantId,
      salaryAdvanceId: id,
      amount,
      paymentAccountId,
      date: date || new Date(),
      notes,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      recovery: result.recovery,
      advance: result.advance,
    });
  } catch (error) {
    console.error("Error recording direct repayment:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hr/salary-advances/:id/cancel
 * Cancel salary advance
 */
router.post("/:id/cancel", async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;
    const { reason, date } = req.body;

    if (!reason) {
      return res
        .status(400)
        .json({ error: "Cancellation reason is required" });
    }

    const result = await salaryAdvanceService.cancelSalaryAdvance({
      tenantId,
      salaryAdvanceId: id,
      reason,
      userId,
      date: date || new Date(),
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      advance: result.advance,
    });
  } catch (error) {
    console.error("Error cancelling salary advance:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
