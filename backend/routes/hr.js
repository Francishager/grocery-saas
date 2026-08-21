import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";
import { nextEmployeeNumber } from "../src/utils/employeeNumber.js";

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

const DEBIT_NORMAL_ACCOUNT_TYPES = new Set(["asset", "expense", "expenses"]);
const HR_ACCOUNT_LABELS = {
  salaryExpenseAccountId: "Staff Salaries & Wages expense account",
  salaryPayableAccountId: "Salaries Payable liability account",
  salaryAdvanceAccountId: "Employee Advances/Loans asset account",
  payeTaxAccountId: "PAYE Tax liability account",
  socialSecurityAccountId: "Social Security liability account",
};

function isDebitNormalAccount(account) {
  return DEBIT_NORMAL_ACCOUNT_TYPES.has(String(account?.type || "").trim().toLowerCase());
}

function journalLineBalanceDelta(account, debit, credit) {
  return isDebitNormalAccount(account) ? debit - credit : credit - debit;
}

function hrAccountingSetupError(missing = []) {
  const required = missing.length ? missing.join(", ") : "Staff Salaries & Wages, Salaries Payable, and Employee Advances/Loans";
  return `HR accounting accounts are not configured. Create the required Chart of Accounts first and map them in HR > HR Accounting before posting. Missing: ${required}.`;
}

async function getRequiredHRAccounts(tx, tenantId, requiredFields) {
  const config = await tx.hRAccountingConfig.findUnique({ where: { tenantId } });
  const missing = [];

  for (const field of requiredFields) {
    if (!config?.[field]) missing.push(HR_ACCOUNT_LABELS[field] || field);
  }

  if (!config || !config.isConfigured || missing.length) {
    const error = new Error(hrAccountingSetupError(missing));
    error.statusCode = 400;
    throw error;
  }

  const accountIds = requiredFields.map((field) => config[field]).filter(Boolean);
  const accounts = await tx.account.findMany({
    where: { tenantId, id: { in: accountIds }, isActive: true },
  });
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const inactiveOrMissing = requiredFields
    .filter((field) => config[field] && !accountsById.has(config[field]))
    .map((field) => HR_ACCOUNT_LABELS[field] || field);

  if (inactiveOrMissing.length) {
    const error = new Error(hrAccountingSetupError(inactiveOrMissing));
    error.statusCode = 400;
    throw error;
  }

  return { config, accountsById };
}

async function nextJournalEntryNo(tx, tenantId) {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
  const lastEntry = await tx.journalEntry.findFirst({
    where: { tenantId, entryNo: { startsWith: `JE-${dateStr}-` } },
    orderBy: { entryNo: "desc" },
  });
  const lastSequence = Number(String(lastEntry?.entryNo || "").split("-")[2] || 0);
  return `JE-${dateStr}-${String(lastSequence + 1).padStart(3, "0")}`;
}

function payrollPostingLines(payroll, config, employeeName) {
  const grossSalary = money(payroll.grossSalary);
  const salaryAdvanceRecovery = money(payroll.salaryAdvanceRecovery);
  const paye = money(payroll.paye);
  const socialSecurityTax = money(payroll.socialSecurityTax);
  const healthInsurance = money(payroll.healthInsurance);
  const otherDeductions = money(payroll.otherDeductions);
  const recordedDeductions = money(payroll.totalDeductions);
  const itemizedDeductions = salaryAdvanceRecovery + paye + socialSecurityTax + healthInsurance + otherDeductions;
  const unclassifiedDeductions = Math.max(0, recordedDeductions - itemizedDeductions);
  const salaryPayableAmount = grossSalary - salaryAdvanceRecovery - paye - socialSecurityTax;

  if (salaryPayableAmount < -0.01) {
    const error = new Error("Payroll deductions exceed gross salary. Review the payroll before posting to accounting.");
    error.statusCode = 400;
    throw error;
  }

  return [
    {
      accountId: config.salaryExpenseAccountId,
      debit: grossSalary,
      credit: 0,
      description: `Staff salary and wages - ${employeeName}`,
    },
    {
      accountId: config.salaryPayableAccountId,
      debit: 0,
      credit: Math.max(0, salaryPayableAmount),
      description:
        healthInsurance + otherDeductions + unclassifiedDeductions > 0
          ? `Salary payable and other payroll deductions - ${employeeName}`
          : `Salary payable - ${employeeName}`,
    },
    paye > 0 && {
      accountId: config.payeTaxAccountId,
      debit: 0,
      credit: paye,
      description: `PAYE tax payable - ${employeeName}`,
    },
    socialSecurityTax > 0 && {
      accountId: config.socialSecurityAccountId,
      debit: 0,
      credit: socialSecurityTax,
      description: `Social security payable - ${employeeName}`,
    },
    salaryAdvanceRecovery > 0 && {
      accountId: config.salaryAdvanceAccountId,
      debit: 0,
      credit: salaryAdvanceRecovery,
      description: `Employee advance/loan recovery - ${employeeName}`,
    },
  ].filter(Boolean);
}

