import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission, getPaymentMethodPermissions, hasAccountingPermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";

const router = Router();
const LINKED_CASH_ACCOUNT_MARKER = "cashAccount:";
const BALANCE_EPSILON = 0.01;
const DEBIT_NORMAL_ACCOUNT_TYPES = new Set(["asset", "expense", "expenses"]);
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

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const formatAmount = (value) => Number(value || 0).toFixed(2);

const transactionAccountPermissionKey = (cashAccountType) => {
  return TRANSACTION_ACCOUNT_PERMISSION_KEYS[normalizeValue(cashAccountType)];
};

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

const canUseTransactionAccount = async (req, cashAccountType) => {
  if (hasAccountingPermission(req)) {
    return true;
  }

  const permissionKey = transactionAccountPermissionKey(cashAccountType);
  if (!permissionKey) return false;
  const permissions = await paymentMethodPermissionsForRequest(req);
  return Boolean(permissions[permissionKey]);
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
    orderBy: { name: "asc" },
  });

  for (const cashAccount of cashAccounts) {
    const marker = cashAccountMarker(cashAccount.id);
    const description = `Linked transaction account ${marker}`;
    const subType = `transaction_${cashAccount.type}`;
    const existing = await client.account.findFirst({
      where: { tenantId, description: { contains: marker } },
    });

    if (existing) {
      await client.account.update({
        where: { id: existing.id },
        data: {
          name: cashAccount.name,
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
        type: "asset",
        subType,
        balance: cashAccount.balance,
        description,
      },
    });
  }
}

// List accounts (chart of accounts)
router.get("/accounts", authenticateToken, requirePermission("canViewAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    await ensureTransactionAccounts(tenantId);
    const accounts = await prisma.account.findMany({
      where: { tenantId },
      include: { parent: true, children: true },
      orderBy: { code: "asc" },
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// Create account
router.post("/accounts", authenticateToken, requirePermission("canCreateAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { code, name, type, subType, parentId, parentCode, parentName, description, branchId } = req.body;
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
            branchId: branchId || null,
          },
        });
      }
      resolvedParentId = parentAccount.id;
    }

    const account = await prisma.account.create({
      data: { tenantId, code, name, type, subType, parentId: resolvedParentId, description, branchId: branchId || null },
    });
    res.status(201).json(account);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Account code already exists" });
    res.status(500).json({ error: "Failed to create account" });
  }
});

// Update account
router.put("/accounts/:id", authenticateToken, requirePermission("canEditAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { name, type, subType, parentId, description, isActive, branchId } = req.body;
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: { name, type, subType, parentId, description, isActive, branchId: branchId ?? undefined },
    });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: "Failed to update account" });
  }
});

// Delete account
router.delete("/accounts/:id", authenticateToken, requirePermission("canDeleteAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    await prisma.account.delete({ where: { id: req.params.id } });
    res.json({ message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// List journal entries
router.get("/journal", authenticateToken, requirePermission("canViewAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const entries = await prisma.journalEntry.findMany({
      where: scopedWhere(scope, {}),
      include: {
        lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } },
        user: { select: { id: true, fname: true, lname: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json(entries);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch journal entries");
  }
});

// Create journal entry
router.post("/journal", authenticateToken, requirePermission("canCreateAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { date, description, reference, lines = [], branchId } = req.body;

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
    const accounts = await prisma.account.findMany({ where: { tenantId, id: { in: accountIds } } });
    if (accounts.length !== accountIds.length) {
      return res.status(400).json({ error: "One or more accounts were not found" });
    }
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const linkedCashAccountIds = [...new Set(accounts.map(linkedCashAccountId).filter(Boolean))];
    const cashAccounts = linkedCashAccountIds.length
      ? await prisma.cashAccount.findMany({ where: { tenantId, id: { in: linkedCashAccountIds }, isActive: true } })
      : [];
    const cashAccountsById = new Map(cashAccounts.map((account) => [account.id, account]));
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
      if (!(await canUseTransactionAccount(req, cashAccount.type))) {
        return res.status(403).json({
          error: `You do not have permission to use ${cashAccount.type} as a transaction account. Please contact your administrator.`,
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
          branchId: branchId || null,
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

// Trial balance
router.get("/reports/trial-balance", authenticateToken, requirePermission("canViewFinancialReport"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const accounts = await prisma.account.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: "asc" },
    });
    const trialBalance = accounts.map((a) => ({
      code: a.code,
      name: a.name,
      type: a.type,
      debit: a.balance > 0 ? a.balance : 0,
      credit: a.balance < 0 ? Math.abs(a.balance) : 0,
    }));
    const totalDebit = trialBalance.reduce((s, r) => s + r.debit, 0);
    const totalCredit = trialBalance.reduce((s, r) => s + r.credit, 0);
    res.json({ accounts: trialBalance, totalDebit, totalCredit });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate trial balance" });
  }
});

// Profit & Loss
router.get("/reports/profit-loss", authenticateToken, requirePermission("canViewFinancialReport"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { from, to } = req.query;
    const dateFilter = {};
    if (from || to) {
      dateFilter.date = {};
      if (from) dateFilter.date.gte = new Date(from);
      if (to) dateFilter.date.lte = new Date(to);
    }

    const revenueAccounts = await prisma.account.findMany({ where: { tenantId, type: "revenue", isActive: true } });
    const expenseAccounts = await prisma.account.findMany({ where: { tenantId, type: "expense", isActive: true } });

    let totalRevenue = 0;
    let totalExpenses = 0;

    const revenues = [];
    for (const acc of revenueAccounts) {
      revenues.push({ code: acc.code, name: acc.name, balance: acc.balance });
      totalRevenue += acc.balance;
    }

    const expenses = [];
    for (const acc of expenseAccounts) {
      expenses.push({ code: acc.code, name: acc.name, balance: acc.balance });
      totalExpenses += acc.balance;
    }

    res.json({
      revenues,
      expenses,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate P&L report" });
  }
});

// Balance sheet
router.get("/reports/balance-sheet", authenticateToken, requirePermission("canViewFinancialReport"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const accounts = await prisma.account.findMany({ where: { tenantId, isActive: true } });

    const assets = accounts.filter((a) => a.type === "asset");
    const liabilities = accounts.filter((a) => a.type === "liability");
    const equity = accounts.filter((a) => a.type === "equity");

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
    const totalEquity = equity.reduce((s, a) => s + a.balance, 0);

    res.json({
      assets: assets.map((a) => ({ code: a.code, name: a.name, balance: a.balance })),
      liabilities: liabilities.map((a) => ({ code: a.code, name: a.name, balance: a.balance })),
      equity: equity.map((a) => ({ code: a.code, name: a.name, balance: a.balance })),
      totalAssets,
      totalLiabilities,
      totalEquity,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate balance sheet" });
  }
});

// List tax payments
router.get("/tax-payments", authenticateToken, requirePermission("canViewAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
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

    const payment = await prisma.taxPayment.create({
      data: {
        tenantId,
        branchId: branch || null,
        amount: Number(amount),
        currency: currency || "USD",
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
