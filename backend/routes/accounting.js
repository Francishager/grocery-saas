import { Router } from "express";
import prisma from "../src/db.js";
import { loadLedgerBalances, ledgerBalanceSheet } from "../src/utils/reportAccounting.js";
import { authenticateToken, requirePermission, requireAnyPermission, getPaymentMethodPermissions, canUseTransactionAccountForPayment } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";
import { syncLinkedTransactionAccountBalance } from "../src/utils/accountingSync.js";

const router = Router();
const LINKED_CASH_ACCOUNT_MARKER = "cashAccount:";
const BALANCE_EPSILON = 0.01;
const DEBIT_NORMAL_ACCOUNT_TYPES = new Set(["asset", "expense", "expenses"]);
const EXPENSE_ACCOUNT_TYPES = new Set(["expense", "expenses"]);
const AUTO_DEFAULT_CASH_ACCOUNT_NAMES = new Set(["Cash Box", "Mobile Money", "Bank Account", "Card Payments"]);
const TRANSACTION_ACCOUNT_PERMISSION_KEYS = {
  cash: "canUseCash",
  safe: "canUseCash",
  mobile_money: "canUseMobileMoney",
  bank: "canUseBank",
  bank_transfer: "canUseBank",
  cheque: "canUseBank",
  card: "canUseCard",
};
const PAYMENT_METHOD_PERMISSION_SELECT = {
  canUseCash: true,
  canUseMobileMoney: true,
  canUseBank: true,
  canUseCard: true,
};
const JOURNAL_ACTION_ACCOUNT_TYPES = {
  register_income: ["income", "revenue"],
  register_expense: ["expense", "expenses"],
  register_capital: ["equity"],
  register_liability: ["liability"],
  register_asset: ["asset"],
  clear_payable: ["liability"],
  collect_receivable: ["asset"],
};
const STANDARD_HR_ACCOUNT_NAMES = new Set([
  "staff salaries & wages",
  "salaries payable",
  "employee advances/loans",
  "employee advances / loans",
  "paye tax payable",
  "social security payable",
]);

const cashAccountMarker = (cashAccountId) => `${LINKED_CASH_ACCOUNT_MARKER}${cashAccountId}`;

const linkedCashAccountId = (account) => {
  const match = String(account?.description || "").match(/cashAccount:([^\s]+)/);
  return match?.[1] || null;
};

const normalizeValue = (value) => String(value || "").trim().toLowerCase();

const isDebitNormalAccount = (account) => DEBIT_NORMAL_ACCOUNT_TYPES.has(normalizeValue(account?.type));

const journalLineBalanceDelta = (account, debit, credit) => {
  return isDebitNormalAccount(account) ? debit - credit : credit - debit;
};

const isExpenseAccount = (account) => EXPENSE_ACCOUNT_TYPES.has(normalizeValue(account?.type));

async function hrProtectedAccountIds(tenantId, client = prisma) {
  const config = await client.hRAccountingConfig.findUnique({
    where: { tenantId },
    select: {
      salaryExpenseAccountId: true,
      salaryPayableAccountId: true,
      salaryAdvanceAccountId: true,
      payeTaxAccountId: true,
      socialSecurityAccountId: true,
    },
  }).catch(() => null);
  return new Set(Object.values(config || {}).filter(Boolean));
}

function isHrProtectedAccount(account, protectedIds = new Set()) {
  if (!account) return false;
  if (protectedIds.has(account.id)) return true;
  const name = normalizeValue(account.name);
  if (STANDARD_HR_ACCOUNT_NAMES.has(name)) return true;
  const description = normalizeValue(account.description);
  return description.includes("payroll") || description.includes("salary") || description.includes("employee social security") || description.includes("social security deductions");
}

function markHrProtectedAccounts(accounts, protectedIds) {
  return (accounts || []).map((account) => {
    const children = markHrProtectedAccounts(account.children || [], protectedIds);
    return { ...account, children, isHrProtected: isHrProtectedAccount(account, protectedIds) };
  });
}

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const formatAmount = (value) => Number(value || 0).toFixed(2);

const normalizeCurrency = (currency) => {
  const normalized = String(currency || "UGX").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "UGX";
};

