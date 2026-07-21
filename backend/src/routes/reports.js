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
    const [salesAgg, expensesAgg, salesWithItems] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s, df(req, "date")), _sum: { amount: true } }),
      prisma.sale.findMany({
        where: scopedWhere(s, df(req)),
        select: { items: { select: { quantity: true, product: { select: { cost: true } } } } },
      }),
    ]);
    const revenue = salesAgg._sum.total || 0;
    const cogs = salesWithItems.reduce((sum, sale) =>
      sum + sale.items.reduce((s, item) => s + (item.product?.cost || 0) * item.quantity, 0), 0);
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
      actualQuantity: orders.reduce((sum, order) => sum + Number(order.actualQuantity || 0), 0),
      totalStandardCost: orders.reduce((sum, order) => sum + Number(order.standardCost || 0), 0),
      totalActualCost: orders.reduce((sum, order) => sum + Number(order.actualCost || order.totalCost || 0), 0),
      totalLaborCost: orders.reduce((sum, order) => sum + Number(order.laborCost || 0), 0),
      totalOverheadCost: orders.reduce((sum, order) => sum + Number(order.overheadCost || 0), 0),
      costVariance: orders.reduce((sum, order) => sum + (Number(order.actualCost || order.totalCost || 0) - Number(order.standardCost || 0)), 0),
      totalExpectedYield: orders.reduce((sum, order) => sum + Number(order.expectedYield || 0), 0),
      totalActualYield: orders.reduce((sum, order) => sum + Number(order.actualYield || 0), 0),
      passedQc: orders.filter((o) => o.qualityStatus === "passed").length,
      failedQc: orders.filter((o) => o.qualityStatus === "failed").length,
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
      if (!acc[key]) acc[key] = { product: key, orders: 0, quantity: 0, actualQuantity: 0, totalCost: 0, standardCost: 0, actualCost: 0, costVariance: 0, completed: 0, passedQc: 0, failedQc: 0 };
      acc[key].orders += 1;
      acc[key].quantity += Number(order.quantity || 0);
      acc[key].actualQuantity += Number(order.actualQuantity || 0);
      acc[key].totalCost += Number(order.totalCost || 0);
      acc[key].standardCost += Number(order.standardCost || 0);
      acc[key].actualCost += Number(order.actualCost || order.totalCost || 0);
      acc[key].costVariance += Number(order.actualCost || order.totalCost || 0) - Number(order.standardCost || 0);
      if (order.status === "completed") acc[key].completed += 1;
      if (order.qualityStatus === "passed") acc[key].passedQc += 1;
      if (order.qualityStatus === "failed") acc[key].failedQc += 1;
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
      actualQuantity: order.actualQuantity || 0,
      standardCost: Number(order.standardCost || 0),
      actualCost: Number(order.actualCost || order.totalCost || 0),
      costVariance: Number(order.actualCost || order.totalCost || 0) - Number(order.standardCost || 0),
      laborCost: Number(order.laborCost || 0),
      overheadCost: Number(order.overheadCost || 0),
      totalCost: order.totalCost,
      wasteQty: order.wasteQty || 0,
      wasteCost: order.wasteRecords.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
      expectedYield: Number(order.expectedYield || 0),
      actualYield: Number(order.actualYield || 0),
      yieldVariance: Number(order.actualYield || 0) - Number(order.expectedYield || 0),
      qualityStatus: order.qualityStatus || "pending",
      batchNumber: order.batchNumber || "—",
      recipe: order.recipe?.name || "—",
    }));
    res.json({ data, summary: {
      count: data.length,
      totalCost: data.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
      totalStandardCost: data.reduce((sum, item) => sum + item.standardCost, 0),
      totalActualCost: data.reduce((sum, item) => sum + item.actualCost, 0),
      totalCostVariance: data.reduce((sum, item) => sum + item.costVariance, 0),
      totalLaborCost: data.reduce((sum, item) => sum + item.laborCost, 0),
      totalOverheadCost: data.reduce((sum, item) => sum + item.overheadCost, 0),
      totalWasteCost: data.reduce((sum, item) => sum + Number(item.wasteCost || 0), 0),
      passedQc: data.filter((item) => item.qualityStatus === "passed").length,
      failedQc: data.filter((item) => item.qualityStatus === "failed").length,
    } });
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
    res.json({ data, summary: { count: data.length, expired: data.filter((p) => p.isExpired).length, expiringSoon: data.filter((p) => !p.isExpired && p.daysUntilExpiry <= 60).length } });
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
    const { from, to } = req.query;

    // Determine current and previous period
    let curStart, curEnd, prevStart, prevEnd;
    if (from && to) {
      curStart = new Date(from);
      curEnd = new Date(to + "T23:59:59");
      const duration = curEnd - curStart;
      prevEnd = new Date(curStart.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - duration);
    } else {
      const now = new Date();
      curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = curStart;
    }

    const curWhere = scopedWhere(s, { createdAt: { gte: curStart, lt: curEnd } });
    const prevWhere = scopedWhere(s, { createdAt: { gte: prevStart, lt: prevEnd } });
    const curExpWhere = scopedWhere(s, { date: { gte: curStart, lt: curEnd } });
    const prevExpWhere = scopedWhere(s, { date: { gte: prevStart, lt: prevEnd } });

    const [salesAgg, expensesAgg, salesCount, salesWithItems,
           prevSalesAgg, prevExpensesAgg, prevSalesCount, prevSalesWithItems] = await Promise.all([
      prisma.sale.aggregate({ where: curWhere, _sum: { total: true, discount: true, tax: true } }),
      prisma.expense.aggregate({ where: curExpWhere, _sum: { amount: true } }),
      prisma.sale.count({ where: curWhere }),
      prisma.sale.findMany({ where: curWhere, select: { items: { select: { quantity: true, product: { select: { cost: true } } } } } }),
      prisma.sale.aggregate({ where: prevWhere, _sum: { total: true, discount: true, tax: true } }),
      prisma.expense.aggregate({ where: prevExpWhere, _sum: { amount: true } }),
      prisma.sale.count({ where: prevWhere }),
      prisma.sale.findMany({ where: prevWhere, select: { items: { select: { quantity: true, product: { select: { cost: true } } } } } }),
    ]);

    const revenue = salesAgg._sum.total || 0;
    const cogs = salesWithItems.reduce((sum, sale) =>
      sum + sale.items.reduce((si, item) => si + (item.product?.cost || 0) * item.quantity, 0), 0);
    const expenses = expensesAgg._sum.amount || 0;
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses;

    // Previous period
    const prevRevenue = prevSalesAgg._sum.total || 0;
    const prevCogs = prevSalesWithItems.reduce((sum, sale) =>
      sum + sale.items.reduce((si, item) => si + (item.product?.cost || 0) * item.quantity, 0), 0);
    const prevExpenses = prevExpensesAgg._sum.amount || 0;
    const prevGrossProfit = prevRevenue - prevCogs;
    const prevNetProfit = prevGrossProfit - prevExpenses;

    const pct = (cur, prev) => prev !== 0 ? ((cur - prev) / Math.abs(prev) * 100) : (cur > 0 ? 100 : 0);

    // Margins
    const grossMargin = revenue > 0 ? (grossProfit / revenue * 100) : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue * 100) : 0;
    const prevGrossMargin = prevRevenue > 0 ? (prevGrossProfit / prevRevenue * 100) : 0;
    const prevNetMargin = prevRevenue > 0 ? (prevNetProfit / prevRevenue * 100) : 0;

    // Auto-commentary
    const commentary = [];
    if (prevRevenue > 0) {
      const revChange = pct(revenue, prevRevenue);
      if (revChange > 10) commentary.push(`Revenue grew ${revChange.toFixed(1)}% vs previous period.`);
      else if (revChange < -10) commentary.push(`Revenue declined ${revChange.toFixed(1)}% vs previous period.`);
    }
    if (prevCogs !== 0) {
      const cogsChange = pct(cogs, prevCogs);
      const revChange = pct(revenue, prevRevenue);
      if (cogsChange > revChange && cogsChange > 5) {
        commentary.push(`COGS increased faster than revenue (${cogsChange.toFixed(1)}% vs ${revChange.toFixed(1)}%), squeezing gross margins.`);
      } else if (cogsChange < revChange && cogsChange < 0) {
        commentary.push(`COGS decreased while revenue grew, improving gross margins.`);
      }
    }
    if (prevExpenses !== 0) {
      const expChange = pct(expenses, prevExpenses);
      if (expChange > 20) commentary.push(`Operating expenses surged ${expChange.toFixed(1)}% — review cost control.`);
      else if (expChange < -15) commentary.push(`Operating expenses reduced by ${Math.abs(expChange).toFixed(1)}% — good cost discipline.`);
    }
    if (prevNetProfit !== 0) {
      const profitChange = pct(netProfit, prevNetProfit);
      if (profitChange > 15) commentary.push(`Net profit improved ${profitChange.toFixed(1)}%.`);
      else if (profitChange < -15) commentary.push(`Net profit dropped ${profitChange.toFixed(1)}% — investigate causes.`);
    }
    const marginShift = netMargin - prevNetMargin;
    if (Math.abs(marginShift) > 2) {
      commentary.push(`Net margin ${marginShift > 0 ? 'improved' : 'contracted'} by ${Math.abs(marginShift).toFixed(1)}pp.`);
    }

    res.json({
      revenue, cogs, grossProfit, expenses, netProfit,
      totalDiscount: salesAgg._sum.discount || 0, totalTax: salesAgg._sum.tax || 0, salesCount,
      grossMargin, netMargin,
      previous: {
        revenue: prevRevenue, cogs: prevCogs, grossProfit: prevGrossProfit,
        expenses: prevExpenses, netProfit: prevNetProfit, salesCount: prevSalesCount,
        grossMargin: prevGrossMargin, netMargin: prevNetMargin,
      },
      changes: {
        revenue: pct(revenue, prevRevenue),
        cogs: pct(cogs, prevCogs),
        grossProfit: pct(grossProfit, prevGrossProfit),
        expenses: pct(expenses, prevExpenses),
        netProfit: pct(netProfit, prevNetProfit),
      },
      commentary,
      periods: {
        current: { from: curStart, to: curEnd },
        previous: { from: prevStart, to: prevEnd },
      },
    });
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
    const [salesAgg, expensesAgg, products, customerBalances, supplierBalances, cashAccounts, salesWithItems] = await Promise.all([
      prisma.sale.aggregate({ where: scopedWhere(s, df(req)), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s, df(req, "date")), _sum: { amount: true } }),
      prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), select: { quantity: true, cost: true } }),
      prisma.customer.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.supplier.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
      prisma.sale.findMany({
        where: scopedWhere(s, df(req)),
        select: { items: { select: { quantity: true, product: { select: { cost: true } } } } },
      }),
    ]);
    const inventoryValue = products.reduce((sum, p) => sum + (p.cost || 0) * p.quantity, 0);
    const cogs = salesWithItems.reduce((sum, sale) =>
      sum + sale.items.reduce((s, item) => s + (item.product?.cost || 0) * item.quantity, 0), 0);
    res.json({
      accounts: [
        { account: "Cash & Bank", debit: cashAccounts._sum.balance || 0, credit: 0 },
        { account: "Accounts Receivable", debit: customerBalances._sum.balance || 0, credit: 0 },
        { account: "Inventory", debit: inventoryValue, credit: 0 },
        { account: "Accounts Payable", debit: 0, credit: supplierBalances._sum.balance || 0 },
        { account: "Sales Revenue", debit: 0, credit: salesAgg._sum.total || 0 },
        { account: "Cost of Goods Sold", debit: cogs, credit: 0 },
        { account: "Operating Expenses", debit: expensesAgg._sum.amount || 0, credit: 0 },
      ],
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/balance-sheet", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [cashAccounts, customerBalances, products, supplierBalances, salesAgg, expensesAgg, salesWithItems] = await Promise.all([
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
      prisma.customer.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), select: { quantity: true, cost: true } }),
      prisma.supplier.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.sale.aggregate({ where: scopedWhere(s), _sum: { total: true } }),
      prisma.expense.aggregate({ where: scopedWhere(s), _sum: { amount: true } }),
      prisma.sale.findMany({
        where: scopedWhere(s),
        select: { items: { select: { quantity: true, product: { select: { cost: true } } } } },
      }),
    ]);
    const inventoryValue = products.reduce((sum, p) => sum + (p.cost || 0) * p.quantity, 0);
    const cogs = salesWithItems.reduce((sum, sale) =>
      sum + sale.items.reduce((s, item) => s + (item.product?.cost || 0) * item.quantity, 0), 0);
    const retainedEarnings = (salesAgg._sum.total || 0) - cogs - (expensesAgg._sum.amount || 0);
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
    const { customerId, branchId } = req.query;
    const customerFilter = customerId ? { customerId } : {};
    const branchFilter = branchId ? { branchId } : {};
    const combinedFilter = { ...customerFilter, ...branchFilter };
    const [sales, purchases, expenses, customerPayments, supplierPayments, creditNotes, debitNotes] = await Promise.all([
      prisma.sale.findMany({ where: scopedWhere(s, { ...df(req), ...combinedFilter }), select: { id: true, receiptNo: true, total: true, createdAt: true, items: { select: { quantity: true, total: true, product: { select: { cost: true } } } } }, orderBy: { createdAt: "desc" } }),
      prisma.purchase.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter }), select: { id: true, refNo: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.expense.findMany({ where: scopedWhere(s, { ...df(req, "date"), ...branchFilter }), select: { id: true, category: true, amount: true, date: true }, orderBy: { date: "desc" } }),
      prisma.customerPayment.findMany({ where: scopedWhere(s, { ...df(req), ...customerFilter, ...branchFilter }), select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.supplierPayment.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter }), select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.creditNote.findMany({ where: scopedWhere(s, { ...df(req), ...customerFilter, ...branchFilter, status: { not: "cancelled" } }), select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.debitNote.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter, status: { not: "cancelled" } }), select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    ]);
    const entries = [
      // Sales: credit Sales Revenue, debit COGS (perpetual inventory)
      ...sales.flatMap((x) => {
        const cogs = x.items.reduce((sum, item) => sum + (item.product?.cost || 0) * item.quantity, 0);
        return [
          { date: x.createdAt, account: "Sales Revenue", description: `Sale ${x.receiptNo}`, debit: 0, credit: x.total },
          { date: x.createdAt, account: "Cost of Goods Sold", description: `Sale ${x.receiptNo}`, debit: cogs, credit: 0 },
        ];
      }),
      // Purchases: debit Inventory (asset, not COGS)
      ...purchases.map((x) => ({ date: x.createdAt, account: "Inventory", description: `Purchase ${x.refNo || ""}`, debit: x.total, credit: 0 })),
      // Expenses: debit expense category
      ...expenses.map((x) => ({ date: x.date, account: x.category, description: "Expense", debit: x.amount, credit: 0 })),
      // Customer payments: debit Cash
      ...customerPayments.map((x) => ({ date: x.createdAt, account: "Cash", description: "Customer Payment", debit: x.amount, credit: 0 })),
      // Supplier payments: credit Accounts Payable
      ...supplierPayments.map((x) => ({ date: x.createdAt, account: "Accounts Payable", description: "Supplier Payment", debit: 0, credit: x.amount })),
      // Credit notes: credit Accounts Receivable (reduces customer balance)
      ...creditNotes.map((x) => ({ date: x.createdAt, account: "Accounts Receivable", description: `Credit Note ${x.noteNo} (${x.reason})`, debit: 0, credit: x.amount })),
      // Debit notes: credit Accounts Payable (reduces supplier balance)
      ...debitNotes.map((x) => ({ date: x.createdAt, account: "Accounts Payable", description: `Debit Note ${x.noteNo} (${x.reason})`, debit: 0, credit: x.amount })),
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

// Customer Ledger — all transactions (sales + payments) with running balance
router.get("/customers/ledger", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { customerId } = req.query;
    if (!customerId) return res.status(400).json({ error: "customerId is required" });

    const customer = await prisma.customer.findFirst({ where: scopedWhere(s, { id: customerId }) });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const [sales, payments, creditNotes] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedWhere(s, { customerId, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, receiptNo: true, total: true, createdAt: true, paymentMethod: true },
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(s, { customerId, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, paymentMethod: true, reference: true, createdAt: true },
      }),
      prisma.creditNote.findMany({
        where: scopedWhere(s, { customerId, ...df(req), status: { not: "cancelled" } }),
        orderBy: { createdAt: "asc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true },
      }),
    ]);

    // Build ledger entries
    const entries = [];
    // Opening balance = sum of all sales before the date range - sum of all payments before the date range - sum of all credit notes before the date range
    const [allSales, allPayments, allCreditNotes] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedWhere(s, { customerId }),
        select: { total: true, createdAt: true },
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(s, { customerId }),
        select: { amount: true, createdAt: true },
      }),
      prisma.creditNote.findMany({
        where: scopedWhere(s, { customerId, status: { not: "cancelled" } }),
        select: { amount: true, createdAt: true },
      }),
    ]);
    const { from } = req.query;
    const fromDate = from ? new Date(from) : null;
    const openingBalance = (fromDate
      ? allSales.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.total, 0) -
        allPayments.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0) -
        allCreditNotes.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0)
      : 0
    );

    for (const sale of sales) {
      entries.push({
        date: sale.createdAt,
        refNo: sale.receiptNo,
        description: "Sale",
        debit: sale.total,
        credit: 0,
        balance: 0,
      });
    }
    for (const payment of payments) {
      entries.push({
        date: payment.createdAt,
        refNo: payment.reference || payment.id.slice(-6),
        description: "Payment",
        debit: 0,
        credit: payment.amount,
        balance: 0,
      });
    }
    for (const cn of creditNotes) {
      entries.push({
        date: cn.createdAt,
        refNo: cn.noteNo,
        description: `Credit Note (${cn.reason})`,
        debit: 0,
        credit: cn.amount,
        balance: 0,
      });
    }

    // Sort by date
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Recalculate running balance in date order
    let bal = openingBalance;
    for (const e of entries) {
      bal += e.debit - e.credit;
      e.balance = bal;
    }

    res.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone || "" },
      openingBalance,
      closingBalance: entries.length ? entries[entries.length - 1].balance : openingBalance,
      data: entries,
      summary: {
        totalDebit: entries.reduce((a, e) => a + e.debit, 0),
        totalCredit: entries.reduce((a, e) => a + e.credit, 0),
        entryCount: entries.length,
      },
    });
  } catch (err) { handleBranchError(res, err); }
});

