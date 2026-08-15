import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission, requireFeature } from "../../middleware/auth.js";
import {
  handleBranchError,
  resolveBranchScope,
  scopedWhere,
  tenantIdFromUser,
} from "../utils/branchAccess.js";
import { checkUsageLimit } from "../utils/usageLimits.js";
import { getDefaultCategoryDefinitionsForBusinessType } from "../utils/categoryDefaults.js";

const router = Router();

// Check the correct permission based on itemType in the request body
function requireItemTypePermission(action) {
  const permMap = {
    create: { product: 'canCreateProduct', service: 'canCreateService', rental: 'canCreateRental' },
    edit:   { product: 'canEditProduct',   service: 'canEditService',   rental: 'canEditRental' },
    delete: { product: 'canDeleteProduct', service: 'canDeleteService', rental: 'canDeleteRental' },
  };
  return (req, res, next) => {
    const itemType = req.body?.itemType || 'product';
    const perm = permMap[action]?.[itemType] || permMap[action]?.product;
    if (!perm) return res.status(403).json({ error: 'Permission denied' });
    // Reuse requirePermission logic
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(perm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${perm} required` });
    }
    next();
  };
}

const slugify = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normalizeProductName = (value = "") => String(value).trim().replace(/\s+/g, " ");

const movementTypes = {
  stockIn: new Set(["PURCHASE", "SUPPLIER_PURCHASE", "TRANSFER_IN", "STOCK_IN", "ADJUSTMENT_IN", "PRODUCTION_IN"]),
  sold: new Set(["SALE", "RECEIVABLE_SALE"]),
  otherOut: new Set(["TRANSFER_OUT", "STOCK_OUT", "ADJUSTMENT_OUT", "PRODUCTION_OUT", "DAMAGE", "EXPIRY", "RENTAL_OUT"]),
  returns: new Set(["SALE_RETURN", "RENTAL_RETURN"]),
};

function parseDateOnly(value) {
  if (!value) return null;
  const parts = String(value).slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function inventoryDateRange(req) {
  const start = parseDateOnly(req.query.from || req.query.date) || new Date();
  start.setHours(0, 0, 0, 0);

  const end = parseDateOnly(req.query.to || req.query.from || req.query.date) || new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function userDisplayName(user) {
  return [user?.fname, user?.lname].filter(Boolean).join(" ").trim() || user?.email || "Unknown";
}

function itemBaseQuantity(item) {
  const quantity = Number(item?.quantity || 0);
  const conversionFactor = Number(item?.conversionFactor || 1);
  return quantity * (Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1);
}

function createMovementBucket() {
  return {
    period: { stockIn: 0, soldToday: 0, posSold: 0, receivableSold: 0, otherStockOut: 0, returns: 0 },
    afterNet: 0,
    stockInDetails: [],
    soldDetails: [],
    otherStockOutDetails: [],
    returnDetails: [],
  };
}

function addInventoryMovement(buckets, productId, movement) {
  if (!productId || !buckets.has(productId)) return;
  const bucket = buckets.get(productId);
  const qty = Number(movement.quantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) return;
  const direction = movement.direction === "IN" ? 1 : -1;

  if (movement.period === "after") {
    bucket.afterNet += direction * qty;
    return;
  }

  if (movementTypes.sold.has(movement.type)) {
    bucket.period.soldToday += qty;
    if (movement.type === "RECEIVABLE_SALE") bucket.period.receivableSold += qty;
    else bucket.period.posSold += qty;
    bucket.soldDetails.push(movement.detail);
    return;
  }

  if (movementTypes.returns.has(movement.type)) {
    bucket.period.returns += qty;
    bucket.returnDetails.push(movement.detail);
    return;
  }

  if (movementTypes.stockIn.has(movement.type)) {
    bucket.period.stockIn += qty;
    bucket.stockInDetails.push(movement.detail);
    return;
  }

  if (movementTypes.otherOut.has(movement.type)) {
    bucket.period.otherStockOut += qty;
    bucket.otherStockOutDetails.push(movement.detail);
  }
}

function auditLogStockMovement(log) {
  const beforeQty = Number(log.changes?.before?.quantity);
  const afterQty = Number(log.changes?.after?.quantity);
  if (!Number.isFinite(beforeQty) || !Number.isFinite(afterQty) || beforeQty === afterQty) return null;

  const stockMovement = log.changes?.stockMovement || {};
  const movementType = String(stockMovement.type || log.changes?.movementType || "").toLowerCase();
  const qty = Math.abs(afterQty - beforeQty);
  const isIn = afterQty > beforeQty;
  const type = movementType === "stock_in" ? "STOCK_IN" : movementType === "stock_out" ? "STOCK_OUT" : isIn ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
  const label = movementType === "stock_in" ? "Stock In" : movementType === "stock_out" ? "Stock Out" : isIn ? "Adjustment In" : "Adjustment Out";

  return {
    type,
    direction: isIn ? "IN" : "OUT",
    quantity: qty,
    detail: {
      time: log.createdAt,
      type: label,
      reference: log.id.slice(-8),
      referenceId: log.id,
      quantity: qty,
      reason: stockMovement.reason || log.changes?.reason || (movementType === "stock_in" ? "Restock" : "Manual stock adjustment"),
      staff: log.userEmail || "Unknown",
    },
  };
}

async function buildInventoryMovementSummary(scope, products, range) {
  const productIds = products.map((product) => product.id).filter(Boolean);
  const buckets = new Map(productIds.map((id) => [id, createMovementBucket()]));
  if (!productIds.length) {
    return {
      byProductId: buckets,
      summary: { productsSold: 0, unitsSold: 0, receivableUnitsSold: 0, stockReceived: 0, otherStockOut: 0, returns: 0, lowStockProducts: 0, outOfStockProducts: 0 },
    };
  }

  const dateWhere = { gte: range.start, lte: range.end };
  const afterWhere = { gt: range.end };
  const productWhere = { productId: { in: productIds } };
  const productSelect = { id: true, name: true, sku: true };
  const userSelect = { id: true, fname: true, lname: true, email: true };

  const [
    saleItems,
    receivableItems,
    purchaseItems,
    supplierPurchaseItems,
    saleReturnItems,
    transferItems,
    productionOrders,
    productionWaste,
    adjustmentLogs,
    afterSaleItems,
    afterReceivableItems,
    afterPurchaseItems,
    afterSupplierPurchaseItems,
    afterSaleReturnItems,
    afterTransferItems,
    afterProductionOrders,
    afterProductionWaste,
    afterAdjustmentLogs,
  ] = await Promise.all([
    prisma.saleItem.findMany({
      where: { ...productWhere, sale: scopedWhere(scope, { createdAt: dateWhere, status: "completed" }) },
      include: { sale: { select: { id: true, receiptNo: true, createdAt: true, user: { select: userSelect } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.saleRecordItem.findMany({
      where: { ...productWhere, sale: scopedWhere(scope, { createdAt: dateWhere, status: "completed" }) },
      include: { sale: { select: { id: true, receiptNo: true, createdAt: true, paymentStatus: true, User: { select: userSelect } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.purchaseItem.findMany({
      where: { ...productWhere, purchase: scopedWhere(scope, { createdAt: dateWhere }) },
      include: { purchase: { select: { id: true, refNo: true, createdAt: true, user: { select: userSelect } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplierPurchaseItem.findMany({
      where: { ...productWhere, purchase: scopedWhere(scope, { createdAt: dateWhere }) },
      include: { purchase: { select: { id: true, refNo: true, createdAt: true, User: { select: userSelect } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.saleReturnItem.findMany({
      where: { ...productWhere, return: scopedWhere(scope, { createdAt: dateWhere, status: "completed" }) },
      include: { return: { select: { id: true, returnNo: true, createdAt: true, reason: true, user: { select: userSelect } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.stockTransferItem.findMany({
      where: { ...productWhere, transfer: { tenantId: scope.tenantId, createdAt: dateWhere, status: { not: "cancelled" }, ...(scope.branchId ? { OR: [{ fromBranchId: scope.branchId }, { toBranchId: scope.branchId }] } : {}) } },
      include: { transfer: { select: { id: true, transferNo: true, createdAt: true, fromBranchId: true, toBranchId: true, user: { select: userSelect } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.productionOrder.findMany({
      where: scopedWhere(scope, { productId: { in: productIds }, status: "completed", updatedAt: dateWhere }),
      select: { id: true, orderNo: true, productId: true, actualQuantity: true, quantity: true, updatedAt: true, user: { select: userSelect } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.productionWaste.findMany({
      where: { productId: { in: productIds }, tenantId: scope.tenantId, createdAt: dateWhere, ...(scope.branchId ? { productionOrder: { branchId: scope.branchId } } : {}) },
      select: { id: true, productId: true, quantity: true, reason: true, createdAt: true, productionOrder: { select: { orderNo: true, user: { select: userSelect } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: scope.tenantId, model: "Product", action: "update", recordId: { in: productIds }, createdAt: dateWhere },
      orderBy: { createdAt: "asc" },
    }),
    prisma.saleItem.findMany({ where: { ...productWhere, sale: scopedWhere(scope, { createdAt: afterWhere, status: "completed" }) }, select: { productId: true, quantity: true, conversionFactor: true } }),
    prisma.saleRecordItem.findMany({ where: { ...productWhere, sale: scopedWhere(scope, { createdAt: afterWhere, status: "completed" }) }, select: { productId: true, quantity: true, conversionFactor: true } }),
    prisma.purchaseItem.findMany({ where: { ...productWhere, purchase: scopedWhere(scope, { createdAt: afterWhere }) }, select: { productId: true, quantity: true } }),
    prisma.supplierPurchaseItem.findMany({ where: { ...productWhere, purchase: scopedWhere(scope, { createdAt: afterWhere }) }, select: { productId: true, quantity: true } }),
    prisma.saleReturnItem.findMany({ where: { ...productWhere, return: scopedWhere(scope, { createdAt: afterWhere, status: "completed" }) }, select: { productId: true, quantity: true } }),
    prisma.stockTransferItem.findMany({
      where: { ...productWhere, transfer: { tenantId: scope.tenantId, createdAt: afterWhere, status: { not: "cancelled" }, ...(scope.branchId ? { OR: [{ fromBranchId: scope.branchId }, { toBranchId: scope.branchId }] } : {}) } },
      include: { transfer: { select: { fromBranchId: true, toBranchId: true } } },
    }),
    prisma.productionOrder.findMany({ where: scopedWhere(scope, { productId: { in: productIds }, status: "completed", updatedAt: afterWhere }), select: { productId: true, actualQuantity: true, quantity: true } }),
    prisma.productionWaste.findMany({ where: { productId: { in: productIds }, tenantId: scope.tenantId, createdAt: afterWhere, ...(scope.branchId ? { productionOrder: { branchId: scope.branchId } } : {}) }, select: { productId: true, quantity: true } }),
    prisma.auditLog.findMany({
      where: { tenantId: scope.tenantId, model: "Product", action: "update", recordId: { in: productIds }, createdAt: afterWhere },
    }),
  ]);

  saleItems.forEach((item) => addInventoryMovement(buckets, item.productId, {
    type: "SALE",
    direction: "OUT",
    quantity: itemBaseQuantity(item),
    detail: { time: item.sale?.createdAt, type: "Sale", reference: item.sale?.receiptNo || item.saleId, referenceId: item.saleId, quantity: itemBaseQuantity(item), unit: item.unitName || "Base", staff: userDisplayName(item.sale?.user) },
  }));

  receivableItems.forEach((item) => addInventoryMovement(buckets, item.productId, {
    type: "RECEIVABLE_SALE",
    direction: "OUT",
    quantity: itemBaseQuantity(item),
    detail: { time: item.sale?.createdAt, type: "Receivable Sale", reference: item.sale?.receiptNo || item.saleId, referenceId: item.saleId, quantity: itemBaseQuantity(item), unit: item.unitName || "Base", staff: userDisplayName(item.sale?.User), status: item.sale?.paymentStatus },
  }));

  purchaseItems.forEach((item) => addInventoryMovement(buckets, item.productId, {
    type: "PURCHASE",
    direction: "IN",
    quantity: item.quantity,
    detail: { time: item.purchase?.createdAt, type: "Purchase", reference: item.purchase?.refNo || item.purchaseId, referenceId: item.purchaseId, quantity: item.quantity, staff: userDisplayName(item.purchase?.user) },
  }));

  supplierPurchaseItems.forEach((item) => addInventoryMovement(buckets, item.productId, {
    type: "SUPPLIER_PURCHASE",
    direction: "IN",
    quantity: item.quantity,
    detail: { time: item.purchase?.createdAt, type: "Supplier Purchase", reference: item.purchase?.refNo || item.purchaseId, referenceId: item.purchaseId, quantity: item.quantity, staff: userDisplayName(item.purchase?.User) },
  }));

  saleReturnItems.forEach((item) => addInventoryMovement(buckets, item.productId, {
    type: "SALE_RETURN",
    direction: "IN",
    quantity: item.quantity,
    detail: { time: item.return?.createdAt, type: "Sale Return", reference: item.return?.returnNo || item.returnId, referenceId: item.returnId, quantity: item.quantity, reason: item.reason || item.return?.reason || "", staff: userDisplayName(item.return?.user) },
  }));

  transferItems.forEach((item) => {
    if (!scope.branchId) return;
    const isIn = scope.branchId && item.transfer?.toBranchId === scope.branchId;
    addInventoryMovement(buckets, item.productId, {
      type: isIn ? "TRANSFER_IN" : "TRANSFER_OUT",
      direction: isIn ? "IN" : "OUT",
      quantity: item.quantity,
      detail: { time: item.transfer?.createdAt, type: isIn ? "Transfer In" : "Transfer Out", reference: item.transfer?.transferNo || item.transferId, referenceId: item.transferId, quantity: item.quantity, reason: item.notes || "", staff: userDisplayName(item.transfer?.user) },
    });
  });

  productionOrders.forEach((order) => addInventoryMovement(buckets, order.productId, {
    type: "PRODUCTION_IN",
    direction: "IN",
    quantity: Math.ceil(Number(order.actualQuantity || order.quantity || 0)),
    detail: { time: order.updatedAt, type: "Production In", reference: order.orderNo, referenceId: order.id, quantity: Math.ceil(Number(order.actualQuantity || order.quantity || 0)), staff: userDisplayName(order.user) },
  }));

  productionWaste.forEach((waste) => addInventoryMovement(buckets, waste.productId, {
    type: "PRODUCTION_OUT",
    direction: "OUT",
    quantity: waste.quantity,
    detail: { time: waste.createdAt, type: "Production/Waste", reference: waste.productionOrder?.orderNo || waste.id, referenceId: waste.id, quantity: waste.quantity, reason: waste.reason || "", staff: userDisplayName(waste.productionOrder?.user) },
  }));

  adjustmentLogs.forEach((log) => {
    const movement = auditLogStockMovement(log);
    if (movement) addInventoryMovement(buckets, log.recordId, movement);
  });

  afterSaleItems.forEach((item) => addInventoryMovement(buckets, item.productId, { period: "after", type: "SALE", direction: "OUT", quantity: itemBaseQuantity(item) }));
  afterReceivableItems.forEach((item) => addInventoryMovement(buckets, item.productId, { period: "after", type: "RECEIVABLE_SALE", direction: "OUT", quantity: itemBaseQuantity(item) }));
  afterPurchaseItems.forEach((item) => addInventoryMovement(buckets, item.productId, { period: "after", type: "PURCHASE", direction: "IN", quantity: item.quantity }));
  afterSupplierPurchaseItems.forEach((item) => addInventoryMovement(buckets, item.productId, { period: "after", type: "SUPPLIER_PURCHASE", direction: "IN", quantity: item.quantity }));
  afterSaleReturnItems.forEach((item) => addInventoryMovement(buckets, item.productId, { period: "after", type: "SALE_RETURN", direction: "IN", quantity: item.quantity }));
  afterTransferItems.forEach((item) => {
    if (!scope.branchId) return;
    const isIn = scope.branchId && item.transfer?.toBranchId === scope.branchId;
    addInventoryMovement(buckets, item.productId, { period: "after", type: isIn ? "TRANSFER_IN" : "TRANSFER_OUT", direction: isIn ? "IN" : "OUT", quantity: item.quantity });
  });
  afterProductionOrders.forEach((order) => addInventoryMovement(buckets, order.productId, { period: "after", type: "PRODUCTION_IN", direction: "IN", quantity: Math.ceil(Number(order.actualQuantity || order.quantity || 0)) }));
  afterProductionWaste.forEach((waste) => addInventoryMovement(buckets, waste.productId, { period: "after", type: "PRODUCTION_OUT", direction: "OUT", quantity: waste.quantity }));
  afterAdjustmentLogs.forEach((log) => {
    const movement = auditLogStockMovement(log);
    if (movement) addInventoryMovement(buckets, log.recordId, { ...movement, period: "after" });
  });

  let productsSold = 0;
  let unitsSold = 0;
  let receivableUnitsSold = 0;
  let stockReceived = 0;
  let otherStockOut = 0;
  let returns = 0;

  products.forEach((product) => {
    const bucket = buckets.get(product.id);
    const period = bucket.period;
    const currentStock = Number(product.quantity || 0);
    const closingStock = currentStock - bucket.afterNet;
    const netPeriod = period.stockIn + period.returns - period.soldToday - period.otherStockOut;
    bucket.openingStock = closingStock - netPeriod;
    bucket.closingStock = closingStock;
    bucket.currentStock = currentStock;
    if (period.soldToday > 0) productsSold += 1;
    unitsSold += period.soldToday;
    receivableUnitsSold += period.receivableSold;
    stockReceived += period.stockIn;
    otherStockOut += period.otherStockOut;
    returns += period.returns;
  });

  return {
    byProductId: buckets,
    summary: {
      productsSold,
      unitsSold,
      receivableUnitsSold,
      stockReceived,
      otherStockOut,
      returns,
      lowStockProducts: products.filter((product) => Number(product.quantity || 0) <= Number(product.minStock || 0)).length,
      outOfStockProducts: products.filter((product) => Number(product.quantity || 0) <= 0).length,
    },
  };
}

function startOfLocalDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfLocalDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function resolveMovementRange(query = {}) {
  const period = String(query.period || "today");
  const now = new Date();
  let start = startOfLocalDay(now);
  let end = endOfLocalDay(now);

  if (period === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    start = startOfLocalDay(yesterday);
    end = endOfLocalDay(yesterday);
  } else if (period === "week") {
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
    start = startOfLocalDay(weekStart);
    end = endOfLocalDay(now);
  } else if (period === "custom" && query.date) {
    const customDate = new Date(query.date);
    if (!Number.isNaN(customDate.getTime())) {
      start = startOfLocalDay(customDate);
      end = endOfLocalDay(customDate);
    }
  }

  return { period, start, end, now };
}

function qtyInBaseUnits(item) {
  return Number(item?.quantity || 0) * Number(item?.conversionFactor || 1);
}

function userName(user) {
  return `${user?.fname || ""} ${user?.lname || ""}`.trim() || user?.name || "System";
}

export function mapImportRouteError(err) {
  if (err?.code === 'LIMIT_REACHED') {
    return { statusCode: 403, message: err.message || 'Product limit reached' };
  }

  if (err?.statusCode) {
    return { statusCode: err.statusCode, message: err.message || 'Import failed' };
  }

  return { statusCode: 500, message: 'Internal server error during import' };
}

export const buildSkuBase = (name = "", category = "") => {
  const categoryValue = typeof category === "string" ? category : category?.name || category?.slug || "";
  const categoryLetters = String(categoryValue)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const baseCategory = categoryLetters.slice(0, 3).padEnd(3, "X") || "GEN";

  if (categoryValue) {
    return baseCategory;
  }

  const slug = slugify(name) || "item";
  const letters = (slug.match(/[a-z]+/gi) || ["item"]).join("").toUpperCase();
  const firstPart = letters.slice(0, 3).padEnd(3, "X");
  const secondPart = letters.slice(3, 5).padEnd(2, "X");
  return `${firstPart}-${secondPart}`;
};

const getDynamicSkuDateToken = (date = new Date()) => {
  const value = new Date(date);
  return value.toISOString().slice(2, 10).replace(/-/g, "");
};

export async function resolveUniqueSku(prisma, tenantId, branchId, name, itemType = "product", category = "", excludeId = null, reserved = new Set()) {
  const baseSku = buildSkuBase(name, category);
  const dateToken = getDynamicSkuDateToken();
  let counter = 1;

  while (true) {
    const candidate = `${baseSku}-${dateToken}-${String(counter).padStart(4, "0")}`;

    if (reserved.has(candidate)) {
      counter += 1;
      continue;
    }

    const existing = await prisma.product.findFirst({
      where: {
        tenantId,
        branchId,
        sku: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      reserved.add(candidate);
      return candidate;
    }

    counter += 1;
  }
}

async function ensureUniqueProductName(prisma, tenantId, branchId, name, excludeId = null) {
  const normalizedName = normalizeProductName(name);
  if (!normalizedName) return { ok: false, error: "Product name is required" };

  const existing = await prisma.product.findFirst({
    where: {
      tenantId,
      branchId,
      name: { equals: normalizedName, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (existing) {
    return { ok: false, error: `Product name "${normalizedName}" already exists` };
  }

  return { ok: true, name: normalizedName };
}

async function ensureTenantCategories(tenantId) {
  if (!tenantId) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { businessType: true },
  });

  const categories = getDefaultCategoryDefinitionsForBusinessType(tenant?.businessType || "other").map((category) => ({
    ...category,
    tenantId,
  }));

  if (categories.length > 0) {
    await prisma.category.createMany({
      data: categories,
      skipDuplicates: true,
    });
  }
}

// List products
router.get("/", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const tenantId = scope.tenantId;
    const { search, category, page = 1, limit = 100, lowStock, barcode, itemType } = req.query;
    const where = scopedWhere(scope, { isActive: { not: false } });
    const includeDailyMovements = String(req.query.includeDailyMovements || "").toLowerCase() === "true";
    const buildListResponse = async (products, total, responsePage = Number(page), responseLimit = Number(limit)) => {
      if (!includeDailyMovements) {
        return { products, total, page: responsePage, limit: responseLimit };
      }

      const range = inventoryDateRange(req);
      const { byProductId, summary } = await buildInventoryMovementSummary(scope, products, range);
      return {
        products: products.map((product) => {
          const bucket = byProductId.get(product.id) || createMovementBucket();
          return {
            ...product,
            dailyMovement: {
              openingStock: bucket.openingStock ?? Number(product.quantity || 0),
              stockIn: bucket.period.stockIn,
              soldToday: bucket.period.soldToday,
              posSold: bucket.period.posSold,
              receivableSold: bucket.period.receivableSold,
              otherStockOut: bucket.period.otherStockOut,
              returns: bucket.period.returns,
              closingStock: bucket.closingStock ?? Number(product.quantity || 0),
              currentStock: bucket.currentStock ?? Number(product.quantity || 0),
              stockInDetails: bucket.stockInDetails,
              soldDetails: bucket.soldDetails,
              otherStockOutDetails: bucket.otherStockOutDetails,
              returnDetails: bucket.returnDetails,
            },
          };
        }),
        total,
        page: responsePage,
        limit: responseLimit,
        movementRange: {
          from: range.start.toISOString(),
          to: range.end.toISOString(),
        },
        movementSummary: summary,
      };
    };

    // Filter by itemType if provided
    if (itemType) where.itemType = String(itemType);

    // Barcode exact lookup (highest priority)
    if (barcode) {
      const product = await prisma.product.findFirst({
        where: scopedWhere(scope, { barcode, isActive: { not: false } }),
        include: { category: true, branch: true },
      });
      return res.json(await buildListResponse(product ? [product] : [], product ? 1 : 0, 1, 1));
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: "insensitive" } },
        { sku: { contains: String(search), mode: "insensitive" } },
        { barcode: { contains: String(search), mode: "insensitive" } },
        { description: { contains: String(search), mode: "insensitive" } },
      ];
      const products = await prisma.product.findMany({
        where,
        include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
        orderBy: { name: "asc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });
      const total = await prisma.product.count({ where });
      return res.json(await buildListResponse(products, total));
    }

    if (category) where.categoryId = category;
    if (lowStock === "true") where.quantity = { lte: 10 };

    const products = await prisma.product.findMany({
      where: { ...where, isActive: { not: false } },
      include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
      orderBy: { name: "asc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.product.count({ where });
    res.json(await buildListResponse(products, total));
  } catch (err) {
    // Log full error and request context for debugging 500s
    try {
      console.error("List inventory error:", err && (err.stack || err));
      console.error("Request query:", req.query, "user:", req.user?.id || null);
    } catch (logErr) {
      console.error("Failed to log inventory list error context", logErr);
    }
    handleBranchError(res, err);
  }
});

// Categories
router.get("/categories", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    await ensureTenantCategories(tenantId);
    const { type } = req.query;
    const where = { tenantId };
    if (type) where.categoryType = String(type);
    const categories = await prisma.category.findMany({ where, orderBy: { name: "asc" } });
    res.json(categories);
  } catch (err) {
    console.error("List categories error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/categories", authenticateToken, requirePermission("canCreateProduct"), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Category name is required" });

    const slug = slugify(req.body?.slug || name);
    const categoryType = ["service", "rental"].includes(req.body?.categoryType) ? req.body.categoryType : "product";
    const category = await prisma.category.create({ data: { name, slug, tenantId, categoryType } });
    res.status(201).json({ message: "Category created", category });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Category already exists" });
    console.error("Create category error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single product
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { category: true, branch: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Product price/cost history
router.get("/:id/price-history", authenticateToken, requirePermission("canViewProduct"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      select: { id: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const history = await prisma.productPriceHistory.findMany({
      where: { tenantId: scope.tenantId, productId: product.id, ...(scope.branchId ? { branchId: scope.branchId } : {}) },
      include: { changedBy: { select: { id: true, fname: true, lname: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(req.query.limit || 100), 500),
    });

    res.json({ history });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Create product
router.post("/", authenticateToken, requireItemTypePermission('create'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const { tenantId: _tenantId, branchId: _branchId, id: _id, categoryId, itemType, ...body } = req.body;

    if (body.batchNumber !== undefined && body.batchNumber !== null) {
      body.batchNumber = String(body.batchNumber).trim() || null;
    }
    if (body.expiryDate !== undefined && body.expiryDate !== null && body.expiryDate !== '') {
      body.expiryDate = new Date(body.expiryDate);
    } else {
      body.expiryDate = null;
    }

    if (!categoryId) {
      return res.status(400).json({ error: "Category is required" });
    }

    const quantityValue = body.quantity;
    if (quantityValue === undefined || quantityValue === null || quantityValue === "") {
      return res.status(400).json({ error: "Stock quantity is required" });
    }
    const parsedQuantity = Number(quantityValue);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({ error: "Stock quantity must be a non-negative integer" });
    }
    body.quantity = parsedQuantity;

    const costValue = body.cost;
    if (costValue === undefined || costValue === null || costValue === "") {
      return res.status(400).json({ error: "Cost price is required" });
    }
    const parsedCost = Number(costValue);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return res.status(400).json({ error: "Cost price must be a non-negative number" });
    }
    body.cost = parsedCost;

    if (!itemType || !["product", "service", "rental"].includes(String(itemType).toLowerCase())) {
      return res.status(400).json({ error: "Item type is required and must be product, service, or rental" });
    }

    const normalizedName = normalizeProductName(body.name);
    if (!normalizedName) {
      return res.status(400).json({ error: "Product name is required" });
    }
    if (body.price === undefined || body.price === null || Number(body.price) <= 0) {
      return res.status(400).json({ error: "Selling price must be greater than 0" });
    }

    // Set itemType (default to product, allow rental)
    const itemTypeValue = ["service", "rental"].includes(itemType) ? itemType : "product";
    body.itemType = itemTypeValue;

    const duplicateCheck = await ensureUniqueProductName(prisma, scope.tenantId, scope.branchId, normalizedName);
    if (!duplicateCheck.ok) {
      return res.status(409).json({ error: duplicateCheck.error });
    }

    let categoryForSku = null;
    if (categoryId) {
      categoryForSku = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: scope.tenantId },
        select: { id: true, name: true, slug: true },
      });
      if (!categoryForSku) {
        return res.status(400).json({ error: "Category not found" });
      }
    }

    body.name = duplicateCheck.name;
    body.sku = await resolveUniqueSku(prisma, scope.tenantId, scope.branchId, duplicateCheck.name, itemTypeValue, categoryForSku);

    // For service items, zero out inventory fields
    if (itemTypeValue === "service") {
      body.quantity = 0;
      body.minStock = 0;
      body.cost = null;
      body.barcode = null;
      body.sku = body.sku || null;
      body.baseUnit = "Service";
    }
    // For rental items, keep stock tracking but set defaults
    if (itemTypeValue === "rental") {
      body.rentalPrice = body.rentalPrice || body.price || 0;
      body.rentalPeriod = body.rentalPeriod || "daily";
      body.depositAmount = body.depositAmount || 0;
      body.replacementValue = body.replacementValue || 0;
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: scope.tenantId },
        select: { id: true },
      });
      if (!category) return res.status(400).json({ error: "Category not found" });
    }

    await checkUsageLimit(scope.tenantId, 'products');

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...body, categoryId: categoryId || null, tenantId: scope.tenantId, branchId: scope.branchId },
        include: { category: true, branch: true, units: true },
      });
      if (created.itemType !== "service") {
        await tx.productPriceHistory.create({
          data: {
            productId: created.id,
            tenantId: created.tenantId,
            branchId: created.branchId || null,
            newCost: created.cost,
            newPrice: created.price,
            source: "initial_setup",
            reason: "Initial product price",
            changedByUserId: req.user?.id || null,
          },
        });
      }
      return created;
    });
    res.status(201).json({ message: "Product created", product });
  } catch (err) {
    if (err?.code === 'LIMIT_REACHED') return res.status(403).json({ error: err.message });
    // Log error and incoming body to help diagnose 500s when saving products
    try {
      console.error("Create product error:", err && (err.stack || err));
      console.error("Request body:", req.body, "user:", req.user?.id || null);
    } catch (logErr) {
      console.error("Failed to log create product error context", logErr);
    }
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU or barcode already exists in this branch" });
    handleBranchError(res, err);
  }
});

// Update product
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const existing = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
    });
    if (!existing) return res.status(404).json({ error: "Product not found" });

    // Check permission based on the existing item's type
    const existingType = existing.itemType || 'product';
    const editPermMap = { product: 'canEditProduct', service: 'canEditService', rental: 'canEditRental' };
    const requiredPerm = editPermMap[existingType] || 'canEditProduct';
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(requiredPerm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${requiredPerm} required` });
    }

    const { tenantId: _tenantId, branchId, id: _id, categoryId, itemType, quantity, ...body } = req.body;
    const data = { ...body };

    if (data.batchNumber !== undefined && data.batchNumber !== null) {
      data.batchNumber = String(data.batchNumber).trim() || null;
    }
    if (data.expiryDate !== undefined && data.expiryDate !== null && data.expiryDate !== '') {
      data.expiryDate = new Date(data.expiryDate);
    } else if (data.expiryDate === '') {
      data.expiryDate = null;
    }

    // For updates, allow categoryId to be undefined (don't change it). But if provided, it must be valid.
    if (categoryId !== undefined && (categoryId === null || categoryId === "")) {
      return res.status(400).json({ error: "Category cannot be empty if provided" });
    }
    const quantityWasProvided = quantity !== undefined && quantity !== null && quantity !== "";
    if (quantityWasProvided) {
      const parsedQuantity = Number(quantity);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
        return res.status(400).json({ error: "Stock quantity must be a non-negative integer" });
      }
      if (parsedQuantity !== Number(existing.quantity || 0) && itemType !== "service") {
        return res.status(400).json({
          error: "Stock quantity cannot be changed from Edit Item. Use Stock In or Adjust Stock so the stock movement is recorded.",
        });
      }
    }

    if (body.cost === undefined || body.cost === null || body.cost === "") {
      return res.status(400).json({ error: "Cost price is required" });
    }
    const parsedCost = Number(body.cost);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return res.status(400).json({ error: "Cost price must be a non-negative number" });
    }
    data.cost = parsedCost;

    if (!itemType || !["product", "service", "rental"].includes(String(itemType).toLowerCase())) {
      return res.status(400).json({ error: "Item type is required and must be product, service, or rental" });
    }

    if (body.name !== undefined) {
      const normalizedName = normalizeProductName(body.name);
      if (!normalizedName) return res.status(400).json({ error: "Product name is required" });
      const duplicateCheck = await ensureUniqueProductName(prisma, existing.tenantId, existing.branchId || scope.branchId, normalizedName, existing.id);
      if (!duplicateCheck.ok) return res.status(409).json({ error: duplicateCheck.error });
      data.name = duplicateCheck.name;

      const categoryForSku = categoryId
        ? await prisma.category.findFirst({
            where: { id: categoryId, tenantId: existing.tenantId },
            select: { id: true, name: true, slug: true },
          })
        : existing.categoryId
          ? await prisma.category.findFirst({
              where: { id: existing.categoryId, tenantId: existing.tenantId },
              select: { id: true, name: true, slug: true },
            })
          : null;

      data.sku = await resolveUniqueSku(prisma, existing.tenantId, existing.branchId || scope.branchId, duplicateCheck.name, existing.itemType || 'product', categoryForSku, existing.id);
    }

    // Handle itemType update
    if (itemType === "service") {
      data.itemType = "service";
      data.quantity = 0;
      data.minStock = 0;
      data.cost = null;
      data.baseUnit = "Service";
    } else if (itemType === "product") {
      data.itemType = "product";
    } else if (itemType === "rental") {
      data.itemType = "rental";
    }

    if (categoryId !== undefined) {
      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, tenantId: existing.tenantId },
          select: { id: true },
        });
        if (!category) return res.status(400).json({ error: "Category not found" });
      }
      data.categoryId = categoryId || null;
      data.isUncategorized = categoryId ? false : true;
    }

    if (branchId !== undefined) {
      const targetScope = await resolveBranchScope(prisma, { ...req, body: { branchId } }, {
        source: "body",
        requireBranch: true,
        allowOwnerAll: false,
      });
      data.branchId = targetScope.branchId;
    }

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: existing.id },
        data,
        include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
      });

      const priceChanged = body.price !== undefined && Number(existing.price || 0) !== Number(updated.price || 0);
      const costChanged = body.cost !== undefined && Number(existing.cost || 0) !== Number(updated.cost || 0);
      if (priceChanged || costChanged) {
        const reason = String(req.body.priceChangeReason || req.body.reason || "Market price update");
        await tx.auditLog.create({
          data: {
            tenantId: existing.tenantId,
            userId: req.user?.id || "system",
            userEmail: req.user?.email || "",
            action: "update",
            model: "Product",
            recordId: existing.id,
            changes: {
              before: {
                ...(priceChanged ? { price: existing.price } : {}),
                ...(costChanged ? { cost: existing.cost } : {}),
              },
              after: {
                ...(priceChanged ? { price: updated.price } : {}),
                ...(costChanged ? { cost: updated.cost } : {}),
              },
              priceMovement: {
                reason,
                productName: updated.name,
              },
            },
            ip: req.ip || req.connection?.remoteAddress || null,
            statusCode: 200,
            severity: "info",
          },
        });
        await tx.productPriceHistory.create({
          data: {
            productId: existing.id,
            tenantId: existing.tenantId,
            branchId: updated.branchId || existing.branchId || null,
            oldCost: costChanged ? existing.cost : null,
            newCost: costChanged ? updated.cost : null,
            oldPrice: priceChanged ? existing.price : null,
            newPrice: priceChanged ? updated.price : null,
            source: "manual_update",
            reason,
            changedByUserId: req.user?.id || null,
          },
        });
      }

      return updated;
    });

    res.json({ message: "Product updated", product });
  } catch (err) {
    console.error("Update product error:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU or barcode already exists in this branch" });
    handleBranchError(res, err);
  }
});