async function tenantCurrency(tenantId, client = prisma) {
  if (!tenantId) return "UGX";
  const tenant = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { currency: true },
  });
  return normalizeCurrency(tenant?.currency);
}

const transactionAccountPermissionKey = (cashAccountType) => {
  return TRANSACTION_ACCOUNT_PERMISSION_KEYS[normalizeValue(cashAccountType)];
};

const transactionAccountMatchesPaymentMethod = (cashAccountType, paymentMethod) => {
  const type = normalizeValue(cashAccountType);
  const method = normalizeValue(paymentMethod);
  if (!method) return true;
  if (method === "cash") return type === "cash";
  if (method === "safe") return type === "safe" || type === "cash";
  if (["bank", "bank_transfer", "cheque"].includes(method)) return type === "bank";
  if (method === "mobile_money") return type === "mobile_money";
  if (method === "card") return type === "card";
  return type === method;
};

const hasBroadTransactionAccountAccess = (req) => {
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  return permissions.includes("*") ||
    permissions.includes("canUseAnyTransactionAccount");
};

const hasRequestPermission = (req, permission) => {
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  return permissions.includes("*") || permissions.includes(permission);
};

const canSwitchAccountingBranch = (req) => req.user?.role === "owner" || hasRequestPermission(req, "canViewBranch");

const accountingBranchRequest = (req, source = "query") => {
  if (canSwitchAccountingBranch(req)) return req;
  if (source === "body") return { ...req, body: { ...req.body, branchId: null, branch_id: null } };
  if (source === "params") return { ...req, params: { ...req.params, branchId: null, branch_id: null } };
  return { ...req, query: { ...req.query, branchId: null, branch_id: null } };
};

async function requestUserCashAccountId(req) {
  if (req.userCashAccountId) return req.userCashAccountId;
  if (req.user?.cashAccountId) return req.user.cashAccountId;
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { cashAccountId: true },
  });
  return user?.cashAccountId || null;
}

async function paymentMethodPermissionsForRequest(req) {
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  if (permissions.includes("*")) return getPaymentMethodPermissions(req);

  const permissionKeys = Object.values(TRANSACTION_ACCOUNT_PERMISSION_KEYS);
  if (permissionKeys.some((key) => permissions.includes(key))) {
    return getPaymentMethodPermissions(req);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      permissions: {
        select: PAYMENT_METHOD_PERMISSION_SELECT,
      },
    },
  });

  return getPaymentMethodPermissions(req, user?.permissions);
}

const canUseTransactionAccount = async (req, cashAccount) => {
  if (!req.userCashAccountId) req.userCashAccountId = await requestUserCashAccountId(req);
  return canUseTransactionAccountForPayment(req, cashAccount, normalizeValue(cashAccount?.type));
};

const normalizeJournalLines = (lines) => {
  if (!Array.isArray(lines) || !lines.length) {
    throw httpError(400, "Journal lines required");
  }

  return lines.map((line, index) => {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    const lineNo = index + 1;

    if (!line.accountId) {
      throw httpError(400, `Select an account for journal line ${lineNo}`);
    }
    if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
      throw httpError(400, `Enter valid debit and credit amounts for journal line ${lineNo}`);
    }
    if (debit < 0 || credit < 0) {
      throw httpError(400, `Negative debit or credit amounts are not allowed on journal line ${lineNo}`);
    }
    if (debit <= 0 && credit <= 0) {
      throw httpError(400, `Enter either a debit or a credit amount on journal line ${lineNo}`);
    }
    if (debit > 0 && credit > 0) {
      throw httpError(400, `Journal line ${lineNo} cannot have both debit and credit amounts`);
    }

    return {
      accountId: line.accountId,
      debit,
      credit,
      description: line.description || null,
    };
  });
};

