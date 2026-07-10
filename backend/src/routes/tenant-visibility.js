import express from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/platform/tenants/activity/:tenantId
 * Get activity summary for a specific tenant (for SaaS admin visibility)
 */
router.get("/tenants/activity/:tenantId", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { days = 30 } = req.query;

    // Get tenant details
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    // Get activity summary
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const [totalUsers, activeUsers, totalSales, totalSalesAmount, recentActivities] = await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.user.count({
        where: {
          tenantId,
          updatedAt: { gte: since },
        },
      }),
      prisma.sale.count({ where: { tenantId, createdAt: { gte: since } } }),
      prisma.sale.aggregate({
        where: { tenantId, createdAt: { gte: since } },
        _sum: { totalAmount: true },
      }),
      prisma.tenantActivityLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    // Get feature usage from audit logs
    const featureUsageAudit = await prisma.auditLog.findMany({
      where: {
        tenantId,
        model: "Feature",
        createdAt: { gte: since },
      },
      distinct: ["action"],
    });

    return res.json({
      tenant: {
        id: tenant.id,
        name: tenant.businessName,
        slug: tenant.slug,
        plan: tenant.plan?.name,
        status: tenant.status,
        createdAt: tenant.createdAt,
      },
      activity: {
        period: `${days} days`,
        totalUsers,
        activeUsers,
        totalSales,
        totalSalesAmount: totalSalesAmount._sum?.totalAmount || 0,
        avgSalesAmount: totalSales > 0 ? (totalSalesAmount._sum?.totalAmount || 0) / totalSales : 0,
        recentActivities,
      },
    });
  } catch (err) {
    console.error("Get tenant activity error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/platform/tenants/audit-trail/:tenantId
 * Get detailed audit trail for a specific tenant
 */
router.get("/tenants/audit-trail/:tenantId", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { action, model, severity, limit = 50, offset = 0 } = req.query;

    // Build filter
    const filter = { tenantId };
    if (action) filter.action = { contains: action, mode: "insensitive" };
    if (model) filter.model = { contains: model, mode: "insensitive" };
    if (severity) filter.severity = severity;

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: filter,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.auditLog.count({ where: filter }),
    ]);

    return res.json({
      tenantId,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      auditLogs,
    });
  } catch (err) {
    console.error("Get audit trail error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/platform/tenants/metrics
 * Get metrics across all tenants (for SaaS overview)
 */
router.get("/tenants/metrics", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get aggregated metrics
    const tenantCount = await prisma.tenant.count();
    const totalUsers = await prisma.user.count();
    const activeUsersCount = await prisma.user.count({
      where: { updatedAt: { gte: since } },
    });
    const totalSales = await prisma.sale.count({
      where: { createdAt: { gte: since } },
    });
    const totalSalesAmount = await prisma.sale.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { totalAmount: true },
    });

    // Get top active tenants
    const topTenants = await prisma.tenantActivityLog.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { tenantId: "desc" } },
      take: 10,
    });

    const topTenantsWithDetails = await Promise.all(
      topTenants.map(async (item) => {
        const tenant = await prisma.tenant.findUnique({
          where: { id: item.tenantId },
          select: { id: true, businessName: true, slug: true },
        });
        return {
          ...tenant,
          activityCount: item._count,
        };
      })
    );

    // Get critical audit events
    const criticalEvents = await prisma.auditLog.findMany({
      where: {
        severity: "critical",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return res.json({
      period: `${days} days`,
      tenants: {
        total: tenantCount,
      },
      users: {
        total: totalUsers,
        active: activeUsersCount,
      },
      sales: {
        total: totalSales,
        totalAmount: totalSalesAmount._sum?.totalAmount || 0,
      },
      topTenants: topTenantsWithDetails,
      criticalEvents,
    });
  } catch (err) {
    console.error("Get metrics error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/platform/tenants/admin-actions
 * Get all SaaS admin actions (operations where tenantId="platform")
 */
router.get("/tenants/admin-actions", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { severity, limit = 50, offset = 0 } = req.query;

    // Build filter
    const filter = { tenantId: "platform" };
    if (severity) filter.severity = severity;

    const [adminActions, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: filter,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.auditLog.count({ where: filter }),
    ]);

    return res.json({
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      adminActions,
    });
  } catch (err) {
    console.error("Get admin actions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/platform/tenants/comparison
 * Compare metrics across multiple tenants
 */
router.get("/tenants/comparison", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all tenants with their metrics
    const tenants = await prisma.tenant.findMany({
      include: {
        plan: true,
      },
    });

    const comparison = await Promise.all(
      tenants.map(async (tenant) => {
        const [userCount, activeCount, saleCount, salesAmount, auditCount] = await Promise.all([
          prisma.user.count({ where: { tenantId: tenant.id } }),
          prisma.user.count({
            where: { tenantId: tenant.id, updatedAt: { gte: since } },
          }),
          prisma.sale.count({ where: { tenantId: tenant.id, createdAt: { gte: since } } }),
          prisma.sale.aggregate({
            where: { tenantId: tenant.id, createdAt: { gte: since } },
            _sum: { totalAmount: true },
          }),
          prisma.auditLog.count({
            where: { tenantId: tenant.id, createdAt: { gte: since } },
          }),
        ]);

        return {
          tenantId: tenant.id,
          tenantName: tenant.businessName,
          slug: tenant.slug,
          plan: tenant.plan?.name,
          status: tenant.status,
          users: {
            total: userCount,
            active: activeCount,
          },
          sales: {
            count: saleCount,
            totalAmount: salesAmount._sum?.totalAmount || 0,
          },
          operationsLogged: auditCount,
        };
      })
    );

    return res.json({
      period: `${days} days`,
      totalTenants: tenants.length,
      comparison: comparison.sort((a, b) => b.sales.totalAmount - a.sales.totalAmount),
    });
  } catch (err) {
    console.error("Get comparison error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