async function applySalaryAdvanceRecoveries(tx, { tenantId, payroll }) {
  const recoveryTotal = money(payroll.salaryAdvanceRecovery);
  if (recoveryTotal <= 0) return [];

  const advances = await tx.salaryAdvance.findMany({
    where: {
      tenantId,
      employeeId: payroll.employeeId,
      status: { in: ["outstanding", "partially_recovered"] },
      outstandingAmount: { gt: 0 },
    },
    orderBy: { date: "asc" },
  });

  const outstanding = advances.reduce((sum, advance) => sum + money(advance.outstandingAmount), 0);
  if (recoveryTotal > outstanding + 0.01) {
    const error = new Error(`Cannot recover ${recoveryTotal.toFixed(2)} from salary advances. Outstanding amount is ${outstanding.toFixed(2)}.`);
    error.statusCode = 400;
    throw error;
  }

  let remaining = recoveryTotal;
  const recoveries = [];

  for (const advance of advances) {
    if (remaining <= 0.01) break;

    const recoveryAmount = Math.min(remaining, money(advance.outstandingAmount));
    const newTotalRecovered = money(advance.totalRecovered) + recoveryAmount;
    const newOutstandingAmount = Math.max(0, money(advance.amount) - newTotalRecovered);

    const recovery = await tx.salaryAdvanceRecovery.create({
      data: {
        tenantId,
        salaryAdvanceId: advance.id,
        payrollId: payroll.id,
        recoveryType: "payroll",
        recoveryDate: new Date(),
        amount: recoveryAmount,
        notes: `Recovered through payroll ${payroll.payrollNo}`,
      },
    });

    await tx.salaryAdvance.update({
      where: { id: advance.id },
      data: {
        totalRecovered: newTotalRecovered,
        outstandingAmount: newOutstandingAmount,
        status: newOutstandingAmount <= 0.01 ? "fully_recovered" : "partially_recovered",
      },
    });

    recoveries.push(recovery);
    remaining -= recoveryAmount;
  }

  await tx.employee.update({
    where: { id: payroll.employeeId },
    data: {
      salaryAdvanceBalance: {
        decrement: recoveryTotal,
      },
    },
  });

  return recoveries;
}

