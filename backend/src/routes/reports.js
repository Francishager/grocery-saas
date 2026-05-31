import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

const router = Router();

// Sales report
router.get("/sales", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { from, to, groupBy = "day" } = req.query;
    const where = { tenantId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const sales = await prisma.sale.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const totalDiscount = sales.reduce((sum, s) => sum + s.discount, 0);
    const totalTax = sales.reduce((sum, s) => sum + s.tax, 0);
    const count = sales.length;

    res.json({ sales, summary: { count, totalRevenue, totalDiscount, totalTax } });
  } catch (err) {
    console.error("Sales report error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Purchases report
router.get("/purchases", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { from, to } = req.query;
    const where = { tenantId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const purchases = await prisma.purchase.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    const totalCost = purchases.reduce((sum, p) => sum + p.total, 0);

    res.json({ purchases, summary: { count: purchases.length, totalCost } });
  } catch (err) {
    console.error("Purchases report error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Expenses report
router.get("/expenses", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { from, to } = req.query;
    const where = { tenantId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const expenses = await prisma.expense.findMany({ where, orderBy: { date: "desc" } });
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const byCategory = {};
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

    res.json({ expenses, summary: { count: expenses.length, totalExpenses, byCategory } });
  } catch (err) {
    console.error("Expenses report error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Profit report
router.get("/profit", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { from, to } = req.query;
    const dateFilter = {};
    if (from || to) {
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
    }

    const [salesAgg, purchasesAgg, expensesAgg] = await Promise.all([
      prisma.sale.aggregate({ where: { tenantId, ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) }, _sum: { total: true } }),
      prisma.purchase.aggregate({ where: { tenantId, ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) }, _sum: { total: true } }),
      prisma.expense.aggregate({ where: { tenantId, ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) }, _sum: { amount: true } }),
    ]);

    const revenue = salesAgg._sum.total || 0;
    const cogs = purchasesAgg._sum.total || 0;
    const expenses = expensesAgg._sum.amount || 0;
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses;

    res.json({ revenue, cogs, grossProfit, expenses, netProfit });
  } catch (err) {
    console.error("Profit report error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
