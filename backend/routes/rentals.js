import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { authenticateToken, requirePermission, requireAnyPermission, requireTenant, canUseTransactionAccountForPayment } from "../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../src/utils/branchAccess.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { requestBusinessAdvice } from "../src/services/businessAdvisor.js";
import { checkUsageLimit } from "../src/utils/usageLimits.js";
import { customerIdentityConflictMessage, findCustomerIdentityConflict } from "../src/utils/customerIdentity.js";
import { ensureRentalAccounting, ensureRentalCashLedgerAccount, recordRentalCashMovement, postRentalJournal, rentalInvoiceLines, rentalReceiptLines, rentalDepositReceiptLines, rentalDepositRefundLines, rentalDepositForfeitLines, rentalRevenueRecognitionLines, rentalDamageChargeLines, ensureLegacyRentalOpeningEntry } from "../src/services/rentalAccountingService.js";

const router = Router();
const prisma = new PrismaClient();
const contractRequests = new Map();
const crmCollections = new Set(["leads", "activities", "cases", "campaigns"]);
const crmStages = new Set(["new", "qualified", "proposal", "won", "lost"]);
const crmPriorities = new Set(["low", "normal", "high", "urgent"]);
const crmColors = new Set(["yellow", "pink", "blue", "green", "orange", "purple"]);

function crmCanView(req, permission) {
  return req.userPermissions?.[permission] === true || req.user?.permissions?.includes(permission) || req.user?.permissions?.includes("*");
}

