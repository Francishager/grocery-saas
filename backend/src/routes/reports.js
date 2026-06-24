import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";

const router = Router();

// ==================== HELPERS ====================
const reportRoles = ["owner", "manager", "accountant"];

function df(req, field = "createdAt") {
  const { from, to } = req.query;
  const f = {};
  if (from) f.gte = new Date(from);
  if (to) f.lte = new Date(to);
  return Object.keys(f).length ? { [field]: f } : {};
}

async function getScope(req) {
  return resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
}

// ==================== LEGACY ROUTES (backward compatibility) ====================
router.get("/sales", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req));
    const sales = await prisma.sale.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ sales, summary: { count: sales.length, totalRevenue: sales.reduce((a, x) => a + x.total, 0), totalDiscount: sales.reduce((a, x) => a + x.discount, 0), totalTax: sales.reduce((a, x) => a + x.tax, 0) } });
  } catch (err) { console.error("Sales report error:", err); handleBranchError(res, err); }
});

router.get("/purchases", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req));
    const purchases = await prisma.purchase.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ purchases, summary: { count: purchases.length, totalCost: purchases.reduce((a, x) => a + x.total, 0) } });
  } catch (err) { console.error("Purchases report error:", err); handleBranchError(res, err); }
});

router.get("/expenses", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "date"));
    const expenses = await prisma.expense.findMany({ where, orderBy: { date: "desc" } });
    const byCategory = {};
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    res.json({ expenses, summary: { count: expenses.length, totalExpenses: expenses.reduce((a, x) => a + x.amount, 0), byCategory } });
  } catch (err) { console.error("Expenses report error:", err); handleBranchError(res, err); }
});

router.get("/profit", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [salesAgg, purchasesAgg, expensesAgg] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.purchase.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s, df(req, "date")), _sum: { amount: true } }),
    ]);
    const revenue = salesAgg._sum.total || 0;
    const cogs = purchasesAgg._sum.total || 0;
    const expenses = expensesAgg._sum.amount || 0;
    res.json({ revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses });
  } catch (err) { console.error("Profit report error:", err); handleBranchError(res, err); }
});

