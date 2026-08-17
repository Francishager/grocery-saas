import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";

const router = Router();

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end, key: monthKey(start), label: start.toLocaleString("en", { month: "short" }) };
}

function money(value) {
  return Number(value || 0);
}

// HR management dashboard with real tenant/branch-scoped data
router.get("/dashboard", authenticateToken, requirePermission("canViewHR"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const today = startOfDay();
    const tomorrow = addDays(today, 1);
    const inSixtyDays = addDays(today, 60);
    const currentMonth = monthRange(0);
    const previousMonth = monthRange(-1);

    const employeeWhere = scopedWhere(scope, {});
    const activeEmployeeWhere = scopedWhere(scope, { status: { notIn: ["terminated", "inactive"] } });
    const payrollWhere = scopedWhere(scope, {});

    const activeEmployees = await prisma.employee.findMany({
      where: activeEmployeeWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        hireDate: true,
        terminationDate: true,
        basicSalary: true,
        department_text: true,
        department: { select: { name: true } },
      },
    });
    const activeEmployeeIds = activeEmployees.map((employee) => employee.id);

    const [
      totalEmployees,
      onLeaveEmployees,
      attendanceToday,
      shiftsToday,
      monthlyPayroll,
      payrollAwaitingApproval,
      salaryPayable,
      salaryPaidThisMonth,
      outstandingAdvances,
      overtimeAwaitingApproval,
      leaveAwaitingApproval,
      contractsExpiringSoon,
      employeesOnProbation,
      newHires,
      terminatedThisMonth,
      currentMonthPayroll,
      previousMonthPayroll,
    ] = await Promise.all([
      prisma.employee.count({ where: employeeWhere }),
      prisma.employee.count({ where: scopedWhere(scope, { status: "on_leave" }) }),
      prisma.attendanceRecord.findMany({
        where: {
          tenantId: scope.tenantId,
          employeeId: { in: activeEmployeeIds },
          attendanceDate: { gte: today, lt: tomorrow },
          isActive: true,
        },
      }),
      prisma.shiftAssignment.count({
        where: {
          tenantId: scope.tenantId,
          employeeId: { in: activeEmployeeIds },
          assignmentStartDate: { lte: today },
          OR: [{ assignmentEndDate: null }, { assignmentEndDate: { gte: today } }],
          status: "active",
          isActive: true,
        },
      }),
      prisma.payroll.aggregate({ where: { ...payrollWhere, period: currentMonth.key }, _sum: { grossSalary: true } }),
      prisma.payroll.count({ where: { ...payrollWhere, status: { in: ["draft", "calculated", "reviewed"] } } }),
      prisma.payroll.aggregate({
        where: { ...payrollWhere, status: { notIn: ["paid", "reversed"] } },
        _sum: { netSalary: true, paidAmount: true },
      }),
      prisma.payrollPayment.aggregate({
        where: {
          tenantId: scope.tenantId,
          paymentDate: { gte: currentMonth.start, lt: currentMonth.end },
          status: "completed",
          ...(scope.branchId ? { payroll: { branchId: scope.branchId } } : {}),
        },
        _sum: { amount: true },
      }),
      prisma.salaryAdvance.aggregate({
        where: { tenantId: scope.tenantId, employeeId: { in: activeEmployeeIds }, status: { notIn: ["fully_recovered", "cancelled"] } },
        _sum: { outstandingAmount: true },
      }),
      prisma.attendanceRecord.count({
        where: { tenantId: scope.tenantId, employeeId: { in: activeEmployeeIds }, overtimeMinutes: { gt: 0 }, approvedAt: null, isActive: true },
      }),
      prisma.leaveRequest.count({ where: { tenantId: scope.tenantId, employeeId: { in: activeEmployeeIds }, status: { in: ["pending_l1", "pending_l2"] } } }),
      prisma.employeeContract.count({
        where: {
          tenantId: scope.tenantId,
          employeeId: { in: activeEmployeeIds },
          status: { in: ["active", "expiring"] },
          endDate: { gte: today, lte: inSixtyDays },
        },
      }),
      prisma.employee.count({
        where: scopedWhere(scope, {
          OR: [{ status: "on_probation" }, { probationEndDate: { gte: today } }],
        }),
      }),
      prisma.employee.count({ where: scopedWhere(scope, { hireDate: { gte: currentMonth.start, lt: currentMonth.end } }) }),
      prisma.employee.count({ where: scopedWhere(scope, { terminationDate: { gte: currentMonth.start, lt: currentMonth.end } }) }),
      prisma.payroll.aggregate({ where: { ...payrollWhere, period: currentMonth.key }, _sum: { netSalary: true } }),
      prisma.payroll.aggregate({ where: { ...payrollWhere, period: previousMonth.key }, _sum: { netSalary: true } }),
    ]);

    const presentToday = attendanceToday.filter((record) => record.status === "present").length;
    const absentToday = attendanceToday.filter((record) => record.status === "absent").length;
    const lateToday = attendanceToday.filter((record) => money(record.lateMinutes) > 0 || record.status === "late").length;
    const salaryPayableAmount = money(salaryPayable._sum.netSalary) - money(salaryPayable._sum.paidAmount);

    const months = [-5, -4, -3, -2, -1, 0].map(monthRange);
    const payrollRows = await prisma.payroll.groupBy({
      by: ["period"],
      where: { ...payrollWhere, period: { in: months.map((month) => month.key) } },
      _sum: { netSalary: true },
    });
    const payrollByPeriod = new Map(payrollRows.map((row) => [row.period, money(row._sum.netSalary)]));

    const attendanceDays = Array.from({ length: 7 }, (_, index) => startOfDay(addDays(today, index - 6)));
    const attendanceRows = await prisma.attendanceRecord.findMany({
      where: {
        tenantId: scope.tenantId,
        employeeId: { in: activeEmployeeIds },
        attendanceDate: { gte: attendanceDays[0], lt: tomorrow },
        isActive: true,
      },
      select: { attendanceDate: true, status: true },
    });

    const departments = new Map();
    for (const employee of activeEmployees) {
      const department = employee.department?.name || employee.department_text || "Unassigned";
      const current = departments.get(department) || { department, employees: 0, payrollCost: 0 };
      current.employees += 1;
      current.payrollCost += money(employee.basicSalary);
      departments.set(department, current);
    }

    const currentPayrollTotal = money(currentMonthPayroll._sum.netSalary);
    const previousPayrollTotal = money(previousMonthPayroll._sum.netSalary);
    const payrollChange = previousPayrollTotal > 0 ? ((currentPayrollTotal - previousPayrollTotal) / previousPayrollTotal) * 100 : 0;

    res.json({
      stats: {
        totalEmployees,
        activeEmployees: activeEmployees.length,
        employeesOnLeave: onLeaveEmployees,
        employeesAbsentToday: absentToday,
        employeesPresentToday: presentToday,
        lateEmployees: lateToday,
        employeesOnShift: shiftsToday,
        monthlyPayroll: money(monthlyPayroll._sum.grossSalary),
        payrollAwaitingApproval,
        salaryPayable: Math.max(0, salaryPayableAmount),
        salaryPaidThisMonth: money(salaryPaidThisMonth._sum.amount),
        outstandingSalaryAdvances: money(outstandingAdvances._sum.outstandingAmount),
        outstandingEmployeeLoans: 0,
        overtimeAwaitingApproval,
        leaveRequestsAwaitingApproval: leaveAwaitingApproval,
        expenseClaimsAwaitingApproval: 0,
        contractsExpiringSoon,
        employeesOnProbation,
        upcomingBirthdays: 0,
        newHires,
        employeeTurnover: totalEmployees > 0 ? Math.round((terminatedThisMonth / totalEmployees) * 10000) / 100 : 0,
      },
      charts: {
        headcount: months.map((month) => ({
          label: month.label,
          value: activeEmployees.filter((employee) => new Date(employee.hireDate) < month.end && (!employee.terminationDate || new Date(employee.terminationDate) >= month.end)).length,
        })),
        payrollTrend: months.map((month) => ({ label: month.label, value: payrollByPeriod.get(month.key) || 0 })),
        attendanceTrend: attendanceDays.map((day) => {
          const next = addDays(day, 1);
          const rows = attendanceRows.filter((record) => record.attendanceDate >= day && record.attendanceDate < next);
          return {
            label: day.toLocaleString("en", { weekday: "short" }),
            present: rows.filter((record) => record.status === "present").length,
            absent: rows.filter((record) => record.status === "absent").length,
          };
        }),
        departmentHeadcount: [...departments.values()].map(({ department, employees }) => ({ label: department, value: employees })),
        departmentPayrollCost: [...departments.values()].map(({ department, payrollCost }) => ({ label: department, value: payrollCost })),
        leaveUtilization: [{ label: "Pending", value: leaveAwaitingApproval }, { label: "On Leave", value: onLeaveEmployees }],
        overtime: [{ label: "Awaiting Approval", value: overtimeAwaitingApproval }],
        turnover: [{ label: currentMonth.label, value: terminatedThisMonth }],
      },
      insights: [
        `Payroll ${payrollChange >= 0 ? "increased" : "decreased"} by ${Math.abs(payrollChange).toFixed(1)}% compared with last month.`,
        `${contractsExpiringSoon} employees have contracts expiring within 60 days.`,
        `${money(outstandingAdvances._sum.outstandingAmount).toLocaleString()} remains outstanding in salary advances.`,
      ],
    });
  } catch (err) {
    handleBranchError(res, err, "Failed to load HR dashboard");
  }
});

