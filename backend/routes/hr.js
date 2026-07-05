import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";

const router = Router();

// List employees
router.get("/", authenticateToken, requirePermission("canViewStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const employees = await prisma.employee.findMany({
      where: scopedWhere(scope, {}),
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(employees);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch employees");
  }
});

// Create employee
router.post("/", authenticateToken, requirePermission("canCreateStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { firstName, lastName, email, phone, position, department, salary, payFrequency, hireDate, branchId, address } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });

    const emp = await prisma.employee.create({
      data: {
        tenantId,
        branchId: branchId || null,
        firstName,
        lastName,
        email,
        phone,
        position,
        department,
        salary: Number(salary || 0),
        payFrequency: payFrequency || "monthly",
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        address,
      },
    });
    res.status(201).json(emp);
  } catch (err) {
    res.status(500).json({ error: "Failed to create employee" });
  }
});

// Update employee
router.put("/:id", authenticateToken, requirePermission("canEditStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, position, department, salary, payFrequency, branchId, address, status, terminationDate } = req.body;
    const emp = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        firstName, lastName, email, phone, position, department,
        salary: salary !== undefined ? Number(salary) : undefined,
        payFrequency, branchId, address, status,
        terminationDate: terminationDate ? new Date(terminationDate) : undefined,
      },
    });
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: "Failed to update employee" });
  }
});

// Delete employee
router.delete("/:id", authenticateToken, requirePermission("canDeleteStaff"), requireFeature("hr"), async (req, res) => {
  try {
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ message: "Employee deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete employee" });
  }
});

// Attendance
router.get("/:id/attendance", authenticateToken, requirePermission("canViewStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const records = await prisma.attendance.findMany({
      where: { employeeId: req.params.id },
      orderBy: { date: "desc" },
      take: 30,
    });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

router.post("/:id/attendance", authenticateToken, requirePermission("canEditStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const { date, checkIn, checkOut, status, notes } = req.body;
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const att = await prisma.attendance.create({
      data: {
        tenantId,
        employeeId: req.params.id,
        date: date ? new Date(date) : new Date(),
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        status: status || "present",
        notes,
      },
    });
    res.status(201).json(att);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Attendance already recorded for this date" });
    res.status(500).json({ error: "Failed to record attendance" });
  }
});

// Leave requests
router.get("/leave-requests", authenticateToken, requirePermission("canViewStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const leaves = await prisma.leaveRequest.findMany({
      where: { tenantId },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leave requests" });
  }
});

router.post("/:id/leave", authenticateToken, requirePermission("canCreateStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const { leaveType, startDate, endDate, days, reason } = req.body;
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const leave = await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: req.params.id,
        leaveType: leaveType || "annual",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days: Number(days || 1),
        reason,
      },
    });
    res.status(201).json(leave);
  } catch (err) {
    res.status(500).json({ error: "Failed to create leave request" });
  }
});

router.put("/leave-requests/:id", authenticateToken, requirePermission("canEditStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const { status } = req.body;
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        approvedBy: req.user.id,
        approvedAt: status === "approved" || status === "rejected" ? new Date() : undefined,
      },
    });
    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: "Failed to update leave request" });
  }
});

// Payroll
router.get("/payroll", authenticateToken, requirePermission("canViewStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { period } = req.query;
    const where = { tenantId };
    if (period) where.period = period;
    const records = await prisma.payrollRecord.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, position: true, salary: true } } },
      orderBy: { period: "desc" },
    });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payroll" });
  }
});

router.post("/payroll/run", authenticateToken, requirePermission("canEditStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { period, deductions = 0, bonus = 0 } = req.body;
    if (!period) return res.status(400).json({ error: "period required (e.g. 2025-01)" });

    const employees = await prisma.employee.findMany({ where: { tenantId, status: "active" } });
    const records = [];

    for (const emp of employees) {
      const existing = await prisma.payrollRecord.findUnique({
        where: { employeeId_period: { employeeId: emp.id, period } },
      });
      if (existing) continue;

      const gross = emp.salary;
      const net = Math.max(0, gross + Number(bonus) - Number(deductions));
      const rec = await prisma.payrollRecord.create({
        data: {
          tenantId,
          employeeId: emp.id,
          period,
          grossSalary: gross,
          deductions: Number(deductions),
          bonus: Number(bonus),
          netSalary: net,
          status: "pending",
        },
      });
      records.push(rec);
    }

    res.status(201).json({ message: `Payroll run for ${period}`, count: records.length, records });
  } catch (err) {
    console.error("Payroll run error:", err);
    res.status(500).json({ error: "Failed to run payroll" });
  }
});

router.put("/payroll/:id/pay", authenticateToken, requirePermission("canEditStaff"), requireFeature("hr"), async (req, res) => {
  try {
    const rec = await prisma.payrollRecord.update({
      where: { id: req.params.id },
      data: { status: "paid", paidAt: new Date() },
    });
    res.json(rec);
  } catch (err) {
    res.status(500).json({ error: "Failed to mark payroll as paid" });
  }
});

export default router;
