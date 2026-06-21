import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";

const router = Router();

const saleRoles = ["owner", "manager", "attendant"];

function normalizeItems(items, idKey = "productId") {
  return items.map((item) => ({
    productId: item[idKey] || item.productId || item.id,
    quantity: Math.max(1, Number(item.qty || item.quantity || 1)),
    price: Number(item.price || 0),
    discount: Number(item.discount || 0),
  }));
}

async function checkedSaleItems(items, scope) {
  const normalized = normalizeItems(items);
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
    if (product.quantity < item.quantity) {
      const error = new Error(`${product.name} has only ${product.quantity} in stock`);
      error.statusCode = 400;
      throw error;
    }

    const price = item.price || product.price || 0;
    return {
      productId: item.productId,
      quantity: item.quantity,
      price,
      discount: item.discount,
      total: Math.max(0, price * item.quantity - item.discount),
    };
  });
}

// Create single sale
router.post("/", authenticateToken, requireRole(saleRoles), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { items = [], paymentMethod = "cash", notes } = req.body;
    if (!items.length) return res.status(400).json({ error: "Items required" });

    const saleItems = await checkedSaleItems(items, scope);
    const subtotal = saleItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discount = saleItems.reduce((sum, i) => sum + i.discount, 0);
    const total = subtotal - discount;

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          receiptNo: `RCP-${Date.now()}`,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          userId,
          total,
          subtotal,
          discount,
          paymentMethod,
          notes,
          items: { create: saleItems },
        },
        include: { items: true, branch: true },
      });

      for (const item of saleItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      return created;
    });

    res.status(201).json({ message: "Sale recorded", sale });
  } catch (err) {
    console.error("Sale create error:", err);
    handleBranchError(res, err);
  }
});

// Checkout multiple items
router.post("/checkout", authenticateToken, requireRole(saleRoles), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { cart = [], paymentMethod = "cash" } = req.body;
    if (!cart.length) return res.status(400).json({ error: "Cart is empty" });

    const saleItems = await checkedSaleItems(cart, scope);
    const subtotal = saleItems.reduce((sum, c) => sum + c.price * c.quantity, 0);
    const discount = saleItems.reduce((sum, c) => sum + c.discount, 0);
    const total = subtotal - discount;

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          receiptNo: `RCP-${Date.now()}`,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          userId,
          total,
          subtotal,
          discount,
          paymentMethod,
          items: { create: saleItems },
        },
        include: { items: true, branch: true },
      });

      for (const item of saleItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      return created;
    });

    res.status(201).json({ message: "Checkout successful", count: cart.length, total, sale });
  } catch (err) {
    console.error("Sales checkout error:", err);
    handleBranchError(res, err);
  }
});

// List sales
router.get("/", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { from, to, page = 1, limit = 50 } = req.query;
    const where = scopedWhere(scope);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const sales = await prisma.sale.findMany({ where, include: { items: true, branch: true, user: { select: { id: true, fname: true, lname: true } } }, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) });
    const count = await prisma.sale.count({ where });
    res.json({ sales, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List sales error:", err);
    handleBranchError(res, err);
  }
});

export default router;