async function createPostedJournal(tx, { tenantId, branchId, userId, description, reference, sourceType, sourceId, lines }) {
  const activeLines = lines.filter((line) => money(line.debit) > 0 || money(line.credit) > 0);
  if (!activeLines.length) throw new Error("Journal lines are required");

  if (sourceType && sourceId) {
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, sourceType, sourceId },
      include: { lines: true },
    });
    if (existing) return existing;
  }

  const totalDebit = activeLines.reduce((sum, line) => sum + money(line.debit), 0);
  const totalCredit = activeLines.reduce((sum, line) => sum + money(line.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    const error = new Error("HR accounting journal is not balanced. Check salary, advance, and loan account mappings first.");
    error.statusCode = 400;
    throw error;
  }

  const accounts = await tx.account.findMany({
    where: { tenantId, id: { in: activeLines.map((line) => line.accountId) }, isActive: true },
  });
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const missingAccount = activeLines.find((line) => !accountsById.has(line.accountId));
  if (missingAccount) {
    const error = new Error("One or more HR accounting accounts are missing or inactive. Create/configure the accounts first in HR > HR Accounting.");
    error.statusCode = 400;
    throw error;
  }

  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNo: await nextJournalEntryNo(tx, tenantId),
      tenantId,
      branchId: branchId || null,
      date: new Date(),
      description,
      reference,
      status: "posted",
      userId,
      sourceType,
      sourceId,
      lines: {
        create: activeLines.map((line) => ({
          accountId: line.accountId,
          debit: money(line.debit),
          credit: money(line.credit),
          description: line.description,
        })),
      },
    },
    include: { lines: true },
  });

  for (const line of activeLines) {
    const account = accountsById.get(line.accountId);
    const delta = journalLineBalanceDelta(account, money(line.debit), money(line.credit));
    await tx.account.update({
      where: { id: line.accountId },
      data: { balance: { increment: delta } },
    });
  }

  return journalEntry;
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
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    const { firstName, lastName, email, phone, position, department, salary, basicSalary, payFrequency, hireDate, branchId, address } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });

    const emp = await prisma.employee.create({
      data: {
        tenantId,
        branchId: branchId || null,
        employeeNumber: await nextEmployeeNumber(prisma, tenantId, { firstName, lastName }),
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
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
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
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
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
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
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
    const {
      period,
      deductions = 0,
      bonus = 0,
      paye = 0,
      socialSecurityTax = 0,
      healthInsurance = 0,
      otherDeductions,
      salaryAdvanceRecovery = 0,
    } = req.body;
    if (!period) return res.status(400).json({ error: "period required (e.g. 2025-01)" });

    const employees = await prisma.employee.findMany({ where: { tenantId, status: "active" } });
    const records = [];
    const otherDeductionAmount = otherDeductions === undefined ? money(deductions) : money(otherDeductions);
    const totalDeductions =
      money(paye) +
      money(socialSecurityTax) +
      money(healthInsurance) +
      otherDeductionAmount +
      money(salaryAdvanceRecovery);

    for (const emp of employees) {
      const existing = await prisma.payroll.findUnique({
        where: { employeeId_period: { employeeId: emp.id, period } },
      });
      if (existing) continue;

      const gross = Number(emp.basicSalary || 0) + Number(bonus || 0);
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
          paye: money(paye),
          socialSecurityTax: money(socialSecurityTax),
          healthInsurance: money(healthInsurance),
          otherDeductions: otherDeductionAmount,
          salaryAdvanceRecovery: money(salaryAdvanceRecovery),
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

router.post("/payroll/:id/post", authenticateToken, requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const userId = req.user.id;

    const result = await prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findFirst({
        where: { id: req.params.id, tenantId },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!payroll) {
        const error = new Error("Payroll record not found");
        error.statusCode = 404;
        throw error;
      }
      if (payroll.journalEntryId || ["posted", "partially_paid", "paid"].includes(payroll.status)) {
        const error = new Error("Payroll is already posted to accounting");
        error.statusCode = 400;
        throw error;
      }

      const requiredFields = ["salaryExpenseAccountId", "salaryPayableAccountId"];
      if (money(payroll.salaryAdvanceRecovery) > 0) requiredFields.push("salaryAdvanceAccountId");
      if (money(payroll.paye) > 0) requiredFields.push("payeTaxAccountId");
      if (money(payroll.socialSecurityTax) > 0) requiredFields.push("socialSecurityAccountId");
      const { config } = await getRequiredHRAccounts(tx, tenantId, requiredFields);
      const employeeName = [payroll.employee?.firstName, payroll.employee?.lastName].filter(Boolean).join(" ") || "Employee";
      const existingJournal = await tx.journalEntry.findFirst({
        where: { tenantId, sourceType: "HR_PAYROLL", sourceId: payroll.id },
        include: { lines: true },
      });
      if (existingJournal) {
        const relinked = await tx.payroll.update({
          where: { id: payroll.id },
          data: {
            status: "posted",
            postedBy: payroll.postedBy || userId,
            postedAt: payroll.postedAt || new Date(),
            journalEntryId: existingJournal.id,
          },
        });
        return { payroll: relinked, journalEntry: existingJournal };
      }

      await applySalaryAdvanceRecoveries(tx, { tenantId, payroll });
      const lines = payrollPostingLines(payroll, config, employeeName);

      const journalEntry = await createPostedJournal(tx, {
        tenantId,
        branchId: payroll.branchId,
        userId,
        description: `Payroll posting - ${employeeName} - ${payroll.period}`,
        reference: payroll.payrollNo,
        sourceType: "HR_PAYROLL",
        sourceId: payroll.id,
        lines,
      });

      const updated = await tx.payroll.update({
        where: { id: payroll.id },
        data: {
          status: "posted",
          postedBy: userId,
          postedAt: new Date(),
          journalEntryId: journalEntry.id,
        },
      });

      await tx.hRAuditLog.create({
        data: {
          tenantId,
          recordType: "payroll",
          recordId: payroll.id,
          employeeId: payroll.employeeId,
          action: "posted",
          description: "Payroll posted to accounting",
          amount: payroll.grossSalary,
          userId,
          branchId: payroll.branchId,
          journalEntryId: journalEntry.id,
          metadata: {
            grossSalary: money(payroll.grossSalary),
            netSalary: money(payroll.netSalary),
            totalDeductions: money(payroll.totalDeductions),
            paye: money(payroll.paye),
            socialSecurityTax: money(payroll.socialSecurityTax),
            healthInsurance: money(payroll.healthInsurance),
            otherDeductions: money(payroll.otherDeductions),
            salaryAdvanceRecovery: money(payroll.salaryAdvanceRecovery),
          },
        },
      });

      return { payroll: updated, journalEntry };
    });

    res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error("Payroll post error:", err);
    res.status(status).json({ error: err.message || "Failed to post payroll" });
  }
});

router.put("/payroll/:id/pay", authenticateToken, requirePermission("canManageHRPayroll"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const userId = req.user.id;
    const { paymentAccountId, amount, paymentMethod = "cash", referenceNo } = req.body;
    if (!paymentAccountId) {
      return res.status(400).json({
        error: "Select the Cash/Bank/Mobile Money account used to pay salary. Create the account first if it does not exist.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.payroll.findFirst({
        where: { id: req.params.id, tenantId },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!current) {
        const error = new Error("Payroll record not found");
        error.statusCode = 404;
        throw error;
      }
      if (!current.journalEntryId || !["posted", "partially_paid"].includes(current.status)) {
        const error = new Error("Post this payroll to accounting before recording salary payment.");
        error.statusCode = 400;
        throw error;
      }

      const remaining = Math.max(0, money(current.netSalary) - money(current.paidAmount));
      const paymentAmount = amount !== undefined ? money(amount) : remaining;
      if (paymentAmount <= 0 || paymentAmount > remaining) {
        const error = new Error(`Enter a valid salary payment amount up to ${remaining.toFixed(2)}.`);
        error.statusCode = 400;
        throw error;
      }

      const { config } = await getRequiredHRAccounts(tx, tenantId, ["salaryPayableAccountId"]);
      const paymentAccount = await tx.account.findFirst({
        where: { id: paymentAccountId, tenantId, isActive: true },
      });
      if (!paymentAccount) {
        const error = new Error("Selected salary payment account is missing or inactive. Create/select a Cash, Bank, Mobile Money, or Card account first.");
        error.statusCode = 400;
        throw error;
      }
      if (String(paymentAccount.type || "").toLowerCase() !== "asset") {
        const error = new Error("Salary payments must be made from an Asset account such as Cash, Bank, Mobile Money, or Card.");
        error.statusCode = 400;
        throw error;
      }

      const payment = await tx.payrollPayment.create({
        data: {
          tenantId,
          payrollId: current.id,
          amount: paymentAmount,
          paymentMethod,
          paymentAccountId,
          referenceNo: referenceNo || null,
          status: "completed",
          createdBy: userId,
        },
      });

      const employeeName = [current.employee?.firstName, current.employee?.lastName].filter(Boolean).join(" ") || "Employee";
      const journalEntry = await createPostedJournal(tx, {
        tenantId,
        branchId: current.branchId,
        userId,
        description: `Salary payment - ${employeeName} - ${current.period}`,
        reference: referenceNo || payment.id,
        sourceType: "HR_PAYROLL_PAYMENT",
        sourceId: payment.id,
        lines: [
          {
            accountId: config.salaryPayableAccountId,
            debit: paymentAmount,
            credit: 0,
            description: `Salary payable paid - ${employeeName}`,
          },
          {
            accountId: paymentAccountId,
            debit: 0,
            credit: paymentAmount,
            description: `Salary payment from ${paymentAccount.name}`,
          },
        ],
      });

      const updatedPayment = await tx.payrollPayment.update({
        where: { id: payment.id },
        data: { journalEntryId: journalEntry.id },
      });

      const newPaidAmount = money(current.paidAmount) + paymentAmount;
      const rec = await tx.payroll.update({
        where: { id: current.id },
        data: {
          status: newPaidAmount >= money(current.netSalary) ? "paid" : "partially_paid",
          paidAmount: newPaidAmount,
          paymentAccountId: newPaidAmount >= money(current.netSalary) ? paymentAccountId : current.paymentAccountId,
          paymentDate: new Date(),
          paymentReference: referenceNo || current.paymentReference,
        },
      });

      await tx.hRAuditLog.create({
        data: {
          tenantId,
          recordType: "payroll",
          recordId: current.id,
          employeeId: current.employeeId,
          action: "paid",
          description: "Salary payment posted to accounting",
          amount: paymentAmount,
          userId,
          branchId: current.branchId,
          journalEntryId: journalEntry.id,
        },
      });

      return { payroll: rec, payment: updatedPayment, journalEntry };
    });

    res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error("Payroll pay error:", err);
    res.status(status).json({ error: err.message || "Failed to mark payroll as paid" });
  }
});

export default router;