async function ensureTransactionAccounts(tenantId, client = prisma) {
  const cashAccounts = await client.cashAccount.findMany({
    where: { tenantId, isActive: true },
    include: {
      _count: {
        select: {
          AssignedUsers: true,
          CashTransaction: true,
          Expense: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  for (const cashAccount of cashAccounts) {
    const marker = cashAccountMarker(cashAccount.id);
    const description = `Linked transaction account ${marker}`;
    const subType = `transaction_${cashAccount.type}`;
    const existing = await client.account.findFirst({
      where: { tenantId, description: { contains: marker } },
      include: { _count: { select: { journalLines: true, children: true } } },
    });
    const isUnusedAutoDefault =
      AUTO_DEFAULT_CASH_ACCOUNT_NAMES.has(cashAccount.name) &&
      Number(cashAccount.balance || 0) === 0 &&
      Number(cashAccount._count?.AssignedUsers || 0) === 0 &&
      Number(cashAccount._count?.CashTransaction || 0) === 0 &&
      Number(cashAccount._count?.Expense || 0) === 0;

    if (isUnusedAutoDefault) {
      if (existing && Number(existing._count?.journalLines || 0) === 0 && Number(existing._count?.children || 0) === 0) {
        await client.account.delete({ where: { id: existing.id } });
      }
      continue;
    }

    if (existing) {
      await client.account.update({
        where: { id: existing.id },
        data: {
          name: cashAccount.name,
          branchId: cashAccount.branchId || existing.branchId || null,
          type: "asset",
          subType,
          balance: cashAccount.balance,
          isActive: cashAccount.isActive,
          description,
        },
      });
      continue;
    }

    let code = `TX-${cashAccount.id.slice(-8).toUpperCase()}`;
    let suffix = 1;
    while (await client.account.findFirst({ where: { tenantId, code } })) {
      code = `TX-${cashAccount.id.slice(-6).toUpperCase()}-${suffix++}`;
    }

    await client.account.create({
      data: {
        tenantId,
        code,
        name: cashAccount.name,
        branchId: cashAccount.branchId || null,
        type: "asset",
        subType,
        balance: cashAccount.balance,
        description,
      },
    });
  }
}

// List accounts (chart of accounts)
router.get("/accounts", authenticateToken, requireAnyPermission(["canViewAccounting", "canCreateAccounting", "canViewChartOfAccounts", "canCreateChartOfAccounts", "canEditChartOfAccounts"]), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    await ensureTransactionAccounts(tenantId);
    const protectedIds = await hrProtectedAccountIds(tenantId);
    const branchSelect = { id: true, name: true };
    const accounts = await prisma.account.findMany({
      where: { tenantId },
      include: {
        parent: true,
        branch: { select: branchSelect },
        children: { include: { branch: { select: branchSelect } } },
      },
      orderBy: { code: "asc" },
    });
    res.json(markHrProtectedAccounts(accounts, protectedIds));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// Create account
router.post("/accounts", authenticateToken, requirePermission("canCreateChartOfAccounts"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { code, name, type, subType, parentId, parentCode, parentName, description, branchId } = req.body;
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "body"), { source: "body", allowOwnerAll: true });
    if (!code || !name || !type) return res.status(400).json({ error: "code, name, type required" });

    let resolvedParentId = parentId || null;
    if (!resolvedParentId && parentCode) {
      let parentAccount = await prisma.account.findFirst({
        where: { tenantId, code: parentCode },
      });
      if (!parentAccount) {
        parentAccount = await prisma.account.create({
          data: {
            tenantId,
            code: parentCode,
            name: parentName || parentCode,
            type,
            subType: 'category',
            description: `Category ${parentName || parentCode}`,
            branchId: scope.branchId || null,
          },
        });
      }
      resolvedParentId = parentAccount.id;
    }

    const account = await prisma.account.create({
      data: { tenantId, code, name, type, subType, parentId: resolvedParentId, description, branchId: scope.branchId || null },
    });
    res.status(201).json(account);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Account code already exists" });
    handleBranchError(res, err, "Failed to create account");
  }
});

// Update account
router.put("/accounts/:id", authenticateToken, requirePermission("canEditChartOfAccounts"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { name, type, subType, parentId, description, isActive, branchId } = req.body;
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "body"), { source: "body", allowOwnerAll: true });
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Account not found" });

    const account = await prisma.account.update({
      where: { id: existing.id },
      data: { name, type, subType, parentId, description, isActive, branchId: scope.branchId || (branchId === undefined ? undefined : null) },
    });
    res.json(account);
  } catch (err) {
    handleBranchError(res, err, "Failed to update account");
  }
});

