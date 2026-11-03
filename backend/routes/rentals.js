import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { authenticateToken, requirePermission, requireAnyPermission, requireTenant, canUseTransactionAccountForPayment } from "../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../src/utils/branchAccess.js";
import { requireFeature, requireAnyFeature, hasFeatureAccess } from "../middleware/featureCheck.js";
import { requestBusinessAdvice } from "../src/services/businessAdvisor.js";
import { checkUsageLimit } from "../src/utils/usageLimits.js";
import { customerIdentityConflictMessage, findCustomerIdentityConflict } from "../src/utils/customerIdentity.js";
import { ensureRentalAccounting, ensureRentalCashLedgerAccount, recordRentalCashMovement, postRentalJournal, rentalInvoiceLines, rentalReceiptLines, rentalDepositReceiptLines, rentalDepositRefundLines, rentalDepositForfeitLines, rentalMixedRevenueRecognitionLines, rentalConsumableCostLines, allocateRentalLineAmounts, rentalDamageChargeLines, rentalCreditNoteLines, rentalCancellationLines, ensureLegacyRentalOpeningEntry, heldRentalDeposit } from "../src/services/rentalAccountingService.js";
import { allocateHistoricalPaymentBalances } from "../src/services/rentalHistoricalEntryService.js";

const router = Router();
const prisma = new PrismaClient();
const contractRequests = new Map();
const crmCollections = new Set(["leads", "activities", "cases", "campaigns"]);
const crmStages = new Set(["new", "qualified", "proposal", "won", "lost"]);
const crmPriorities = new Set(["low", "normal", "high", "urgent"]);
const crmColors = new Set(["yellow", "pink", "blue", "green", "orange", "purple"]);
const builtInRentalChargeCategories = new Set(["service", "delivery", "setup", "staffing", "venue", "cleaning", "other"]);
const rentalCreditNoteReasons = new Set(["cancellation", "price_adjustment", "service_not_provided", "overcharge", "other"]);

async function resolveRentalChargeCategory(tenantId, value) {
  const name = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name) return null;
  const key = name.toLowerCase();
  if (builtInRentalChargeCategories.has(key)) return key;
  const category = await prisma.category.findFirst({
    where: { tenantId, categoryType: "rental", name: { equals: name, mode: "insensitive" } },
    select: { name: true },
  });
  return category?.name || null;
}

function crmCanView(req, permission) {
  return req.userPermissions?.[permission] === true || req.user?.permissions?.includes(permission) || req.user?.permissions?.includes("*");
}

function requireCrmPermission(permission, legacyPermission) {
  return (req, res, next) => {
    const required = hasFeatureAccess(req.tenantFeatures || new Set(), "rentals")
      ? [permission, legacyPermission]
      : [permission];
    return requireAnyPermission(required)(req, res, next);
  };
}

function crmWorkspaceForUser(workspace, req) {
  const data = workspace && typeof workspace === "object" && !Array.isArray(workspace) ? workspace : {};
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.filter(record => crmRecordVisible(record, req)).map(record => ({
    ...record,
    ownerUserId: crmRecordOwner(record),
    visibility: record.visibility === "restricted" ? "restricted" : "workspace",
    sharedRole: crmRecordOwner(record) === req.user.id ? "owner" : record.sharedWith?.find(share => share?.userId === req.user.id)?.role || "viewer",
    ...(!crmCanView(req, "canViewCustomerPhone") ? { contactPhone: null } : {}),
    ...(!crmCanView(req, "canViewCustomerEmail") ? { contactEmail: null } : {}),
    ...(crmRecordOwner(record) !== req.user.id ? { sharedWith: undefined } : {}),
  })) : value]));
}

function crmRecordOwner(record) {
  return record?.ownerUserId || record?.createdBy || record?.userId || null;
}

function crmRecordVisible(record, req) {
  return record?.visibility !== "restricted" || crmRecordOwner(record) === req.user.id ||
    (Array.isArray(record.sharedWith) && record.sharedWith.some(share => share?.userId === req.user.id));
}

function crmRecordCanEdit(record, req) {
  return record?.visibility !== "restricted" || crmRecordOwner(record) === req.user.id ||
    (Array.isArray(record.sharedWith) && record.sharedWith.some(share => share?.userId === req.user.id && share?.role === "editor"));
}

async function mutateCrmWorkspace(tenantId, mutate) {
  return prisma.$transaction(async (tx) => {
    await tx.tenantCRMWorkspace.upsert({ where: { tenantId }, create: { tenantId, data: {} }, update: {} });
    const [row] = await tx.$queryRaw`SELECT data FROM tenant_crm_workspaces WHERE "tenantId" = ${tenantId} FOR UPDATE`;
    const workspace = row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
    const next = await mutate(workspace);
    await tx.tenantCRMWorkspace.update({ where: { tenantId }, data: { data: next } });
    return next;
  }, { isolationLevel: "Serializable" });
}

const toMoney = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const userSelect = { select: { id: true, fname: true, lname: true } };
const rentalMethodTypes = { cash: ["cash"], safe: ["safe"], mobile_money: ["mobile_money"], bank_transfer: ["bank"], bank: ["bank"], cheque: ["bank"], card: ["card"] };

function validateRentalPaymentAccount(req, account, method) {
  const normalized = String(method || "").toLowerCase();
  if (!account || !rentalMethodTypes[normalized]?.includes(String(account.type || "").toLowerCase())) {
    throw Object.assign(new Error("Choose an active transaction account that matches the payment method."), { statusCode: 400 });
  }
  if (!canUseTransactionAccountForPayment(req, account, normalized)) {
    throw Object.assign(new Error("You do not have permission to use this payment method or transaction account."), { statusCode: 403 });
  }
  return account;
}

