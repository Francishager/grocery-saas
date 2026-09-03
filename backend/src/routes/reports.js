import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, salesUserWhere, scopedWhere, visibleSalesUserId } from "../utils/branchAccess.js";
import { buildDecisionSupportSummary, buildSupplierStatementData } from "../utils/reportingHelpers.js";
import {
  transformSalesData,
  transformExpenseData,
  transformInventoryMovementData,
  transformAgingData,
  transformCashFlowData,
} from "../utils/enrichedReportTransform.js";

const router = Router();

// ==================== HELPERS ====================
const reportRoles = ["owner", "manager", "accountant"];
const stockLedgerSaleReturnStatuses = ["completed", "stock_adjusted"];

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
  "daily-business": "canViewSalesReport",
  "service-business": "canViewServiceBusinessReport",
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
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime()) && String(to).length <= 10) {
      end.setHours(23, 59, 59, 999);
    }
    f.lte = end;
  }
  return Object.keys(f).length ? { [field]: f } : {};
}

async function getScope(req) {
  return resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
}

function requestedSalesUserId(req) {
  return req.query.userId || req.query.staffId || null;
}

function saleVisibilityFilter(req) {
  return salesUserWhere(req, requestedSalesUserId(req));
}

function scopedSaleWhere(req, scope, extra = {}) {
  return scopedWhere(scope, { ...df(req), ...extra, ...saleVisibilityFilter(req) });
}

function dateRangeFromQuery(req) {
  return df(req, "date").date || null;
}

function expenseDateWhere(dateRange) {
  if (!dateRange || !Object.keys(dateRange).length) return {};
  return { OR: [{ date: dateRange }, { createdAt: dateRange }] };
}

function scopedExpenseWhere(scope, extra = {}) {
  const { branchId, ...rest } = extra;
  const branchScope = branchId || scope.branchId;
  const clauses = [];

  if (Object.keys(rest).length) clauses.push(rest);
  if (branchScope) {
    clauses.push({
      OR: [
        { branchId: branchScope },
        { branchId: null },
      ],
    });
  }

  return {
    tenantId: scope.tenantId,
    ...(clauses.length ? { AND: clauses } : {}),
  };
}

function positiveOpeningBalance(entity) {
  return Math.max(0, Number(entity?.openingBalance || 0));
}

function openingBalanceDate(entity) {
  return entity?.openingBalanceDate || entity?.createdAt || new Date();
}

function isWithinDateRange(date, fromDate, toDate) {
  const value = new Date(date);
  if (fromDate && value < fromDate) return false;
  if (toDate && value > toDate) return false;
  return true;
}

function toEndOfDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime()) && String(value).length <= 10) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

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

function saleNetRevenue(sale) {
  const total = Number(sale?.total || 0);
  const tax = Number(sale?.tax || 0);
  return Math.max(0, total - tax);
}

function aggregateNetRevenue(aggregate) {
  const total = Number(aggregate?._sum?.total || 0);
  const tax = Number(aggregate?._sum?.tax || 0);
  return Math.max(0, total - tax);
}

function saleItemProfit(item) {
  return Number(item?.total || 0) - saleLineCogs(item);
}

function saleStatus(sale) {
  return sale.status || sale.paymentStatus || "Completed";
}

function normalizedPaymentMethod(value) {
  const method = String(value || "cash").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["mobile_money", "mobilemoney", "momo", "mtn", "mtn_momo", "airtel", "airtel_money"].includes(method)) return "mobile_money";
  if (["bank_transfer", "banktransfer", "wire_transfer", "bank", "cheque", "check"].includes(method)) return "bank";
  if (["card", "debit_card", "credit_card"].includes(method)) return "card";
  if (method === "safe") return "safe";
  if (method === "credit" || method === "on_credit") return "credit";
  return "cash";
}

function paymentAccountLabel(method) {
  const normalized = normalizedPaymentMethod(method);
  if (normalized === "mobile_money") return "Mobile Money";
  if (normalized === "bank") return "Bank";
  if (normalized === "card") return "Card Payments";
  if (normalized === "credit") return "Accounts Receivable";
  return "Cash";
}

function userLabel(user) {
  return [user?.fname, user?.lname].filter(Boolean).join(" ") || user?.email || "Unknown";
}

function saleCogsForItems(items = []) {
  return items.reduce((sum, item) => sum + saleLineCogs(item), 0);
}

function addPaymentBreakdown(target, method, amount) {
  const key = normalizedPaymentMethod(method);
  target[key] = (target[key] || 0) + Number(amount || 0);
}

function addMoneyBreakdown(target, key, amount) {
  const label = key || "Uncategorized";
  target[label] = (target[label] || 0) + Number(amount || 0);
}

function expenseReportRow(expense) {
  const amount = Number(expense?.amount || 0);
  const method = normalizedPaymentMethod(expense?.paymentMethod);
  return {
    id: expense?.id,
    kind: "expense",
    date: expense?.date || expense?.createdAt,
    reference: expense?.reference || expense?.id,
    category: expense?.category || "Uncategorized",
    description: expense?.description || expense?.category || "Expense",
    paymentMethod: method,
    account: expense?.cashAccount?.name || "",
    accountType: expense?.cashAccount?.type || method,
    branch: expense?.branch?.name || "",
    staff: userLabel(expense?.User),
    staffId: expense?.User?.id || null,
    amount,
    debit: 0,
    credit: amount,
    cashAmount: method === "cash" ? amount : 0,
    creditAmount: amount,
  };
}

function isExpenseAccount(account) {
  return ["expense", "expenses"].includes(String(account?.type || "").trim().toLowerCase());
}

function isLinkedTransactionAccount(account) {
  const subType = String(account?.subType || "").trim().toLowerCase();
  return subType.startsWith("transaction_") || String(account?.description || "").includes("cashAccount:");
}

function transactionAccountMethod(account) {
  const subType = String(account?.subType || "").trim().toLowerCase();
  if (subType.startsWith("transaction_")) return normalizedPaymentMethod(subType.replace("transaction_", ""));
  if (String(account?.description || "").includes("cashAccount:")) return "cash";
  return normalizedPaymentMethod(account?.type || "cash");
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

async function journalExpenseRows(scope, dateWhere, { userId = null, requestedMethod = null, take = 1000 } = {}) {
  const entries = await prisma.journalEntry.findMany({
    where: scopedJournalWhere(scope, {
      date: dateWhere,
      status: { not: "reversed" },
      ...(userId ? { userId } : {}),
      lines: {
        some: {
          debit: { gt: 0 },
          account: { type: { in: ["expense", "expenses"] } },
        },
      },
    }),
    include: {
      user: { select: { id: true, fname: true, lname: true, email: true } },
      branch: { select: { id: true, name: true } },
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true, type: true, subType: true, description: true } },
        },
      },
    },
    orderBy: { date: "asc" },
    take,
  });

  const rows = [];
  for (const entry of entries) {
    const paymentLine = entry.lines.find((line) => isLinkedTransactionAccount(line.account) && Number(line.credit || 0) > 0) ||
      entry.lines.find((line) => isLinkedTransactionAccount(line.account));
    const method = transactionAccountMethod(paymentLine?.account);
    if (!paymentMethodMatches(method, requestedMethod)) continue;

    for (const line of entry.lines) {
      if (!isExpenseAccount(line.account) || Number(line.debit || 0) <= 0) continue;
      const amount = Number(line.debit || 0);
      rows.push({
        id: `journal-expense-${entry.id}-${line.id}`,
        journalEntryId: entry.id,
        source: "journal",
        date: entry.date || entry.createdAt,
        createdAt: entry.createdAt,
        reference: entry.reference || entry.entryNo,
        category: line.account?.name || "Accounting Expense",
        description: line.description || entry.description || line.account?.name || "Accounting expense",
        paymentMethod: method,
        cashAccount: paymentLine?.account ? { name: paymentLine.account.name, type: method } : null,
        branch: entry.branch,
        User: entry.user,
        amount,
      });
    }
  }

  return rows;
}

function paymentMethodMatches(value, requestedMethod) {
  if (!requestedMethod || requestedMethod === "all") return true;
  return normalizedPaymentMethod(value) === requestedMethod;
}

function staffSalesValues(method, amount) {
  const value = Number(amount || 0);
  if (!value) return {};
  if (method === "cash") return { cashSales: value };
  if (method === "credit") return { creditSales: value };
  if (method === "mobile_money") return { mobileMoneySales: value };
  if (method === "bank") return { bankSales: value };
  if (method === "card") return { cardSales: value };
  return {};
}

function cashMovementDirection(type) {
  const normalized = String(type || "").toLowerCase();
  if (["income", "receipt", "deposit", "sale", "collection"].includes(normalized)) return "in";
  if (["expense", "payment", "withdrawal", "purchase", "refund", "sale_return"].includes(normalized)) return "out";
  if (normalized.includes("transfer_in") || normalized.includes("handover_in")) return "transfer-in";
  if (normalized.includes("transfer_out") || normalized.includes("handover") || normalized.includes("transfer")) return "transfer-out";
  return normalized.includes("out") ? "out" : "in";
}

function isPaidAtSaleCustomerPayment(payment) {
  return Boolean(payment?.saleId && String(payment?.notes || "").trim().toLowerCase().startsWith("paid at sale"));
}

function dayRange(from, to) {
  const start = from ? new Date(from) : new Date();
  if (!from) start.setHours(0, 0, 0, 0);
  const end = to ? toEndOfDay(to) : new Date(start);
  if (!to) end.setHours(23, 59, 59, 999);
  return { start, end };
}

function enrichBalanceRows(rows, { title, entityType, entityKey, balanceLabel = "Balance" }) {
  const transactions = rows.map((row) => {
    const balance = Number(row.balance || 0);
    return {
      id: row.id,
      date: row.updatedAt || row.createdAt || new Date(),
      type: balance >= 0 ? balanceLabel : "Credit Balance",
      description: `${row[entityKey] || row.name || "Unknown"} - ${balanceLabel}`,
      details: [
        row.phone ? `Phone: ${row.phone}` : null,
        row.email ? `Email: ${row.email}` : null,
        row.openingBalance ? `Opening balance: ${Number(row.openingBalance || 0)}` : null,
        row.status ? `Status: ${row.status}` : null,
      ].filter(Boolean).join(", "),
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? Math.abs(balance) : 0,
      amount: Math.abs(balance),
      reference: row.id?.slice(-8) || "",
      balance,
      status: row.status || "active",
    };
  });

  return {
    title,
    entityType,
    currentBalance: transactions.reduce((sum, row) => sum + Number(row.balance || 0), 0),
    summary: {
      totalBalance: transactions.reduce((sum, row) => sum + Number(row.balance || 0), 0),
      [`${entityType}Count`]: transactions.length,
      count: transactions.length,
    },
    transactions,
    data: rows,
    generatedAt: new Date().toISOString(),
  };
}

// ==================== LEGACY ROUTES (backward compatibility) ====================
router.get("/sales", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: true } }, User: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    const allSales = [...sales, ...saleRecords];
    const grossSales = allSales.reduce((a, x) => a + Number(x.total || 0), 0);
    const totalTax = allSales.reduce((a, x) => a + Number(x.tax || 0), 0);
    res.json({ sales: allSales, summary: { count: allSales.length, grossSales, totalRevenue: Math.max(0, grossSales - totalTax), totalDiscount: allSales.reduce((a, x) => a + (x.discount || 0), 0), totalTax } });
  } catch (err) { console.error("Sales report error:", err); handleBranchError(res, err); }
});

