/**
 * Payroll Service
 * Handles payroll processing with accounting integration
 */

import prisma from "../db.js";
import hrAccountingService from "./hrAccountingService.js";

class PayrollService {
  /**
   * Create a payroll record
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, payroll: object, error?: string}>}
   */
  async createPayroll(params) {
    const {
      tenantId,
      employeeId,
      period, // YYYY-MM
      basicSalary,
      allowances = 0,
      bonus = 0,
      overtime = 0,
      otherEarnings = 0,
      paye = 0,
      socialSecurityTax = 0,
      healthInsurance = 0,
      otherDeductions = 0,
      salaryAdvanceRecovery = 0,
      notes,
      userId,
    } = params;

    // Validate period format
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return {
        success: false,
        error: "Invalid period format. Use YYYY-MM",
      };
    }

    // Check for existing payroll for this employee in this period
    const existing = await prisma.payroll.findFirst({
      where: {
        tenantId,
        employeeId,
        period,
      },
    });

    if (existing) {
      return {
        success: false,
        error: `Payroll already exists for ${employeeId} in period ${period}`,
      };
    }

    // Get employee
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { salaryAdvances: true },
    });

    if (!employee) {
      return {
        success: false,
        error: "Employee not found",
      };
    }

    // Calculate totals
    const grossSalary = basicSalary + allowances + bonus + overtime + otherEarnings;
    const totalDeductions =
      paye + socialSecurityTax + healthInsurance + otherDeductions + salaryAdvanceRecovery;
    const netSalary = Math.max(0, grossSalary - totalDeductions);

    // Validate salary advance recovery
    const outstanding = employee.salaryAdvances
      .filter((a) => a.status !== "fully_recovered")
      .reduce((sum, a) => sum + a.outstandingAmount, 0);

    if (salaryAdvanceRecovery > outstanding) {
      return {
        success: false,
        error: `Cannot recover more than outstanding advance (${outstanding})`,
      };
    }

    const session = await prisma.$transaction(async (tx) => {
      try {
        // Generate payroll number
        const lastPayroll = await tx.payroll.findFirst({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
        });

        const payrollNo = this.generatePayrollNumber(
          lastPayroll?.payrollNo,
          period
        );

        // Create payroll record
        const payroll = await tx.payroll.create({
          data: {
            tenantId,
            branchId: employee.branchId,
            payrollNo,
            period,
            employeeId,
            basicSalary,
            allowances,
            bonus,
            overtime,
            otherEarnings,
            grossSalary,
            paye,
            socialSecurityTax,
            healthInsurance,
            otherDeductions,
            salaryAdvanceRecovery,
            totalDeductions,
            netSalary,
            status: "draft",
            notes,
            createdBy: userId,
          },
        });

        // Create audit log
        await hrAccountingService.createAuditLog({
          tx,
          tenantId,
          recordType: "payroll",
          recordId: payroll.id,
          employeeId,
          action: "created",
          description: `Payroll created for ${period}`,
          amount: grossSalary,
          userId,
          branchId: employee.branchId,
        });

        return {
          success: true,
          payroll,
        };
      } catch (error) {
        console.error("Error creating payroll:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Approve payroll (change status from draft to approved)
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, payroll: object, error?: string}>}
   */
  async approvePayroll(params) {
    const { tenantId, payrollId, userId } = params;

    try {
      const payroll = await prisma.payroll.findFirst({
        where: { id: payrollId, tenantId },
      });

      if (!payroll) {
        return {
          success: false,
          error: "Payroll not found",
        };
      }

      if (payroll.status !== "draft") {
        return {
          success: false,
          error: `Cannot approve payroll with status: ${payroll.status}`,
        };
      }

      const updated = await prisma.payroll.update({
        where: { id: payrollId },
        data: {
          status: "approved",
          approvedBy: userId,
          approvedAt: new Date(),
        },
      });

      // Create audit log
      await hrAccountingService.createAuditLog({
        tenantId,
        recordType: "payroll",
        recordId: payrollId,
        employeeId: payroll.employeeId,
        action: "approved",
        description: `Payroll approved`,
        amount: payroll.grossSalary,
        userId,
      });

      return {
        success: true,
        payroll: updated,
      };
    } catch (error) {
      console.error("Error approving payroll:", error);
      throw error;
    }
  }

  /**
   * Post payroll to accounting
   * Creates journal entry: DR Salary Expense / CR Salary Payable / CR Advance Recovery
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, payroll: object, journalEntry: object, error?: string}>}
   */
  async postPayroll(params) {
    const { tenantId, payrollId, userId } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        const payroll = await tx.payroll.findFirst({
          where: { id: payrollId, tenantId },
          include: { employee: true },
        });

        if (!payroll) {
          throw new Error("Payroll not found");
        }

        if (payroll.status !== "approved") {
          throw new Error(
            `Cannot post payroll with status: ${payroll.status}. Must be approved.`
          );
        }

        // Check if already posted
        if (payroll.journalEntryId) {
          throw new Error("Payroll already posted");
        }

        // Validate accounting configuration
        const requiredAccounts = ["salaryExpense", "salaryPayable"];
        if (payroll.salaryAdvanceRecovery > 0) requiredAccounts.push("salaryAdvance");
        if (payroll.paye > 0) requiredAccounts.push("payeTax");
        if (payroll.socialSecurityTax > 0) requiredAccounts.push("socialSecurity");

        const accountValidation =
          await hrAccountingService.validateHRAccountConfiguration(tenantId, requiredAccounts, tx);

        if (!accountValidation.isValid) {
          throw new Error(
            accountValidation.error || `Payroll accounts not configured: ${accountValidation.missingAccounts.join(", ")}`
          );
        }

        const existingJournal = await hrAccountingService.getExistingJournalEntry(
          tenantId,
          "PAYROLL",
          payrollId,
          tx
        );
        if (existingJournal) {
          const updated = await tx.payroll.update({
            where: { id: payrollId },
            data: {
              status: "posted",
              postedBy: payroll.postedBy || userId,
              postedAt: payroll.postedAt || new Date(),
              journalEntryId: existingJournal.id,
            },
          });

          return {
            success: true,
            payroll: updated,
            journalEntry: existingJournal,
          };
        }

        // Process salary advance recoveries
        if (payroll.salaryAdvanceRecovery > 0) {
          const advances = await tx.salaryAdvance.findMany({
            where: {
              tenantId,
              employeeId: payroll.employeeId,
              status: { in: ["outstanding", "partially_recovered"] },
            },
            orderBy: { date: "asc" },
          });

          const outstanding = advances.reduce((sum, advance) => sum + Number(advance.outstandingAmount || 0), 0);
          if (payroll.salaryAdvanceRecovery > outstanding) {
            throw new Error(`Cannot recover more than outstanding advance (${outstanding})`);
          }

          let remainingRecovery = payroll.salaryAdvanceRecovery;

          for (const advance of advances) {
            if (remainingRecovery <= 0) break;

            const recoveryAmount = Math.min(
              remainingRecovery,
              advance.outstandingAmount
            );

            // Create recovery record
            await tx.salaryAdvanceRecovery.create({
              data: {
                tenantId,
                salaryAdvanceId: advance.id,
                payrollId,
                recoveryType: "payroll",
                recoveryDate: new Date(),
                amount: recoveryAmount,
              },
            });

            // Update advance
            const newTotalRecovered = advance.totalRecovered + recoveryAmount;
            const newOutstandingAmount = advance.amount - newTotalRecovered;
            const newStatus =
              newOutstandingAmount <= 0
                ? "fully_recovered"
                : "partially_recovered";

            await tx.salaryAdvance.update({
              where: { id: advance.id },
              data: {
                totalRecovered: newTotalRecovered,
                outstandingAmount: newOutstandingAmount,
                status: newStatus,
              },
            });

            remainingRecovery -= recoveryAmount;
          }

          // Update employee salary advance balance
          await tx.employee.update({
            where: { id: payroll.employeeId },
            data: {
              salaryAdvanceBalance: {
                decrement: payroll.salaryAdvanceRecovery,
              },
            },
          });
        }

        // Create accounting journal entry
        const journalResult = await hrAccountingService.createPayrollJournal({
          tx,
          tenantId,
          branchId: payroll.branchId,
          payrollId,
          grossSalary: payroll.grossSalary,
          salaryAdvanceRecovery: payroll.salaryAdvanceRecovery,
          netSalaryPayable: payroll.netSalary,
          paye: payroll.paye,
          socialSecurityTax: payroll.socialSecurityTax,
          healthInsurance: payroll.healthInsurance,
          otherDeductions: payroll.otherDeductions,
          totalDeductions: payroll.totalDeductions,
          employeeName: `${payroll.employee.firstName} ${payroll.employee.lastName}`,
          userId,
          date: new Date(),
        });

        if (!journalResult.success) {
          throw new Error(journalResult.error || "Failed to create journal entry");
        }

        // Update payroll with journal entry
        const updated = await tx.payroll.update({
          where: { id: payrollId },
          data: {
            status: "posted",
            postedBy: userId,
            postedAt: new Date(),
            journalEntryId: journalResult.journalEntry.id,
          },
        });

        // Create audit log
        await hrAccountingService.createAuditLog({
          tx,
          tenantId,
          recordType: "payroll",
          recordId: payrollId,
          employeeId: payroll.employeeId,
          action: "posted",
          description: `Payroll posted to accounting`,
          amount: payroll.grossSalary,
          userId,
          branchId: payroll.branchId,
          journalEntryId: journalResult.journalEntry.id,
        });

        return {
          success: true,
          payroll: updated,
          journalEntry: journalResult.journalEntry,
        };
      } catch (error) {
        console.error("Error posting payroll:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Pay salary (record payment from cash/bank account)
   * Creates journal entry: DR Salary Payable / CR Payment Account
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, payment: object, journalEntry: object, error?: string}>}
   */
  async paySalary(params) {
    const {
      tenantId,
      payrollId,
      amount,
      paymentAccountId,
      paymentMethod = "cash",
      referenceNo,
      userId,
    } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        const payroll = await tx.payroll.findFirst({
          where: { id: payrollId, tenantId },
          include: { employee: true },
        });

        if (!payroll) {
          throw new Error("Payroll not found");
        }

        if (payroll.status !== "posted" && payroll.status !== "partially_paid") {
          throw new Error(
            `Cannot pay salary with status: ${payroll.status}. Must be posted first.`
          );
        }

        // Check payment amount doesn't exceed net salary
        const remaining = payroll.netSalary - payroll.paidAmount;
        if (amount <= 0 || amount > remaining) {
          throw new Error(
            `Enter a valid salary payment amount up to ${remaining}`
          );
        }

        await hrAccountingService.requirePaymentAccountForMethod(
          tx,
          tenantId,
          paymentAccountId,
          paymentMethod,
          "salary payment",
          userId
        );

        // Create payment record
        const payment = await tx.payrollPayment.create({
          data: {
            tenantId,
            payrollId,
            amount,
            paymentMethod,
            paymentAccountId,
            referenceNo,
            status: "completed",
            createdBy: userId,
          },
        });

        // Create payment journal entry
        const journalResult = await hrAccountingService.createSalaryPaymentJournal({
          tx,
          tenantId,
          branchId: payroll.branchId,
          paymentId: payment.id,
          amount,
          paymentAccountId,
          paymentMethod,
          employeeName: `${payroll.employee.firstName} ${payroll.employee.lastName}`,
          userId,
          date: new Date(),
        });

        if (!journalResult.success) {
          throw new Error(journalResult.error || "Failed to create payment journal");
        }

        // Update payment with journal entry
        const updatedPayment = await tx.payrollPayment.update({
          where: { id: payment.id },
          data: {
            journalEntryId: journalResult.journalEntry.id,
          },
        });

        // Update payroll payment status
        const newPaidAmount = payroll.paidAmount + amount;
        const newStatus =
          newPaidAmount >= payroll.netSalary
            ? "paid"
            : newPaidAmount > 0
              ? "partially_paid"
              : payroll.status;

        const updated = await tx.payroll.update({
          where: { id: payrollId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
            paymentAccountId: newStatus === "paid" ? paymentAccountId : null,
            paymentDate:
              newStatus === "paid"
                ? new Date()
                : payroll.paymentDate,
            paymentReference:
              newStatus === "paid" ? referenceNo : null,
          },
        });

        // Create audit log
        await hrAccountingService.createAuditLog({
          tx,
          tenantId,
          recordType: "payroll",
          recordId: payrollId,
          employeeId: payroll.employeeId,
          action: "paid",
          description: `Salary payment: ${amount}`,
          amount,
          userId,
          branchId: payroll.branchId,
          journalEntryId: journalResult.journalEntry.id,
        });

        return {
          success: true,
          payment: updatedPayment,
          payroll: updated,
          journalEntry: journalResult.journalEntry,
        };
      } catch (error) {
        console.error("Error paying salary:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Get payroll by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} payrollId - Payroll ID
   * @returns {Promise<object>}
   */
  async getPayroll(tenantId, payrollId) {
    try {
      const payroll = await prisma.payroll.findFirst({
        where: { id: payrollId, tenantId },
        include: {
          employee: true,
          adjustments: true,
          deductions: true,
          recoveries: { include: { salaryAdvance: true } },
          payments: true,
          journalEntry: { include: { lines: true } },
        },
      });

      return payroll;
    } catch (error) {
      console.error("Error fetching payroll:", error);
      throw error;
    }
  }

  /**
   * Get payrolls for period
   * @param {string} tenantId - Tenant ID
   * @param {string} period - Period (YYYY-MM)
   * @param {string} branchId - Optional branch filter
   * @returns {Promise<object[]>}
   */
  async getPayrollsByPeriod(tenantId, period, branchId = null) {
    try {
      const payrolls = await prisma.payroll.findMany({
        where: {
          tenantId,
          period,
          ...(branchId && { branchId }),
        },
        include: {
          employee: true,
          journalEntry: true,
          payments: true,
        },
        orderBy: { createdAt: "asc" },
      });

      return payrolls;
    } catch (error) {
      console.error("Error fetching payrolls:", error);
      throw error;
    }
  }

  /**
   * Get payroll summary for period
   * @param {string} tenantId - Tenant ID
   * @param {string} period - Period (YYYY-MM)
   * @param {string} branchId - Optional branch filter
   * @returns {Promise<object>}
   */
  async getPayrollSummary(tenantId, period, branchId = null) {
    try {
      const payrolls = await this.getPayrollsByPeriod(tenantId, period, branchId);

      const summary = {
        period,
        totalPayrolls: payrolls.length,
        totalGrossSalary: 0,
        totalDeductions: 0,
        totalNetSalary: 0,
        totalPaid: 0,
        byStatus: {
          draft: 0,
          approved: 0,
          posted: 0,
          partially_paid: 0,
          paid: 0,
          reversed: 0,
        },
      };

      payrolls.forEach((p) => {
        summary.totalGrossSalary += p.grossSalary;
        summary.totalDeductions += p.totalDeductions;
        summary.totalNetSalary += p.netSalary;
        summary.totalPaid += p.paidAmount;
        summary.byStatus[p.status]++;
      });

      return { summary, payrolls };
    } catch (error) {
      console.error("Error fetching payroll summary:", error);
      throw error;
    }
  }

  /**
   * Generate payroll number
   * Format: PAYROLL-001-YYYY-MM
   * @param {string} lastPayrollNo - Previous payroll number
   * @param {string} period - Period (YYYY-MM)
   * @returns {string}
   */
  generatePayrollNumber(lastPayrollNo, period) {
    if (!lastPayrollNo) {
      return `PAYROLL-001-${period}`;
    }

    const parts = lastPayrollNo.split("-");
    const lastPeriod = `${parts[2]}-${parts[3]}`;
    const lastSequence = parseInt(parts[1]) || 0;

    if (lastPeriod === period) {
      return `PAYROLL-${String(lastSequence + 1).padStart(3, "0")}-${period}`;
    }

    return `PAYROLL-001-${period}`;
  }
}

export default new PayrollService();
