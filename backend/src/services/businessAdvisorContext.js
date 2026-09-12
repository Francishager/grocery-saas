import { createReceivableSalesView } from '../utils/receivableSalesView.js';
import { resolveBranchScope, scopedWhere, salesUserWhere, canViewTeamSales } from '../utils/branchAccess.js';

const MAX_SALES = 2000;
const MAX_PRODUCTS = 500;
const money = value => Math.round(Number(value || 0) * 100) / 100;
const label = value => String(value || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 120);
const permitted = (user, ...keys) => keys.some(key => user.permissions?.includes(key)) || user.permissions?.includes('*');

export function summarizeAdvisorSales(rows, currentStart, canSeeProfit) {
  const current = { salesCount: 0, netSales: 0, discounts: 0, averageSale: 0 };
  const previous = { salesCount: 0, netSales: 0, discounts: 0, averageSale: 0 };
  const top = new Map();
  let savedCosts = 0, missingCosts = false;
  for (const sale of rows) {
    const isCurrent = new Date(sale.createdAt) >= currentStart;
    const bucket = isCurrent ? current : previous;
    const net = money(Number(sale.total || 0) - Number(sale.tax || 0));
    bucket.salesCount += 1;
    bucket.netSales += net;
    bucket.discounts += Number(sale.discount || 0) + Number(sale.cashDiscount || 0);
    if (!isCurrent) continue;
    const weightTotal = (sale.items || []).reduce((sum, item) => sum + Math.max(0, Number(item.total || 0)), 0);
    for (const item of sale.items || []) {
      const key = item.productId;
      const entry = top.get(key) || { product: label(item.product?.name) || 'Unnamed product', baseUnit: label(item.product?.baseUnit) || 'unit', quantity: 0, netSales: 0 };
      entry.quantity += Number(item.quantity || 0) * (Number(item.conversionFactor) > 0 ? Number(item.conversionFactor) : 1);
      entry.netSales += weightTotal ? net * Math.max(0, Number(item.total || 0)) / weightTotal : 0;
      top.set(key, entry);
      if (canSeeProfit) {
        if (item.cost == null || !Number.isFinite(Number(item.cost))) missingCosts = true;
        else savedCosts += Number(item.cost) * Number(item.quantity || 0);
      }
    }
  }
  for (const bucket of [current, previous]) {
    bucket.netSales = money(bucket.netSales);
    bucket.discounts = money(bucket.discounts);
    bucket.averageSale = bucket.salesCount ? money(bucket.netSales / bucket.salesCount) : 0;
  }
  return {
    current, previous,
    salesChangePercent: previous.netSales > 0 ? money((current.netSales - previous.netSales) / previous.netSales * 100) : null,
    topProducts: [...top.values()].sort((a, b) => b.netSales - a.netSales).slice(0, 8).map(item => ({ ...item, quantity: money(item.quantity), netSales: money(item.netSales) })),
    ...(canSeeProfit ? { grossProfit: missingCosts ? null : money(current.netSales - savedCosts), costDataComplete: !missingCosts } : {}),
  };
}