async function recordRentalPaymentTx(tx, { req, tenantId, rental, amount, method, cashAccountId, kind = "rental_payment", transactionRef, mobileProvider, phoneNumber, notes, paymentDate = new Date() }) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!(value > 0) || !Number.isFinite(value)) throw Object.assign(new Error("Payment amount must be greater than zero."), { statusCode: 400 });
  const cashAccount = validateRentalPaymentAccount(req, await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } }), method);
  const receiptNo = `RNT-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const idempotencyKey = `${String(req.body?.idempotencyKey || randomUUID())}:${kind}`.slice(0, 120);
  const prior = await tx.rentalPayment.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } });
  if (prior) {
    if (prior.rentalId !== rental.id || prior.kind !== kind) throw Object.assign(new Error("This request key was already used for a different rental payment."), { statusCode: 409 });
    return prior;
  }
  const movement = await recordRentalCashMovement(tx, { tenantId, userId: req.user.id, cashAccount, amount: value, direction: "receipt", reference: receiptNo, description: `${kind.replaceAll("_", " ")} for ${rental.rentalNo}` });
  const isDeposit = kind === "deposit";
  const isAdvance = kind === "rental_advance";
  const isCancellationFee = kind === "rental_cancellation_fee";
  if (isDeposit && value > Math.max(0, Number(rental.depositAmount || 0) - Number(rental.depositPaid || 0)) + 0.01) throw Object.assign(new Error("Deposit collection cannot exceed the agreed security deposit."), { statusCode: 400 });
  const nextBalance = isDeposit ? Math.max(0, Number(rental.depositAmount || 0) - Number(rental.depositPaid || 0) - value) : Math.max(0, Number(rental.balance || 0) - value);
  const payment = await tx.rentalPayment.create({ data: { tenantId, rentalId: rental.id, cashAccountId: cashAccount.id, userId: req.user.id, kind, receiptNo, idempotencyKey, amount: value, balanceAfter: nextBalance, paymentMethod: method, mobileProvider: mobileProvider || null, phoneNumber: phoneNumber || null, paymentDate, transactionRef: transactionRef || null, notes: notes || null } });
  const cashLedger = await ensureRentalCashLedgerAccount(tx, tenantId, movement.cashAccount);
  const config = await ensureRentalAccounting(tx, tenantId);
  const lines = isDeposit
    ? rentalDepositReceiptLines(config, { amount: value, cashAccountId: cashLedger.id, reference: receiptNo })
    : rentalReceiptLines(config, { amount: value, cashAccountId: cashLedger.id, reference: receiptNo, advance: isAdvance });
  await postRentalJournal(tx, { tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: isDeposit ? "RENTAL_DEPOSIT_RECEIPT" : isAdvance ? "RENTAL_ADVANCE_RECEIPT" : isCancellationFee ? "RENTAL_CANCELLATION_FEE_RECEIPT" : "RENTAL_PAYMENT_RECEIPT", sourceId: payment.id, reference: receiptNo, description: `${kind.replaceAll("_", " ")} ${rental.rentalNo}`, lines });
  if (isDeposit) {
    await tx.rental.update({ where: { id: rental.id }, data: { depositPaid: { increment: value }, depositStatus: "held" } });
  } else {
    await tx.rental.update({ where: { id: rental.id }, data: { amountPaid: { increment: value }, balance: nextBalance, ...(isCancellationFee ? { cancellationChargeBalance: nextBalance } : {}), paymentStatus: nextBalance <= 0 ? "paid" : "partial", paymentMethod: method } });
  }
  return payment;
}

async function consumeRentalChargeStockTx(tx, { tenantId, rental, userId }) {
  const lines = await tx.rentalChargeLine.findMany({ where: { rentalId: rental.id, lineType: "consumable", stockConsumedAt: null } });
  if (!lines.length) return;
  const config = await ensureRentalAccounting(tx, tenantId);
  for (const line of lines) {
    if (!line.productId || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) {
      throw Object.assign(new Error(`Consumable line “${line.label}” needs a valid catalog item and whole quantity before check-out.`), { statusCode: 409 });
    }
    const branchFilter = rental.branchId ? { OR: [{ branchId: rental.branchId }, { branchId: null }] } : {};
    const product = await tx.product.findFirst({ where: { id: line.productId, tenantId, itemType: "product", isActive: true, ...branchFilter }, select: { id: true, name: true, cost: true } });
    if (!product || Number(product.cost) <= 0) throw Object.assign(new Error(`Set a valid cost price for stocked item “${line.label}” before check-out so inventory cost is recorded correctly.`), { statusCode: 409 });
    const moved = await tx.product.updateMany({
      where: { id: line.productId, tenantId, itemType: "product", isActive: true, ...branchFilter, quantity: { gte: Number(line.quantity) } },
      data: { quantity: { decrement: Number(line.quantity) } },
    });
    if (moved.count !== 1) throw Object.assign(new Error(`Not enough stock for “${product.name}”. Restock it or reduce the booking quantity before check-out.`), { statusCode: 409 });
    const unitCost = Number(product.cost);
    const cost = Math.round(unitCost * Number(line.quantity) * 100) / 100;
    await postRentalJournal(tx, {
      tenantId,
      branchId: rental.branchId,
      userId,
      sourceType: "RENTAL_CONSUMABLE_COGS",
      sourceId: line.id,
      reference: rental.rentalNo,
      description: `Consumables issued for booking ${rental.rentalNo}`,
      lines: rentalConsumableCostLines(config, { amount: cost, reference: rental.rentalNo }),
    });
    await tx.rentalChargeLine.update({ where: { id: line.id }, data: { unitCost, stockConsumedAt: new Date() } });
  }
}

const withUser = (record) => {
  if (!record) return record;
  const { User, ...rest } = record;
  return { ...rest, user: User || record.user || null };
};

async function getRentalAvailability(client, scope, productIds, startDate, endDate, excludeRentalId) {
  const products = await client.product.findMany({
    where: scopedWhere(scope, { id: { in: productIds }, itemType: "rental", isActive: { not: false } }),
    select: { id: true, name: true, quantity: true },
  });
  const rentals = await client.rental.findMany({
    where: scopedWhere(scope, {
      ...(excludeRentalId ? { id: { not: excludeRentalId } } : {}),
      status: { in: ["active", "overdue"] },
      hireDate: { lt: endDate },
      expectedReturnDate: { gt: startDate },
      items: { some: { productId: { in: productIds } } },
    }),
    select: { bookingState: true, items: { where: { productId: { in: productIds } }, select: { productId: true, quantity: true } } },
  });
  const booked = new Map();
  const checkedOut = new Map();
  for (const rental of rentals) for (const item of rental.items) {
    booked.set(item.productId, (booked.get(item.productId) || 0) + item.quantity);
    if (rental.bookingState === "checked_out") checkedOut.set(item.productId, (checkedOut.get(item.productId) || 0) + item.quantity);
  }
  return products.map((product) => {
    const owned = Number(product.quantity || 0) + (checkedOut.get(product.id) || 0);
    return { productId: product.id, name: product.name, owned, available: Math.max(0, owned - (booked.get(product.id) || 0)) };
  });
}

router.get("/payment-accounts", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const method = String(req.query.paymentMethod || "cash").toLowerCase();
    if (!rentalMethodTypes[method]) return res.status(400).json({ error: "Unsupported rental payment method." });
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const accounts = await prisma.cashAccount.findMany({ where: { tenantId: scope.tenantId, isActive: true, ...(scope.branchId ? { OR: [{ branchId: scope.branchId }, { branchId: null }] } : {}) }, orderBy: [{ type: "asc" }, { name: "asc" }] });
    res.json({ accounts: accounts.filter(account => rentalMethodTypes[method].includes(String(account.type).toLowerCase()) && canUseTransactionAccountForPayment(req, account, method)).map(({ id, name, type, balance, currency, branchId }) => ({ id, name, type, balance, currency, branchId })) });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    handleBranchError(res, err, "Could not load permitted transaction accounts.");
  }
});

router.get("/dashboard/summary", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const openRentals = await prisma.rental.findMany({
      where: scopedWhere(scope, { isHistoricalRecord: false, status: "active", bookingState: "checked_out" }),
      select: { expectedReturnDate: true, balance: true, items: { select: { quantity: true } } },
    });
    const [activeCount, reservations, overdueCount, openBalance, heldDeposits, collections, returnedToday] = await Promise.all([
      prisma.rental.count({ where: scopedWhere(scope, { isHistoricalRecord: false, status: "active", bookingState: "checked_out" }) }),
      prisma.rental.count({ where: scopedWhere(scope, { isHistoricalRecord: false, status: "active", bookingState: { in: ["reserved", "confirmed"] } }) }),
      prisma.rental.count({ where: scopedWhere(scope, { isHistoricalRecord: false, status: "active", bookingState: "checked_out", expectedReturnDate: { lt: now } }) }),
      prisma.rental.aggregate({ where: scopedWhere(scope, { isHistoricalRecord: false, status: { notIn: ["cancelled"] }, balance: { gt: 0 } }), _sum: { balance: true } }),
      prisma.rental.findMany({ where: scopedWhere(scope, { isHistoricalRecord: false, status: { not: "cancelled" }, depositStatus: { in: ["collected", "held"] } }), select: { depositPaid: true, depositAmount: true, depositRefunded: true, depositStatus: true } }),
      prisma.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, status: "posted", kind: { in: ["rental_payment", "rental_advance"] }, paymentDate: { gte: monthStart }, ...(scope.branchId ? { rental: { branchId: scope.branchId } } : {}) }, _sum: { amount: true }, _count: true }),
      prisma.rental.count({ where: scopedWhere(scope, { isHistoricalRecord: false, status: "returned", actualReturnDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } }) }),
    ]);
    const overdue = openRentals.filter(rental => rental.expectedReturnDate < now);
    res.json({
      activeCount,
      reservationCount: reservations,
      overdueCount,
      dueTodayCount: openRentals.filter(rental => rental.expectedReturnDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && rental.expectedReturnDate < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)).length,
      itemsOut: openRentals.reduce((sum, rental) => sum + rental.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0),
      overdueBalance: overdue.reduce((sum, rental) => sum + Math.max(0, Number(rental.balance || 0)), 0),
      outstandingBalance: Number(openBalance._sum.balance || 0),
      depositsHeld: heldDeposits.reduce((sum, rental) => sum + heldRentalDeposit(rental), 0),
      collectionsThisMonth: Number(collections._sum.amount || 0),
      receiptsThisMonth: Number(collections._count || 0),
      returnsToday: returnedToday,
    });
  } catch (err) {
    handleBranchError(res, err, "Failed to load rental dashboard summary.");
  }
});

router.get("/catalog", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const items = await prisma.product.findMany({
      where: scopedWhere(scope, { itemType: { in: ["rental", "service", "product"] }, isActive: true }),
      select: { id: true, name: true, sku: true, itemType: true, price: true, rentalPrice: true, rentalPeriod: true, baseUnit: true, quantity: true, serviceCategory: true },
      orderBy: { name: "asc" },
    });
    res.json({ items });
  } catch (err) {
    handleBranchError(res, err, "Failed to load rental and service catalog.");
  }
});

router.get("/availability", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const productIds = String(req.query.productIds || "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100);
    const startDate = new Date(String(req.query.startDate || ""));
    const endDate = new Date(String(req.query.endDate || ""));
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.endDate || ""))) endDate.setUTCHours(23, 59, 59, 999);
    if (!productIds.length || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return res.status(400).json({ error: "Select rental items and a valid date range." });
    res.json({ availability: await getRentalAvailability(prisma, scope, productIds, startDate, endDate) });
  } catch (err) {
    handleBranchError(res, err, "Failed to check rental availability");
  }
});

// List rentals with filters
router.get("/", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { page = 1, limit = 50, status, customerId, startDate, endDate } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = scopedWhere(scope, {
      ...(status && { status }),
      ...(customerId && { customerId }),
      ...(startDate && endDate && {
        hireDate: { gte: new Date(startDate), lte: new Date(endDate) },
      }),
    });

    const [rentals, total] = await Promise.all([
      prisma.rental.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          chargeLines: true,
          payments: { where: { status: { in: ["posted", "historical"] } }, include: { cashAccount: { select: { id: true, name: true, type: true } }, user: userSelect }, orderBy: { paymentDate: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.rental.count({ where }),
    ]);

    res.json({
      rentals: rentals.map(withUser),
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error("Rentals list error:", err);
    handleBranchError(res, err, "Failed to fetch rentals");
  }
});

router.get("/receivables", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(250, Math.max(1, Number.parseInt(String(req.query.limit || "100"), 10) || 100));
    const where = scopedWhere(scope, {
      customerId: { not: null },
      balance: { gt: 0.01 },
      OR: [
        { status: { not: "cancelled" }, OR: [
          { isHistoricalReceivable: true },
          { isHistoricalRecord: false, bookingState: { in: ["checked_out", "returned"] } },
        ] },
        { status: "cancelled", cancellationChargeAmount: { gt: 0 } },
      ],
    });
    const [rentals, total] = await Promise.all([
      prisma.rental.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ hireDate: "asc" }, { id: "asc" }],
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          chargeLines: true,
          payments: { where: { status: { in: ["posted", "historical"] } }, include: { cashAccount: { select: { id: true, name: true, type: true } }, user: userSelect }, orderBy: { paymentDate: "asc" } },
        },
      }),
      prisma.rental.count({ where }),
    ]);
    res.json({ rentals: rentals.map(withUser), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("Rental receivables list error:", err);
    handleBranchError(res, err, "Failed to load rental receivables");
  }
});

router.get("/crm/workspace", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canViewCRM", "canViewRental"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const workspace = await prisma.tenantCRMWorkspace.findUnique({ where: { tenantId }, select: { data: true, updatedAt: true } });
    const data = workspace?.data || { leads: [], activities: [], cases: [], campaigns: [] };
    const visible = scope.branchId ? Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.filter(record => record.branchId === scope.branchId) : value])) : data;
    res.json({ workspace: crmWorkspaceForUser(visible, req), updatedAt: workspace?.updatedAt || null });
  } catch (err) {
    console.error("CRM workspace read error:", err);
    handleBranchError(res, err, "Could not load CRM workspace.");
  }
});

router.post("/crm/workspace/:collection", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canCreateCRM", "canCreateRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { collection } = req.params;
    if (!crmCollections.has(collection)) return res.status(404).json({ error: "CRM record type not found." });
    const body = req.body || {};
    const title = String(body.title || body.subject || body.name || "").trim();
    const customerId = body.customerId ? String(body.customerId) : null;
    if (!title || title.length > 180) return res.status(400).json({ error: "Enter a title up to 180 characters." });
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { tenantId: scope.tenantId, id: customerId, ...(scope.branchId ? { branchId: scope.branchId } : {}) }, select: { id: true } });
      if (!customer) return res.status(404).json({ error: "CRM contact not found in your permitted business scope." });
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    let record;
    if (collection === "leads") {
      const prospectName = String(body.prospectName || body.contactName || "").trim();
      if (!prospectName) return res.status(400).json({ error: "Enter the prospect or business name." });
      const stage = crmStages.has(body.stage) && body.stage !== "won" ? body.stage : "new";
      const estimatedValue = Math.max(0, Number(body.estimatedValue) || 0);
      record = { id, customerId, title, prospectName: prospectName.slice(0, 180), contactName: String(body.contactName || "").trim().slice(0, 180), contactPhone: crmCanView(req, "canViewCustomerPhone") ? String(body.contactPhone || "").trim().slice(0, 80) || null : null, contactEmail: crmCanView(req, "canViewCustomerEmail") ? String(body.contactEmail || "").trim().slice(0, 180) || null : null, stage, stageHistory: [{ stage, at: now, userId: req.user.id }], source: String(body.source || "manual").slice(0, 80), estimatedValue, notes: String(body.notes || "").slice(0, 5000), assignedTo: String(body.assignedTo || req.user.id).slice(0, 120), nextAction: String(body.nextAction || "").slice(0, 180), nextActionAt: body.nextActionAt ? new Date(body.nextActionAt).toISOString() : null, createdAt: now, updatedAt: now, branchId: scope.branchId || null };
    } else if (collection === "activities") {
      const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
      if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Choose a valid activity date." });
      const nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
      if (nextFollowUpAt && Number.isNaN(nextFollowUpAt.getTime())) return res.status(400).json({ error: "Choose a valid follow-up date." });
      record = { id, customerId, kind: ["call", "email", "meeting", "note", "follow_up"].includes(body.kind) ? body.kind : "note", subject: title, details: String(body.details || "").slice(0, 5000), occurredAt: occurredAt.toISOString(), nextFollowUpAt: nextFollowUpAt?.toISOString() || null, completed: false, color: crmColors.has(body.color) ? body.color : "blue", userId: req.user.id, createdAt: now, branchId: scope.branchId || null };
    } else if (collection === "cases") {
      record = { id, customerId, subject: title, details: String(body.details || "").slice(0, 5000), status: "open", priority: crmPriorities.has(body.priority) ? body.priority : "normal", assignedTo: String(body.assignedTo || req.user.id).slice(0, 120), dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : null, color: crmColors.has(body.color) ? body.color : "orange", createdAt: now, updatedAt: now, branchId: scope.branchId || null };
    } else {
      record = { id, name: title, segment: ["all", "active", "overdue", "loyal", "inactive"].includes(body.segment) ? body.segment : "all", subject: String(body.subject || "").slice(0, 180), content: String(body.content || "").slice(0, 10000), status: "draft", scheduledAt: null, createdAt: now, updatedAt: now, createdBy: req.user.id, branchId: scope.branchId || null };
    }
    record = { ownerUserId: req.user.id, visibility: "workspace", sharedWith: [], ...record };
    const workspace = await mutateCrmWorkspace(scope.tenantId, (current) => ({ ...current, [collection]: [...(Array.isArray(current[collection]) ? current[collection] : []), record] }));
    res.status(201).json({ record: crmWorkspaceForUser({ [collection]: [record] }, req)[collection][0], workspace: crmWorkspaceForUser(workspace, req) });
  } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "CRM was updated at the same time. Retry your action." });
    if (err instanceof RangeError || err instanceof TypeError) return res.status(400).json({ error: "Check the CRM entry dates and values." });
    console.error("CRM record create error:", err);
    handleBranchError(res, err, "Could not create CRM record.");
  }
});

router.get("/crm/share-users", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canEditCRM", "canEditRental"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const users = await prisma.user.findMany({ where: { tenantId, isActive: true, id: { not: req.user.id } }, select: { id: true, fname: true, lname: true }, orderBy: [{ fname: "asc" }, { lname: "asc" }] });
    res.json({ users: users.map(user => ({ id: user.id, name: [user.fname, user.lname].filter(Boolean).join(" ") || "Team member" })) });
  } catch (err) {
    console.error("CRM sharing users error:", err);
    res.status(500).json({ error: "Could not load team members." });
  }
});

router.post("/crm/workspace/:collection/:id/share", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canEditCRM", "canEditRental"), async (req, res) => {
  try {
    const { collection, id } = req.params;
    if (!crmCollections.has(collection)) return res.status(404).json({ error: "CRM record type not found." });
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const tenantId = scope.tenantId;
    const visibility = req.body?.visibility === "restricted" ? "restricted" : "workspace";
    const shares = Array.isArray(req.body?.sharedWith) ? req.body.sharedWith : [];
    if (shares.length > 100) return res.status(400).json({ error: "Share with no more than 100 team members." });
    const userIds = [...new Set(shares.map(share => String(share?.userId || "").trim()).filter(Boolean))];
    const members = userIds.length ? await prisma.user.findMany({ where: { tenantId, isActive: true, id: { in: userIds } }, select: { id: true } }) : [];
    if (members.length !== userIds.length) return res.status(400).json({ error: "One or more selected users are not active members of this business." });
    const sharedWith = visibility === "restricted" ? userIds.map(userId => ({ userId, role: shares.find(share => String(share?.userId) === userId)?.role === "editor" ? "editor" : "viewer" })) : [];
    let updatedRecord = null;
    await mutateCrmWorkspace(tenantId, current => {
      const records = Array.isArray(current[collection]) ? current[collection] : [];
      const index = records.findIndex(record => record.id === id && (!scope.branchId || record.branchId === scope.branchId));
      if (index < 0) return current;
      const record = records[index];
      const owner = crmRecordOwner(record);
      if (owner && owner !== req.user.id) throw Object.assign(new Error("Only the record owner can change its sharing settings."), { statusCode: 403 });
      updatedRecord = { ...record, ownerUserId: owner || req.user.id, visibility, sharedWith, updatedAt: new Date().toISOString() };
      const nextRecords = [...records];
      nextRecords[index] = updatedRecord;
      return { ...current, [collection]: nextRecords };
    });
    if (!updatedRecord) return res.status(404).json({ error: "CRM record not found." });
    res.json({ record: crmWorkspaceForUser({ [collection]: [updatedRecord] }, req)[collection][0] });
  } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "CRM was updated at the same time. Retry sharing." });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error("CRM record sharing error:", err);
    handleBranchError(res, err, "Could not update CRM sharing.");
  }
});

router.patch("/crm/workspace/:collection/:id", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canEditCRM", "canEditRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { collection, id } = req.params;
    if (!crmCollections.has(collection)) return res.status(404).json({ error: "CRM record type not found." });
    if (Object.hasOwn(req.body || {}, "customerId") && req.body.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: String(req.body.customerId), tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}) }, select: { id: true } });
      if (!customer) return res.status(404).json({ error: "CRM contact not found in your permitted business scope." });
    }
    let updatedRecord = null;
    const workspace = await mutateCrmWorkspace(scope.tenantId, (current) => {
      const records = Array.isArray(current[collection]) ? current[collection] : [];
      const index = records.findIndex((record) => record.id === id && (!scope.branchId || record.branchId === scope.branchId));
      if (index < 0) return current;
      const old = records[index];
      if (!crmRecordVisible(old, req)) throw Object.assign(new Error("You do not have access to this CRM record."), { statusCode: 404 });
      if (!crmRecordCanEdit(old, req)) throw Object.assign(new Error("This CRM record is shared as view-only."), { statusCode: 403 });
      const patch = req.body || {};
      const allowed = collection === "leads"
        ? ["title", "prospectName", "customerId", "contactName", "contactPhone", "contactEmail", "stage", "source", "estimatedValue", "notes", "assignedTo", "nextAction", "nextActionAt"]
        : collection === "activities"
          ? ["subject", "customerId", "details", "kind", "occurredAt", "nextFollowUpAt", "completed", "color"]
          : collection === "cases"
            ? ["subject", "customerId", "details", "status", "priority", "assignedTo", "dueAt", "color"]
            : ["name", "segment", "subject", "content", "status", "scheduledAt"];
      const changes = {};
      for (const key of allowed) if (Object.hasOwn(patch, key)) changes[key] = patch[key];
      if (!crmCanView(req, "canViewCustomerPhone")) delete changes.contactPhone;
      if (!crmCanView(req, "canViewCustomerEmail")) delete changes.contactEmail;
      if (collection === "leads" && changes.stage && !crmStages.has(changes.stage)) throw Object.assign(new Error("Choose a valid pipeline stage."), { statusCode: 400 });
      if (collection === "leads" && changes.stage === "won" && old.stage !== "won") throw Object.assign(new Error("Convert the prospect to a customer to mark this opportunity won."), { statusCode: 400 });
      if (collection === "cases" && changes.priority && !crmPriorities.has(changes.priority)) throw Object.assign(new Error("Choose a valid case priority."), { statusCode: 400 });
      if (["activities", "cases"].includes(collection) && changes.color && !crmColors.has(changes.color)) throw Object.assign(new Error("Choose a valid calendar color."), { statusCode: 400 });
      if (collection === "cases" && changes.status && !["open", "in_progress", "waiting", "resolved", "closed"].includes(changes.status)) throw Object.assign(new Error("Choose a valid case status."), { statusCode: 400 });
      if (collection === "campaigns" && changes.status && !["draft", "scheduled"].includes(changes.status)) throw Object.assign(new Error("Campaign delivery is not enabled from CRM."), { statusCode: 400 });
      for (const key of ["title", "subject", "name"]) if (changes[key] !== undefined) changes[key] = String(changes[key]).trim().slice(0, 180);
      for (const key of ["notes", "details", "content"]) if (changes[key] !== undefined) changes[key] = String(changes[key]).slice(0, 10000);
      for (const key of ["nextActionAt", "occurredAt", "nextFollowUpAt", "dueAt", "scheduledAt"]) if (changes[key] !== undefined) changes[key] = changes[key] ? new Date(changes[key]).toISOString() : null;
      if (changes.estimatedValue !== undefined) changes.estimatedValue = Math.max(0, Number(changes.estimatedValue) || 0);
      if (collection === "leads" && changes.stage && changes.stage !== old.stage) {
        changes.stageHistory = [...(Array.isArray(old.stageHistory) ? old.stageHistory : []), { stage: changes.stage, from: old.stage, at: new Date().toISOString(), userId: req.user.id }];
      }
      if (collection === "leads") {
        for (const key of ["prospectName", "contactName"]) if (changes[key] !== undefined) changes[key] = String(changes[key]).trim().slice(0, 180);
        if (changes.contactPhone !== undefined) changes.contactPhone = String(changes.contactPhone).trim().slice(0, 80) || null;
        if (changes.contactEmail !== undefined) changes.contactEmail = String(changes.contactEmail).trim().slice(0, 180) || null;
      }
      updatedRecord = { ...old, ...changes, updatedAt: new Date().toISOString() };
      const nextRecords = [...records];
      nextRecords[index] = updatedRecord;
      return { ...current, [collection]: nextRecords };
    });
    if (!updatedRecord) return res.status(404).json({ error: "CRM record not found." });
    res.json({ record: crmWorkspaceForUser({ [collection]: [updatedRecord] }, req)[collection][0], workspace: crmWorkspaceForUser(workspace, req) });
  } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "CRM was updated at the same time. Retry your action." });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err instanceof RangeError || err instanceof TypeError) return res.status(400).json({ error: "Check the CRM entry fields and dates." });
    console.error("CRM record update error:", err);
    handleBranchError(res, err, "Could not update CRM record.");
  }
});

router.post("/crm/leads/:id/convert", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canEditCRM", "canEditRental"), requireAnyPermission(["canCreateCustomer", "canCreateReceivable"]), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { customerId } = req.body || {};
    if (customerId && !crmCanView(req, "canViewCustomer")) return res.status(403).json({ error: "View Customers permission is required to link an existing customer." });
    if (!customerId) await checkUsageLimit(scope.tenantId, "customers");

    const result = await prisma.$transaction(async tx => {
      await tx.tenantCRMWorkspace.upsert({ where: { tenantId: scope.tenantId }, create: { tenantId: scope.tenantId, data: {} }, update: {} });
      const [row] = await tx.$queryRaw`SELECT data FROM tenant_crm_workspaces WHERE "tenantId" = ${scope.tenantId} FOR UPDATE`;
      const workspace = row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
      const leads = Array.isArray(workspace.leads) ? workspace.leads : [];
      const index = leads.findIndex(lead => lead.id === req.params.id && (!scope.branchId || lead.branchId === scope.branchId));
      if (index < 0) throw Object.assign(new Error("Prospect not found in your permitted business scope."), { statusCode: 404 });
      const lead = leads[index];
      if (!crmRecordVisible(lead, req)) throw Object.assign(new Error("You do not have access to this prospect."), { statusCode: 404 });
      if (!crmRecordCanEdit(lead, req)) throw Object.assign(new Error("This prospect is shared as view-only."), { statusCode: 403 });
      if (lead.stage === "lost") throw Object.assign(new Error("A lost opportunity cannot be converted. Reopen it first."), { statusCode: 409 });

      let customer;
      if (lead.customerId) {
        if (customerId && customerId !== lead.customerId) throw Object.assign(new Error("This prospect is already linked to a customer."), { statusCode: 409 });
        customer = await tx.customer.findFirst({ where: { id: lead.customerId, tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}) }, select: { id: true, name: true } });
        if (!customer) throw Object.assign(new Error("The linked customer is no longer available in this branch."), { statusCode: 404 });
        if (lead.stage === "won") return { customer, lead };
      } else if (customerId) {
        customer = await tx.customer.findFirst({ where: { id: String(customerId), tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}) }, select: { id: true, name: true } });
        if (!customer) throw Object.assign(new Error("Select a customer from this business and branch."), { statusCode: 404 });
      } else {
        const name = String(req.body?.customerName || lead.prospectName || lead.contactName || lead.title || "").trim();
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "creditLimit") && !crmCanView(req, "canCreateCustomerCreditLimit")) {
          throw Object.assign(new Error("You do not have permission to create customer credit limits."), { statusCode: 403, code: "CUSTOMER_CREDIT_LIMIT_CREATE_PERMISSION_REQUIRED" });
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "creditLimit") && !hasFeatureAccess(req.tenantFeatures || new Set(), "customers.credit_limits")) {
          throw Object.assign(new Error("Customer credit limits are not enabled for this business plan."), { statusCode: 403, code: "CUSTOMER_CREDIT_LIMIT_FEATURE_REQUIRED" });
        }
        const creditLimit = Number(req.body?.creditLimit ?? 0);
        if (!name) throw Object.assign(new Error("A prospect or business name is required."), { statusCode: 400 });
        if (!Number.isFinite(creditLimit) || creditLimit < 0) throw Object.assign(new Error("Customer credit limit cannot be negative."), { statusCode: 400 });
        const email = crmCanView(req, "canViewCustomerEmail") ? String(lead.contactEmail || "").trim() || null : null;
        const phone = crmCanView(req, "canViewCustomerPhone") ? String(lead.contactPhone || "").trim() || null : null;
        const identityConflict = await findCustomerIdentityConflict(tx, { tenantId: scope.tenantId, identity: { name, email, phone } });
        if (identityConflict) throw Object.assign(new Error(customerIdentityConflictMessage(identityConflict.field)), { code: "CRM_CUSTOMER_DUPLICATE", duplicateField: identityConflict.field });
        customer = await tx.customer.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId || null, name, email, phone, creditLimit, notes: `Converted from CRM prospect: ${lead.title}` }, select: { id: true, name: true } });
      }

      const now = new Date().toISOString();
      const updatedLead = { ...lead, customerId: customer.id, stage: "won", convertedAt: lead.convertedAt || now, stageHistory: [...(Array.isArray(lead.stageHistory) ? lead.stageHistory : []), { stage: "won", from: lead.stage, at: now, userId: req.user.id }], updatedAt: now };
      const nextLeads = [...leads];
      nextLeads[index] = updatedLead;
      await tx.tenantCRMWorkspace.update({ where: { tenantId: scope.tenantId }, data: { data: { ...workspace, leads: nextLeads } } });
      return { customer, lead: updatedLead };
    }, { isolationLevel: "Serializable" });
    res.json({ customer: result.customer, lead: crmWorkspaceForUser({ leads: [result.lead] }, req).leads[0] });
  } catch (err) {
    if (err.code === "CRM_CUSTOMER_DUPLICATE") return res.status(409).json({ error: err.message, code: err.code, duplicateField: err.duplicateField });
    if (err.code === "P2034") return res.status(409).json({ error: "CRM was updated at the same time. Retry the conversion." });
    if (err.code === "LIMIT_REACHED") return res.status(403).json({ error: err.message });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error("CRM prospect conversion error:", err);
    handleBranchError(res, err, "Could not convert this prospect.");
  }
});

router.delete("/crm/workspace/:collection/:id", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canDeleteCRM", "canDeleteRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { collection, id } = req.params;
    if (!crmCollections.has(collection)) return res.status(404).json({ error: "CRM record type not found." });
    let deleted = false;
    const workspace = await mutateCrmWorkspace(scope.tenantId, (current) => {
      const records = Array.isArray(current[collection]) ? current[collection] : [];
      const target = records.find(record => record.id === id && (!scope.branchId || record.branchId === scope.branchId));
      if (target && !crmRecordVisible(target, req)) throw Object.assign(new Error("You do not have access to this CRM record."), { statusCode: 404 });
      if (target && !crmRecordCanEdit(target, req)) throw Object.assign(new Error("This CRM record is shared as view-only."), { statusCode: 403 });
      const nextRecords = records.filter((record) => !(record.id === id && (!scope.branchId || record.branchId === scope.branchId)));
      deleted = nextRecords.length !== records.length;
      return { ...current, [collection]: nextRecords };
    });
    if (!deleted) return res.status(404).json({ error: "CRM record not found." });
    res.json({ workspace: crmWorkspaceForUser(workspace, req) });
  } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "CRM was updated at the same time. Retry your action." });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error("CRM record delete error:", err);
    handleBranchError(res, err, "Could not delete CRM record.");
  }
});

router.get("/crm/overview", authenticateToken, requireTenant, requireAnyFeature(["crm", "rentals"]), requireCrmPermission("canViewCRM", "canViewRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const from = new Date(String(req.query.from || ""));
    const to = new Date(String(req.query.to || ""));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from || to - from > 62 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "Choose a calendar range of up to 62 days." });
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25));
    const search = String(req.query.search || "").trim().slice(0, 120);
    if (!hasFeatureAccess(req.tenantFeatures || new Set(), "rentals")) {
      const canViewPhone = req.userPermissions?.canViewCustomerPhone === true || req.user?.permissions?.includes("canViewCustomerPhone");
      const canViewEmail = req.userPermissions?.canViewCustomerEmail === true || req.user?.permissions?.includes("canViewCustomerEmail");
      const where = {
        tenantId: scope.tenantId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        ...(search ? { OR: [
          { name: { contains: search, mode: "insensitive" } },
          ...(canViewPhone ? [{ phone: { contains: search } }] : []),
          ...(canViewEmail ? [{ email: { contains: search, mode: "insensitive" } }] : []),
        ] } : {}),
      };
      const [customers, total, allAudience, activeAudience] = await Promise.all([
        prisma.customer.findMany({ where, orderBy: [{ updatedAt: "desc" }, { name: "asc" }], skip: (page - 1) * limit, take: limit,
          select: { id: true, name: true, ...(canViewPhone ? { phone: true } : {}), ...(canViewEmail ? { email: true } : {}), updatedAt: true } }),
        prisma.customer.count({ where }),
        prisma.customer.count({ where: { tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}) } }),
        prisma.customer.count({ where: { tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}), updatedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } }),
      ]);
      return res.json({
        customers,
        customerPagination: { page, limit, total, pages: Math.ceil(total / limit) },
        segmentCounts: { all: allAudience, active: activeAudience, overdue: 0, inactive: Math.max(0, allAudience - activeAudience), loyal: 0 },
        calendarRentals: [], calendarPagination: { total: 0, limit: 500, truncated: false },
        range: { from, to },
      });
    }
    const canViewCustomerPhone = req.userPermissions?.canViewCustomerPhone === true || req.user?.permissions?.includes("canViewCustomerPhone");
    const canViewCustomerEmail = req.userPermissions?.canViewCustomerEmail === true || req.user?.permissions?.includes("canViewCustomerEmail");
    const canViewCustomerBalance = req.userPermissions?.canViewCustomerBalance === true || req.user?.permissions?.includes("canViewCustomerBalance");
    const relationshipWhere = scopedWhere(scope, { status: { not: "cancelled" } });
    const customerWhere = {
      tenantId: scope.tenantId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: "insensitive" } },
        ...(canViewCustomerPhone ? [{ phone: { contains: search } }] : []),
        ...(canViewCustomerEmail ? [{ email: { contains: search, mode: "insensitive" } }] : []),
      ] } : {}),
    };

    const calendarWhere = scopedWhere(scope, {
      status: { not: "cancelled" },
      OR: [
        { hireDate: { gte: from, lte: to } },
        { status: { in: ["active", "overdue"] }, hireDate: { lte: to }, expectedReturnDate: { gte: from } },
        { actualReturnDate: { gte: from, lte: to } },
        { payments: { some: { status: "posted", paymentDate: { gte: from, lte: to } } } },
      ],
    });

    const [customers, customerTotal, rentals, calendarTotal, allAudience, activeAudience, overdueAudience, inactiveAudience, loyalGroups] = await Promise.all([
      prisma.customer.findMany({
        where: customerWhere,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, name: true, ...(canViewCustomerPhone ? { phone: true } : {}), ...(canViewCustomerEmail ? { email: true } : {}), updatedAt: true },
      }),
      prisma.customer.count({ where: customerWhere }),
      prisma.rental.findMany({
        where: calendarWhere,
        take: 500,
        orderBy: [{ hireDate: "asc" }, { expectedReturnDate: "asc" }],
        select: {
          id: true, rentalNo: true, customerId: true, customerName: true, customerPhone: canViewCustomerPhone,
          hireDate: true, expectedReturnDate: true, actualReturnDate: true, status: true, bookingState: true,
          totalAmount: true, balance: true, paymentStatus: true, bookingPurpose: true,
          branch: { select: { name: true } },
          items: { select: { quantity: true, product: { select: { name: true } } } },
          payments: { where: { status: "posted", paymentDate: { gte: from, lte: to } }, select: { id: true, paymentDate: true, amount: true, kind: true, receiptNo: true } },
        },
      }),
      prisma.rental.count({ where: calendarWhere }),
      prisma.customer.count({ where: { tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}) } }),
      prisma.customer.count({ where: { tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}), rentals: { some: { status: "active", ...(scope.branchId ? { branchId: scope.branchId } : {}) } } } }),
      prisma.customer.count({ where: { tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}), rentals: { some: { status: { in: ["active", "overdue"] }, expectedReturnDate: { lt: new Date() }, balance: { gt: 0 }, ...(scope.branchId ? { branchId: scope.branchId } : {}) } } } }),
      prisma.customer.count({ where: { tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}), rentals: { none: { status: { not: "cancelled" }, hireDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, ...(scope.branchId ? { branchId: scope.branchId } : {}) } } } }),
      prisma.rental.groupBy({ by: ["customerId"], where: scopedWhere(scope, { status: { not: "cancelled" }, customerId: { not: null } }), _count: { id: true } }),
    ]);

    const customerIds = customers.map((customer) => customer.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [totals, activeCounts, overdueCounts, upcomingReturns] = customerIds.length ? await Promise.all([
      prisma.rental.groupBy({
        by: ["customerId"], where: scopedWhere(scope, { customerId: { in: customerIds }, status: { not: "cancelled" } }),
        _count: { _all: true }, _sum: { totalAmount: true, balance: true }, _max: { hireDate: true },
      }),
      prisma.rental.groupBy({
        by: ["customerId"], where: scopedWhere(scope, { customerId: { in: customerIds }, status: "active" }),
        _count: { _all: true },
      }),
      prisma.rental.groupBy({
        by: ["customerId"], where: scopedWhere(scope, { customerId: { in: customerIds }, status: { in: ["active", "overdue"] }, expectedReturnDate: { lt: new Date() }, balance: { gt: 0 } }),
        _count: { _all: true },
      }),
      prisma.rental.groupBy({
        by: ["customerId"], where: scopedWhere(scope, { customerId: { in: customerIds }, status: "active", expectedReturnDate: { gte: today } }),
        _min: { expectedReturnDate: true },
      }),
    ]) : [[], [], [], []];
    const totalByCustomer = new Map(totals.map((row) => [row.customerId, row]));
    const activeByCustomer = new Map(activeCounts.map((row) => [row.customerId, row._count._all]));
    const overdueByCustomer = new Map(overdueCounts.map((row) => [row.customerId, row._count._all]));
    const nextReturnByCustomer = new Map(upcomingReturns.map((row) => [row.customerId, row._min.expectedReturnDate]));

    res.json({
      customers: customers.map((customer) => {
        const total = totalByCustomer.get(customer.id);
        return {
          ...customer,
          rentalCount: total?._count._all || 0,
          activeRentalCount: activeByCustomer.get(customer.id) || 0,
          overdueRentalCount: overdueByCustomer.get(customer.id) || 0,
          ...(canViewCustomerBalance ? { outstandingBalance: Number(total?._sum.balance || 0), lifetimeRentalValue: Number(total?._sum.totalAmount || 0) } : {}),
          lastHireDate: total?._max.hireDate || null,
          nextReturnDate: nextReturnByCustomer.get(customer.id) || null,
        };
      }),
      customerPagination: { page, limit, total: customerTotal, pages: Math.ceil(customerTotal / limit) },
      segmentCounts: { all: allAudience, active: activeAudience, overdue: overdueAudience, inactive: inactiveAudience, loyal: loyalGroups.filter(row => row._count.id >= 3).length },
      calendarRentals: rentals,
      calendarPagination: { total: calendarTotal, limit: 500, truncated: calendarTotal > rentals.length },
      range: { from, to },
    });
  } catch (err) {
    console.error("Rental CRM overview error:", err);
    handleBranchError(res, err, "Could not load rental CRM data.");
  }
});

router.post("/:id/contract-draft", authenticateToken, requirePermission("canGenerateRentalContract"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const key = `${req.user.tenantId}:${req.user.id}`;
    const now = Date.now();
    for (const [requestKey, requestedAt] of contractRequests) if (requestedAt < now - 60_000) contractRequests.delete(requestKey);
    if ((contractRequests.get(key) || 0) > now - 30_000) return res.status(429).json({ error: "Please wait before generating another contract draft." });
    contractRequests.set(key, now);
    const rental = await prisma.rental.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { customer: { select: { name: true, phone: true } }, Tenant: { select: { name: true, address: true, phone: true } }, items: { include: { product: { select: { name: true } } } }, chargeLines: true },
    });
    if (!rental) return res.status(404).json({ error: "Rental not found." });

    // The external model receives no tenant, renter, date, amount, item, or user-entered data.
    const advice = await requestBusinessAdvice({
      maxTokens: 1400,
      systemPrompt: "Write a concise generic checklist of practical rental-agreement clauses and handover/return safeguards for a small business. Do not include or request any names, dates, amounts, assets, jurisdictions, or business data. Do not claim legal enforceability or provide jurisdiction-specific legal advice. Clearly call out items a business must decide, including late charges, damage valuation, cancellations, deposit refunds, insurance, governing law, and disputes. Return only the checklist.",
      messages: [{ role: "user", content: "Create a reusable rental agreement checklist." }],
    });
    const customerName = rental.customer?.name || rental.customerName || "[RENTER NAME]";
    const customerPhone = rental.customer?.phone || rental.customerPhone || "[RENTER CONTACT]";
    const itemLines = rental.items.map((item) => `- ${item.product?.name || "Rental item"}; quantity ${item.quantity}; rate ${item.unitHirePrice} per ${item.rentalPeriod} x ${item.periods}; condition at handover: ${item.conditionOut}.`).join("\n");
    const chargeLines = rental.chargeLines.map((line) => `- ${line.label} (${line.category}); quantity ${line.quantity}; unit charge ${line.unitPrice}; total ${line.totalAmount}.`).join("\n");
    const draft = [
      "RENTAL AGREEMENT — DRAFT FOR REVIEW",
      "This draft is not legal advice. Complete all bracketed terms and have it reviewed before signing.",
      "",
      `Business: ${rental.Tenant?.name || "[BUSINESS NAME]"}`,
      `Business address/contact: ${[rental.Tenant?.address, rental.Tenant?.phone].filter(Boolean).join(" | ") || "[BUSINESS ADDRESS AND CONTACT]"}`,
      `Renter: ${customerName} | ${customerPhone}`,
      `Reference: ${rental.rentalNo}`,
      `Purpose: ${rental.bookingPurpose || "[PURPOSE / EVENT]"}`,
      `Hire starts: ${new Date(rental.hireDate).toLocaleString("en-GB")}`,
      `Due back: ${new Date(rental.expectedReturnDate).toLocaleString("en-GB")}`,
      "",
      "ITEMS AND HANDOVER CONDITION",
      itemLines || "[ITEM SCHEDULE]",
      ...(chargeLines ? ["", "ADDITIONAL SERVICES AND CHARGES", chargeLines] : []),
      "",
      `Hire charges: ${rental.totalAmount}`,
      `Security deposit recorded: ${rental.depositAmount} (${rental.depositStatus})`,
      `Amount paid toward hire: ${rental.amountPaid}; hire balance: ${rental.balance}`,
      "",
      "TERMS TO COMPLETE AND AGREE",
      advice.reply,
      "",
      "The parties should record the condition of each item at handover and return, confirm the return location and time, and agree in writing on any charges before signing.",
      "",
      "Business representative: ____________________  Date: __________",
      "Renter: _________________________________  Date: __________",
    ].join("\n");
    const updated = await prisma.rental.update({ where: { id: rental.id }, data: { contractDraft: draft, contractGeneratedAt: new Date() }, select: { id: true, contractDraft: true, contractGeneratedAt: true } });
    res.json(updated);
  } catch (err) {
    console.error("Rental contract draft error:", err.code || err.message);
    res.status(err.statusCode || 503).json({ error: err.statusCode ? err.message : "Could not generate the contract draft. Please try again." });
  }
});

router.put("/:id/contract-draft", authenticateToken, requirePermission("canEditRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const contractDraft = typeof req.body?.contractDraft === "string" ? req.body.contractDraft.trim() : "";
    if (!contractDraft || contractDraft.length > 20000) return res.status(400).json({ error: "Contract draft must contain 1 to 20,000 characters." });
    const result = await prisma.rental.updateMany({ where: scopedWhere(scope, { id: req.params.id }), data: { contractDraft } });
    if (!result.count) return res.status(404).json({ error: "Rental not found." });
    res.json({ id: req.params.id, contractDraft });
  } catch (err) {
    handleBranchError(res, err, "Failed to save rental contract draft");
  }
});

// Get single rental
router.get("/:id", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const rental = await prisma.rental.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: {
        customer: true,
        branch: true,
        User: userSelect,
        items: { include: { product: { select: { id: true, name: true, sku: true, rentalPrice: true, replacementValue: true } } } },
        chargeLines: true,
        payments: { where: { status: { in: ["posted", "historical"] } }, include: { cashAccount: { select: { id: true, name: true, type: true } }, user: userSelect }, orderBy: { paymentDate: "asc" } },
        ...((req.userPermissions?.canViewRentalCreditNotes || req.user?.permissions?.includes("canViewRentalCreditNotes")) ? { creditNotes: { where: { status: { not: "cancelled" } }, include: { user: userSelect, payments: { where: { kind: "rental_credit_refund", status: "posted" }, include: { cashAccount: { select: { id: true, name: true, type: true } }, user: userSelect }, orderBy: { paymentDate: "asc" } } }, orderBy: { createdAt: "desc" } } } : {}),
      },
    });
    if (!rental) return res.status(404).json({ error: "Rental not found" });
    res.json(withUser(rental));
  } catch (err) {
    console.error("Rental get error:", err);
    handleBranchError(res, err, "Failed to fetch rental");
  }
});

router.post("/:id/credit-notes", authenticateToken, requirePermission("canCreateRentalCreditNote"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const amount = Math.round(toMoney(req.body?.amount, -1) * 100) / 100;
    const reason = String(req.body?.reason || "").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim().slice(0, 2000) || null;
    const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim().slice(0, 120);
    if (!(amount > 0) || !Number.isFinite(amount)) return res.status(400).json({ error: "Enter a positive rental credit amount." });
    if (!rentalCreditNoteReasons.has(reason)) return res.status(400).json({ error: "Choose a valid rental credit note reason." });

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM rentals WHERE id = ${req.params.id} AND "tenantId" = ${scope.tenantId} FOR UPDATE`;
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      if (!rental || rental.status === "cancelled") throw Object.assign(new Error("Active rental booking not found."), { statusCode: 404 });
      const prior = await tx.rentalCreditNote.findFirst({ where: { tenantId: scope.tenantId, idempotencyKey } });
      if (prior) {
        if (prior.rentalId !== rental.id || Math.abs(Number(prior.amount) - amount) > 0.01 || prior.reason !== reason) throw Object.assign(new Error("This request key was already used for a different rental credit note."), { statusCode: 409 });
        return { note: prior, balance: Number(rental.balance) };
      }
      if (rental.isHistoricalRecord && !rental.isHistoricalReceivable) throw Object.assign(new Error("Add this historical booking to receivables before issuing a credit note."), { statusCode: 409 });
      if (amount > Number(rental.totalAmount) + 0.01) throw Object.assign(new Error("Credit amount exceeds the remaining booking charge."), { statusCode: 400 });
      const appliedAmount = Math.min(amount, Math.max(0, Number(rental.balance || 0)));
      const refundDue = Math.round((amount - appliedAmount) * 100) / 100;
      const taxAmount = Number(rental.totalAmount) > 0
        ? Math.round(Math.min(amount, Number(rental.taxAmount || 0) * amount / Number(rental.totalAmount)) * 100) / 100
        : 0;
      const noteNo = `RCN-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const note = await tx.rentalCreditNote.create({ data: { tenantId: scope.tenantId, rentalId: rental.id, noteNo, idempotencyKey, amount, taxAmount, appliedAmount, refundDue, reason, notes, userId: req.user.id } });
      const nextTotal = Math.max(0, Math.round((Number(rental.totalAmount) - amount) * 100) / 100);
      const nextTax = Math.max(0, Math.round((Number(rental.taxAmount || 0) - taxAmount) * 100) / 100);
      const nextBalance = Math.max(0, Math.round((Number(rental.balance || 0) - appliedAmount) * 100) / 100);
      const nextHistoricalReceivable = rental.isHistoricalReceivable ? Math.max(0, Math.round((Number(rental.historicalReceivableAmount || 0) - amount) * 100) / 100) : Number(rental.historicalReceivableAmount || 0);
      await tx.rental.update({ where: { id: rental.id }, data: { totalAmount: nextTotal, taxAmount: nextTax, balance: nextBalance, historicalReceivableAmount: nextHistoricalReceivable, paymentStatus: nextBalance <= 0.01 ? "paid" : Number(rental.amountPaid) > 0 ? "partial" : "unpaid" } });
      const config = await ensureRentalAccounting(tx, scope.tenantId);
      await postRentalJournal(tx, {
        tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id,
        sourceType: "RENTAL_CREDIT_NOTE", sourceId: note.id, reference: noteNo,
        description: `Rental credit note ${noteNo} for booking ${rental.rentalNo}`,
        lines: rentalCreditNoteLines(config, { amount, taxAmount, appliedAmount, refundDue, earned: rental.status === "returned", historical: rental.isHistoricalRecord, reference: noteNo }),
      });
      return { note, balance: nextBalance };
    }, { isolationLevel: "Serializable" });
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "This rental changed while the credit note was being recorded. Refresh and retry." });
    handleBranchError(res, err, "Failed to issue rental credit note");
  }
});

router.patch("/:id/credit-notes/:creditNoteId/cancel", authenticateToken, requirePermission("canEditRentalCreditNote"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const updated = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM rentals WHERE id = ${req.params.id} AND "tenantId" = ${scope.tenantId} FOR UPDATE`;
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      const note = await tx.rentalCreditNote.findFirst({ where: { id: req.params.creditNoteId, tenantId: scope.tenantId, rentalId: req.params.id, status: "issued" } });
      if (!rental || !note) throw Object.assign(new Error("Issued rental credit note not found."), { statusCode: 404 });
      if (Number(note.refundedAmount) > 0) throw Object.assign(new Error("A note with a recorded refund cannot be cancelled. Reverse the refund through an authorized accounting workflow first."), { statusCode: 409 });
      const original = await tx.journalEntry.findFirst({ where: { tenantId: scope.tenantId, sourceType: "RENTAL_CREDIT_NOTE", sourceId: note.id }, include: { lines: true } });
      if (!original?.lines?.length) throw Object.assign(new Error("The note has no posted journal entry to reverse."), { statusCode: 409 });
      await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_CREDIT_NOTE_REVERSAL", sourceId: note.id, reference: `${note.noteNo}-REV`, description: `Cancellation of rental credit note ${note.noteNo}`, lines: original.lines.map(line => ({ accountId: line.accountId, debit: Number(line.credit), credit: Number(line.debit), description: `Reverse ${note.noteNo}: ${line.description || "rental credit"}` })) });
      const nextTotal = Math.round((Number(rental.totalAmount) + Number(note.amount)) * 100) / 100;
      const nextTax = Math.round((Number(rental.taxAmount || 0) + Number(note.taxAmount || 0)) * 100) / 100;
      const nextBalance = Math.round((Number(rental.balance || 0) + Number(note.appliedAmount || 0)) * 100) / 100;
      const nextHistoricalReceivable = rental.isHistoricalReceivable ? Math.round((Number(rental.historicalReceivableAmount || 0) + Number(note.amount)) * 100) / 100 : Number(rental.historicalReceivableAmount || 0);
      await tx.rental.update({ where: { id: rental.id }, data: { totalAmount: nextTotal, taxAmount: nextTax, balance: nextBalance, historicalReceivableAmount: nextHistoricalReceivable, paymentStatus: nextBalance <= 0.01 ? "paid" : Number(rental.amountPaid) > 0 ? "partial" : "unpaid" } });
      return tx.rentalCreditNote.update({ where: { id: note.id }, data: { status: "cancelled" } });
    }, { isolationLevel: "Serializable" });
    res.json({ note: updated });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "This rental changed while the note was being cancelled. Refresh and retry." });
    handleBranchError(res, err, "Failed to cancel rental credit note");
  }
});

