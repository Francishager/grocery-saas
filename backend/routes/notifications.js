import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { notifyOwnerOfDailySalesSummary } from "../src/utils/notifications.js";

const router = Router();

// List notifications for current user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const notifications = await prisma.notification.findMany({
      where: {
        tenantId,
        OR: [
          { userId: req.user.id },
          { userId: null },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Create notification (internal use)
router.post("/", authenticateToken, requirePermission("canCreateCommunication"), requireFeature("communication"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { userId, channel = "in_app", title, message, type = "info", metadata } = req.body;
    if (!title || !message) return res.status(400).json({ error: "title and message required" });

    const notif = await prisma.notification.create({
      data: {
        tenantId,
        userId: userId || null,
        channel,
        title,
        message,
        type,
        metadata: metadata || undefined,
      },
    });
    res.status(201).json(notif);
  } catch (err) {
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// Mark as read
router.put("/:id/read", authenticateToken, async (req, res) => {
  try {
    const notif = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Mark all as read
router.put("/read-all", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    await prisma.notification.updateMany({
      where: { tenantId, userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// Unread count
router.get("/unread-count", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const count = await prisma.notification.count({
      where: { tenantId, userId: req.user.id, isRead: false },
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

router.post("/daily-sales-summary", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const [agg, count, products] = await Promise.all([
      prisma.sale.aggregate({ where: { tenantId, createdAt: { gte: start, lt: end } }, _sum: { total: true, discount: true, tax: true, subtotal: true } }),
      prisma.sale.count({ where: { tenantId, createdAt: { gte: start, lt: end } } }),
      prisma.product.findMany({ where: { tenantId, isActive: { not: false } }, select: { quantity: true, minStock: true, expiryDate: true } }),
    ]);
    const lowStockCount = products.filter((product) => (product.quantity || 0) <= (product.minStock || 0)).length;
    const expiringSoonCount = products.filter((product) => {
      if (!product.expiryDate) return false;
      const expiryDate = new Date(product.expiryDate);
      return expiryDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }).length;
    const summary = {
      salesCount: count,
      totalRevenue: agg._sum.total || 0,
      totalDiscount: agg._sum.discount || 0,
      totalTax: agg._sum.tax || 0,
      lowStockCount,
      expiringSoonCount,
      currency: (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }).catch(() => null))?.currency || 'UGX',
    };
    const notification = await notifyOwnerOfDailySalesSummary({ tenantId, summary });
    res.json({ message: 'Daily sales summary notification queued', summary, notification });
  } catch (err) {
    res.status(500).json({ error: 'Failed to queue daily sales summary' });
  }
});

// Send broadcast (SMS/Email template — actual sending would need provider integration)
router.post("/broadcast", authenticateToken, requirePermission("canCreateCommunication"), requireFeature("communication"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { channel = "in_app", title, message, type = "info", targetAll = true } = req.body;
    if (!title || !message) return res.status(400).json({ error: "title and message required" });

    if (targetAll) {
      // Create notification for all tenant users
      const users = await prisma.user.findMany({ where: { tenantId, isActive: true } });
      const notifs = await Promise.all(
        users.map((u) =>
          prisma.notification.create({
            data: { tenantId, userId: u.id, channel, title, message, type },
          })
        )
      );
      res.status(201).json({ message: `Broadcast sent to ${notifs.length} users`, count: notifs.length });
    } else {
      const notif = await prisma.notification.create({
        data: { tenantId, channel, title, message, type },
      });
      res.status(201).json(notif);
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to send broadcast" });
  }
});

export default router;
