/**
 * Salary Advance Service
 * Handles salary advances with accounting integration
 */

const { PrismaClient } = require("@prisma/client");
const hrAccountingService = require("./hrAccountingService");

const prisma = new PrismaClient();

class SalaryAdvanceService {
  /**
   * Issue a salary advance
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, advance: object, error?: string}>}
   */
  async issueSalaryAdvance(params) {
    const {
      tenantId,
      employeeId,
      amount,
      paymentAccountId,
      date,
      reason,
      recoveryMethod = "payroll",
      recoveryPlan,
      recoveryAmount,
      userId,
    } = params;

    // Validate HR accounting configuration
    const accountValidation =
      await hrAccountingService.validateHRAccountConfiguration(tenantId, [
        "salaryAdvance",
      ]);

    if (!accountValidation.isValid) {
      return {
        success: false,
        error: `Salary Advance Account Not Configured. ${accountValidation.missingAccounts.join(", ")} is required.`,
        missingAccounts: accountValidation.missingAccounts,
      };
    }

    // Check payment account is valid (not expense account)
    const paymentAccount = await prisma.account.findUnique({
      where: { id: paymentAccountId },
    });

    if (!paymentAccount) {
      return {
        success: false,
        error: "Payment account not found",
      };
    }

    if (paymentAccount.type === "expense") {
      return {
        success: false,
        error: "Cannot use Expense account for salary advance payment",
      };
    }

    // Get employee
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      return {
        success: false,
        error: "Employee not found",
      };
    }

    const session = await prisma.$transaction(async (tx) => {
      try {
        // Generate advance number
        const lastAdvance = await tx.salaryAdvance.findFirst({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
        });

        const advanceNo = this.generateAdvanceNumber(lastAdvance?.advanceNo);

        // Create salary advance record
        const advance = await tx.salaryAdvance.create({
          data: {
            tenantId,
            employeeId,
            advanceNo,
            amount,
            paymentAccountId,
            date: new Date(date),
            reason,
            status: "outstanding",
            outstandingAmount: amount,
            totalRecovered: 0,
            recoveryMethod,
            recoveryPlan,
            recoveryAmount: recoveryAmount || 0,
            approvedBy: userId,
            approvedAt: new Date(),
            paidBy: userId,
            paidAt: new Date(),
            createdBy: userId,
          },
        });

        // Create accounting journal entry
        const journalResult = await hrAccountingService.createSalaryAdvanceJournal(
          {
            tenantId,
            branchId: employee.branchId,
            salaryAdvanceId: advance.id,
            amount,
            paymentAccountId,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            userId,
            date,
          }
        );

        if (!journalResult.success) {
          throw new Error(journalResult.error || "Failed to create journal entry");
        }

        // Update advance with journal entry reference
        const updatedAdvance = await tx.salaryAdvance.update({
          where: { id: advance.id },
          data: {
            journalEntryId: journalResult.journalEntry.id,
          },
        });

        // Update employee salary advance balance
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            salaryAdvanceBalance: {
              increment: amount,
            },
          },
        });

        // Create audit log
        await hrAccountingService.createAuditLog({
          tenantId,
          recordType: "salary_advance",
          recordId: advance.id,
          employeeId,
          action: "created",
          description: `Salary advance issued: ${amount}`,
          amount,
          userId,
          branchId: employee.branchId,
          journalEntryId: journalResult.journalEntry.id,
          metadata: {
            recoveryMethod,
            recoveryPlan,
          },
        });

