import express from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import hrFeatureService from "../services/hrFeatureService.js";
import { summarizePlatformAudit } from "../utils/platformAuditInsights.js";

const router = express.Router();

const HR_FEATURE_CATALOG = [
  { name: "attendance_tracking", label: "Attendance Tracking", description: "Attendance records, check-in/out and approvals" },
  { name: "shift_management", label: "Shift Management", description: "Shift setup, assignments and swaps" },
  { name: "leave_management", label: "Leave Management", description: "Leave types, requests, balances and approvals" },
  { name: "payroll_processing", label: "Payroll Processing", description: "Payroll visibility and processing controls" },
  { name: "performance_management", label: "Performance Management", description: "Performance reviews and appraisals" },
  { name: "training_management", label: "Training Management", description: "Training plans and employee development" },
];

const MAX_AUDIT_PAGE_SIZE = 100;

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function toPlatformAuditEntry(log, tenantNames, userEmails, branchNames) {
  const tenantId = log.tenantId === 'platform' ? log.targetTenantId : log.tenantId;
  const isPlatformAction = log.tenantId === 'platform';
  const metrics = log.changes && typeof log.changes === 'object' ? log.changes : {};
  return {
    id: log.id,
    tenantId,
    tenantName: tenantNames.get(tenantId) || (isPlatformAction ? 'Platform' : 'Business unavailable'),
    actor: log.userEmail || userEmails.get(log.userId) || (isPlatformAction ? 'Platform administrator' : 'Email unavailable'),
    subjectEmail: log.subjectEmail || null,
    branchId: log.branchId || null,
    branchName: log.branchName || branchNames.get(log.branchId) || null,
    ip: log.ip || null,
    engagement: ['view', 'engagement'].includes(log.action) ? {
      activeMs: Number(metrics.activeMs) || 0,
      interactionCount: Number(metrics.interactionCount) || 0,
      maxScrollDepth: Number(metrics.maxScrollDepth) || 0,
      kind: metrics.kind || log.action,
    } : null,
    action: log.action,
    model: log.model,
    statusCode: log.statusCode,
    severity: log.severity,
    createdAt: log.createdAt,
  };
}

router.get('/audit', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 1000000);
    const limit = parsePositiveInt(req.query.limit, 25, MAX_AUDIT_PAGE_SIZE);
    const where = {};
    const tenantId = String(req.query.tenantId || '').trim();
    const action = String(req.query.action || '').trim().toLowerCase();
    const model = String(req.query.model || '').trim().slice(0, 80);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    if (tenantId) where.OR = [{ tenantId }, { targetTenantId: tenantId }];
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (model) where.model = { contains: model, mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) where.createdAt.gte = from;
      if (to && !Number.isNaN(to.getTime())) where.createdAt.lte = to;
    }
    if (search) {
      const [matchedTenants, matchedUsers, matchedBranches] = await Promise.all([
        prisma.tenant.findMany({
          where: { OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ] },
          select: { id: true },
          take: 100,
        }),
        prisma.user.findMany({ where: { email: { contains: search, mode: 'insensitive' } }, select: { id: true }, take: 100 }),
        prisma.branch.findMany({ where: { name: { contains: search, mode: 'insensitive' } }, select: { id: true }, take: 100 }),
      ]);
      const searchClause = { OR: [
        { action: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { userEmail: { contains: search, mode: 'insensitive' } },
        { subjectEmail: { contains: search, mode: 'insensitive' } },
        { branchName: { contains: search, mode: 'insensitive' } },
        { branchId: { in: matchedBranches.map(item => item.id) } },
        { ip: { contains: search, mode: 'insensitive' } },
        { userId: { in: matchedUsers.map(item => item.id) } },
        { tenantId: { in: matchedTenants.map(item => item.id) } },
        { targetTenantId: { in: matchedTenants.map(item => item.id) } },
      ] };
      where.AND = [...(where.AND || []), searchClause];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, tenantId: true, targetTenantId: true, userId: true, userEmail: true, subjectUserId: true, subjectEmail: true, branchId: true, branchName: true, ip: true, action: true, model: true, changes: true, statusCode: true, severity: true, createdAt: true },
      }),
      prisma.auditLog.count({ where }),
    ]);
    const relatedTenantIds = [...new Set(logs.flatMap(log => [log.tenantId === 'platform' ? log.targetTenantId : log.tenantId].filter(Boolean)))];
    const relatedBranchIds = [...new Set(logs.map(log => log.branchId).filter(Boolean))];
    const tenants = relatedTenantIds.length
      ? await prisma.tenant.findMany({ where: { id: { in: relatedTenantIds } }, select: { id: true, name: true } })
      : [];
    const branches = relatedBranchIds.length
      ? await prisma.branch.findMany({ where: { id: { in: relatedBranchIds } }, select: { id: true, name: true } })
      : [];
    const tenantNames = new Map(tenants.map(tenant => [tenant.id, tenant.name]));
    const branchNames = new Map(branches.map(branch => [branch.id, branch.name]));
    const missingEmailUserIds = [...new Set(logs.filter(log => !log.userEmail && log.userId && !log.userId.startsWith('system')).map(log => log.userId))];
    const usersWithEmail = missingEmailUserIds.length
      ? await prisma.user.findMany({ where: { id: { in: missingEmailUserIds } }, select: { id: true, email: true } })
      : [];
    const userEmails = new Map(usersWithEmail.filter(user => user.email).map(user => [user.id, user.email]));

    res.json({
      logs: logs.map(log => toPlatformAuditEntry(log, tenantNames, userEmails, branchNames)),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Platform audit list error:', error);
    res.status(500).json({ error: 'Failed to load platform activity' });
  }
});

