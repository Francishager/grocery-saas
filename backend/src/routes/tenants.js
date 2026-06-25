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

// Update tenant plan
router.put("/:id/plan", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: "planId required" });

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { planId }, include: { plan: true } });
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
      include: { plan: true },
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    // Return limits based on plan or default values
    const limits = tenant.plan?.limits || {
      maxUsers: 5,
      maxProducts: 1000,
      maxBranches: 3,
      maxSalesPerMonth: 1000,
    };
    res.json({ limits });
  } catch (err) {
    console.error("Get tenant limits error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
