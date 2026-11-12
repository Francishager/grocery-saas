import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";

const router = Router();

// Whitelisted models for generic CRUD
const ALLOWED_MODELS = {
  users: "user",
  tenants: "tenant",
  plans: "plan",
  features: "feature",
  products: "product",
  categories: "category",
  sales: "sale",
  purchases: "purchase",
  expenses: "expense",
  customers: "customer",
  suppliers: "supplier",
  invitations: "invitation",
};

function getModel(name) {
  const modelName = ALLOWED_MODELS[name];
  if (!modelName) return null;
  return prisma[modelName] || null;
}

// List records
router.get("/:model", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const model = getModel(req.params.model);
    if (!model) return res.status(400).json({ error: `Unknown model: ${req.params.model}` });

    const { page = 1, limit = 50, ...filters } = req.query;
    const where = {};
    // Simple filter support: ?field=value
    Object.entries(filters).forEach(([key, val]) => {
      if (key !== "page" && key !== "limit") {
        where[key] = isNaN(Number(val)) ? { contains: val, mode: "insensitive" } : Number(val);
      }
    });

    const records = await model.findMany({ where, skip: (Number(page) - 1) * Number(limit), take: Number(limit) });
    const total = await model.count({ where });
    res.json({ records, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("CRUD list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single record
router.get("/:model/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const model = getModel(req.params.model);
    if (!model) return res.status(400).json({ error: `Unknown model: ${req.params.model}` });

    const record = await model.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: "Record not found" });
    res.json(record);
  } catch (err) {
    console.error("CRUD get error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create record
router.post("/:model", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const model = getModel(req.params.model);
    if (!model) return res.status(400).json({ error: `Unknown model: ${req.params.model}` });

    const record = await model.create({ data: req.body });
    res.status(201).json({ message: "Record created", record });
  } catch (err) {
    console.error("CRUD create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update record
router.put("/:model/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const model = getModel(req.params.model);
    if (!model) return res.status(400).json({ error: `Unknown model: ${req.params.model}` });

    const record = await model.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Record updated", record });
  } catch (err) {
    console.error("CRUD update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete record
router.delete("/:model/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const model = getModel(req.params.model);
    if (!model) return res.status(400).json({ error: `Unknown model: ${req.params.model}` });

    await model.delete({ where: { id: req.params.id } });
    res.json({ message: "Record deleted" });
  } catch (err) {
    console.error("CRUD delete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
