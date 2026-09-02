import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, salesUserWhere, scopedWhere } from "../utils/branchAccess.js";

const router = Router();

function saleLineCogs(item) {
  const rawCost = item?.cost;
  if (rawCost !== null && rawCost !== undefined && rawCost !== "") {
    const savedCost = Number(rawCost);
    if (Number.isFinite(savedCost)) return savedCost * Number(item?.quantity || 0);
  }

  const productCost = Number(item?.product?.cost || 0);
  const conversionFactor = Number(item?.conversionFactor || 1);
  const effectiveCost = productCost * (Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1);
  return effectiveCost * Number(item?.quantity || 0);
}

function saleCogs(sale) {
  return (sale?.items || []).reduce((sum, item) => sum + saleLineCogs(item), 0);
}

const saleItemCostSelect = {
  quantity: true,
  cost: true,
  conversionFactor: true,
  product: { select: { cost: true } },
};

const aggregateTotal = (aggregate, field = "total") => Number(aggregate?._sum?.[field] || 0);
const aggregateCount = (aggregate) => Number(aggregate?._count || 0);

function expenseDateWhere(dateRange) {
  if (!dateRange || !Object.keys(dateRange).length) return {};
  return { OR: [{ date: dateRange }, { createdAt: dateRange }] };
}

function scopedExpenseWhere(scope, extra = {}) {
  const { branchId, ...rest } = extra;
  const branchScope = branchId || scope.branchId;
  const clauses = [];

  if (Object.keys(rest).length) clauses.push(rest);
  if (branchScope) clauses.push({ OR: [{ branchId: branchScope }, { branchId: null }] });

  return {
    tenantId: scope.tenantId,
    ...(clauses.length ? { AND: clauses } : {}),
  };
}

function scopedJournalWhere(scope, extra = {}) {
  const { branchId, ...rest } = extra;
  const branchScope = branchId || scope.branchId;
  const clauses = [];

  if (Object.keys(rest).length) clauses.push(rest);
  if (branchScope) clauses.push({ OR: [{ branchId: branchScope }, { branchId: null }] });

  return {
    tenantId: scope.tenantId,
    ...(clauses.length ? { AND: clauses } : {}),
  };
}

function isExpenseAccount(account) {
  return ["expense", "expenses"].includes(String(account?.type || "").trim().toLowerCase());
}

async function journalExpenseRows(scope, dateRange) {
  const entries = await prisma.journalEntry.findMany({
    where: scopedJournalWhere(scope, {
      date: dateRange,
      status: { not: "reversed" },
      lines: {
        some: {
          debit: { gt: 0 },
          account: { type: { in: ["expense", "expenses"] } },
        },
      },
    }),
    select: {
      date: true,
      createdAt: true,
      lines: {
        select: {
          debit: true,
          account: { select: { type: true } },
        },
      },
    },
  });

  return entries.flatMap((entry) => (
    entry.lines
      .filter((line) => isExpenseAccount(line.account) && Number(line.debit || 0) > 0)
      .map((line) => ({ amount: Number(line.debit || 0), date: entry.date || entry.createdAt }))
  ));
}

