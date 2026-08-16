/**
 * HR Admin Routes
 * Handles HR administration (employee management, dashboard, audit logs)
 */

const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const hrAccountingService = require("../services/hrAccountingService");
const { requireAuth, requireTenant } = require("../middleware/auth");

const prisma = new PrismaClient();

// Check authentication and tenant
router.use(requireAuth, requireTenant);

/**
 * GET /api/hr/dashboard
 * Get HR dashboard with key metrics
 */
router.get("/dashboard", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { branchId } = req.query;

    // Total employees
    const totalEmployees = await prisma.employee.count({
      where: {
        tenantId,
        status: "active",
        ...(branchId && { branchId }),
      },
    });

    // Payroll metrics
    const currentPeriod = new Date().toISOString().split("T")[0].substring(0, 7); // YYYY-MM
    const payrolls = await prisma.payroll.findMany({
      where: {
        tenantId,
        period: currentPeriod,
        ...(branchId && { branchId }),
      },
    });

    const payrollPending = payrolls.filter((p) => p.status === "draft").length;
    const payrollApproved = payrolls.filter((p) => p.status === "approved")
      .length;
    const salaryPayable = payrolls
      .filter((p) => ["posted", "partially_paid"].includes(p.status))
      .reduce((sum, p) => sum + (p.netSalary - p.paidAmount), 0);
    const salaryPaid = payrolls
      .filter((p) => ["partially_paid", "paid"].includes(p.status))
      .reduce((sum, p) => sum + p.paidAmount, 0);

    // Salary advances
    const advances = await prisma.salaryAdvance.findMany({
      where: {
        tenantId,
        status: { in: ["outstanding", "partially_recovered"] },
        ...(branchId && {
          employee: { branchId },
        }),
      },
    });

    const totalAdvancesIssued = advances.reduce((sum, a) => sum + a.amount, 0);
    const totalAdvancesRecovered = advances.reduce(
      (sum, a) => sum + a.totalRecovered,
      0
    );
    const totalAdvancesOutstanding = advances.reduce(
      (sum, a) => sum + a.outstandingAmount,
      0
    );
    const employeesWithAdvances = new Set(
      advances.map((a) => a.employeeId)
    ).size;

    // Issued this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const advancesThisMonth = await prisma.salaryAdvance.count({
      where: {
        tenantId,
        createdAt: { gte: monthStart },
        ...(branchId && {
          employee: { branchId },
        }),
      },
    });

    res.json({
      employees: {
        total: totalEmployees,
      },
      payroll: {
        period: currentPeriod,
        total: payrolls.length,
        pending: payrollPending,
        approved: payrollApproved,
        salaryPayable,
        salaryPaid,
      },
      salaryAdvances: {
        totalIssued: totalAdvancesIssued,
        totalRecovered: totalAdvancesRecovered,
        totalOutstanding: totalAdvancesOutstanding,
        activeAdvances: advances.length,
        employeesWithAdvances,
        issuedThisMonth: advancesThisMonth,
      },
    });
  } catch (error) {
    console.error("Error fetching HR dashboard:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/employees
 * Get employees list with optional filters
 */
router.get("/employees", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { branchId, status } = req.query;

    const employees = await prisma.employee.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
        ...(status && { status }),
      },
      include: {
        salaryConfig: true,
        salaryAdvances: {
          where: {
            status: { in: ["outstanding", "partially_recovered"] },
          },
        },
      },
      orderBy: { firstName: "asc" },
    });

    res.json({
      employees,
      total: employees.length,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/employees/:id
 * Get employee details with salary and advance info
 */
router.get("/employees/:id", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const employee = await prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        salaryConfig: true,
        salaryAdvances: true,
        payrollRecords: {
          take: 12, // Last 12 months
          orderBy: { period: "desc" },
        },
      },
    });

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/hr/employees/:id/salary-config
 * Update employee salary configuration
 */
router.put("/employees/:id/salary-config", async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;
    const {
      basicSalary,
      transportAllowance,
      houseAllowance,
      mobileAllowance,
      otherAllowances,
      paye,
      socialSecurityTax,
      healthInsurance,
      otherDeductions,
    } = req.body;

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id, tenantId },
    });

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // Calculate totals
    const totalAllowances =
      (transportAllowance || 0) +
      (houseAllowance || 0) +
      (mobileAllowance || 0) +
      (otherAllowances || 0);
    const grossSalary = (basicSalary || 0) + totalAllowances;
    const totalDeductions =
      (paye || 0) +
      (socialSecurityTax || 0) +
      (healthInsurance || 0) +
      (otherDeductions || 0);

    const config = await prisma.employeeSalaryConfig.upsert({
      where: { employeeId: id },
      create: {
        tenantId,
        employeeId: id,
        basicSalary: basicSalary || 0,
        transportAllowance: transportAllowance || 0,
        houseAllowance: houseAllowance || 0,
        mobileAllowance: mobileAllowance || 0,
        otherAllowances: otherAllowances || 0,
        totalAllowances,
        grossSalary,
        paye: paye || 0,
        socialSecurityTax: socialSecurityTax || 0,
        healthInsurance: healthInsurance || 0,
        otherDeductions: otherDeductions || 0,
        totalDeductions,
      },
      update: {
        basicSalary: basicSalary || 0,
        transportAllowance: transportAllowance || 0,
        houseAllowance: houseAllowance || 0,
        mobileAllowance: mobileAllowance || 0,
        otherAllowances: otherAllowances || 0,
        totalAllowances,
        grossSalary,
        paye: paye || 0,
        socialSecurityTax: socialSecurityTax || 0,
        healthInsurance: healthInsurance || 0,
        otherDeductions: otherDeductions || 0,
        totalDeductions,
      },
    });

    // Create audit log
    await hrAccountingService.createAuditLog({
      tenantId,
      recordType: "employee_salary_config",
      recordId: config.id,
      employeeId: id,
      action: "updated",
      description: `Salary configuration updated. Basic: ${basicSalary}, Gross: ${grossSalary}`,
      userId,
      branchId: employee.branchId,
    });

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("Error updating salary config:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/audit-logs
 * Get HR audit trail with filters
 */
router.get("/audit-logs", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { recordType, recordId, employeeId, action, limit = 100 } = req.query;

    const logs = await prisma.hRAuditLog.findMany({
      where: {
        tenantId,
        ...(recordType && { recordType }),
        ...(recordId && { recordId }),
        ...(employeeId && { employeeId }),
        ...(action && { action }),
      },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json({
      logs,
      total: logs.length,
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/audit-logs/:recordType/:recordId
 * Get audit trail for specific record
 */
router.get("/audit-logs/:recordType/:recordId", async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { recordType, recordId } = req.params;

    const trail = await hrAccountingService.getAuditTrail(
      tenantId,
      recordType,
      recordId
    );

    res.json({
      trail,
      total: trail.length,
    });
  } catch (error) {
    console.error("Error fetching audit trail:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