// List employees
router.get("/", authenticateToken, requirePermission("canViewHR"), async (req, res) => {
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
router.post("/", authenticateToken, requirePermission("canCreateHREmployee"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { firstName, lastName, email, phone, position, department, salary, basicSalary, payFrequency, hireDate, branchId, address } = req.body;
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
        department_text: department || null,
        jobTitle: position || null,
        basicSalary: Number(basicSalary ?? salary ?? 0),
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
router.put("/:id", authenticateToken, requirePermission("canEditHREmployee"), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, position, department, salary, basicSalary, payFrequency, branchId, address, status, terminationDate } = req.body;
    const emp = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        firstName, lastName, email, phone, position,
        department_text: department,
        jobTitle: position,
        basicSalary: salary !== undefined || basicSalary !== undefined ? Number(basicSalary ?? salary ?? 0) : undefined,
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
router.delete("/:id", authenticateToken, requirePermission("canDeleteHREmployee"), async (req, res) => {
  try {
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ message: "Employee deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete employee" });
  }
});

// Attendance
router.get("/:id/attendance", authenticateToken, requirePermission("canViewHRAttendance"), async (req, res) => {
  try {
    const records = await prisma.attendanceRecord.findMany({
      where: { employeeId: req.params.id },
      orderBy: { attendanceDate: "desc" },
      take: 30,
    });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

router.post("/:id/attendance", authenticateToken, requirePermission("canManageHRAttendance"), async (req, res) => {
  try {
    const { date, checkIn, checkOut, status, notes, method, location } = req.body;
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const att = await prisma.attendanceRecord.create({
      data: {
        tenantId,
        employeeId: req.params.id,
        attendanceDate: date ? new Date(date) : startOfDay(),
        checkInTime: checkIn ? new Date(checkIn) : null,
        checkOutTime: checkOut ? new Date(checkOut) : null,
        status: status || "present",
        method: method || "MANUAL",
        location,
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
router.get("/leave-requests", authenticateToken, requirePermission("canViewHRLeave"), async (req, res) => {
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

router.post("/:id/leave", authenticateToken, requirePermission("canRequestHRLeave"), async (req, res) => {
  try {
    const { leaveType, leaveTypeId, startDate, endDate, days, reason } = req.body;
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const type = leaveTypeId
      ? await prisma.leaveType.findFirst({ where: { id: leaveTypeId, tenantId } })
      : await prisma.leaveType.findFirst({
          where: {
            tenantId,
            isActive: true,
            ...(leaveType ? { OR: [{ code: leaveType }, { name: { equals: leaveType, mode: "insensitive" } }] } : {}),
          },
          orderBy: { createdAt: "asc" },
        });

    if (!type) return res.status(400).json({ error: "Valid leave type is required" });

    const from = new Date(startDate);
    const to = new Date(endDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: "Valid startDate and endDate are required" });
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: req.params.id,
        leaveTypeId: type.id,
        leaveTypeName: type.name,
        startDate: from,
        endDate: to,
        totalDays: Number(days || Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1)),
        reason: reason || "",
      },
    });
    res.status(201).json(leave);
  } catch (err) {
    res.status(500).json({ error: "Failed to create leave request" });
  }
});

router.put("/leave-requests/:id", authenticateToken, requirePermission("canApproveHRLeave"), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const isDecision = status === "approved" || status === "rejected";
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        approverLevel1Id: isDecision ? req.user.id : undefined,
        approverLevel1Status: isDecision ? status : undefined,
        approverLevel1Date: isDecision ? new Date() : undefined,
        approverLevel1Notes: isDecision ? notes || null : undefined,
      },
    });
    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: "Failed to update leave request" });
  }
});

// Payroll
router.get("/payroll", authenticateToken, requirePermission("canViewHRPayroll"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { period } = req.query;
    const where = { tenantId };
    if (period) where.period = period;
    const records = await prisma.payroll.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, position: true, basicSalary: true } } },
      orderBy: { period: "desc" },
    });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payroll" });
  }
});

