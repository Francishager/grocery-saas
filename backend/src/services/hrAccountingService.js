/**
 * HR Accounting Service
 * Posts HR transactions into the general ledger and updates account balances.
 */

import prisma from "../db.js";

const DEBIT_NORMAL_ACCOUNT_TYPES = new Set(["asset", "expense", "expenses"]);

const ACCOUNT_LABELS = {
  salaryExpense: "Staff Salaries & Wages expense account",
  salaryPayable: "Salaries Payable liability account",
  salaryAdvance: "Employee Advances/Loans asset account",
  payeTax: "PAYE Tax liability account",
  socialSecurity: "Social Security liability account",
};

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function setupMessage(missingAccounts = []) {
  const missing = missingAccounts.length
    ? missingAccounts.map((key) => ACCOUNT_LABELS[key] || key).join(", ")
    : "Staff Salaries & Wages, Salaries Payable, and Employee Advances/Loans";
  return `HR accounting accounts are not configured. Create the required Chart of Accounts first and map them in HR > HR Accounting before posting. Missing: ${missing}.`;
}

function isDebitNormalAccount(account) {
  return DEBIT_NORMAL_ACCOUNT_TYPES.has(String(account?.type || "").trim().toLowerCase());
}

function journalLineBalanceDelta(account, debit, credit) {
  return isDebitNormalAccount(account) ? debit - credit : credit - debit;
}

class HRAccountingService {
  client(tx) {
    return tx || prisma;
  }

  async withTransaction(tx, callback) {
    if (tx) return callback(tx);
    return prisma.$transaction(callback);
  }

  async validateHRAccountConfiguration(tenantId, requiredAccounts = [], tx = null) {
    const db = this.client(tx);
    const config = await db.hRAccountingConfig.findUnique({ where: { tenantId } });

    if (!config || !config.isConfigured) {
      return {
        isValid: false,
        missingAccounts: requiredAccounts,
        error: setupMessage(requiredAccounts),
      };
    }

    const missing = [];
    if (requiredAccounts.includes("salaryExpense") && !config.salaryExpenseAccountId) missing.push("salaryExpense");
    if (requiredAccounts.includes("salaryPayable") && !config.salaryPayableAccountId) missing.push("salaryPayable");
    if (requiredAccounts.includes("salaryAdvance") && !config.salaryAdvanceAccountId) missing.push("salaryAdvance");
    if (requiredAccounts.includes("payeTax") && !config.payeTaxAccountId) missing.push("payeTax");
    if (requiredAccounts.includes("socialSecurity") && !config.socialSecurityAccountId) missing.push("socialSecurity");

    return {
      isValid: missing.length === 0,
      missingAccounts: missing,
      error: missing.length ? setupMessage(missing) : null,
      config,
    };
  }

  async verifyAccountsExist(tenantId, accountIds, tx = null) {
    const db = this.client(tx);
    const ids = [...new Set(accountIds.filter(Boolean))];
    const accounts = await db.account.findMany({
      where: { tenantId, id: { in: ids }, isActive: true },
    });
    const foundIds = new Set(accounts.map((account) => account.id));

    return {
      valid: ids.every((id) => foundIds.has(id)),
      invalidAccounts: ids.filter((id) => !foundIds.has(id)),
      accounts,
    };
  }

  async requireConfiguredAccounts(tx, tenantId, requiredAccounts) {
    const validation = await this.validateHRAccountConfiguration(tenantId, requiredAccounts, tx);
    if (!validation.isValid) {
      const error = new Error(validation.error || setupMessage(validation.missingAccounts));
      error.statusCode = 400;
      throw error;
    }

    const accountIds = [
      requiredAccounts.includes("salaryExpense") && validation.config.salaryExpenseAccountId,
      requiredAccounts.includes("salaryPayable") && validation.config.salaryPayableAccountId,
      requiredAccounts.includes("salaryAdvance") && validation.config.salaryAdvanceAccountId,
      requiredAccounts.includes("payeTax") && validation.config.payeTaxAccountId,
      requiredAccounts.includes("socialSecurity") && validation.config.socialSecurityAccountId,
    ].filter(Boolean);

    const accountCheck = await this.verifyAccountsExist(tenantId, accountIds, tx);
    if (!accountCheck.valid) {
      const error = new Error("One or more HR accounting accounts are missing or inactive. Create/configure them in HR > HR Accounting before posting.");
      error.statusCode = 400;
      throw error;
    }

    return { config: validation.config, accounts: accountCheck.accounts };
  }

