/**
 * HR Configuration Service
 * Handles HR accounting account mappings configuration
 */

import prisma from "../db.js";
import { ensureTransactionAccounts } from "../utils/accountingSync.js";

const PAYE_TAX_ACCOUNT = {
  code: "2110",
  name: "PAYE Tax Payable",
  type: "liability",
  subType: "current_liability",
  description: "Payroll tax withheld from employees and payable to the authority.",
};

const SOCIAL_SECURITY_ACCOUNT = {
  code: "2120",
  name: "Social Security Payable",
  type: "liability",
  subType: "current_liability",
  description: "Employee social security deductions payable to the authority or scheme.",
};

class HRConfigurationService {
  async ensureAccount(db, { tenantId, branchId = null, code, name, type, subType, description }) {
    const existing = await db.account.findFirst({
      where: { tenantId, name },
    });

    if (existing) {
      if (existing.type !== type) {
        return {
          error: `${existing.name} exists but is ${existing.type}. HR accounting needs a ${type} account for ${name}.`,
        };
      }

      return {
        account: await db.account.update({
          where: { id: existing.id },
          data: {
            name,
            subType,
            description,
            isActive: true,
          },
        }),
      };
    }

    let availableCode = code;
    let suffix = 1;
    while (await db.account.findFirst({ where: { tenantId, code: availableCode } })) {
      availableCode = `${code}-${suffix++}`;
    }

    return {
      account: await db.account.create({
        data: {
          tenantId,
          branchId: branchId || null,
          code: availableCode,
          name,
          type,
          subType,
          description,
          isActive: true,
        },
      }),
    };
  }