router.post("/payroll/run", authenticateToken, requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { period, deductions = 0, bonus = 0 } = req.body;
    if (!period) return res.status(400).json({ error: "period required (e.g. 2025-01)" });

    const employees = await prisma.employee.findMany({ where: { tenantId, status: "active" } });
    const records = [];

    for (const emp of employees) {
      const existing = await prisma.payroll.findUnique({
        where: { employeeId_period: { employeeId: emp.id, period } },
      });
      if (existing) continue;

      const gross = Number(emp.basicSalary || 0) + Number(bonus || 0);
      const totalDeductions = Number(deductions || 0);
      const payrollNo = `PAYROLL-${period}-${emp.id.slice(-6).toUpperCase()}`;
      const net = Math.max(0, gross - totalDeductions);
      const rec = await prisma.payroll.create({
        data: {
          tenantId,
          branchId: emp.branchId || null,
          payrollNo,
          employeeId: emp.id,
          period,
          basicSalary: Number(emp.basicSalary || 0),
          grossSalary: gross,
          totalDeductions,
          bonus: Number(bonus || 0),
          netSalary: net,
          status: "draft",
          createdBy: req.user.id,
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

router.put("/payroll/:id/pay", authenticateToken, requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const current = await prisma.payroll.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, netSalary: true },
    });
    if (!current) return res.status(404).json({ error: "Payroll record not found" });

    const rec = await prisma.payroll.update({
      where: { id: req.params.id },
      data: { status: "paid", paidAmount: current.netSalary, paymentDate: new Date() },
    });
    res.json(rec);
  } catch (err) {
    res.status(500).json({ error: "Failed to mark payroll as paid" });
  }
});

export default router;