function crmWorkspaceForUser(workspace, req) {
  const data = workspace && typeof workspace === "object" && !Array.isArray(workspace) ? workspace : {};
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) && key === "leads" ? value.map(lead => ({
    ...lead,
    ...(!crmCanView(req, "canViewCustomerPhone") ? { contactPhone: null } : {}),
    ...(!crmCanView(req, "canViewCustomerEmail") ? { contactEmail: null } : {}),
  })) : value]));
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
  if (isDeposit && value > Math.max(0, Number(rental.depositAmount || 0) - Number(rental.depositPaid || 0)) + 0.01) throw Object.assign(new Error("Deposit collection cannot exceed the agreed security deposit."), { statusCode: 400 });
  const nextBalance = isDeposit ? Math.max(0, Number(rental.depositAmount || 0) - Number(rental.depositPaid || 0) - value) : Math.max(0, Number(rental.balance || 0) - value);
  const payment = await tx.rentalPayment.create({ data: { tenantId, rentalId: rental.id, cashAccountId: cashAccount.id, userId: req.user.id, kind, receiptNo, idempotencyKey, amount: value, balanceAfter: nextBalance, paymentMethod: method, mobileProvider: mobileProvider || null, phoneNumber: phoneNumber || null, paymentDate, transactionRef: transactionRef || null, notes: notes || null } });
  const cashLedger = await ensureRentalCashLedgerAccount(tx, tenantId, movement.cashAccount);
  const config = await ensureRentalAccounting(tx, tenantId);
  const lines = isDeposit
    ? rentalDepositReceiptLines(config, { amount: value, cashAccountId: cashLedger.id, reference: receiptNo })
    : rentalReceiptLines(config, { amount: value, cashAccountId: cashLedger.id, reference: receiptNo, advance: isAdvance });
  await postRentalJournal(tx, { tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: isDeposit ? "RENTAL_DEPOSIT_RECEIPT" : isAdvance ? "RENTAL_ADVANCE_RECEIPT" : "RENTAL_PAYMENT_RECEIPT", sourceId: payment.id, reference: receiptNo, description: `${kind.replaceAll("_", " ")} ${rental.rentalNo}`, lines });
  if (isDeposit) {
    await tx.rental.update({ where: { id: rental.id }, data: { depositPaid: { increment: value }, depositStatus: "held" } });
  } else {
    await tx.rental.update({ where: { id: rental.id }, data: { amountPaid: { increment: value }, balance: nextBalance, paymentStatus: nextBalance <= 0 ? "paid" : "partial", paymentMethod: method } });
  }
  return payment;
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
      where: scopedWhere(scope, { status: "active", bookingState: "checked_out" }),
      select: { expectedReturnDate: true, balance: true, items: { select: { quantity: true } } },
    });
    const [activeCount, reservations, overdueCount, openBalance, heldDeposits, collections, returnedToday] = await Promise.all([
      prisma.rental.count({ where: scopedWhere(scope, { status: "active", bookingState: "checked_out" }) }),
      prisma.rental.count({ where: scopedWhere(scope, { status: "active", bookingState: { in: ["reserved", "confirmed"] } }) }),
      prisma.rental.count({ where: scopedWhere(scope, { status: "active", bookingState: "checked_out", expectedReturnDate: { lt: now } }) }),
      prisma.rental.aggregate({ where: scopedWhere(scope, { status: { notIn: ["cancelled"] }, balance: { gt: 0 } }), _sum: { balance: true } }),
      prisma.rental.findMany({ where: scopedWhere(scope, { status: { not: "cancelled" }, depositStatus: { in: ["collected", "held"] } }), select: { depositPaid: true, depositAmount: true, depositRefunded: true } }),
      prisma.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, status: "posted", kind: { in: ["rental_payment", "rental_advance"] }, paymentDate: { gte: monthStart }, ...(scope.branchId ? { rental: { branchId: scope.branchId } } : {}) }, _sum: { amount: true }, _count: true }),
      prisma.rental.count({ where: scopedWhere(scope, { status: "returned", actualReturnDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } }) }),
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
      depositsHeld: heldDeposits.reduce((sum, rental) => sum + Math.max(0, Number(rental.depositPaid || rental.depositAmount || 0) - Number(rental.depositRefunded || 0)), 0),
      collectionsThisMonth: Number(collections._sum.amount || 0),
      receiptsThisMonth: Number(collections._count || 0),
      returnsToday: returnedToday,
    });
  } catch (err) {
    handleBranchError(res, err, "Failed to load rental dashboard summary.");
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
          payments: { where: { status: "posted" }, include: { cashAccount: { select: { id: true, name: true, type: true } }, user: userSelect }, orderBy: { paymentDate: "asc" } },
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

router.get("/crm/workspace", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
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

router.post("/crm/workspace/:collection", authenticateToken, requirePermission("canCreateRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
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
    const workspace = await mutateCrmWorkspace(scope.tenantId, (current) => ({ ...current, [collection]: [...(Array.isArray(current[collection]) ? current[collection] : []), record] }));
    res.status(201).json({ record: crmWorkspaceForUser({ [collection]: [record] }, req)[collection][0], workspace: crmWorkspaceForUser(workspace, req) });
  } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "CRM was updated at the same time. Retry your action." });
    if (err instanceof RangeError || err instanceof TypeError) return res.status(400).json({ error: "Check the CRM entry dates and values." });
    console.error("CRM record create error:", err);
    handleBranchError(res, err, "Could not create CRM record.");
  }
});

router.patch("/crm/workspace/:collection/:id", authenticateToken, requirePermission("canEditRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
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
    if (err instanceof RangeError || err instanceof TypeError) return res.status(400).json({ error: "Check the CRM entry fields and dates." });
    console.error("CRM record update error:", err);
    handleBranchError(res, err, "Could not update CRM record.");
  }
});