  async nextJournalEntryNo(tx, tenantId) {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
    const lastEntry = await tx.journalEntry.findFirst({
      where: { tenantId, entryNo: { startsWith: `JE-${dateStr}-` } },
      orderBy: { entryNo: "desc" },
    });
    const lastSequence = Number(String(lastEntry?.entryNo || "").split("-")[2] || 0);
    return `JE-${dateStr}-${String(lastSequence + 1).padStart(3, "0")}`;
  }

  normalizeLines(lines) {
    if (!Array.isArray(lines) || !lines.length) {
      throw new Error("Journal lines are required");
    }

    const normalized = lines
      .map((line, index) => {
        const debit = money(line.debit);
        const credit = money(line.credit);
        const lineNo = index + 1;

        if (!line.accountId) throw new Error(`Select an account for HR journal line ${lineNo}`);
        if (debit < 0 || credit < 0) throw new Error(`Negative amounts are not allowed on HR journal line ${lineNo}`);
        if (debit > 0 && credit > 0) throw new Error(`HR journal line ${lineNo} cannot have both debit and credit`);

        return {
          accountId: line.accountId,
          debit,
          credit,
          description: line.description || null,
        };
      })
      .filter((line) => line.debit > 0 || line.credit > 0);

    if (!normalized.length) throw new Error("Journal lines must contain at least one amount");
    return normalized;
  }

  async createJournal(params) {
    const {
      tx = null,
      tenantId,
      branchId,
      date = new Date(),
      description,
      reference,
      sourceType,
      sourceId,
      userId,
      lines,
    } = params;

    return this.withTransaction(tx, async (db) => {
      if (sourceType && sourceId) {
        const existing = await db.journalEntry.findFirst({
          where: { tenantId, sourceType, sourceId },
          include: { lines: true },
        });
        if (existing) return { success: true, journalEntry: existing, alreadyPosted: true };
      }

      const normalizedLines = this.normalizeLines(lines);
      const totalDebit = normalizedLines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = normalizedLines.reduce((sum, line) => sum + line.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        const error = new Error("HR accounting journal is not balanced. Review salary, deduction, advance, and payment account mappings.");
        error.statusCode = 400;
        throw error;
      }

      const accountIds = [...new Set(normalizedLines.map((line) => line.accountId))];
      const accounts = await db.account.findMany({
        where: { tenantId, id: { in: accountIds }, isActive: true },
      });
      const accountsById = new Map(accounts.map((account) => [account.id, account]));
      if (accountIds.some((accountId) => !accountsById.has(accountId))) {
        const error = new Error("One or more HR accounting accounts are missing or inactive. Create/configure them in HR > HR Accounting before posting.");
        error.statusCode = 400;
        throw error;
      }

      const journalEntry = await db.journalEntry.create({
        data: {
          entryNo: await this.nextJournalEntryNo(db, tenantId),
          tenantId,
          branchId: branchId || null,
          date: new Date(date),
          description,
          reference,
          status: "posted",
          userId,
          sourceType,
          sourceId,
          lines: { create: normalizedLines },
        },
        include: { lines: true },
      });

      for (const line of normalizedLines) {
        const account = accountsById.get(line.accountId);
        await db.account.update({
          where: { id: line.accountId },
          data: { balance: { increment: journalLineBalanceDelta(account, line.debit, line.credit) } },
        });
      }

      return { success: true, journalEntry };
    });
  }

