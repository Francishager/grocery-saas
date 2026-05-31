import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

const router = Router();

// List products
router.get("/", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { search, category, page = 1, limit = 100, lowStock } = req.query;
    const where = { tenantId, isActive: true };
    if (search) where.name = { contains: search, mode: "insensitive" };
    if (category) where.categoryId = category;
    if (lowStock === "true") where.quantity = { lte: prisma.product.fields.minStock };

    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.product.count({ where });
    res.json({ products, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List inventory error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single product
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { category: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create product
router.post("/", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const product = await prisma.product.create({ data: { ...req.body, tenantId } });
    res.status(201).json({ message: "Product created", product });
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update product
router.put("/:id", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const product = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Product updated", product });
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete product
router.delete("/:id", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: "Product deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Categories
router.get("/categories", authenticateToken, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ where: { tenantId: req.user?.tenantId }, orderBy: { name: "asc" } });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/categories", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const category = await prisma.category.create({ data: { ...req.body, tenantId: req.user?.tenantId } });
    res.status(201).json({ message: "Category created", category });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
