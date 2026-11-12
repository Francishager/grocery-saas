import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, handleBranchError } from "../src/utils/branchAccess.js";

const router = Router();

async function assertBranchAccess(db, req, branchId) {
  return resolveBranchScope(db, {
    user: req.user,
    query: { ...req.query, branchId },
  }, { source: "query", allowOwnerAll: false });
}

function transferIncludes() {
  return {
    fromBranch: { select: { id: true, name: true } },
    toBranch: { select: { id: true, name: true } },
    user: { select: { id: true, fname: true, lname: true } },
    items: {
      include: {
        product: { select: { id: true, name: true, sku: true, barcode: true } },
        destinationProduct: { select: { id: true, name: true, sku: true, barcode: true } },
      },
    },
    reversals: { select: { id: true, transferNo: true, status: true } },
  };
}

export async function matchDestinationProduct(db, source, branchId, tenantId) {
  const identifiers = [];
  if (source.sku) identifiers.push({ sku: source.sku });
  if (source.barcode) identifiers.push({ barcode: source.barcode });
  if (!identifiers.length) {
    const sameName = await db.product.findMany({ where: { tenantId, branchId, name: source.name } });
    const exact = sameName.filter((product) => product.size === source.size && product.brand === source.brand);
    return exact.length === 1 ? exact[0] : null;
  }

  const candidates = await db.product.findMany({
    where: { tenantId, branchId, OR: identifiers },
  });
  const bySku = source.sku ? candidates.filter((product) => product.sku === source.sku) : [];
  const byBarcode = source.barcode ? candidates.filter((product) => product.barcode === source.barcode) : [];
  const skuMatch = bySku[0];
  const barcodeMatch = byBarcode[0];
  if (skuMatch && barcodeMatch && skuMatch.id !== barcodeMatch.id) {
    const error = new Error(`SKU and barcode for ${source.name} identify different products in the destination branch`);
    error.statusCode = 409;
    throw error;
  }
  return skuMatch || barcodeMatch || null;
}

async function getDestinationProduct(tx, item, transfer, tenantId) {
  if (item.destinationProductId) {
    const saved = await tx.product.findFirst({
      where: { id: item.destinationProductId, tenantId, branchId: transfer.toBranchId },
    });
    if (saved) return saved;
  }

  const source = await tx.product.findFirst({
    where: { id: item.productId, tenantId, branchId: transfer.fromBranchId },
  });
  if (!source) {
    const error = new Error("The source product for this transfer no longer exists");
    error.statusCode = 409;
    throw error;
  }

  const existing = await matchDestinationProduct(tx, source, transfer.toBranchId, tenantId);
  if (existing) return existing;

  return tx.product.create({
    data: {
      name: source.name,
      sku: source.sku,
      barcode: source.barcode,
      size: source.size,
      brand: source.brand,
      design: source.design,
      description: source.description,
      price: source.price,
      cost: source.cost,
      quantity: 0,
      minStock: source.minStock,
      categoryId: source.categoryId,
      tenantId,
      branchId: transfer.toBranchId,
      isActive: true,
      baseUnit: source.baseUnit,
      itemType: source.itemType,
      image: source.image,
    },
  });
}

// List transfers visible to the user's assigned branch (or all branches for owners).
router.get("/", authenticateToken, requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const where = scope.canAccessAllBranches
      ? { tenantId: scope.tenantId }
      : { tenantId: scope.tenantId, OR: [{ fromBranchId: scope.branchId }, { toBranchId: scope.branchId }] };
    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: transferIncludes(),
      orderBy: { createdAt: "desc" },
    });
    res.json(transfers);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch transfers");
  }
});

router.get("/:id", authenticateToken, requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const transfer = await prisma.stockTransfer.findFirst({
      where: scope.canAccessAllBranches
        ? { id: req.params.id, tenantId: scope.tenantId }
        : { id: req.params.id, tenantId: scope.tenantId, OR: [{ fromBranchId: scope.branchId }, { toBranchId: scope.branchId }] },
      include: transferIncludes(),
    });
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });
    res.json(transfer);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch transfer");
  }
});

