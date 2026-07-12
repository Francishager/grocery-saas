import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";
import { buildDecisionSupportSummary, buildSupplierStatementData } from "../utils/reportingHelpers.js";

const router = Router();

// ==================== HELPERS ====================
const reportRoles = ["owner", "manager", "accountant"];

// Map report path prefixes to granular permissions
const reportPermMap = {
  sales: "canViewSalesReport",
  inventory: "canViewInventoryReport",
  financial: "canViewFinancialReport",
  customers: "canViewCustomerReport",
  suppliers: "canViewSupplierReport",
  receivables: "canViewReceivablesReport",
  payables: "canViewPayablesReport",
  performance: "canViewPerformanceReport",
  expenses: "canViewFinancialReport",
  profit: "canViewFinancialReport",
  purchases: "canViewPayablesReport",
  services: "canViewServiceReport",
  rentals: "canViewRentalReport",
  fuel: "canViewFuelStationReport",
  manufacturing: "canViewManufacturingReport",
  agriculture: "canViewAgricultureReport",
  service_business: "canViewServiceBusinessReport",
  restaurant: "canViewRestaurantReport",
};

// Middleware: check granular report permission based on route prefix
function requireReportPermission(req, res, next) {
  // SaaS admin always has access
  if (req.user?.role === "saas_admin" || req.user?.isPlatformUser) return next();

  // Check UserPermission table for the specific report permission
  const pathSeg = req.path.split("/").filter(Boolean)[0]; // e.g. "sales", "inventory"
  const permKey = reportPermMap[pathSeg];

  if (!permKey) {
    // No mapping — fall back to role check
    return next();
  }

  // Check if user has the permission in their permissions array or specific perm key
  const perms = req.user.permissions || [];
  if (perms.includes("*") || perms.includes(permKey)) return next();

  // Also check the user's UserPermission record
  prisma.userPermission.findUnique({ where: { userId: req.user.id } })
    .then((p) => {
      if (p && p[permKey]) return next();
      return res.status(403).json({ error: "Permission denied", required: permKey });
    })
    .catch(() => res.status(500).json({ error: "Failed to check permission" }));
}

// Apply granular report permission check to all routes
router.use(authenticateToken, requireReportPermission);

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
router.get("/sales", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req));
    const sales = await prisma.sale.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ sales, summary: { count: sales.length, totalRevenue: sales.reduce((a, x) => a + x.total, 0), totalDiscount: sales.reduce((a, x) => a + x.discount, 0), totalTax: sales.reduce((a, x) => a + x.tax, 0) } });
  } catch (err) { console.error("Sales report error:", err); handleBranchError(res, err); }
});

router.get("/purchases", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req));
    const purchases = await prisma.purchase.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ purchases, summary: { count: purchases.length, totalCost: purchases.reduce((a, x) => a + x.total, 0) } });
  } catch (err) { console.error("Purchases report error:", err); handleBranchError(res, err); }
});

router.get("/expenses", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "date"));
    const expenses = await prisma.expense.findMany({ where, orderBy: { date: "desc" } });
    const byCategory = {};
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    res.json({ expenses, summary: { count: expenses.length, totalExpenses: expenses.reduce((a, x) => a + x.amount, 0), byCategory } });
  } catch (err) { console.error("Expenses report error:", err); handleBranchError(res, err); }
});

