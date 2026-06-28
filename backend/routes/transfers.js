import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";

const router = Router();

// List transfers
router.get("/", authenticateToken, requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const transfers = await prisma.stockTransfer.findMany({
      where: scopedWhere(scope, {}),
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        user: { select: { id: true, fname: true, lname: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(transfers);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch transfers");
  }
});

// Get single transfer
router.get("/:id", authenticateToken, requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const transfer = await prisma.stockTransfer.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: {
        fromBranch: true,
        toBranch: true,
        user: { select: { id: true, fname: true, lname: true } },
        items: { include: { product: true } },
      },
    });
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });
    res.json(transfer);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch transfer");
  }
});

// Create transfer
router.post("/", authenticateToken, requirePermission("canTransferStock"), requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { fromBranchId, toBranchId, items = [], notes } = req.body;

    if (!fromBranchId || !toBranchId) return res.status(400).json({ error: "fromBranchId and toBranchId required" });
    if (fromBranchId === toBranchId) return res.status(400).json({ error: "Cannot transfer to same branch" });
    if (!items.length) return res.status(400).json({ error: "Items required" });

    const transferNo = `TRF-${Date.now()}`;

    // Validate stock availability
    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: { id: item.productId, branchId: fromBranchId, tenantId },
      });
      if (!product) return res.status(404).json({ error: `Product not found in source branch` });
      if (product.quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.quantity}` });
      }
    }

    const transfer = await prisma.stockTransfer.create({
      data: {
        transferNo,
        tenantId,
        fromBranchId,
        toBranchId,
        userId: req.user.id,
        status: "in_transit",
        notes,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            notes: item.notes,
          })),
        },
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    // Deduct stock from source branch
    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: Number(item.quantity) } },
      });
    }

    res.status(201).json(transfer);
  } catch (err) {
    console.error("Create transfer error:", err);
    handleBranchError(res, err, "Failed to create transfer");
  }
});

// Receive transfer
router.put("/:id/receive", authenticateToken, requirePermission("canTransferStock"), requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: true },
    });
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });
    if (transfer.status !== "in_transit") return res.status(400).json({ error: "Transfer is not in transit" });

    // Add stock to destination branch
    for (const item of transfer.items) {
      // Check if product exists in destination branch
      let destProduct = await prisma.product.findFirst({
        where: { id: item.productId, branchId: transfer.toBranchId, tenantId },
      });

      if (destProduct) {
        await prisma.product.update({
          where: { id: destProduct.id },
          data: { quantity: { increment: item.quantity } },
        });
      } else {
        // Clone product to destination branch
        const srcProduct = await prisma.product.findUnique({ where: { id: item.productId } });
        if (srcProduct) {
          destProduct = await prisma.product.create({
            data: {
              name: srcProduct.name,
              sku: srcProduct.sku,
              barcode: srcProduct.barcode,
              description: srcProduct.description,
              price: srcProduct.price,
              cost: srcProduct.cost,
              quantity: item.quantity,
              minStock: srcProduct.minStock,
              categoryId: srcProduct.categoryId,
              tenantId,
              branchId: transfer.toBranchId,
              isActive: true,
              baseUnit: srcProduct.baseUnit,
              itemType: srcProduct.itemType,
            },
          });
        }
      }
    }

    const updated = await prisma.stockTransfer.update({
      where: { id: req.params.id },
      data: { status: "received" },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("Receive transfer error:", err);
    res.status(500).json({ error: "Failed to receive transfer" });
  }
});

// Cancel transfer (restores stock to source)
router.put("/:id/cancel", authenticateToken, requirePermission("canTransferStock"), requireFeature("inventory.transfers"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: true },
    });
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });
    if (transfer.status === "received") return res.status(400).json({ error: "Cannot cancel received transfer" });
    if (transfer.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });

    // Restore stock to source branch
    for (const item of transfer.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { quantity: { increment: item.quantity } },
      });
    }

    const updated = await prisma.stockTransfer.update({
      where: { id: req.params.id },
      data: { status: "cancelled" },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel transfer" });
  }
});

export default router;