export async function buildBusinessAdvisorContext(db, req, days = 30, now = new Date()) {
  // Tenant and branch identifiers always come from authenticated, server-checked access.
  const scope = await resolveBranchScope(db, { ...req, query: {} }, { allowOwnerAll: true });
  const business = await db.tenant.findUnique({ where: { id: scope.tenantId }, select: { name: true, businessType: true, currency: true, timezone: true } });
  if (!business) throw Object.assign(new Error('Business account not found.'), { statusCode: 404 });
  const currentStart = new Date(now.getTime() - days * 86400000);
  const previousStart = new Date(now.getTime() - days * 2 * 86400000);
  const context = {
    business: { name: label(business.name), type: label(business.businessType) || 'Not specified', currency: business.currency || 'UGX', timezone: business.timezone || 'Africa/Kampala' },
    asOf: now.toISOString(),
    period: { days, from: currentStart.toISOString(), to: now.toISOString(), comparisonFrom: previousStart.toISOString() },
    scope: { branch: label(scope.branch?.name) || 'All permitted branches', sales: canViewTeamSales(req.user) ? 'Permitted team sales' : 'Only your own sales' },
    sources: [], limitations: [],
  };
  const canSeeProfit = permitted(req.user, 'canViewFinancialReport');
  const canSeePos = permitted(req.user, 'canViewSale', 'canViewSalesReport');
  const canSeeCredit = permitted(req.user, 'canViewReceivable', 'canViewReceivablesReport');
  const canSeeInventory = permitted(req.user, 'canViewProduct', 'canViewInventoryReport');
  const where = scopedWhere(scope, { ...salesUserWhere(req), createdAt: { gte: previousStart, lte: now }, status: { notIn: ['cancelled', 'refunded', 'pending'] } });
  const select = { total: true, tax: true, discount: true, cashDiscount: true, createdAt: true,
    items: { select: { productId: true, quantity: true, total: true, conversionFactor: true, ...(canSeeProfit ? { cost: true } : {}),
      product: { select: { name: true, baseUnit: true } } } } };
  const rows = [];
  if (canSeePos) {
    const sales = await db.sale.findMany({ where, select, take: MAX_SALES + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (sales.length > MAX_SALES) context.limitations.push(`POS figures cover only the most recent ${MAX_SALES} sales in this period; totals and comparisons are partial.`);
    rows.push(...sales.slice(0, MAX_SALES));
    context.sources.push('Sales');
  } else context.limitations.push('POS sales are not included because you do not have permission to view them.');
  if (canSeeCredit) {
    const records = await db.saleRecord.findMany({ where, select: { id: true }, take: MAX_SALES + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (records.length > MAX_SALES) context.limitations.push(`Credit-sale figures cover only the most recent ${MAX_SALES} records; totals and comparisons are partial.`);
    if (records.length) {
      const view = createReceivableSalesView(db);
      rows.push(...await view.findMany({ where: { ...where, id: { in: records.slice(0, MAX_SALES).map(record => record.id) } }, select }));
    }
    context.sources.push('Credit sales, adjusted for credit notes');
  } else context.limitations.push('Credit sales are not included because you do not have permission to view them.');
  if (canSeePos || canSeeCredit) {
    context.sales = summarizeAdvisorSales(rows, currentStart, canSeeProfit);
    context.limitations.push('Net sales exclude tax and cancelled/refunded/pending records. Repayments and account transfers are not new sales. This is a sales planning snapshot, not a financial statement.');
    if (context.sales.costDataComplete === false) context.limitations.push('Some historical item costs are missing, so gross profit is unavailable.');
  }
  if (canSeeInventory) {
    const productWhere = scopedWhere(scope, { isActive: true, itemType: 'product' });
    const totalProducts = await db.product.count({ where: productWhere });
    const products = await db.product.findMany({ where: productWhere, take: MAX_PRODUCTS, orderBy: [{ quantity: 'asc' }, { id: 'asc' }],
      select: { name: true, quantity: true, minStock: true, price: true, baseUnit: true, expiryDate: true } });
    const productSummary = product => ({ product: label(product.name), stock: product.quantity, minimumStock: product.minStock, sellingPrice: product.price, unit: label(product.baseUnit) });
    context.inventory = { totalProducts, sampledProducts: products.length,
      lowStock: products.filter(product => product.quantity <= product.minStock).slice(0, 8).map(productSummary),
      catalogue: products.filter(product => product.quantity > 0).slice(0, 8).map(productSummary),
      expiringSoon: products.filter(product => product.expiryDate && new Date(product.expiryDate) <= new Date(now.getTime() + 30 * 86400000))
        .slice(0, 8).map(product => ({ ...productSummary(product), expiryDate: new Date(product.expiryDate).toISOString().slice(0, 10) })),
    };
    context.sources.push('Current product inventory');
    if (totalProducts > products.length) context.limitations.push(`Stock suggestions use the ${MAX_PRODUCTS} lowest-stock products, not the whole catalogue.`);
  } else context.limitations.push('Current inventory is not included because you do not have permission to view it.');
  context.limitations.push('Customer identities, contacts, employee data, banking details, expenses, net profit and receivable balances are not provided. Marketing audience, budget and local conditions may need clarification.');
  return context;
}