  async createSalaryAdvanceJournal(params) {
    const { tx = null, tenantId, branchId, salaryAdvanceId, amount, paymentAccountId, employeeName, userId, date } = params;

    return this.withTransaction(tx, async (db) => {
      const { config } = await this.requireConfiguredAccounts(db, tenantId, ["salaryAdvance"]);
      const paymentAccount = await db.account.findFirst({ where: { id: paymentAccountId, tenantId, isActive: true } });
      if (!paymentAccount || String(paymentAccount.type || "").toLowerCase() !== "asset") {
        throw new Error("Salary advance must be paid from an active Asset account such as Cash, Bank, or Mobile Money.");
      }

      return this.createJournal({
        tx: db,
        tenantId,
        branchId,
        date,
        description: `Salary advance - ${employeeName}`,
        reference: `ADV-${salaryAdvanceId}`,
        sourceType: "SALARY_ADVANCE",
        sourceId: salaryAdvanceId,
        userId,
        lines: [
          { accountId: config.salaryAdvanceAccountId, debit: amount, credit: 0, description: `Salary advance to ${employeeName}` },
          { accountId: paymentAccountId, debit: 0, credit: amount, description: `Payment for ${employeeName} salary advance` },
        ],
      });
    });
  }

  async createPayrollJournal(params) {
    const {
      tx = null,
      tenantId,
      branchId,
      payrollId,
      grossSalary,
      salaryAdvanceRecovery = 0,
      paye = 0,
      socialSecurityTax = 0,
      employeeName,
      userId,
      date,
    } = params;

    return this.withTransaction(tx, async (db) => {
      const requiredAccounts = ["salaryExpense", "salaryPayable"];
      if (money(salaryAdvanceRecovery) > 0) requiredAccounts.push("salaryAdvance");
      if (money(paye) > 0) requiredAccounts.push("payeTax");
      if (money(socialSecurityTax) > 0) requiredAccounts.push("socialSecurity");

      const { config } = await this.requireConfiguredAccounts(db, tenantId, requiredAccounts);
      const salaryPayableCredit = money(grossSalary) - money(salaryAdvanceRecovery) - money(paye) - money(socialSecurityTax);
      if (salaryPayableCredit < -0.01) {
        throw new Error("Payroll deductions exceed gross salary. Review the payroll before posting.");
      }

      return this.createJournal({
        tx: db,
        tenantId,
        branchId,
        date,
        description: `Payroll - ${employeeName}`,
        reference: `PAYROLL-${payrollId}`,
        sourceType: "PAYROLL",
        sourceId: payrollId,
        userId,
        lines: [
          { accountId: config.salaryExpenseAccountId, debit: grossSalary, credit: 0, description: `Salary expense - ${employeeName}` },
          { accountId: config.salaryPayableAccountId, debit: 0, credit: Math.max(0, salaryPayableCredit), description: `Salary payable and payroll deductions - ${employeeName}` },
          money(paye) > 0 && { accountId: config.payeTaxAccountId, debit: 0, credit: paye, description: `PAYE tax payable - ${employeeName}` },
          money(socialSecurityTax) > 0 && { accountId: config.socialSecurityAccountId, debit: 0, credit: socialSecurityTax, description: `Social security payable - ${employeeName}` },
          money(salaryAdvanceRecovery) > 0 && { accountId: config.salaryAdvanceAccountId, debit: 0, credit: salaryAdvanceRecovery, description: `Salary advance recovery - ${employeeName}` },
        ].filter(Boolean),
      });
    });
  }

  async createSalaryPaymentJournal(params) {
    const { tx = null, tenantId, branchId, paymentId, amount, paymentAccountId, employeeName, userId, date } = params;

    return this.withTransaction(tx, async (db) => {
      const { config } = await this.requireConfiguredAccounts(db, tenantId, ["salaryPayable"]);
      const paymentAccount = await db.account.findFirst({ where: { id: paymentAccountId, tenantId, isActive: true } });
      if (!paymentAccount || String(paymentAccount.type || "").toLowerCase() !== "asset") {
        throw new Error("Salary payment must be made from an active Asset account such as Cash, Bank, or Mobile Money.");
      }

      return this.createJournal({
        tx: db,
        tenantId,
        branchId,
        date,
        description: `Salary payment - ${employeeName}`,
        reference: `PAYMENT-${paymentId}`,
        sourceType: "PAYROLL_PAYMENT",
        sourceId: paymentId,
        userId,
        lines: [
          { accountId: config.salaryPayableAccountId, debit: amount, credit: 0, description: `Salary payment - ${employeeName}` },
          { accountId: paymentAccountId, debit: 0, credit: amount, description: `Payment for ${employeeName} salary` },
        ],
      });
    });
  }