router.get('/audit/insights', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const days = parsePositiveInt(req.query.days, 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = { tenantId: { not: 'platform' }, createdAt: { gte: since } };
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20000,
      select: { tenantId: true, userId: true, model: true, action: true, changes: true, createdAt: true },
    });
    const usageSummary = summarizePlatformAudit(logs);
    const usageTenantIds = usageSummary.byBusiness.map(item => item.tenantId);
    const usageTenants = usageTenantIds.length
      ? await prisma.tenant.findMany({ where: { id: { in: usageTenantIds } }, select: { id: true, name: true } })
      : [];
    const usageTenantNames = new Map(usageTenants.map(tenant => [tenant.id, tenant.name]));
    usageSummary.byBusiness = usageSummary.byBusiness.map(item => ({ ...item, tenantName: usageTenantNames.get(item.tenantId) || 'Business unavailable' }));
    res.json({
      days,
      totalEvents: logs.length,
      truncated: logs.length === 20000,
      ...usageSummary,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Platform audit insights error:', error);
    res.status(500).json({ error: 'Failed to load platform usage insights' });
  }
});

router.get("/hr-features/catalog", authenticateToken, requirePlatformAdmin, async (_req, res) => {
  res.json({ features: HR_FEATURE_CATALOG });
});

router.get("/hr-features/tenants", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    const tenants = await prisma.tenant.findMany({
      where: search ? {
        OR: [
          { name: { contains: String(search), mode: "insensitive" } },
          { slug: { contains: String(search), mode: "insensitive" } },
        ],
      } : {},
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: { select: { id: true, name: true } },
        hrModuleFeatures: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json({ tenants, features: HR_FEATURE_CATALOG });
  } catch (err) {
    console.error("List HR feature tenants error:", err);
    res.status(500).json({ error: "Failed to load HR feature tenants" });
  }
});

router.get("/hr-features/:tenantId", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        hrModuleFeatures: true,
      },
    });

    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json({ tenant, features: HR_FEATURE_CATALOG });
  } catch (err) {
    console.error("Get tenant HR features error:", err);
    res.status(500).json({ error: "Failed to load tenant HR features" });
  }
});

router.put("/hr-features/:tenantId/:featureName", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, featureName } = req.params;
    const { isEnabled, config } = req.body;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const feature = Boolean(isEnabled)
      ? await hrFeatureService.enableFeature(tenantId, { featureName, config }, req.user.id)
      : await prisma.hRModuleFeature.upsert({
          where: { tenantId_featureName: { tenantId, featureName } },
          create: {
            tenantId,
            featureName,
            isEnabled: false,
            config: { ...(config || {}), updatedBy: req.user.id },
          },
          update: {
            isEnabled: false,
            config: { ...(config || {}), updatedBy: req.user.id },
          },
        });

    res.json({ feature });
  } catch (err) {
    console.error("Update tenant HR feature error:", err);
    res.status(500).json({ error: "Failed to update HR feature" });
  }
});

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
        name: tenant.name,
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
          select: { id: true, name: true, slug: true },
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
          tenantName: tenant.name,
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