  async ensureDefaultDeductionAccounts(params) {
    const {
      tx = null,
      tenantId,
      branchId = null,
      userId = null,
      existingConfig = null,
    } = params;
    const db = tx || prisma;
    const config = existingConfig || await db.hRAccountingConfig.findUnique({ where: { tenantId } });

    const resolveAccount = async (accountId, definition) => {
      if (accountId) {
        const existing = await db.account.findFirst({
          where: { id: accountId, tenantId, type: "liability", isActive: true },
        });
        if (existing) return existing;
      }

      const result = await this.ensureAccount(db, { tenantId, branchId, ...definition });
      if (result.error) {
        const error = new Error(result.error);
        error.statusCode = 400;
        throw error;
      }
      return result.account;
    };

    const payeTax = await resolveAccount(config?.payeTaxAccountId, PAYE_TAX_ACCOUNT);
    const socialSecurity = await resolveAccount(config?.socialSecurityAccountId, SOCIAL_SECURITY_ACCOUNT);

    const savedConfig = await db.hRAccountingConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        payeTaxAccountId: payeTax.id,
        socialSecurityAccountId: socialSecurity.id,
        isConfigured: false,
        configuredBy: userId,
        configuredAt: userId ? new Date() : null,
      },
      update: {
        payeTaxAccountId: payeTax.id,
        socialSecurityAccountId: socialSecurity.id,
        ...(userId ? { updatedBy: userId } : {}),
      },
    });

    return {
      payeTax,
      socialSecurity,
      config: savedConfig,
    };
  }

  /**
   * Get or create HR configuration for tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>}
   */
  async getHRConfig(tenantId) {
    try {
      let config = await prisma.hRAccountingConfig.findUnique({
        where: { tenantId },
      });

      if (!config) {
        config = await prisma.hRAccountingConfig.create({
          data: {
            tenantId,
            isConfigured: false,
          },
        });
      }

      return config;
    } catch (error) {
      console.error("Error fetching HR configuration:", error);
      throw error;
    }
  }

  /**
   * Update HR accounting account mappings
   * @param {object} params - Parameters
   * @returns {Promise<{success: boolean, config: object, error?: string, validation?: object}>}
   */
  async updateHRAccountMapping(params) {
    const {
      tenantId,
      salaryExpenseAccountId,
      salaryPayableAccountId,
      salaryAdvanceAccountId,
      userId,
    } = params;

    try {
      return await prisma.$transaction(async (tx) => {
        const existingConfig = await tx.hRAccountingConfig.findUnique({ where: { tenantId } });
        const deductions = await this.ensureDefaultDeductionAccounts({
          tx,
          tenantId,
          userId,
          existingConfig,
        });

        // Validate accounts exist and are appropriate types
        const accountIds = [
          salaryExpenseAccountId,
          salaryPayableAccountId,
          salaryAdvanceAccountId,
        ].filter(Boolean);

        if (accountIds.length === 0) {
          return {
            success: false,
            error: "At least one account mapping is required",
          };
        }

        const accounts = await tx.account.findMany({
          where: {
            tenantId,
            id: { in: accountIds },
            isActive: true,
          },
        });

        if (accounts.length !== accountIds.length) {
          return {
            success: false,
            error: "One or more accounts not found or inactive",
          };
        }

        // Validate account types
        const validation = this.validateAccountTypes({
          accounts,
          salaryExpenseAccountId,
          salaryPayableAccountId,
          salaryAdvanceAccountId,
        });

        if (!validation.valid) {
          return {
            success: false,
            error: "Account type validation failed",
            validation: validation.errors,
          };
        }

        // Update configuration
        const config = await tx.hRAccountingConfig.upsert({
          where: { tenantId },
          create: {
            tenantId,
            salaryExpenseAccountId,
            salaryPayableAccountId,
            salaryAdvanceAccountId,
            payeTaxAccountId: deductions.payeTax.id,
            socialSecurityAccountId: deductions.socialSecurity.id,
            isConfigured: true,
            configuredBy: userId,
            configuredAt: new Date(),
          },
          update: {
            salaryExpenseAccountId,
            salaryPayableAccountId,
            salaryAdvanceAccountId,
            payeTaxAccountId: deductions.payeTax.id,
            socialSecurityAccountId: deductions.socialSecurity.id,
            isConfigured: true,
            updatedBy: userId,
          },
        });

        return {
          success: true,
          config,
        };
      });
    } catch (error) {
      console.error("Error updating HR account mapping:", error);
      throw error;
    }
  }

  /**
   * Validate account types match expected types
   * @param {object} params - Parameters
   * @returns {object}
   */
  validateAccountTypes(params) {
    const {
      accounts,
      salaryExpenseAccountId,
      salaryPayableAccountId,
      salaryAdvanceAccountId,
    } = params;

    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const errors = [];

    // Salary Expense should be Expense type
    if (
      salaryExpenseAccountId &&
      accountMap.get(salaryExpenseAccountId)?.type !== "expense"
    ) {
      errors.push({
        field: "salaryExpenseAccountId",
        error: "Must be an Expense type account",
      });
    }

    // Salary Payable should be Liability type
    if (
      salaryPayableAccountId &&
      accountMap.get(salaryPayableAccountId)?.type !== "liability"
    ) {
      errors.push({
        field: "salaryPayableAccountId",
        error: "Must be a Liability type account",
      });
    }

    // Salary Advance should be Asset type (receivable)
    if (
      salaryAdvanceAccountId &&
      accountMap.get(salaryAdvanceAccountId)?.type !== "asset"
    ) {
      errors.push({
        field: "salaryAdvanceAccountId",
        error: "Must be an Asset type account (Current Asset/Receivable)",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if HR accounts are fully configured
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<{isConfigured: boolean, missingAccounts: string[]}>}
   */
  async checkHRConfiguration(tenantId) {
    try {
      const config = await this.getHRConfig(tenantId);

      const missing = [];

      if (!config.salaryExpenseAccountId) missing.push("Salary Expense");
      if (!config.salaryPayableAccountId) missing.push("Salary Payable");
      if (!config.salaryAdvanceAccountId) missing.push("Employee Advance/Loan");

      return {
        isConfigured: missing.length === 0,
        missingAccounts: missing,
        config,
      };
    } catch (error) {
      console.error("Error checking HR configuration:", error);
      throw error;
    }
  }

  /**
   * Get available accounts for HR mapping
   * @param {string} tenantId - Tenant ID
   * @param {string} accountType - Account type filter
   * @returns {Promise<object[]>}
   */
  async getAvailableAccountsForMapping(tenantId, accountType) {
    try {
      const accounts = await prisma.account.findMany({
        where: {
          tenantId,
          type: accountType,
          isActive: true,
        },
        orderBy: { code: "asc" },
      });

      return accounts;
    } catch (error) {
      console.error("Error fetching available accounts:", error);
      throw error;
    }
  }

  /**
   * Get all available accounts grouped by type
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>}
   */
  async getAvailableAccountsByType(tenantId) {
    try {
      await ensureTransactionAccounts(prisma, tenantId);

      const expenseAccounts = await this.getAvailableAccountsForMapping(
        tenantId,
        "expense"
      );
      const liabilityAccounts =
        await this.getAvailableAccountsForMapping(tenantId, "liability");
      const assetAccounts = await this.getAvailableAccountsForMapping(
        tenantId,
        "asset"
      );

      return {
        expenseAccounts,
        liabilityAccounts,
        assetAccounts,
      };
    } catch (error) {
      console.error("Error fetching accounts by type:", error);
      throw error;
    }
  }

  /**
   * Initialize default HR accounts if not present
   * Creates standard HR accounts for first-time setup
   * @param {string} tenantId - Tenant ID
   * @param {string} branchId - Branch ID
   * @param {string} userId - User ID
   * @returns {Promise<{success: boolean, accounts: object, error?: string}>}
   */
  async initializeDefaultHRAccounts(params) {
    const { tenantId, branchId, userId } = params;

    const session = await prisma.$transaction(async (tx) => {
      try {
        const salaryExpenseResult = await this.ensureAccount(tx, {
          tenantId,
          branchId,
          code: "6100",
          name: "Staff Salaries & Wages",
          type: "expense",
          subType: "operating_expense",
          description: "Salaries and wages paid to employees. Used when payroll is processed.",
        });
        const salaryPayableResult = await this.ensureAccount(tx, {
          tenantId,
          branchId,
          code: "2100",
          name: "Salaries Payable",
          type: "liability",
          subType: "current_liability",
          description: "Amount owed to employees for salaries processed but not yet paid.",
        });
        const salaryAdvanceResult = await this.ensureAccount(tx, {
          tenantId,
          branchId,
          code: "1250",
          name: "Employee Advances/Loans",
          type: "asset",
          subType: "current_asset",
          description: "Advances and employee loans that will be recovered through future payrolls.",
        });
        const deductions = await this.ensureDefaultDeductionAccounts({
          tx,
          tenantId,
          branchId,
          userId,
        });
        const accountError =
          salaryExpenseResult.error ||
          salaryPayableResult.error ||
          salaryAdvanceResult.error;

        if (accountError) {
          return { success: false, error: accountError };
        }

        const salaryExpense = salaryExpenseResult.account;
        const salaryPayable = salaryPayableResult.account;
        const salaryAdvance = salaryAdvanceResult.account;
        const payeTax = deductions.payeTax;
        const socialSecurity = deductions.socialSecurity;

        // Update HR configuration
        const config = await tx.hRAccountingConfig.upsert({
          where: { tenantId },
          create: {
            tenantId,
            salaryExpenseAccountId: salaryExpense.id,
            salaryPayableAccountId: salaryPayable.id,
            salaryAdvanceAccountId: salaryAdvance.id,
            payeTaxAccountId: payeTax.id,
            socialSecurityAccountId: socialSecurity.id,
            isConfigured: true,
            configuredBy: userId,
            configuredAt: new Date(),
          },
          update: {
            salaryExpenseAccountId: salaryExpense.id,
            salaryPayableAccountId: salaryPayable.id,
            salaryAdvanceAccountId: salaryAdvance.id,
            payeTaxAccountId: payeTax.id,
            socialSecurityAccountId: socialSecurity.id,
            isConfigured: true,
            updatedBy: userId,
          },
        });

        return {
          success: true,
          accounts: {
            salaryExpense,
            salaryPayable,
            salaryAdvance,
            payeTax,
            socialSecurity,
          },
          config,
        };
      } catch (error) {
        console.error("Error initializing HR accounts:", error);
        throw error;
      }
    });

    return session;
  }
}

export default new HRConfigurationService();