// Adjust product stock separately from product detail updates
router.post("/:id/stock-adjust", authenticateToken, requirePermission("canAdjustStock"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const product = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { category: true, branch: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (product.itemType === "service") {
      return res.status(400).json({ error: "Services do not track stock quantity" });
    }

    const adjustmentType = String(req.body.adjustmentType || req.body.type || "stock_in").toLowerCase();
    if (!["stock_in", "stock_out"].includes(adjustmentType)) {
      return res.status(400).json({ error: "Adjustment type must be stock_in or stock_out" });
    }

    const parsedQuantity = Number(req.body.quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({ error: "Adjustment quantity must be a positive integer" });
    }

    const currentQuantity = Number(product.quantity || 0);
    const nextQuantity = adjustmentType === "stock_in"
      ? currentQuantity + parsedQuantity
      : currentQuantity - parsedQuantity;

    if (nextQuantity < 0) {
      return res.status(400).json({ error: "Stock out quantity cannot exceed current stock" });
    }

    const reason = String(req.body.reason || "").trim() || (adjustmentType === "stock_in" ? "Restock" : "Stock adjustment");

    const updated = await prisma.$transaction(async (tx) => {
      const savedProduct = await tx.product.update({
        where: { id: product.id },
        data: { quantity: nextQuantity },
        include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
      });

      await tx.auditLog.create({
        data: {
          tenantId: product.tenantId,
          userId: req.user?.id || "system",
          userEmail: req.user?.email || "",
          action: "update",
          model: "Product",
          recordId: product.id,
          changes: {
            before: { quantity: currentQuantity },
            after: { quantity: nextQuantity },
            stockMovement: {
              type: adjustmentType,
              quantity: parsedQuantity,
              reason,
              productName: product.name,
              previousQuantity: currentQuantity,
              newQuantity: nextQuantity,
            },
          },
          ip: req.ip || req.connection?.remoteAddress || null,
          statusCode: 200,
          severity: "info",
        },
      });

      return savedProduct;
    });

    res.json({
      message: adjustmentType === "stock_in" ? "Stock received" : "Stock adjusted",
      product: updated,
      adjustment: {
        type: adjustmentType,
        quantity: parsedQuantity,
        previousQuantity: currentQuantity,
        newQuantity: nextQuantity,
        reason,
      },
    });
  } catch (err) {
    console.error("Adjust stock error:", err);
    handleBranchError(res, err);
  }
});

