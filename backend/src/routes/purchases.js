import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";

const router = Router();
const purchaseRoles = ["owner", "manager", "accountant"];

async function checkedPurchaseItems(items, scope) {
  const normalized = items.map((item) => ({
    productId: item.productId || item.id,
    quantity: Math.max(1, Number(item.quantity || item.qty || 1)),
    cost: Number(item.cost || item.unit_cost || 0),
  }));
  const productIds = [...new Set(normalized.map((item) => item.productId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: scopedWhere(scope, { id: { in: productIds }, isActive: { not: false } }),
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  if (products.length !== productIds.length) {
    const error = new Error("One or more products were not found in this branch");
    error.statusCode = 400;
    throw error;
  }

  return normalized.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      const error = new Error("Product is required");
      error.statusCode = 400;
      throw error;
    }
    const cost = item.cost || product.cost || 0;
    return {
      productId: item.productId,
      quantity: item.quantity,
      cost,
      total: cost * item.quantity,
    };
  });
}

// Create purchase
router.post("/", authenticateToken, requireRole(purchaseRoles), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { supplier, refNo, items = [], notes, paymentMethod } = req.body;

    if (!items.length) return res.status(400).json({ error: "Items required" });

    const purchaseItems = await checkedPurchaseItems(items, scope);
    const total = purchaseItems.reduce((sum, i) => sum + i.total, 0);

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          userId,
          supplier,
          refNo: refNo || `PUR-${Date.now()}`,
          paymentMethod: paymentMethod || "cash",
          total,
          notes,
          items: { create: purchaseItems },
        },
        include: { items: true, branch: true },
      });

      for (const item of purchaseItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: { increment: item.quantity },
            cost: item.cost,
          },
        });
      }

      return created;
    });

    res.status(201).json({ message: "Purchase recorded", purchase });
  } catch (err) {
    console.error("Purchase create error:", err);
    handleBranchError(res, err);
  }
});

// Checkout multiple purchases
router.post("/checkout", authenticateToken, requireRole(purchaseRoles), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { cart = [], supplier, refNo, notes, paymentMethod } = req.body;
    if (!cart.length) return res.status(400).json({ error: "Cart is empty" });

    const purchaseItems = await checkedPurchaseItems(cart, scope);
    const total = purchaseItems.reduce((sum, c) => sum + c.total, 0);
    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          userId,
          supplier,
          refNo: refNo || `PUR-${Date.now()}`,
          paymentMethod: paymentMethod || "cash",
          total,
          notes,
          items: { create: purchaseItems },
        },
        include: { items: true, branch: true },
      });

      for (const item of purchaseItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: { increment: item.quantity },
            cost: item.cost,
          },
        });
      }

      return created;
    });

    res.status(201).json({ message: "Checkout successful", purchase });
  } catch (err) {
    console.error("Purchase checkout error:", err);
    handleBranchError(res, err);
  }
});

// List purchases
router.get("/", authenticateToken, requireRole(purchaseRoles), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { from, to, page = 1, limit = 50 } = req.query;
    const where = scopedWhere(scope);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const purchases = await prisma.purchase.findMany({ where, include: { items: true, branch: true, user: { select: { id: true, fname: true, lname: true } } }, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) });
    const count = await prisma.purchase.count({ where });
    res.json({ purchases, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List purchases error:", err);
    handleBranchError(res, err);
  }
});

export default router;