router.post("/crm/leads/:id/convert", authenticateToken, requirePermission("canEditRental"), requireAnyPermission(["canCreateCustomer", "canCreateReceivable"]), requireTenant, requireFeature("rentals"), async (req, res) => {
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
        const creditLimit = Number(req.body?.creditLimit);
        if (!name) throw Object.assign(new Error("A prospect or business name is required."), { statusCode: 400 });
        if (!Number.isFinite(creditLimit) || creditLimit <= 0) throw Object.assign(new Error("Set a credit limit greater than zero before converting this prospect."), { statusCode: 400 });
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

router.delete("/crm/workspace/:collection/:id", authenticateToken, requirePermission("canDeleteRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { collection, id } = req.params;
    if (!crmCollections.has(collection)) return res.status(404).json({ error: "CRM record type not found." });
    let deleted = false;
    const workspace = await mutateCrmWorkspace(scope.tenantId, (current) => {
      const records = Array.isArray(current[collection]) ? current[collection] : [];
      const nextRecords = records.filter((record) => !(record.id === id && (!scope.branchId || record.branchId === scope.branchId)));
      deleted = nextRecords.length !== records.length;
      return { ...current, [collection]: nextRecords };
    });
    if (!deleted) return res.status(404).json({ error: "CRM record not found." });
    res.json({ workspace: crmWorkspaceForUser(workspace, req) });
  } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "CRM was updated at the same time. Retry your action." });
    console.error("CRM record delete error:", err);
    handleBranchError(res, err, "Could not delete CRM record.");
  }
});

router.get("/crm/overview", authenticateToken, requirePermission("canViewRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
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
        payments: { where: { status: "posted" }, include: { cashAccount: { select: { id: true, name: true, type: true } }, user: userSelect }, orderBy: { paymentDate: "asc" } },
      },
    });
    if (!rental) return res.status(404).json({ error: "Rental not found" });
    res.json(withUser(rental));
  } catch (err) {
    console.error("Rental get error:", err);
    handleBranchError(res, err, "Failed to fetch rental");
  }
});

router.post("/:id/payments", authenticateToken, requirePermission("canCreateRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { amount, paymentMethod = "cash", cashAccountId, transactionRef, mobileProvider, phoneNumber, notes } = req.body;
    const rental = await prisma.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
    if (!rental) return res.status(404).json({ error: "Rental not found." });
    if (rental.status === "cancelled") return res.status(409).json({ error: "Cancelled rentals cannot receive payments." });
    const value = toMoney(amount, -1);
    if (value <= 0 || value > Number(rental.balance) + 0.01) return res.status(400).json({ error: "Enter a positive payment no greater than the rental balance." });
    if (paymentMethod === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionRef)) return res.status(400).json({ error: "Mobile money requires provider, phone number, and transaction reference." });
    if (paymentMethod === "card" && !transactionRef) return res.status(400).json({ error: "Card payments require a transaction reference." });
    const account = validateRentalPaymentAccount(req, await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true } }), paymentMethod);
    const payment = await prisma.$transaction(async tx => {
      const locked = await tx.rental.findFirst({ where: { id: rental.id, tenantId: scope.tenantId } });
      if (!locked || value > Number(locked.balance) + 0.01) throw Object.assign(new Error("The rental balance changed. Refresh and enter an amount within the current balance."), { statusCode: 409 });
      if (locked.bookingState === "checked_out") await ensureLegacyRentalOpeningEntry(tx, { tenantId: scope.tenantId, rental: locked, userId: req.user.id });
      return recordRentalPaymentTx(tx, { req, tenantId: scope.tenantId, rental: locked, amount: value, method: paymentMethod, cashAccountId: account.id, kind: locked.bookingState === "checked_out" ? "rental_payment" : "rental_advance", transactionRef, mobileProvider, phoneNumber, notes });
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "The rental was updated at the same time. Refresh and retry." });
    handleBranchError(res, err, "Could not record rental payment.");
  }
});