router.post("/:id/credit-notes/:creditNoteId/refunds", authenticateToken, requirePermission("canRefundRentalCreditNote"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const amount = Math.round(toMoney(req.body?.amount, -1) * 100) / 100;
    const method = String(req.body?.paymentMethod || "cash").toLowerCase();
    const mobileProvider = String(req.body?.mobileProvider || "").trim();
    const phoneNumber = String(req.body?.phoneNumber || "").trim();
    const transactionRef = String(req.body?.transactionRef || "").trim();
    const cashAccountId = String(req.body?.cashAccountId || "");
    if (!(amount > 0) || !Number.isFinite(amount)) return res.status(400).json({ error: "Enter a positive refund amount." });
    if (method === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionRef)) return res.status(400).json({ error: "Mobile money refunds require provider, phone, and transaction reference." });
    if (["card", "bank_transfer", "bank", "cheque"].includes(method) && !transactionRef) return res.status(400).json({ error: "This refund method requires a transaction reference." });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM rentals WHERE id = ${req.params.id} AND "tenantId" = ${scope.tenantId} FOR UPDATE`;
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      const note = await tx.rentalCreditNote.findFirst({ where: { id: req.params.creditNoteId, tenantId: scope.tenantId, rentalId: req.params.id, status: "issued" } });
      if (!rental || !note) throw Object.assign(new Error("Issued rental credit note not found."), { statusCode: 404 });
      const idempotencyKey = `${String(req.body?.idempotencyKey || randomUUID())}:rental_credit_refund`.slice(0, 120);
      const prior = await tx.rentalPayment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: scope.tenantId, idempotencyKey } } });
      if (prior) {
        if (prior.rentalId !== rental.id || prior.rentalCreditNoteId !== note.id || Math.abs(Number(prior.amount) - amount) > 0.01) throw Object.assign(new Error("This request key was already used for a different transaction."), { statusCode: 409 });
        return prior;
      }
      const outstanding = Math.max(0, Math.round((Number(note.refundDue) - Number(note.refundedAmount)) * 100) / 100);
      if (amount > outstanding + 0.01) throw Object.assign(new Error(`Refund exceeds the amount still due (${outstanding.toFixed(2)}).`), { statusCode: 400 });
      const cashAccount = validateRentalPaymentAccount(req, await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true } }), method);
      const receiptNo = `RNR-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const movement = await recordRentalCashMovement(tx, { tenantId: scope.tenantId, userId: req.user.id, cashAccount, amount, direction: "expense", reference: receiptNo, description: `Refund rental credit note ${note.noteNo}` });
      const payment = await tx.rentalPayment.create({ data: { tenantId: scope.tenantId, rentalId: rental.id, rentalCreditNoteId: note.id, cashAccountId: cashAccount.id, userId: req.user.id, kind: "rental_credit_refund", receiptNo, idempotencyKey, amount, balanceAfter: Math.max(0, outstanding - amount), paymentMethod: method, mobileProvider: mobileProvider || null, phoneNumber: phoneNumber || null, transactionRef: transactionRef || null, notes: String(req.body?.notes || `Refund for ${note.noteNo}`).trim().slice(0, 500) } });
      const cashLedger = await ensureRentalCashLedgerAccount(tx, scope.tenantId, movement.cashAccount);
      const config = await ensureRentalAccounting(tx, scope.tenantId);
      await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_CREDIT_NOTE_REFUND", sourceId: payment.id, reference: receiptNo, description: `Refund renter credit ${note.noteNo}`, lines: [{ accountId: config.renterCreditPayableAccountId, debit: amount, credit: 0, description: `Settle renter credit note ${note.noteNo}` }, { accountId: cashLedger.id, debit: 0, credit: amount, description: `Refund from ${cashAccount.name} for ${note.noteNo}` }] });
      await tx.rentalCreditNote.update({ where: { id: note.id }, data: { refundedAmount: { increment: amount } } });
      return payment;
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment: result });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "This rental refund changed at the same time. Refresh and retry." });
    handleBranchError(res, err, "Failed to refund rental credit note");
  }
});

