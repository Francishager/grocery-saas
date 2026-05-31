import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

const router = Router();

// Create purchase
router.post("/", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { supplier, refNo, items = [], notes } = req.body;

    if (!items.length) return res.status(400).json({ error: "Items required" });

    const total = items.reduce((sum, i) => sum + Number(i.cost || 0) * Number(i.quantity || 1), 0);

    const purchase = await prisma.purchase.create({
      data: {
        tenantId,
        userId,
        supplier,
        refNo: refNo || `PUR-${Date.now()}`,
        total,
        notes,
        items: { create: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity || 1), cost: Number(i.cost || 0), total: Number(i.cost || 0) * Number(i.quantity || 1) })) },
      },
      include: { items: true },
    });

    res.status(201).json({ message: "Purchase recorded", purchase });
  } catch (err) {
    console.error("Purchase create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Checkout multiple purchases
router.post("/checkout", authenticateToken, requireRole(["owner", "manager", "accountant"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { cart = [], supplier, notes } = req.body;
    if (!cart.length) return res.status(400).json({ error: "Cart is empty" });

    const total = cart.reduce((sum, c) => sum + Number(c.cost || 0) * Number(c.quantity || 1), 0);
    const purchase = await prisma.purchase.create({
      data: {
        tenantId,
        userId,
        supplier,
        refNo: `PUR-${Date.now()}`,
        total,
        notes,
        items: { create: cart.map((c) => ({ productId: c.productId, quantity: Number(c.quantity || 1), cost: Number(c.cost || 0), total: Number(c.cost || 0) * Number(c.quantity || 1) })) },
      },
      include: { items: true },
    });

    res.status(201).json({ message: "Checkout successful", purchase });
  } catch (err) {
    console.error("Purchase checkout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List purchases
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
    const purchases = await prisma.purchase.findMany({ where, include: { items: true, user: { select: { id: true, fname: true, lname: true } } }, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) });
    const count = await prisma.purchase.count({ where });
    res.json({ purchases, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List purchases error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
