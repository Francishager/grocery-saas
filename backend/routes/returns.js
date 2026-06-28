import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";

const router = Router();

// List returns
router.get("/", authenticateToken, requireFeature("sales.returns"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const returns = await prisma.saleReturn.findMany({
      where: scopedWhere(scope, {}),
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        sale: { select: { id: true, receiptNo: true } },
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, fname: true, lname: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(returns);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch returns");
  }
});

// Get single return
router.get("/:id", authenticateToken, requireFeature("sales.returns"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const ret = await prisma.saleReturn.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: {
        items: { include: { product: true } },
        sale: true,
        customer: true,
        user: { select: { id: true, fname: true, lname: true } },
      },
    });
    if (!ret) return res.status(404).json({ error: "Return not found" });
    res.json(ret);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch return");
  }
});

// Create return
router.post("/", authenticateToken, requirePermission("canRefundSale"), requireFeature("sales.returns"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { saleId, items = [], reason, refundMethod = "cash", customerId } = req.body;

    if (!items.length) return res.status(400).json({ error: "Items required" });

    const returnNo = `RET-${Date.now()}`;
    const tenantId = req.user.tenantId || req.user.tenant_id;

    let total = 0;
    const returnItems = [];
    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: scopedWhere(scope, { id: item.productId }),
      });
      if (!product) return res.status(404).json({ error: `Product ${item.productId} not found` });

      const qty = Math.max(1, Number(item.quantity || 1));
      const price = Number(item.price || product.price);
      const lineTotal = qty * price;
      total += lineTotal;

      returnItems.push({
        productId: item.productId,
        quantity: qty,
        price,
        total: lineTotal,
        reason: item.reason || null,
      });

      // Restock product
      await prisma.product.update({
        where: { id: item.productId },
        data: { quantity: { increment: qty } },
      });
    }

    // Update sale status if linked
    if (saleId) {
      await prisma.sale.update({
        where: { id: saleId },
        data: { status: "refunded" },
      });
    }

    const ret = await prisma.saleReturn.create({
      data: {
        returnNo,
        tenantId,
        branchId: scope.branchId || null,
        saleId: saleId || null,
        userId: req.user.id,
        customerId: customerId || null,
        total,
        reason,
        refundMethod,
        status: "completed",
        items: { create: returnItems },
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        sale: { select: { id: true, receiptNo: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(ret);
  } catch (err) {
    console.error("Create return error:", err);
    handleBranchError(res, err, "Failed to create return");
  }
});

export default router;
