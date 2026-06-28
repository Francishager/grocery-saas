import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";

const router = Router();

// Platform stats
router.get("/stats", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const [tenants, users, plans, features] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.plan.count(),
      prisma.feature.count(),
    ]);
    const activeTenants = await prisma.tenant.count({ where: { status: "active" } });
    res.json({ tenants, activeTenants, users, plans, features });
  } catch (err) {
    console.error("Platform stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List plans
router.get("/plans", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({ include: { _count: { select: { tenants: true } } }, orderBy: { price: "asc" } });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create plan
router.post("/plans", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const plan = await prisma.plan.create({ data: req.body });
    res.status(201).json({ message: "Plan created", plan });
  } catch (err) {
    console.error("Create plan error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update plan
router.put("/plans/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Plan updated", plan });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});


// Delete plan
router.delete("/plans/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    await prisma.planFeature.deleteMany({ where: { planId: req.params.id } });
    await prisma.plan.delete({ where: { id: req.params.id } });
    res.json({ message: "Plan deleted" });
  } catch (err) {
    console.error("Delete plan error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get plan features
router.get("/plans/:planId/features", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const pfs = await prisma.planFeature.findMany({ where: { planId: req.params.planId }, include: { feature: true } });
    res.json(pfs);
  } catch (err) {
    console.error("Get plan features error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete feature
router.delete("/features/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    await prisma.planFeature.deleteMany({ where: { featureId: req.params.id } });
    await prisma.tenantFeature.deleteMany({ where: { featureId: req.params.id } });
    await prisma.feature.delete({ where: { id: req.params.id } });
    res.json({ message: "Feature deleted" });
  } catch (err) {
    console.error("Delete feature error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// List features
router.get("/features", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const features = await prisma.feature.findMany({ include: { _count: { select: { planFeatures: true, tenantFeatures: true } } }, orderBy: { name: "asc" } });
    res.json(features);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create feature
router.post("/features", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, displayName, description, category, module: featureModule, isActive } = req.body;
    if (!name || !displayName) {
      return res.status(400).json({ error: "name and displayName are required" });
    }
    const feature = await prisma.feature.create({
      data: { name, displayName, description: description || null, category: category || "core", module: featureModule || name.split(".")[0] || "core", isActive: isActive !== false }
    });
    res.status(201).json({ message: "Feature created", feature });
  } catch (err) {
    console.error("Create feature error:", err);
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Feature name already exists" });
    }
    res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});

// Assign feature to plan
router.post("/plan-features", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { planId, featureId, enabled = true } = req.body;
    if (!planId || !featureId) return res.status(400).json({ error: "planId and featureId required" });
    const pf = await prisma.planFeature.upsert({ where: { planId_featureId: { planId, featureId } }, update: { enabled }, create: { planId, featureId, enabled } });
    res.status(201).json({ message: "Feature assigned to plan", planFeature: pf });
  } catch (err) {
    console.error("Assign feature error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Override feature for tenant
router.post("/tenant-features", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, featureId, enabled = true } = req.body;
    if (!tenantId || !featureId) return res.status(400).json({ error: "tenantId and featureId required" });
    const tf = await prisma.tenantFeature.upsert({ where: { tenantId_featureId: { tenantId, featureId } }, update: { enabled }, create: { tenantId, featureId, enabled } });
    res.json({ message: "Tenant feature override saved", tenantFeature: tf });
  } catch (err) {
    console.error("Override feature error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Seed dev data
router.post("/seed", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const bcrypt = (await import("bcryptjs")).default;

    // Create plan if not exists
    const plan = await prisma.plan.upsert({
      where: { name: "Starter" },
      update: {},
      create: { name: "Starter", slug: "starter", price: 0, billingCycle: "monthly", features: ["inventory", "sales", "reports"], maxUsers: 5, maxProducts: 100, isDefault: true },
    });

    // Create tenant
    const tenant = await prisma.tenant.create({ data: { name: "Dev Business", slug: "dev-business", email: "dev@example.com", status: "active", planId: plan.id } });

    // Create owner
    const hashed = await bcrypt.hash("password123", 12);
    const user = await prisma.user.create({ data: { email: "owner@dev.com", password: hashed, fname: "Dev", lname: "Owner", tenantId: tenant.id, role: "owner" } });

    // Create sample products
    const products = await Promise.all([
      prisma.product.create({ data: { name: "Rice (1kg)", sku: "RICE-1", price: 3500, cost: 2800, quantity: 50, tenantId: tenant.id } }),
      prisma.product.create({ data: { name: "Sugar (1kg)", sku: "SUG-1", price: 4000, cost: 3200, quantity: 30, tenantId: tenant.id } }),
      prisma.product.create({ data: { name: "Cooking Oil (1L)", sku: "OIL-1", price: 6000, cost: 4800, quantity: 20, tenantId: tenant.id } }),
    ]);

    res.status(201).json({ message: "Seed data created", tenant, user: { email: "owner@dev.com" }, products: products.length });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
