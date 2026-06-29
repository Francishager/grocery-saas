import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import { tenantIdFromUser } from "../utils/branchAccess.js";

const router = Router();

function withOwnerSummary(tenant) {
  const owner = tenant.users?.find((user) => user.role === "owner") || tenant.owner || null;
  const { owner: _owner, ...rest } = tenant;
  return {
    ...rest,
    planName: tenant.plan?.name || null,
    ownerName: owner ? `${owner.fname || ""} ${owner.lname || ""}`.trim() || owner.email : null,
    ownerEmail: owner?.email || null,
    subscriptionStart: tenant.subscriptionStart || null,
    subscriptionEnd: tenant.subscriptionEnd || null,
    trialEndsAt: tenant.trialEndsAt || null,
  };
}

function userSearch(search) {
  return [
    { fname: { contains: search, mode: "insensitive" } },
    { lname: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } },
  ];
}

// List tenants
router.get("/", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) {
      const term = String(search);
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { slug: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { owner: { is: { OR: userSearch(term) } } },
        { users: { some: { role: "owner", OR: userSearch(term) } } },
      ];
    }

    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        plan: true,
        owner: { select: { id: true, email: true, fname: true, lname: true, role: true } },
        users: { where: { role: "owner" }, select: { id: true, email: true, fname: true, lname: true, role: true }, take: 1 },
        _count: { select: { users: true, customers: true, suppliers: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.tenant.count({ where });
    res.json({ tenants: tenants.map(withOwnerSummary), total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List tenants error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single tenant
router.get("/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        plan: true,
        owner: { select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true } },
        users: { select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true } },
        _count: { select: { customers: true, suppliers: true, users: true } },
      },
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json(withOwnerSummary(tenant));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Activate tenant
router.post("/:id/activate", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status: "active" } });
    res.json({ message: "Tenant activated", tenant });
  } catch (err) {
    console.error("Activate tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Suspend tenant
router.post("/:id/suspend", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status: "suspended" } });
    res.json({ message: "Tenant suspended", tenant });
  } catch (err) {
    console.error("Suspend tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update tenant plan (with subscription period)
router.put("/:id/plan", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { planId, subscriptionStart, subscriptionEnd, trialEndsAt } = req.body;
    if (!planId) return res.status(400).json({ error: "planId required" });

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Build subscription data
    const data = { planId };

    // Set subscription start date — default to now if not provided
    const startDate = subscriptionStart ? new Date(subscriptionStart) : new Date();
    data.subscriptionStart = startDate;

    // Set subscription end date — use provided value or auto-calculate from billingCycle
    if (subscriptionEnd) {
      data.subscriptionEnd = new Date(subscriptionEnd);
    } else {
      const endDate = new Date(startDate);
      if (plan.billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }
      data.subscriptionEnd = endDate;
    }

    // Set trial end date if provided
    if (trialEndsAt) {
      data.trialEndsAt = new Date(trialEndsAt);
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
      include: { plan: true },
    });
    res.json({ message: "Plan updated", tenant });
  } catch (err) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Tenant not found" });
    console.error("Update tenant plan error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update tenant
router.put("/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Tenant updated", tenant });
  } catch (err) {
    console.error("Update tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get tenant usage limits
router.get("/:id/limits", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true, usageLimit: true },
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    // Get actual counts
    const [branchCount, userCount, productCount, customerCount, supplierCount] = await Promise.all([
      prisma.branch.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.product.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.supplier.count({ where: { tenantId } }),
    ]);

    const limits = {
      maxUsers: tenant.usageLimit?.maxUsers || tenant.plan?.maxUsers || 5,
      maxProducts: tenant.usageLimit?.maxProducts || tenant.plan?.maxProducts || 1000,
      maxBranches: tenant.usageLimit?.maxBranches || 3,
      maxCustomers: tenant.usageLimit?.maxCustomers || 100,
      maxSuppliers: tenant.usageLimit?.maxSuppliers || 50,
    };

    const usage = {
      users: { count: userCount, limit: limits.maxUsers, percentage: Math.round((userCount / limits.maxUsers) * 100) },
      products: { count: productCount, limit: limits.maxProducts, percentage: Math.round((productCount / limits.maxProducts) * 100) },
      branches: { count: branchCount, limit: limits.maxBranches, percentage: Math.round((branchCount / limits.maxBranches) * 100) },
      customers: { count: customerCount, limit: limits.maxCustomers, percentage: Math.round((customerCount / limits.maxCustomers) * 100) },
      suppliers: { count: supplierCount, limit: limits.maxSuppliers, percentage: Math.round((supplierCount / limits.maxSuppliers) * 100) },
    };

    res.json({ limits, usage });
  } catch (err) {
    console.error("Get tenant limits error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