router.post("/", authenticateToken, requirePermission("canTransferStock"), requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { fromBranchId, toBranchId, items = [], notes } = req.body;
    if (!fromBranchId || !toBranchId) return res.status(400).json({ error: "fromBranchId and toBranchId required" });
    if (fromBranchId === toBranchId) return res.status(400).json({ error: "Cannot transfer to same branch" });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Items required" });

    await assertBranchAccess(prisma, req, fromBranchId);
    const branches = await prisma.branch.findMany({
      where: { tenantId, id: { in: [fromBranchId, toBranchId] }, isActive: true },
      select: { id: true },
    });
    if (branches.length !== 2) return res.status(404).json({ error: "Source or destination branch not found" });

    const normalized = new Map();
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!item.productId || !Number.isSafeInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "Each transfer item needs a product and a positive whole-number quantity" });
      }
      normalized.set(item.productId, (normalized.get(item.productId) || 0) + quantity);
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const sources = await tx.product.findMany({
        where: { id: { in: [...normalized.keys()] }, tenantId, branchId: fromBranchId },
      });
      if (sources.length !== normalized.size) {
        const error = new Error("One or more selected products are not in the source branch");
        error.statusCode = 404;
        throw error;
      }
      for (const source of sources) {
        if (source.itemType === "service") {
          const error = new Error(`${source.name} is a service and cannot be transferred as stock`);
          error.statusCode = 400;
          throw error;
        }
        const changed = await tx.product.updateMany({
          where: { id: source.id, tenantId, branchId: fromBranchId, quantity: { gte: normalized.get(source.id) } },
          data: { quantity: { decrement: normalized.get(source.id) } },
        });
        if (changed.count !== 1) {
          const error = new Error(`Insufficient stock for ${source.name}; refresh inventory and try again`);
          error.statusCode = 409;
          throw error;
        }
      }
      return tx.stockTransfer.create({
        data: {
          transferNo: `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tenantId,
          fromBranchId,
          toBranchId,
          userId: req.user.id,
          status: "in_transit",
          notes: notes || null,
          items: { create: [...normalized].map(([productId, quantity]) => ({ productId, quantity })) },
        },
        include: transferIncludes(),
      });
    }, { isolationLevel: "Serializable" });

    res.status(201).json(transfer);
  } catch (err) {
    handleBranchError(res, err, "Failed to create transfer");
  }
});

router.put("/:id/receive", authenticateToken, requirePermission("canTransferStock"), requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id: req.params.id, tenantId },
        include: { items: { include: { product: true } } },
      });
      if (!transfer) return { error: "Transfer not found", status: 404 };
      if (transfer.status !== "in_transit") return { error: "Transfer is not in transit", status: 409 };
      await assertBranchAccess(tx, req, transfer.toBranchId);

      for (const item of transfer.items) {
        const destination = await getDestinationProduct(tx, item, transfer, tenantId);
        await tx.product.update({
          where: { id: destination.id },
          data: { quantity: { increment: item.quantity } },
        });
        await tx.stockTransferItem.update({
          where: { id: item.id },
          data: { destinationProductId: destination.id },
        });
      }
      const claimed = await tx.stockTransfer.updateMany({
        where: { id: transfer.id, tenantId, status: "in_transit" },
        data: { status: "received" },
      });
      if (claimed.count !== 1) {
        const error = new Error("This transfer has already been received or changed");
        error.statusCode = 409;
        throw error;
      }
      return { transfer: await tx.stockTransfer.findUnique({ where: { id: transfer.id }, include: transferIncludes() }) };
    }, { isolationLevel: "Serializable" });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result.transfer);
  } catch (err) {
    handleBranchError(res, err, "Failed to receive transfer");
  }
});

router.put("/:id/cancel", authenticateToken, requirePermission("canTransferStock"), requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({ where: { id: req.params.id, tenantId }, include: { items: true } });
      if (!transfer) return { error: "Transfer not found", status: 404 };
      if (transfer.status !== "in_transit") return { error: "Only an in-transit transfer can be cancelled", status: 409 };
      await assertBranchAccess(tx, req, transfer.fromBranchId);
      const claimed = await tx.stockTransfer.updateMany({ where: { id: transfer.id, tenantId, status: "in_transit" }, data: { status: "cancelled" } });
      if (claimed.count !== 1) {
        const error = new Error("This transfer has already been changed");
        error.statusCode = 409;
        throw error;
      }
      for (const item of transfer.items) {
        await tx.product.update({ where: { id: item.productId }, data: { quantity: { increment: item.quantity } } });
      }
      return { transfer: await tx.stockTransfer.findUnique({ where: { id: transfer.id }, include: transferIncludes() }) };
    }, { isolationLevel: "Serializable" });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result.transfer);
  } catch (err) {
    handleBranchError(res, err, "Failed to cancel transfer");
  }
});

// Returns a received transfer as a new, auditable transfer back to its source branch.
router.post("/:id/return", authenticateToken, requirePermission("canTransferStock"), requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const returned = await prisma.$transaction(async (tx) => {
      const original = await tx.stockTransfer.findFirst({
        where: { id: req.params.id, tenantId },
        include: { items: { include: { product: true, destinationProduct: true } } },
      });
      if (!original) {
        const error = new Error("Transfer not found"); error.statusCode = 404; throw error;
      }
      if (original.status !== "received") {
        const error = new Error("Only a received transfer can be returned"); error.statusCode = 409; throw error;
      }
      await assertBranchAccess(tx, req, original.toBranchId);
      const existingReturn = await tx.stockTransfer.findFirst({ where: { tenantId, reversalOfId: original.id, status: { in: ["in_transit", "received"] } }, select: { id: true } });
      if (existingReturn) {
        const error = new Error("A return transfer already exists for this transfer"); error.statusCode = 409; throw error;
      }

      const returnItems = [];
      for (const item of original.items) {
        const destination = item.destinationProduct || await matchDestinationProduct(tx, item.product, original.toBranchId, tenantId);
        if (!destination) {
          const error = new Error(`Could not identify the received product ${item.product.name} in the destination branch`);
          error.statusCode = 409; throw error;
        }
        if (item.destinationProductId !== destination.id) {
          await tx.stockTransferItem.update({ where: { id: item.id }, data: { destinationProductId: destination.id } });
        }
        const changed = await tx.product.updateMany({
          where: { id: destination.id, tenantId, branchId: original.toBranchId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (changed.count !== 1) {
          const error = new Error(`Insufficient available stock to return ${item.product.name}; the destination has sold or adjusted some of it`);
          error.statusCode = 409; throw error;
        }
        returnItems.push({ productId: destination.id, destinationProductId: item.productId, quantity: item.quantity, notes: `Return of ${original.transferNo}` });
      }

      return tx.stockTransfer.create({
        data: {
          transferNo: `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tenantId,
          fromBranchId: original.toBranchId,
          toBranchId: original.fromBranchId,
          userId: req.user.id,
          status: "in_transit",
          reversalOfId: original.id,
          notes: `Return of ${original.transferNo}${req.body?.notes ? `: ${req.body.notes}` : ""}`,
          items: { create: returnItems },
        },
        include: transferIncludes(),
      });
    }, { isolationLevel: "Serializable" });
    res.status(201).json(returned);
  } catch (err) {
    handleBranchError(res, err, "Failed to return transfer");
  }
});

export default router;
