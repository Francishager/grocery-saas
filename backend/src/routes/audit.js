import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";

const router = Router();

// List audit logs for the current tenant
router.get("/", authenticateToken, requirePermission("canViewAuditReport"), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { model, action, userId, from, to, page = 1, limit = 50 } = req.query;

    const where = { tenantId };
    if (model) where.model = model;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("Audit log list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get audit log summary (counts by model and action)
router.get("/summary", authenticateToken, requirePermission("canViewAuditReport"), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { model: true, action: true, createdAt: true },
    });

    const byModel = {};
    const byAction = {};
    const byDay = {};

    for (const log of logs) {
      byModel[log.model] = (byModel[log.model] || 0) + 1;
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      const day = log.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }

    res.json({ byModel, byAction, byDay, total: logs.length });
  } catch (err) {
    console.error("Audit summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
