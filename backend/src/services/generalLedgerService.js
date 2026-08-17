/**
 * General Ledger Service - Phase 3 Financial Management
 * Manages chart of accounts, account hierarchies, and GL operations
 */

class GeneralLedgerService {
  // Create new GL account
  async createAccount(tenantId, data) {
    try {
      const { code, name, type, category, subCategory, description, parentAccountId, normalBalance } = data;
      
      if (!code || !name || !type) {
        throw new Error('Code, name, and type are required');
      }

      const account = await db.generalLedgerAccount.create({
        data: {
          tenantId,
          code,
          name,
          type, // Asset, Liability, Equity, Revenue, Expense
          category, // Bank, Cash, Receivable, Inventory, etc.
          subCategory,
          description,
          parentAccountId: parentAccountId || null,
          normalBalance: normalBalance || (type === 'Expense' || type === 'Asset' ? 'Debit' : 'Credit'),
          isActive: true,
        },
      });

      return account;
    } catch (error) {
      throw new Error(`Failed to create GL account: ${error.message}`);
    }
  }

  // Get accounts (tree structure)
  async getAccounts(tenantId, filters = {}) {
    try {
      const accounts = await db.generalLedgerAccount.findMany({
        where: {
          tenantId,
          isActive: true,
          ...(filters.type && { type: filters.type }),
          ...(filters.category && { category: filters.category }),
        },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      });

      return accounts;
    } catch (error) {
      throw new Error(`Failed to fetch GL accounts: ${error.message}`);
    }
  }

  // Update account
  async updateAccount(tenantId, accountId, data) {
    try {
      const account = await db.generalLedgerAccount.update({
        where: { id: accountId, tenantId },
        data: { ...data, updatedAt: new Date() },
      });

      return account;
    } catch (error) {
      throw new Error(`Failed to update GL account: ${error.message}`);
    }
  }

  // Get account with balance
  async getAccountWithBalance(tenantId, accountId, asOfDate) {
    try {
      const account = await db.generalLedgerAccount.findUnique({
        where: { id: accountId, tenantId },
      });

      if (!account) throw new Error('Account not found');

      // Calculate balance from journal entries
      const entries = await db.journalEntryLine.findMany({
        where: {
          accountId: accountId,
          journalEntry: {
            tenantId,
            postDate: { lte: asOfDate || new Date() },
            status: 'posted',
          },
        },
      });

      let balance = 0;
      entries.forEach(entry => {
        if (entry.debitAmount) balance += entry.debitAmount;
        if (entry.creditAmount) balance -= entry.creditAmount;
      });

      return { ...account, balance };
    } catch (error) {
      throw new Error(`Failed to get account balance: ${error.message}`);
    }
  }

  // Delete/deactivate account
  async deactivateAccount(tenantId, accountId) {
    try {
      return await db.generalLedgerAccount.update({
        where: { id: accountId, tenantId },
        data: { isActive: false },
      });
    } catch (error) {
      throw new Error(`Failed to deactivate account: ${error.message}`);
    }
  }

  // Chart of accounts hierarchy
  async getChartOfAccounts(tenantId) {
    try {
      const accounts = await this.getAccounts(tenantId);
      
      // Group by type
      const chart = {};
      accounts.forEach(acc => {
        if (!chart[acc.type]) chart[acc.type] = [];
        chart[acc.type].push(acc);
      });

      return chart;
    } catch (error) {
      throw new Error(`Failed to get chart: ${error.message}`);
    }
  }
}

module.exports = new GeneralLedgerService();