// Chart of Accounts records are part of the accounting audit structure and must be retained.
router.delete("/accounts/:id", authenticateToken, requirePermission("canEditChartOfAccounts"), requireFeature("accounting"), async (req, res) => {
  return res.status(400).json({
    error: "Chart of Accounts records cannot be deleted. Deactivate the account if it should no longer be used.",
  });
});

// List journal entries
router.get("/journal", authenticateToken, requirePermission("canViewAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "query"), { source: "query", allowOwnerAll: true });
    const entries = await prisma.journalEntry.findMany({
      where: scopedWhere(scope, {}),
      include: {
        lines: { include: { account: { select: { id: true, code: true, name: true, type: true, subType: true, description: true } } } },
        user: { select: { id: true, fname: true, lname: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json(entries);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch journal entries");
  }
});

// Reverse an expense journal entry without deleting the original audit trail.
router.post("/journal/:id/reverse", authenticateToken, requirePermission("canReverseAccountingEntry"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "query"), { source: "query", allowOwnerAll: true });
    const reversalReason = String(req.body?.reason || "Expense reversal").trim() || "Expense reversal";

    await ensureTransactionAccounts(tenantId);

    const original = await prisma.journalEntry.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { lines: { include: { account: true } } },
    });

    if (!original) return res.status(404).json({ error: "Journal entry not found" });
    if (original.reversalOfId) return res.status(400).json({ error: "A reversal entry cannot be reversed from this action" });
    if (original.status === "reversed" || original.reversalJournalId) return res.status(400).json({ error: "This journal entry has already been reversed" });
    if (!(original.lines || []).some((line) => isExpenseAccount(line.account))) {
      return res.status(400).json({ error: "Only expense journal entries can be reversed from this action" });
    }

    const reversalLines = original.lines.map((line) => ({
      accountId: line.accountId,
      debit: Number(line.credit || 0),
      credit: Number(line.debit || 0),
      description: "Reversal of " + original.entryNo + ": " + (line.description || original.description || reversalReason),
    }));

    const totalDebit = reversalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = reversalLines.reduce((sum, line) => sum + line.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: "Original journal entry is not balanced and cannot be reversed safely" });
    }

    const linkedCashAccountIds = [...new Set(original.lines.map((line) => linkedCashAccountId(line.account)).filter(Boolean))];
    const cashAccounts = linkedCashAccountIds.length
      ? await prisma.cashAccount.findMany({ where: { tenantId, id: { in: linkedCashAccountIds }, isActive: true } })
      : [];
    const cashAccountsById = new Map(cashAccounts.map((account) => [account.id, account]));

    for (const line of original.lines) {
      const cashAccountId = linkedCashAccountId(line.account);
      if (!cashAccountId) continue;
      const cashAccount = cashAccountsById.get(cashAccountId);
      if (!cashAccount) return res.status(400).json({ error: "Linked transaction account for " + line.account.name + " was not found or is inactive" });
      if (!(await canUseTransactionAccount(req, cashAccount))) {
        return res.status(403).json({ error: "You do not have permission to reverse entries affecting " + cashAccount.name });
      }
    }

    const reversal = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const entryNo = "REV-" + Date.now();
      const createdReversal = await tx.journalEntry.create({
        data: {
          entryNo,
          tenantId,
          branchId: original.branchId || null,
          date: now,
          description: "Reversal of " + original.entryNo + ": " + (original.description || "Expense journal entry"),
          reference: original.reference || original.entryNo,
          status: "posted",
          userId: req.user.id,
          sourceType: "JOURNAL_REVERSAL",
          sourceId: original.id,
          reversalOfId: original.id,
          reversalReason,
          lines: { create: reversalLines },
        },
        include: {
          lines: { include: { account: { select: { id: true, code: true, name: true, type: true, subType: true, description: true } } } },
          user: { select: { id: true, fname: true, lname: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      await tx.journalEntry.update({
        where: { id: original.id },
        data: { status: "reversed", reversalJournalId: createdReversal.id, reversalReason, reversedBy: req.user.id, reversedAt: now },
      });

      for (const line of reversalLines) {
        const originalLine = original.lines.find((item) => item.accountId === line.accountId);
        const account = originalLine?.account;
        const delta = journalLineBalanceDelta(account, line.debit, line.credit);
        await tx.account.update({ where: { id: line.accountId }, data: { balance: { increment: delta } } });

        const cashAccountId = linkedCashAccountId(account);
        if (cashAccountId && Math.abs(delta) > 0) {
          const updatedCashAccount = await tx.cashAccount.update({ where: { id: cashAccountId }, data: { balance: { increment: delta } } });
          await tx.cashTransaction.create({
            data: {
              tenantId,
              accountId: cashAccountId,
              type: delta >= 0 ? "journal_reversal_in" : "journal_reversal_out",
              amount: Math.abs(delta),
              balanceAfter: updatedCashAccount.balance,
              reference: entryNo,
              description: "Reversal of " + original.entryNo,
              userId: req.user.id,
            },
          });
        }
      }

      for (const cashAccountId of linkedCashAccountIds) {
        await syncLinkedTransactionAccountBalance(tx, tenantId, cashAccountId).catch(() => null);
      }

      return createdReversal;
    });

    res.status(201).json({ entry: reversal, message: "Expense journal entry reversed" });
  } catch (err) {
    console.error("Reverse journal entry error:", err);
    if (err.code === "P2002") return res.status(409).json({ error: "This journal entry has already been reversed" });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    handleBranchError(res, err, "Failed to reverse journal entry");
  }
});