// Customer Statement — summary of customer activity
router.get("/customers/statement", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { customerId } = req.query;
    if (!customerId) return res.status(400).json({ error: "customerId is required" });

    const customer = await prisma.customer.findFirst({ where: scopedWhere(s, { id: customerId }) });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const [sales, payments, creditNotes] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedWhere(s, { customerId, ...df(req) }),
        include: { items: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(s, { customerId, ...df(req) }),
        orderBy: { createdAt: "desc" },
      }),
      prisma.creditNote.findMany({
        where: scopedWhere(s, { customerId, ...df(req), status: { not: "cancelled" } }),
        orderBy: { createdAt: "desc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true },
      }),
    ]);

    const totalSales = sales.reduce((a, x) => a + x.total, 0);
    const totalPayments = payments.reduce((a, x) => a + x.amount, 0);
    const totalCreditNotes = creditNotes.reduce((a, x) => a + x.amount, 0);
    const currentBalance = customer.balance || 0;

    res.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone || "", email: customer.email || "" },
      summary: {
        totalSales,
        totalPayments,
        totalCreditNotes,
        currentBalance,
        salesCount: sales.length,
        paymentCount: payments.length,
        creditNoteCount: creditNotes.length,
      },
      sales: sales.map((x) => ({
        id: x.id,
        receiptNo: x.receiptNo,
        total: x.total,
        amountPaid: x.amountPaid,
        balance: x.balance,
        paymentStatus: x.paymentStatus,
        createdAt: x.createdAt,
        items: x.items.map((i) => ({ name: i.product?.name || "N/A", quantity: i.quantity, total: i.total })),
      })),
      payments: payments.map((x) => ({
        id: x.id,
        amount: x.amount,
        paymentMethod: x.paymentMethod,
        reference: x.reference,
        createdAt: x.createdAt,
      })),
      creditNotes: creditNotes.map((x) => ({
        id: x.id,
        noteNo: x.noteNo,
        amount: x.amount,
        reason: x.reason,
        createdAt: x.createdAt,
      })),
    });
  } catch (err) { handleBranchError(res, err); }
});

