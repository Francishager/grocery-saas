/**
 * HR Configuration Service
 * Handles HR accounting account mappings configuration
 */

import prisma from "../db.js";

class HRConfigurationService {
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
      payeTaxAccountId,
      socialSecurityAccountId,
      userId,
    } = params;

    try {
      // Validate accounts exist and are appropriate types
      const accountIds = [
        salaryExpenseAccountId,
        salaryPayableAccountId,
        salaryAdvanceAccountId,
        payeTaxAccountId,
        socialSecurityAccountId,
      ].filter(Boolean);

      if (accountIds.length === 0) {
        return {
          success: false,
          error: "At least one account mapping is required",
        };
      }

      const accounts = await prisma.account.findMany({
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
        payeTaxAccountId,
        socialSecurityAccountId,
      });

      if (!validation.valid) {
        return {
          success: false,
          error: "Account type validation failed",
          validation: validation.errors,
        };
      }

      // Update configuration
      const config = await prisma.hRAccountingConfig.upsert({
        where: { tenantId },
        create: {
          tenantId,
          salaryExpenseAccountId,
          salaryPayableAccountId,
          salaryAdvanceAccountId,
          payeTaxAccountId,
          socialSecurityAccountId,
          isConfigured: true,
          configuredBy: userId,
          configuredAt: new Date(),
        },
        update: {
          salaryExpenseAccountId,
          salaryPayableAccountId,
          salaryAdvanceAccountId,
          payeTaxAccountId,
          socialSecurityAccountId,
          isConfigured: true,
          updatedBy: userId,
        },
      });

      return {
        success: true,
        config,
      };
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
      payeTaxAccountId,
      socialSecurityAccountId,
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

    // PAYE Tax should be Liability
    if (
      payeTaxAccountId &&
      accountMap.get(payeTaxAccountId)?.type !== "liability"
    ) {
      errors.push({
        field: "payeTaxAccountId",
        error: "Must be a Liability type account",
      });
    }

    // Social Security should be Liability
    if (
      socialSecurityAccountId &&
      accountMap.get(socialSecurityAccountId)?.type !== "liability"
    ) {
      errors.push({
        field: "socialSecurityAccountId",
        error: "Must be a Liability type account",
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
        // Check if accounts already exist
        const existing = await tx.account.findMany({
          where: {
            tenantId,
            name: {
              in: [
                "Staff Salaries & Wages",
                "Salaries Payable",
                "Employee Salary Advances",
                "Employee Advances/Loans",
              ],
            },
          },
        });

        if (existing.length > 0) {
          return {
            success: false,
            error:
              "HR accounts already exist. Cannot initialize default accounts.",
          };
        }

        // Create accounts
        const salaryExpense = await tx.account.create({
          data: {
            tenantId,
            branchId: branchId || null,
            code: "6100",
            name: "Staff Salaries & Wages",
            type: "expense",
            subType: "operating_expense",
            description:
              "Salaries and wages paid to employees. Used when payroll is processed.",
            isActive: true,
          },
        });

        const salaryPayable = await tx.account.create({
          data: {
            tenantId,
            branchId: branchId || null,
            code: "2100",
            name: "Salaries Payable",
            type: "liability",
            subType: "current_liability",
            description:
              "Amount owed to employees for salaries processed but not yet paid.",
            isActive: true,
          },
        });

        const salaryAdvance = await tx.account.create({
          data: {
            tenantId,
            branchId: branchId || null,
            code: "1250",
            name: "Employee Advances/Loans",
            type: "asset",
            subType: "current_asset",
            description:
              "Advances and employee loans that will be recovered through future payrolls.",
            isActive: true,
          },
        });

        // Update HR configuration
        const config = await tx.hRAccountingConfig.upsert({
          where: { tenantId },
          create: {
            tenantId,
            salaryExpenseAccountId: salaryExpense.id,
            salaryPayableAccountId: salaryPayable.id,
            salaryAdvanceAccountId: salaryAdvance.id,
            isConfigured: true,
            configuredBy: userId,
            configuredAt: new Date(),
          },
          update: {
            salaryExpenseAccountId: salaryExpense.id,
            salaryPayableAccountId: salaryPayable.id,
            salaryAdvanceAccountId: salaryAdvance.id,
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