router.post("/:id/payments", authenticateToken, requireAnyPermission(["canRecordRentalPayment", "canCreateRental"]), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { amount, paymentMethod = "cash", cashAccountId, transactionRef, mobileProvider, phoneNumber, notes } = req.body;
    const rental = await prisma.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
    if (!rental) return res.status(404).json({ error: "Rental not found." });
    const isCancellationFee = rental.status === "cancelled" && Number(rental.cancellationChargeBalance || 0) > 0;
    if (rental.status === "cancelled" && !isCancellationFee) return res.status(409).json({ error: "This cancelled booking has no outstanding cancellation fee." });
    if (rental.isHistoricalRecord && !rental.isHistoricalReceivable) return res.status(409).json({ error: "Add this past booking's unpaid balance to customer receivables before recording a current payment." });
    const value = toMoney(amount, -1);
    if (value <= 0 || value > Number(rental.balance) + 0.01) return res.status(400).json({ error: "Enter a positive payment no greater than the rental balance." });
    if (paymentMethod === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionRef)) return res.status(400).json({ error: "Mobile money requires provider, phone number, and transaction reference." });
    if (paymentMethod === "card" && !transactionRef) return res.status(400).json({ error: "Card payments require a transaction reference." });
    const account = validateRentalPaymentAccount(req, await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true } }), paymentMethod);
    const payment = await prisma.$transaction(async tx => {
      const locked = await tx.rental.findFirst({ where: { id: rental.id, tenantId: scope.tenantId } });
      const cancellationFee = Boolean(locked && locked.status === "cancelled" && Number(locked.cancellationChargeBalance || 0) > 0);
      if (!locked || value > Number(locked.balance) + 0.01 || (cancellationFee && value > Number(locked.cancellationChargeBalance) + 0.01)) throw Object.assign(new Error("The rental balance changed. Refresh and enter an amount within the current balance."), { statusCode: 409 });
      if (!cancellationFee && locked.bookingState === "checked_out") await ensureLegacyRentalOpeningEntry(tx, { tenantId: scope.tenantId, rental: locked, userId: req.user.id });
      return recordRentalPaymentTx(tx, { req, tenantId: scope.tenantId, rental: locked, amount: value, method: paymentMethod, cashAccountId: account.id, kind: cancellationFee ? "rental_cancellation_fee" : locked.bookingState === "checked_out" ? "rental_payment" : "rental_advance", transactionRef, mobileProvider, phoneNumber, notes });
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "The rental was updated at the same time. Refresh and retry." });
    handleBranchError(res, err, "Could not record rental payment.");
  }
});