// Create journal entry
router.post("/journal", authenticateToken, requirePermission("canCreateAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { date, description, reference, lines = [], branchId, action, paymentMethod, paymentAccountId } = req.body;
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "body"), { source: "body", allowOwnerAll: true });
    const normalizedAction = normalizeValue(action);
    const requestedPaymentMethod = normalizeValue(paymentMethod);

    const normalizedLines = normalizeJournalLines(lines);
    const uniqueLineAccountIds = new Set(normalizedLines.map((line) => line.accountId));
    if (uniqueLineAccountIds.size !== normalizedLines.length) {
      return res.status(400).json({ error: "Each account can only be selected once in the same journal entry" });
    }

    await ensureTransactionAccounts(tenantId);

    const totalDebit = normalizedLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = normalizedLines.reduce((sum, l) => sum + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: "Debits and credits must balance" });
    }

    const entryNo = `JE-${Date.now()}`;

    const accountIds = [...uniqueLineAccountIds];
    const accounts = await prisma.account.findMany({
      where: { tenantId, id: { in: accountIds } },
      include: { _count: { select: { children: true } } },
    });
    if (accounts.length !== accountIds.length) {
      return res.status(400).json({ error: "One or more accounts were not found" });
    }
    const parentPostingAccount = accounts.find((account) => Number(account._count?.children || 0) > 0 || normalizeValue(account.subType) === "category");
    if (parentPostingAccount) {
      return res.status(400).json({ error: `${parentPostingAccount.name} is a parent account. Select a sub-account for posting.` });
    }
    const protectedIds = await hrProtectedAccountIds(tenantId);
    const protectedPostingAccount = accounts.find((account) => isHrProtectedAccount(account, protectedIds));
    if (protectedPostingAccount) {
      return res.status(400).json({
        error: `${protectedPostingAccount.name} is controlled by HR Accounting and cannot be selected in manual accounting entries. Use HR Accounting payroll, salary payment, advance, or loan workflows instead.`,
      });
    }
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const linkedCashAccountIds = [...new Set(accounts.map(linkedCashAccountId).filter(Boolean))];
    const cashAccounts = linkedCashAccountIds.length
      ? await prisma.cashAccount.findMany({ where: { tenantId, id: { in: linkedCashAccountIds }, isActive: true } })
      : [];
    const cashAccountsById = new Map(cashAccounts.map((account) => [account.id, account]));

    if (normalizedAction) {
      const allowedTypes = JOURNAL_ACTION_ACCOUNT_TYPES[normalizedAction];
      if (!allowedTypes) {
        return res.status(400).json({ error: "Select a valid journal action" });
      }
      if (!paymentAccountId || !uniqueLineAccountIds.has(paymentAccountId)) {
        return res.status(400).json({ error: "Select the transaction account used for this journal action" });
      }

      const paymentAccount = accountsById.get(paymentAccountId);
      const paymentCashAccountId = linkedCashAccountId(paymentAccount);
      const paymentCashAccount = paymentCashAccountId ? cashAccountsById.get(paymentCashAccountId) : null;
      if (!paymentCashAccount) {
        return res.status(400).json({ error: "The selected transaction account was not found or is inactive" });
      }
      if (requestedPaymentMethod && !transactionAccountMatchesPaymentMethod(paymentCashAccount.type, requestedPaymentMethod)) {
        return res.status(400).json({ error: `The selected transaction account does not match ${paymentMethod} payments` });
      }

      for (const account of accounts) {
        if (account.id === paymentAccountId) continue;
        if (linkedCashAccountId(account)) {
          return res.status(400).json({ error: "Choose a normal chart account for the selected action. Cash, safe, bank, and mobile money accounts belong in the transaction account field." });
        }
        if (!allowedTypes.includes(normalizeValue(account.type))) {
          return res.status(400).json({ error: `${account.name} does not match the selected journal action` });
        }
      }
    }

    const accountDeltas = new Map();

    for (const line of normalizedLines) {
      const account = accountsById.get(line.accountId);
      const delta = journalLineBalanceDelta(account, line.debit, line.credit);
      accountDeltas.set(line.accountId, (accountDeltas.get(line.accountId) || 0) + delta);
    }

    for (const [accountId, delta] of accountDeltas) {
      const account = accountsById.get(accountId);
      const projectedBalance = Number(account.balance || 0) + delta;
      if (delta < 0 && projectedBalance < -BALANCE_EPSILON) {
        return res.status(400).json({
          error: `Insufficient balance in ${account.name}. Available: ${formatAmount(account.balance)}, required: ${formatAmount(Math.abs(delta))}`,
        });
      }

      const cashAccountId = linkedCashAccountId(account);
      if (!cashAccountId) continue;

      const cashAccount = cashAccountsById.get(cashAccountId);
      if (!cashAccount) {
        return res.status(400).json({ error: `Linked transaction account for ${account.name} was not found or is inactive` });
      }
      if (!(await canUseTransactionAccount(req, cashAccount))) {
        return res.status(403).json({
          error: `You do not have permission to use ${cashAccount.name} as a transaction account. Please contact your administrator.`,
        });
      }

      const projectedCashBalance = Number(cashAccount.balance || 0) + delta;
      if (delta < 0 && projectedCashBalance < -BALANCE_EPSILON) {
        return res.status(400).json({
          error: `Insufficient balance in ${cashAccount.name}. Available: ${formatAmount(cashAccount.balance)}, required: ${formatAmount(Math.abs(delta))}`,
        });
      }
    }

    const entry = await prisma.$transaction(async (tx) => {
      const createdEntry = await tx.journalEntry.create({
        data: {
          entryNo,
          tenantId,
          branchId: scope.branchId || null,
          date: date ? new Date(date) : new Date(),
          description,
          reference,
          status: "posted",
          userId: req.user.id,
          lines: {
            create: normalizedLines.map((l) => ({
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit,
              description: l.description,
            })),
          },
        },
        include: {
          lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } },
          user: { select: { id: true, fname: true, lname: true } },
        },
      });

      for (const cashAccountId of linkedCashAccountIds) {
        await syncLinkedTransactionAccountBalance(tx, tenantId, cashAccountId).catch(() => null);
      }

      for (const line of normalizedLines) {
        const account = accountsById.get(line.accountId);
        const delta = journalLineBalanceDelta(account, line.debit, line.credit);
        await tx.account.update({
          where: { id: line.accountId },
          data: { balance: { increment: delta } },
        });

        const cashAccountId = linkedCashAccountId(account);
        if (cashAccountId && Math.abs(delta) > 0) {
          const updatedCashAccount = await tx.cashAccount.update({
            where: { id: cashAccountId },
            data: { balance: { increment: delta } },
          });

          await tx.cashTransaction.create({
            data: {
              tenantId,
              accountId: cashAccountId,
              type: delta >= 0 ? "journal_in" : "journal_out",
              amount: Math.abs(delta),
              balanceAfter: updatedCashAccount.balance,
              reference: reference || entryNo,
              description: description || line.description || "Journal entry",
              userId: req.user.id,
            },
          });
        }
      }

      return createdEntry;
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error("Create journal entry error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

// Financial statements share the same account balances as the Reports page.
router.get("/reports/trial-balance", authenticateToken, requirePermission("canViewFinancialReport"), requireFeature("accounting"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "query"), { source: "query", allowOwnerAll: true });
    const accounts = await loadLedgerBalances(prisma, scope, reportEndDate(req.query.to));
    const totalDebit = accounts.reduce((sum, account) => sum + account.debit, 0);
    const totalCredit = accounts.reduce((sum, account) => sum + account.credit, 0);
    const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
    res.json({ accounts, totalDebit, totalCredit, difference, isBalanced: Math.abs(difference) < 0.01 });
  } catch (err) { handleBranchError(res, err, "Failed to generate trial balance"); }
});