// Delete product
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Check permission based on the item's type
    const itemType = product.itemType || 'product';
    const deletePermMap = { product: 'canDeleteProduct', service: 'canDeleteService', rental: 'canDeleteRental' };
    const requiredPerm = deletePermMap[itemType] || 'canDeleteProduct';
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(requiredPerm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${requiredPerm} required` });
    }

    await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    res.json({ message: "Product deactivated" });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// ==================== PRODUCT UNITS (Multi-UOM) ====================

// Get units for a product
router.get("/:productId/units", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const units = await prisma.productUnit.findMany({ where: { productId: product.id }, orderBy: { conversionFactor: "asc" } });
    res.json({ units, baseUnit: product.baseUnit });
  } catch (err) { handleBranchError(res, err); }
});

// Add a selling unit to a product
router.post("/:productId/units", authenticateToken, requirePermission("canCreateProduct"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const { unitName, conversionFactor, sellingPrice, isDefault } = req.body;
    if (!unitName || conversionFactor == null || sellingPrice == null) return res.status(400).json({ error: "unitName, conversionFactor, and sellingPrice are required" });
    const unit = await prisma.productUnit.create({ data: { productId: product.id, unitName, conversionFactor: parseFloat(conversionFactor), sellingPrice: parseFloat(sellingPrice), isDefault: isDefault || false } });
    res.status(201).json(unit);
  } catch (err) { handleBranchError(res, err); }
});

// Update a selling unit
router.put("/:productId/units/:unitId", authenticateToken, requirePermission("canEditProduct"), async (req, res) => {
  try {
    const { unitName, conversionFactor, sellingPrice, isDefault } = req.body;
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const unit = await prisma.productUnit.findFirst({
      where: {
        id: req.params.unitId,
        productId: req.params.productId,
        product: scopedWhere(scope, { id: req.params.productId }),
      },
      include: { product: true },
    });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    const oldSellingPrice = Number(unit.sellingPrice || 0);
    const parsedSellingPrice = sellingPrice != null ? parseFloat(sellingPrice) : null;
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.productUnit.update({ where: { id: unit.id }, data: { ...(unitName && { unitName }), ...(conversionFactor != null && { conversionFactor: parseFloat(conversionFactor) }), ...(sellingPrice != null && { sellingPrice: parsedSellingPrice }), ...(isDefault != null && { isDefault }) } });
      if (parsedSellingPrice != null && Number.isFinite(parsedSellingPrice) && parsedSellingPrice !== oldSellingPrice) {
        await tx.productPriceHistory.create({
          data: {
            productId: unit.productId,
            tenantId: unit.product.tenantId,
            branchId: unit.product.branchId || null,
            oldPrice: oldSellingPrice,
            newPrice: parsedSellingPrice,
            source: "unit_price_update",
            reference: saved.unitName,
            reason: String(req.body.priceChangeReason || req.body.reason || `Selling unit price update: ${saved.unitName}`),
            changedByUserId: req.user?.id || null,
          },
        });
      }
      return saved;
    });
    res.json(updated);
  } catch (err) { handleBranchError(res, err); }
});

// Delete a selling unit
router.delete("/:productId/units/:unitId", authenticateToken, requirePermission("canEditProduct"), async (req, res) => {
  try {
    const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    await prisma.productUnit.delete({ where: { id: unit.id } });
    res.json({ message: "Unit deleted" });
  } catch (err) { handleBranchError(res, err); }
});

// =====================================================
// Bulk Import Inventory from Excel data
// Frontend parses the Excel file and sends JSON rows.
// Backend validates each row and returns detailed errors.
// =====================================================
router.post("/import", authenticateToken, requirePermission("canImportInventory"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });

    const { rows, branchId } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data rows provided" });
    }

    // Fetch existing categories for this tenant to map by name
    const existingCategories = await prisma.category.findMany({
      where: { tenantId: scope.tenantId },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(existingCategories.map(c => [c.name.toLowerCase(), c.id]));

    // Fetch existing names and barcodes for duplicate check
    const existingProducts = await prisma.product.findMany({
      where: { tenantId: scope.tenantId, branchId: scope.branchId },
      select: { name: true, barcode: true },
    });
    const existingNames = new Set(existingProducts.map(p => normalizeProductName(p.name).toLowerCase()).filter(Boolean));
    const existingBarcodes = new Set(existingProducts.map(p => p.barcode).filter(Boolean));

    const errors = [];
    const validRows = [];
    const seenNames = new Set();
    const seenBarcodes = new Set();
    const reservedSkus = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is the header in Excel
      const rowErrors = [];

      // Required: name
      const name = normalizeProductName(String(row.name || row["Product Name"] || ""));
      if (!name) rowErrors.push("Product Name is required");

      // Required: selling price
      const price = parseFloat(row.price || row["Selling Price"]);
      if (isNaN(price) || price <= 0) rowErrors.push("Selling Price must be a number greater than 0");

      // Required: cost price
      const costValue = row.cost ?? row["Cost Price"];
      let cost = null;
      if (costValue === undefined || costValue === null || String(costValue).trim() === "") {
        rowErrors.push("Cost Price is required");
      } else {
        cost = parseFloat(costValue);
        if (isNaN(cost) || cost < 0) rowErrors.push("Cost Price must be a non-negative number");
      }

      // Required: quantity
      const quantityRaw = row.quantity ?? row["Stock Quantity"];
      let quantity = null;
      if (quantityRaw === undefined || quantityRaw === null || String(quantityRaw).trim() === "") {
        rowErrors.push("Stock Quantity is required");
      } else {
        quantity = parseInt(quantityRaw, 10);
        if (isNaN(quantity) || quantity < 0) rowErrors.push("Stock Quantity must be a non-negative integer");
      }

      // Optional: minStock
      const minStock = parseInt(row.minStock ?? row["Reorder Level"] ?? 10, 10);
      if (isNaN(minStock) || minStock < 0) rowErrors.push("Reorder Level must be a non-negative integer");

      if (name) {
        const normalizedNameKey = name.toLowerCase();
        if (existingNames.has(normalizedNameKey) || seenNames.has(normalizedNameKey)) {
          rowErrors.push(`Product name "${name}" already exists in this branch`);
        } else {
          seenNames.add(normalizedNameKey);
        }
      }

      // Optional: barcode
      const barcode = String(row.barcode || row["Barcode"] || "").trim() || null;
      if (barcode) {
        if (existingBarcodes.has(barcode) || seenBarcodes.has(barcode)) {
          rowErrors.push(`Barcode "${barcode}" already exists in this branch`);
        } else {
          seenBarcodes.add(barcode);
        }
      }

      // Optional: category (match by name) — if category doesn't exist, mark as uncategorized
      const categoryName = String(row.category || row["Category"] || "").trim();
      let categoryId = null;
      let isUncategorized = false;
      if (categoryName) {
        categoryId = categoryMap.get(categoryName.toLowerCase());
        if (!categoryId) {
          // Category name provided but not found — mark as uncategorized for user to fix
          isUncategorized = true;
        }
      } else {
        // No category provided — mark as uncategorized
        isUncategorized = true;
      }

      // Optional: baseUnit
      const baseUnit = String(row.baseUnit || row["Base Unit"] || "Piece").trim() || "Piece";

      // Optional: description
      const description = String(row.description || row["Description"] || "").trim() || null;

      // Required: itemType
      const itemType = String(row.itemType || row["Item Type"] || "").trim().toLowerCase();
      if (!itemType) {
        rowErrors.push("Item Type is required");
      } else if (!["product", "service", "rental"].includes(itemType)) {
        rowErrors.push(`Item Type must be "product", "service", or "rental" (got "${itemType}")`);
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, name: name || "(unnamed)", errors: rowErrors });
      } else {
        const generatedSku = await resolveUniqueSku(prisma, scope.tenantId, scope.branchId, name, itemType, categoryName, null, reservedSkus);
        validRows.push({
          name,
          price,
          cost: cost != null ? cost : null,
          quantity: itemType === "service" ? 0 : quantity,
          minStock: itemType === "service" ? 0 : minStock,
          sku: generatedSku,
          barcode,
          categoryId,
          baseUnit: itemType === "service" ? "Service" : baseUnit,
          description,
          itemType,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          isActive: true,
          isUncategorized,
        });
      }
    }

    // Check usage limit
    await checkUsageLimit(scope.tenantId, 'products');

    // Bulk create — skip rows with errors, import the rest
    let created = [];
    if (validRows.length > 0) {
      created = await prisma.$transaction(async (tx) => {
        const products = [];
        for (const data of validRows) {
          const product = await tx.product.create({ data });
          products.push(product);
          if (product.itemType !== "service") {
            await tx.productPriceHistory.create({
              data: {
                productId: product.id,
                tenantId: product.tenantId,
                branchId: product.branchId || null,
                newCost: product.cost,
                newPrice: product.price,
                source: "import",
                reason: "Initial imported product price",
                changedByUserId: req.user?.id || null,
              },
            });
          }
        }
        return products;
      });
    }

    res.status(201).json({
      message: `Successfully imported ${created.length} product${created.length !== 1 ? 's' : ''}${errors.length > 0 ? `, skipped ${errors.length} duplicate/error row${errors.length !== 1 ? 's' : ''}` : ''}`,
      imported: created.length,
      skipped: errors.length,
      skippedRows: errors,
    });
  } catch (err) {
    const mappedError = mapImportRouteError(err);
    if (mappedError.statusCode >= 400 && mappedError.statusCode < 500) {
      console.warn("Import inventory request failed:", mappedError);
      return res.status(mappedError.statusCode).json({ error: mappedError.message });
    }

    console.error("Import inventory error:", err);
    return res.status(mappedError.statusCode).json({ error: mappedError.message });
  }
});

export default router;