  async createSalaryAdvanceRepaymentJournal(params) {
    const { tx = null, tenantId, branchId, recoveryId, amount, paymentAccountId, employeeName, userId, date } = params;

    return this.withTransaction(tx, async (db) => {
      const { config } = await this.requireConfiguredAccounts(db, tenantId, ["salaryAdvance"]);
      const paymentAccount = await db.account.findFirst({ where: { id: paymentAccountId, tenantId, isActive: true } });
      if (!paymentAccount || String(paymentAccount.type || "").toLowerCase() !== "asset") {
        throw new Error("Advance/loan repayment must be received into an active Asset account such as Cash, Bank, or Mobile Money.");
      }

      return this.createJournal({
        tx: db,
        tenantId,
        branchId,
        date,
        description: `Advance/loan repayment - ${employeeName}`,
        reference: `ADV-REPAY-${recoveryId}`,
        sourceType: "SALARY_ADVANCE_REPAYMENT",
        sourceId: recoveryId,
        userId,
        lines: [
          { accountId: paymentAccountId, debit: amount, credit: 0, description: `Direct repayment from ${employeeName}` },
          { accountId: config.salaryAdvanceAccountId, debit: 0, credit: amount, description: `Reduce employee advance/loan - ${employeeName}` },
        ],
      });
    });
  }

  async reverseJournalEntry(params) {
    const { tx = null, tenantId, originalEntryId, reason, userId, date = new Date() } = params;

    return this.withTransaction(tx, async (db) => {
      const originalEntry = await db.journalEntry.findFirst({
        where: { id: originalEntryId, tenantId },
        include: { lines: true },
      });

      if (!originalEntry) throw new Error("Original journal entry not found");
      if (originalEntry.status === "reversed" && originalEntry.reversalJournalId) {
        const reversalEntry = await db.journalEntry.findUnique({
          where: { id: originalEntry.reversalJournalId },
          include: { lines: true },
        });
        return { success: true, reversalEntry, alreadyReversed: true };
      }

      const reversal = await this.createJournal({
        tx: db,
        tenantId,
        branchId: originalEntry.branchId,
        date,
        description: `Reversal of ${originalEntry.description}`,
        reference: originalEntry.reference,
        sourceType: "HR_JOURNAL_REVERSAL",
        sourceId: originalEntryId,
        userId,
        lines: originalEntry.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          description: `Reversal - ${line.description || originalEntry.description || "HR journal"}`,
        })),
      });

      await db.journalEntry.update({
        where: { id: originalEntryId },
        data: {
          status: "reversed",
          reversalJournalId: reversal.journalEntry.id,
          reversalReason: reason,
          reversedBy: userId,
          reversedAt: new Date(date),
        },
      });

      return { success: true, reversalEntry: reversal.journalEntry };
    });
  }

  async getExistingJournalEntry(tenantId, sourceType, sourceId, tx = null) {
    return this.client(tx).journalEntry.findFirst({
      where: { tenantId, sourceType, sourceId },
      include: { lines: true },
    });
  }

  generateEntryNumber(lastEntryNo) {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
    if (!lastEntryNo) return `JE-${dateStr}-001`;

    const parts = lastEntryNo.split("-");
    const lastDate = parts[1];
    const lastSequence = parseInt(parts[2], 10) || 0;
    return lastDate === dateStr
      ? `JE-${dateStr}-${String(lastSequence + 1).padStart(3, "0")}`
      : `JE-${dateStr}-001`;
  }

  async createAuditLog(params) {
    const {
      tx = null,
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

    return this.client(tx).hRAuditLog.create({
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
  }

  async getAuditTrail(tenantId, recordType, recordId, tx = null) {
    return this.client(tx).hRAuditLog.findMany({
      where: { tenantId, recordType, recordId },
      orderBy: { createdAt: "asc" },
    });
  }
}

export { setupMessage };
export default new HRAccountingService();