router.get("/reports/profit-loss", authenticateToken, requirePermission("canViewFinancialReport"), requireFeature("accounting"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "query"), { source: "query", allowOwnerAll: true });
    const accounts = await loadLedgerBalances(prisma, scope, reportEndDate(req.query.to));
    const from = req.query.from ? new Date(req.query.from) : null;
    const periodBalance = (account) => !from ? account.balance : account.details
      .filter((row) => new Date(row.date) >= from)
      .reduce((sum, row) => sum + (["revenue", "income"].includes(account.type) ? row.credit - row.debit : row.debit - row.credit), 0);
    const revenues = accounts.filter((account) => ["revenue", "income"].includes(account.type)).map((account) => ({ ...account, balance: periodBalance(account) }));
    const expenses = accounts.filter((account) => ["expense", "expenses"].includes(account.type)).map((account) => ({ ...account, balance: periodBalance(account) }));
    const totalRevenue = revenues.reduce((sum, account) => sum + account.balance, 0);
    const totalExpenses = expenses.reduce((sum, account) => sum + account.balance, 0);
    res.json({ revenues, expenses, totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses });
  } catch (err) { handleBranchError(res, err, "Failed to generate P&L report"); }
});

router.get("/reports/balance-sheet", authenticateToken, requirePermission("canViewFinancialReport"), requireFeature("accounting"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "query"), { source: "query", allowOwnerAll: true });
    const accounts = await loadLedgerBalances(prisma, scope, reportEndDate(req.query.to));
    const sheet = ledgerBalanceSheet(accounts);
    res.json({ ...sheet, equity: [...sheet.equity, { code: "", name: "Unclosed Earnings", balance: sheet.retainedEarnings }] });
  } catch (err) { handleBranchError(res, err, "Failed to generate balance sheet"); }
});

function reportEndDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (String(value).length <= 10) date.setHours(23, 59, 59, 999);
  return date;
}

// List tax payments
router.get("/tax-payments", authenticateToken, requirePermission("canViewAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, accountingBranchRequest(req, "query"), { source: "query", allowOwnerAll: true });
    const payments = await prisma.taxPayment.findMany({
      where: scopedWhere(scope, {}),
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { dateOfPayment: "desc" },
    });
    res.json(payments);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch tax payments");
  }
});

// Create tax payment
router.post("/tax-payments", authenticateToken, requirePermission("canCreateAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { branch, amount, currency, from, to, prn, paymentMethod, dateOfPayment } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount required" });
    const resolvedCurrency = normalizeCurrency(currency || await tenantCurrency(tenantId));

    const payment = await prisma.taxPayment.create({
      data: {
        tenantId,
        branchId: branch || null,
        amount: Number(amount),
        currency: resolvedCurrency,
        periodFrom: from ? new Date(from) : null,
        periodTo: to ? new Date(to) : null,
        prn: prn || null,
        paymentMethod: paymentMethod || "cash",
        dateOfPayment: dateOfPayment ? new Date(dateOfPayment) : new Date(),
      },
      include: { branch: { select: { id: true, name: true } } },
    });
    res.status(201).json(payment);
  } catch (err) {
    console.error("Create tax payment error:", err);
    res.status(500).json({ error: "Failed to create tax payment" });
  }
});

export default router;