router.post("/:id/deposit-refunds", authenticateToken, requireAnyPermission(["canRefundRentalDeposit", "canProcessRentalReturn"]), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { amount, paymentMethod = "cash", cashAccountId, transactionRef, mobileProvider, phoneNumber, notes } = req.body;
    const value = toMoney(amount, -1);
    if (paymentMethod === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionRef)) return res.status(400).json({ error: "Mobile money refunds require provider, phone number, and transaction reference." });
    if (["card", "bank_transfer"].includes(paymentMethod) && !transactionRef) return res.status(400).json({ error: "Electronic refunds require a transaction reference." });
    const account = validateRentalPaymentAccount(req, await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true } }), paymentMethod);
    const refund = await prisma.$transaction(async tx => {
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      if (!rental) throw Object.assign(new Error("Rental not found."), { statusCode: 404 });
      const isUnissuedReservation = rental.status === "active" && rental.bookingState !== "checked_out";
      const cancelledReservation = rental.status === "cancelled" && rental.bookingState === "cancelled";
      if (rental.status !== "returned" && !isUnissuedReservation && !cancelledReservation) throw Object.assign(new Error("Security deposits can only be refunded after return inspection or on a cancelled reservation."), { statusCode: 409 });
      const held = heldRentalDeposit(rental);
      const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).slice(0, 120);
      const prior = await tx.rentalPayment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: scope.tenantId, idempotencyKey } } });
      if (prior) {
        if (prior.rentalId !== rental.id || prior.kind !== "deposit_refund") throw Object.assign(new Error("This request key was already used for a different rental payment."), { statusCode: 409 });
        return prior;
      }
      if (value <= 0 || value > held + 0.01) throw Object.assign(new Error("Refund must be positive and cannot exceed the refundable deposit held."), { statusCode: 400 });
      const receiptNo = `RNT-REF-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const movement = await recordRentalCashMovement(tx, { tenantId: scope.tenantId, userId: req.user.id, cashAccount: account, amount: value, direction: "expense", reference: receiptNo, description: `Security deposit refund for ${rental.rentalNo}` });
      const payment = await tx.rentalPayment.create({ data: { tenantId: scope.tenantId, rentalId: rental.id, cashAccountId: account.id, userId: req.user.id, kind: "deposit_refund", receiptNo, idempotencyKey, amount: value, balanceAfter: held - value, paymentMethod, mobileProvider: mobileProvider || null, phoneNumber: phoneNumber || null, transactionRef: transactionRef || null, notes: notes || null } });
      const cashLedger = await ensureRentalCashLedgerAccount(tx, scope.tenantId, movement.cashAccount);
      const config = await ensureRentalAccounting(tx, scope.tenantId);
      await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_DEPOSIT_REFUND", sourceId: payment.id, reference: receiptNo, description: `Security deposit refund ${rental.rentalNo}`, lines: rentalDepositRefundLines(config, { amount: value, cashAccountId: cashLedger.id, reference: receiptNo }) });
      const totalRefunded = Number(rental.depositRefunded || 0) + value;
      const collectedDeposit = Number(rental.depositPaid || 0) > 0 ? Number(rental.depositPaid) : ["collected", "held"].includes(String(rental.depositStatus || "").toLowerCase()) ? Number(rental.depositAmount || 0) : 0;
      await tx.rental.update({ where: { id: rental.id }, data: { depositRefunded: totalRefunded, depositStatus: totalRefunded + 0.01 >= collectedDeposit ? "refunded" : "held" } });
      return payment;
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment: refund });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "The deposit changed at the same time. Refresh and retry." });
    handleBranchError(res, err, "Could not refund the rental deposit.");
  }
});

router.post("/:id/advance-refunds", authenticateToken, requireAnyPermission(["canRefundRentalAdvance", "canDeleteRental"]), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { amount, paymentMethod = "cash", cashAccountId, transactionRef, mobileProvider, phoneNumber, notes } = req.body;
    const value = toMoney(amount, -1);
    if (paymentMethod === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionRef)) return res.status(400).json({ error: "Mobile money refunds require provider, phone number, and transaction reference." });
    if (["card", "bank_transfer"].includes(paymentMethod) && !transactionRef) return res.status(400).json({ error: "Electronic refunds require a transaction reference." });
    const account = validateRentalPaymentAccount(req, await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true } }), paymentMethod);
    const refund = await prisma.$transaction(async tx => {
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      if (!rental || (rental.status !== "active" && rental.status !== "cancelled") || rental.bookingState === "checked_out") throw Object.assign(new Error("Only a reservation or its cancellation can refund an unearned advance."), { statusCode: 409 });
      const cancelledReservation = rental.status === "cancelled";
      const [advances, refunds] = await Promise.all([
        tx.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, rentalId: rental.id, status: "posted", kind: "rental_advance" }, _sum: { amount: true } }),
        tx.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, rentalId: rental.id, status: "posted", kind: "rental_advance_refund" }, _sum: { amount: true } }),
      ]);
      const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).slice(0, 120);
      const refundKind = cancelledReservation ? "rental_cancellation_refund" : "rental_advance_refund";
      const prior = await tx.rentalPayment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: scope.tenantId, idempotencyKey } } });
      if (prior) {
        if (prior.rentalId !== rental.id || prior.kind !== refundKind) throw Object.assign(new Error("This request key was already used for a different rental payment."), { statusCode: 409 });
        return prior;
      }
      const refundableAdvances = Math.max(0, Number(advances._sum.amount || 0) - Number(refunds._sum.amount || 0));
      const refundable = cancelledReservation
        ? Math.min(refundableAdvances, Math.max(0, Number(rental.cancellationRefundDue || 0) - Number(rental.cancellationRefundedAmount || 0)))
        : refundableAdvances;
      if (value <= 0 || value > refundable + 0.01) throw Object.assign(new Error("Refund cannot exceed unrefunded reservation advances."), { statusCode: 400 });
      const receiptNo = `${cancelledReservation ? 'RNT-CAN-REF' : 'RNT-ADV-REF'}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const movement = await recordRentalCashMovement(tx, { tenantId: scope.tenantId, userId: req.user.id, cashAccount: account, amount: value, direction: "expense", reference: receiptNo, description: `${cancelledReservation ? 'Cancellation refund' : 'Reservation advance refund'} for ${rental.rentalNo}` });
      const payment = await tx.rentalPayment.create({ data: { tenantId: scope.tenantId, rentalId: rental.id, cashAccountId: account.id, userId: req.user.id, kind: refundKind, receiptNo, idempotencyKey, amount: value, balanceAfter: refundable - value, paymentMethod, mobileProvider: mobileProvider || null, phoneNumber: phoneNumber || null, transactionRef: transactionRef || null, notes: notes || null } });
      const cashLedger = await ensureRentalCashLedgerAccount(tx, scope.tenantId, movement.cashAccount);
      const config = await ensureRentalAccounting(tx, scope.tenantId);
      await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: cancelledReservation ? "RENTAL_CANCELLATION_REFUND" : "RENTAL_ADVANCE_REFUND", sourceId: payment.id, reference: receiptNo, description: `${cancelledReservation ? 'Cancellation refund' : 'Reservation advance refund'} ${rental.rentalNo}`, lines: [{ accountId: cancelledReservation ? config.renterCreditPayableAccountId : config.deferredRevenueAccountId, debit: value, credit: 0, description: `${cancelledReservation ? 'Settle cancellation refund payable' : 'Release refunded rental advance'} ${receiptNo}` }, { accountId: cashLedger.id, debit: 0, credit: value, description: `Refund from ${cashAccount.name} ${receiptNo}` }] });
      if (cancelledReservation) {
        await tx.rental.update({ where: { id: rental.id }, data: { cancellationRefundedAmount: { increment: value } } });
      } else {
        const newPaid = Math.max(0, Number(rental.amountPaid || 0) - value);
        await tx.rental.update({ where: { id: rental.id }, data: { amountPaid: newPaid, balance: Math.max(0, Number(rental.totalAmount) - newPaid), paymentStatus: newPaid >= Number(rental.totalAmount) ? "paid" : newPaid > 0 ? "partial" : "unpaid" } });
      }
      return payment;
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment: refund });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "The reservation advance changed at the same time. Refresh and retry." });
    handleBranchError(res, err, "Could not refund the reservation advance.");
  }
});