async function journalExpenseTotal(scope, dateRange) {
  const rows = await journalExpenseRows(scope, dateRange);
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function mergeGroupedTotals(groups) {
  const map = new Map();
  groups.flat().forEach((group) => {
    const key = group.productId || "unknown";
    const current = map.get(key) || { productId: group.productId, quantity: 0, revenue: 0, salesCount: 0 };
    current.quantity += Number(group._sum?.quantity || 0);
    current.revenue += Number(group._sum?.total || 0);
    current.salesCount += Number(group._count || 0);
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function mergePaymentMethods(groups) {
  const map = new Map();
  groups.flat().forEach((group) => {
    const key = group.paymentMethod || "cash";
    const current = map.get(key) || { method: key, total: 0, count: 0 };
    current.total += Number(group._sum?.total || 0);
    current.count += Number(group._count || 0);
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// Dashboard KPIs
router.get("/kpis", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const visibleSales = salesUserWhere(req);

    const [
      salesThisMonth,
      saleRecordsThisMonth,
      salesLastMonth,
      saleRecordsLastMonth,
      purchasesThisMonth,
      supplierPurchasesThisMonth,
      expensesThisMonth,
      journalExpensesThisMonth,
      products,
      lowStockProducts,
      expiringProducts,
      customers,
      receivables,
      salesWithItemsThisMonth,
      saleRecordsWithItemsThisMonth,
    ] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }), _sum: { total: true, tax: true, discount: true }, _count: true }),
      prisma.saleRecord.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }), _sum: { total: true, tax: true, discount: true }, _count: true }),
      prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfLastMonth, lt: startOfMonth }, ...visibleSales }), _sum: { total: true } }),
      prisma.saleRecord.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfLastMonth, lt: startOfMonth }, ...visibleSales }), _sum: { total: true } }),
      prisma.purchase.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfMonth } }), _sum: { total: true } }),
      prisma.supplierPurchase.aggregate({ where: scopedWhere(scope, { createdAt: { gte: startOfMonth } }), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedExpenseWhere(scope, expenseDateWhere({ gte: startOfMonth })), _sum: { amount: true } }),
      journalExpenseTotal(scope, { gte: startOfMonth }),
      prisma.product.count({ where: scopedWhere(scope, { isActive: true }) }),
      prisma.product.count({ where: scopedWhere(scope, { isActive: true, quantity: { lte: 10 } }) }),
      prisma.product.count({ where: scopedWhere(scope, { isActive: true, expiryDate: { not: null, lte: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) } }) }),
      prisma.customer.count({ where: scopedWhere(scope) }),
      prisma.customer.aggregate({ where: scopedWhere(scope, { balance: { gt: 0 } }), _sum: { balance: true }, _count: true }),
      prisma.sale.findMany({
        where: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }),
        select: { items: { select: saleItemCostSelect } },
      }),
      prisma.saleRecord.findMany({
        where: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }),
        select: { items: { select: saleItemCostSelect } },
      }),
    ]);

    const revenueThisMonth = aggregateTotal(salesThisMonth) + aggregateTotal(saleRecordsThisMonth);
    const revenueLastMonth = aggregateTotal(salesLastMonth) + aggregateTotal(saleRecordsLastMonth);
    const revenueChange = revenueLastMonth ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1) : 0;
    const totalExpenses = aggregateTotal(expensesThisMonth, "amount") + Number(journalExpensesThisMonth || 0);
    const totalPurchases = aggregateTotal(purchasesThisMonth) + aggregateTotal(supplierPurchasesThisMonth);
    const cogs = [...salesWithItemsThisMonth, ...saleRecordsWithItemsThisMonth].reduce((sum, sale) => sum + saleCogs(sale), 0);
    const grossProfit = revenueThisMonth - cogs;
    const netProfit = grossProfit - totalExpenses;

    res.json({
      revenue: revenueThisMonth,
      revenueChange: Number(revenueChange),
      salesCount: aggregateCount(salesThisMonth) + aggregateCount(saleRecordsThisMonth),
      taxCollected: aggregateTotal(salesThisMonth, "tax") + aggregateTotal(saleRecordsThisMonth, "tax"),
      totalDiscount: aggregateTotal(salesThisMonth, "discount") + aggregateTotal(saleRecordsThisMonth, "discount"),
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
    const visibleSales = salesUserWhere(req);

    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = start.toLocaleString("default", { month: "short" });
      labels.push(label);

      const [saleAgg, saleRecordAgg, expAgg, journalExp] = await Promise.all([
        prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: start, lt: end }, ...visibleSales }), _sum: { total: true } }),
        prisma.saleRecord.aggregate({ where: scopedWhere(scope, { createdAt: { gte: start, lt: end }, ...visibleSales }), _sum: { total: true } }),
        prisma.expense.aggregate({ where: scopedExpenseWhere(scope, expenseDateWhere({ gte: start, lt: end })), _sum: { amount: true } }),
        journalExpenseTotal(scope, { gte: start, lt: end }),
      ]);
      revenue.push(aggregateTotal(saleAgg) + aggregateTotal(saleRecordAgg));
      expenses.push(aggregateTotal(expAgg, "amount") + Number(journalExp || 0));
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
    const visibleSales = salesUserWhere(req);

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      labels.push(start.toLocaleString("default", { month: "short" }));

      const [saleAgg, saleRecordAgg, expAgg, journalExp, salesWithItems, saleRecordsWithItems] = await Promise.all([
        prisma.sale.aggregate({ where: scopedWhere(scope, { createdAt: { gte: start, lt: end }, ...visibleSales }), _sum: { total: true } }),
        prisma.saleRecord.aggregate({ where: scopedWhere(scope, { createdAt: { gte: start, lt: end }, ...visibleSales }), _sum: { total: true } }),
        prisma.expense.aggregate({ where: scopedExpenseWhere(scope, expenseDateWhere({ gte: start, lt: end })), _sum: { amount: true } }),
        journalExpenseTotal(scope, { gte: start, lt: end }),
        prisma.sale.findMany({
          where: scopedWhere(scope, { createdAt: { gte: start, lt: end }, ...visibleSales }),
          select: { items: { select: saleItemCostSelect } },
        }),
        prisma.saleRecord.findMany({
          where: scopedWhere(scope, { createdAt: { gte: start, lt: end }, ...visibleSales }),
          select: { items: { select: saleItemCostSelect } },
        }),
      ]);
      const rev = aggregateTotal(saleAgg) + aggregateTotal(saleRecordAgg);
      const cogs = [...salesWithItems, ...saleRecordsWithItems].reduce((sum, sale) => sum + saleCogs(sale), 0);
      const exp = aggregateTotal(expAgg, "amount") + Number(journalExp || 0);
      grossProfit.push(rev - cogs);
      netProfit.push(rev - cogs - exp);
    }

    res.json({ labels, grossProfit, netProfit });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Daily performance within current month