// ==================== SALES REPORTS ====================
router.get("/sales/summary", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req));
    const [agg, count] = await Promise.all([
      prisma.sale.aggregate({ where, _sum: { total: true, discount: true, tax: true, subtotal: true }, _avg: { total: true } }),
      prisma.sale.count({ where }),
    ]);
    res.json({ count, totalRevenue: agg._sum.total || 0, totalSubtotal: agg._sum.subtotal || 0, totalDiscount: agg._sum.discount || 0, totalTax: agg._sum.tax || 0, avgSale: agg._avg.total || 0 });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/daily", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), orderBy: { createdAt: "asc" } });
    const map = {};
    sales.forEach((sale) => {
      const day = new Date(sale.createdAt).toISOString().slice(0, 10);
      if (!map[day]) map[day] = { date: day, count: 0, revenue: 0, discount: 0, tax: 0 };
      map[day].count++; map[day].revenue += sale.total; map[day].discount += sale.discount; map[day].tax += sale.tax;
    });
    res.json({ data: Object.values(map) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/weekly", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), orderBy: { createdAt: "asc" } });
    const map = {};
    sales.forEach((sale) => {
      const d = new Date(sale.createdAt);
      const year = d.getFullYear();
      const onejan = new Date(year, 0, 1);
      const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
      const key = `${year}-W${week}`;
      if (!map[key]) map[key] = { week: key, count: 0, revenue: 0, discount: 0, tax: 0 };
      map[key].count++; map[key].revenue += sale.total; map[key].discount += sale.discount; map[key].tax += sale.tax;
    });
    res.json({ data: Object.values(map) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/monthly", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), orderBy: { createdAt: "asc" } });
    const map = {};
    sales.forEach((sale) => {
      const m = new Date(sale.createdAt).toISOString().slice(0, 7);
      if (!map[m]) map[m] = { month: m, count: 0, revenue: 0, discount: 0, tax: 0 };
      map[m].count++; map[m].revenue += sale.total; map[m].discount += sale.discount; map[m].tax += sale.tax;
    });
    res.json({ data: Object.values(map) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-product", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: true } } } });
    const map = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, cost: 0, profit: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].cost += (item.product?.cost || 0) * item.quantity;
        map[name].profit = map[name].revenue - map[name].cost;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-category", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: { include: { category: true } } } } } });
    const map = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const cat = item.product?.category?.name || "Uncategorized";
        if (!map[cat]) map[cat] = { category: cat, quantity: 0, revenue: 0 };
        map[cat].quantity += item.quantity;
        map[cat].revenue += item.total;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-customer", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const records = await prisma.saleRecord.findMany({ where: scopedWhere(s, df(req)), include: { customer: true } });
    const map = {};
    records.forEach((r) => {
      const name = r.customer?.name || "Walk-in";
      if (!map[name]) map[name] = { customer: name, count: 0, total: 0, balance: 0 };
      map[name].count++; map[name].total += r.total; map[name].balance += r.balance || 0;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.total - a.total) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-user", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { user: { select: { fname: true, lname: true } } } });
    const map = {};
    sales.forEach((sale) => {
      const name = `${sale.user?.fname || ""} ${sale.user?.lname || ""}`.trim() || "Unknown";
      if (!map[name]) map[name] = { user: name, count: 0, revenue: 0, discount: 0 };
      map[name].count++; map[name].revenue += sale.total; map[name].discount += sale.discount;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-branch", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { branch: { select: { name: true } } } });
    const map = {};
    sales.forEach((sale) => {
      const name = sale.branch?.name || "Unassigned";
      if (!map[name]) map[name] = { branch: name, count: 0, revenue: 0, discount: 0 };
      map[name].count++; map[name].revenue += sale.total; map[name].discount += sale.discount;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/discounts", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, { ...df(req), discount: { gt: 0 } }), include: { items: true, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ data: sales, summary: { count: sales.length, totalDiscount: sales.reduce((a, x) => a + x.discount, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/returns", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, { ...df(req), status: { in: ["refunded", "cancelled"] } }), include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ data: sales, summary: { count: sales.length, totalRefunded: sales.reduce((a, x) => a + x.total, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== INVENTORY REPORTS ====================
router.get("/inventory/stock", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const products = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    res.json({ data: products, summary: { count: products.length, totalValue: products.reduce((a, p) => a + (p.cost || 0) * p.quantity, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/valuation", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const products = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), include: { category: true } });
    const byCategory = {};
    let totalValue = 0;
    products.forEach((p) => {
      const val = (p.cost || 0) * p.quantity;
      totalValue += val;
      const cat = p.category?.name || "Uncategorized";
      if (!byCategory[cat]) byCategory[cat] = { category: cat, quantity: 0, costValue: 0, retailValue: 0 };
      byCategory[cat].quantity += p.quantity;
      byCategory[cat].costValue += val;
      byCategory[cat].retailValue += (p.price || 0) * p.quantity;
    });
    res.json({ data: Object.values(byCategory), summary: { totalCostValue: totalValue, totalRetailValue: products.reduce((a, p) => a + (p.price || 0) * p.quantity, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/low-stock", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const allProducts = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { quantity: "asc" } });
    const products = allProducts.filter((p) => p.quantity <= p.minStock);
    res.json({ data: products, summary: { count: products.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/out-of-stock", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const products = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false }, quantity: { lte: 0 } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    res.json({ data: products, summary: { count: products.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/stock-movement", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [sales, purchases] = await Promise.all([
      prisma.saleItem.findMany({ where: { sale: scopedWhere(s, df(req)) }, include: { product: { select: { name: true } }, sale: { select: { receiptNo: true, createdAt: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.purchaseItem.findMany({ where: { purchase: scopedWhere(s, df(req)) }, include: { product: { select: { name: true } }, purchase: { select: { refNo: true, createdAt: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    const movements = [
      ...sales.map((i) => ({ type: "out", product: i.product?.name || "Unknown", quantity: i.quantity, ref: i.sale?.receiptNo, date: i.createdAt })),
      ...purchases.map((i) => ({ type: "in", product: i.product?.name || "Unknown", quantity: i.quantity, ref: i.purchase?.refNo, date: i.createdAt })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ data: movements });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/adjustments", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const logs = await prisma.auditLog.findMany({ where: { tenantId: s.tenantId, model: "Product", action: "update", ...df(req, "createdAt") }, orderBy: { createdAt: "desc" } });
    res.json({ data: logs, summary: { count: logs.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/expiry", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const products = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false }, expiryDate: { not: null } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { expiryDate: "asc" } });
    const now = new Date();
    const data = products.map((p) => ({ ...p, daysUntilExpiry: Math.floor((new Date(p.expiryDate) - now) / 86400000), isExpired: new Date(p.expiryDate) < now }));
    res.json({ data, summary: { count: data.length, expired: data.filter((p) => p.isExpired).length, expiringSoon: data.filter((p) => !p.isExpired && p.daysUntilExpiry <= 30).length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/damaged", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const logs = await prisma.auditLog.findMany({ where: { tenantId: s.tenantId, model: "Product", action: "delete", ...df(req, "createdAt") }, orderBy: { createdAt: "desc" } });
    res.json({ data: logs, summary: { count: logs.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/fast-moving", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: true } } } });
    const map = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.quantity - a.quantity) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/slow-moving", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: true } } } });
    const soldMap = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!soldMap[name]) soldMap[name] = { product: name, quantity: 0, revenue: 0 };
        soldMap[name].quantity += item.quantity;
        soldMap[name].revenue += item.total;
      });
    });
    res.json({ data: Object.values(soldMap).sort((a, b) => a.quantity - b.quantity) });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== FINANCIAL REPORTS ====================
router.get("/financial/profit-loss", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [salesAgg, purchasesAgg, expensesAgg, salesCount] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true, discount: true, tax: true } }),
      prisma.purchase.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s, df(req, "date")), _sum: { amount: true } }),
      prisma.sale.count({ where: scopedWhere(s, df(req)) }),
    ]);
    const revenue = salesAgg._sum.total || 0;
    const cogs = purchasesAgg._sum.total || 0;
    const expenses = expensesAgg._sum.amount || 0;
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses;
    res.json({ revenue, cogs, grossProfit, expenses, netProfit, totalDiscount: salesAgg._sum.discount || 0, totalTax: salesAgg._sum.tax || 0, salesCount });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/income", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [salesAgg, customerPayments] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.customerPayment.aggregate({ where: scopedWhere(s, df(req)), _sum: { amount: true } }),
    ]);
    res.json({ salesRevenue: salesAgg._sum.total || 0, customerPayments: customerPayments._sum.amount || 0, totalIncome: (salesAgg._sum.total || 0) + (customerPayments._sum.amount || 0) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/expense", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const expenses = await prisma.expense.findMany({ where: scopedWhere(s, df(req, "date")), orderBy: { date: "desc" } });
    const byCategory = {};
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    res.json({ data: expenses, summary: { count: expenses.length, totalExpenses: expenses.reduce((a, e) => a + e.amount, 0), byCategory } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/cash-flow", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [salesAgg, purchasesAgg, expensesAgg, customerPaymentsAgg, supplierPaymentsAgg] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.purchase.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s, df(req, "date")), _sum: { amount: true } }),
      prisma.customerPayment.aggregate({ where: scopedWhere(s, df(req)), _sum: { amount: true } }),
      prisma.supplierPayment.aggregate({ where: scopedWhere(s, df(req)), _sum: { amount: true } }),
    ]);
    const inflow = (salesAgg._sum.total || 0) + (customerPaymentsAgg._sum.amount || 0);
    const outflow = (purchasesAgg._sum.total || 0) + (expensesAgg._sum.amount || 0) + (supplierPaymentsAgg._sum.amount || 0);
    res.json({ inflow, outflow, netCashFlow: inflow - outflow, details: { sales: salesAgg._sum.total || 0, customerPayments: customerPaymentsAgg._sum.amount || 0, purchases: purchasesAgg._sum.total || 0, expenses: expensesAgg._sum.amount || 0, supplierPayments: supplierPaymentsAgg._sum.amount || 0 } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/trial-balance", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [salesAgg, purchasesAgg, expensesAgg, products, customerBalances, supplierBalances, cashAccounts] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.purchase.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s, df(req, "date")), _sum: { amount: true } }),
      prisma.product.aggregate({ where: scopedWhere(s, { isActive: { not: false } }), _sum: { quantity: true } }),
      prisma.customer.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.supplier.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
    ]);
    res.json({
      accounts: [
        { account: "Cash & Bank", debit: cashAccounts._sum.balance || 0, credit: 0 },
        { account: "Accounts Receivable", debit: customerBalances._sum.balance || 0, credit: 0 },
        { account: "Inventory", debit: products._sum.quantity || 0, credit: 0 },
        { account: "Accounts Payable", debit: 0, credit: supplierBalances._sum.balance || 0 },
        { account: "Sales Revenue", debit: 0, credit: salesAgg._sum.total || 0 },
        { account: "Cost of Goods Sold", debit: purchasesAgg._sum.total || 0, credit: 0 },
        { account: "Operating Expenses", debit: expensesAgg._sum.amount || 0, credit: 0 },
      ],
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/balance-sheet", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [cashAccounts, customerBalances, products, supplierBalances, salesAgg, purchasesAgg, expensesAgg] = await Promise.all([
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
      prisma.customer.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.product.aggregate({ where: scopedWhere(s, { isActive: { not: false } }), _sum: { quantity: true } }),
      prisma.supplier.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.sale.aggregate({ where: scopedWhere(s), _sum: { total: true } }),
      prisma.purchase.aggregate({ where: scopedWhere(s), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s), _sum: { amount: true } }),
    ]);
    const inventoryValue = products._sum.quantity || 0;
    const retainedEarnings = (salesAgg._sum.total || 0) - (purchasesAgg._sum.total || 0) - (expensesAgg._sum.amount || 0);
    const totalAssets = (cashAccounts._sum.balance || 0) + (customerBalances._sum.balance || 0) + inventoryValue;
    const totalLiabilities = supplierBalances._sum.balance || 0;
    res.json({
      assets: { cash: cashAccounts._sum.balance || 0, accountsReceivable: customerBalances._sum.balance || 0, inventory: inventoryValue, totalAssets },
      liabilities: { accountsPayable: supplierBalances._sum.balance || 0, totalLiabilities },
      equity: { retainedEarnings, totalEquity: totalAssets - totalLiabilities },
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/general-ledger", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const [sales, purchases, expenses, customerPayments, supplierPayments] = await Promise.all([
      prisma.sale.findMany({ where: scopedWhere(s, df(req)), select: { id: true, receiptNo: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.purchase.findMany({ where: scopedWhere(s, df(req)), select: { id: true, refNo: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.expense.findMany({ where: scopedWhere(s, df(req, "date")), select: { id: true, category: true, amount: true, date: true }, orderBy: { date: "desc" } }),
      prisma.customerPayment.findMany({ where: scopedWhere(s, df(req)), select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.supplierPayment.findMany({ where: scopedWhere(s, df(req)), select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    ]);
    const entries = [
      ...sales.map((x) => ({ date: x.createdAt, account: "Sales Revenue", description: `Sale ${x.receiptNo}`, debit: 0, credit: x.total })),
      ...purchases.map((x) => ({ date: x.createdAt, account: "Cost of Goods Sold", description: `Purchase ${x.refNo || ""}`, debit: x.total, credit: 0 })),
      ...expenses.map((x) => ({ date: x.date, account: x.category, description: "Expense", debit: x.amount, credit: 0 })),
      ...customerPayments.map((x) => ({ date: x.createdAt, account: "Cash", description: "Customer Payment", debit: x.amount, credit: 0 })),
      ...supplierPayments.map((x) => ({ date: x.createdAt, account: "Accounts Payable", description: "Supplier Payment", debit: 0, credit: x.amount })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ data: entries });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/bank-transactions", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const transactions = await prisma.cashTransaction.findMany({ where: { tenantId: s.tenantId, ...df(req), account: { type: "bank" } }, include: { account: { select: { name: true, type: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ data: transactions, summary: { count: transactions.length, totalIn: transactions.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0), totalOut: transactions.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/tax", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), select: { total: true, tax: true, discount: true, subtotal: true } });
    const totalTax = sales.reduce((a, x) => a + x.tax, 0);
    const totalRevenue = sales.reduce((a, x) => a + x.total, 0);
    const totalDiscount = sales.reduce((a, x) => a + x.discount, 0);
    res.json({ totalRevenue, totalTax, totalDiscount, salesCount: sales.length, averageTaxRate: totalRevenue ? (totalTax / totalRevenue * 100).toFixed(2) : 0 });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== CUSTOMER REPORTS ====================
router.get("/customers/list", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const customers = await prisma.customer.findMany({ where: scopedWhere(s), include: { branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    res.json({ data: customers, summary: { count: customers.length, totalBalance: customers.reduce((a, c) => a + c.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/sales", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const records = await prisma.saleRecord.findMany({ where: scopedWhere(s, df(req)), include: { customer: true } });
    const map = {};
    records.forEach((r) => {
      const name = r.customer?.name || "Walk-in";
      if (!map[name]) map[name] = { customer: name, count: 0, total: 0, paid: 0, balance: 0 };
      map[name].count++; map[name].total += r.total; map[name].paid += r.amountPaid; map[name].balance += r.balance || 0;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.total - a.total) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/balance", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const customers = await prisma.customer.findMany({ where: scopedWhere(s, { balance: { not: 0 } }), orderBy: { balance: "desc" } });
    res.json({ data: customers, summary: { count: customers.length, totalBalance: customers.reduce((a, c) => a + c.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/receivables", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const records = await prisma.saleRecord.findMany({ where: scopedWhere(s, { ...df(req), balance: { gt: 0 } }), include: { customer: true }, orderBy: { createdAt: "desc" } });
    res.json({ data: records, summary: { count: records.length, totalReceivable: records.reduce((a, r) => a + r.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/top", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const records = await prisma.saleRecord.findMany({ where: scopedWhere(s, df(req)), include: { customer: true } });
    const map = {};
    records.forEach((r) => {
      const name = r.customer?.name || "Walk-in";
      if (!map[name]) map[name] = { customer: name, count: 0, total: 0 };
      map[name].count++; map[name].total += r.total;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.total - a.total).slice(0, 20) });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== SUPPLIER REPORTS ====================
router.get("/suppliers/list", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const suppliers = await prisma.supplier.findMany({ where: scopedWhere(s), include: { branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    res.json({ data: suppliers, summary: { count: suppliers.length, totalBalance: suppliers.reduce((a, sup) => a + sup.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/purchases", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const purchases = await prisma.supplierPurchase.findMany({ where: scopedWhere(s, df(req)), include: { supplier: true, items: { include: { product: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } });
    const map = {};
    purchases.forEach((p) => {
      const name = p.supplier?.name || "Unknown";
      if (!map[name]) map[name] = { supplier: name, count: 0, total: 0 };
      map[name].count++; map[name].total += p.total;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.total - a.total) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/payables", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const purchases = await prisma.supplierPurchase.findMany({ where: scopedWhere(s, { ...df(req), balance: { gt: 0 } }), include: { supplier: true }, orderBy: { createdAt: "desc" } });
    res.json({ data: purchases, summary: { count: purchases.length, totalPayable: purchases.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/balance", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const suppliers = await prisma.supplier.findMany({ where: scopedWhere(s, { balance: { not: 0 } }), orderBy: { balance: "desc" } });
    res.json({ data: suppliers, summary: { count: suppliers.length, totalBalance: suppliers.reduce((a, sup) => a + sup.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== RECEIVABLES REPORTS ====================
router.get("/receivables/outstanding", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const invoices = await prisma.invoice.findMany({ where: scopedWhere(s, { status: { in: ["unpaid", "partial", "overdue"] } }), include: { customer: true }, orderBy: { dueDate: "asc" } });
    res.json({ data: invoices, summary: { count: invoices.length, totalOutstanding: invoices.reduce((a, inv) => a + inv.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/receivables/aging", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const customers = await prisma.customer.findMany({ where: scopedWhere(s, { balance: { gt: 0 } }), include: { sales: { where: { balance: { gt: 0 } }, select: { balance: true, dueDate: true, createdAt: true } } } });
    const now = new Date();
    const buckets = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const data = customers.map((c) => {
      const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      c.sales.forEach((sr) => {
        const ref = sr.dueDate || sr.createdAt;
        const days = Math.floor((now - new Date(ref)) / 86400000);
        if (days <= 0) { aging.current += sr.balance; buckets.current += sr.balance; }
        else if (days <= 30) { aging["1-30"] += sr.balance; buckets["1-30"] += sr.balance; }
        else if (days <= 60) { aging["31-60"] += sr.balance; buckets["31-60"] += sr.balance; }
        else if (days <= 90) { aging["61-90"] += sr.balance; buckets["61-90"] += sr.balance; }
        else { aging["90+"] += sr.balance; buckets["90+"] += sr.balance; }
      });
      return { customer: c.name, phone: c.phone, totalBalance: c.balance, aging };
    });
    res.json({ data, buckets });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/receivables/collection", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const payments = await prisma.customerPayment.findMany({ where: scopedWhere(s, df(req)), include: { customer: { select: { name: true } }, sale: { select: { receiptNo: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ data: payments, summary: { count: payments.length, totalCollected: payments.reduce((a, p) => a + p.amount, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/receivables/overdue", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const now = new Date();
    const records = await prisma.saleRecord.findMany({ where: scopedWhere(s, { balance: { gt: 0 }, dueDate: { lt: now } }), include: { customer: true }, orderBy: { dueDate: "asc" } });
    res.json({ data: records, summary: { count: records.length, totalOverdue: records.reduce((a, r) => a + r.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== PAYABLES REPORTS ====================
router.get("/payables/outstanding", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const purchases = await prisma.supplierPurchase.findMany({ where: scopedWhere(s, { balance: { gt: 0 } }), include: { supplier: true }, orderBy: { createdAt: "asc" } });
    res.json({ data: purchases, summary: { count: purchases.length, totalOutstanding: purchases.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/payables/aging", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const suppliers = await prisma.supplier.findMany({ where: scopedWhere(s, { balance: { gt: 0 } }), include: { purchases: { where: { balance: { gt: 0 } }, select: { balance: true, dueDate: true, createdAt: true } } } });
    const now = new Date();
    const buckets = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const data = suppliers.map((sup) => {
      const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      sup.purchases.forEach((p) => {
        const ref = p.dueDate || p.createdAt;
        const days = Math.floor((now - new Date(ref)) / 86400000);
        if (days <= 0) { aging.current += p.balance; buckets.current += p.balance; }
        else if (days <= 30) { aging["1-30"] += p.balance; buckets["1-30"] += p.balance; }
        else if (days <= 60) { aging["31-60"] += p.balance; buckets["31-60"] += p.balance; }
        else if (days <= 90) { aging["61-90"] += p.balance; buckets["61-90"] += p.balance; }
        else { aging["90+"] += p.balance; buckets["90+"] += p.balance; }
      });
      return { supplier: sup.name, phone: sup.phone, totalBalance: sup.balance, aging };
    });
    res.json({ data, buckets });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/payables/payment-history", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const payments = await prisma.supplierPayment.findMany({ where: scopedWhere(s, df(req)), include: { supplier: { select: { name: true } }, purchase: { select: { refNo: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ data: payments, summary: { count: payments.length, totalPaid: payments.reduce((a, p) => a + p.amount, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/payables/overdue", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const now = new Date();
    const purchases = await prisma.supplierPurchase.findMany({ where: scopedWhere(s, { balance: { gt: 0 }, dueDate: { lt: now } }), include: { supplier: true }, orderBy: { dueDate: "asc" } });
    res.json({ data: purchases, summary: { count: purchases.length, totalOverdue: purchases.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== BUSINESS PERFORMANCE REPORTS ====================
router.get("/performance/branch", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { branch: { select: { name: true } } } });
    const map = {};
    sales.forEach((sale) => {
      const name = sale.branch?.name || "Unassigned";
      if (!map[name]) map[name] = { branch: name, count: 0, revenue: 0, discount: 0, avgSale: 0 };
      map[name].count++; map[name].revenue += sale.total; map[name].discount += sale.discount;
    });
    Object.values(map).forEach((b) => { b.avgSale = b.count ? b.revenue / b.count : 0; });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/product", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: true } } } });
    const map = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, profit: 0, transactions: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].profit += item.total - (item.product?.cost || 0) * item.quantity;
        map[name].transactions++;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/category", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: { include: { category: true } } } } } });
    const map = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const cat = item.product?.category?.name || "Uncategorized";
        if (!map[cat]) map[cat] = { category: cat, quantity: 0, revenue: 0, profit: 0 };
        map[cat].quantity += item.quantity;
        map[cat].revenue += item.total;
        map[cat].profit += item.total - (item.product?.cost || 0) * item.quantity;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/user-activity", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const logs = await prisma.auditLog.findMany({ where: { tenantId: s.tenantId, ...df(req, "createdAt") }, orderBy: { createdAt: "desc" }, take: 500 });
    const map = {};
    logs.forEach((l) => {
      const email = l.userEmail || "Unknown";
      if (!map[email]) map[email] = { user: email, actions: 0, models: new Set() };
      map[email].actions++;
      map[email].models.add(l.model);
    });
    const data = Object.values(map).map((x) => ({ ...x, models: [...x.models] }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/top-products", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: true } } } });
    const map = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, profit: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].profit += item.total - (item.product?.cost || 0) * item.quantity;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.quantity - a.quantity).slice(0, 20) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/least-products", authenticateToken, requireRole(reportRoles), async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, df(req)), include: { items: { include: { product: true } } } });
    const map = {};
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, profit: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].profit += item.total - (item.product?.cost || 0) * item.quantity;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => a.quantity - b.quantity).slice(0, 20) });
  } catch (err) { handleBranchError(res, err); }
});

export default router;