router.post("/:id/deposit-forfeitures", authenticateToken, requireAnyPermission(["canForfeitRentalDeposit", "canProcessRentalReturn"]), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const reason = String(req.body.reason || "").trim();
    if (reason.length < 5 || reason.length > 500) return res.status(400).json({ error: "Provide a clear forfeiture reason (5–500 characters)." });
    const payment = await prisma.$transaction(async tx => {
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      if (!rental || rental.status !== "returned") throw Object.assign(new Error("Only a returned rental can forfeit its held deposit."), { statusCode: 409 });
      const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).slice(0, 120);
      const prior = await tx.rentalPayment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: scope.tenantId, idempotencyKey } } });
      if (prior) {
        if (prior.rentalId !== rental.id || prior.kind !== "deposit_forfeiture") throw Object.assign(new Error("This request key was already used for a different rental payment."), { statusCode: 409 });
        return prior;
      }
      const held = heldRentalDeposit(rental);
      if (held <= 0 || rental.depositStatus === "forfeited") throw Object.assign(new Error("There is no refundable deposit remaining to forfeit."), { statusCode: 409 });
      const receiptNo = `RNT-FOR-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const payment = await tx.rentalPayment.create({ data: { tenantId: scope.tenantId, rentalId: rental.id, userId: req.user.id, kind: "deposit_forfeiture", receiptNo, idempotencyKey, amount: held, balanceAfter: 0, notes: reason } });
      const config = await ensureRentalAccounting(tx, scope.tenantId);
      await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_DEPOSIT_FORFEITURE", sourceId: payment.id, reference: receiptNo, description: `Security deposit forfeiture ${rental.rentalNo}: ${reason}`, lines: rentalDepositForfeitLines(config, { amount: held, reference: receiptNo }) });
      await tx.rental.update({ where: { id: rental.id }, data: { depositStatus: "forfeited" } });
      return payment;
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    handleBranchError(res, err, "Could not record deposit forfeiture.");
  }
});

router.get("/:id/payments/:paymentId/receipt", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const payment = await prisma.rentalPayment.findFirst({ where: { tenantId: scope.tenantId, rentalId: req.params.id, id: req.params.paymentId, status: { in: ["posted", "historical"] } }, include: { rental: { include: { customer: { select: { name: true, phone: true } }, items: { include: { product: { select: { name: true, sku: true } } } }, chargeLines: true } }, cashAccount: { select: { name: true, type: true } }, tenant: { select: { name: true, address: true, phone: true, email: true, logo: true, currency: true } } } });
    if (!payment) return res.status(404).json({ error: "Rental receipt not found." });
    res.json({ payment });
  } catch (err) {
    handleBranchError(res, err, "Could not load rental receipt.");
  }
});

// Historical records are operational history only: no current stock, cash, or GL movement is inferred.
router.post("/historical", authenticateToken, requirePermission("canCreateRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", requireBranch: true, allowOwnerAll: false });
    const {
      historicalImportKey, customerId, customerName, customerPhone, items = [], additionalCharges = [],
      hireDate, expectedReturnDate, actualReturnDate, depositAmount = 0, discount = 0,
      taxRate = 0, payments = [], notes, bookingPurpose, historicalReference, collectUnpaidBalance = false,
      deliveryAddress, deliveryFee = 0,
    } = req.body;
    const importKey = String(historicalImportKey || "").trim();
    if (importKey.length < 10 || importKey.length > 80) return res.status(400).json({ error: "A valid historical-entry request key is required." });
    const existing = await prisma.rental.findFirst({ where: { tenantId: scope.tenantId, historicalImportKey: importKey }, include: { customer: true, branch: true, User: userSelect, items: { include: { product: { select: { id: true, name: true, sku: true } } } }, chargeLines: true, payments: { where: { status: "historical" }, orderBy: { paymentDate: "asc" } } } });
    if (existing) return res.json(withUser(existing));
    if (!Array.isArray(items) || !Array.isArray(additionalCharges) || !Array.isArray(payments) || payments.length > 100 || additionalCharges.length > 50) {
      return res.status(400).json({ error: "Historical booking lines or payments are invalid or exceed the supported limit." });
    }
    if (!items.length && !additionalCharges.length) return res.status(400).json({ error: "Add at least one historical hire item, service, or goods line." });
    const normalizedDeliveryAddress = String(deliveryAddress || "").trim().slice(0, 500);
    const normalizedDeliveryFee = Math.round(toMoney(deliveryFee, -1) * 100) / 100;
    if (normalizedDeliveryFee < 0 || (normalizedDeliveryFee > 0 && !normalizedDeliveryAddress)) return res.status(400).json({ error: "Enter a delivery destination for a delivery charge, and use a non-negative fee." });
    if (normalizedDeliveryFee > 0 && additionalCharges.some(line => String(line?.category || "").toLowerCase() === "delivery")) return res.status(400).json({ error: "Enter the delivery fee either in the delivery field or as a delivery charge line, not both." });
    const dateValue = (value, label, endOfDay = false) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw Object.assign(new Error(`${label} must be a valid date.`), { statusCode: 400 });
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Object.assign(new Error(`${label} must be a valid date.`), { statusCode: 400 });
      if (endOfDay) date.setUTCHours(23, 59, 59, 999);
      return date;
    };
    const hireAt = dateValue(hireDate, "Hire date");
    const expectedAt = dateValue(expectedReturnDate, "Expected return date", true);
    const returnedAt = dateValue(actualReturnDate, "Actual return date", true);
    const now = new Date();
    const todayParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const todayBusinessDate = `${todayParts.find(part => part.type === "year")?.value}-${todayParts.find(part => part.type === "month")?.value}-${todayParts.find(part => part.type === "day")?.value}`;
    if ([hireDate, expectedReturnDate, actualReturnDate].some(value => value > todayBusinessDate) || expectedAt < hireAt || returnedAt < hireAt) return res.status(400).json({ error: "Historical dates must not be in the future, with return dates on or after the hire date." });
    if (!customerId && !String(customerName || "").trim()) return res.status(400).json({ error: "Select an existing customer or enter the customer name." });
    if (collectUnpaidBalance && !customerId) return res.status(400).json({ error: "Select an existing customer before adding the unpaid historical amount to receivables." });
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: scopedWhere(scope, { id: customerId }), select: { id: true } });
      if (!customer) return res.status(404).json({ error: "Customer not found in this business or branch." });
    }
    if (scope.branchId && !scope.tenantId) return res.status(400).json({ error: "Business scope is unavailable." });

    const rentalProductIds = [...new Set(items.map(item => String(item?.productId || "").trim()).filter(Boolean))];
    const chargeProductIds = [...new Set(additionalCharges.map(line => String(line?.productId || "").trim()).filter(Boolean))];
    const [rentalProducts, chargeProducts] = await Promise.all([
      rentalProductIds.length ? prisma.product.findMany({ where: scopedWhere(scope, { id: { in: rentalProductIds }, isActive: { not: false } }), select: { id: true, name: true, itemType: true, rentalPrice: true, price: true, rentalPeriod: true } }) : [],
      chargeProductIds.length ? prisma.product.findMany({ where: scopedWhere(scope, { id: { in: chargeProductIds }, isActive: true }), select: { id: true, name: true, itemType: true, cost: true, price: true } }) : [],
    ]);
    if (rentalProducts.length !== rentalProductIds.length || rentalProducts.some(product => product.itemType !== "rental")) return res.status(400).json({ error: "Every hire asset must be an active Rental Item from this business." });
    if (chargeProducts.length !== chargeProductIds.length) return res.status(400).json({ error: "A selected service or goods item was not found in this business." });
    const rentalsById = new Map(rentalProducts.map(product => [product.id, product]));
    const chargesById = new Map(chargeProducts.map(product => [product.id, product]));
    const rentalLines = items.map(item => {
      const product = rentalsById.get(String(item.productId));
      const quantity = Number(item.quantity);
      const periods = Number(item.periods || 1);
      const unitHirePrice = toMoney(item.unitHirePrice, Number(product?.rentalPrice || product?.price || -1));
      if (!product || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10000 || !Number.isInteger(periods) || periods <= 0 || unitHirePrice < 0) throw Object.assign(new Error("Historical hire item quantity, periods, or saved rate is invalid."), { statusCode: 400 });
      const conditionReturn = String(item.conditionReturn || "good");
      if (!["good", "fair", "damaged", "broken"].includes(conditionReturn)) throw Object.assign(new Error("Choose a valid historical return condition."), { statusCode: 400 });
      const conditionOut = String(item.conditionOut || "good");
      if (!["good", "fair", "damaged", "broken"].includes(conditionOut)) throw Object.assign(new Error("Choose a valid historical handover condition."), { statusCode: 400 });
      const rentalPeriod = String(item.rentalPeriod || product.rentalPeriod || "daily");
      if (!["hourly", "daily", "weekly", "weekend", "monthly", "custom"].includes(rentalPeriod)) throw Object.assign(new Error("Choose a valid historical hire period."), { statusCode: 400 });
      const totalAmount = Math.round(quantity * periods * unitHirePrice * 100) / 100;
      return { productId: product.id, quantity, periods, unitHirePrice, rentalPeriod, totalAmount, conditionOut, conditionReturn, notes: item.notes || null };
    });
    const historicalChargeDrafts = normalizedDeliveryFee > 0
      ? [...additionalCharges, { lineType: "service", label: "Delivery charge", category: "delivery", quantity: 1, unitPrice: normalizedDeliveryFee }]
      : additionalCharges;
    const chargeLines = await Promise.all(historicalChargeDrafts.map(async line => {
      const lineType = String(line?.lineType || "service").toLowerCase();
      const productId = String(line?.productId || "").trim() || null;
      const product = productId ? chargesById.get(productId) : null;
      const label = String(line?.label || product?.name || "").trim();
      const quantity = Number(line?.quantity ?? 1);
      const unitPrice = toMoney(line?.unitPrice, Number(product?.price ?? -1));
      const unitCost = toMoney(line?.unitCost, 0);
      const category = await resolveRentalChargeCategory(scope.tenantId, line?.category || "service");
      if (!label || label.length > 120 || !["service", "consumable"].includes(lineType) || !category || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 || unitPrice < 0 || unitCost < 0) throw Object.assign(new Error("Historical service or goods details are invalid. Choose a standard or saved rental category."), { statusCode: 400 });
      if (productId && !product) throw Object.assign(new Error("A selected historical charge item was not found."), { statusCode: 400 });
      if (lineType === "consumable" && (!product || product.itemType !== "product" || !Number.isInteger(quantity))) throw Object.assign(new Error("Historical goods lines require a catalog product and whole-unit quantity."), { statusCode: 400 });
      if (productId && lineType === "service" && product.itemType !== "service") throw Object.assign(new Error("Catalog-linked service lines must use a saved service item."), { statusCode: 400 });
      return { lineType, productId, unitCost, label, category, quantity, unitPrice, totalAmount: Math.round(quantity * unitPrice * 100) / 100 };
    }));
    const grossTotal = [...rentalLines, ...chargeLines].reduce((sum, line) => sum + line.totalAmount, 0);
    const discountAmount = toMoney(discount, -1);
    const rate = toMoney(taxRate, -1);
    const deposit = toMoney(depositAmount, -1);
    if (discountAmount < 0 || discountAmount > grossTotal + 0.01 || rate < 0 || rate > 100 || deposit < 0) return res.status(400).json({ error: "Historical discount, tax rate, or deposit is invalid." });
    const lineAmounts = allocateRentalLineAmounts(rentalLines, chargeLines, discountAmount, rate);
    const taxAmount = lineAmounts.taxAmount;
    const totalAmount = Math.max(0, Math.round((grossTotal - discountAmount + taxAmount) * 100) / 100);
    const normalizedPayments = payments.map((payment, index) => {
      const kind = String(payment?.kind || "rental_payment");
      const amount = toMoney(payment?.amount, -1);
      const paymentMethod = String(payment?.paymentMethod || "").toLowerCase();
      const paymentDate = dateValue(payment?.paymentDate, `Payment ${index + 1} date`);
      if (String(payment?.paymentDate || "") > todayBusinessDate || !["rental_payment", "deposit", "deposit_refund"].includes(kind) || amount <= 0 || !["cash", "safe", "mobile_money", "bank_transfer", "card", "cheque", "other"].includes(paymentMethod)) throw Object.assign(new Error(`Historical payment ${index + 1} needs a valid past date, amount, type, and payment method.`), { statusCode: 400 });
      if (paymentMethod === "mobile_money" && (!payment.mobileProvider || !payment.phoneNumber || !payment.transactionRef)) throw Object.assign(new Error(`Historical mobile-money payment ${index + 1} requires its provider, phone, and transaction reference.`), { statusCode: 400 });
      if (["card", "bank_transfer", "cheque"].includes(paymentMethod) && !payment.transactionRef) throw Object.assign(new Error(`Historical ${paymentMethod.replaceAll("_", " ")} payment ${index + 1} requires its transaction reference.`), { statusCode: 400 });
      return { kind, amount, paymentMethod, paymentDate, mobileProvider: payment.mobileProvider || null, phoneNumber: payment.phoneNumber || null, transactionRef: payment.transactionRef || null, notes: payment.notes || null, index };
    }).sort((a, b) => a.paymentDate - b.paymentDate || a.index - b.index);
    const paymentTotals = allocateHistoricalPaymentBalances(totalAmount, deposit, normalizedPayments);
    const { payments: balancedPayments, amountPaid, depositPaid, depositRefunded, balance } = paymentTotals;
    if (collectUnpaidBalance && balance <= 0) return res.status(400).json({ error: "This historical booking has no unpaid amount to add to receivables." });
    const originalReference = String(historicalReference || "").trim().slice(0, 120) || null;
    const rentalNo = `HIST-${hireAt.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const created = await prisma.$transaction(async tx => {
      const prior = await tx.rental.findFirst({ where: { tenantId: scope.tenantId, historicalImportKey: importKey } });
      if (prior) return tx.rental.findUnique({ where: { id: prior.id }, include: { customer: true, branch: true, User: userSelect, items: { include: { product: { select: { id: true, name: true, sku: true } } } }, chargeLines: true, payments: { where: { status: "historical" }, orderBy: { paymentDate: "asc" } } } });
      const rental = await tx.rental.create({
        data: {
          rentalNo, tenantId: scope.tenantId, branchId: scope.branchId, customerId: customerId || null,
          customerName: String(customerName || "").trim() || null, customerPhone: String(customerPhone || "").trim() || null,
          userId: req.user.id, hireDate: hireAt, expectedReturnDate: expectedAt, actualReturnDate: returnedAt,
          totalAmount, depositAmount: deposit, depositStatus: paymentTotals.heldDeposit > 0 ? "held" : depositPaid ? "refunded" : "not_required",
          depositPaid, depositRefunded, amountPaid, balance, paymentStatus: balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
          paymentMethod: normalizedPayments[0]?.paymentMethod || "historical", discount: discountAmount, taxRate: rate, taxAmount,
          status: "returned", bookingState: "returned", bookingPurpose: String(bookingPurpose || "").trim().slice(0, 500) || null,
          deliveryAddress: normalizedDeliveryAddress || null, deliveryFee: normalizedDeliveryFee,
          isHistoricalRecord: true, historicalImportKey: importKey,
          historicalReference: originalReference,
          isHistoricalReceivable: Boolean(collectUnpaidBalance),
          historicalReceivableAmount: collectUnpaidBalance ? balance : 0,
          notes: [collectUnpaidBalance
            ? "Historical rental documented. Its unpaid balance was added to customer receivables against rental opening equity; no historical revenue, cash, or stock movement was recreated."
            : "Historical booking record; no current stock, cash, customer-control, or general-ledger movement was created.", String(notes || "").trim()].filter(Boolean).join("\n"),
          items: { create: lineAmounts.items.map(item => ({ ...item, conditionOut: item.conditionOut || "good" })) },
          chargeLines: { create: lineAmounts.chargeLines },
        },
      });
      if (collectUnpaidBalance) {
        const config = await ensureRentalAccounting(tx, scope.tenantId);
        const reference = originalReference || rentalNo;
        await postRentalJournal(tx, {
          tenantId: scope.tenantId, branchId: scope.branchId, userId: req.user.id,
          sourceType: "RENTAL_HISTORICAL_RECEIVABLE", sourceId: rental.id,
          reference,
          description: `Historical rental receivable cutover for ${reference}; original hire date ${hireAt.toISOString().slice(0, 10)}. No historical revenue or cash is recreated.`,
          lines: [
            { accountId: config.receivableAccountId, debit: balance, credit: 0, description: `Collectible historical rental balance ${reference}` },
            { accountId: config.openingEquityAccountId, debit: 0, credit: balance, description: `Historical rental opening control ${reference}` },
          ],
        });
      }
      for (const payment of balancedPayments) {
        const receiptNo = `RNT-H-${hireAt.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
        await tx.rentalPayment.create({ data: {
          tenantId: scope.tenantId, rentalId: rental.id, userId: req.user.id, kind: payment.kind,
          receiptNo, idempotencyKey: `historical:${importKey}:${payment.index}`.slice(0, 120), amount: payment.amount,
          balanceAfter: payment.balanceAfter,
          paymentMethod: payment.paymentMethod, mobileProvider: payment.mobileProvider, phoneNumber: payment.phoneNumber,
          paymentDate: payment.paymentDate, transactionRef: payment.transactionRef,
          notes: ["Historical receipt copy; no new funds were received or paid in JibuSales.", payment.notes].filter(Boolean).join(" "), status: "historical",
        } });
      }
      return tx.rental.findUnique({ where: { id: rental.id }, include: { customer: true, branch: true, User: userSelect, items: { include: { product: { select: { id: true, name: true, sku: true } } } }, chargeLines: true, payments: { where: { status: "historical" }, orderBy: { paymentDate: "asc" } } } });
    }, { isolationLevel: "Serializable" });
    res.status(201).json(withUser(created));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2002") return res.status(409).json({ error: "This historical booking was already saved. Refresh the booking list before retrying." });
    if (err.code === "P2034") return res.status(409).json({ error: "Another update happened at the same time. Refresh and retry." });
    handleBranchError(res, err, "Failed to record historical booking.");
  }
});

router.post("/:id/historical-receivable", authenticateToken, requirePermission("canCreateRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", requireBranch: false, allowOwnerAll: true });
    const customerId = String(req.body?.customerId || "").trim();
    const historicalReference = String(req.body?.historicalReference || "").trim().slice(0, 120) || null;
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM rentals WHERE id = ${req.params.id} AND "tenantId" = ${scope.tenantId} FOR UPDATE`;
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id, isHistoricalRecord: true }) });
      if (!rental) throw Object.assign(new Error("Historical rental record not found."), { statusCode: 404 });
      if (rental.isHistoricalReceivable) return rental;
      const resolvedCustomerId = customerId || rental.customerId;
      if (!resolvedCustomerId) throw Object.assign(new Error("Select an existing customer to make this historical balance collectible."), { statusCode: 400 });
      const customer = await tx.customer.findFirst({ where: scopedWhere(scope, { id: resolvedCustomerId }), select: { id: true } });
      if (!customer) throw Object.assign(new Error("Customer was not found in this business or permitted branch."), { statusCode: 404 });
      const outstanding = Math.round(Number(rental.balance || 0) * 100) / 100;
      if (!(outstanding > 0)) throw Object.assign(new Error("This historical booking has no unpaid balance to add to receivables."), { statusCode: 400 });
      const reference = historicalReference || rental.historicalReference || rental.rentalNo;
      const updated = await tx.rental.update({ where: { id: rental.id }, data: {
        customerId: resolvedCustomerId,
        isHistoricalReceivable: true,
        historicalReceivableAmount: outstanding,
        historicalReference: historicalReference || rental.historicalReference || null,
      } });
      const config = await ensureRentalAccounting(tx, scope.tenantId);
      await postRentalJournal(tx, {
        tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id,
        sourceType: "RENTAL_HISTORICAL_RECEIVABLE", sourceId: rental.id,
        reference,
        description: `Historical rental receivable cutover for ${reference}; original hire date ${rental.hireDate.toISOString().slice(0, 10)}. No historical revenue or cash is recreated.`,
        lines: [
          { accountId: config.receivableAccountId, debit: outstanding, credit: 0, description: `Collectible historical rental balance ${reference}` },
          { accountId: config.openingEquityAccountId, debit: 0, credit: outstanding, description: `Historical rental opening control ${reference}` },
        ],
      });
      return updated;
    }, { isolationLevel: "Serializable" });
    res.json({ rental: result });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2002") return res.status(409).json({ error: "This historical balance was already added to receivables." });
    if (err.code === "P2034") return res.status(409).json({ error: "Another update happened at the same time. Refresh and retry." });
    handleBranchError(res, err, "Failed to add historical rental balance to receivables.");
  }
});

