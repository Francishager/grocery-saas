/**
 * HR Accounting Service
 * Handles accounting integration for HR transactions (advances, payroll, payments)
 * Ensures all HR financial transactions have corresponding journal entries
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class HRAccountingService {
  /**
   * Validate that required HR accounting accounts are configured
   * @param {string} tenantId - Tenant ID
   * @param {string[]} requiredAccounts - Array of account types needed (e.g., ['salaryExpense', 'salaryPayable'])
   * @returns {Promise<{isValid: boolean, missingAccounts: string[]}>}
   */
  async validateHRAccountConfiguration(tenantId, requiredAccounts = []) {
    try {
      const config = await prisma.hRAccountingConfig.findUnique({
        where: { tenantId },
      });

      if (!config || !config.isConfigured) {
        return {
          isValid: false,
          missingAccounts: requiredAccounts,
          error: "HR Accounting configuration not set up",
        };
      }

      const missing = [];

      if (requiredAccounts.includes("salaryExpense") && !config.salaryExpenseAccountId) {
        missing.push("salaryExpense");
      }
      if (requiredAccounts.includes("salaryPayable") && !config.salaryPayableAccountId) {
        missing.push("salaryPayable");
      }
      if (requiredAccounts.includes("salaryAdvance") && !config.salaryAdvanceAccountId) {
        missing.push("salaryAdvance");
      }
      if (requiredAccounts.includes("payeTax") && !config.payeTaxAccountId) {
        missing.push("payeTax");
      }

      return {
        isValid: missing.length === 0,
        missingAccounts: missing,
        config,
      };
    } catch (error) {
      console.error("Error validating HR account configuration:", error);
      throw error;
    }
  }

  /**
   * Verify that accounts exist and are valid
   * @param {string} tenantId - Tenant ID
   * @param {string[]} accountIds - Account IDs to verify
   * @returns {Promise<{valid: boolean, invalidAccounts: string[]}>}
   */
  async verifyAccountsExist(tenantId, accountIds) {
    try {
      const accounts = await prisma.account.findMany({
        where: {
          tenantId,
          id: { in: accountIds.filter(Boolean) },
          isActive: true,
        },
      });

      const foundIds = accounts.map((a) => a.id);
      const invalidAccounts = accountIds.filter((id) => id && !foundIds.includes(id));

      return {
        valid: invalidAccounts.length === 0,
        invalidAccounts,
        accounts,
      };
    } catch (error) {
      console.error("Error verifying accounts:", error);
      throw error;
    }
  }

  /**
   * Create salary advance accounting entry
   * Creates: DR Employee Salary Advances / CR Cash/Bank Account
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, journalEntry: object, error?: string}>}
   */
  async createSalaryAdvanceJournal(params) {
    const {
      tenantId,
      branchId,
      salaryAdvanceId,
      amount,
      paymentAccountId,
      employeeName,
      userId,
      date,
    } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        // Validate accounts are configured
        const validation = await tx.hRAccountingConfig.findUnique({
          where: { tenantId },
        });

        if (!validation || !validation.isConfigured) {
          throw new Error("HR Accounting configuration not set up");
        }

        if (!validation.salaryAdvanceAccountId) {
          throw new Error("Salary Advance Account not configured");
        }

        // Verify accounts exist
        const accountIds = [
          validation.salaryAdvanceAccountId,
          paymentAccountId,
        ];
        const accountCheck = await tx.account.findMany({
          where: {
            tenantId,
            id: { in: accountIds },
            isActive: true,
          },
        });

        if (accountCheck.length !== accountIds.length) {
          throw new Error("One or more accounts not found or inactive");
        }

        // Generate entry number
        const lastEntry = await tx.journalEntry.findFirst({
          where: { tenantId },
          orderBy: { entryNo: "desc" },
        });

        const entryNo = this.generateEntryNumber(lastEntry?.entryNo);

        // Create journal entry
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNo,
            tenantId,
            branchId,
            date: new Date(date),
            description: `Salary Advance - ${employeeName}`,
            reference: `ADV-${salaryAdvanceId}`,
            status: "posted",
            userId,
            sourceType: "SALARY_ADVANCE",
            sourceId: salaryAdvanceId,
            lines: {
              create: [
                {
                  accountId: validation.salaryAdvanceAccountId,
                  debit: amount,
                  credit: 0,
                  description: `Salary Advance to ${employeeName}`,
                },
                {
                  accountId: paymentAccountId,
                  debit: 0,
                  credit: amount,
                  description: `Payment for ${employeeName} salary advance`,
                },
              ],
            },
          },
          include: { lines: true },
        });

        return {
          success: true,
          journalEntry,
        };
      } catch (error) {
        console.error("Error creating salary advance journal:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Create payroll accounting entry
   * Creates: DR Salary Expense / CR Salary Payable / CR Salary Advance (if recovery)
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, journalEntry: object, error?: string}>}
   */
  async createPayrollJournal(params) {
    const {
      tenantId,
      branchId,
      payrollId,
      grossSalary,
      salaryAdvanceRecovery,
      netSalaryPayable,
      employeeName,
      userId,
      date,
    } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        // Validate accounts
        const config = await tx.hRAccountingConfig.findUnique({
          where: { tenantId },
        });

        if (!config || !config.isConfigured) {
          throw new Error("HR Accounting configuration not set up");
        }

        if (!config.salaryExpenseAccountId || !config.salaryPayableAccountId) {
          throw new Error(
            "Salary Expense and Salary Payable accounts must be configured"
          );
        }

        // Verify accounts exist
        const accountIds = [
          config.salaryExpenseAccountId,
          config.salaryPayableAccountId,
        ];

        if (salaryAdvanceRecovery > 0 && config.salaryAdvanceAccountId) {
          accountIds.push(config.salaryAdvanceAccountId);
        }

        const accounts = await tx.account.findMany({
          where: {
            tenantId,
            id: { in: accountIds },
            isActive: true,
          },
        });

        if (accounts.length !== accountIds.length) {
          throw new Error("One or more accounts not found or inactive");
        }

        // Generate entry number
        const lastEntry = await tx.journalEntry.findFirst({
          where: { tenantId },
          orderBy: { entryNo: "desc" },
        });

        const entryNo = this.generateEntryNumber(lastEntry?.entryNo);

        // Create journal lines
        const lines = [
          {
            accountId: config.salaryExpenseAccountId,
            debit: grossSalary,
            credit: 0,
            description: `Salary Expense - ${employeeName}`,
          },
          {
            accountId: config.salaryPayableAccountId,
            debit: 0,
            credit: netSalaryPayable,
            description: `Salary Payable - ${employeeName}`,
          },
        ];

        // Add advance recovery if applicable
        if (salaryAdvanceRecovery > 0 && config.salaryAdvanceAccountId) {
          lines.push({
            accountId: config.salaryAdvanceAccountId,
            debit: 0,
            credit: salaryAdvanceRecovery,
            description: `Salary Advance Recovery - ${employeeName}`,
          });
        }

        // Create journal entry
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNo,
            tenantId,
            branchId,
            date: new Date(date),
            description: `Payroll - ${employeeName}`,
            reference: `PAYROLL-${payrollId}`,
            status: "posted",
            userId,
            sourceType: "PAYROLL",
            sourceId: payrollId,
            lines: {
              create: lines,
            },
          },
          include: { lines: true },
        });

        return {
          success: true,
          journalEntry,
        };
      } catch (error) {
        console.error("Error creating payroll journal:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Create salary payment accounting entry
   * Creates: DR Salary Payable / CR Payment Account
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, journalEntry: object, error?: string}>}
   */
  async createSalaryPaymentJournal(params) {
    const {
      tenantId,
      branchId,
      paymentId,
      amount,
      paymentAccountId,
      employeeName,
      userId,
      date,
    } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        // Validate accounts
        const config = await tx.hRAccountingConfig.findUnique({
          where: { tenantId },
        });

        if (!config || !config.isConfigured) {
          throw new Error("HR Accounting configuration not set up");
        }

        if (!config.salaryPayableAccountId) {
          throw new Error("Salary Payable account not configured");
        }

        // Verify payment account exists
        const paymentAccount = await tx.account.findUnique({
          where: { id: paymentAccountId },
        });

        if (!paymentAccount || !paymentAccount.isActive) {
          throw new Error("Payment account not found or inactive");
        }

        // Generate entry number
        const lastEntry = await tx.journalEntry.findFirst({
          where: { tenantId },
          orderBy: { entryNo: "desc" },
        });

        const entryNo = this.generateEntryNumber(lastEntry?.entryNo);

        // Create journal entry
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNo,
            tenantId,
            branchId,
            date: new Date(date),
            description: `Salary Payment - ${employeeName}`,
            reference: `PAYMENT-${paymentId}`,
            status: "posted",
            userId,
            sourceType: "PAYROLL_PAYMENT",
            sourceId: paymentId,
            lines: {
              create: [
                {
                  accountId: config.salaryPayableAccountId,
                  debit: amount,
                  credit: 0,
                  description: `Salary Payment - ${employeeName}`,
                },
                {
                  accountId: paymentAccountId,
                  debit: 0,
                  credit: amount,
                  description: `Payment for ${employeeName} salary`,
                },
              ],
            },
          },
          include: { lines: true },
        });

        return {
          success: true,
          journalEntry,
        };
      } catch (error) {
        console.error("Error creating salary payment journal:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Reverse an accounting entry (creates reversing journal)
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, reversalEntry: object, error?: string}>}
   */
  async reverseJournalEntry(params) {
    const { tenantId, originalEntryId, reason, userId, date } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        // Fetch original entry
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: originalEntryId },
          include: { lines: true },
        });

        if (!originalEntry) {
          throw new Error("Original journal entry not found");
        }

        // Generate entry number for reversal
        const lastEntry = await tx.journalEntry.findFirst({
          where: { tenantId },
          orderBy: { entryNo: "desc" },
        });

        const entryNo = this.generateEntryNumber(lastEntry?.entryNo);

        // Create reversing entry with opposite debits/credits
        const reversalEntry = await tx.journalEntry.create({
          data: {
            entryNo,
            tenantId,
            branchId: originalEntry.branchId,
            date: new Date(date),
            description: `Reversal of ${originalEntry.description}`,
            reference: originalEntry.reference,
            status: "posted",
            userId,
            reversalOfId: originalEntryId,
            reversalReason: reason,
            reversedBy: userId,
            reversedAt: new Date(date),
            lines: {
              create: originalEntry.lines.map((line) => ({
                accountId: line.accountId,
                debit: line.credit,
                credit: line.debit,
                description: `Reversal - ${line.description}`,
              })),
            },
          },
          include: { lines: true },
        });

        // Update original entry status
        await tx.journalEntry.update({
          where: { id: originalEntryId },
          data: {
            status: "reversed",
            reversalJournalId: reversalEntry.id,
          },
        });

        return {
          success: true,
          reversalEntry,
        };
      } catch (error) {
        console.error("Error reversing journal entry:", error);
        throw error;
      }
    });

    return session;
  }

  /**
   * Get or create journal entry (idempotent - prevents double posting)
   * @param {string} tenantId - Tenant ID
   * @param {string} sourceType - Source type (SALARY_ADVANCE, PAYROLL, etc.)
   * @param {string} sourceId - Source record ID
   * @returns {Promise<object|null>}
   */
  async getExistingJournalEntry(tenantId, sourceType, sourceId) {
    try {
      const entry = await prisma.journalEntry.findFirst({
        where: {
          tenantId,
          sourceType,
          sourceId,
        },
      });

      return entry;
    } catch (error) {
      console.error("Error fetching existing journal entry:", error);
      throw error;
    }
  }

  /**
   * Generate next entry number
   * Format: JE-YYYYMMDD-001
   * @param {string} lastEntryNo - Previous entry number
   * @returns {string}
   */
  generateEntryNumber(lastEntryNo) {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");

    if (!lastEntryNo) {
      return `JE-${dateStr}-001`;
    }

    const parts = lastEntryNo.split("-");
    const lastDate = parts[1];
    const lastSequence = parseInt(parts[2]) || 0;

    if (lastDate === dateStr) {
      return `JE-${dateStr}-${String(lastSequence + 1).padStart(3, "0")}`;
    }

    return `JE-${dateStr}-001`;
  }

  /**
   * Create audit log for HR transaction
   * @param {object} params - Parameters
   * @returns {Promise<object>}
   */
  async createAuditLog(params) {
    const {
      tenantId,
      recordType,
      recordId,
      employeeId,
      action,
      description,
      amount,
      userId,
      branchId,
      journalEntryId,
      metadata,
    } = params;

    try {
      const log = await prisma.hRAuditLog.create({
        data: {
          tenantId,
          recordType,
          recordId,
          employeeId,
          action,
          description,
          amount,
          userId,
          branchId,
          journalEntryId,
          metadata,
        },
      });

      return log;
    } catch (error) {
      console.error("Error creating HR audit log:", error);
      throw error;
    }
  }

  /**
   * Get HR audit trail for a record
   * @param {string} tenantId - Tenant ID
   * @param {string} recordType - Record type
   * @param {string} recordId - Record ID
   * @returns {Promise<object[]>}
   */
  async getAuditTrail(tenantId, recordType, recordId) {
    try {
      const logs = await prisma.hRAuditLog.findMany({
        where: {
          tenantId,
          recordType,
          recordId,
        },
        orderBy: { createdAt: "asc" },
      });

      return logs;
    } catch (error) {
      console.error("Error fetching audit trail:", error);
      throw error;
    }
  }
}

module.exports = new HRAccountingService();