        return {
          success: true,
          advance: updatedAdvance,
          journalEntry: journalResult.journalEntry,
        };
      } catch (error) {
        console.error("Error issuing salary advance:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Record direct salary advance repayment (not through payroll)
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, recovery: object, error?: string}>}
   */
  async recordDirectRepayment(params) {
    const {
      tenantId,
      salaryAdvanceId,
      amount,
      paymentAccountId,
      date,
      notes,
      userId,
    } = params;

    if (!paymentAccountId) {
      return {
        success: false,
        error: "Select the Cash/Bank/Mobile Money account that received the advance/loan repayment. Create the account first if it does not exist.",
      };
    }

    const accountValidation =
      await hrAccountingService.validateHRAccountConfiguration(tenantId, [
        "salaryAdvance",
      ]);

    if (!accountValidation.isValid) {
      return {
        success: false,
        error: accountValidation.error,
        missingAccounts: accountValidation.missingAccounts,
      };
    }

    const session = await prisma.$transaction(async (tx) => {
      try {
        // Get salary advance
        const advance = await tx.salaryAdvance.findUnique({
          where: { id: salaryAdvanceId },
          include: { employee: true },
        });

        if (!advance) {
          throw new Error("Salary advance not found");
        }

        if (advance.status === "cancelled") {
          throw new Error("Cannot recover from cancelled advance");
        }

        // Check over-recovery
        if (amount > advance.outstandingAmount) {
          throw new Error(
            `Cannot recover more than outstanding amount (${advance.outstandingAmount})`
          );
        }

        // Create recovery record
        const recovery = await tx.salaryAdvanceRecovery.create({
          data: {
            tenantId,
            salaryAdvanceId,
            recoveryType: "direct_repayment",
            recoveryDate: new Date(date),
            amount,
            notes,
          },
        });

        // Calculate new balances
        const newTotalRecovered = advance.totalRecovered + amount;
        const newOutstandingAmount = advance.amount - newTotalRecovered;
        const newStatus =
          newOutstandingAmount <= 0
            ? "fully_recovered"
            : newTotalRecovered > 0
              ? "partially_recovered"
              : "outstanding";

        // Update advance
        const updatedAdvance = await tx.salaryAdvance.update({
          where: { id: salaryAdvanceId },
          data: {
            totalRecovered: newTotalRecovered,
            outstandingAmount: newOutstandingAmount,
            status: newStatus,
          },
        });

        // Update employee balance
        await tx.employee.update({
          where: { id: advance.employeeId },
          data: {
            salaryAdvanceBalance: {
              decrement: amount,
            },
          },
        });

        const journalResult = await hrAccountingService.createSalaryAdvanceRepaymentJournal({
          tenantId,
          branchId: advance.employee.branchId,
          recoveryId: recovery.id,
          amount,
          paymentAccountId,
          employeeName: `${advance.employee.firstName} ${advance.employee.lastName}`,
          userId,
          date,
        });

        if (!journalResult.success) {
          throw new Error(journalResult.error || "Failed to create advance/loan repayment journal");
        }

        // Create audit log
        await hrAccountingService.createAuditLog({
          tenantId,
          recordType: "salary_advance_direct_repayment",
          recordId: recovery.id,
          employeeId: advance.employeeId,
          action: "direct_repayment",
          description: `Direct repayment of salary advance: ${amount}`,
          amount,
          userId,
          branchId: advance.employee.branchId,
          journalEntryId: journalResult.journalEntry.id,
        });

        return {
          success: true,
          recovery,
          advance: updatedAdvance,
          journalEntry: journalResult.journalEntry,
        };
      } catch (error) {
        console.error("Error recording direct repayment:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Cancel a salary advance
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, advance: object, error?: string}>}
   */
  async cancelSalaryAdvance(params) {
    const {
      tenantId,
      salaryAdvanceId,
      reason,
      userId,
      date,
    } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        const advance = await tx.salaryAdvance.findUnique({
          where: { id: salaryAdvanceId },
          include: { employee: true, journalEntry: true },
        });

        if (!advance) {
          throw new Error("Salary advance not found");
        }

        if (advance.status === "cancelled") {
          throw new Error("Advance is already cancelled");
        }

        if (advance.totalRecovered > 0) {
          throw new Error("Cannot cancel advance that has been partially recovered");
        }

        // Reverse the original journal entry if it exists
        if (advance.journalEntry) {
          const reversalResult =
            await hrAccountingService.reverseJournalEntry({
              tenantId,
              originalEntryId: advance.journalEntry.id,
              reason: `Cancellation: ${reason}`,
              userId,
              date,
            });

          if (!reversalResult.success) {
            throw new Error("Failed to reverse accounting entry");
          }
        }

        // Update advance
        const updatedAdvance = await tx.salaryAdvance.update({
          where: { id: salaryAdvanceId },
          data: {
            status: "cancelled",
            cancelledAt: new Date(date),
            cancelledBy: userId,
            cancelReason: reason,
          },
        });

        // Restore employee balance
        await tx.employee.update({
          where: { id: advance.employeeId },
          data: {
            salaryAdvanceBalance: {
              decrement: advance.amount,
            },
          },
        });

        // Create audit log
        await hrAccountingService.createAuditLog({
          tenantId,
          recordType: "salary_advance",
          recordId: salaryAdvanceId,
          employeeId: advance.employeeId,
          action: "cancelled",
          description: `Salary advance cancelled: ${reason}`,
          amount: advance.amount,
          userId,
          branchId: advance.employee.branchId,
        });

        return {
          success: true,
          advance: updatedAdvance,
        };
      } catch (error) {
        console.error("Error cancelling salary advance:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Get salary advance by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} advanceId - Advance ID
   * @returns {Promise<object>}
   */
  async getSalaryAdvance(tenantId, advanceId) {
    try {
      const advance = await prisma.salaryAdvance.findFirst({
        where: {
          id: advanceId,
          tenantId,
        },
        include: {
          employee: true,
          recoveries: true,
          journalEntry: {
            include: { lines: true },
          },
        },
      });

      return advance;
    } catch (error) {
      console.error("Error fetching salary advance:", error);
      throw error;
    }
  }

  /**
   * Get all salary advances for employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object[]>}
   */
  async getEmployeeSalaryAdvances(tenantId, employeeId) {
    try {
      const advances = await prisma.salaryAdvance.findMany({
        where: {
          tenantId,
          employeeId,
        },
        include: {
          recoveries: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return advances;
    } catch (error) {
      console.error("Error fetching employee salary advances:", error);
      throw error;
    }
  }

  /**
   * Get outstanding salary advances for tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} branchId - Optional branch ID filter
   * @returns {Promise<object[]>}
   */
  async getOutstandingAdvances(tenantId, branchId = null) {
    try {
      const advances = await prisma.salaryAdvance.findMany({
        where: {
          tenantId,
          status: { in: ["outstanding", "partially_recovered"] },
          ...(branchId && {
            employee: { branchId },
          }),
        },
        include: {
          employee: true,
          recoveries: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return advances;
    } catch (error) {
      console.error("Error fetching outstanding advances:", error);
      throw error;
    }
  }

  /**
   * Get salary advances summary
   * @param {string} tenantId - Tenant ID
   * @param {string} branchId - Optional branch ID
   * @returns {Promise<object>}
   */
  async getSalaryAdvancesSummary(tenantId, branchId = null) {
    try {
      const advances = await this.getOutstandingAdvances(tenantId, branchId);

      const totalIssued = advances.reduce((sum, adv) => sum + adv.amount, 0);
      const totalRecovered = advances.reduce(
        (sum, adv) => sum + adv.totalRecovered,
        0
      );
      const totalOutstanding = advances.reduce(
        (sum, adv) => sum + adv.outstandingAmount,
        0
      );
      const employeesWithAdvances = new Set(advances.map((a) => a.employeeId))
        .size;

      return {
        totalIssued,
        totalRecovered,
        totalOutstanding,
        advancesCount: advances.length,
        employeesWithAdvances,
        advances,
      };
    } catch (error) {
      console.error("Error fetching salary advances summary:", error);
      throw error;
    }
  }

  /**
   * Generate advance number
   * Format: ADV-001-YYYY
   * @param {string} lastAdvanceNo - Previous advance number
   * @returns {string}
   */
  generateAdvanceNumber(lastAdvanceNo) {
    const year = new Date().getFullYear();

    if (!lastAdvanceNo) {
      return `ADV-001-${year}`;
    }

    const parts = lastAdvanceNo.split("-");
    const lastYear = parseInt(parts[2]);
    const lastSequence = parseInt(parts[1]) || 0;

    if (lastYear === year) {
      return `ADV-${String(lastSequence + 1).padStart(3, "0")}-${year}`;
    }

    return `ADV-001-${year}`;
  }
}

module.exports = new SalaryAdvanceService();