// Create new rental (hire out items)
router.post("/", authenticateToken, requirePermission("canCreateRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", requireBranch: true, allowOwnerAll: false });
    const {
      customerId,
      customerName,
      customerPhone,
      items,
      additionalCharges = [],
      hireDate,
      expectedReturnDate,
      paymentMethod = "cash",
      amountPaid = 0,
      depositAmount = 0,
      discount = 0,
      notes,
      guarantorName,
      guarantorPhone,
      customerNin,
      mobileProvider,
      phoneNumber,
      transactionId,
      cashAccountId,
      bookingMode = "checkout",
      bookingPurpose,
      deliveryAddress,
      deliveryFee = 0,
    } = req.body;

    if (!Array.isArray(items)) return res.status(400).json({ error: "Rental items must be a list." });
    if (!Array.isArray(additionalCharges) || additionalCharges.length > 50) return res.status(400).json({ error: "Enter no more than 50 additional service or fee lines." });
    if (items.length === 0 && additionalCharges.length === 0) return res.status(400).json({ error: "Add a rental asset or at least one service/venue charge." });
    const normalizedDeliveryAddress = String(deliveryAddress || "").trim().slice(0, 500);
    const normalizedDeliveryFee = Math.round(toMoney(deliveryFee, -1) * 100) / 100;
    if (normalizedDeliveryFee < 0 || (normalizedDeliveryFee > 0 && !normalizedDeliveryAddress)) return res.status(400).json({ error: "Enter a delivery destination for a delivery charge, and use a non-negative fee." });
    if (normalizedDeliveryFee > 0 && additionalCharges.some(charge => String(charge?.category || "").toLowerCase() === "delivery")) return res.status(400).json({ error: "Enter the delivery fee either in the delivery field or as a delivery charge line, not both." });
    if (!expectedReturnDate) return res.status(400).json({ error: "Expected return date is required" });
    const startDate = bookingMode === "checkout" ? new Date() : hireDate ? new Date(hireDate) : new Date();
    const endDate = new Date(expectedReturnDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(expectedReturnDate))) endDate.setUTCHours(23, 59, 59, 999);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return res.status(400).json({ error: "Expected return date must be after hire date" });
    }
    if (!customerId && !customerName?.trim()) return res.status(400).json({ error: "Select a customer or enter the renter's name." });
    if (!customerId && !customerPhone?.trim()) return res.status(400).json({ error: "Enter the renter's phone number." });
    if (!customerId && !customerNin?.trim()) return res.status(400).json({ error: "Enter the renter's National ID (NIN)." });
    if (!['reserve', 'checkout'].includes(bookingMode)) return res.status(400).json({ error: "Choose reservation or check-out." });
    if (!paymentMethod) return res.status(400).json({ error: "Payment method is required" });
      if (paymentMethod === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionId)) {
      return res.status(400).json({ error: "Mobile money requires provider, phone number, and transaction ID" });
    }
    if (paymentMethod === "card" && !transactionId) {
      return res.status(400).json({ error: "Card payment requires a transaction ID" });
    }
    if (paymentMethod === "bank_transfer" && (toMoney(amountPaid) > 0 || toMoney(depositAmount) > 0) && !transactionId) {
      return res.status(400).json({ error: "Bank transfers require a transfer reference." });
    }

    // Verify customer if provided
    let customer = null;
    if (customerId) {
      customer = await prisma.customer.findFirst({ where: scopedWhere(scope, { id: customerId }) });
      if (!customer) return res.status(404).json({ error: "Customer not found" });
    }

    // Verify products are rental type and have stock
    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    const products = await prisma.product.findMany({
      where: scopedWhere(scope, { id: { in: productIds }, isActive: { not: false } }),
    });
    const productsById = new Map(products.map((p) => [p.id, p]));

    if (products.length !== productIds.length) return res.status(400).json({ error: "One or more items were not found" });

    const rentalItems = items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 400 });
      if (product.itemType !== "rental") throw Object.assign(new Error(`${product.name} is not a rental item`), { statusCode: 400 });

      const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
      const unitHirePrice = toMoney(item.unitHirePrice, product.rentalPrice || product.price || 0);
      const periods = Math.max(1, Number.parseInt(item.periods, 10) || 1);
      const totalAmount = unitHirePrice * quantity * periods;

      return {
        productId: item.productId,
        quantity,
        unitHirePrice,
        rentalPeriod: item.rentalPeriod || product.rentalPeriod || "daily",
        periods,
        totalAmount,
        conditionOut: item.conditionOut || "good",
        notes: item.notes || null,
      };
    });

    const subtotal = rentalItems.reduce((sum, i) => sum + i.totalAmount, 0);
    const chargeProductIds = [...new Set(additionalCharges.map(charge => String(charge?.productId || "").trim()).filter(Boolean))];
    const chargeProducts = chargeProductIds.length ? await prisma.product.findMany({
      where: scopedWhere(scope, { id: { in: chargeProductIds }, isActive: true }),
      select: { id: true, name: true, itemType: true, cost: true, price: true, quantity: true },
    }) : [];
    if (chargeProducts.length !== chargeProductIds.length) return res.status(400).json({ error: "A selected service or consumable item was not found in this business or branch." });
    const chargeProductsById = new Map(chargeProducts.map(product => [product.id, product]));
    const chargeDrafts = normalizedDeliveryFee > 0
      ? [...additionalCharges, { lineType: "service", label: "Delivery charge", category: "delivery", quantity: 1, unitPrice: normalizedDeliveryFee }]
      : additionalCharges;
    const chargeLines = await Promise.all(chargeDrafts.map(async (charge) => {
      const lineType = String(charge?.lineType || "service").trim().toLowerCase();
      const productId = String(charge?.productId || "").trim() || null;
      const product = productId ? chargeProductsById.get(productId) : null;
      const label = String(charge?.label || product?.name || "").trim();
      const category = await resolveRentalChargeCategory(scope.tenantId, charge?.category || "service");
      const quantity = Number(charge?.quantity ?? 1);
      const unitPrice = toMoney(charge?.unitPrice, product?.price ?? -1);
      if (!label || label.length > 120 || !["service", "consumable"].includes(lineType) || !category || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 || unitPrice < 0) {
        throw Object.assign(new Error("Check the additional service/charge lines. Choose a standard or saved rental category and valid names, quantities, or prices."), { statusCode: 400 });
      }
      if (lineType === "consumable" && (!product || product.itemType !== "product" || !Number.isInteger(quantity) || Number(product.cost) <= 0)) {
        throw Object.assign(new Error("Consumable lines must use an active stocked product with a whole quantity and a saved cost price."), { statusCode: 400 });
      }
      if (productId && lineType === "service" && product?.itemType !== "service") {
        throw Object.assign(new Error("Catalog-linked service lines must select an item classified as a service."), { statusCode: 400 });
      }
      if (lineType === "consumable" && bookingMode === "checkout" && Number(product?.quantity || 0) < quantity) {
        throw Object.assign(new Error(`Not enough stock for “${product?.name}”. Reduce the quantity or restock before check-out.`), { statusCode: 409 });
      }
      return { lineType, productId, unitCost: lineType === "consumable" ? Number(product.cost) : 0, label, category, quantity, unitPrice, totalAmount: Math.round(quantity * unitPrice * 100) / 100 };
    }));
    const chargeTotal = chargeLines.reduce((sum, line) => sum + line.totalAmount, 0);
    const grossSubtotal = subtotal + chargeTotal;
    const discountAmount = toMoney(discount);
    if (discountAmount > grossSubtotal + 0.01) return res.status(400).json({ error: "Discount cannot exceed the booking subtotal." });
    const taxableAmount = Math.max(0, grossSubtotal - discountAmount);

    // Fetch tenant tax settings
    const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { taxEnabled: true, taxRate: true } });
    const taxRate = (tenant?.taxEnabled && tenant?.taxRate) ? tenant.taxRate / 100 : 0;
    const lineAmounts = allocateRentalLineAmounts(rentalItems, chargeLines, discountAmount, taxRate * 100);
    const pricedRentalItems = lineAmounts.items;
    const pricedChargeLines = lineAmounts.chargeLines;
    const taxAmount = lineAmounts.taxAmount;
    const totalAmount = Math.max(0, taxableAmount + taxAmount);

    const deposit = toMoney(depositAmount);
    if (deposit < 0 || discountAmount < 0 || toMoney(amountPaid) < 0) return res.status(400).json({ error: "Discount, deposit, and payment amounts cannot be negative." });
    if (toMoney(amountPaid) > totalAmount + 0.01) return res.status(400).json({ error: "Payment exceeds the rental charge. Record any excess as a separately approved customer advance rather than hiding it in this rental." });
    const paid = Math.min(toMoney(amountPaid), totalAmount);
    if (bookingMode === "checkout" && totalAmount - paid > 0.01 && !customerId) {
      return res.status(400).json({ error: "Link the renter to an existing customer before recording an unpaid rental balance. This is required to track and collect the receivable." });
    }
    if ((paid > 0 || deposit > 0) && !cashAccountId) return res.status(400).json({ error: "Select the transaction account receiving rental payments and deposits." });
    const balance = totalAmount;
    const paymentStatus = totalAmount > 0 ? "unpaid" : "paid";
    const rentalNo = `HIRE-${Date.now()}`;
    const rental = await prisma.$transaction(async (tx) => {
      const availability = await getRentalAvailability(tx, scope, productIds, startDate, endDate);
      for (const item of rentalItems) {
        const available = availability.find((row) => row.productId === item.productId)?.available || 0;
        if (available < item.quantity) throw Object.assign(new Error(`${productsById.get(item.productId).name}: ${available} available for these dates.`), { statusCode: 409 });
      }
      const created = await tx.rental.create({
        data: {
          rentalNo,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          customerId: customerId || null,
          customerName: customer?.name || customerName?.trim() || null,
          customerPhone: customer?.phone || customerPhone?.trim() || null,
          userId: req.user.id,
          hireDate: startDate,
          expectedReturnDate: endDate,
          totalAmount,
          depositAmount: deposit,
          depositStatus: "not_required",
          depositPaid: 0,
          amountPaid: 0,
          balance,
          paymentStatus,
          paymentMethod,
          mobileProvider: paymentMethod === "mobile_money" ? mobileProvider : null,
          phoneNumber: paymentMethod === "mobile_money" ? phoneNumber : null,
          transactionId: ["mobile_money", "card"].includes(paymentMethod) ? transactionId : null,
          discount: discountAmount,
          taxRate: tenant?.taxRate || 0,
          taxAmount,
          guarantorName: guarantorName || null,
          guarantorPhone: guarantorPhone || null,
          customerNin: customerNin || null,
          status: "active",
          bookingState: bookingMode === "reserve" ? "reserved" : "checked_out",
          bookingPurpose: String(bookingPurpose || "").trim().slice(0, 500) || null,
          deliveryAddress: normalizedDeliveryAddress || null,
          deliveryFee: normalizedDeliveryFee,
          notes,
          items: {
            create: pricedRentalItems.map(({ ...rest }) => rest),
          },
          chargeLines: { create: pricedChargeLines },
        },
        include: {
          customer: true,
          branch: true,
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          chargeLines: true,
        },
      });

      if (bookingMode === "checkout") for (const item of rentalItems) {
        await tx.product.update({ where: { id: item.productId }, data: { quantity: { decrement: item.quantity } } });
      }

      if (bookingMode === "checkout" && totalAmount > 0) {
        const config = await ensureRentalAccounting(tx, scope.tenantId);
        await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: scope.branchId, userId: req.user.id, sourceType: "RENTAL_ISSUE", sourceId: created.id, reference: rentalNo, description: `Rental invoice ${rentalNo}`, lines: rentalInvoiceLines(config, { total: totalAmount, tax: taxAmount, reference: rentalNo }) });
      }
      if (bookingMode === "checkout") await consumeRentalChargeStockTx(tx, { tenantId: scope.tenantId, rental: created, userId: req.user.id });
      if (paid > 0) await recordRentalPaymentTx(tx, { req, tenantId: scope.tenantId, rental: created, amount: paid, method: paymentMethod, cashAccountId, kind: bookingMode === "reserve" ? "rental_advance" : "rental_payment", transactionRef: transactionId, mobileProvider, phoneNumber });
      if (deposit > 0) await recordRentalPaymentTx(tx, { req, tenantId: scope.tenantId, rental: created, amount: deposit, method: paymentMethod, cashAccountId, kind: "deposit", transactionRef: transactionId, mobileProvider, phoneNumber, notes: "Refundable security deposit" });

      return tx.rental.findUnique({ where: { id: created.id }, include: { customer: true, branch: true, User: userSelect, items: { include: { product: { select: { id: true, name: true, sku: true } } } }, chargeLines: true, payments: { where: { status: "posted" }, include: { cashAccount: { select: { id: true, name: true, type: true } } }, orderBy: { paymentDate: "asc" } } } });
    }, { isolationLevel: "Serializable" });

    res.status(201).json(withUser(rental));
  } catch (err) {
    console.error("Create rental error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "Availability changed while saving. Refresh dates and try again." });
    handleBranchError(res, err, "Failed to create rental");
  }
});