router.get("/purchases", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedWhere(s, df(req));
    const [purchases, supplierPurchases] = await Promise.all([
      prisma.purchase.findMany({ where, include: { items: { include: { product: true } }, user: { select: { fname: true, lname: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.supplierPurchase.findMany({ where, include: { items: { include: { product: true } }, User: { select: { fname: true, lname: true } }, supplier: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    const allPurchases = [...purchases, ...supplierPurchases];
    res.json({ purchases: allPurchases, summary: { count: allPurchases.length, totalCost: allPurchases.reduce((a, x) => a + x.total, 0) } });
  } catch (err) { console.error("Purchases report error:", err); handleBranchError(res, err); }
});

router.get("/expenses", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedExpenseWhere(s, expenseDateWhere(dateRangeFromQuery(req)));
    const expenses = await prisma.expense.findMany({ where, orderBy: { date: "desc" } });
    const byCategory = {};
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    res.json({ expenses, summary: { count: expenses.length, totalExpenses: expenses.reduce((a, x) => a + x.amount, 0), byCategory } });
  } catch (err) { console.error("Expenses report error:", err); handleBranchError(res, err); }
});

router.get("/profit", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [salesAgg, saleRecordAgg, expensesAgg, salesWithItems, saleRecordsWithItems] = await Promise.all([
      prisma.sale.aggregate({ where, _sum: { total: true, tax: true } }),
      prisma.saleRecord.aggregate({ where, _sum: { total: true, tax: true } }),
      prisma.expense.aggregate({ where: scopedExpenseWhere(s, expenseDateWhere(dateRangeFromQuery(req))), _sum: { amount: true } }),
      prisma.sale.findMany({
        where,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
      prisma.saleRecord.findMany({
        where,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
    ]);
    const revenue = aggregateNetRevenue(salesAgg) + aggregateNetRevenue(saleRecordAgg);
    const cogs = [...salesWithItems, ...saleRecordsWithItems].reduce((sum, sale) => sum + saleCogs(sale), 0);
    const expenses = expensesAgg._sum.amount || 0;
    res.json({ revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses });
  } catch (err) { console.error("Profit report error:", err); handleBranchError(res, err); }
});

router.get("/daily-business", authenticateToken, async (req, res) => {
  try {
    const scope = await getScope(req);
    const { start, end } = dayRange(req.query.from, req.query.to);
    const userId = visibleSalesUserId(req, requestedSalesUserId(req));
    const customerId = req.query.customerId || null;
    const requestedMethod = req.query.paymentMethod ? normalizedPaymentMethod(req.query.paymentMethod) : null;
    const take = Math.min(Math.max(Number.parseInt(req.query.limit || "700", 10) || 700, 1), 1500);
    const dateWhere = { gte: start, lte: end };
    const allowedCashAccountId = !scope.canAccessAllBranches ? req.user?.cashAccountId : null;

    const [tenant, selectedCustomer] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: scope.tenantId },
        select: { id: true, name: true, email: true, phone: true, address: true, logo: true },
      }),
      customerId
        ? prisma.customer.findFirst({
            where: scopedWhere(scope, { id: customerId }),
            select: { id: true, name: true, phone: true, balance: true, creditLimit: true },
          })
        : null,
    ]);

    const saleWhere = customerId
      ? scopedWhere(scope, {
          createdAt: dateWhere,
          status: "completed",
          ...(userId ? { userId } : {}),
          ...(selectedCustomer?.name ? { customerName: selectedCustomer.name } : { id: "__no_matching_cash_sale__" }),
        })
      : scopedWhere(scope, { createdAt: dateWhere, status: "completed", ...(userId ? { userId } : {}) });
    const saleRecordWhere = scopedWhere(scope, {
      createdAt: dateWhere,
      status: "completed",
      ...(userId ? { userId } : {}),
      ...(customerId ? { customerId } : {}),
    });
    const paymentWhere = scopedWhere(scope, { createdAt: dateWhere, ...(customerId ? { customerId } : {}) });
    const expenseWhere = scopedExpenseWhere(scope, {
      ...expenseDateWhere(dateWhere),
      ...(userId ? { userId } : {}),
    });

    const [sales, creditSales, payments, expenses, branches, cashAccounts, cashTransactions, openingRows, customersForLookup] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true, quantity: true, cost: true } } } },
          user: { select: { id: true, fname: true, lname: true, email: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.saleRecord.findMany({
        where: saleRecordWhere,
        include: {
          customer: { select: { id: true, name: true, phone: true, balance: true, creditLimit: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true, quantity: true, cost: true } } } },
          User: { select: { id: true, fname: true, lname: true, email: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.customerPayment.findMany({
        where: paymentWhere,
        include: {
          customer: { select: { id: true, name: true, phone: true, balance: true, creditLimit: true } },
          sale: { select: { id: true, receiptNo: true } },
        },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.expense.findMany({
        where: expenseWhere,
        include: {
          User: { select: { id: true, fname: true, lname: true, email: true } },
          cashAccount: { select: { id: true, name: true, type: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { date: "asc" },
        take,
      }),
      prisma.branch.findMany({
        where: { tenantId: scope.tenantId, isActive: true, ...(scope.canAccessAllBranches ? {} : { id: scope.branchId }) },
        select: { id: true, name: true },
      }),
      prisma.cashAccount.findMany({
        where: { tenantId: scope.tenantId, isActive: true, ...(allowedCashAccountId ? { id: allowedCashAccountId } : {}) },
        select: {
          id: true,
          name: true,
          type: true,
          balance: true,
          AssignedUsers: { select: { id: true, fname: true, lname: true, email: true } },
        },
      }),
      prisma.cashTransaction.findMany({
        where: { tenantId: scope.tenantId, createdAt: dateWhere, ...(allowedCashAccountId ? { accountId: allowedCashAccountId } : {}), ...(userId ? { userId } : {}) },
        include: {
          account: { select: { id: true, name: true, type: true } },
          User: { select: { id: true, fname: true, lname: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
        take: take * 2,
      }),
      prisma.cashTransaction.findMany({
        where: { tenantId: scope.tenantId, createdAt: { lt: start }, account: { ...(allowedCashAccountId ? { id: allowedCashAccountId } : {}) } },
        orderBy: { createdAt: "desc" },
        distinct: ["accountId"],
        select: { accountId: true, balanceAfter: true, account: { select: { type: true } } },
      }),
      prisma.customer.findMany({
        where: scopedWhere(scope, customerId ? { id: customerId } : {}),
        select: { id: true, name: true, phone: true, balance: true, creditLimit: true },
        take: 5000,
      }),
    ]);
    const directExpenseReferences = new Set(
      expenses.flatMap((expense) => [expense.id, expense.reference].filter(Boolean))
    );
    const accountingExpenses = (await journalExpenseRows(scope, dateWhere, {
      userId,
      requestedMethod: requestedMethod === "credit" ? null : requestedMethod,
      take,
    })).filter((expense) => (
      !directExpenseReferences.has(expense.reference) &&
      !directExpenseReferences.has(expense.journalEntryId)
    ));
    const allExpenses = [...expenses, ...accountingExpenses];

    const transactionRows = [];
    const salesBreakdown = { cash: 0, credit: 0, mobile_money: 0, bank: 0, card: 0 };
    const paidAtSaleBySaleId = new Map();
    payments.forEach((payment) => {
      if (!isPaidAtSaleCustomerPayment(payment)) return;
      const method = normalizedPaymentMethod(payment.paymentMethod);
      const row = paidAtSaleBySaleId.get(payment.saleId) || { total: 0, byMethod: { cash: 0, mobile_money: 0, bank: 0, card: 0 } };
      row.total += Number(payment.amount || 0);
      if (row.byMethod[method] !== undefined) row.byMethod[method] += Number(payment.amount || 0);
      paidAtSaleBySaleId.set(payment.saleId, row);
    });
    const staffMap = new Map();
    const customerMap = new Map();
    const productMap = new Map();
    const customersByName = new Map(customersForLookup.map((customer) => [String(customer.name || "").trim().toLowerCase(), customer]));
    const cashMovementsByReference = new Map();
    cashTransactions.forEach((movement) => {
      [movement.reference, movement.id].filter(Boolean).forEach((reference) => {
        if (!cashMovementsByReference.has(reference)) cashMovementsByReference.set(reference, movement);
      });
    });

    let totalSales = 0;
    let netRevenue = 0;
    let taxCollected = 0;
    let cogs = 0;

    const addStaff = (user, values = {}) => {
      const id = user?.id || "unknown";
      const row = staffMap.get(id) || {
        id,
        name: userLabel(user),
        sales: 0,
        cashSales: 0,
        creditSales: 0,
        mobileMoneySales: 0,
        bankSales: 0,
        cardSales: 0,
        collections: 0,
        expenses: 0,
        cashHeld: 0,
      };
      Object.entries(values).forEach(([key, value]) => { row[key] = Number(row[key] || 0) + Number(value || 0); });
      staffMap.set(id, row);
      return row;
    };

    const addCustomer = (customer) => {
      const id = customer?.id || (customer?.name ? `cash-name:${String(customer.name).trim().toLowerCase()}` : "walk-in");
      const row = customerMap.get(id) || {
        id,
        customerId: customer?.id || null,
        registered: Boolean(customer?.id),
        name: customer?.name || "Walk-in",
        phone: customer?.phone || null,
        cashSales: 0,
        creditSales: 0,
        payments: 0,
        currentBalance: Number(customer?.balance || 0),
        creditLimit: Number(customer?.creditLimit || 0),
        transactions: [],
      };
      if (customer?.id) {
        row.customerId = customer.id;
        row.registered = true;
        row.currentBalance = Number(customer.balance || 0);
        row.creditLimit = Number(customer.creditLimit || row.creditLimit || 0);
      }
      customerMap.set(id, row);
      return row;
    };

    const addProducts = (items = []) => {
      items.forEach((item) => {
        const product = item.product;
        if (!product?.id) return;
        const row = productMap.get(product.id) || {
          id: product.id,
          name: product.name,
          sku: product.sku,
          quantitySold: 0,
          salesValue: 0,
          cogs: 0,
          grossProfit: 0,
          currentStock: product.quantity,
        };
        row.quantitySold += Number(item.quantity || 0);
        row.salesValue += Number(item.total || 0);
        row.cogs += saleLineCogs(item);
        row.grossProfit = row.salesValue - row.cogs;
        productMap.set(product.id, row);
      });
    };

    const findMatchingMovement = (...references) => references.filter(Boolean).map((reference) => cashMovementsByReference.get(reference)).find(Boolean) || null;

    for (const sale of sales) {
      const method = normalizedPaymentMethod(sale.paymentMethod);
      if (!paymentMethodMatches(method, requestedMethod)) continue;
      const grossAmount = Number(sale.total || 0);
      totalSales += grossAmount;
      netRevenue += saleNetRevenue(sale);
      taxCollected += Number(sale.tax || 0);
      const cashAmount = method === "credit" ? 0 : grossAmount;
      const creditAmount = method === "credit" ? grossAmount : 0;
      salesBreakdown[method] += cashAmount || creditAmount;
      cogs += saleCogsForItems(sale.items);
      addStaff(sale.user, { sales: sale.total, ...staffSalesValues(method, cashAmount || creditAmount) });
      const matchedCustomer = sale.customerName ? customersByName.get(String(sale.customerName).trim().toLowerCase()) : null;
      const customer = addCustomer(matchedCustomer || (sale.customerName ? { name: sale.customerName } : null));
      customer[method === "credit" ? "creditSales" : "cashSales"] += cashAmount || creditAmount;
      const row = {
        id: sale.id,
        kind: method === "credit" ? "credit-sale" : "sale",
        date: sale.createdAt,
        reference: sale.receiptNo,
        customer: customer.name,
        customerId: customer.customerId,
        customerBalance: customer.currentBalance,
        customerCreditLimit: customer.creditLimit,
        staff: userLabel(sale.user),
        staffId: sale.user?.id,
        branch: sale.branch?.name || "",
        amount: sale.total,
        cashAmount,
        creditAmount,
        debit: cashAmount,
        credit: 0,
        paymentMethod: method,
        status: sale.status,
        items: sale.items.map((item) => ({ productId: item.product?.id, product: item.product?.name, quantity: item.quantity, unitPrice: item.price, total: item.total, cost: saleLineCogs(item), profit: saleItemProfit(item) })),
      };
      customer.transactions.push({ ...row, type: "SALE" });
      transactionRows.push(row);
      addProducts(sale.items);
    }

    for (const sale of creditSales) {
      const grossAmount = Number(sale.total || 0);
      const paidAtSale = paidAtSaleBySaleId.get(sale.id) || { total: 0, byMethod: { cash: 0, mobile_money: 0, bank: 0, card: 0 } };
      const paid = Math.min(grossAmount, Number(paidAtSale.total || 0));
      const creditAmount = Math.max(0, grossAmount - paid);
      const method = normalizedPaymentMethod(sale.paymentMethod);
      if (!paymentMethodMatches(method, requestedMethod)) continue;
      totalSales += grossAmount;
      netRevenue += saleNetRevenue(sale);
      taxCollected += Number(sale.tax || 0);
      salesBreakdown.credit += creditAmount;
      Object.entries(paidAtSale.byMethod || {}).forEach(([paidMethod, amount]) => addPaymentBreakdown(salesBreakdown, paidMethod, amount));
      cogs += saleCogsForItems(sale.items);
      addStaff(sale.User, {
        sales: sale.total,
        creditSales: creditAmount,
        ...Object.entries(paidAtSale.byMethod || {}).reduce((values, [paidMethod, amount]) => ({ ...values, ...staffSalesValues(paidMethod, amount) }), {}),
      });
      const customer = addCustomer(sale.customer);
      customer.creditSales += creditAmount;
      if (paid > 0 && method !== "credit") customer.cashSales += paid;
      const row = {
        id: sale.id,
        kind: "credit-sale",
        date: sale.createdAt,
        reference: sale.receiptNo,
        customer: sale.customer?.name || "Unknown customer",
        customerId: sale.customerId,
        customerBalance: Number(sale.customer?.balance || 0),
        customerCreditLimit: Number(sale.customer?.creditLimit || 0),
        staff: userLabel(sale.User),
        staffId: sale.User?.id,
        branch: sale.branch?.name || "",
        amount: sale.total,
        cashAmount: paid > 0 && method !== "credit" ? paid : 0,
        creditAmount,
        debit: paid > 0 && method !== "credit" ? paid : 0,
        credit: 0,
        paymentMethod: method,
        status: sale.paymentStatus,
        items: sale.items.map((item) => ({ productId: item.product?.id, product: item.product?.name, quantity: item.quantity, unitPrice: item.price, total: item.total, cost: saleLineCogs(item), profit: saleItemProfit(item) })),
      };
      customer.transactions.push({ ...row, type: "SALE" });
      transactionRows.push(row);
      addProducts(sale.items);
    }

    let debtCollections = 0;
    for (const payment of payments) {
      if (isPaidAtSaleCustomerPayment(payment)) continue;
      const method = normalizedPaymentMethod(payment.paymentMethod);
      if (!paymentMethodMatches(method, requestedMethod)) continue;
      const paymentMovement = findMatchingMovement(payment.reference, payment.id, payment.transactionId);
      if (userId && paymentMovement?.userId !== userId) continue;
      debtCollections += Number(payment.amount || 0);
      const paymentStaff = paymentMovement?.User || null;
      if (paymentStaff) addStaff(paymentStaff, { collections: payment.amount });
      const customer = addCustomer(payment.customer);
      customer.payments += Number(payment.amount || 0);
      const row = {
        id: payment.id,
        kind: "collection",
        date: payment.createdAt,
        reference: payment.reference || payment.id,
        customer: payment.customer?.name || "Unknown customer",
        customerId: payment.customerId,
        customerBalance: Number(payment.customer?.balance || 0),
        amount: payment.amount,
        debit: payment.amount,
        credit: 0,
        paymentMethod: method,
        staff: paymentStaff ? userLabel(paymentStaff) : "Recorded payment",
        staffId: paymentStaff?.id || null,
        transactionId: payment.transactionId,
        linkedSale: payment.sale?.receiptNo || null,
      };
      customer.transactions.push({ ...row, type: "PAYMENT" });
      transactionRows.push(row);
    }

    let cashExpenses = 0;
    const filteredExpenses = [];
    const expenseMethodFilter = requestedMethod === "credit" ? null : requestedMethod;
    for (const expense of allExpenses) {
      const method = normalizedPaymentMethod(expense.paymentMethod);
      if (!paymentMethodMatches(method, expenseMethodFilter)) continue;
      filteredExpenses.push(expense);
      if (method === "cash") cashExpenses += Number(expense.amount || 0);
      addStaff(expense.User, { expenses: expense.amount });
      transactionRows.push({
        id: expense.id,
        kind: "expense",
        date: expense.date || expense.createdAt,
        reference: expense.reference || expense.id,
        category: expense.category,
        description: expense.description,
        paymentMethod: method,
        account: expense.cashAccount?.name || "",
        accountType: expense.cashAccount?.type || method,
        branch: expense.branch?.name || "",
        staff: userLabel(expense.User),
        staffId: expense.User?.id,
        amount: expense.amount,
        debit: 0,
        credit: expense.amount,
        cashAmount: method === "cash" ? expense.amount : 0,
        creditAmount: expense.amount,
      });
    }

    const knownReferences = new Set([
      ...sales.flatMap((sale) => [sale.id, sale.receiptNo].filter(Boolean)),
      ...creditSales.flatMap((sale) => [sale.id, sale.receiptNo].filter(Boolean)),
      ...payments.flatMap((payment) => [payment.id, payment.reference, payment.transactionId, payment.sale?.receiptNo].filter(Boolean)),
      ...filteredExpenses.flatMap((expense) => [expense.id, expense.reference, expense.journalEntryId].filter(Boolean)),
    ]);
    const cashMovementReferenceGroups = new Map();
    cashTransactions.forEach((movement) => {
      if (!movement.reference || knownReferences.has(movement.reference)) return;
      const accountType = String(movement.account?.type || "").toLowerCase();
      const direction = cashMovementDirection(movement.type);
      const group = cashMovementReferenceGroups.get(movement.reference) || { incomingTypes: new Set(), outgoingTypes: new Set() };
      if (direction === "in" || direction === "transfer-in") group.incomingTypes.add(accountType);
      if (direction === "out" || direction === "transfer-out") group.outgoingTypes.add(accountType);
      cashMovementReferenceGroups.set(movement.reference, group);
    });
    const isUnpairedNonCashInflow = (movement, direction) => {
      if (!(direction === "in" || direction === "transfer-in")) return false;
      if (!movement.reference) return true;
      const group = cashMovementReferenceGroups.get(movement.reference);
      return !group || group.outgoingTypes.size === 0;
    };
    const accountMovementMap = new Map();
    let otherCashIn = 0;
    let otherCashOut = 0;
    let otherPhysicalCashIn = 0;
    let otherPhysicalCashOut = 0;
    let cashTransfersIn = 0;
    let cashTransfersOut = 0;
    let cashToSafe = 0;
    let cashToBank = 0;
    let cashToMobileMoney = 0;
    for (const movement of cashTransactions) {
      const direction = cashMovementDirection(movement.type);
      const accountType = String(movement.account?.type || "").toLowerCase();
      const amount = Number(movement.amount || 0);
      const isDebit = direction === "in" || direction === "transfer-in";
      const accountStats = accountMovementMap.get(movement.accountId) || { cashIn: 0, cashOut: 0, transferIn: 0, transferOut: 0, debit: 0, credit: 0, lastBalance: null };
      if (direction === "transfer-in") accountStats.transferIn += amount;
      else if (direction === "transfer-out") accountStats.transferOut += amount;
      else if (direction === "in") accountStats.cashIn += amount;
      else accountStats.cashOut += amount;
      if (isDebit) accountStats.debit += amount;
      else accountStats.credit += amount;
      accountStats.lastBalance = Number(movement.balanceAfter || 0);
      accountMovementMap.set(movement.accountId, accountStats);

      if (!knownReferences.has(movement.reference)) {
        if (accountType === "cash") {
          if (direction === "transfer-in") cashTransfersIn += amount;
          else if (direction === "transfer-out") cashTransfersOut += amount;
          else if (direction === "in") {
            otherCashIn += amount;
            otherPhysicalCashIn += amount;
          } else {
            otherCashOut += amount;
            otherPhysicalCashOut += amount;
          }
        } else if (accountType === "safe" && isDebit && isUnpairedNonCashInflow(movement, direction)) {
          cashToSafe += amount;
        } else if (accountType === "bank" && isDebit && isUnpairedNonCashInflow(movement, direction)) {
          cashToBank += amount;
        } else if (accountType === "mobile_money" && isDebit && isUnpairedNonCashInflow(movement, direction)) {
          cashToMobileMoney += amount;
        }
      }

      if (knownReferences.has(movement.reference)) continue;
      transactionRows.push({
        id: movement.id,
        kind: direction.includes("transfer") ? "transfer" : "cash-movement",
        date: movement.createdAt,
        reference: movement.reference || movement.id,
        description: movement.description,
        account: movement.account?.name,
        accountType,
        staff: userLabel(movement.User),
        staffId: movement.User?.id,
        amount: movement.amount,
        debit: isDebit ? movement.amount : 0,
        credit: isDebit ? 0 : movement.amount,
        balanceAfter: movement.balanceAfter,
        direction,
        paymentMethod: normalizedPaymentMethod(movement.account?.type || "cash"),
      });
    }

    const cashSales = salesBreakdown.cash;
    const cashCollections = payments
      .filter((payment) => !isPaidAtSaleCustomerPayment(payment) && paymentMethodMatches(payment.paymentMethod, requestedMethod) && normalizedPaymentMethod(payment.paymentMethod) === "cash")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const openingByAccount = new Map(openingRows.map((row) => [row.accountId, Number(row.balanceAfter || 0)]));
    const openingCashAtHand = openingRows.filter((row) => String(row.account?.type || "").toLowerCase() === "cash").reduce((sum, row) => sum + Number(row.balanceAfter || 0), 0);
    const openingCash = openingCashAtHand;
    const cashReceived = cashSales + cashCollections + otherCashIn + cashTransfersIn;
    const cashPaidOut = cashExpenses + otherCashOut + cashTransfersOut;
    const expectedCash = openingCash + cashReceived - cashPaidOut;
    const cashAtHand = openingCashAtHand + cashSales + cashCollections + otherPhysicalCashIn + cashTransfersIn - cashExpenses - otherPhysicalCashOut - cashTransfersOut - cashToSafe - cashToBank - cashToMobileMoney;
    const netCashMovement = cashReceived - cashPaidOut - cashToSafe - cashToBank - cashToMobileMoney;
    const expensesTotal = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const revenue = netRevenue;
    const grossProfit = revenue - cogs;
    const staffTills = cashAccounts.map((account) => {
      const stats = accountMovementMap.get(account.id) || { cashIn: 0, cashOut: 0, transferIn: 0, transferOut: 0, debit: 0, credit: 0, lastBalance: null };
      const netMovement = stats.cashIn + stats.transferIn - stats.cashOut - stats.transferOut;
      const closingBalance = stats.lastBalance !== null ? stats.lastBalance : Number(account.balance || 0);
      const openingBalance = openingByAccount.has(account.id) ? openingByAccount.get(account.id) : closingBalance - netMovement;
      const assignedUsers = account.AssignedUsers || [];
      assignedUsers.forEach((user) => addStaff(user, { cashHeld: closingBalance / Math.max(assignedUsers.length, 1) }));
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        staff: assignedUsers.map(userLabel).join(", ") || "Unassigned",
        openingCash: openingBalance,
        cashIn: stats.cashIn,
        cashOut: stats.cashOut,
        cashTransfersIn: stats.transferIn,
        cashTransfersOut: stats.transferOut,
        debit: stats.debit,
        credit: stats.credit,
        expectedClosing: closingBalance,
        balance: closingBalance,
      };
    });

    res.json({
      header: {
        date: start.toISOString().slice(0, 10),
        businessName: tenant?.name || "Business",
        businessEmail: tenant?.email || "",
        businessPhone: tenant?.phone || "",
        businessAddress: tenant?.address || "",
        branch: scope.branch?.name || "All authorized branches",
        status: "Open",
        generatedBy: userLabel(req.user),
      },
      filters: { from: start.toISOString(), to: end.toISOString(), branchId: scope.branchId || "all", userId, customerId, paymentMethod: req.query.paymentMethod || "all" },
      note: "Credit sales include credit invoices only. Credit/debit notes are adjustments and are reported separately.",
      reportNotes: [
        "Credit sales include credit invoices only. Credit notes and debit notes are adjustments and are reported separately.",
      ],
      summary: {
        totalSales,
        grossSales: totalSales,
        taxCollected,
        revenue,
        cashSales,
        creditSales: salesBreakdown.credit,
        mobileMoneySales: salesBreakdown.mobile_money,
        bankSales: salesBreakdown.bank,
        cardSales: salesBreakdown.card,
        debtCollections,
        cashReceived,
        cashAtHand,
        netCashMovement,
        expenses: expensesTotal,
        grossProfit,
        netProfit: grossProfit - expensesTotal,
        customersServed: customerMap.size,
        transactionCount: transactionRows.length,
      },
      cashMovement: {
        openingCash,
        cashSales,
        debtCollections,
        cashCollections,
        otherCashIn,
        cashReceived,
        cashAtHand,
        cashExpenses,
        otherCashOut,
        otherPhysicalCashIn,
        otherPhysicalCashOut,
        cashTransfersIn,
        cashTransfersOut,
        cashToSafe,
        cashToBank,
        cashToMobileMoney,
        cashPaidOut,
        expectedCash,
        netCashMovement,
        physicalCashCounted: 0,
        difference: 0,
        cashHandedOver: cashTransfersOut,
        cashRetained: cashAtHand,
      },
      profitability: { grossSales: totalSales, taxCollected, revenue, cogs, grossProfit, expenses: expensesTotal, netProfit: grossProfit - expensesTotal },
      customerActivity: [...customerMap.values()].sort((a, b) => (b.cashSales + b.creditSales + b.payments) - (a.cashSales + a.creditSales + a.payments)),
      staffActivity: [...staffMap.values()].sort((a, b) => b.sales - a.sales),
      productActivity: [...productMap.values()].sort((a, b) => b.salesValue - a.salesValue),
      expenses: filteredExpenses.map(expenseReportRow),
      transactions: transactionRows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      staffTills,
      branches,
      pagination: { returned: transactionRows.length, limit: take },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Daily business report error:", err);
    handleBranchError(res, err);
  }
});

// ==================== DAILY BUSINESS CONTROL REPORT ====================
// This is the operational daily report. Sales, customer payments, expenses,
// and inventory costs remain separate event types so the report cannot turn
// a debt collection or a cash transfer into revenue.
router.get("/daily-business", authenticateToken, async (req, res) => {
  try {
    const scope = await getScope(req);
    const { start, end } = dayRange(req.query.from, req.query.to);
    const userId = visibleSalesUserId(req, requestedSalesUserId(req));
    const customerId = req.query.customerId || null;
    const requestedMethod = req.query.paymentMethod && normalizedPaymentMethod(req.query.paymentMethod);
    const take = Math.min(Math.max(Number.parseInt(req.query.limit || "500", 10) || 500, 1), 1000);
    const dateWhere = { gte: start, lte: end };
    const baseWhere = scopedWhere(scope, { createdAt: dateWhere, ...(userId ? { userId } : {}) });
    const customerWhere = scopedWhere(scope, { createdAt: dateWhere });
    if (customerId) customerWhere.customerId = customerId;

    const [sales, creditSales, payments, expenses, products, creditProducts, branches, cashAccounts] = await Promise.all([
      prisma.sale.findMany({
        where: { ...baseWhere, status: "completed", ...(customerId ? { id: { in: [] } } : {}) },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true, cost: true } } } }, user: { select: { id: true, fname: true, lname: true, email: true } }, branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.saleRecord.findMany({
        where: { ...scopedWhere(scope, { createdAt: dateWhere, status: "completed", ...(userId ? { userId } : {}), ...(customerId ? { customerId } : {}) }) },
        include: { customer: { select: { id: true, name: true, phone: true, balance: true, creditLimit: true } }, items: { include: { product: { select: { id: true, name: true, sku: true, cost: true } } } }, User: { select: { id: true, fname: true, lname: true, email: true } }, branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.customerPayment.findMany({
        where: customerWhere,
        include: { customer: { select: { id: true, name: true, phone: true, balance: true, creditLimit: true } } },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.expense.findMany({
        where: scopedWhere(scope, { createdAt: dateWhere, ...(userId ? { userId } : {}) }),
        include: { User: { select: { id: true, fname: true, lname: true, email: true } }, cashAccount: { select: { id: true, name: true, type: true } }, branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.saleItem.findMany({
        where: { sale: { ...baseWhere, status: "completed" } },
        include: { product: { select: { id: true, name: true, sku: true, quantity: true, cost: true } }, sale: { select: { createdAt: true, receiptNo: true, total: true } } },
        take: take * 10,
      }),
      prisma.saleRecordItem.findMany({
        where: { sale: { ...scopedWhere(scope, { createdAt: dateWhere, status: "completed", ...(userId ? { userId } : {}), ...(customerId ? { customerId } : {}) }) } },
        include: { product: { select: { id: true, name: true, sku: true, quantity: true, cost: true } }, sale: { select: { createdAt: true, receiptNo: true, total: true } } },
        take: take * 10,
      }),
      prisma.branch.findMany({ where: { tenantId: scope.tenantId, isActive: true, ...(scope.canAccessAllBranches ? {} : { id: scope.branchId }) }, select: { id: true, name: true } }),
      prisma.cashAccount.findMany({ where: { tenantId: scope.tenantId, isActive: true, type: { in: ["cash", "safe"] }, ...(!scope.canAccessAllBranches && req.user?.cashAccountId ? { id: req.user.cashAccountId } : {}) }, select: { id: true, name: true, type: true, balance: true } }),
    ]);

    const transactionRows = [];
    const salesBreakdown = { cash: 0, credit: 0, mobile_money: 0, bank: 0, card: 0 };
    const paidAtSaleBySaleId = new Map();
    payments.forEach((payment) => {
      if (!isPaidAtSaleCustomerPayment(payment)) return;
      const method = normalizedPaymentMethod(payment.paymentMethod);
      const row = paidAtSaleBySaleId.get(payment.saleId) || { total: 0, byMethod: { cash: 0, mobile_money: 0, bank: 0, card: 0 } };
      row.total += Number(payment.amount || 0);
      if (row.byMethod[method] !== undefined) row.byMethod[method] += Number(payment.amount || 0);
      paidAtSaleBySaleId.set(payment.saleId, row);
    });
    const staffMap = new Map();
    const customerMap = new Map();
    const productMap = new Map();
    let totalSales = 0;
    let netRevenue = 0;
    let taxCollected = 0;
    let cogs = 0;

    const addStaff = (user, values = {}) => {
      const id = user?.id || "unknown";
      const row = staffMap.get(id) || { id, name: userLabel(user), sales: 0, cashSales: 0, creditSales: 0, collections: 0, cashHeld: 0 };
      Object.entries(values).forEach(([key, value]) => { row[key] = Number(row[key] || 0) + Number(value || 0); });
      staffMap.set(id, row);
      return row;
    };

    const addCustomer = (customer) => {
      const id = customer?.id || "walk-in";
      const row = customerMap.get(id) || { id, name: customer?.name || "Walk-in", phone: customer?.phone || null, cashSales: 0, creditSales: 0, payments: 0, currentBalance: Number(customer?.balance || 0), transactions: [] };
      customerMap.set(id, row);
      return row;
    };

    for (const sale of sales) {
      const method = normalizedPaymentMethod(sale.paymentMethod);
      if (requestedMethod && method !== requestedMethod) continue;
      const grossAmount = Number(sale.total || 0);
      totalSales += grossAmount;
      netRevenue += saleNetRevenue(sale);
      taxCollected += Number(sale.tax || 0);
      const amount = method === "credit" ? 0 : grossAmount;
      salesBreakdown[method] += amount;
      cogs += saleCogsForItems(sale.items);
      addStaff(sale.user, { sales: sale.total, [`${method === "mobile_money" ? "mobile_money" : method}Sales`]: amount });
      const customer = addCustomer(sale.customerName ? { name: sale.customerName } : null);
      customer[method === "credit" ? "creditSales" : "cashSales"] += amount;
      customer.transactions.push({ id: sale.id, type: "SALE", reference: sale.receiptNo, date: sale.createdAt, amount: sale.total, paymentMethod: method, staff: userLabel(sale.user) });
      transactionRows.push({ id: sale.id, kind: method === "credit" ? "credit-sale" : "sale", date: sale.createdAt, reference: sale.receiptNo, customer: sale.customerName || "Walk-in", customerId: null, staff: userLabel(sale.user), staffId: sale.user?.id, branch: sale.branch?.name || "", amount: sale.total, paymentMethod: method, items: sale.items.map((item) => ({ productId: item.product?.id, product: item.product?.name, quantity: item.quantity, unitPrice: item.price, total: item.total, cost: saleLineCogs(item) })) });
    }

    for (const sale of creditSales) {
      const grossAmount = Number(sale.total || 0);
      const paidAtSale = paidAtSaleBySaleId.get(sale.id) || { total: 0, byMethod: { cash: 0, mobile_money: 0, bank: 0, card: 0 } };
      const paid = Math.min(grossAmount, Number(paidAtSale.total || 0));
      const credit = Math.max(0, grossAmount - paid);
      const method = normalizedPaymentMethod(sale.paymentMethod);
      if (requestedMethod && method !== requestedMethod) continue;
      totalSales += grossAmount;
      netRevenue += saleNetRevenue(sale);
      taxCollected += Number(sale.tax || 0);
      salesBreakdown.credit += credit;
      Object.entries(paidAtSale.byMethod || {}).forEach(([paidMethod, amount]) => addPaymentBreakdown(salesBreakdown, paidMethod, amount));
      cogs += saleCogsForItems(sale.items);
      addStaff(sale.User, {
        sales: sale.total,
        creditSales: credit,
        ...Object.entries(paidAtSale.byMethod || {}).reduce((values, [paidMethod, amount]) => ({ ...values, ...staffSalesValues(paidMethod, amount) }), {}),
      });
      const customer = addCustomer(sale.customer);
      customer.creditSales += credit;
      if (paid > 0 && method !== "credit") customer.cashSales += paid;
      customer.currentBalance = Number(sale.customer?.balance || customer.currentBalance || 0);
      customer.transactions.push({ id: sale.id, type: "SALE", reference: sale.receiptNo, date: sale.createdAt, amount: sale.total, creditAmount: credit, paymentMethod: method, staff: userLabel(sale.User) });
      transactionRows.push({ id: sale.id, kind: "credit-sale", date: sale.createdAt, reference: sale.receiptNo, customer: sale.customer?.name || "Unknown customer", customerId: sale.customerId, staff: userLabel(sale.User), staffId: sale.User?.id, branch: sale.branch?.name || "", amount: sale.total, creditAmount: credit, paymentMethod: method, status: sale.paymentStatus, items: sale.items.map((item) => ({ productId: item.product?.id, product: item.product?.name, quantity: item.quantity, unitPrice: item.price, total: item.total, cost: saleLineCogs(item) })) });
    }

    const saleReferences = new Set([...sales, ...creditSales].map((sale) => sale.receiptNo));
    let debtCollections = 0;
    for (const payment of payments) {
      if (isPaidAtSaleCustomerPayment(payment)) continue;
      const method = normalizedPaymentMethod(payment.paymentMethod);
      if (requestedMethod && method !== requestedMethod) continue;
      debtCollections += Number(payment.amount || 0);
      const customer = addCustomer(payment.customer);
      customer.payments += Number(payment.amount || 0);
      customer.transactions.push({ id: payment.id, type: "PAYMENT", reference: payment.reference || payment.id, date: payment.createdAt, amount: payment.amount, paymentMethod: method });
      transactionRows.push({ id: payment.id, kind: "collection", date: payment.createdAt, reference: payment.reference || payment.id, customer: payment.customer?.name || "Unknown customer", customerId: payment.customerId, amount: payment.amount, paymentMethod: method, staff: "Recorded payment", transactionId: payment.transactionId });
    }

    let cashExpenses = 0;
    let otherCashIn = 0;
    let otherCashOut = 0;
    for (const expense of expenses) {
      const method = normalizedPaymentMethod(expense.paymentMethod);
      if (method === "cash") cashExpenses += Number(expense.amount || 0);
      transactionRows.push({ id: expense.id, kind: "expense", date: expense.date, reference: expense.reference || expense.id, category: expense.category, description: expense.description, paymentMethod: method, account: expense.cashAccount?.name || "", staff: userLabel(expense.User), staffId: expense.User?.id, amount: expense.amount });
    }

    const allowedCashAccountId = !scope.canAccessAllBranches ? req.user?.cashAccountId : null;
    const cashTransactions = await prisma.cashTransaction.findMany({
      where: { tenantId: scope.tenantId, createdAt: dateWhere, account: { type: { in: ["cash", "safe"] }, ...(allowedCashAccountId ? { id: allowedCashAccountId } : {}) }, ...(userId ? { userId } : {}) },
      include: { account: { select: { id: true, name: true, type: true } }, User: { select: { id: true, fname: true, lname: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take,
    });
    const knownReferences = new Set([
      ...saleReferences,
      ...payments.flatMap((payment) => [payment.id, payment.reference, payment.transactionId, payment.sale?.receiptNo].filter(Boolean)),
      ...expenses.map((expense) => expense.reference || expense.id),
    ]);
    for (const movement of cashTransactions) {
      if (knownReferences.has(movement.reference)) continue;
      const type = String(movement.type || "").toLowerCase();
      if (["income", "receipt", "deposit"].includes(type)) otherCashIn += Number(movement.amount || 0);
      if (["expense", "payment", "withdrawal"].includes(type)) otherCashOut += Number(movement.amount || 0);
      transactionRows.push({ id: movement.id, kind: type.includes("transfer") ? "transfer" : "cash-movement", date: movement.createdAt, reference: movement.reference || movement.id, description: movement.description, account: movement.account?.name, staff: userLabel(movement.User), staffId: movement.User?.id, amount: movement.amount, direction: ["income", "receipt", "deposit"].includes(type) ? "in" : "out" });
    }

    for (const item of [...products, ...creditProducts]) {
      const row = productMap.get(item.product.id) || { id: item.product.id, name: item.product.name, sku: item.product.sku, quantitySold: 0, salesValue: 0, cogs: 0, currentStock: item.product.quantity };
      row.quantitySold += Number(item.quantity || 0);
      row.salesValue += Number(item.total || 0);
      row.cogs += saleLineCogs(item);
      productMap.set(item.product.id, row);
    }

    const cashSales = salesBreakdown.cash;
    const cashCollections = payments.filter((payment) => !isPaidAtSaleCustomerPayment(payment) && normalizedPaymentMethod(payment.paymentMethod) === "cash").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const openingRows = await prisma.cashTransaction.findMany({ where: { tenantId: scope.tenantId, createdAt: { lt: start }, account: { type: { in: ["cash", "safe"] }, ...(allowedCashAccountId ? { id: allowedCashAccountId } : {}) } }, orderBy: { createdAt: "desc" }, distinct: ["accountId"], select: { accountId: true, balanceAfter: true } });
    const openingCash = openingRows.reduce((sum, row) => sum + Number(row.balanceAfter || 0), 0);
    const expectedCash = openingCash + cashSales + cashCollections + otherCashIn - cashExpenses - otherCashOut;
    const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const revenue = netRevenue;
    const grossProfit = revenue - cogs;

    res.json({
      header: { date: start.toISOString().slice(0, 10), branch: scope.branch?.name || "All authorized branches", status: "Open" },
      filters: { from: start.toISOString(), to: end.toISOString(), branchId: scope.branchId || "all", userId, customerId, paymentMethod: req.query.paymentMethod || "all" },
      note: "Credit sales include credit invoices only. Credit/debit notes are adjustments and are reported separately.",
      reportNotes: [
        "Credit sales include credit invoices only. Credit notes and debit notes are adjustments and are reported separately.",
      ],
      summary: { totalSales, grossSales: totalSales, taxCollected, revenue, cashSales, creditSales: salesBreakdown.credit, mobileMoneySales: salesBreakdown.mobile_money, bankSales: salesBreakdown.bank, cardSales: salesBreakdown.card, debtCollections, cashReceived: cashSales + cashCollections + otherCashIn, expenses: expensesTotal },
      cashMovement: { openingCash, cashSales, debtCollections, cashCollections, otherCashIn, cashExpenses, otherCashOut, cashTransfersIn: 0, cashTransfersOut: 0, expectedCash },
      profitability: { grossSales: totalSales, taxCollected, revenue, cogs, grossProfit, expenses: expensesTotal, netProfit: grossProfit - expensesTotal },
      customerActivity: [...customerMap.values()].sort((a, b) => (b.cashSales + b.creditSales + b.payments) - (a.cashSales + a.creditSales + a.payments)),
      staffActivity: [...staffMap.values()].sort((a, b) => b.sales - a.sales),
      productActivity: [...productMap.values()].sort((a, b) => b.salesValue - a.salesValue),
      expenses: expenses.map((expense) => ({ id: expense.id, date: expense.date, reference: expense.reference || expense.id, category: expense.category, description: expense.description, paymentMethod: normalizedPaymentMethod(expense.paymentMethod), account: expense.cashAccount?.name || "", staff: userLabel(expense.User), amount: expense.amount })),
      transactions: transactionRows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      staffTills: cashAccounts.map((account) => ({ id: account.id, name: account.name, type: account.type, balance: account.balance })),
      branches,
      pagination: { returned: transactionRows.length, limit: take },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Daily business report error:", err);
    handleBranchError(res, err);
  }
});

// ==================== SALES REPORTS ====================
router.get("/sales/summary", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [agg, recordAgg, count, recordCount] = await Promise.all([
      prisma.sale.aggregate({ where, _sum: { total: true, discount: true, tax: true, subtotal: true }, _avg: { total: true } }),
      prisma.saleRecord.aggregate({ where, _sum: { total: true, discount: true, tax: true, subtotal: true }, _avg: { total: true } }),
      prisma.sale.count({ where }),
      prisma.saleRecord.count({ where }),
    ]);
    const totalCount = count + recordCount;
    const grossSales = Number(agg._sum.total || 0) + Number(recordAgg._sum.total || 0);
    const totalRevenue = aggregateNetRevenue(agg) + aggregateNetRevenue(recordAgg);
    res.json({ count: totalCount, grossSales, totalRevenue, totalSubtotal: (agg._sum.subtotal || 0) + (recordAgg._sum.subtotal || 0), totalDiscount: (agg._sum.discount || 0) + (recordAgg._sum.discount || 0), totalTax: (agg._sum.tax || 0) + (recordAgg._sum.tax || 0), avgSale: totalCount ? totalRevenue / totalCount : 0, avgGrossSale: totalCount ? grossSales / totalCount : 0 });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/daily", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ 
        where,
        include: { items: { include: { product: { select: { cost: true } } } } },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.saleRecord.findMany({ 
        where,
        include: { items: { include: { product: { select: { cost: true } } } } },
        orderBy: { createdAt: 'asc' }
      }),
    ]);
    
    // Combine and normalize status field, then transform
    const allSales = [...sales, ...saleRecords].map(sale => ({
      ...sale,
      grossSales: Number(sale.total || 0),
      revenue: saleNetRevenue(sale),
      status: saleStatus(sale)
    })).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const enriched = transformSalesData(allSales);
    const summary = allSales.reduce((result, sale) => {
      const total = Number(sale.total || 0);
      const revenue = saleNetRevenue(sale);
      const method = normalizedPaymentMethod(sale.paymentMethod);
      const paid = sale.amountPaid === undefined || sale.amountPaid === null ? total : Math.min(total, Number(sale.amountPaid || 0));
      const credit = sale.paymentStatus || sale.customerId ? Math.max(0, total - paid) : 0;
      const cogs = saleCogs(sale);

      result.totalSales += 1;
      result.grossSales += total;
      result.totalRevenue += revenue;
      result.totalTax += Number(sale.tax || 0);
      result.totalCogs += cogs;
      result.cashSales += sale.paymentStatus ? (method === 'cash' ? paid : 0) : (method === 'cash' ? total : 0);
      result.creditSales += credit;
      result.mobileMoneySales += sale.paymentStatus ? (method === 'mobile_money' ? paid : 0) : (method === 'mobile_money' ? total : 0);
      result.bankSales += sale.paymentStatus ? (method === 'bank' ? paid : 0) : (method === 'bank' ? total : 0);
      result.cardSales += sale.paymentStatus ? (method === 'card' ? paid : 0) : (method === 'card' ? total : 0);
      return result;
    }, { totalSales: 0, grossSales: 0, totalRevenue: 0, totalTax: 0, totalCogs: 0, cashSales: 0, creditSales: 0, mobileMoneySales: 0, bankSales: 0, cardSales: 0 });
    summary.grossProfit = summary.totalRevenue - summary.totalCogs;
    enriched.summary = { ...(enriched.summary || {}), ...summary };
    res.json(enriched);
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/weekly", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, select: { id: true, receiptNo: true, total: true, discount: true, tax: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.saleRecord.findMany({ where, select: { id: true, receiptNo: true, total: true, discount: true, tax: true, paymentStatus: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const allSales = [...sales, ...saleRecords].map(sale => ({
      ...sale,
      grossSales: Number(sale.total || 0),
      revenue: saleNetRevenue(sale),
      status: saleStatus(sale)
    })).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const enriched = transformSalesData(allSales);
    enriched.title = 'Weekly Sales Report';
    res.json(enriched);
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/monthly", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, select: { id: true, receiptNo: true, total: true, discount: true, tax: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.saleRecord.findMany({ where, select: { id: true, receiptNo: true, total: true, discount: true, tax: true, paymentStatus: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const allSales = [...sales, ...saleRecords].map(sale => ({
      ...sale,
      grossSales: Number(sale.total || 0),
      revenue: saleNetRevenue(sale),
      status: saleStatus(sale)
    })).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const enriched = transformSalesData(allSales);
    enriched.title = 'Monthly Sales Report';
    res.json(enriched);
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-product", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: true } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, cost: 0, profit: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].cost += saleLineCogs(item);
        map[name].profit = map[name].revenue - map[name].cost;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-category", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: { include: { category: true } } } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: { include: { category: true } } } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
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
    const records = await prisma.saleRecord.findMany({ where: scopedSaleWhere(req, s), include: { customer: true } });
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
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { user: { select: { fname: true, lname: true } } } }),
      prisma.saleRecord.findMany({ where, include: { User: { select: { fname: true, lname: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      const u = sale.user || sale.User;
      const name = `${u?.fname || ""} ${u?.lname || ""}`.trim() || "Unknown";
      if (!map[name]) map[name] = { user: name, count: 0, revenue: 0, discount: 0 };
      map[name].count++; map[name].revenue += sale.total; map[name].discount += sale.discount || 0;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/by-branch", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { branch: { select: { name: true } } } }),
      prisma.saleRecord.findMany({ where, include: { branch: { select: { name: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      const name = sale.branch?.name || "Unassigned";
      if (!map[name]) map[name] = { branch: name, count: 0, revenue: 0, discount: 0 };
      map[name].count++; map[name].revenue += sale.total; map[name].discount += sale.discount || 0;
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/discounts", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const discountWhere = { ...df(req), OR: [{ discount: { gt: 0 } }, { cashDiscount: { gt: 0 } }] };
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({
        where: scopedSaleWhere(req, s, discountWhere),
        include: {
          items: { include: { product: { select: { name: true } } } },
          user: { select: { fname: true, lname: true } },
          branch: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.saleRecord.findMany({
        where: scopedSaleWhere(req, s, discountWhere),
        include: {
          items: { include: { product: { select: { name: true } } } },
          User: { select: { fname: true, lname: true } },
          branch: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const discountedRecords = [...sales, ...saleRecords].filter((sale) => {
      const invoiceDiscount = Number(sale.discount || 0) + Number(sale.cashDiscount || 0);
      const lineDiscount = (sale.items || []).reduce((sum, item) => sum + Number(item.discount || 0) + Number(item.cashDiscount || 0), 0);
      return invoiceDiscount > 0 || lineDiscount > 0;
    });

    const byUser = {};
    const byBranch = {};
    const byProduct = {};
    const byDate = {};
    const data = discountedRecords.map((sale) => {
      const userName = `${sale.user?.fname || sale.User?.fname || ""} ${sale.user?.lname || sale.User?.lname || ""}`.trim() || "Unknown";
      const branchName = sale.branch?.name || "Unassigned";
      const date = new Date(sale.createdAt).toISOString().slice(0, 10);
      const invoiceDiscount = Number(sale.discount || 0) + Number(sale.cashDiscount || 0);
      const lineDiscount = (sale.items || []).reduce((sum, item) => sum + Number(item.discount || 0) + Number(item.cashDiscount || 0), 0);
      const totalDiscount = invoiceDiscount + lineDiscount;
      const productNames = (sale.items || []).filter((item) => (Number(item.discount || 0) + Number(item.cashDiscount || 0)) > 0).map((item) => item.product?.name || "Unknown");

      byUser[userName] = (byUser[userName] || 0) + totalDiscount;
      byBranch[branchName] = (byBranch[branchName] || 0) + totalDiscount;
      byDate[date] = (byDate[date] || 0) + totalDiscount;
      productNames.forEach((pName) => {
        byProduct[pName] = (byProduct[pName] || 0) + totalDiscount / Math.max(1, productNames.length);
      });

      return {
        receiptNo: sale.receiptNo,
        status: sale.status,
        discount: totalDiscount,
        total: sale.total,
        user: userName,
        branch: branchName,
        date,
        product: productNames.length ? productNames.join(", ") : "—",
      };
    });

    const totalDiscount = data.reduce((a, x) => a + x.discount, 0);
    res.json({
      data,
      summary: {
        count: data.length,
        totalDiscount,
        grossSales: discountedRecords.reduce((a, x) => a + Number(x.subtotal || 0), 0),
        netSales: discountedRecords.reduce((a, x) => a + Number(x.total || 0), 0),
        byUser,
        byBranch,
        byProduct,
        byDate,
      },
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/sales/returns", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const returns = await prisma.saleReturn.findMany({
      where: scopedWhere(s, {
        ...df(req),
        saleId: { not: null },
        status: "completed",
        refundMethod: { not: "credit_note_stock" },
      }),
      select: {
        id: true,
        returnNo: true,
        total: true,
        reason: true,
        refundMethod: true,
        createdAt: true,
        items: { select: { quantity: true, product: { select: { name: true } } } },
        sale: { select: { receiptNo: true, customerName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    
    const allReturns = returns.map((ret) => ({
      id: ret.id,
      receiptNo: ret.returnNo,
      originalReceiptNo: ret.sale?.receiptNo,
      total: ret.total,
      revenue: ret.total,
      tax: 0,
      discount: 0,
      paymentMethod: ret.refundMethod,
      status: "Returned",
      createdAt: ret.createdAt,
      itemCount: ret.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      items: ret.items.map((item) => item.product?.name).filter(Boolean).join(", "),
      customerName: ret.sale?.customerName || "Walk-in Customer",
      reason: ret.reason || "",
    }));
    
    const enriched = transformSalesData(allReturns);
    enriched.title = 'Returns & Refunds Report';
    res.json(enriched);
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
    const products = await prisma.product.findMany({
      where: scopedWhere(s, { quantity: { lte: 0 }, itemType: { not: "service" } }),
      include: { category: true, branch: { select: { name: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    const data = products.map((p) => ({
      name: p.name,
      sku: p.sku || "",
      category: p.category?.name || "Uncategorized",
      quantity: p.quantity,
      minStock: p.minStock,
      cost: p.cost || 0,
      price: p.price || 0,
      stockValue: Number(p.cost || 0) * Number(p.quantity || 0),
      branch: p.branch?.name || "Unassigned",
      status: p.isActive ? "Active" : "Inactive",
      updatedAt: p.updatedAt,
    }));
    res.json({ data, summary: { count: data.length, activeOutOfStock: data.filter((p) => p.status === "Active").length } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/inventory/stock-movement", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [sales, purchases] = await Promise.all([
      prisma.saleItem.findMany({ where: { sale: scopedSaleWhere(req, s) }, include: { product: { select: { name: true, id: true } }, sale: { select: { receiptNo: true, createdAt: true, id: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.purchaseItem.findMany({ where: { purchase: scopedWhere(s, df(req)) }, include: { product: { select: { name: true, id: true } }, purchase: { select: { refNo: true, createdAt: true, id: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    const movements = [
      ...sales.map((i) => ({
        id: `sale-${i.sale?.id}-${i.product?.id}`,
        date: i.createdAt,
        type: 'Stock Out',
        product: i.product?.name || 'Unknown',
        quantity: i.quantity,
        receiptNo: i.sale?.receiptNo,
        reference: i.sale?.receiptNo,
        isInbound: false,
      })),
      ...purchases.map((i) => ({
        id: `purchase-${i.purchase?.id}-${i.product?.id}`,
        date: i.createdAt,
        type: 'Stock In',
        product: i.product?.name || 'Unknown',
        quantity: i.quantity,
        receiptNo: i.purchase?.refNo,
        reference: i.purchase?.refNo,
        isInbound: true,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const enriched = transformInventoryMovementData(movements);
    res.json(enriched);
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
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: true } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
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
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: true } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: true } } } }),
    ]);
    const soldMap = {};
    [...sales, ...saleRecords].forEach((sale) => {
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

    const saleScope = saleVisibilityFilter(req);
    const curWhere = scopedWhere(s, { createdAt: { gte: curStart, lt: curEnd }, ...saleScope });
    const prevWhere = scopedWhere(s, { createdAt: { gte: prevStart, lt: prevEnd }, ...saleScope });
    const curExpWhere = scopedExpenseWhere(s, expenseDateWhere({ gte: curStart, lt: curEnd }));
    const prevExpWhere = scopedExpenseWhere(s, expenseDateWhere({ gte: prevStart, lt: prevEnd }));

    const [salesAgg, saleRecordAgg, expensesAgg, salesCount, saleRecordCount, salesWithItems, saleRecordsWithItems,
           prevSalesAgg, prevSaleRecordAgg, prevExpensesAgg, prevSalesCount, prevSaleRecordCount, prevSalesWithItems, prevSaleRecordsWithItems] = await Promise.all([
      prisma.sale.aggregate({ where: curWhere, _sum: { total: true, discount: true, tax: true } }),
      prisma.saleRecord.aggregate({ where: curWhere, _sum: { total: true, discount: true, tax: true } }),
      prisma.expense.aggregate({ where: curExpWhere, _sum: { amount: true } }),
      prisma.sale.count({ where: curWhere }),
      prisma.saleRecord.count({ where: curWhere }),
      prisma.sale.findMany({ where: curWhere, select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } } }),
      prisma.saleRecord.findMany({ where: curWhere, select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } } }),
      prisma.sale.aggregate({ where: prevWhere, _sum: { total: true, discount: true, tax: true } }),
      prisma.saleRecord.aggregate({ where: prevWhere, _sum: { total: true, discount: true, tax: true } }),
      prisma.expense.aggregate({ where: prevExpWhere, _sum: { amount: true } }),
      prisma.sale.count({ where: prevWhere }),
      prisma.saleRecord.count({ where: prevWhere }),
      prisma.sale.findMany({ where: prevWhere, select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } } }),
      prisma.saleRecord.findMany({ where: prevWhere, select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } } }),
    ]);

    const revenue = aggregateNetRevenue(salesAgg) + aggregateNetRevenue(saleRecordAgg);
    const cogs = [...salesWithItems, ...saleRecordsWithItems].reduce((sum, sale) => sum + saleCogs(sale), 0);
    const expenses = expensesAgg._sum.amount || 0;
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses;

    // Previous period
    const prevRevenue = aggregateNetRevenue(prevSalesAgg) + aggregateNetRevenue(prevSaleRecordAgg);
    const prevCogs = [...prevSalesWithItems, ...prevSaleRecordsWithItems].reduce((sum, sale) => sum + saleCogs(sale), 0);
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
      totalDiscount: (salesAgg._sum.discount || 0) + (saleRecordAgg._sum.discount || 0),
      totalTax: (salesAgg._sum.tax || 0) + (saleRecordAgg._sum.tax || 0),
      salesCount: salesCount + saleRecordCount,
      grossMargin, netMargin,
      previous: {
        revenue: prevRevenue, cogs: prevCogs, grossProfit: prevGrossProfit,
        expenses: prevExpenses, netProfit: prevNetProfit, salesCount: prevSalesCount + prevSaleRecordCount,
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
    const saleWhere = scopedSaleWhere(req, s);
    const [salesAgg, saleRecordAgg, customerPayments] = await Promise.all([
      prisma.sale.aggregate({ where: saleWhere, _sum: { total: true, tax: true } }),
      prisma.saleRecord.aggregate({ where: saleWhere, _sum: { total: true, tax: true } }),
      prisma.customerPayment.aggregate({ where: scopedWhere(s, df(req)), _sum: { amount: true } }),
    ]);
    const posSalesRevenue = aggregateNetRevenue(salesAgg);
    const receivableSalesRevenue = aggregateNetRevenue(saleRecordAgg);
    const salesRevenue = posSalesRevenue + receivableSalesRevenue;
    const grossSales = Number(salesAgg._sum.total || 0) + Number(saleRecordAgg._sum.total || 0);
    const totalTax = Number(salesAgg._sum.tax || 0) + Number(saleRecordAgg._sum.tax || 0);
    res.json({
      salesRevenue,
      posSalesRevenue,
      receivableSalesRevenue,
      grossSales,
      totalTax,
      customerPayments: customerPayments._sum.amount || 0,
      customerCollections: customerPayments._sum.amount || 0,
      totalIncome: salesRevenue,
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/expense", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const expenses = await prisma.expense.findMany({ where: scopedExpenseWhere(s, expenseDateWhere(dateRangeFromQuery(req))), include: { User: { select: { fname: true, lname: true, name: true } }, branch: { select: { name: true } }, cashAccount: { select: { name: true, type: true } } }, orderBy: { date: "asc" } });
    const enriched = transformExpenseData(expenses.map((expense) => ({
      ...expense,
      user: expense.User,
      branchName: expense.branch?.name || "Unassigned",
      accountName: expense.cashAccount?.name || expense.paymentMethod,
    })));
    res.json(enriched);
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/cash-flow", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const cashTransactions = await prisma.cashTransaction.findMany({
      where: { tenantId: s.tenantId, ...df(req) },
      select: { type: true, amount: true },
    });
    const details = { sales: 0, customerPayments: 0, otherInflows: 0, purchases: 0, expenses: 0, supplierPayments: 0, otherOutflows: 0, transfersIn: 0, transfersOut: 0 };
    for (const movement of cashTransactions) {
      const amount = Number(movement.amount || 0);
      const type = String(movement.type || "").toLowerCase();
      const direction = cashMovementDirection(type);
      if (direction === "transfer-in") details.transfersIn += amount;
      else if (direction === "transfer-out") details.transfersOut += amount;
      else if (direction === "in") {
        if (type === "sale") details.sales += amount;
        else if (type === "receipt" || type === "collection") details.customerPayments += amount;
        else details.otherInflows += amount;
      } else {
        if (type === "expense") details.expenses += amount;
        else if (type === "purchase") details.purchases += amount;
        else if (type === "payment") details.supplierPayments += amount;
        else details.otherOutflows += amount;
      }
    }
    const inflow = details.sales + details.customerPayments + details.otherInflows;
    const outflow = details.purchases + details.expenses + details.supplierPayments + details.otherOutflows;
    res.json({ inflow, outflow, netCashFlow: inflow - outflow, transfersIn: details.transfersIn, transfersOut: details.transfersOut, netAccountMovement: inflow + details.transfersIn - outflow - details.transfersOut, details });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/trial-balance", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const saleWhere = scopedSaleWhere(req, s);
    const [salesAgg, saleRecordAgg, expensesAgg, products, customerBalances, supplierBalances, cashAccounts, salesWithItems, saleRecordsWithItems, taxPaymentsAgg] = await Promise.all([
      prisma.sale.aggregate({ where: saleWhere, _sum: { total: true, tax: true } }),
      prisma.saleRecord.aggregate({ where: saleWhere, _sum: { total: true, tax: true } }),
      prisma.expense.aggregate({ where: scopedExpenseWhere(s, expenseDateWhere(dateRangeFromQuery(req))), _sum: { amount: true } }),
      prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), select: { quantity: true, cost: true } }),
      prisma.customer.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.supplier.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
      prisma.sale.findMany({
        where: saleWhere,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
      prisma.saleRecord.findMany({
        where: saleWhere,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
      prisma.taxPayment.aggregate({ where: scopedWhere(s, df(req, "dateOfPayment")), _sum: { amount: true } }),
    ]);
    const inventoryValue = products.reduce((sum, p) => sum + (p.cost || 0) * p.quantity, 0);
    const cogs = [...salesWithItems, ...saleRecordsWithItems].reduce((sum, sale) => sum + saleCogs(sale), 0);
    const salesRevenue = aggregateNetRevenue(salesAgg) + aggregateNetRevenue(saleRecordAgg);
    const taxCollected = Number(salesAgg._sum.tax || 0) + Number(saleRecordAgg._sum.tax || 0);
    const taxPayable = Math.max(0, taxCollected - Number(taxPaymentsAgg._sum.amount || 0));
    res.json({
      accounts: [
        { account: "Cash & Bank", debit: cashAccounts._sum.balance || 0, credit: 0 },
        { account: "Accounts Receivable", debit: customerBalances._sum.balance || 0, credit: 0 },
        { account: "Inventory", debit: inventoryValue, credit: 0 },
        { account: "Accounts Payable", debit: 0, credit: supplierBalances._sum.balance || 0 },
        { account: "Sales Revenue", debit: 0, credit: salesRevenue },
        { account: "Tax Payable", debit: 0, credit: taxPayable },
        { account: "Cost of Goods Sold", debit: cogs, credit: 0 },
        { account: "Operating Expenses", debit: expensesAgg._sum.amount || 0, credit: 0 },
      ],
    });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/balance-sheet", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const saleWhere = scopedWhere(s, saleVisibilityFilter(req));
    const [cashAccounts, customerBalances, products, supplierBalances, salesAgg, saleRecordAgg, expensesAgg, salesWithItems, saleRecordsWithItems, taxPaymentsAgg] = await Promise.all([
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
      prisma.customer.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), select: { quantity: true, cost: true } }),
      prisma.supplier.aggregate({ where: scopedWhere(s), _sum: { balance: true } }),
      prisma.sale.aggregate({ where: saleWhere, _sum: { total: true, tax: true } }),
      prisma.saleRecord.aggregate({ where: saleWhere, _sum: { total: true, tax: true } }),
      prisma.expense.aggregate({ where: scopedExpenseWhere(s), _sum: { amount: true } }),
      prisma.sale.findMany({
        where: saleWhere,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
      prisma.saleRecord.findMany({
        where: saleWhere,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
      prisma.taxPayment.aggregate({ where: scopedWhere(s), _sum: { amount: true } }),
    ]);
    const inventoryValue = products.reduce((sum, p) => sum + (p.cost || 0) * p.quantity, 0);
    const cogs = [...salesWithItems, ...saleRecordsWithItems].reduce((sum, sale) => sum + saleCogs(sale), 0);
    const salesRevenue = aggregateNetRevenue(salesAgg) + aggregateNetRevenue(saleRecordAgg);
    const taxCollected = Number(salesAgg._sum.tax || 0) + Number(saleRecordAgg._sum.tax || 0);
    const taxPayable = Math.max(0, taxCollected - Number(taxPaymentsAgg._sum.amount || 0));
    const retainedEarnings = salesRevenue - cogs - (expensesAgg._sum.amount || 0);
    const totalAssets = (cashAccounts._sum.balance || 0) + (customerBalances._sum.balance || 0) + inventoryValue;
    const totalLiabilities = (supplierBalances._sum.balance || 0) + taxPayable;
    res.json({
      assets: { cash: cashAccounts._sum.balance || 0, accountsReceivable: customerBalances._sum.balance || 0, inventory: inventoryValue, totalAssets },
      liabilities: { accountsPayable: supplierBalances._sum.balance || 0, taxPayable, totalLiabilities },
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
    const saleUserFilter = saleVisibilityFilter(req);
    const [sales, saleRecords, purchases, supplierPurchases, expenses, customerPayments, supplierPayments, creditNotes, debitNotes, saleReturns, openingCustomers, openingSuppliers] = await Promise.all([
      // POS sales
      prisma.sale.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter, ...saleUserFilter, ...(customerId ? { id: "__no_matching_cash_sale__" } : {}) }), select: { id: true, receiptNo: true, total: true, tax: true, paymentMethod: true, createdAt: true, items: { select: { quantity: true, total: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } }, orderBy: { createdAt: "desc" } }),
      // Credit sales (SaleRecord)
      prisma.saleRecord.findMany({ where: scopedWhere(s, { ...df(req), ...customerFilter, ...branchFilter, ...saleUserFilter }), select: { id: true, receiptNo: true, total: true, tax: true, paymentMethod: true, createdAt: true, items: { select: { quantity: true, total: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } }, orderBy: { createdAt: "desc" } }),
      // Quick purchases
      prisma.purchase.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter }), select: { id: true, refNo: true, total: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      // Credit purchases (SupplierPurchase)
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter }), select: { id: true, refNo: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      // Expenses
      prisma.expense.findMany({ where: scopedExpenseWhere(s, { ...expenseDateWhere(dateRangeFromQuery(req)), ...branchFilter }), select: { id: true, category: true, amount: true, date: true, createdAt: true }, orderBy: { date: "desc" } }),
      // Customer payments
      prisma.customerPayment.findMany({ where: scopedWhere(s, { ...df(req), ...customerFilter, ...branchFilter }), select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      // Supplier payments
      prisma.supplierPayment.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter }), select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      // Credit notes
      prisma.creditNote.findMany({ where: scopedWhere(s, { ...df(req), ...customerFilter, ...branchFilter, ...saleUserFilter, status: { not: "cancelled" } }), select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      // Debit notes
      prisma.debitNote.findMany({ where: scopedWhere(s, { ...df(req), ...branchFilter, ...saleUserFilter, status: { not: "cancelled" } }), select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      // Sale returns
      prisma.saleReturn.findMany({ where: scopedWhere(s, { ...df(req), ...customerFilter, ...branchFilter, ...saleUserFilter, status: "completed" }), select: { id: true, returnNo: true, total: true, reason: true, refundMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      // Customer opening balances
      prisma.customer.findMany({ where: scopedWhere(s, { ...(customerId ? { id: customerId } : {}), ...branchFilter, openingBalance: { gt: 0 } }), select: { id: true, name: true, openingBalance: true, openingBalanceDate: true, createdAt: true }, orderBy: { name: "asc" } }),
      // Supplier opening balances
      prisma.supplier.findMany({ where: scopedWhere(s, { ...branchFilter, openingBalance: { gt: 0 } }), select: { id: true, name: true, openingBalance: true, openingBalanceDate: true, createdAt: true }, orderBy: { name: "asc" } }),
    ]);
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const entries = [
      // Customer opening balances: debit AR, credit opening balance equity
      ...openingCustomers.filter((x) => isWithinDateRange(openingBalanceDate(x), fromDate, toDate)).flatMap((x) => [
        { date: openingBalanceDate(x), account: "Accounts Receivable", description: `Customer Opening Balance - ${x.name}`, debit: positiveOpeningBalance(x), credit: 0 },
        { date: openingBalanceDate(x), account: "Opening Balance Equity", description: `Customer Opening Balance - ${x.name}`, debit: 0, credit: positiveOpeningBalance(x) },
      ]),
      // Supplier opening balances: credit AP, debit opening balance equity
      ...openingSuppliers.filter((x) => isWithinDateRange(openingBalanceDate(x), fromDate, toDate)).flatMap((x) => [
        { date: openingBalanceDate(x), account: "Opening Balance Equity", description: `Supplier Opening Balance - ${x.name}`, debit: positiveOpeningBalance(x), credit: 0 },
        { date: openingBalanceDate(x), account: "Accounts Payable", description: `Supplier Opening Balance - ${x.name}`, debit: 0, credit: positiveOpeningBalance(x) },
      ]),
      // POS Sales: credit Sales Revenue, debit COGS (perpetual inventory)
      ...sales.flatMap((x) => {
        const cogs = saleCogs(x);
        const grossAmount = Number(x.total || 0);
        const taxAmount = Number(x.tax || 0);
        const revenue = saleNetRevenue(x);
        return [
          { date: x.createdAt, account: normalizedPaymentMethod(x.paymentMethod) === "bank" ? "Bank" : "Cash", description: `Sale ${x.receiptNo}`, debit: grossAmount, credit: 0 },
          { date: x.createdAt, account: "Sales Revenue", description: `Sale ${x.receiptNo}`, debit: 0, credit: revenue },
          ...(taxAmount > 0 ? [{ date: x.createdAt, account: "Tax Payable", description: `Sale tax ${x.receiptNo}`, debit: 0, credit: taxAmount }] : []),
          { date: x.createdAt, account: "Cost of Goods Sold", description: `Sale ${x.receiptNo}`, debit: cogs, credit: 0 },
          { date: x.createdAt, account: "Inventory", description: `Inventory issued ${x.receiptNo}`, debit: 0, credit: cogs },
        ];
      }),
      // Credit Sales (SaleRecord): credit Sales Revenue, debit COGS + Accounts Receivable
      ...saleRecords.flatMap((x) => {
        const cogs = saleCogs(x);
        const grossAmount = Number(x.total || 0);
        const taxAmount = Number(x.tax || 0);
        const revenue = saleNetRevenue(x);
        return [
          { date: x.createdAt, account: "Accounts Receivable", description: `Credit Sale ${x.receiptNo}`, debit: grossAmount, credit: 0 },
          { date: x.createdAt, account: "Sales Revenue", description: `Credit Sale ${x.receiptNo}`, debit: 0, credit: revenue },
          ...(taxAmount > 0 ? [{ date: x.createdAt, account: "Tax Payable", description: `Credit sale tax ${x.receiptNo}`, debit: 0, credit: taxAmount }] : []),
          { date: x.createdAt, account: "Cost of Goods Sold", description: `Credit Sale ${x.receiptNo}`, debit: cogs, credit: 0 },
          { date: x.createdAt, account: "Inventory", description: `Inventory issued ${x.receiptNo}`, debit: 0, credit: cogs },
        ];
      }),
      // Quick Purchases: debit Inventory
      ...purchases.flatMap((x) => [
        { date: x.createdAt, account: "Inventory", description: `Purchase ${x.refNo || ""}`, debit: x.total, credit: 0 },
        { date: x.createdAt, account: normalizedPaymentMethod(x.paymentMethod) === "bank" ? "Bank" : "Cash", description: `Purchase payment ${x.refNo || ""}`, debit: 0, credit: x.total },
      ]),
      // Credit Purchases (SupplierPurchase): debit Inventory, credit Accounts Payable
      ...supplierPurchases.flatMap((x) => [
        { date: x.createdAt, account: "Inventory", description: `Supplier Purchase ${x.refNo || ""}`, debit: x.total, credit: 0 },
        { date: x.createdAt, account: "Accounts Payable", description: `Supplier Purchase ${x.refNo || ""}`, debit: 0, credit: x.total },
      ]),
      // Expenses: debit expense category, credit payment account
      ...expenses.flatMap((x) => [
        { date: x.date, account: x.category, description: "Expense", debit: x.amount, credit: 0 },
        { date: x.date, account: "Cash/Bank", description: "Expense payment", debit: 0, credit: x.amount },
      ]),
      // Customer payments: debit Cash, credit Accounts Receivable
      ...customerPayments.flatMap((x) => [
        { date: x.createdAt, account: "Cash", description: "Customer Payment", debit: x.amount, credit: 0 },
        { date: x.createdAt, account: "Accounts Receivable", description: "Customer Payment", debit: 0, credit: x.amount },
      ]),
      // Supplier payments: debit Accounts Payable, credit Cash
      ...supplierPayments.flatMap((x) => [
        { date: x.createdAt, account: "Accounts Payable", description: "Supplier Payment", debit: x.amount, credit: 0 },
        { date: x.createdAt, account: "Cash", description: "Supplier Payment", debit: 0, credit: x.amount },
      ]),
      // Credit notes are adjustment documents, not credit sales.
      ...creditNotes.flatMap((x) => [
        { date: x.createdAt, account: "Sales Allowances", description: `Credit Note Adjustment ${x.noteNo} (${x.reason})`, debit: x.amount, credit: 0 },
        { date: x.createdAt, account: "Accounts Receivable", description: `Credit Note Adjustment ${x.noteNo} (${x.reason})`, debit: 0, credit: x.amount },
      ]),
      // Debit notes are supplier adjustment documents, not purchases.
      ...debitNotes.flatMap((x) => [
        { date: x.createdAt, account: "Accounts Payable", description: `Debit Note Adjustment ${x.noteNo} (${x.reason})`, debit: x.amount, credit: 0 },
        { date: x.createdAt, account: "Purchase Returns & Allowances", description: `Debit Note Adjustment ${x.noteNo} (${x.reason})`, debit: 0, credit: x.amount },
      ]),
      // POS sale returns: debit Sales Returns (contra-revenue), credit the refund account.
      // Credit sale reductions are handled by credit notes above.
      ...saleReturns.flatMap((x) => [
        { date: x.createdAt, account: "Sales Returns", description: `Sales Return ${x.returnNo} (${x.reason || ""})`, debit: x.total, credit: 0 },
        { date: x.createdAt, account: paymentAccountLabel(x.refundMethod), description: `Sales Return ${x.returnNo}`, debit: 0, credit: x.total },
      ]),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ data: entries });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/bank-transactions", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const transactions = await prisma.cashTransaction.findMany({ where: { tenantId: s.tenantId, ...df(req), account: { type: "bank" } }, include: { account: { select: { name: true, type: true, balance: true } } }, orderBy: { createdAt: "asc" } });
    
    // Get opening balance from first transaction or account
    const openingBalance = transactions.length > 0 ? Number(transactions[0].account?.balance || 0) : 0;
    
    const enriched = transformCashFlowData({
      openingBalance,
      data: transactions.map(t => ({
        id: t.id,
        date: t.createdAt,
        type: t.type === 'income' ? 'Inflow' : 'Outflow',
        description: t.description || t.type,
        amount: t.amount,
        paymentMethod: t.account?.name || 'Bank',
        reference: t.reference || t.id.substring(0, 8),
      })),
    });
    res.json(enriched);
  } catch (err) { handleBranchError(res, err); }
});

router.get("/financial/tax", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const saleWhere = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where: saleWhere, select: { total: true, tax: true, discount: true, subtotal: true } }),
      prisma.saleRecord.findMany({ where: saleWhere, select: { total: true, tax: true, discount: true, subtotal: true } }),
    ]);
    const allSales = [...sales, ...saleRecords];
    const totalTax = allSales.reduce((a, x) => a + Number(x.tax || 0), 0);
    const grossSales = allSales.reduce((a, x) => a + Number(x.total || 0), 0);
    const totalRevenue = allSales.reduce((a, x) => a + saleNetRevenue(x), 0);
    const totalDiscount = allSales.reduce((a, x) => a + Number(x.discount || 0), 0);
    res.json({ grossSales, totalRevenue, totalTax, totalDiscount, salesCount: allSales.length, averageTaxRate: totalRevenue ? (totalTax / totalRevenue * 100).toFixed(2) : 0 });
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
    const records = await prisma.saleRecord.findMany({ where: scopedSaleWhere(req, s), include: { customer: true } });
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
    const customers = await prisma.customer.findMany({
      where: scopedWhere(s),
      include: { branch: { select: { name: true } } },
      orderBy: [{ balance: "desc" }, { name: "asc" }],
    });
    const rows = customers.map((customer) => ({
      id: customer.id,
      customer: customer.name,
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      branch: customer.branch?.name || "Unassigned",
      openingBalance: Number(customer.openingBalance || 0),
      creditLimit: Number(customer.creditLimit || 0),
      balance: Number(customer.balance || 0),
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    }));
    const enriched = enrichBalanceRows(rows, {
      title: "Customer Balance Report",
      entityType: "customer",
      entityKey: "customer",
      balanceLabel: "Customer Balance",
    });
    enriched.summary.totalOpeningBalance = rows.reduce((a, c) => a + c.openingBalance, 0);
    enriched.summary.customerCount = rows.length;
    res.json(enriched);
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/receivables", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [records, customers] = await Promise.all([
      prisma.saleRecord.findMany({ where: scopedSaleWhere(req, s, { balance: { gt: 0 } }), include: { customer: true }, orderBy: { createdAt: "desc" } }),
      prisma.customer.findMany({ where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }), select: { id: true, name: true, balance: true, openingBalance: true, openingBalanceDate: true, createdAt: true } }),
    ]);
    const saleBalanceByCustomer = new Map();
    records.forEach((r) => saleBalanceByCustomer.set(r.customerId, (saleBalanceByCustomer.get(r.customerId) || 0) + Number(r.balance || 0)));
    const openingRows = customers.map((c) => {
      const historicalBalance = Math.max(0, Number(c.balance || 0) - (saleBalanceByCustomer.get(c.id) || 0));
      return { customer: c.name, total: historicalBalance, amountPaid: 0, balance: historicalBalance, source: "Opening Balance", createdAt: openingBalanceDate(c) };
    }).filter((row) => row.balance > 0);
    const data = records.map((r) => ({ customer: r.customer?.name || "Walk-in", total: r.total, amountPaid: r.amountPaid, balance: r.balance }));
    const combined = [...openingRows, ...data];
    res.json({ data: combined, summary: { count: combined.length, totalReceivable: combined.reduce((a, r) => a + r.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/customers/top", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const records = await prisma.saleRecord.findMany({ where: scopedSaleWhere(req, s), include: { customer: true } });
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
    const custFilter = customerId ? { customerId } : {};
    const saleUserFilter = saleVisibilityFilter(req);
    const customerOpeningFilter = customerId ? { id: customerId } : { openingBalance: { gt: 0 } };

    let customer = null;
    if (customerId) {
      customer = await prisma.customer.findFirst({ where: scopedWhere(s, { id: customerId }) });
      if (!customer) return res.status(404).json({ error: "Customer not found" });
    }

    const [sales, payments, withdrawals, creditNotes, saleReturns, openingCustomers] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedSaleWhere(req, s, custFilter),
        orderBy: { createdAt: "asc" },
        select: { id: true, receiptNo: true, total: true, createdAt: true, paymentMethod: true, customer: { select: { id: true, name: true } } },
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(s, { ...custFilter, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, paymentMethod: true, reference: true, createdAt: true, customer: { select: { id: true, name: true } } },
      }),
      prisma.customerWithdrawal.findMany({
        where: scopedWhere(s, { ...custFilter, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, paymentMethod: true, reference: true, createdAt: true, customer: { select: { id: true, name: true } } },
      }),
      prisma.creditNote.findMany({
        where: scopedWhere(s, { ...custFilter, ...df(req), ...saleUserFilter, status: { not: "cancelled" } }),
        orderBy: { createdAt: "asc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true, customer: { select: { id: true, name: true } } },
      }),
      prisma.saleReturn.findMany({
        where: scopedWhere(s, { ...custFilter, ...df(req), ...saleUserFilter, status: "completed" }),
        orderBy: { createdAt: "asc" },
        select: { id: true, returnNo: true, total: true, reason: true, refundMethod: true, createdAt: true, customer: { select: { id: true, name: true } } },
      }),
      prisma.customer.findMany({
        where: scopedWhere(s, customerOpeningFilter),
        select: { id: true, name: true, phone: true, openingBalance: true, openingBalanceDate: true, openingBalanceNote: true, createdAt: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // Build ledger entries
    const entries = [];
    // Opening balance = sales - payments - credit notes - sale returns (all before date range)
    const [allSales, allPayments, allWithdrawals, allCreditNotes, allSaleReturns] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedWhere(s, { ...custFilter, ...saleUserFilter }),
        select: { total: true, createdAt: true },
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(s, { ...custFilter }),
        select: { amount: true, createdAt: true },
      }),
      prisma.customerWithdrawal.findMany({
        where: scopedWhere(s, { ...custFilter }),
        select: { amount: true, createdAt: true },
      }),
      prisma.creditNote.findMany({
        where: scopedWhere(s, { ...custFilter, ...saleUserFilter, status: { not: "cancelled" } }),
        select: { amount: true, createdAt: true },
      }),
      prisma.saleReturn.findMany({
        where: scopedWhere(s, { ...custFilter, ...saleUserFilter, status: "completed" }),
        select: { total: true, createdAt: true },
      }),
    ]);
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const openingBalance = (fromDate
      ? openingCustomers.filter((x) => new Date(openingBalanceDate(x)) < fromDate).reduce((a, x) => a + positiveOpeningBalance(x), 0) +
        allSales.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.total, 0) -
        allPayments.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0) -
        allCreditNotes.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0) -
        allSaleReturns.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.total, 0) +
        allWithdrawals.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0)
      : 0
    );

    for (const c of openingCustomers) {
      const amount = positiveOpeningBalance(c);
      const date = openingBalanceDate(c);
      if (amount > 0 && isWithinDateRange(date, fromDate, toDate)) {
        entries.push({
          date,
          refNo: "OPENING",
          type: "Opening Balance",
          description: customerId ? "Opening Balance" : `Opening Balance - ${c.name}`,
          debit: amount,
          credit: 0,
          balance: 0,
          isSystem: true,
          systemTransaction: true,
        });
      }
    }

    for (const sale of sales) {
      entries.push({
        date: sale.createdAt,
        refNo: sale.receiptNo,
        description: customerId ? "Sale" : `Sale — ${sale.customer?.name || 'Walk-in'}`,
        debit: sale.total,
        credit: 0,
        balance: 0,
      });
    }
    for (const payment of payments) {
      entries.push({
        date: payment.createdAt,
        refNo: payment.reference || payment.id.slice(-6),
        description: customerId ? "Payment" : `Payment — ${payment.customer?.name || 'N/A'}`,
        debit: 0,
        credit: payment.amount,
        balance: 0,
      });
    }
    for (const withdrawal of withdrawals) {
      entries.push({
        date: withdrawal.createdAt,
        refNo: withdrawal.reference || withdrawal.id.slice(-6),
        description: customerId ? "Withdrawal" : `Withdrawal — ${withdrawal.customer?.name || 'N/A'}`,
        debit: withdrawal.amount,
        credit: 0,
        balance: 0,
      });
    }
    for (const cn of creditNotes) {
      entries.push({
        date: cn.createdAt,
        refNo: cn.noteNo,
        description: `Credit Note — ${cn.customer?.name || 'N/A'} (${cn.reason})`,
        debit: 0,
        credit: cn.amount,
        balance: 0,
      });
    }
    for (const sr of saleReturns) {
      entries.push({
        date: sr.createdAt,
        refNo: sr.returnNo,
        description: `Sales Return — ${sr.customer?.name || 'N/A'} (${sr.refundMethod})`,
        debit: 0,
        credit: sr.total,
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
      customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone || "" } : null,
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

// Customer Statement — comprehensive bank statement with all transactions and running balance
router.get("/customers/statement", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { customerId } = req.query;
    if (!customerId) {
      const saleUserFilter = saleVisibilityFilter(req);
      const [customers, sales, payments, withdrawals, creditNotes, saleReturns] = await Promise.all([
        prisma.customer.findMany({ where: scopedWhere(s), orderBy: { name: "asc" } }),
        prisma.saleRecord.findMany({ where: scopedSaleWhere(req, s), include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
        prisma.customerPayment.findMany({ where: scopedWhere(s, df(req)), include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
        prisma.customerWithdrawal.findMany({ where: scopedWhere(s, df(req)), include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
        prisma.creditNote.findMany({ where: scopedWhere(s, { ...df(req), ...saleUserFilter, status: { not: "cancelled" } }), include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
        prisma.saleReturn.findMany({ where: scopedWhere(s, { ...df(req), ...saleUserFilter, status: "completed" }), include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
      ]);

      const transactions = [
        ...customers.filter((customer) => positiveOpeningBalance(customer) > 0).map((customer) => ({
          id: `opening-${customer.id}`,
          date: openingBalanceDate(customer),
          type: "Opening Balance",
          description: `Opening Balance - ${customer.name}`,
          debit: positiveOpeningBalance(customer),
          credit: 0,
          reference: "-",
          details: customer.openingBalanceNote || "-",
          paymentMethod: "-",
        })),
        ...sales.map((sale) => ({
          id: sale.id,
          date: sale.createdAt,
          type: "Sale",
          description: `Sale Invoice - ${sale.customer?.name || "Walk-in"}`,
          debit: Number(sale.total || 0),
          credit: 0,
          reference: sale.receiptNo,
          details: `Status: ${sale.paymentStatus}, Paid: ${sale.amountPaid}, Balance: ${sale.balance}`,
          paymentMethod: sale.paymentMethod || "-",
        })),
        ...payments.map((payment) => ({
          id: `payment-${payment.id}`,
          date: payment.createdAt,
          type: "Payment Received",
          description: `Payment Received - ${payment.customer?.name || "N/A"}`,
          debit: 0,
          credit: Number(payment.amount || 0),
          reference: payment.reference || payment.id.substring(0, 8),
          details: `Method: ${payment.paymentMethod}`,
          paymentMethod: payment.paymentMethod,
        })),
        ...withdrawals.map((withdrawal) => ({
          id: `withdrawal-${withdrawal.id}`,
          date: withdrawal.createdAt,
          type: "Withdrawal",
          description: `Customer Withdrawal - ${withdrawal.customer?.name || "N/A"}`,
          debit: Number(withdrawal.amount || 0),
          credit: 0,
          reference: withdrawal.reference || withdrawal.id.substring(0, 8),
          details: `Method: ${withdrawal.paymentMethod}`,
          paymentMethod: withdrawal.paymentMethod,
        })),
        ...creditNotes.map((cn) => ({
          id: `creditnote-${cn.id}`,
          date: cn.createdAt,
          type: "Credit Note",
          description: `Credit Adjustment - ${cn.customer?.name || "N/A"}`,
          debit: 0,
          credit: Number(cn.amount || 0),
          reference: cn.noteNo,
          details: `Reason: ${cn.reason}`,
          paymentMethod: "-",
        })),
        ...saleReturns.map((ret) => ({
          id: `return-${ret.id}`,
          date: ret.createdAt,
          type: "Return/Refund",
          description: `Sale Return - ${ret.customer?.name || "N/A"}`,
          debit: 0,
          credit: Number(ret.total || 0),
          reference: ret.returnNo,
          details: `Reason: ${ret.reason || "-"}, Refund: ${ret.refundMethod}`,
          paymentMethod: ret.refundMethod || "-",
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      let runningBalance = 0;
      transactions.forEach((txn) => {
        runningBalance += Number(txn.debit || 0) - Number(txn.credit || 0);
        txn.balance = runningBalance;
      });

      res.json({
        customer: { id: "all", name: "All Customers", phone: "", email: "" },
        generatedAt: new Date().toISOString(),
        summary: {
          openingBalance: customers.reduce((a, x) => a + positiveOpeningBalance(x), 0),
          totalSales: sales.reduce((a, x) => a + Number(x.total || 0), 0),
          totalPayments: payments.reduce((a, x) => a + Number(x.amount || 0), 0),
          totalWithdrawals: withdrawals.reduce((a, x) => a + Number(x.amount || 0), 0),
          totalCreditNotes: creditNotes.reduce((a, x) => a + Number(x.amount || 0), 0),
          totalSaleReturns: saleReturns.reduce((a, x) => a + Number(x.total || 0), 0),
          currentBalance: customers.reduce((a, x) => a + Number(x.balance || 0), 0),
          totalTransactions: transactions.length,
          customerCount: customers.length,
        },
        transactions,
      });
      return;
    }

    const customer = await prisma.customer.findFirst({ where: scopedWhere(s, { id: customerId }) });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const saleUserFilter = saleVisibilityFilter(req);
    const [sales, payments, withdrawals, creditNotes, saleReturns, discounts] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedSaleWhere(req, s, { customerId }),
        include: { items: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(s, { customerId, ...df(req) }),
        orderBy: { createdAt: "asc" },
      }),
      prisma.customerWithdrawal.findMany({
        where: scopedWhere(s, { customerId, ...df(req) }),
        orderBy: { createdAt: "asc" },
      }),
      prisma.creditNote.findMany({
        where: scopedWhere(s, { customerId, ...df(req), ...saleUserFilter, status: { not: "cancelled" } }),
        orderBy: { createdAt: "asc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true },
      }),
      prisma.saleReturn.findMany({
        where: scopedWhere(s, { customerId, ...df(req), ...saleUserFilter, status: "completed" }),
        orderBy: { createdAt: "asc" },
        select: { id: true, returnNo: true, total: true, reason: true, refundMethod: true, createdAt: true },
      }),
      prisma.saleRecord.findMany({
        where: scopedSaleWhere(req, s, { customerId, discount: { gt: 0 } }),
        select: { id: true, receiptNo: true, discount: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Compile all transactions chronologically
    const transactions = [];
    const openingBalanceAmount = positiveOpeningBalance(customer);
    
    // Add opening balance as first transaction
    if (openingBalanceAmount > 0) {
      transactions.push({
        id: `opening-${customer.id}`,
        date: openingBalanceDate(customer),
        type: "Opening Balance",
        description: "Opening Balance",
        debit: openingBalanceAmount,
        credit: 0,
        reference: "-",
        details: customer.openingBalanceNote || "-",
        paymentMethod: "-",
        relatedId: null,
      });
    }

    // Add sales as debits (charges)
    sales.forEach((sale) => {
      transactions.push({
        id: sale.id,
        date: sale.createdAt,
        type: "Sale",
        description: `Sale Invoice - ${sale.paymentStatus}`,
        debit: sale.total,
        credit: 0,
        reference: sale.receiptNo,
        details: `Status: ${sale.paymentStatus}, Paid: ${sale.amountPaid}, Balance: ${sale.balance}`,
        paymentMethod: sale.paymentMethod || "-",
        relatedId: sale.id,
      });
    });

    // Add discounts if any
    discounts.forEach((disc) => {
      transactions.push({
        id: `disc-${disc.id}`,
        date: disc.createdAt,
        type: "Discount",
        description: "Sale Discount",
        debit: 0,
        credit: disc.discount,
        reference: disc.receiptNo,
        details: `Discount applied on sale`,
        paymentMethod: "-",
        relatedId: disc.id,
      });
    });

    // Add payments as credits
    payments.forEach((payment) => {
      transactions.push({
        id: `payment-${payment.id}`,
        date: payment.createdAt,
        type: "Payment Received",
        description: "Payment Received",
        debit: 0,
        credit: payment.amount,
        reference: payment.reference || payment.id.substring(0, 8),
        details: `Method: ${payment.paymentMethod}`,
        paymentMethod: payment.paymentMethod,
        relatedId: payment.id,
      });
    });

    // Add withdrawals as debits
    withdrawals.forEach((withdrawal) => {
      transactions.push({
        id: `withdrawal-${withdrawal.id}`,
        date: withdrawal.createdAt,
        type: "Withdrawal",
        description: "Customer Withdrawal",
        debit: withdrawal.amount,
        credit: 0,
        reference: withdrawal.reference || withdrawal.id.substring(0, 8),
        details: `Method: ${withdrawal.paymentMethod}`,
        paymentMethod: withdrawal.paymentMethod,
        relatedId: withdrawal.id,
      });
    });

    // Add credit notes (allowances/adjustments)
    creditNotes.forEach((cn) => {
      transactions.push({
        id: `creditnote-${cn.id}`,
        date: cn.createdAt,
        type: "Credit Note",
        description: "Credit Adjustment",
        debit: 0,
        credit: cn.amount,
        reference: cn.noteNo,
        details: `Reason: ${cn.reason}`,
        paymentMethod: "-",
        relatedId: cn.id,
      });
    });

    // Add sale returns as credits
    saleReturns.forEach((ret) => {
      transactions.push({
        id: `return-${ret.id}`,
        date: ret.createdAt,
        type: "Return/Refund",
        description: "Sale Return",
        debit: 0,
        credit: ret.total,
        reference: ret.returnNo,
        details: `Reason: ${ret.reason}, Refund: ${ret.refundMethod}`,
        paymentMethod: ret.refundMethod || "-",
        relatedId: ret.id,
      });
    });

    // Sort by date
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balances - START with opening balance
    let runningBalance = openingBalanceAmount;
    transactions.forEach((txn) => {
      // Skip opening balance transaction in calculation (it's already in runningBalance)
      if (txn.type !== "Opening Balance") {
        runningBalance = runningBalance + txn.debit - txn.credit;
      }
      txn.balance = runningBalance;
    });

    const totalSales = sales.reduce((a, x) => a + x.total, 0);
    const totalPayments = payments.reduce((a, x) => a + x.amount, 0);
    const totalWithdrawals = withdrawals.reduce((a, x) => a + x.amount, 0);
    const totalCreditNotes = creditNotes.reduce((a, x) => a + x.amount, 0);
    const totalSaleReturns = saleReturns.reduce((a, x) => a + x.total, 0);
    const totalDiscounts = discounts.reduce((a, x) => a + x.discount, 0);
    const currentBalance = customer.balance || 0;

    res.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone || "", email: customer.email || "", address: customer.address || "" },
      generatedAt: new Date().toISOString(),
      summary: {
        openingBalance: openingBalanceAmount,
        totalSales,
        totalDiscounts,
        totalPayments,
        totalWithdrawals,
        totalCreditNotes,
        totalReturns: totalSaleReturns,
        currentBalance,
        totalTransactions: transactions.length,
        lastUpdated: customer.updatedAt,
      },
      transactions,
      // Legacy format for backward compatibility
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
      withdrawals: withdrawals.map((x) => ({
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
      saleReturns: saleReturns.map((x) => ({
        id: x.id,
        returnNo: x.returnNo,
        total: x.total,
        reason: x.reason,
        refundMethod: x.refundMethod,
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
      documentType: "Credit Note Adjustment",
      affectsCreditSales: false,
    }));
    res.json({
      data,
      summary: {
        count: data.length,
        totalAmount: data.reduce((a, x) => a + x.amount, 0),
        note: "Credit notes are receivable adjustments, not credit sales.",
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
    const [purchases, suppliers] = await Promise.all([
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, { ...df(req), balance: { gt: 0 } }), include: { supplier: true }, orderBy: { createdAt: "desc" } }),
      prisma.supplier.findMany({ where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }), select: { id: true, name: true, balance: true, openingBalance: true, openingBalanceDate: true, createdAt: true } }),
    ]);
    const purchaseBalanceBySupplier = new Map();
    purchases.forEach((p) => purchaseBalanceBySupplier.set(p.supplierId, (purchaseBalanceBySupplier.get(p.supplierId) || 0) + Number(p.balance || 0)));
    const openingRows = suppliers.map((sup) => {
      const historicalBalance = Math.max(0, Number(sup.balance || 0) - (purchaseBalanceBySupplier.get(sup.id) || 0));
      return { supplier: sup.name, total: historicalBalance, balance: historicalBalance, source: "Opening Balance", createdAt: openingBalanceDate(sup) };
    }).filter((row) => row.balance > 0);
    const data = purchases.map((p) => ({ supplier: p.supplier?.name || "Unknown", total: p.total, balance: p.balance, createdAt: p.createdAt }));
    const combined = [...openingRows, ...data];
    res.json({ data: combined, summary: { count: combined.length, totalPayable: combined.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/balance", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const suppliers = await prisma.supplier.findMany({
      where: scopedWhere(s),
      include: { branch: { select: { name: true } } },
      orderBy: [{ balance: "desc" }, { name: "asc" }],
    });
    const rows = suppliers.map((supplier) => ({
      id: supplier.id,
      supplier: supplier.name,
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      branch: supplier.branch?.name || "Unassigned",
      openingBalance: Number(supplier.openingBalance || 0),
      balance: Number(supplier.balance || 0),
      status: supplier.status,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    }));
    const enriched = enrichBalanceRows(rows, {
      title: "Supplier Balance Report",
      entityType: "supplier",
      entityKey: "supplier",
      balanceLabel: "Supplier Balance",
    });
    enriched.summary.totalOpeningBalance = rows.reduce((a, sup) => a + sup.openingBalance, 0);
    enriched.summary.supplierCount = rows.length;
    res.json(enriched);
  } catch (err) { handleBranchError(res, err); }
});

router.get("/suppliers/statement", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const { supplierId } = req.query;

    if (!supplierId) {
      const [suppliers, purchases, payments, debitNotes] = await Promise.all([
        prisma.supplier.findMany({ where: scopedWhere(s), orderBy: { name: "asc" } }),
        prisma.supplierPurchase.findMany({
          where: scopedWhere(s, df(req)),
          include: { supplier: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.supplierPayment.findMany({
          where: scopedWhere(s, df(req)),
          include: { supplier: { select: { id: true, name: true } }, purchase: { select: { id: true, refNo: true } } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.debitNote.findMany({
          where: scopedWhere(s, { ...df(req), status: { not: "cancelled" } }),
          include: { supplier: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      const transactions = [
        ...suppliers.filter((supplier) => positiveOpeningBalance(supplier) > 0).map((supplier) => ({
          id: `opening-${supplier.id}`,
          date: openingBalanceDate(supplier),
          type: "Opening Balance",
          description: `Opening Balance - ${supplier.name}`,
          debit: 0,
          credit: positiveOpeningBalance(supplier),
          reference: "-",
          details: supplier.openingBalanceNote || "-",
          paymentMethod: "-",
        })),
        ...purchases.map((purchase) => ({
          id: purchase.id,
          date: purchase.createdAt,
          type: "Purchase",
          description: `Purchase Bill - ${purchase.supplier?.name || "Unknown"}`,
          debit: 0,
          credit: Number(purchase.total || 0),
          reference: purchase.refNo || purchase.id.slice(-6),
          details: `Status: ${purchase.paymentStatus}, Paid: ${purchase.amountPaid}, Balance: ${purchase.balance}`,
          paymentMethod: "-",
        })),
        ...payments.map((payment) => ({
          id: `payment-${payment.id}`,
          date: payment.createdAt,
          type: "Payment Made",
          description: `Payment Made - ${payment.supplier?.name || "Unknown"}`,
          debit: Number(payment.amount || 0),
          credit: 0,
          reference: payment.reference || payment.purchase?.refNo || payment.id.substring(0, 8),
          details: `Method: ${payment.paymentMethod}`,
          paymentMethod: payment.paymentMethod,
        })),
        ...debitNotes.map((dn) => ({
          id: `debitnote-${dn.id}`,
          date: dn.createdAt,
          type: "Debit Note",
          description: `Debit Adjustment - ${dn.supplier?.name || "Unknown"}`,
          debit: Number(dn.amount || 0),
          credit: 0,
          reference: dn.noteNo,
          details: `Reason: ${dn.reason}`,
          paymentMethod: "-",
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      let runningBalance = 0;
      transactions.forEach((txn) => {
        runningBalance += Number(txn.credit || 0) - Number(txn.debit || 0);
        txn.balance = runningBalance;
      });

      res.json({
        supplier: { id: "all", name: "All Suppliers", phone: "", email: "" },
        generatedAt: new Date().toISOString(),
        summary: {
          openingBalance: suppliers.reduce((a, x) => a + positiveOpeningBalance(x), 0),
          totalPurchases: purchases.reduce((a, x) => a + Number(x.total || 0), 0),
          totalPayments: payments.reduce((a, x) => a + Number(x.amount || 0), 0),
          totalDebitNotes: debitNotes.reduce((a, x) => a + Number(x.amount || 0), 0),
          openBalance: runningBalance,
          currentBalance: suppliers.reduce((a, x) => a + Number(x.balance || 0), 0),
          totalTransactions: transactions.length,
          supplierCount: suppliers.length,
          purchaseCount: purchases.length,
          paymentCount: payments.length,
          debitNoteCount: debitNotes.length,
        },
        transactions,
      });
      return;
    }

    const [supplier, purchases, payments, debitNotes] = await Promise.all([
      prisma.supplier.findFirst({ where: scopedWhere(s, { id: supplierId }) }),
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s, { supplierId, ...df(req) }),
        include: { supplier: true, items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.supplierPayment.findMany({
        where: scopedWhere(s, { supplierId, ...df(req) }),
        include: { supplier: true, purchase: { select: { id: true, refNo: true } } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.debitNote.findMany({
        where: scopedWhere(s, { supplierId, ...df(req), status: { not: "cancelled" } }),
        orderBy: { createdAt: "desc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true },
      })
    ]);

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const stmtData = buildSupplierStatementData(supplier, purchases, payments);
    const totalDebitNotes = debitNotes.reduce((a, x) => a + x.amount, 0);
    const transactions = [];
    const openingBalanceAmount = positiveOpeningBalance(supplier);

    if (openingBalanceAmount > 0) {
      transactions.push({
        id: `opening-${supplier.id}`,
        date: openingBalanceDate(supplier),
        type: "Opening Balance",
        description: "Opening Balance",
        debit: 0,
        credit: openingBalanceAmount,
        reference: "-",
        details: supplier.openingBalanceNote || "-",
        paymentMethod: "-",
        relatedId: null,
      });
    }

    purchases.forEach((purchase) => {
      transactions.push({
        id: purchase.id,
        date: purchase.createdAt,
        type: "Purchase",
        description: "Purchase Bill",
        debit: 0,
        credit: Number(purchase.total || 0),
        reference: purchase.refNo || purchase.id.slice(-6),
        details: `Status: ${purchase.paymentStatus}, Paid: ${Number(purchase.amountPaid || 0)}, Balance: ${Number(purchase.balance || 0)}`,
        paymentMethod: "-",
        relatedId: purchase.id,
      });
    });

    payments.forEach((payment) => {
      transactions.push({
        id: `payment-${payment.id}`,
        date: payment.createdAt,
        type: "Payment Made",
        description: "Payment Made",
        debit: Number(payment.amount || 0),
        credit: 0,
        reference: payment.reference || payment.purchase?.refNo || payment.id.substring(0, 8),
        details: `Method: ${payment.paymentMethod}`,
        paymentMethod: payment.paymentMethod,
        relatedId: payment.id,
      });
    });

    debitNotes.forEach((dn) => {
      transactions.push({
        id: `debitnote-${dn.id}`,
        date: dn.createdAt,
        type: "Debit Note",
        description: "Debit Adjustment",
        debit: Number(dn.amount || 0),
        credit: 0,
        reference: dn.noteNo,
        details: `Reason: ${dn.reason}`,
        paymentMethod: "-",
        relatedId: dn.id,
      });
    });

    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = openingBalanceAmount;
    transactions.forEach((txn) => {
      if (txn.type !== "Opening Balance") {
        runningBalance = runningBalance + Number(txn.credit || 0) - Number(txn.debit || 0);
      }
      txn.balance = runningBalance;
    });

    res.json({
      ...stmtData,
      supplier: { ...stmtData.supplier, phone: supplier.phone || "", email: supplier.email || "" },
      summary: {
        ...stmtData.summary,
        totalDebitNotes,
        currentBalance: supplier.balance || 0,
        totalTransactions: transactions.length,
        debitNoteCount: debitNotes.length,
      },
      transactions,
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
    const supFilter = supplierId ? { supplierId } : {};
    const supplierOpeningFilter = supplierId ? { id: supplierId } : { openingBalance: { gt: 0 } };

    let supplier = null;
    if (supplierId) {
      supplier = await prisma.supplier.findFirst({ where: scopedWhere(s, { id: supplierId }) });
      if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    }

    const [purchases, payments, debitNotes, openingSuppliers] = await Promise.all([
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s, { ...supFilter, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, refNo: true, total: true, createdAt: true, supplier: { select: { id: true, name: true } } },
      }),
      prisma.supplierPayment.findMany({
        where: scopedWhere(s, { ...supFilter, ...df(req) }),
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, paymentMethod: true, reference: true, createdAt: true, supplier: { select: { id: true, name: true } } },
      }),
      prisma.debitNote.findMany({
        where: scopedWhere(s, { ...supFilter, ...df(req), status: { not: "cancelled" } }),
        orderBy: { createdAt: "asc" },
        select: { id: true, noteNo: true, amount: true, reason: true, createdAt: true, supplier: { select: { id: true, name: true } } },
      }),
      prisma.supplier.findMany({
        where: scopedWhere(s, supplierOpeningFilter),
        select: { id: true, name: true, phone: true, openingBalance: true, openingBalanceDate: true, openingBalanceNote: true, createdAt: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // Opening balance
    const [allPurchases, allPayments, allDebitNotes] = await Promise.all([
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s, { ...supFilter }),
        select: { total: true, createdAt: true },
      }),
      prisma.supplierPayment.findMany({
        where: scopedWhere(s, { ...supFilter }),
        select: { amount: true, createdAt: true },
      }),
      prisma.debitNote.findMany({
        where: scopedWhere(s, { ...supFilter, status: { not: "cancelled" } }),
        select: { amount: true, createdAt: true },
      }),
    ]);
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const openingBalance = fromDate
      ? openingSuppliers.filter((x) => new Date(openingBalanceDate(x)) < fromDate).reduce((a, x) => a + positiveOpeningBalance(x), 0) +
        allPurchases.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.total, 0) -
        allPayments.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0) -
        allDebitNotes.filter((x) => new Date(x.createdAt) < fromDate).reduce((a, x) => a + x.amount, 0)
      : 0;

    const entries = [];
    for (const sup of openingSuppliers) {
      const amount = positiveOpeningBalance(sup);
      const date = openingBalanceDate(sup);
      if (amount > 0 && isWithinDateRange(date, fromDate, toDate)) {
        entries.push({
          date,
          refNo: "OPENING",
          type: "Opening Balance",
          description: supplierId ? "Opening Balance" : `Opening Balance - ${sup.name}`,
          debit: 0,
          credit: amount,
          balance: 0,
          isSystem: true,
          systemTransaction: true,
        });
      }
    }
    for (const p of purchases) {
      entries.push({
        date: p.createdAt,
        refNo: p.refNo || p.id.slice(-6),
        description: supplierId ? "Purchase" : `Purchase — ${p.supplier?.name || 'N/A'}`,
        debit: 0,
        credit: p.total,
        balance: 0,
      });
    }
    for (const p of payments) {
      entries.push({
        date: p.createdAt,
        refNo: p.reference || p.id.slice(-6),
        description: supplierId ? "Payment" : `Payment — ${p.supplier?.name || 'N/A'}`,
        debit: p.amount,
        credit: 0,
        balance: 0,
      });
    }
    for (const dn of debitNotes) {
      entries.push({
        date: dn.createdAt,
        refNo: dn.noteNo,
        description: `Debit Note — ${dn.supplier?.name || 'N/A'} (${dn.reason})`,
        debit: dn.amount,
        credit: 0,
        balance: 0,
      });
    }

    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // For supplier ledger: balance = credit - debit (positive = we owe them)
    let bal = openingBalance;
    for (const e of entries) {
      bal += e.credit - e.debit;
      e.balance = bal;
    }

    res.json({
      supplier: supplier ? { id: supplier.id, name: supplier.name, phone: supplier.phone || "" } : null,
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
    const itemFilter = productId ? { where: { productId } } : {};
    const saleUserFilter = saleVisibilityFilter(req);

    let product = null;
    if (productId) {
      product = await prisma.product.findFirst({ where: scopedWhere(s, { id: productId }) });
      if (!product) return res.status(404).json({ error: "Product not found" });
    }

    const itemQuery = productId ? { where: { productId }, select: { quantity: true } } : { select: { quantity: true } };

    const [sales, saleRecords, purchases, supplierPurchases, adjustments, saleReturns] = await Promise.all([
      // POS sales
      prisma.sale.findMany({
        where: scopedWhere(s, { ...df(req), ...saleUserFilter }),
        select: { id: true, receiptNo: true, createdAt: true, items: itemQuery },
        orderBy: { createdAt: "asc" },
      }),
      // Credit sales (SaleRecord)
      prisma.saleRecord.findMany({
        where: scopedWhere(s, { ...df(req), ...saleUserFilter }),
        select: { id: true, receiptNo: true, createdAt: true, items: itemQuery },
        orderBy: { createdAt: "asc" },
      }),
      // Quick purchases
      prisma.purchase.findMany({
        where: scopedWhere(s, df(req)),
        select: { id: true, refNo: true, createdAt: true, items: itemQuery },
        orderBy: { createdAt: "asc" },
      }),
      // Credit purchases (SupplierPurchase)
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s, df(req)),
        select: { id: true, refNo: true, createdAt: true, items: itemQuery },
        orderBy: { createdAt: "asc" },
      }),
      // Stock adjustments
      prisma.auditLog.findMany({
        where: productId ? { tenantId: s.tenantId, model: "Product", recordId: productId, ...df(req, "createdAt") } : { tenantId: s.tenantId, model: "Product", ...df(req, "createdAt") },
        orderBy: { createdAt: "asc" },
      }),
      // Sale returns (stock comes back in)
      prisma.saleReturn.findMany({
        where: scopedWhere(s, { ...df(req), ...saleUserFilter, status: { in: stockLedgerSaleReturnStatuses } }),
        select: { id: true, returnNo: true, createdAt: true, items: itemQuery },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const allAdjustmentWhere = productId
      ? { tenantId: s.tenantId, model: "Product", recordId: productId }
      : { tenantId: s.tenantId, model: "Product" };

    const [allSales, allSaleRecords, allPurchases, allSupplierPurchases, allSaleReturns, allAdjustments] = await Promise.all([
      prisma.sale.findMany({
        where: scopedWhere(s, saleUserFilter),
        select: { createdAt: true, items: itemQuery },
      }),
      prisma.saleRecord.findMany({
        where: scopedWhere(s, saleUserFilter),
        select: { createdAt: true, items: itemQuery },
      }),
      prisma.purchase.findMany({
        where: scopedWhere(s),
        select: { createdAt: true, items: itemQuery },
      }),
      prisma.supplierPurchase.findMany({
        where: scopedWhere(s),
        select: { createdAt: true, items: itemQuery },
      }),
      prisma.saleReturn.findMany({
        where: scopedWhere(s, { ...saleUserFilter, status: { in: stockLedgerSaleReturnStatuses } }),
        select: { createdAt: true, items: itemQuery },
      }),
      prisma.auditLog.findMany({
        where: allAdjustmentWhere,
        select: { createdAt: true, changes: true },
      }),
    ]);

    const { from } = req.query;
    const fromDate = from ? new Date(from) : null;
    const sumQtyBefore = (records, dateField = "createdAt") =>
      records.reduce((a, r) => a + (new Date(r[dateField]) < fromDate ? r.items.reduce((s, i) => s + i.quantity, 0) : 0), 0);
    const sumAdjustmentBefore = (logs) =>
      logs.reduce((sum, log) => {
        const beforeQty = Number(log.changes?.before?.quantity);
        const afterQty = Number(log.changes?.after?.quantity);
        if (!Number.isFinite(beforeQty) || !Number.isFinite(afterQty) || new Date(log.createdAt) >= fromDate) return sum;
        return sum + (afterQty - beforeQty);
      }, 0);
    const openingStock = fromDate
      ? (sumQtyBefore(allPurchases) + sumQtyBefore(allSupplierPurchases) + sumQtyBefore(allSaleReturns)) -
        (sumQtyBefore(allSales) + sumQtyBefore(allSaleRecords)) +
        sumAdjustmentBefore(allAdjustments)
      : 0;

    const entries = [];

    // POS sales (stock out)
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
    // Credit sales (stock out)
    for (const sale of saleRecords) {
      for (const item of sale.items) {
        entries.push({
          date: sale.createdAt,
          refNo: sale.receiptNo,
          description: "Credit Sale (out)",
          inQty: 0,
          outQty: item.quantity,
          balance: 0,
        });
      }
    }
    // Quick purchases (stock in)
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
    // Credit purchases (stock in)
    for (const purchase of supplierPurchases) {
      for (const item of purchase.items) {
        entries.push({
          date: purchase.createdAt,
          refNo: purchase.refNo || purchase.id.slice(-6),
          description: "Supplier Purchase (in)",
          inQty: item.quantity,
          outQty: 0,
          balance: 0,
        });
      }
    }
    for (const adj of adjustments) {
      const beforeQty = Number(adj.changes?.before?.quantity);
      const afterQty = Number(adj.changes?.after?.quantity);
      const quantityDelta = Number.isFinite(beforeQty) && Number.isFinite(afterQty) ? afterQty - beforeQty : 0;
      const stockMovement = adj.changes?.stockMovement || {};
      const movementLabel = stockMovement.reason || stockMovement.reference || adj.action;
      entries.push({
        date: adj.createdAt,
        refNo: stockMovement.reference || adj.id.slice(-6),
        description: `Adjustment: ${movementLabel}`,
        inQty: quantityDelta > 0 ? quantityDelta : 0,
        outQty: quantityDelta < 0 ? Math.abs(quantityDelta) : 0,
        balance: 0,
      });
    }
    // Sale returns (stock comes back in)
    for (const sr of saleReturns) {
      for (const item of sr.items) {
        entries.push({
          date: sr.createdAt,
          refNo: sr.returnNo,
          description: "Sale Return (in)",
          inQty: item.quantity,
          outQty: 0,
          balance: 0,
        });
      }
    }

    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let bal = openingStock;
    for (const e of entries) {
      bal += e.inQty - e.outQty;
      e.balance = bal;
    }

    res.json({
      product: product ? { id: product.id, name: product.name, sku: product.sku || "", currentStock: product.quantity || 0 } : null,
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
    const saleWhere = scopedSaleWhere(req, s);
    const [sales, saleRecords, purchases, products, expenses, suppliers, salesWithItems, saleRecordsWithItems] = await Promise.all([
      prisma.sale.findMany({ where: saleWhere, select: { total: true, tax: true } }),
      prisma.saleRecord.findMany({ where: saleWhere, select: { total: true, tax: true } }),
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, df(req)), select: { total: true } }),
      prisma.product.findMany({ where: scopedWhere(s, { isActive: { not: false } }), select: { quantity: true, minStock: true, expiryDate: true } }),
      prisma.expense.findMany({ where: scopedExpenseWhere(s, expenseDateWhere(dateRangeFromQuery(req))), select: { amount: true } }),
      prisma.supplier.findMany({ where: scopedWhere(s), select: { balance: true } }),
      prisma.sale.findMany({
        where: saleWhere,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
      prisma.saleRecord.findMany({
        where: saleWhere,
        select: { items: { select: { quantity: true, cost: true, conversionFactor: true, product: { select: { cost: true } } } } },
      }),
    ]);

    const cogs = [...salesWithItems, ...saleRecordsWithItems].reduce((sum, sale) => sum + saleCogs(sale), 0);

    const summary = buildDecisionSupportSummary({
      sales: [...sales, ...saleRecords],
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
    const [invoices, customers] = await Promise.all([
      prisma.invoice.findMany({ where: scopedWhere(s, { status: { in: ["unpaid", "partial", "overdue"] } }), include: { customer: true }, orderBy: { dueDate: "asc" } }),
      prisma.customer.findMany({ where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }), select: { id: true, name: true, balance: true, openingBalanceDate: true, createdAt: true } }),
    ]);
    const invoiceBalanceByCustomer = new Map();
    invoices.forEach((inv) => invoiceBalanceByCustomer.set(inv.customerId, (invoiceBalanceByCustomer.get(inv.customerId) || 0) + Number(inv.balance || 0)));
    const openingRows = customers.map((c) => {
      const historicalBalance = Math.max(0, Number(c.balance || 0) - (invoiceBalanceByCustomer.get(c.id) || 0));
      return { customer: c.name, status: "opening_balance", balance: historicalBalance, dueDate: openingBalanceDate(c) };
    }).filter((row) => row.balance > 0);
    const data = invoices.map((inv) => ({ customer: inv.customer?.name || "Unknown", status: inv.status, balance: inv.balance, dueDate: inv.dueDate }));
    const combined = [...openingRows, ...data];
    res.json({ data: combined, summary: { count: combined.length, totalOutstanding: combined.reduce((a, inv) => a + inv.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/receivables/aging", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [customers, openingBalances] = await Promise.all([
      prisma.customer.findMany({ 
        where: scopedWhere(s, { balance: { gt: 0 } }), 
        include: { 
          sales: { 
            where: { balance: { gt: 0 }, ...df(req) }, 
            select: { id: true, receiptNo: true, balance: true, dueDate: true, createdAt: true, total: true, amountPaid: true, paymentStatus: true } 
          } 
        },
        orderBy: { name: 'asc' }
      }),
      prisma.customer.findMany({ where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }), select: { id: true, name: true, openingBalance: true, openingBalanceDate: true } }),
    ]);
    
    const allTransactions = [];
    const now = new Date();
    
    // Add opening balance transactions
    openingBalances.forEach((c) => {
      allTransactions.push({
        id: `opening-${c.id}`,
        date: c.openingBalanceDate || new Date(0),
        dueDate: c.openingBalanceDate || new Date(0),
        type: 'Opening Balance',
        description: `Opening Balance - ${c.name}`,
        details: `Opening balance for customer`,
        debit: Number(c.openingBalance || 0),
        credit: 0,
        balance: Number(c.openingBalance || 0),
        reference: '-',
      });
    });
    
    // Add sales invoices
    customers.forEach((cust) => {
      cust.sales.forEach((sale) => {
        allTransactions.push({
          id: sale.id,
          date: sale.createdAt,
          dueDate: sale.dueDate || sale.createdAt,
          type: 'Invoice',
          description: `Sales Invoice - ${cust.name}`,
          details: `Ref: ${sale.receiptNo}, Status: ${sale.paymentStatus}, Paid: ${Number(sale.amountPaid || 0)}, Balance: ${Number(sale.balance || 0)}`,
          debit: Number(sale.total || 0),
          credit: Number(sale.amountPaid || 0),
          balance: Number(sale.balance || 0),
          status: sale.paymentStatus,
          reference: sale.receiptNo,
        });
      });
    });
    
    allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const totalOutstanding = customers.reduce((sum, c) => sum + Number(c.balance || 0), 0);
    const enriched = transformAgingData(allTransactions, false);
    enriched.currentBalance = totalOutstanding;
    enriched.summary.totalOutstanding = totalOutstanding;
    
    res.json(enriched);
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
    const [records, openSales, customers] = await Promise.all([
      prisma.saleRecord.findMany({ where: scopedWhere(s, { ...saleVisibilityFilter(req), balance: { gt: 0 }, dueDate: { lt: now } }), include: { customer: true }, orderBy: { dueDate: "asc" } }),
      prisma.saleRecord.findMany({ where: scopedWhere(s, { ...saleVisibilityFilter(req), balance: { gt: 0 } }), select: { customerId: true, balance: true } }),
      prisma.customer.findMany({
        where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }),
        select: { id: true, name: true, balance: true, openingBalance: true, openingBalanceDate: true, createdAt: true },
      }),
    ]);
    const openSalesByCustomer = new Map();
    openSales.forEach((sale) => openSalesByCustomer.set(sale.customerId, (openSalesByCustomer.get(sale.customerId) || 0) + Number(sale.balance || 0)));
    const openingRows = customers.map((customer) => {
      const dueDate = openingBalanceDate(customer);
      const historicalBalance = Math.max(0, Number(customer.balance || 0) - (openSalesByCustomer.get(customer.id) || 0));
      return {
        customer: customer.name,
        balance: historicalBalance,
        dueDate,
        source: "Opening Balance",
        daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000)),
      };
    }).filter((row) => row.balance > 0 && new Date(row.dueDate) < now);
    const data = [
      ...openingRows,
      ...records.map((r) => ({
        customer: r.customer?.name || "Unknown",
        balance: Number(r.balance || 0),
        dueDate: r.dueDate,
        source: "Invoice",
        daysOverdue: r.dueDate ? Math.max(0, Math.floor((now.getTime() - new Date(r.dueDate).getTime()) / 86400000)) : 0,
      })),
    ].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    res.json({ data, summary: { count: data.length, totalOverdue: data.reduce((a, r) => a + r.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== PAYABLES REPORTS ====================
router.get("/payables/outstanding", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [purchases, suppliers] = await Promise.all([
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, { balance: { gt: 0 } }), include: { supplier: true }, orderBy: { createdAt: "asc" } }),
      prisma.supplier.findMany({ where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }), select: { id: true, name: true, balance: true, openingBalanceDate: true, createdAt: true } }),
    ]);
    const purchaseBalanceBySupplier = new Map();
    purchases.forEach((p) => purchaseBalanceBySupplier.set(p.supplierId, (purchaseBalanceBySupplier.get(p.supplierId) || 0) + Number(p.balance || 0)));
    const openingRows = suppliers.map((sup) => {
      const historicalBalance = Math.max(0, Number(sup.balance || 0) - (purchaseBalanceBySupplier.get(sup.id) || 0));
      return { supplier: sup.name, total: historicalBalance, balance: historicalBalance, source: "Opening Balance", createdAt: openingBalanceDate(sup) };
    }).filter((row) => row.balance > 0);
    const data = purchases.map((p) => ({ supplier: p.supplier?.name || "Unknown", total: p.total, balance: p.balance, createdAt: p.createdAt }));
    const combined = [...openingRows, ...data];
    res.json({ data: combined, summary: { count: combined.length, totalOutstanding: combined.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/payables/aging", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const [suppliers, openingBalances] = await Promise.all([
      prisma.supplier.findMany({ 
        where: scopedWhere(s, { balance: { gt: 0 } }), 
        include: { 
          purchases: { 
            where: { balance: { gt: 0 }, ...df(req) }, 
            select: { id: true, refNo: true, balance: true, dueDate: true, createdAt: true, total: true, amountPaid: true, paymentStatus: true }
          } 
        },
        orderBy: { name: 'asc' }
      }),
      prisma.supplier.findMany({ where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }), select: { id: true, name: true, openingBalance: true, openingBalanceDate: true } }),
    ]);
    
    const allTransactions = [];
    const now = new Date();
    
    // Add opening balance transactions
    openingBalances.forEach((s) => {
      allTransactions.push({
        id: `opening-${s.id}`,
        date: s.openingBalanceDate || new Date(0),
        dueDate: s.openingBalanceDate || new Date(0),
        type: 'Opening Balance',
        description: `Opening Balance - ${s.name}`,
        details: `Opening balance for supplier`,
        debit: 0,
        credit: Number(s.openingBalance || 0),
        balance: Number(s.openingBalance || 0),
        reference: '-',
      });
    });
    
    // Add purchase bills
    suppliers.forEach((supp) => {
      supp.purchases.forEach((purchase) => {
        allTransactions.push({
          id: purchase.id,
          date: purchase.createdAt,
          dueDate: purchase.dueDate || purchase.createdAt,
          type: 'Bill',
          description: `Purchase Bill - ${supp.name}`,
          details: `Ref: ${purchase.refNo || '-'}, Total: ${Number(purchase.total || 0)}, Paid: ${Number(purchase.amountPaid || 0)}, Balance: ${Number(purchase.balance || 0)}, Status: ${purchase.paymentStatus}`,
          debit: 0,
          credit: Number(purchase.balance || 0),
          balance: Number(purchase.balance || 0),
          status: purchase.paymentStatus,
          reference: purchase.refNo || purchase.id.slice(-6),
        });
      });
    });
    
    allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const totalOutstanding = suppliers.reduce((sum, s) => sum + Number(s.balance || 0), 0);
    const enriched = transformAgingData(allTransactions, true);
    enriched.currentBalance = totalOutstanding;
    enriched.summary.totalOutstanding = totalOutstanding;
    enriched.title = 'Payables Aging Report';
    
    res.json(enriched);
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
    const [purchases, openPurchases, suppliers] = await Promise.all([
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, { balance: { gt: 0 }, dueDate: { lt: now } }), include: { supplier: true }, orderBy: { dueDate: "asc" } }),
      prisma.supplierPurchase.findMany({ where: scopedWhere(s, { balance: { gt: 0 } }), select: { supplierId: true, balance: true } }),
      prisma.supplier.findMany({
        where: scopedWhere(s, { openingBalance: { gt: 0 }, balance: { gt: 0 } }),
        select: { id: true, name: true, balance: true, openingBalance: true, openingBalanceDate: true, createdAt: true },
      }),
    ]);
    const openPurchasesBySupplier = new Map();
    openPurchases.forEach((purchase) => openPurchasesBySupplier.set(purchase.supplierId, (openPurchasesBySupplier.get(purchase.supplierId) || 0) + Number(purchase.balance || 0)));
    const openingRows = suppliers.map((supplier) => {
      const dueDate = openingBalanceDate(supplier);
      const historicalBalance = Math.max(0, Number(supplier.balance || 0) - (openPurchasesBySupplier.get(supplier.id) || 0));
      return {
        supplier: supplier.name,
        balance: historicalBalance,
        dueDate,
        source: "Opening Balance",
        daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000)),
      };
    }).filter((row) => row.balance > 0 && new Date(row.dueDate) < now);
    const data = [
      ...openingRows,
      ...purchases.map((p) => ({
        supplier: p.supplier?.name || "Unknown",
        balance: Number(p.balance || 0),
        dueDate: p.dueDate,
        source: "Bill",
        daysOverdue: p.dueDate ? Math.max(0, Math.floor((now.getTime() - new Date(p.dueDate).getTime()) / 86400000)) : 0,
      })),
    ].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    res.json({ data, summary: { count: data.length, totalOverdue: data.reduce((a, p) => a + p.balance, 0) } });
  } catch (err) { handleBranchError(res, err); }
});

// ==================== BUSINESS PERFORMANCE REPORTS ====================
router.get("/performance/branch", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { branch: { select: { name: true } } } }),
      prisma.saleRecord.findMany({ where, include: { branch: { select: { name: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      const name = sale.branch?.name || "Unassigned";
      if (!map[name]) map[name] = { branch: name, count: 0, revenue: 0, discount: 0, avgSale: 0 };
      map[name].count++; map[name].revenue += sale.total; map[name].discount += sale.discount || 0;
    });
    Object.values(map).forEach((b) => { b.avgSale = b.count ? b.revenue / b.count : 0; });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/product", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: true } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, profit: 0, transactions: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].profit += saleItemProfit(item);
        map[name].transactions++;
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.revenue - a.revenue) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/category", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: { include: { category: true } } } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: { include: { category: true } } } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      sale.items.forEach((item) => {
        const cat = item.product?.category?.name || "Uncategorized";
        if (!map[cat]) map[cat] = { category: cat, quantity: 0, revenue: 0, profit: 0 };
        map[cat].quantity += item.quantity;
        map[cat].revenue += item.total;
        map[cat].profit += saleItemProfit(item);
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
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: true } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, profit: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].profit += saleItemProfit(item);
      });
    });
    res.json({ data: Object.values(map).sort((a, b) => b.quantity - a.quantity).slice(0, 20) });
  } catch (err) { handleBranchError(res, err); }
});

router.get("/performance/least-products", authenticateToken, async (req, res) => {
  try {
    const s = await getScope(req);
    const where = scopedSaleWhere(req, s);
    const [sales, saleRecords] = await Promise.all([
      prisma.sale.findMany({ where, include: { items: { include: { product: true } } } }),
      prisma.saleRecord.findMany({ where, include: { items: { include: { product: true } } } }),
    ]);
    const map = {};
    [...sales, ...saleRecords].forEach((sale) => {
      sale.items.forEach((item) => {
        const name = item.product?.name || "Unknown";
        if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, profit: 0 };
        map[name].quantity += item.quantity;
        map[name].revenue += item.total;
        map[name].profit += saleItemProfit(item);
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
    const saleWhere = scopedSaleWhere(req, s);
    const [agg, count] = await Promise.all([
      prisma.product.aggregate({ where, _sum: { price: true }, _avg: { price: true } }),
      prisma.product.count({ where }),
    ]);
    // Count how many times services were sold
    const saleItemWhere = { product: { ...scopedWhere(s), itemType: "service" }, sale: saleWhere };
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
    const saleWhere = scopedSaleWhere(req, s);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s), itemType: "service" }, sale: saleWhere },
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
    const saleWhere = scopedSaleWhere(req, s);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s), itemType: "service" }, sale: saleWhere },
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
    const saleWhere = scopedSaleWhere(req, s);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s), itemType: "service" }, sale: saleWhere },
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
    const saleWhere = scopedSaleWhere(req, s);
    const saleItems = await prisma.saleItem.findMany({
      where: { product: { ...scopedWhere(s), itemType: "service" }, sale: saleWhere },
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
    const tenant = await prisma.tenant.findUnique({
      where: { id: s.tenantId },
      select: { currency: true },
    }).catch(() => null);
    const reportCurrency = tenant?.currency || "UGX";
    const fmtTenantCurrency = (value) => fmtCurrency(value, reportCurrency);

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
    const saleScope = saleVisibilityFilter(req);
    const curSaleWhere = scopedWhere(s, { createdAt: { gte: curStart, lt: curEnd }, ...saleScope });
    const prevSaleWhere = scopedWhere(s, { createdAt: { gte: prevStart, lt: prevEnd }, ...saleScope });
    const curExpWhere = scopedExpenseWhere(s, expenseDateWhere({ gte: curStart, lt: curEnd }));
    const prevExpWhere = scopedExpenseWhere(s, expenseDateWhere({ gte: prevStart, lt: prevEnd }));

    const [
      curSalesAgg, curSaleRecordsAgg, prevSalesAgg, prevSaleRecordsAgg, curExpAgg, prevExpAgg,
      curSalesItems, curSaleRecordItems, prevSalesItems, prevSaleRecordItems,
      curSalesFull, curSaleRecordsFull, prevSalesFull, prevSaleRecordsFull,
      curPurchasesAgg, curSupplierPurchasesAgg, prevPurchasesAgg, prevSupplierPurchasesAgg,
      products, lowStockProducts, expiringProducts,
      customers, curReceivables, curCashAccounts,
    ] = await Promise.all([
      prisma.sale.aggregate({ where: curSaleWhere, _sum: { total: true, discount: true, tax: true }, _count: true }),
      prisma.saleRecord.aggregate({ where: curSaleWhere, _sum: { total: true, discount: true, tax: true }, _count: true }),
      prisma.sale.aggregate({ where: prevSaleWhere, _sum: { total: true, discount: true, tax: true }, _count: true }),
      prisma.saleRecord.aggregate({ where: prevSaleWhere, _sum: { total: true, discount: true, tax: true }, _count: true }),
      prisma.expense.aggregate({ where: curExpWhere, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: prevExpWhere, _sum: { amount: true } }),
      prisma.sale.findMany({ where: curSaleWhere, select: { items: { select: { quantity: true, productId: true, total: true, cost: true, conversionFactor: true, product: { select: { cost: true, name: true, category: { select: { name: true } } } } } } } }),
      prisma.saleRecord.findMany({ where: curSaleWhere, select: { items: { select: { quantity: true, productId: true, total: true, cost: true, conversionFactor: true, product: { select: { cost: true, name: true, category: { select: { name: true } } } } } } } }),
      prisma.sale.findMany({ where: prevSaleWhere, select: { items: { select: { quantity: true, productId: true, total: true, cost: true, conversionFactor: true, product: { select: { cost: true, name: true, category: { select: { name: true } } } } } } } }),
      prisma.saleRecord.findMany({ where: prevSaleWhere, select: { items: { select: { quantity: true, productId: true, total: true, cost: true, conversionFactor: true, product: { select: { cost: true, name: true, category: { select: { name: true } } } } } } } }),
      prisma.sale.findMany({ where: curSaleWhere, select: { total: true, tax: true, paymentMethod: true, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.saleRecord.findMany({ where: curSaleWhere, select: { total: true, tax: true, paymentMethod: true, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.sale.findMany({ where: prevSaleWhere, select: { total: true, tax: true, paymentMethod: true, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.saleRecord.findMany({ where: prevSaleWhere, select: { total: true, tax: true, paymentMethod: true, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.purchase.aggregate({ where: curWhere, _sum: { total: true } }),
      prisma.supplierPurchase.aggregate({ where: curWhere, _sum: { total: true } }),
      prisma.purchase.aggregate({ where: prevWhere, _sum: { total: true } }),
      prisma.supplierPurchase.aggregate({ where: prevWhere, _sum: { total: true } }),
      prisma.product.count({ where: scopedWhere(s, { isActive: { not: false } }) }),
      prisma.product.count({ where: scopedWhere(s, { isActive: { not: false }, quantity: { lte: 10 } }) }),
      prisma.product.count({ where: scopedWhere(s, { isActive: { not: false }, expiryDate: { not: null, lte: new Date(Date.now() + 60 * 86400000) } }) }),
      prisma.customer.count({ where: scopedWhere(s) }),
      prisma.customer.aggregate({ where: scopedWhere(s, { balance: { gt: 0 } }), _sum: { balance: true }, _count: true }),
      prisma.cashAccount.aggregate({ where: { tenantId: s.tenantId, isActive: true }, _sum: { balance: true } }),
    ]);

    const curSalesAllItems = [...curSalesItems, ...curSaleRecordItems];
    const prevSalesAllItems = [...prevSalesItems, ...prevSaleRecordItems];
    const curSalesAllFull = [...curSalesFull, ...curSaleRecordsFull];
    const prevSalesAllFull = [...prevSalesFull, ...prevSaleRecordsFull];

    // Calculate COGS
    const curCogs = curSalesAllItems.reduce((sum, sale) => sum + saleCogs(sale), 0);
    const prevCogs = prevSalesAllItems.reduce((sum, sale) => sum + saleCogs(sale), 0);

    // Core metrics
    const curRevenue = aggregateNetRevenue(curSalesAgg) + aggregateNetRevenue(curSaleRecordsAgg);
    const prevRevenue = aggregateNetRevenue(prevSalesAgg) + aggregateNetRevenue(prevSaleRecordsAgg);
    const curExpenses = curExpAgg._sum.amount || 0;
    const prevExpenses = prevExpAgg._sum.amount || 0;
    const curGrossProfit = curRevenue - curCogs;
    const prevGrossProfit = prevRevenue - prevCogs;
    const curNetProfit = curGrossProfit - curExpenses;
    const prevNetProfit = prevGrossProfit - prevExpenses;
    const curSalesCount = (curSalesAgg._count || 0) + (curSaleRecordsAgg._count || 0);
    const prevSalesCount = (prevSalesAgg._count || 0) + (prevSaleRecordsAgg._count || 0);
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
      { metric: 'Purchases', current: (curPurchasesAgg._sum.total || 0) + (curSupplierPurchasesAgg._sum.total || 0), previous: (prevPurchasesAgg._sum.total || 0) + (prevSupplierPurchasesAgg._sum.total || 0), change: pct((curPurchasesAgg._sum.total || 0) + (curSupplierPurchasesAgg._sum.total || 0), (prevPurchasesAgg._sum.total || 0) + (prevSupplierPurchasesAgg._sum.total || 0)), format: 'currency' },
    ];

    // Product-level driver analysis (what drove the revenue change)
    const curProductMap = {};
    curSalesAllItems.forEach(sale => {
      sale.items.forEach(item => {
        const name = item.product?.name || 'Unknown';
        const cat = item.product?.category?.name || 'Uncategorized';
        if (!curProductMap[item.productId]) curProductMap[item.productId] = { name, category: cat, revenue: 0, qty: 0, cogs: 0 };
        curProductMap[item.productId].revenue += item.total || 0;
        curProductMap[item.productId].qty += item.quantity || 0;
        curProductMap[item.productId].cogs += saleLineCogs(item);
      });
    });
    const prevProductMap = {};
    prevSalesAllItems.forEach(sale => {
      sale.items.forEach(item => {
        const name = item.product?.name || 'Unknown';
        const cat = item.product?.category?.name || 'Uncategorized';
        if (!prevProductMap[item.productId]) prevProductMap[item.productId] = { name, category: cat, revenue: 0, qty: 0, cogs: 0 };
        prevProductMap[item.productId].revenue += item.total || 0;
        prevProductMap[item.productId].qty += item.quantity || 0;
        prevProductMap[item.productId].cogs += saleLineCogs(item);
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
    curSalesAllFull.forEach(sale => {
      const name = sale.branch?.name || 'Main';
      if (!curBranchMap[name]) curBranchMap[name] = { revenue: 0, count: 0 };
      curBranchMap[name].revenue += saleNetRevenue(sale);
      curBranchMap[name].count += 1;
    });
    prevSalesAllFull.forEach(sale => {
      const name = sale.branch?.name || 'Main';
      if (!prevBranchMap[name]) prevBranchMap[name] = { revenue: 0, count: 0 };
      prevBranchMap[name].revenue += saleNetRevenue(sale);
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
    curSalesAllFull.forEach(sale => {
      const m = sale.paymentMethod || 'cash';
      if (!curPayMap[m]) curPayMap[m] = { total: 0, count: 0 };
      curPayMap[m].total += saleNetRevenue(sale);
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
        insights.push({ type: 'positive', icon: 'trend-up', title: 'Revenue Growth', text: `Revenue grew ${fmtPct(revChangePct)} compared to the previous period. ${topGrowers.length > 0 ? `Top contributor: ${topGrowers[0].name} (+${fmtTenantCurrency(topGrowers[0].revenueChange)}).` : ''}` });
      } else if (revChangePct < -10) {
        insights.push({ type: 'negative', icon: 'trend-down', title: 'Revenue Decline', text: `Revenue dropped ${fmtPct(revChangePct)} compared to the previous period. ${topDecliners.length > 0 ? `Biggest decline: ${topDecliners[0].name} (${fmtTenantCurrency(topDecliners[0].revenueChange)}).` : 'Investigate market conditions or stock availability.'}` });
      } else {
        insights.push({ type: 'neutral', icon: 'info', title: 'Revenue Stable', text: `Revenue changed by ${fmtPct(revChangePct)} — relatively stable period-over-period.` });
      }
    }

    // Profitability insight
    if (prevNetProfit !== 0) {
      if (profitChangePct > 15) {
        insights.push({ type: 'positive', icon: 'trend-up', title: 'Profitability Improvement', text: `Net profit increased ${fmtPct(profitChangePct)}. ${expChangePct < 0 ? `Expenses were reduced by ${fmtPct(Math.abs(expChangePct))}, contributing to better margins.` : curCogs < prevCogs ? `Lower COGS (by ${fmtTenantCurrency(prevCogs - curCogs)}) improved gross margins.` : 'Revenue growth outpaced cost increases.'}` });
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
      insights.push({ type: 'warning', icon: 'alert', title: 'Expense Surge', text: `Operating expenses jumped ${fmtPct(expChangePct)} (${fmtTenantCurrency(prevExpenses)} -> ${fmtTenantCurrency(curExpenses)}). Review expense categories for cost-saving opportunities.` });
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
        text: `Average sale ${dir} from ${fmtTenantCurrency(prevAvgSale)} to ${fmtTenantCurrency(curAvgSale)} (${fmtPct(pct(curAvgSale, prevAvgSale))}). ${curAvgSale > prevAvgSale ? 'Customers are spending more per visit.' : 'Consider upselling strategies or bundle offers.'}`,
      });
    }

    // Discount insight
    const curDiscount = (curSalesAgg._sum.discount || 0) + (curSaleRecordsAgg._sum.discount || 0);
    const prevDiscount = (prevSalesAgg._sum.discount || 0) + (prevSaleRecordsAgg._sum.discount || 0);
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
        insights.push({ type: 'positive', icon: 'trend-up', title: 'Category Performance', text: `${topCat.category} is your top revenue category (${fmtTenantCurrency(topCat.currentRevenue)}) and grew ${fmtPct(topCat.change)} period-over-period.` });
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
      curTax: (curSalesAgg._sum.tax || 0) + (curSaleRecordsAgg._sum.tax || 0),
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
      currency: reportCurrency,
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
function fmtCurrency(value, currency = "UGX") {
  const normalizedCurrency = /^[A-Z]{3}$/.test(String(currency || "")) ? currency : "UGX";
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: normalizedCurrency, minimumFractionDigits: 0 }).format(value || 0);
}

export default router;
