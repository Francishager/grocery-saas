import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

const router = Router();

// Create single sale
router.post("/", authenticateToken, requireRole(["owner", "attendant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { items = [], paymentMethod = "cash", notes } = req.body;
    if (!items.length) return res.status(400).json({ error: "Items required" });

    const subtotal = items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 1), 0);
    const discount = items.reduce((sum, i) => sum + Number(i.discount || 0), 0);
    const total = subtotal - discount;

    const sale = await prisma.sale.create({
      data: {
        receiptNo: `RCP-${Date.now()}`,
        tenantId,
        userId,
        total,
        subtotal,
        discount,
        paymentMethod,
        notes,
        items: { create: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity || 1), price: Number(i.price || 0), discount: Number(i.discount || 0), total: Number(i.price || 0) * Number(i.quantity || 1) - Number(i.discount || 0) })) },
      },
      include: { items: true },
    });

    res.status(201).json({ message: "Sale recorded", sale });
  } catch (err) {
    console.error("Sale create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Checkout multiple items
router.post("/checkout", authenticateToken, requireRole(["owner", "attendant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { cart = [], paymentMethod = "cash" } = req.body;
    if (!cart.length) return res.status(400).json({ error: "Cart is empty" });

    const subtotal = cart.reduce((sum, c) => sum + Number(c.price || 0) * Number(c.qty || c.quantity || 1), 0);
    const discount = cart.reduce((sum, c) => sum + Number(c.discount || 0), 0);
    const total = subtotal - discount;

    const sale = await prisma.sale.create({
      data: {
        receiptNo: `RCP-${Date.now()}`,
        tenantId,
        userId,
        total,
        subtotal,
        discount,
        paymentMethod,
        items: { create: cart.map((c) => ({ productId: c.productId || c.id, quantity: Number(c.qty || c.quantity || 1), price: Number(c.price || 0), discount: Number(c.discount || 0), total: Number(c.price || 0) * Number(c.qty || c.quantity || 1) - Number(c.discount || 0) })) },
      },
      include: { items: true },
    });

    res.status(201).json({ message: "Checkout successful", count: cart.length, total, sale });
  } catch (err) {
    console.error("Sales checkout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List sales
router.get("/", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { from, to, page = 1, limit = 50 } = req.query;
    const where = { tenantId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const sales = await prisma.sale.findMany({ where, include: { items: true, user: { select: { id: true, fname: true, lname: true } } }, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) });
    const count = await prisma.sale.count({ where });
    res.json({ sales, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List sales error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