router.post("/:id/deposit-refunds", authenticateToken, requirePermission("canProcessRentalReturn"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { amount, paymentMethod = "cash", cashAccountId, transactionRef, mobileProvider, phoneNumber, notes } = req.body;
    const value = toMoney(amount, -1);
    if (paymentMethod === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionRef)) return res.status(400).json({ error: "Mobile money refunds require provider, phone number, and transaction reference." });
    if (["card", "bank_transfer"].includes(paymentMethod) && !transactionRef) return res.status(400).json({ error: "Electronic refunds require a transaction reference." });
    const account = validateRentalPaymentAccount(req, await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true } }), paymentMethod);
    const refund = await prisma.$transaction(async tx => {
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      if (!rental || rental.status === "cancelled") throw Object.assign(new Error("Rental not found or cancelled."), { statusCode: 404 });
      const isUnissuedReservation = rental.status === "active" && rental.bookingState !== "checked_out";
      if (rental.status !== "returned" && !isUnissuedReservation) throw Object.assign(new Error("Security deposits can only be refunded after return inspection, or before checkout when cancelling a reservation."), { statusCode: 409 });
      const held = Math.max(0, Number(rental.depositPaid || rental.depositAmount || 0) - Number(rental.depositRefunded || 0));
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
      await tx.rental.update({ where: { id: rental.id }, data: { depositRefunded: totalRefunded, depositStatus: totalRefunded + 0.01 >= Number(rental.depositPaid || rental.depositAmount || 0) ? "refunded" : "held" } });
      return payment;
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment: refund });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "The deposit changed at the same time. Refresh and retry." });
    handleBranchError(res, err, "Could not refund the rental deposit.");
  }
});

