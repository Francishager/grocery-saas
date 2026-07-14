import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";

const router = Router();

// Dashboard KPIs
router.get("/kpis", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [salesThisMonth, salesLastMonth, purchasesThisMonth, expensesThisMonth, products, lowStockProducts, expiringProducts, customers, receivables, salesWithItemsThisMonth] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfMonth } }), _sum: { total: true, tax: true, discount: true }, _count: true }),
      prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfLastMonth, lt: startOfMonth } }), _sum: { total: true } }),
      prisma.purchase.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfMonth } }), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(scope, { date: { gte: startOfMonth } }), _sum: { amount: true } }),
      prisma.product.count({ where: scopedWhere(scope, { isActive: true }) }),
      prisma.product.count({ where: scopedWhere(scope, { isActive: true, quantity: { lte: 10 } }) }),
      prisma.product.count({ where: scopedWhere(scope, { isActive: true, expiryDate: { not: null, lte: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) } }) }),
      prisma.customer.count({ where: scopedWhere(scope) }),
      prisma.customer.aggregate({ where: scopedWhere(scope, { balance: { gt: 0 } }), _sum: { balance: true }, _count: true }),
      prisma.sale.findMany({
        where: scopedWhere(scope, { createdAt: { gte: startOfMonth } }),
        select: { items: { select: { quantity: true, product: { select: { cost: true } } } } },
      }),
    ]);

    const revenueThisMonth = salesThisMonth._sum.total || 0;
    const revenueLastMonth = salesLastMonth._sum.total || 0;
    const revenueChange = revenueLastMonth ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1) : 0;
    const totalExpenses = expensesThisMonth._sum.amount || 0;
    const totalPurchases = purchasesThisMonth._sum.total || 0;
    const cogs = salesWithItemsThisMonth.reduce((sum, sale) =>
      sum + sale.items.reduce((s, item) => s + (item.product?.cost || 0) * item.quantity, 0), 0);
    const grossProfit = revenueThisMonth - cogs;
    const netProfit = grossProfit - totalExpenses;

    res.json({
      revenue: revenueThisMonth,
      revenueChange: Number(revenueChange),
      salesCount: salesThisMonth._count,
      taxCollected: salesThisMonth._sum.tax || 0,
      totalDiscount: salesThisMonth._sum.discount || 0,
      purchases: totalPurchases,
      expenses: totalExpenses,
      cogs,
      grossProfit,
      netProfit,
      productCount: products,
      lowStockCount: lowStockProducts,
      expiringCount: expiringProducts,
      customerCount: customers,
      receivablesOutstanding: receivables._sum.balance || 0,
      receivablesCount: receivables._count,
    });
  } catch (err) {
    console.error("Dashboard KPIs error:", err);
    handleBranchError(res, err);
  }
});

// Sales chart data (last 12 months)
router.get("/sales-chart", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const labels = [];
    const revenue = [];
    const expenses = [];

    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = start.toLocaleString("default", { month: "short" });
      labels.push(label);

      const [saleAgg, expAgg] = await Promise.all([
        prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: start, lt: end } }), _sum: { total: true } }),
        prisma.expense.aggregate({ where: scopedWhere(scope, { date: { gte: start, lt: end } }), _sum: { amount: true } }),
      ]);
      revenue.push(saleAgg._sum.total || 0);
      expenses.push(expAgg._sum.amount || 0);
    }

    res.json({ labels, revenue, expenses });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Profit & Loss summary (last 6 months)
router.get("/profit-loss", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const labels = [];
    const grossProfit = [];
    const netProfit = [];

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      labels.push(start.toLocaleString("default", { month: "short" }));

      const [saleAgg, expAgg, salesWithItems] = await Promise.all([
        prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: start, lt: end } }), _sum: { total: true } }),
        prisma.expense.aggregate({ where: scopedWhere(scope, { date: { gte: start, lt: end } }), _sum: { amount: true } }),
        prisma.sale.findMany({
          where: scopedWhere(scope, { createdAt: { gte: start, lt: end } }),
          select: { items: { select: { quantity: true, product: { select: { cost: true } } } } },
        }),
      ]);
      const rev = saleAgg._sum.total || 0;
      const cogs = salesWithItems.reduce((sum, sale) =>
        sum + sale.items.reduce((s, item) => s + (item.product?.cost || 0) * item.quantity, 0), 0);
      const exp = expAgg._sum.amount || 0;
      grossProfit.push(rev - cogs);
      netProfit.push(rev - cogs - exp);
    }

    res.json({ labels, grossProfit, netProfit });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Top selling products
router.get("/top-products", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const topItems = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { createdAt: { gte: startOfMonth }, ...scopedWhere(scope, {}) } },
      _sum: { quantity: true, total: true },
      _count: true,
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    });

    const productIds = topItems.map((t) => t.productId).filter(Boolean);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    const byId = new Map(products.map((p) => [p.id, p.name]));

    res.json(topItems.map((t) => ({
      productId: t.productId,
      name: byId.get(t.productId) || "Unknown",
      quantity: t._sum.quantity || 0,
      revenue: t._sum.total || 0,
      salesCount: t._count,
    })));
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Payment method breakdown
router.get("/payment-methods", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const methods = await prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: scopedWhere(scope, { createdAt: { gte: startOfMonth } }),
      _sum: { total: true },
      _count: true,
    });

    res.json(methods.map((m) => ({
      method: m.paymentMethod || "cash",
      total: m._sum.total || 0,
      count: m._count,
    })));
  } catch (err) {
    handleBranchError(res, err);
  }
});

export default router;
