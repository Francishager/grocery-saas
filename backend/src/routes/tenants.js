import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";

const router = Router();

// List tenants
router.get("/", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const tenants = await prisma.tenant.findMany({
      where,
      include: { plan: true, _count: { select: { users: true } } },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.tenant.count({ where });
    res.json({ tenants, total, page: Number(page), limit: Number(limit) });
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
      include: { plan: true, users: { select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true } }, _count: { select: { customers: true, suppliers: true } } },
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json(tenant);
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
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { planId } });
    res.json({ message: "Plan updated", tenant });
  } catch (err) {
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

export default router;
