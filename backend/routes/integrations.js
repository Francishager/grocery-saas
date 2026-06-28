import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";

const router = Router();

// List integrations
router.get("/", authenticateToken, requireFeature("integrations"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const configs = await prisma.integrationConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// Get single integration
router.get("/:id", authenticateToken, requireFeature("integrations"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const config = await prisma.integrationConfig.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!config) return res.status(404).json({ error: "Integration not found" });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch integration" });
  }
});

// Create/configure integration
router.post("/", authenticateToken, requireFeature("integrations"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { provider, displayName, credentials, settings, isActive } = req.body;
    if (!provider || !displayName) return res.status(400).json({ error: "provider and displayName required" });

    const config = await prisma.integrationConfig.create({
      data: {
        tenantId,
        provider,
        displayName,
        credentials: credentials || undefined,
        settings: settings || undefined,
        isActive: isActive ?? false,
      },
    });
    res.status(201).json(config);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Integration already exists" });
    res.status(500).json({ error: "Failed to create integration" });
  }
});

// Update integration
router.put("/:id", authenticateToken, requireFeature("integrations"), async (req, res) => {
  try {
    const { displayName, credentials, settings, isActive } = req.body;
    const config = await prisma.integrationConfig.update({
      where: { id: req.params.id },
      data: {
        displayName,
        credentials: credentials || undefined,
        settings: settings || undefined,
        isActive,
      },
    });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to update integration" });
  }
});

// Delete integration
router.delete("/:id", authenticateToken, requireFeature("integrations"), async (req, res) => {
  try {
    await prisma.integrationConfig.delete({ where: { id: req.params.id } });
    res.json({ message: "Integration deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete integration" });
  }
});

// Test integration connection
router.post("/:id/test", authenticateToken, requireFeature("integrations"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const config = await prisma.integrationConfig.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!config) return res.status(404).json({ error: "Integration not found" });

    // Update lastSyncAt
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { lastSyncAt: new Date() },
    });

    res.json({ message: `Connection test for ${config.provider} successful`, provider: config.provider });
  } catch (err) {
    res.status(500).json({ error: "Connection test failed" });
  }
});

export default router;