router.post("/:id/checkout", authenticateToken, requirePermission("canEditRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const rental = await prisma.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }), include: { items: true, chargeLines: true } });
    if (!rental) return res.status(404).json({ error: "Rental not found." });
    if (rental.status !== "active" || !["reserved", "confirmed"].includes(rental.bookingState) || rental.isHistoricalRecord) return res.status(409).json({ error: "Only an active, uncompleted reservation can be checked out." });
    if (!rental.customerId && Number(rental.totalAmount) - Number(rental.amountPaid || 0) > 0.01) {
      return res.status(409).json({ error: "Link this renter to an existing customer before check-out so any unpaid rental balance can be tracked and collected." });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const checkoutStart = new Date();
      if (new Date(rental.expectedReturnDate) <= checkoutStart) throw Object.assign(new Error("The reserved return date has passed. Update the reservation before check-out."), { statusCode: 409 });
      const availability = await getRentalAvailability(tx, scope, rental.items.map((item) => item.productId), checkoutStart, rental.expectedReturnDate, rental.id);
      for (const item of rental.items) if ((availability.find((row) => row.productId === item.productId)?.available || 0) < item.quantity) throw Object.assign(new Error("Availability changed since reservation. Adjust the reservation before check-out."), { statusCode: 409 });
      for (const item of rental.items) await tx.product.update({ where: { id: item.productId }, data: { quantity: { decrement: item.quantity } } });
      await consumeRentalChargeStockTx(tx, { tenantId: scope.tenantId, rental, userId: req.user.id });
      const checkedOut = await tx.rental.update({ where: { id: rental.id }, data: { bookingState: "checked_out", hireDate: new Date() }, include: { customer: true, branch: true, User: userSelect, items: { include: { product: { select: { id: true, name: true, sku: true } } } }, chargeLines: true } });
      if (Number(checkedOut.totalAmount) > 0) {
        const config = await ensureRentalAccounting(tx, scope.tenantId);
        await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: checkedOut.branchId, userId: req.user.id, sourceType: "RENTAL_ISSUE", sourceId: checkedOut.id, reference: checkedOut.rentalNo, description: `Rental invoice ${checkedOut.rentalNo}`, lines: rentalInvoiceLines(config, { total: checkedOut.totalAmount, tax: checkedOut.taxAmount, reference: checkedOut.rentalNo }) });
        const advances = await tx.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, rentalId: checkedOut.id, status: "posted", kind: "rental_advance" }, _sum: { amount: true } });
        const advanceAmount = Number(advances._sum.amount || 0);
        if (advanceAmount > 0) await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: checkedOut.branchId, userId: req.user.id, sourceType: "RENTAL_ADVANCE_APPLICATION", sourceId: checkedOut.id, reference: checkedOut.rentalNo, description: `Apply reservation advances to rental invoice ${checkedOut.rentalNo}`, lines: [{ accountId: config.deferredRevenueAccountId, debit: advanceAmount, credit: 0, description: `Release advance liability ${checkedOut.rentalNo}` }, { accountId: config.receivableAccountId, debit: 0, credit: advanceAmount, description: `Apply renter advance ${checkedOut.rentalNo}` }] });
      }
      return checkedOut;
    }, { isolationLevel: "Serializable" });
    res.json(withUser(updated));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "Availability changed while checking out. Please try again." });
    handleBranchError(res, err, "Failed to check out rental");
  }
});

// Process return of rental items
router.post("/:id/return", authenticateToken, requirePermission("canProcessRentalReturn"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { id } = req.params;
    const { items: returnItems, damageFees = {} } = req.body;

    const rental = await prisma.rental.findFirst({
      where: scopedWhere(scope, { id }),
      include: { items: { include: { product: true } }, chargeLines: true, customer: true },
    });

    if (!rental) return res.status(404).json({ error: "Rental not found" });
    if (rental.status === "returned") return res.status(400).json({ error: "Rental already returned" });
    if (rental.status === "cancelled") return res.status(400).json({ error: "Rental was cancelled" });
    if (rental.bookingState !== "checked_out") return res.status(400).json({ error: "A reservation must be checked out before items can be returned." });
    if (rental.depositAmount > 0 && req.body.depositStatus && req.body.depositStatus !== "held") {
      return res.status(409).json({ error: "The security deposit must remain held until its refund or forfeiture is recorded through an accounting payment workflow." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await ensureLegacyRentalOpeningEntry(tx, { tenantId: scope.tenantId, rental, userId: req.user.id });
      let totalDamageFee = 0;

      // Process each returned item
      for (const rentalItem of rental.items) {
        const returnInfo = returnItems?.find((ri) => ri.rentalItemId === rentalItem.id);
        const conditionReturn = returnInfo?.conditionReturn || "good";
        const damageFee = toMoney(damageFees[rentalItem.id] || returnInfo?.damageFee || 0);

        if (damageFee > 0) totalDamageFee += damageFee;

        // Update rental item with return condition and damage fee
        await tx.rentalItem.update({
          where: { id: rentalItem.id },
          data: {
            conditionReturn,
            damageFee: damageFee > 0 ? damageFee : null,
          },
        });

        // Increment stock back (item returned)
        // If condition is "broken", don't return to stock
        if (conditionReturn !== "broken") {
          await tx.product.update({
            where: { id: rentalItem.productId },
            data: { quantity: { increment: rentalItem.quantity } },
          });
        }
      }

      // Update rental status
      const depositCollected = Number(rental.depositPaid || 0) > 0 || (rental.depositStatus === "collected" && Number(rental.depositAmount) > 0);
      const nextTotal = Number(rental.totalAmount) + totalDamageFee;
      const finalPaidStatus = Number(rental.amountPaid) >= nextTotal ? "paid" : Number(rental.amountPaid) > 0 ? "partial" : "unpaid";
      const finalDepositStatus = depositCollected ? "held" : "not_required";
      const updatedRental = await tx.rental.update({
        where: { id },
        data: {
          status: "returned",
          bookingState: "returned",
          actualReturnDate: new Date(),
          depositStatus: finalDepositStatus,
          balance: rental.balance + totalDamageFee,
          totalAmount: nextTotal,
          paymentStatus: finalPaidStatus,
        },
        include: {
          customer: true,
          branch: true,
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
      });

      const issued = await tx.journalEntry.findFirst({ where: { tenantId: scope.tenantId, sourceType: "RENTAL_ISSUE", sourceId: rental.id } });
      if (issued && Number(rental.totalAmount) - Number(rental.taxAmount || 0) > 0) {
        const config = await ensureRentalAccounting(tx, scope.tenantId);
        const goodsNet = rental.chargeLines.filter(line => line.lineType === "consumable").reduce((sum, line) => sum + Number(line.netAmount || 0), 0);
        await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_EARNED_REVENUE", sourceId: rental.id, reference: rental.rentalNo, description: `Recognize earned booking income ${rental.rentalNo}`, lines: rentalMixedRevenueRecognitionLines(config, { amount: Math.max(0, Number(rental.totalAmount) - Number(rental.taxAmount || 0)), goodsAmount: goodsNet, reference: rental.rentalNo }) });
      }
      if (totalDamageFee > 0) {
        const config = await ensureRentalAccounting(tx, scope.tenantId);
        await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_DAMAGE_CHARGE", sourceId: rental.id, reference: rental.rentalNo, description: `Rental damage charges ${rental.rentalNo}`, lines: rentalDamageChargeLines(config, { amount: totalDamageFee, reference: rental.rentalNo }) });
      }

      return updatedRental;
    });

    res.json(withUser(updated));
  } catch (err) {
    console.error("Return rental error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    handleBranchError(res, err, "Failed to process rental return");
  }
});

// Update rental (before items go out)
router.put("/:id", authenticateToken, requirePermission("canEditRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { id } = req.params;
    const { expectedReturnDate, notes, paymentMethod, amountPaid } = req.body;

    const rental = await prisma.rental.findFirst({ where: scopedWhere(scope, { id }) });
    if (!rental) return res.status(404).json({ error: "Rental not found" });
    if (rental.status === "returned") return res.status(400).json({ error: "Cannot edit a returned rental" });

    const data = {};
    if (expectedReturnDate) data.expectedReturnDate = new Date(expectedReturnDate);
    if (notes !== undefined) data.notes = notes;
    if (paymentMethod) data.paymentMethod = paymentMethod;
    if (amountPaid !== undefined) {
      if (Math.abs(toMoney(amountPaid) - Number(rental.amountPaid || 0)) > 0.01) return res.status(409).json({ error: "Rental payments cannot be edited as a total. Record a payment with its receipt and transaction account instead." });
    }

    const updated = await prisma.rental.update({
      where: { id },
      data,
      include: { customer: true, branch: true, User: userSelect, items: { include: { product: { select: { id: true, name: true } } } }, chargeLines: true },
    });

    res.json(withUser(updated));
  } catch (err) {
    console.error("Update rental error:", err);
    handleBranchError(res, err, "Failed to update rental");
  }
});

async function cancelRentalReservation(req, res) {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: req.method === "DELETE" ? "query" : "body", allowOwnerAll: true });
    const percentInput = req.body?.chargePercent ?? 0;
    const chargePercent = Number(percentInput);
    const reason = String(req.body?.reason || (req.method === "DELETE" ? "Cancelled through legacy cancellation action" : "")).trim().slice(0, 500);
    if (!Number.isFinite(chargePercent) || chargePercent < 0 || chargePercent > 100) return res.status(400).json({ error: "Cancellation charge must be between 0 and 100 percent." });
    if (reason.length < 3) return res.status(400).json({ error: "Enter a cancellation reason (at least 3 characters)." });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM rentals WHERE id = ${req.params.id} AND "tenantId" = ${scope.tenantId} FOR UPDATE`;
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      if (!rental) throw Object.assign(new Error("Rental not found."), { statusCode: 404 });
      if (rental.status === "cancelled") throw Object.assign(new Error("This booking is already cancelled."), { statusCode: 409 });
      if (rental.status === "returned") throw Object.assign(new Error("A returned booking cannot be cancelled."), { statusCode: 409 });
      if (rental.bookingState === "checked_out") throw Object.assign(new Error("Checked-out items must go through the return inspection before cancellation."), { statusCode: 409 });
      if (rental.isHistoricalRecord) throw Object.assign(new Error("Historical bookings cannot be cancelled as current transactions."), { statusCode: 409 });
      const issuedCreditNotes = await tx.rentalCreditNote.count({ where: { tenantId: scope.tenantId, rentalId: rental.id, status: "issued" } });
      if (issuedCreditNotes) throw Object.assign(new Error("Cancel or settle issued rental credit notes before cancelling this booking."), { statusCode: 409 });
      const [advances, advanceRefunds] = await Promise.all([
        tx.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, rentalId: rental.id, status: "posted", kind: "rental_advance" }, _sum: { amount: true } }),
        tx.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, rentalId: rental.id, status: "posted", kind: "rental_advance_refund" }, _sum: { amount: true } }),
      ]);
      const advanceAmount = Math.max(0, Math.round((Number(advances._sum.amount || 0) - Number(advanceRefunds._sum.amount || 0)) * 100) / 100);
      const feeAmount = Math.round(Number(rental.totalAmount || 0) * chargePercent) / 100;
      const feeTax = Number(rental.totalAmount) > 0
        ? Math.round(Math.min(feeAmount, Number(rental.taxAmount || 0) * feeAmount / Number(rental.totalAmount)) * 100) / 100
        : 0;
      const advanceApplied = Math.min(feeAmount, advanceAmount);
      const refundDue = Math.round(Math.max(0, advanceAmount - advanceApplied) * 100) / 100;
      const feeReceivable = Math.round(Math.max(0, feeAmount - advanceApplied) * 100) / 100;
      if (advanceAmount > 0 || feeAmount > 0) {
        const config = await ensureRentalAccounting(tx, scope.tenantId);
        await postRentalJournal(tx, {
          tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id,
          sourceType: "RENTAL_CANCELLATION", sourceId: rental.id, reference: rental.rentalNo,
          description: `Booking cancellation · ${reason}`,
          lines: rentalCancellationLines(config, { advanceAmount, feeAmount, taxAmount: feeTax, refundDue, feeReceivable, reference: rental.rentalNo }),
        });
      }
      const updated = await tx.rental.update({
        where: { id: rental.id },
        data: {
          status: "cancelled", bookingState: "cancelled", cancellationChargePercent: chargePercent,
          cancellationChargeAmount: feeAmount, cancellationTaxAmount: feeTax, cancellationChargeBalance: feeReceivable,
          cancellationRefundDue: refundDue, cancellationRefundedAmount: 0, cancellationReason: reason,
          cancelledAt: new Date(), cancelledById: req.user.id, balance: feeReceivable,
          paymentStatus: feeReceivable <= 0.01 ? "paid" : "unpaid",
        },
      });
      return { rental: updated, advanceAmount, feeAmount, feeTax, refundDue, feeReceivable };
    }, { isolationLevel: "Serializable" });
    return res.json({
      message: "Booking cancelled. Any fee due remains in receivables; any refund due is tracked separately from cash until paid.",
      cancellation: result,
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "The booking changed while cancellation was being recorded. Refresh and retry." });
    console.error("Cancel rental error:", err);
    handleBranchError(res, err, "Failed to cancel rental");
  }
}

router.post("/:id/cancel", authenticateToken, requireAnyPermission(["canCancelRental", "canDeleteRental"]), requireTenant, requireFeature("rentals"), cancelRentalReservation);
router.delete("/:id", authenticateToken, requireAnyPermission(["canCancelRental", "canDeleteRental"]), requireTenant, requireFeature("rentals"), cancelRentalReservation);

// Rentals summary/report
router.get("/report/summary", authenticateToken, requirePermission("canViewReportRentalsSummary"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });

    const [activeRentals, reservedRentals, overdueRentals, totalRevenue, depositRows] = await Promise.all([
      prisma.rental.count({ where: scopedWhere(scope, { isHistoricalRecord: false, status: "active", bookingState: "checked_out" }) }),
      prisma.rental.count({ where: scopedWhere(scope, { isHistoricalRecord: false, status: "active", bookingState: { in: ["reserved", "confirmed"] } }) }),
      prisma.rental.count({
        where: scopedWhere(scope, {
          isHistoricalRecord: false,
          status: "active",
          bookingState: "checked_out",
          expectedReturnDate: { lt: new Date() },
        }),
      }),
      prisma.rental.aggregate({
        where: scopedWhere(scope, { isHistoricalRecord: false, status: "returned" }),
        _sum: { totalAmount: true },
      }),
      prisma.rental.findMany({ where: scopedWhere(scope, { isHistoricalRecord: false, status: { not: "cancelled" }, depositStatus: { in: ["collected", "held"] } }), select: { depositAmount: true, depositPaid: true, depositRefunded: true } }),
    ]);

    res.json({
      activeRentals,
      reservedRentals,
      overdueRentals,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      totalDepositsHeld: depositRows.reduce((sum, row) => sum + Math.max(0, Number(row.depositPaid || row.depositAmount || 0) - Number(row.depositRefunded || 0)), 0),
    });
  } catch (err) {
    console.error("Rental summary error:", err);
    handleBranchError(res, err, "Failed to fetch rental summary");
  }
});

export default router;