// Credit Notes Report — list all credit notes
router.get("/customers/credit-notes", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { customerId } = req.query;
    const where = scopedWhere(s, { ...df(req), status: { not: "cancelled" }, ...(customerId ? { customerId } : {}) });
    const creditNotes = await prisma.creditNote.findMany({
      where,
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    const data = creditNotes.map((cn) => ({
      noteNo: cn.noteNo,
      customer: cn.customer?.name || "N/A",
      amount: cn.amount,
      reason: cn.reason,
      status: cn.status,
      date: cn.createdAt,
    }));
    res.json({
      data,
      summary: {
        count: data.length,
        totalAmount: data.reduce((a, x) => a + x.amount, 0),
      },
    });
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

    const [supplier, purchases, payments, debitNotes] = await Promise.all([
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
      }),
      prisma.debitNote.findMany({
        where: scopedWhere(s, { supplierId, status: { not: "cancelled" } }),
        orderBy: { createdAt: "desc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true },
      })
    ]);

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const stmtData = buildSupplierStatementData(supplier, purchases, payments);
    const totalDebitNotes = debitNotes.reduce((a, x) => a + x.amount, 0);
    res.json({
      ...stmtData,
      supplier: { ...stmtData.supplier, phone: supplier.phone || "", email: supplier.email || "" },
      summary: {
        ...stmtData.summary,
        totalDebitNotes,
        debitNoteCount: debitNotes.length,
      },
      debitNotes: debitNotes.map((x) => ({
        id: x.id,
        noteNo: x.noteNo,
        amount: x.amount,
        reason: x.reason,
        createdAt: x.createdAt,
      })),
    });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Supplier Ledger — all transactions (purchases + payments) with running balance
router.get("/suppliers/ledger", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { supplierId } = req.query;
    if (!supplierId) return res.status(400).json({ error: "supplierId is required" });

    const supplier = await prisma.supplier.findFirst({ where: scopedWhere(s, { id: supplierId }) });
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const [purchases, payments, debitNotes] = await Promise.all([
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s, { supplierId, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, refNo: true, total: true, createdAt: true },
      }),
      prisma.supplierPayment.findMany({
        where: scopedWhere(s, { supplierId, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, paymentMethod: true, reference: true, createdAt: true },
      }),
      prisma.debitNote.findMany({
        where: scopedWhere(s, { supplierId, ...df(req), status: { not: "cancelled" } }),
        orderBy: { createdAt: "asc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true },
      }),
    ]);

    // Opening balance
    const [allPurchases, allPayments, allDebitNotes] = await Promise.all([
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s, { supplierId }),
        select: { total: true, createdAt: true },
      }),
      prisma.supplierPayment.findMany({
        where: scopedWhere(s, { supplierId }),
        select: { amount: true, createdAt: true },
      }),
      prisma.debitNote.findMany({
        where: scopedWhere(s, { supplierId, status: { not: "cancelled" } }),
        select: { amount: true, createdAt: true },
      }),
    ]);
    const { from } = req.query;
    const fromDate = from ? new Date(from) : null;
    const openingBalance = fromDate
      ? allPurchases.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.total, 0) -
        allPayments.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0) -
        allDebitNotes.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0)
      : 0;

    const entries = [];
    for (const p of purchases) {
      entries.push({
        date: p.createdAt,
        refNo: p.refNo || p.id.slice(-6),
        description: "Purchase",
        debit: p.total,
        credit: 0,
        balance: 0,
      });
    }
    for (const p of payments) {
      entries.push({
        date: p.createdAt,
        refNo: p.reference || p.id.slice(-6),
        description: "Payment",
        debit: 0,
        credit: p.amount,
        balance: 0,
      });
    }
    for (const dn of debitNotes) {
      entries.push({
        date: dn.createdAt,
        refNo: dn.noteNo,
        description: `Debit Note (${dn.reason})`,
        debit: 0,
        credit: dn.amount,
        balance: 0,
      });
    }

    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let bal = openingBalance;
    for (const e of entries) {
      bal += e.debit - e.credit;
      e.balance = bal;
    }

    res.json({
      supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone || "" },
      openingBalance,
      closingBalance: entries.length ? entries[entries.length - 1].balance : openingBalance,
      data: entries,
      summary: {
        totalDebit: entries.reduce((a, e) => a + e.debit, 0),
        totalCredit: entries.reduce((a, e) => a + e.credit, 0),
        entryCount: entries.length,
      },
    });
  } catch (err) { handleBranchError(res, err); }
});