router.get("/profit", authenticateToken, async (req, res) => {
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
router.get("/sales/summary", authenticateToken, async (req, res) => {
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

router.get("/sales/daily", authenticateToken, async (req, res) => {
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

router.get("/sales/weekly", authenticateToken, async (req, res) => {
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

router.get("/sales/monthly", authenticateToken, async (req, res) => {
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

router.get("/sales/by-product", authenticateToken, async (req, res) => {
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

router.get("/sales/by-category", authenticateToken, async (req, res) => {
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

router.get("/sales/by-customer", authenticateToken, async (req, res) => {
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

router.get("/sales/by-user", authenticateToken, async (req, res) => {
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

router.get("/sales/by-branch", authenticateToken, async (req, res) => {
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

router.get("/sales/discounts", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, { ...df(req), OR: [{ discount: { gt: 0 } }, { cashDiscount: { gt: 0 } }] }), include: { items: { include: { product: { select: { name: true } } } }, user: { select: { fname: true, lname: true } }, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
    const totalDiscount = sales.reduce((a, x) => a + x.discount + x.cashDiscount, 0);
    const byUser = {};
    const byBranch = {};
    const byProduct = {};
    const byDate = {};
    sales.forEach((sale) => {
      const userName = `${sale.user?.fname || ""} ${sale.user?.lname || ""}`.trim() || "Unknown";
      const branchName = sale.branch?.name || "Unassigned";
      const date = new Date(sale.createdAt).toISOString().slice(0, 10);
      byUser[userName] = (byUser[userName] || 0) + sale.discount + sale.cashDiscount;
      byBranch[branchName] = (byBranch[branchName] || 0) + sale.discount + sale.cashDiscount;
      byDate[date] = (byDate[date] || 0) + sale.discount + sale.cashDiscount;
      (sale.items || []).forEach((item) => {
        const pName = item.product?.name || "Unknown";
        const itemDiscount = item.discount + (item.cashDiscount || 0);
        if (itemDiscount > 0) byProduct[pName] = (byProduct[pName] || 0) + itemDiscount;
      });
    });
    const data = sales.map((sale) => ({ receiptNo: sale.receiptNo, status: sale.status, discount: sale.discount + sale.cashDiscount, total: sale.total }));
    res.json({ data, summary: { count: data.length, totalDiscount, grossSales: sales.reduce((a, x) => a + x.subtotal, 0), netSales: sales.reduce((a, x) => a + x.total, 0), byUser, byBranch, byProduct, byDate } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/returns", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const sales = await prisma.sale.findMany({ where: scopedWhere(s, { ...df(req), status: { in: ["refunded", "cancelled"] } }), include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } });
    const data = sales.map((sale) => ({ receiptNo: sale.receiptNo, status: sale.status, total: sale.total, paymentMethod: sale.paymentMethod }));
    res.json({ data, summary: { count: data.length, totalRefunded: data.reduce((a, x) => a + x.total, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== MANUFACTURING REPORTS ====================
router.get("/manufacturing/summary", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req));
    const [orders, waste, recipes] = await Promise.all([
      prisma.productionOrder.findMany({ where, include: { product: true } }),
      prisma.productionWaste.findMany({ where, include: { product: true } }),
      prisma.recipe.findMany({ where, include: { product: true, ingredients: true } }),
    ]);

    const summary = {
      count: orders.length,
      completedCount: orders.filter((o) => o.status === "completed").length,
      inProgressCount: orders.filter((o) => o.status === "in_progress").length,
      totalQuantity: orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0),
      totalCost: orders.reduce((sum, order) => sum + Number(order.totalCost || 0), 0),
      wasteQty: waste.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      wasteCost: waste.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
      recipeCount: recipes.length,
    };

    res.json({ data: [{ ...summary }], summary });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/manufacturing/by-product", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const orders = await prisma.productionOrder.findMany({ where: scopedWhere(s, df(req)), include: { product: true } });
    const grouped = Object.values(orders.reduce((acc, order) => {
      const key = order.product?.name || "Unknown";
      if (!acc[key]) acc[key] = { product: key, orders: 0, quantity: 0, totalCost: 0, completed: 0 };
      acc[key].orders += 1;
      acc[key].quantity += Number(order.quantity || 0);
      acc[key].totalCost += Number(order.totalCost || 0);
      if (order.status === "completed") acc[key].completed += 1;
      return acc;
    }, {}));
    res.json({ data: grouped.sort((a, b) => b.totalCost - a.totalCost) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/manufacturing/waste", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const waste = await prisma.productionWaste.findMany({ where: scopedWhere(s, df(req)), include: { productionOrder: true, product: true } });
    const data = waste.map((item) => ({ orderNo: item.productionOrder?.orderNo || "—", product: item.product?.name || "Unspecified", quantity: item.quantity, totalCost: item.totalCost, reason: item.reason || "—", date: item.createdAt }));
    res.json({ data, summary: { count: data.length, totalWasteQty: data.reduce((sum, item) => sum + Number(item.quantity || 0), 0), totalWasteCost: data.reduce((sum, item) => sum + Number(item.totalCost || 0), 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/manufacturing/cost-analysis", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const orders = await prisma.productionOrder.findMany({ where: scopedWhere(s, df(req)), include: { product: true, recipe: true, wasteRecords: true } });
    const data = orders.map((order) => ({
      orderNo: order.orderNo,
      product: order.product?.name || "Unknown",
      quantity: order.quantity,
      totalCost: order.totalCost,
      wasteQty: order.wasteQty || 0,
      wasteCost: order.wasteRecords.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
      recipe: order.recipe?.name || "—",
    }));
    res.json({ data, summary: { count: data.length, totalCost: data.reduce((sum, item) => sum + Number(item.totalCost || 0), 0), totalWasteCost: data.reduce((sum, item) => sum + Number(item.wasteCost || 0), 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/manufacturing/bom", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const recipes = await prisma.recipe.findMany({ where: scopedWhere(s, df(req)), include: { product: true, ingredients: { include: { product: true } } } });
    const data = recipes.map((recipe) => ({
      name: recipe.name,
      product: recipe.product?.name || "Unknown",
      yield: recipe.yield || "—",
      ingredientCount: recipe.ingredients.length,
      ingredientCost: recipe.ingredients.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    }));
    res.json({ data, summary: { count: data.length } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== INVENTORY REPORTS ====================
router.get("/inventory/stock", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const products = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    const data = products.map((p) => ({ name: p.name, category: p.category?.name || "Uncategorized", quantity: p.quantity, cost: p.cost || 0, price: p.price || 0, sku: p.sku || "", branch: p.branch?.name || "Unassigned" }));
    res.json({ data, summary: { count: data.length, totalValue: data.reduce((a, p) => a + p.cost * p.quantity, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/valuation", authenticateToken, async (req, res) => {
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

router.get("/inventory/low-stock", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const allProducts = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { quantity: "asc" } });
    const filtered = allProducts.filter((p) => p.quantity <= p.minStock);
    const data = filtered.map((p) => ({ name: p.name, category: p.category?.name || "Uncategorized", quantity: p.quantity, branch: p.branch?.name || "Unassigned" }));
    res.json({ data, summary: { count: data.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/out-of-stock", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const products = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false }, quantity: { lte: 0 } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    const data = products.map((p) => ({ name: p.name, category: p.category?.name || "Uncategorized", branch: p.branch?.name || "Unassigned" }));
    res.json({ data, summary: { count: data.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/stock-movement", authenticateToken, async (req, res) => {
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

router.get("/inventory/adjustments", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const logs = await prisma.auditLog.findMany({ where: { tenantId: s.tenantId, model: "Product", action: "update", ...df(req, "createdAt") }, orderBy: { createdAt: "desc" } });
    res.json({ data: logs, summary: { count: logs.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/expiry", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const products = await prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false }, expiryDate: { not: null } }), include: { category: true, branch: { select: { name: true } } }, orderBy: { expiryDate: "asc" } });
    const now = new Date();
    const data = products.map((p) => ({ name: p.name, category: p.category?.name || "Uncategorized", quantity: p.quantity, expiryDate: p.expiryDate, daysUntilExpiry: Math.floor((new Date(p.expiryDate) - now) / 86400000), isExpired: new Date(p.expiryDate) < now }));
    res.json({ data, summary: { count: data.length, expired: data.filter((p) => p.isExpired).length, expiringSoon: data.filter((p) => !p.isExpired && p.daysUntilExpiry <= 30).length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/damaged", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const logs = await prisma.auditLog.findMany({ where: { tenantId: s.tenantId, model: "Product", action: "delete", ...df(req, "createdAt") }, orderBy: { createdAt: "desc" } });
    res.json({ data: logs, summary: { count: logs.length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/fast-moving", authenticateToken, async (req, res) => {
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

router.get("/inventory/slow-moving", authenticateToken, async (req, res) => {
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
router.get("/financial/profit-loss", authenticateToken, async (req, res) => {
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

router.get("/financial/income", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [salesAgg, customerPayments] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.customerPayment.aggregate({ where: scopedWhere(s, df(req)), _sum: { amount: true } }),
    ]);
    res.json({ salesRevenue: salesAgg._sum.total || 0, customerPayments: customerPayments._sum.amount || 0, totalIncome: (salesAgg._sum.total || 0) + (customerPayments._sum.amount || 0) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/expense", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const expenses = await prisma.expense.findMany({ where: scopedWhere(s, df(req, "date")), orderBy: { date: "desc" } });
    const byCategory = {};
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const data = expenses.map((e) => ({ category: e.category, amount: e.amount, date: e.date, description: e.description || "" }));
    res.json({ data, summary: { count: data.length, totalExpenses: data.reduce((a, e) => a + e.amount, 0), byCategory } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/cash-flow", authenticateToken, async (req, res) => {
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

router.get("/financial/trial-balance", authenticateToken, async (req, res) => {
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

router.get("/financial/balance-sheet", authenticateToken, async (req, res) => {
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

router.get("/financial/general-ledger", authenticateToken, async (req, res) => {
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

router.get("/financial/bank-transactions", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const transactions = await prisma.cashTransaction.findMany({ where: { tenantId: s.tenantId, ...df(req), account: { type: "bank" } }, include: { account: { select: { name: true, type: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ data: transactions, summary: { count: transactions.length, totalIn: transactions.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0), totalOut: transactions.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/tax", authenticateToken, async (req, res) => {
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
router.get("/customers/list", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const customers = await prisma.customer.findMany({ where: scopedWhere(s), include: { branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    const data = customers.map((c) => ({ name: c.name, phone: c.phone || "", email: c.email || "", balance: c.balance || 0 }));
    res.json({ data, summary: { count: data.length, totalBalance: data.reduce((a, c) => a + c.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/sales", authenticateToken, async (req, res) => {
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

router.get("/customers/balance", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const customers = await prisma.customer.findMany({ where: scopedWhere(s, { balance: { not: 0 } }), orderBy: { balance: "desc" } });
    res.json({ data: customers, summary: { count: customers.length, totalBalance: customers.reduce((a, c) => a + c.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/receivables", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const records = await prisma.saleRecord.findMany({ where: scopedWhere(s, { ...df(req), balance: { gt: 0 } }), include: { customer: true }, orderBy: { createdAt: "desc" } });
    const data = records.map((r) => ({ customer: r.customer?.name || "Walk-in", total: r.total, amountPaid: r.amountPaid, balance: r.balance }));
    res.json({ data, summary: { count: data.length, totalReceivable: data.reduce((a, r) => a + r.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/top", authenticateToken, async (req, res) => {
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
router.get("/suppliers/list", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const suppliers = await prisma.supplier.findMany({ where: scopedWhere(s), include: { branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    const data = suppliers.map((sup) => ({ name: sup.name, phone: sup.phone || "", email: sup.email || "", balance: sup.balance || 0 }));
    res.json({ data, summary: { count: data.length, totalBalance: data.reduce((a, sup) => a + sup.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/purchases", authenticateToken, async (req, res) => {
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

router.get("/suppliers/payables", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const purchases = await prisma.supplierPurchase.findMany({ where: scopedWhere(s, { ...df(req), balance: { gt: 0 } }), include: { supplier: true }, orderBy: { createdAt: "desc" } });
    const data = purchases.map((p) => ({ supplier: p.supplier?.name || "Unknown", total: p.total, balance: p.balance, createdAt: p.createdAt }));
    res.json({ data, summary: { count: data.length, totalPayable: data.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/balance", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const suppliers = await prisma.supplier.findMany({ where: scopedWhere(s, { balance: { not: 0 } }), orderBy: { balance: "desc" } });
    res.json({ data: suppliers, summary: { count: suppliers.length, totalBalance: suppliers.reduce((a, sup) => a + sup.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/statement", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { supplierId } = req.query;

    if (!supplierId) {
      return res.status(400).json({ error: "supplierId is required" });
    }

    const [supplier, purchases, payments] = await Promise.all([
      prisma.supplier.findFirst({ where: scopedWhere(s, { id: supplierId }) }),
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s, { supplierId }),
        include: { supplier: true, items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.supplierPayment.findMany({
        where: scopedWhere(s, { supplierId }),
        include: { supplier: true, purchase: { select: { id: true, refNo: true } } },
        orderBy: { createdAt: "desc" }
      })
    ]);

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    res.json(buildSupplierStatementData(supplier, purchases, payments));
  } catch (err) {
    handleBranchError(res, err);
  }
});

router.get("/decision-support", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [sales, purchases, products, expenses, suppliers] = await Promise.all([
      prisma.sale.findMany({ where: scopedWhere(s, df(req)), select: { total: true } }),
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, df(req)), select: { total: true } }),
      prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), select: { quantity: true, minStock: true, expiryDate: true } }),
      prisma.expense.findMany({ where: scopedWhere(s, df(req, "date")), select: { amount: true } }),
      prisma.supplier.findMany({ where: scopedWhere(s), select: { balance: true } })
    ]);

    const summary = buildDecisionSupportSummary({
      sales,
      purchases,
      products,
      expenses,
      suppliers,
    });

    res.json({ data: summary, summary });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// ==================== RECEIVABLES REPORTS ====================
router.get("/receivables/outstanding", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const invoices = await prisma.invoice.findMany({ where: scopedWhere(s, { status: { in: ["unpaid", "partial", "overdue"] } }), include: { customer: true }, orderBy: { dueDate: "asc" } });
    const data = invoices.map((inv) => ({ customer: inv.customer?.name || "Unknown", status: inv.status, balance: inv.balance, dueDate: inv.dueDate }));
    res.json({ data, summary: { count: data.length, totalOutstanding: data.reduce((a, inv) => a + inv.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/receivables/aging", authenticateToken, async (req, res) => {
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

router.get("/receivables/collection", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const payments = await prisma.customerPayment.findMany({ where: scopedWhere(s, df(req)), include: { customer: { select: { name: true } }, sale: { select: { receiptNo: true } } }, orderBy: { createdAt: "desc" } });
    const data = payments.map((p) => ({ createdAt: p.createdAt, customer: p.customer?.name || "Walk-in", amount: p.amount, paymentMethod: p.paymentMethod || "cash" }));
    res.json({ data, summary: { count: data.length, totalCollected: data.reduce((a, p) => a + p.amount, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/receivables/overdue", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const now = new Date();
    const records = await prisma.saleRecord.findMany({ where: scopedWhere(s, { balance: { gt: 0 }, dueDate: { lt: now } }), include: { customer: true }, orderBy: { dueDate: "asc" } });
    const data = records.map((r) => ({ customer: r.customer?.name || "Unknown", balance: r.balance, dueDate: r.dueDate }));
    res.json({ data, summary: { count: data.length, totalOverdue: data.reduce((a, r) => a + r.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== PAYABLES REPORTS ====================
router.get("/payables/outstanding", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const purchases = await prisma.supplierPurchase.findMany({ where: scopedWhere(s, { balance: { gt: 0 } }), include: { supplier: true }, orderBy: { createdAt: "asc" } });
    const data = purchases.map((p) => ({ supplier: p.supplier?.name || "Unknown", total: p.total, balance: p.balance, createdAt: p.createdAt }));
    res.json({ data, summary: { count: data.length, totalOutstanding: data.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/payables/aging", authenticateToken, async (req, res) => {
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

router.get("/payables/payment-history", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const payments = await prisma.supplierPayment.findMany({ where: scopedWhere(s, df(req)), include: { supplier: { select: { name: true } }, purchase: { select: { refNo: true } } }, orderBy: { createdAt: "desc" } });
    const data = payments.map((p) => ({ createdAt: p.createdAt, supplier: p.supplier?.name || "Unknown", amount: p.amount, paymentMethod: p.paymentMethod || "cash" }));
    res.json({ data, summary: { count: data.length, totalPaid: data.reduce((a, p) => a + p.amount, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/payables/overdue", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const now = new Date();
    const purchases = await prisma.supplierPurchase.findMany({ where: scopedWhere(s, { balance: { gt: 0 }, dueDate: { lt: now } }), include: { supplier: true }, orderBy: { dueDate: "asc" } });
    const data = purchases.map((p) => ({ supplier: p.supplier?.name || "Unknown", balance: p.balance, dueDate: p.dueDate }));
    res.json({ data, summary: { count: data.length, totalOverdue: data.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== BUSINESS PERFORMANCE REPORTS ====================
router.get("/performance/branch", authenticateToken, async (req, res) => {
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

router.get("/performance/product", authenticateToken, async (req, res) => {
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

router.get("/performance/category", authenticateToken, async (req, res) => {
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

router.get("/performance/user-activity", authenticateToken, async (req, res) => {
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

router.get("/performance/top-products", authenticateToken, async (req, res) => {
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

router.get("/performance/least-products", authenticateToken, async (req, res) => {
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

// ==================== SERVICE REPORTS ====================
router.get("/services/summary", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = { ...scopedWhere(s), itemType: "service", isActive: { not: false } };
    const [agg, count] = await Promise.all([
      prisma.product.aggregate({ where, _sum: { price: true }, _avg: { price: true } }),
      prisma.product.count({ where }),
    ]);
    // Count how many times services were sold
    const saleItemWhere = { product: { ...scopedWhere(s), itemType: "service" } };
    const saleItems = await prisma.saleItem.findMany({
      where: saleItemWhere,
      include: { product: { select: { name: true } } },
    });
    const totalRevenue = saleItems.reduce((a, i) => a + i.total, 0);
    const totalQuantity = saleItems.reduce((a, i) => a + i.quantity, 0);
    res.json({
      count,
      totalRevenue,
      totalQuantity,
      avgPrice: agg._avg.price || 0,
      salesCount: saleItems.length,
    });
  } catch (err) { console.error("services/summary error:", err); handleBranchError(res, err); }
});

router.get("/services/list", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const services = await prisma.product.findMany({
      where: scopedWhere(s, { itemType: "service", isActive: { not: false } }),
      include: { category: true, branch: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const data = services.map((p) => ({
      name: p.name,
      category: p.serviceCategory || p.category?.name || "Uncategorized",
      price: p.price || 0,
      estimatedHours: p.estimatedHours || 0,
      branch: p.branch?.name || "Unassigned",
    }));
    res.json({ data, summary: { count: data.length, totalValue: data.reduce((a, p) => a + p.price, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/services/sales", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s, df(req)), itemType: "service" } },
      include: { product: { select: { name: true, serviceCategory: true } }, sale: { select: { receiptNo: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
    });
    const data = saleItems.map((i) => ({
      service: i.product?.name || "Unknown",
      category: i.product?.serviceCategory || "Uncategorized",
      receiptNo: i.sale?.receiptNo || "",
      customer: "Walk-in",
      quantity: i.quantity,
      total: i.total,
      date: i.createdAt,
    }));
    res.json({ data, summary: { count: data.length, totalRevenue: data.reduce((a, d) => a + d.total, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/services/by-category", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s, df(req)), itemType: "service" } },
      include: { product: { select: { name: true, serviceCategory: true } } },
    });
    const map = {};
    saleItems.forEach((i) => {
      const cat = i.product?.serviceCategory || "Uncategorized";
      if (!map[cat]) map[cat] = { category: cat, quantity: 0, revenue: 0, count: 0 };
      map[cat].quantity += i.quantity;
      map[cat].revenue += i.total;
      map[cat].count++;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/services/by-branch", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s, df(req)), itemType: "service" } },
      include: { product: { select: { name: true } }, sale: { select: { branch: { select: { name: true } } } } },
    });
    const map = {};
    saleItems.forEach((i) => {
      const branch = i.sale?.branch?.name || "Unassigned";
      if (!map[branch]) map[branch] = { branch, count: 0, revenue: 0 };
      map[branch].count++;
      map[branch].revenue += i.total;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/services/top", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s, df(req)), itemType: "service" } },
      include: { product: { select: { name: true } } },
    });
    const map = {};
    saleItems.forEach((i) => {
      const name = i.product?.name || "Unknown";
      if (!map[name]) map[name] = { service: name, quantity: 0, revenue: 0 };
      map[name].quantity += i.quantity;
      map[name].revenue += i.total;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 20) });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== RENTAL REPORTS ====================
router.get("/rentals/summary", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "hireDate"));
    const [agg, count, activeCount, returnedCount, cancelledCount] = await Promise.all([
      prisma.rental.aggregate({ where, _sum: { totalAmount: true, depositAmount: true, amountPaid: true, balance: true, discount: true, taxAmount: true } }),
      prisma.rental.count({ where }),
      prisma.rental.count({ where: { ...where, status: "active" } }),
      prisma.rental.count({ where: { ...where, status: "returned" } }),
      prisma.rental.count({ where: { ...where, status: "cancelled" } }),
    ]);
    res.json({
      count,
      totalRevenue: agg._sum.totalAmount || 0,
      totalDeposit: agg._sum.depositAmount || 0,
      totalPaid: agg._sum.amountPaid || 0,
      totalBalance: agg._sum.balance || 0,
      totalDiscount: agg._sum.discount || 0,
      totalTax: agg._sum.taxAmount || 0,
      activeCount,
      returnedCount,
      cancelledCount,
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/list", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({
      where: scopedWhere(s, df(req, "hireDate")),
      include: { customer: { select: { name: true, phone: true } }, branch: { select: { name: true } }, items: { include: { product: { select: { name: true } } } } },
      orderBy: { hireDate: "desc" },
    });
    const data = rentals.map((r) => ({
      rentalNo: r.rentalNo,
      customer: r.customer?.name || r.customerName || "Walk-in",
      phone: r.customer?.phone || r.customerPhone || "",
      branch: r.branch?.name || "Unassigned",
      hireDate: r.hireDate,
      expectedReturnDate: r.expectedReturnDate,
      actualReturnDate: r.actualReturnDate,
      status: r.status,
      totalAmount: r.totalAmount,
      deposit: r.depositAmount,
      paid: r.amountPaid,
      balance: r.balance,
      itemCount: r.items.length,
    }));
    res.json({ data, summary: { count: data.length, totalRevenue: data.reduce((a, d) => a + d.totalAmount, 0), totalDeposit: data.reduce((a, d) => a + d.deposit, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/by-item", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({
      where: scopedWhere(s, df(req, "hireDate")),
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    const map = {};
    rentals.forEach((r) => {
      r.items.forEach((i) => {
        const name = i.product?.name || "Unknown";
        if (!map[name]) map[name] = { item: name, hireCount: 0, totalRevenue: 0, totalDeposit: 0 };
        map[name].hireCount++;
        map[name].totalRevenue += i.totalAmount;
        map[name].totalDeposit += r.depositAmount || 0;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.totalRevenue - a.totalRevenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/by-customer", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({
      where: scopedWhere(s, df(req, "hireDate")),
      include: { customer: { select: { name: true } } },
    });
    const map = {};
    rentals.forEach((r) => {
      const name = r.customer?.name || r.customerName || "Walk-in";
      if (!map[name]) map[name] = { customer: name, count: 0, totalRevenue: 0, totalDeposit: 0, balance: 0 };
      map[name].count++;
      map[name].totalRevenue += r.totalAmount;
      map[name].totalDeposit += r.depositAmount;
      map[name].balance += r.balance;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.totalRevenue - a.totalRevenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/by-branch", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({
      where: scopedWhere(s, df(req, "hireDate")),
      include: { branch: { select: { name: true } } },
    });
    const map = {};
    rentals.forEach((r) => {
      const name = r.branch?.name || "Unassigned";
      if (!map[name]) map[name] = { branch: name, count: 0, revenue: 0, deposit: 0 };
      map[name].count++;
      map[name].revenue += r.totalAmount;
      map[name].deposit += r.depositAmount;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/active", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({
      where: scopedWhere(s, { status: "active" }),
      include: { customer: { select: { name: true, phone: true } }, items: { include: { product: { select: { name: true } } } } },
      orderBy: { expectedReturnDate: "asc" },
    });
    const now = new Date();
    const data = rentals.map((r) => ({
      rentalNo: r.rentalNo,
      customer: r.customer?.name || r.customerName || "Walk-in",
      phone: r.customer?.phone || r.customerPhone || "",
      hireDate: r.hireDate,
      expectedReturnDate: r.expectedReturnDate,
      daysOverdue: r.expectedReturnDate < now ? Math.floor((now - new Date(r.expectedReturnDate)) / 86400000) : 0,
      totalAmount: r.totalAmount,
      balance: r.balance,
      itemCount: r.items.length,
    }));
    res.json({ data, summary: { count: data.length, overdue: data.filter((d) => d.daysOverdue > 0).length, totalBalance: data.reduce((a, d) => a + d.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/overdue", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const now = new Date();
    const rentals = await prisma.rental.findMany({
      where: { ...scopedWhere(s, { status: "active" }), expectedReturnDate: { lt: now } },
      include: { customer: { select: { name: true, phone: true } }, items: { include: { product: { select: { name: true } } } } },
      orderBy: { expectedReturnDate: "asc" },
    });
    const data = rentals.map((r) => ({
      rentalNo: r.rentalNo,
      customer: r.customer?.name || r.customerName || "Walk-in",
      phone: r.customer?.phone || r.customerPhone || "",
      hireDate: r.hireDate,
      expectedReturnDate: r.expectedReturnDate,
      daysOverdue: Math.floor((now - new Date(r.expectedReturnDate)) / 86400000),
      totalAmount: r.totalAmount,
      balance: r.balance,
      itemCount: r.items.length,
    }));
    res.json({ data, summary: { count: data.length, totalBalance: data.reduce((a, d) => a + d.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/returns", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({
      where: scopedWhere(s, { ...df(req, "actualReturnDate"), status: "returned" }),
      include: { customer: { select: { name: true } }, items: true },
      orderBy: { actualReturnDate: "desc" },
    });
    const data = rentals.map((r) => ({
      rentalNo: r.rentalNo,
      customer: r.customer?.name || r.customerName || "Walk-in",
      hireDate: r.hireDate,
      actualReturnDate: r.actualReturnDate,
      totalAmount: r.totalAmount,
      depositStatus: r.depositStatus,
      damageFees: r.items.reduce((a, i) => a + (i.damageFee || 0), 0),
    }));
    res.json({ data, summary: { count: data.length, totalDamageFees: data.reduce((a, d) => a + d.damageFees, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/daily", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({ where: scopedWhere(s, df(req, "hireDate")), orderBy: { hireDate: "asc" } });
    const map = {};
    rentals.forEach((r) => {
      const day = new Date(r.hireDate).toISOString().slice(0, 10);
      if (!map[day]) map[day] = { date: day, count: 0, revenue: 0, deposit: 0 };
      map[day].count++;
      map[day].revenue += r.totalAmount;
      map[day].deposit += r.depositAmount;
    });
    res.json({ data: Object.values(map) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/rentals/monthly", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const rentals = await prisma.rental.findMany({ where: scopedWhere(s, df(req, "hireDate")), orderBy: { hireDate: "asc" } });
    const map = {};
    rentals.forEach((r) => {
      const m = new Date(r.hireDate).toISOString().slice(0, 7);
      if (!map[m]) map[m] = { month: m, count: 0, revenue: 0, deposit: 0 };
      map[m].count++;
      map[m].revenue += r.totalAmount;
      map[m].deposit += r.depositAmount;
    });
    res.json({ data: Object.values(map) });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== FUEL STATION REPORTS ====================

// Fuel Sales Summary
router.get("/fuel/sales-summary", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const shifts = await prisma.fuelShiftReport.findMany({
      where: scopedWhere(s, df(req, "startDate")),
    });
    const totalLitres = shifts.reduce((a, x) => a + (x.litresSold || 0), 0);
    const cashSales = shifts.reduce((a, x) => a + (x.cashSales || 0), 0);
    const mobileSales = shifts.reduce((a, x) => a + (x.mobileSales || 0), 0);
    const creditSales = shifts.reduce((a, x) => a + (x.creditSales || 0), 0);
    const totalSales = shifts.reduce((a, x) => a + (x.totalSales || 0), 0);
    const lubricantSales = shifts.reduce((a, x) => a + (x.lubricantSales || 0), 0);
    const carWashIncome = shifts.reduce((a, x) => a + (x.carWashIncome || 0), 0);
    const expenses = shifts.reduce((a, x) => a + (x.expenses || 0), 0);
    const netAmount = shifts.reduce((a, x) => a + (x.netAmount || 0), 0);
    res.json({
      data: {
        shiftCount: shifts.length,
        totalLitres,
        cashSales,
        mobileSales,
        creditSales,
        totalSales,
        lubricantSales,
        carWashIncome,
        expenses,
        netAmount,
      },
    });
  } catch (err) { handleBranchError(res, err); }
});

// Fuel Sales by Pump
router.get("/fuel/sales-by-pump", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const readings = await prisma.fuelMeterReading.findMany({
      where: scopedWhere(s, df(req, "readingDate")),
      include: { pump: { select: { name: true } } },
    });
    const map = {};
    readings.forEach((r) => {
      const name = r.pump?.name || "Unknown";
      if (!map[name]) map[name] = { pump: name, litresSold: 0, amount: 0, readings: 0 };
      map[name].litresSold += r.litresSold || 0;
      map[name].amount += r.amount || 0;
      map[name].readings += 1;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.amount - a.amount) });
  } catch (err) { handleBranchError(res, err); }
});

// Tank Stock Report
router.get("/fuel/tank-stock", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const tanks = await prisma.fuelTank.findMany({
      where: scopedWhere(s),
      orderBy: { name: "asc" },
    });
    const data = tanks.map((t) => ({
      tank: t.name,
      fuelType: t.fuelType,
      capacity: t.capacity,
      currentStock: t.currentStock,
      unitCost: t.unitCost,
      stockValue: (t.currentStock || 0) * (t.unitCost || 0),
      fillPercent: t.capacity > 0 ? Math.round((t.currentStock / t.capacity) * 100) : 0,
      isActive: t.isActive,
    }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

// Fuel Deliveries Report
router.get("/fuel/deliveries", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const deliveries = await prisma.fuelDelivery.findMany({
      where: scopedWhere(s, df(req, "deliveryDate")),
      include: { tank: { select: { name: true, fuelType: true } } },
      orderBy: { deliveryDate: "desc" },
    });
    const data = deliveries.map((d) => ({
      tank: d.tank?.name || "—",
      fuelType: d.tank?.fuelType || "—",
      supplierName: d.supplierName || "—",
      invoiceNo: d.invoiceNo || "—",
      litres: d.litres,
      unitCost: d.unitCost,
      totalCost: d.totalCost,
      deliveryDate: d.deliveryDate,
    }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

// Shift Summary Report
router.get("/fuel/shift-summary", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const shifts = await prisma.fuelShiftReport.findMany({
      where: scopedWhere(s, df(req, "startDate")),
      include: {
        pump: { select: { name: true } },
        user: { select: { fname: true, lname: true } },
      },
      orderBy: { startDate: "desc" },
    });
    const data = shifts.map((sh) => ({
      shiftNo: sh.shiftNo,
      pump: sh.pump?.name || "—",
      attendant: sh.user ? `${sh.user.fname} ${sh.user.lname}`.trim() : "—",
      openingReading: sh.openingReading,
      closingReading: sh.closingReading,
      litresSold: sh.litresSold,
      cashSales: sh.cashSales,
      mobileSales: sh.mobileSales,
      creditSales: sh.creditSales,
      totalSales: sh.totalSales,
      expenses: sh.expenses,
      netAmount: sh.netAmount,
      status: sh.status,
      startDate: sh.startDate,
      endDate: sh.endDate,
    }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

// Lubricant Sales Report
router.get("/fuel/lubricant-sales", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const shifts = await prisma.fuelShiftReport.findMany({
      where: scopedWhere(s, df(req, "startDate")),
      include: { pump: { select: { name: true } }, user: { select: { fname: true, lname: true } } },
      orderBy: { startDate: "desc" },
    });
    const data = shifts
      .filter((sh) => (sh.lubricantSales || 0) > 0)
      .map((sh) => ({
        shiftNo: sh.shiftNo,
        pump: sh.pump?.name || "—",
        attendant: sh.user ? `${sh.user.fname} ${sh.user.lname}`.trim() : "—",
        lubricantSales: sh.lubricantSales,
        startDate: sh.startDate,
      }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

// Car Wash Income Report
router.get("/fuel/car-wash-income", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const shifts = await prisma.fuelShiftReport.findMany({
      where: scopedWhere(s, df(req, "startDate")),
      include: { pump: { select: { name: true } }, user: { select: { fname: true, lname: true } } },
      orderBy: { startDate: "desc" },
    });
    const data = shifts
      .filter((sh) => (sh.carWashIncome || 0) > 0)
      .map((sh) => ({
        shiftNo: sh.shiftNo,
        pump: sh.pump?.name || "—",
        attendant: sh.user ? `${sh.user.fname} ${sh.user.lname}`.trim() : "—",
        carWashIncome: sh.carWashIncome,
        startDate: sh.startDate,
      }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

// Meter Readings Report
router.get("/fuel/meter-readings", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const readings = await prisma.fuelMeterReading.findMany({
      where: scopedWhere(s, df(req, "readingDate")),
      include: { pump: { select: { name: true } } },
      orderBy: { readingDate: "desc" },
    });
    const data = readings.map((r) => ({
      pump: r.pump?.name || "—",
      openingReading: r.openingReading,
      closingReading: r.closingReading,
      litresSold: r.litresSold,
      amount: r.amount,
      readingDate: r.readingDate,
    }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

export default router;