router.post("/:id/advance-refunds", authenticateToken, requirePermission("canDeleteRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { amount, paymentMethod = "cash", cashAccountId, transactionRef, mobileProvider, phoneNumber, notes } = req.body;
    const value = toMoney(amount, -1);
    if (paymentMethod === "mobile_money" && (!mobileProvider || !phoneNumber || !transactionRef)) return res.status(400).json({ error: "Mobile money refunds require provider, phone number, and transaction reference." });
    if (["card", "bank_transfer"].includes(paymentMethod) && !transactionRef) return res.status(400).json({ error: "Electronic refunds require a transaction reference." });
    const account = validateRentalPaymentAccount(req, await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true } }), paymentMethod);
    const refund = await prisma.$transaction(async tx => {
      const rental = await tx.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
      if (!rental || rental.status !== "active" || rental.bookingState === "checked_out") throw Object.assign(new Error("Only an active reservation can refund an unearned advance."), { statusCode: 409 });
      const [advances, refunds] = await Promise.all([
        tx.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, rentalId: rental.id, status: "posted", kind: "rental_advance" }, _sum: { amount: true } }),
        tx.rentalPayment.aggregate({ where: { tenantId: scope.tenantId, rentalId: rental.id, status: "posted", kind: "rental_advance_refund" }, _sum: { amount: true } }),
      ]);
      const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).slice(0, 120);
      const prior = await tx.rentalPayment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: scope.tenantId, idempotencyKey } } });
      if (prior) {
        if (prior.rentalId !== rental.id || prior.kind !== "rental_advance_refund") throw Object.assign(new Error("This request key was already used for a different rental payment."), { statusCode: 409 });
        return prior;
      }
      const refundable = Math.max(0, Number(advances._sum.amount || 0) - Number(refunds._sum.amount || 0));
      if (value <= 0 || value > refundable + 0.01) throw Object.assign(new Error("Refund cannot exceed unrefunded reservation advances."), { statusCode: 400 });
      const receiptNo = `RNT-ADV-REF-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const movement = await recordRentalCashMovement(tx, { tenantId: scope.tenantId, userId: req.user.id, cashAccount: account, amount: value, direction: "expense", reference: receiptNo, description: `Reservation advance refund for ${rental.rentalNo}` });
      const payment = await tx.rentalPayment.create({ data: { tenantId: scope.tenantId, rentalId: rental.id, cashAccountId: account.id, userId: req.user.id, kind: "rental_advance_refund", receiptNo, idempotencyKey, amount: value, balanceAfter: refundable - value, paymentMethod, mobileProvider: mobileProvider || null, phoneNumber: phoneNumber || null, transactionRef: transactionRef || null, notes: notes || null } });
      const cashLedger = await ensureRentalCashLedgerAccount(tx, scope.tenantId, movement.cashAccount);
      const config = await ensureRentalAccounting(tx, scope.tenantId);
      await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_ADVANCE_REFUND", sourceId: payment.id, reference: receiptNo, description: `Reservation advance refund ${rental.rentalNo}`, lines: [{ accountId: config.deferredRevenueAccountId, debit: value, credit: 0, description: `Release refunded rental advance ${receiptNo}` }, { accountId: cashLedger.id, debit: 0, credit: value, description: `Refund unearned rental advance ${receiptNo}` }] });
      const newPaid = Math.max(0, Number(rental.amountPaid || 0) - value);
      await tx.rental.update({ where: { id: rental.id }, data: { amountPaid: newPaid, balance: Math.max(0, Number(rental.totalAmount) - newPaid), paymentStatus: newPaid >= Number(rental.totalAmount) ? "paid" : newPaid > 0 ? "partial" : "unpaid" } });
      return payment;
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ payment: refund });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "The reservation advance changed at the same time. Refresh and retry." });
    handleBranchError(res, err, "Could not refund the reservation advance.");
  }
});

router.post("/:id/deposit-forfeitures", authenticateToken, requirePermission("canProcessRentalReturn"), requireTenant, requireFeature("rentals"), async (req, res) => {
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
      const held = Math.max(0, Number(rental.depositPaid || rental.depositAmount || 0) - Number(rental.depositRefunded || 0));
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
    const payment = await prisma.rentalPayment.findFirst({ where: { tenantId: scope.tenantId, rentalId: req.params.id, id: req.params.paymentId, status: "posted" }, include: { rental: { include: { customer: { select: { name: true, phone: true } }, items: { include: { product: { select: { name: true, sku: true } } } }, chargeLines: true } }, cashAccount: { select: { name: true, type: true } }, tenant: { select: { name: true, address: true, phone: true, email: true, logo: true, currency: true } } } });
    if (!payment) return res.status(404).json({ error: "Rental receipt not found." });
    res.json({ payment });
  } catch (err) {
    handleBranchError(res, err, "Could not load rental receipt.");
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
    } = req.body;

    if (!Array.isArray(items)) return res.status(400).json({ error: "Rental items must be a list." });
    if (!Array.isArray(additionalCharges) || additionalCharges.length > 50) return res.status(400).json({ error: "Enter no more than 50 additional service or fee lines." });
    if (items.length === 0 && additionalCharges.length === 0) return res.status(400).json({ error: "Add a rental asset or at least one service/venue charge." });
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
    const chargeLines = additionalCharges.map((charge) => {
      const label = String(charge?.label || "").trim();
      const category = String(charge?.category || "service").trim().toLowerCase();
      const quantity = Number(charge?.quantity ?? 1);
      const unitPrice = toMoney(charge?.unitPrice, -1);
      if (!label || label.length > 120 || !["service", "delivery", "setup", "staffing", "venue", "cleaning", "other"].includes(category) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 || unitPrice < 0) {
        throw Object.assign(new Error("Check the additional service/charge lines. Names, categories, quantity, or prices are invalid."), { statusCode: 400 });
      }
      return { label, category, quantity, unitPrice, totalAmount: Math.round(quantity * unitPrice * 100) / 100 };
    });
    const chargeTotal = chargeLines.reduce((sum, line) => sum + line.totalAmount, 0);
    const grossSubtotal = subtotal + chargeTotal;
    const discountAmount = toMoney(discount);
    const taxableAmount = Math.max(0, grossSubtotal - discountAmount);

    // Fetch tenant tax settings
    const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { taxEnabled: true, taxRate: true } });
    const taxRate = (tenant?.taxEnabled && tenant?.taxRate) ? tenant.taxRate / 100 : 0;
    const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;
    const totalAmount = Math.max(0, taxableAmount + taxAmount);

    const deposit = toMoney(depositAmount);
    if (deposit < 0 || discountAmount < 0 || toMoney(amountPaid) < 0) return res.status(400).json({ error: "Discount, deposit, and payment amounts cannot be negative." });
    if (toMoney(amountPaid) > totalAmount + 0.01) return res.status(400).json({ error: "Payment exceeds the rental charge. Record any excess as a separately approved customer advance rather than hiding it in this rental." });
    const paid = Math.min(toMoney(amountPaid), totalAmount);
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
          notes,
          items: {
            create: rentalItems.map(({ ...rest }) => rest),
          },
          chargeLines: { create: chargeLines },
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
    const rental = await prisma.rental.findFirst({ where: scopedWhere(scope, { id: req.params.id }), include: { items: true } });
    if (!rental) return res.status(404).json({ error: "Rental not found." });
    if (rental.status !== "active" || rental.bookingState === "checked_out") return res.status(409).json({ error: "Only an active reservation can be checked out." });
    const updated = await prisma.$transaction(async (tx) => {
      const checkoutStart = new Date();
      if (new Date(rental.expectedReturnDate) <= checkoutStart) throw Object.assign(new Error("The reserved return date has passed. Update the reservation before check-out."), { statusCode: 409 });
      const availability = await getRentalAvailability(tx, scope, rental.items.map((item) => item.productId), checkoutStart, rental.expectedReturnDate, rental.id);
      for (const item of rental.items) if ((availability.find((row) => row.productId === item.productId)?.available || 0) < item.quantity) throw Object.assign(new Error("Availability changed since reservation. Adjust the reservation before check-out."), { statusCode: 409 });
      for (const item of rental.items) await tx.product.update({ where: { id: item.productId }, data: { quantity: { decrement: item.quantity } } });
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
      include: { items: { include: { product: true } }, customer: true },
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
        await postRentalJournal(tx, { tenantId: scope.tenantId, branchId: rental.branchId, userId: req.user.id, sourceType: "RENTAL_EARNED_REVENUE", sourceId: rental.id, reference: rental.rentalNo, description: `Recognize earned rental charges ${rental.rentalNo}`, lines: rentalRevenueRecognitionLines(config, { amount: Math.max(0, Number(rental.totalAmount) - Number(rental.taxAmount || 0)), reference: rental.rentalNo }) });
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

// Cancel reservations only. Checked-out items must pass through the return flow.
router.delete("/:id", authenticateToken, requirePermission("canDeleteRental"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { id } = req.params;

    const rental = await prisma.rental.findFirst({
      where: scopedWhere(scope, { id }),
      include: { items: true },
    });
    if (!rental) return res.status(404).json({ error: "Rental not found" });
    if (rental.status === "returned") return res.status(400).json({ error: "Cannot cancel a returned rental." });
    if (rental.bookingState === "checked_out") return res.status(409).json({ error: "Checked-out items must be returned before the rental can be closed." });

    if (Number(rental.amountPaid) > 0 || Number(rental.depositPaid || rental.depositAmount) > Number(rental.depositRefunded || 0)) return res.status(409).json({ error: "Refund any reservation advance and security deposit through the payment workflow before cancelling. This preserves the cash and general-ledger audit trail." });

    await prisma.rental.update({ where: { id }, data: { status: "cancelled", bookingState: "cancelled" } });

    res.json({ message: "Reservation cancelled. Stock was not changed because it had not been checked out." });
  } catch (err) {
    console.error("Cancel rental error:", err);
    handleBranchError(res, err, "Failed to cancel rental");
  }
});

// Rentals summary/report
router.get("/report/summary", authenticateToken, requirePermission("canViewReportRentalsSummary"), requireTenant, requireFeature("rentals"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });

    const [activeRentals, reservedRentals, overdueRentals, totalRevenue, depositRows] = await Promise.all([
      prisma.rental.count({ where: scopedWhere(scope, { status: "active", bookingState: "checked_out" }) }),
      prisma.rental.count({ where: scopedWhere(scope, { status: "active", bookingState: { in: ["reserved", "confirmed"] } }) }),
      prisma.rental.count({
        where: scopedWhere(scope, {
          status: "active",
          bookingState: "checked_out",
          expectedReturnDate: { lt: new Date() },
        }),
      }),
      prisma.rental.aggregate({
        where: scopedWhere(scope, { status: "returned" }),
        _sum: { totalAmount: true },
      }),
      prisma.rental.findMany({ where: scopedWhere(scope, { status: { not: "cancelled" }, depositStatus: { in: ["collected", "held"] } }), select: { depositAmount: true, depositPaid: true, depositRefunded: true } }),
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
