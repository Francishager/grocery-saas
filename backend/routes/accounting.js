import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";

const router = Router();

// List accounts (chart of accounts)
router.get("/accounts", authenticateToken, requirePermission("canViewAccounting"), requireFeature("accounting"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
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
    const { code, name, type, subType, parentId, description } = req.body;
    if (!code || !name || !type) return res.status(400).json({ error: "code, name, type required" });

    const account = await prisma.account.create({
      data: { tenantId, code, name, type, subType, parentId, description },
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
    const { name, type, subType, parentId, description, isActive } = req.body;
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: { name, type, subType, parentId, description, isActive },
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

    if (!lines.length) return res.status(400).json({ error: "Journal lines required" });

    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: "Debits and credits must balance" });
    }

    const entryNo = `JE-${Date.now()}`;

    const entry = await prisma.journalEntry.create({
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
          create: lines.map((l) => ({
            accountId: l.accountId,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            description: l.description || null,
          })),
        },
      },
      include: {
        lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } },
      },
    });

    // Update account balances
    for (const line of lines) {
      const account = await prisma.account.findUnique({ where: { id: line.accountId } });
      if (account) {
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        // Assets/expenses increase with debit, liabilities/equity/revenue increase with credit
        const isDebitNormal = account.type === "asset" || account.type === "expense";
        const delta = isDebitNormal ? debit - credit : credit - debit;
        await prisma.account.update({
          where: { id: line.accountId },
          data: { balance: { increment: delta } },
        });
      }
    }

    res.status(201).json(entry);
  } catch (err) {
    console.error("Create journal entry error:", err);
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

export default router;