router.get("/daily-performance", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const visibleSales = salesUserWhere(req);

    const [sales, saleRecords, expenses, journalExpenses] = await Promise.all([
      prisma.sale.findMany({
        where: scopedWhere(scope, { createdAt: { gte: startOfMonth, lt: endOfMonth }, ...visibleSales }),
        select: { total: true, createdAt: true, items: { select: saleItemCostSelect } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.saleRecord.findMany({
        where: scopedWhere(scope, { createdAt: { gte: startOfMonth, lt: endOfMonth }, ...visibleSales }),
        select: { total: true, createdAt: true, items: { select: saleItemCostSelect } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.expense.findMany({
        where: scopedExpenseWhere(scope, expenseDateWhere({ gte: startOfMonth, lt: endOfMonth })),
        select: { amount: true, date: true, createdAt: true },
        orderBy: { date: "asc" },
      }),
      journalExpenseRows(scope, { gte: startOfMonth, lt: endOfMonth }),
    ]);

    // Build a map of day -> data
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayMap = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dayMap[d] = { day: d, label: `${d}`, revenue: 0, cogs: 0, expenses: 0, profit: 0, salesCount: 0 };
    }

    // Aggregate sales by day
    [...sales, ...saleRecords].forEach((sale) => {
      const day = new Date(sale.createdAt).getDate();
      if (dayMap[day]) {
        dayMap[day].revenue += sale.total || 0;
        dayMap[day].salesCount += 1;
        dayMap[day].cogs += saleCogs(sale);
      }
    });

    // Aggregate expenses by day
    [...expenses, ...journalExpenses].forEach((exp) => {
      const day = new Date(exp.date || exp.createdAt).getDate();
      if (dayMap[day]) {
        dayMap[day].expenses += exp.amount || 0;
      }
    });

    // Calculate profit per day and build array (only up to today)
    const data = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const entry = dayMap[d];
      entry.profit = entry.revenue - entry.cogs - entry.expenses;
      data.push(entry);
    }

    // Summary stats
    const bestDay = data.reduce((best, d) => d.revenue > best.revenue ? d : best, { day: 0, revenue: 0 });
    const worstDay = data.reduce((worst, d) => d.salesCount > 0 && (worst.day === 0 || d.revenue < worst.revenue) ? d : worst, { day: 0, revenue: 0 });
    const avgRevenue = data.reduce((sum, d) => sum + d.revenue, 0) / now.getDate();

    res.json({
      data,
      summary: {
        bestDay: bestDay.day ? { day: bestDay.day, revenue: bestDay.revenue } : null,
        worstDay: worstDay.day ? { day: worstDay.day, revenue: worstDay.revenue } : null,
        avgDailyRevenue: Math.round(avgRevenue * 100) / 100,
        daysElapsed: now.getDate(),
        daysInMonth,
      },
    });
  } catch (err) {
    console.error("Daily performance error:", err);
    handleBranchError(res, err);
  }
});

// Top selling products
router.get("/top-products", authenticateToken, requirePermission("canViewDashboard"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const visibleSales = salesUserWhere(req);

    const [saleItems, saleRecordItems] = await Promise.all([
      prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }) },
        _sum: { quantity: true, total: true },
        _count: true,
      }),
      prisma.saleRecordItem.groupBy({
        by: ["productId"],
        where: { sale: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }) },
        _sum: { quantity: true, total: true },
        _count: true,
      }),
    ]);

    const topItems = mergeGroupedTotals([saleItems, saleRecordItems]).slice(0, 5);
    const productIds = topItems.map((t) => t.productId).filter(Boolean);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    const byId = new Map(products.map((p) => [p.id, p.name]));

    res.json(topItems.map((t) => ({
      productId: t.productId,
      name: byId.get(t.productId) || "Unknown",
      quantity: t.quantity,
      revenue: t.revenue,
      salesCount: t.salesCount,
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
    const visibleSales = salesUserWhere(req);

    const [saleMethods, saleRecordMethods] = await Promise.all([
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }),
        _sum: { total: true },
        _count: true,
      }),
      prisma.saleRecord.groupBy({
        by: ["paymentMethod"],
        where: scopedWhere(scope, { createdAt: { gte: startOfMonth }, ...visibleSales }),
        _sum: { total: true },
        _count: true,
      }),
    ]);

    res.json(mergePaymentMethods([saleMethods, saleRecordMethods]));
  } catch (err) {
    handleBranchError(res, err);
  }
});

export default router;