// Debit Notes Report — list all debit notes
router.get("/suppliers/debit-notes", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { supplierId } = req.query;
    const where = scopedWhere(s, { ...df(req), status: { not: "cancelled" }, ...(supplierId ? { supplierId } : {}) });
    const debitNotes = await prisma.debitNote.findMany({
      where,
      include: { supplier: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    const data = debitNotes.map((dn) => ({
      noteNo: dn.noteNo,
      supplier: dn.supplier?.name || "N/A",
      amount: dn.amount,
      reason: dn.reason,
      status: dn.status,
      date: dn.createdAt,
    }));
    res.json({
      data,
      summary: {
        count: data.length,
        totalAmount: data.reduce((a, x) => a + x.amount, 0),
      },
    });
  } catch (err) { handleBranchError(res, err); }
});

// Product Ledger — stock movement history for a specific product
router.get("/inventory/product-ledger", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { productId } = req.query;
    if (!productId) return res.status(400).json({ error: "productId is required" });

    const product = await prisma.product.findFirst({ where: scopedWhere(s, { id: productId }) });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const [sales, purchases, adjustments] = await Promise.all([
      prisma.sale.findMany({
        where: scopedWhere(s, df(req)),
        include: { items: { where: { productId }, select: { quantity: true, total: true } } },
        select: { id: true, receiptNo: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.purchase.findMany({
        where: scopedWhere(s, df(req)),
        include: { items: { where: { productId }, select: { quantity: true, total: true } } },
        select: { id: true, refNo: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { tenantId: s.tenantId, model: "Product", entityId: productId, ...df(req, "createdAt") },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const entries = [];

    // Opening stock = sum of all purchases before date range - sum of all sales before date range
    const allSales = await prisma.sale.findMany({
      where: scopedWhere(s),
      include: { items: { where: { productId }, select: { quantity: true } } },
      select: { createdAt: true },
    });
    const allPurchases = await prisma.purchase.findMany({
      where: scopedWhere(s),
      include: { items: { where: { productId }, select: { quantity: true } } },
      select: { createdAt: true },
    });
    const { from } = req.query;
    const fromDate = from ? new Date(from) : null;
    const openingStock = fromDate
      ? allPurchases.reduce((a, p) => a + (new Date(p.createdAt) < fromDate ? p.items.reduce((s, i) => s + i.quantity, 0) : 0), 0) -
        allSales.reduce((a, p) => a + (new Date(p.createdAt) < fromDate ? p.items.reduce((s, i) => s + i.quantity, 0) : 0), 0)
      : 0;

    for (const sale of sales) {
      for (const item of sale.items) {
        entries.push({
          date: sale.createdAt,
          refNo: sale.receiptNo,
          description: "Sale (out)",
          inQty: 0,
          outQty: item.quantity,
          balance: 0,
        });
      }
    }
    for (const purchase of purchases) {
      for (const item of purchase.items) {
        entries.push({
          date: purchase.createdAt,
          refNo: purchase.refNo || purchase.id.slice(-6),
          description: "Purchase (in)",
          inQty: item.quantity,
          outQty: 0,
          balance: 0,
        });
      }
    }
    for (const adj of adjustments) {
      entries.push({
        date: adj.createdAt,
        refNo: adj.id.slice(-6),
        description: `Adjustment: ${adj.action}`,
        inQty: 0,
        outQty: 0,
        balance: 0,
      });
    }

    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let bal = openingStock;
    for (const e of entries) {
      bal += e.inQty - e.outQty;
      e.balance = bal;
    }

    res.json({
      product: { id: product.id, name: product.name, sku: product.sku || "", currentStock: product.quantity || 0 },
      openingStock,
      closingStock: entries.length ? entries[entries.length - 1].balance : openingStock,
      data: entries,
      summary: {
        totalIn: entries.reduce((a, e) => a + e.inQty, 0),
        totalOut: entries.reduce((a, e) => a + e.outQty, 0),
        entryCount: entries.length,
      },
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/decision-support", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [sales, purchases, products, expenses, suppliers, salesWithItems] = await Promise.all([
      prisma.sale.findMany({ where: scopedWhere(s, df(req)), select: { total: true } }),
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, df(req)), select: { total: true } }),
      prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), select: { quantity: true, minStock: true, expiryDate: true } }),
      prisma.expense.findMany({ where: scopedWhere(s, df(req, "date")), select: { amount: true } }),
      prisma.supplier.findMany({ where: scopedWhere(s), select: { balance: true } }),
      prisma.sale.findMany({
        where: scopedWhere(s, df(req)),
        select: { items: { select: { quantity: true, product: { select: { cost: true } } } } },
      }),
    ]);

    const cogs = salesWithItems.reduce((sum, sale) =>
      sum + sale.items.reduce((s, item) => s + (item.product?.cost || 0) * item.quantity, 0), 0);

    const summary = buildDecisionSupportSummary({
      sales,
      purchases,
      products,
      expenses,
      suppliers,
      cogs,
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

// ==================== SERVICE BUSINESS REPORTS ====================
router.get("/service-business/appointments", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "scheduledDate"));
    const [total, scheduled, confirmed, inProgress, completed, cancelled, noShow] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.count({ where: { ...where, status: "scheduled" } }),
      prisma.appointment.count({ where: { ...where, status: "confirmed" } }),
      prisma.appointment.count({ where: { ...where, status: "in_progress" } }),
      prisma.appointment.count({ where: { ...where, status: "completed" } }),
      prisma.appointment.count({ where: { ...where, status: "cancelled" } }),
      prisma.appointment.count({ where: { ...where, status: "no_show" } }),
    ]);
    const revenueAgg = await prisma.appointment.aggregate({ where: { ...where, status: "completed" }, _sum: { actualPrice: true, price: true } });
    res.json({ total, scheduled, confirmed, inProgress, completed, cancelled, noShow, completedRevenue: revenueAgg._sum.actualPrice || revenueAgg._sum.price || 0 });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/service-business/technicians", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s);
    const techs = await prisma.serviceTechnician.findMany({ where, include: { _count: { select: { jobCards: true } } } });
    const data = techs.map(t => ({ id: t.id, name: t.name, role: t.role, rating: t.rating, totalJobs: t.totalJobs, completedJobs: t.completedJobs, jobCards: t._count.jobCards, availability: t.availability, hourlyRate: t.hourlyRate }));
    res.json({ data });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/service-business/contracts", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "startDate"));
    const [total, active, expired, terminated, pendingRenewal] = await Promise.all([
      prisma.serviceContract.count({ where }),
      prisma.serviceContract.count({ where: { ...where, status: "active" } }),
      prisma.serviceContract.count({ where: { ...where, status: "expired" } }),
      prisma.serviceContract.count({ where: { ...where, status: "terminated" } }),
      prisma.serviceContract.count({ where: { ...where, status: "pending_renewal" } }),
    ]);
    const valueAgg = await prisma.serviceContract.aggregate({ where: { ...where, status: "active" }, _sum: { value: true } });
    res.json({ total, active, expired, terminated, pendingRenewal, activeValue: valueAgg._sum.value || 0 });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/service-business/feedback", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "createdAt"));
    const [total, avgAgg] = await Promise.all([
      prisma.serviceFeedback.count({ where }),
      prisma.serviceFeedback.aggregate({ where, _avg: { rating: true, serviceQuality: true, timeliness: true, professionalism: true, valueForMoney: true } }),
    ]);
    const ratingDist = await Promise.all([1, 2, 3, 4, 5].map(r => prisma.serviceFeedback.count({ where: { ...where, rating: r } })));
    const recommendCount = await prisma.serviceFeedback.count({ where: { ...where, wouldRecommend: true } });
    res.json({
      total,
      avgRating: avgAgg._avg.rating || 0,
      avgServiceQuality: avgAgg._avg.serviceQuality || 0,
      avgTimeliness: avgAgg._avg.timeliness || 0,
      avgProfessionalism: avgAgg._avg.professionalism || 0,
      avgValueForMoney: avgAgg._avg.valueForMoney || 0,
      ratingDist: { 1: ratingDist[0], 2: ratingDist[1], 3: ratingDist[2], 4: ratingDist[3], 5: ratingDist[4] },
      recommendRate: total > 0 ? (recommendCount / total) * 100 : 0,
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/service-business/job-cards", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "createdAt"));
    const [total, pending, inProgress, onHold, completed, cancelled] = await Promise.all([
      prisma.serviceJobCard.count({ where }),
      prisma.serviceJobCard.count({ where: { ...where, status: "pending" } }),
      prisma.serviceJobCard.count({ where: { ...where, status: "in_progress" } }),
      prisma.serviceJobCard.count({ where: { ...where, status: "on_hold" } }),
      prisma.serviceJobCard.count({ where: { ...where, status: "completed" } }),
      prisma.serviceJobCard.count({ where: { ...where, status: "cancelled" } }),
    ]);
    const costAgg = await prisma.serviceJobCard.aggregate({ where: { ...where, status: "completed" }, _sum: { laborCost: true, partsCost: true, totalCost: true } });
    res.json({ total, pending, inProgress, onHold, completed, cancelled, laborCost: costAgg._sum.laborCost || 0, partsCost: costAgg._sum.partsCost || 0, totalCost: costAgg._sum.totalCost || 0 });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/service-business/work-orders", authenticateToken, async (req,res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req, "createdAt"));
    const [total, open, inProgress, onHold, completed, cancelled] = await Promise.all([
      prisma.workOrder.count({ where }),
      prisma.workOrder.count({ where: { ...where, status: "open" } }),
      prisma.workOrder.count({ where: { ...where, status: "in_progress" } }),
      prisma.workOrder.count({ where: { ...where, status: "on_hold" } }),
      prisma.workOrder.count({ where: { ...where, status: "completed" } }),
      prisma.workOrder.count({ where: { ...where, status: "cancelled" } }),
    ]);
    const costAgg = await prisma.workOrder.aggregate({ where: { ...where, status: "completed" }, _sum: { estimatedCost: true, actualCost: true, laborCost: true, partsCost: true } });
    res.json({ total, open, inProgress, onHold, completed, cancelled, estimatedCost: costAgg._sum.estimatedCost || 0, actualCost: costAgg._sum.actualCost || 0, laborCost: costAgg._sum.laborCost || 0, partsCost: costAgg._sum.partsCost || 0 });
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

// ==================== BUSINESS ANALYSIS & INSIGHTS ====================
router.get("/analysis/executive-summary", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { from, to } = req.query;

    // Determine current and previous period
    let curStart, curEnd, prevStart, prevEnd;
    if (from && to) {
      curStart = new Date(from);
      curEnd = new Date(to + "T23:59:59");
      const duration = curEnd - curStart;
      prevEnd = new Date(curStart.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - duration);
    } else {
      const now = new Date();
      curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = curStart;
    }

    const curWhere = scopedWhere(s, { createdAt: { gte: curStart, lt: curEnd } });
    const prevWhere = scopedWhere(s, { createdAt: { gte: prevStart, lt: prevEnd } });
    const curExpWhere = scopedWhere(s, { date: { gte: curStart, lt: curEnd } });
    const prevExpWhere = scopedWhere(s, { date: { gte: prevStart, lt: prevEnd } });

    const [
      curSalesAgg, prevSalesAgg, curExpAgg, prevExpAgg,
      curSalesItems, prevSalesItems, curSalesFull, prevSalesFull,
      curPurchasesAgg, prevPurchasesAgg,
      products, lowStockProducts, expiringProducts,
      customers, curReceivables, curCashAccounts,
    ] = await Promise.all([
      prisma.sale.aggregate({ where: curWhere, _sum: { total: true, discount: true, tax: true }, _count: true }),
      prisma.sale.aggregate({ where: prevWhere, _sum: { total: true, discount: true, tax: true }, _count: true }),
      prisma.expense.aggregate({ where: curExpWhere, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: prevExpWhere, _sum: { amount: true } }),
      prisma.sale.findMany({ where: curWhere, select: { items: { select: { quantity: true, productId: true, total: true, product: { select: { cost: true, name: true, category: { select: { name: true } } } } } } } }),
      prisma.sale.findMany({ where: prevWhere, select: { items: { select: { quantity: true, productId: true, total: true, product: { select: { cost: true, name: true, category: { select: { name: true } } } } } } } }),
      prisma.sale.findMany({ where: curWhere, include: { items: { include: { product: { select: { name: true, category: { select: { name: true } } } } }, branch: { select: { name: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" }, take: 50 } }),
      prisma.sale.findMany({ where: prevWhere, include: { items: { include: { product: { select: { name: true } } }, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 } }),
      prisma.purchase.aggregate({ where: curWhere, _sum: { total: true } }),
      prisma.purchase.aggregate({ where: prevWhere, _sum: { total: true } }),
      prisma.product.count({ where: scopedWhere(s, { isActive: { not: false } }) }),
      prisma.product.count({ where: scopedWhere(s, { isActive: { not: false }, quantity: { lte: 10 } }) }),
      prisma.product.count({ where: scopedWhere(s, { isActive: { not: false }, expiryDate: { not: null, lte: new Date(Date.now() + 60 * 86400000) } }) }),
      prisma.customer.count({ where: scopedWhere(s) }),
      prisma.customer.aggregate({ where: scopedWhere(s, { balance: { gt: 0 } }), _sum: { balance: true }, _count: true }),
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
    ]);

    // Calculate COGS
    const curCogs = curSalesItems.reduce((sum, sale) =>
      sum + sale.items.reduce((si, item) => si + (item.product?.cost || 0) * item.quantity, 0), 0);
    const prevCogs = prevSalesItems.reduce((sum, sale) =>
      sum + sale.items.reduce((si, item) => si + (item.product?.cost || 0) * item.quantity, 0), 0);

    // Core metrics
    const curRevenue = curSalesAgg._sum.total || 0;
    const prevRevenue = prevSalesAgg._sum.total || 0;
    const curExpenses = curExpAgg._sum.amount || 0;
    const prevExpenses = prevExpAgg._sum.amount || 0;
    const curGrossProfit = curRevenue - curCogs;
    const prevGrossProfit = prevRevenue - prevCogs;
    const curNetProfit = curGrossProfit - curExpenses;
    const prevNetProfit = prevGrossProfit - prevExpenses;
    const curSalesCount = curSalesAgg._count || 0;
    const prevSalesCount = prevSalesAgg._count || 0;
    const curAvgSale = curSalesCount > 0 ? curRevenue / curSalesCount : 0;
    const prevAvgSale = prevSalesCount > 0 ? prevRevenue / prevSalesCount : 0;

    // Helper: percentage change
    const pct = (cur, prev) => prev !== 0 ? ((cur - prev) / Math.abs(prev) * 100) : (cur > 0 ? 100 : 0);
    const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

    // Build comparison cards
    const comparisons = [
      { metric: 'Revenue', current: curRevenue, previous: prevRevenue, change: pct(curRevenue, prevRevenue), format: 'currency' },
      { metric: 'COGS', current: curCogs, previous: prevCogs, change: pct(curCogs, prevCogs), format: 'currency' },
      { metric: 'Gross Profit', current: curGrossProfit, previous: prevGrossProfit, change: pct(curGrossProfit, prevGrossProfit), format: 'currency' },
      { metric: 'Operating Expenses', current: curExpenses, previous: prevExpenses, change: pct(curExpenses, prevExpenses), format: 'currency' },
      { metric: 'Net Profit', current: curNetProfit, previous: prevNetProfit, change: pct(curNetProfit, prevNetProfit), format: 'currency' },
      { metric: 'Sales Count', current: curSalesCount, previous: prevSalesCount, change: pct(curSalesCount, prevSalesCount), format: 'number' },
      { metric: 'Avg Sale Value', current: curAvgSale, previous: prevAvgSale, change: pct(curAvgSale, prevAvgSale), format: 'currency' },
      { metric: 'Purchases', current: curPurchasesAgg._sum.total || 0, previous: prevPurchasesAgg._sum.total || 0, change: pct(curPurchasesAgg._sum.total || 0, prevPurchasesAgg._sum.total || 0), format: 'currency' },
    ];

    // Product-level driver analysis (what drove the revenue change)
    const curProductMap = {};
    curSalesItems.forEach(sale => {
      sale.items.forEach(item => {
        const name = item.product?.name || 'Unknown';
        const cat = item.product?.category?.name || 'Uncategorized';
        if (!curProductMap[item.productId]) curProductMap[item.productId] = { name, category: cat, revenue: 0, qty: 0, cogs: 0 };
        curProductMap[item.productId].revenue += item.total || 0;
        curProductMap[item.productId].qty += item.quantity || 0;
        curProductMap[item.productId].cogs += (item.product?.cost || 0) * item.quantity;
      });
    });
    const prevProductMap = {};
    prevSalesItems.forEach(sale => {
      sale.items.forEach(item => {
        const name = item.product?.name || 'Unknown';
        const cat = item.product?.category?.name || 'Uncategorized';
        if (!prevProductMap[item.productId]) prevProductMap[item.productId] = { name, category: cat, revenue: 0, qty: 0, cogs: 0 };
        prevProductMap[item.productId].revenue += item.total || 0;
        prevProductMap[item.productId].qty += item.quantity || 0;
        prevProductMap[item.productId].cogs += (item.product?.cost || 0) * item.quantity;
      });
    });

    const allProductIds = new Set([...Object.keys(curProductMap), ...Object.keys(prevProductMap)]);
    const productDrivers = [];
    allProductIds.forEach(id => {
      const cur = curProductMap[id] || { name: 'Unknown', category: '—', revenue: 0, qty: 0, cogs: 0 };
      const prev = prevProductMap[id] || { name: cur.name, category: cur.category, revenue: 0, qty: 0, cogs: 0 };
      const revChange = cur.revenue - prev.revenue;
      productDrivers.push({
        name: cur.name,
        category: cur.category,
        currentRevenue: cur.revenue,
        previousRevenue: prev.revenue,
        revenueChange: revChange,
        currentQty: cur.qty,
        previousQty: prev.qty,
        qtyChange: cur.qty - prev.qty,
        currentProfit: cur.revenue - cur.cogs,
        previousProfit: prev.revenue - prev.cogs,
      });
    });

    // Top growers and decliners
    const topGrowers = productDrivers
      .filter(d => d.revenueChange > 0)
      .sort((a, b) => b.revenueChange - a.revenueChange)
      .slice(0, 5);
    const topDecliners = productDrivers
      .filter(d => d.revenueChange < 0)
      .sort((a, b) => a.revenueChange - b.revenueChange)
      .slice(0, 5);

    // Category analysis
    const curCatMap = {};
    const prevCatMap = {};
    productDrivers.forEach(d => {
      if (!curCatMap[d.category]) curCatMap[d.category] = { revenue: 0, profit: 0, qty: 0 };
      if (!prevCatMap[d.category]) prevCatMap[d.category] = { revenue: 0, profit: 0, qty: 0 };
      curCatMap[d.category].revenue += d.currentRevenue;
      curCatMap[d.category].profit += d.currentProfit;
      curCatMap[d.category].qty += d.currentQty;
      prevCatMap[d.category].revenue += d.previousRevenue;
      prevCatMap[d.category].profit += d.previousProfit;
      prevCatMap[d.category].qty += d.previousQty;
    });
    const categoryAnalysis = Object.keys(curCatMap).map(cat => ({
      category: cat,
      currentRevenue: curCatMap[cat].revenue,
      previousRevenue: prevCatMap[cat]?.revenue || 0,
      change: pct(curCatMap[cat].revenue, prevCatMap[cat]?.revenue || 0),
      currentProfit: curCatMap[cat].profit,
      currentQty: curCatMap[cat].qty,
    })).sort((a, b) => b.currentRevenue - a.currentRevenue);

    // Branch analysis
    const curBranchMap = {};
    const prevBranchMap = {};
    curSalesFull.forEach(sale => {
      const name = sale.branch?.name || 'Main';
      if (!curBranchMap[name]) curBranchMap[name] = { revenue: 0, count: 0 };
      curBranchMap[name].revenue += sale.total;
      curBranchMap[name].count += 1;
    });
    prevSalesFull.forEach(sale => {
      const name = sale.branch?.name || 'Main';
      if (!prevBranchMap[name]) prevBranchMap[name] = { revenue: 0, count: 0 };
      prevBranchMap[name].revenue += sale.total;
      prevBranchMap[name].count += 1;
    });
    const branchAnalysis = Object.keys(curBranchMap).map(name => ({
      branch: name,
      currentRevenue: curBranchMap[name].revenue,
      previousRevenue: prevBranchMap[name]?.revenue || 0,
      change: pct(curBranchMap[name].revenue, prevBranchMap[name]?.revenue || 0),
      salesCount: curBranchMap[name].count,
    })).sort((a, b) => b.currentRevenue - a.currentRevenue);

    // Payment method analysis
    const curPayMap = {};
    curSalesFull.forEach(sale => {
      const m = sale.paymentMethod || 'cash';
      if (!curPayMap[m]) curPayMap[m] = { total: 0, count: 0 };
      curPayMap[m].total += sale.total;
      curPayMap[m].count += 1;
    });
    const paymentMethodAnalysis = Object.keys(curPayMap).map(m => ({
      method: m,
      total: curPayMap[m].total,
      count: curPayMap[m].count,
      share: curRevenue > 0 ? (curPayMap[m].total / curRevenue * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    // Generate auto-insights (the "why" and "how")
    const insights = [];
    const revChangePct = pct(curRevenue, prevRevenue);
    const profitChangePct = pct(curNetProfit, prevNetProfit);
    const expChangePct = pct(curExpenses, prevExpenses);
    const marginChange = (curRevenue > 0 ? curNetProfit / curRevenue * 100 : 0) - (prevRevenue > 0 ? prevNetProfit / prevRevenue * 100 : 0);

    // Revenue insight
    if (prevRevenue > 0) {
      if (revChangePct > 10) {
        insights.push({ type: 'positive', icon: 'trend-up', title: 'Revenue Growth', text: `Revenue grew ${fmtPct(revChangePct)} compared to the previous period. ${topGrowers.length > 0 ? `Top contributor: ${topGrowers[0].name} (+${fmtCurrency(topGrowers[0].revenueChange)}).` : ''}` });
      } else if (revChangePct < -10) {
        insights.push({ type: 'negative', icon: 'trend-down', title: 'Revenue Decline', text: `Revenue dropped ${fmtPct(revChangePct)} compared to the previous period. ${topDecliners.length > 0 ? `Biggest decline: ${topDecliners[0].name} (${fmtCurrency(topDecliners[0].revenueChange)}).` : 'Investigate market conditions or stock availability.'}` });
      } else {
        insights.push({ type: 'neutral', icon: 'info', title: 'Revenue Stable', text: `Revenue changed by ${fmtPct(revChangePct)} — relatively stable period-over-period.` });
      }
    }

    // Profitability insight
    if (prevNetProfit !== 0) {
      if (profitChangePct > 15) {
        insights.push({ type: 'positive', icon: 'trend-up', title: 'Profitability Improvement', text: `Net profit increased ${fmtPct(profitChangePct)}. ${expChangePct < 0 ? `Expenses were reduced by ${fmtPct(Math.abs(expChangePct))}, contributing to better margins.` : curCogs < prevCogs ? `Lower COGS (by ${fmtCurrency(prevCogs - curCogs)}) improved gross margins.` : 'Revenue growth outpaced cost increases.'}` });
      } else if (profitChangePct < -15) {
        const reasons = [];
        if (expChangePct > 10) reasons.push(`expenses rose ${fmtPct(expChangePct)}`);
        if (curCogs > prevCogs && pct(curCogs, prevCogs) > revChangePct) reasons.push(`COGS grew faster than revenue`);
        insights.push({ type: 'negative', icon: 'trend-down', title: 'Profitability Concern', text: `Net profit declined ${fmtPct(profitChangePct)}. ${reasons.length ? `Key factor(s): ${reasons.join(', ')}.` : 'Review pricing strategy and cost control.'}` });
      }
    }

    // Margin insight
    if (Math.abs(marginChange) > 2) {
      insights.push({
        type: marginChange > 0 ? 'positive' : 'negative',
        icon: marginChange > 0 ? 'trend-up' : 'trend-down',
        title: 'Profit Margin Shift',
        text: `Net profit margin ${marginChange > 0 ? 'improved' : 'contracted'} by ${Math.abs(marginChange).toFixed(1)}pp (from ${(prevRevenue > 0 ? prevNetProfit / prevRevenue * 100 : 0).toFixed(1)}% to ${(curRevenue > 0 ? curNetProfit / curRevenue * 100 : 0).toFixed(1)}%).`,
      });
    }

    // Expense insight
    if (expChangePct > 20) {
      insights.push({ type: 'warning', icon: 'alert', title: 'Expense Surge', text: `Operating expenses jumped ${fmtPct(expChangePct)} (${fmtCurrency(prevExpenses)} → ${fmtCurrency(curExpenses)}). Review expense categories for cost-saving opportunities.` });
    } else if (expChangePct < -15) {
      insights.push({ type: 'positive', icon: 'trend-down', title: 'Expense Reduction', text: `Operating expenses decreased by ${fmtPct(Math.abs(expChangePct))}. Good cost discipline maintained.` });
    }

    // Inventory alerts
    if (lowStockProducts > 0) {
      insights.push({ type: 'warning', icon: 'alert', title: 'Low Stock Alert', text: `${lowStockProducts} product(s) are at or below minimum stock level. Reorder soon to avoid stockouts.` });
    }
    if (expiringProducts > 0) {
      insights.push({ type: 'warning', icon: 'clock', title: 'Expiry Warning', text: `${expiringProducts} product(s) expire within 60 days. Consider promotions to clear stock before expiry.` });
    }

    // Avg sale insight
    if (prevAvgSale > 0 && Math.abs(pct(curAvgSale, prevAvgSale)) > 10) {
      const dir = curAvgSale > prevAvgSale ? 'increased' : 'decreased';
      insights.push({
        type: curAvgSale > prevAvgSale ? 'positive' : 'negative',
        icon: curAvgSale > prevAvgSale ? 'trend-up' : 'trend-down',
        title: 'Average Transaction Value',
        text: `Average sale ${dir} from ${fmtCurrency(prevAvgSale)} to ${fmtCurrency(curAvgSale)} (${fmtPct(pct(curAvgSale, prevAvgSale))}). ${curAvgSale > prevAvgSale ? 'Customers are spending more per visit.' : 'Consider upselling strategies or bundle offers.'}`,
      });
    }

    // Discount insight
    const curDiscount = curSalesAgg._sum.discount || 0;
    const prevDiscount = prevSalesAgg._sum.discount || 0;
    const curDiscRate = curRevenue > 0 ? (curDiscount / curRevenue * 100) : 0;
    const prevDiscRate = prevRevenue > 0 ? (prevDiscount / prevRevenue * 100) : 0;
    if (Math.abs(curDiscRate - prevDiscRate) > 2) {
      insights.push({
        type: curDiscRate > prevDiscRate ? 'warning' : 'positive',
        icon: curDiscRate > prevDiscRate ? 'alert' : 'trend-up',
        title: 'Discount Rate Change',
        text: `Discount rate ${curDiscRate > prevDiscRate ? 'increased' : 'decreased'} from ${prevDiscRate.toFixed(1)}% to ${curDiscRate.toFixed(1)}% of revenue. ${curDiscRate > prevDiscRate ? 'Higher discounts may be eroding margins.' : 'Better pricing discipline is protecting margins.'}`,
      });
    }

    // Category driver insight
    if (categoryAnalysis.length > 0) {
      const topCat = categoryAnalysis[0];
      if (topCat.change > 20) {
        insights.push({ type: 'positive', icon: 'trend-up', title: 'Category Performance', text: `${topCat.category} is your top revenue category (${fmtCurrency(topCat.currentRevenue)}) and grew ${fmtPct(topCat.change)} period-over-period.` });
      } else if (topCat.change < -15) {
        insights.push({ type: 'warning', icon: 'trend-down', title: 'Category Concern', text: `Your top category ${topCat.category} declined ${fmtPct(topCat.change)}. Investigate demand, pricing, or competition in this segment.` });
      }
    }

    // Operational snapshot
    const snapshot = {
      productCount: products,
      lowStockCount: lowStockProducts,
      expiringCount: expiringProducts,
      customerCount: customers,
      receivablesOutstanding: curReceivables._sum.balance || 0,
      receivablesCount: curReceivables._count,
      cashOnHand: curCashAccounts._sum.balance || 0,
      curDiscount,
      curTax: curSalesAgg._sum.tax || 0,
      grossMargin: curRevenue > 0 ? (curGrossProfit / curRevenue * 100) : 0,
      netMargin: curRevenue > 0 ? (curNetProfit / curRevenue * 100) : 0,
    };

    res.json({
      comparisons,
      insights,
      topGrowers,
      topDecliners,
      categoryAnalysis,
      branchAnalysis,
      paymentMethodAnalysis,
      snapshot,
      periods: {
        current: { from: curStart, to: curEnd },
        previous: { from: prevStart, to: prevEnd },
      },
    });
  } catch (err) {
    console.error("Executive summary error:", err);
    handleBranchError(res, err);
  }
});

// Helper for currency formatting in insights
function fmtCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(value || 0);
}

export default router;
