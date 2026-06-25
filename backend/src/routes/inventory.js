import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import {
  handleBranchError,
  resolveBranchScope,
  scopedWhere,
  tenantIdFromUser,
} from "../utils/branchAccess.js";

const router = Router();

const DEFAULT_CATEGORIES = [
  { name: "Electrical Supplies", slug: "electrical-supplies" },
  { name: "Electric Cables & Wires", slug: "electric-cables-wires" },
  { name: "Switches & Sockets", slug: "switches-sockets" },
  { name: "Circuit Breakers", slug: "circuit-breakers" },
  { name: "Lighting & Bulbs", slug: "lighting-bulbs" },
  { name: "Mobile Phones", slug: "mobile-phones" },
  { name: "Mobile Accessories", slug: "mobile-accessories" },
  { name: "Phone Chargers", slug: "phone-chargers" },
  { name: "Power Banks", slug: "power-banks" },
  { name: "Earphones & Headsets", slug: "earphones-headsets" },
  { name: "Phone Cases", slug: "phone-cases" },
  { name: "Screen Protectors", slug: "screen-protectors" },
  { name: "Hardware Tools", slug: "hardware-tools" },
  { name: "Nails & Screws", slug: "nails-screws" },
  { name: "Plumbing Accessories", slug: "plumbing-accessories" },
  { name: "Building Hardware", slug: "building-hardware" },
  { name: "General Merchandise", slug: "general-merchandise" },
  { name: "Wholesale Goods", slug: "wholesale-goods" },
  { name: "Supermarket Essentials", slug: "supermarket-essentials" },
  { name: "Groceries", slug: "groceries" },
  { name: "Beverages", slug: "beverages" },
  { name: "Dairy Products", slug: "dairy-products" },
  { name: "Bakery", slug: "bakery" },
  { name: "Snacks", slug: "snacks" },
  { name: "Confectionery", slug: "confectionery" },
  { name: "Fruits", slug: "fruits" },
  { name: "Vegetables", slug: "vegetables" },
  { name: "Meat & Poultry", slug: "meat-poultry" },
  { name: "Frozen Foods", slug: "frozen-foods" },
  { name: "Household Items", slug: "household-items" },
  { name: "Personal Care", slug: "personal-care" },
  { name: "Baby Products", slug: "baby-products" },
  { name: "Cleaning Supplies", slug: "cleaning-supplies" },
  { name: "Laundry Products", slug: "laundry-products" },
  { name: "Stationery", slug: "stationery" },
  { name: "Books", slug: "books" },
  { name: "Office Supplies", slug: "office-supplies" },
  { name: "Hardware", slug: "hardware" },
  { name: "Building Materials", slug: "building-materials" },
  { name: "Paints", slug: "paints" },
  { name: "Plumbing", slug: "plumbing" },
  { name: "Electrical", slug: "electrical" },
  { name: "Electronics", slug: "electronics" },
  { name: "Phone Accessories", slug: "phone-accessories" },
  { name: "Computers", slug: "computers" },
  { name: "Printers", slug: "printers" },
  { name: "Cosmetics", slug: "cosmetics" },
  { name: "Beauty Products", slug: "beauty-products" },
  { name: "Salon Supplies", slug: "salon-supplies" },
  { name: "Pharmaceuticals", slug: "pharmaceuticals" },
  { name: "Medical Supplies", slug: "medical-supplies" },
  { name: "Clothing", slug: "clothing" },
  { name: "Shoes", slug: "shoes" },
  { name: "Bags", slug: "bags" },
  { name: "Fashion Accessories", slug: "fashion-accessories" },
  { name: "Jewelry", slug: "jewelry" },
  { name: "Home Appliances", slug: "home-appliances" },
  { name: "Kitchenware", slug: "kitchenware" },
  { name: "Furniture", slug: "furniture" },
  { name: "Bedding", slug: "bedding" },
  { name: "Pet Supplies", slug: "pet-supplies" },
  { name: "Agricultural Inputs", slug: "agricultural-inputs" },
  { name: "Seeds", slug: "seeds" },
  { name: "Animal Feeds", slug: "animal-feeds" },
  { name: "Restaurant Supplies", slug: "restaurant-supplies" },
  { name: "Liquor & Wines", slug: "liquor-wines" },
  { name: "Water", slug: "water" },
  { name: "Industrial Supplies", slug: "industrial-supplies" },
  { name: "Spare Parts", slug: "spare-parts" },
  { name: "Other", slug: "other" },
];

const slugify = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function ensureTenantCategories(tenantId) {
  if (!tenantId) return;

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      tenantId,
    })),
    skipDuplicates: true,
  });
}

// List products
router.get("/", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const tenantId = scope.tenantId;
    const { search, category, page = 1, limit = 100, lowStock, barcode } = req.query;
    const where = scopedWhere(scope, { isActive: { not: false } });

    // Barcode exact lookup (highest priority)
    if (barcode) {
      const product = await prisma.product.findFirst({
        where: scopedWhere(scope, { barcode, isActive: { not: false } }),
        include: { category: true, branch: true },
      });
      return res.json({ products: product ? [product] : [], total: product ? 1 : 0, page: 1, limit: 1 });
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: "insensitive" } },
        { sku: { contains: String(search), mode: "insensitive" } },
        { barcode: { contains: String(search), mode: "insensitive" } },
        { description: { contains: String(search), mode: "insensitive" } },
      ];
      const products = await prisma.product.findMany({
        where,
        include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
        orderBy: { name: "asc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });
      const total = await prisma.product.count({ where });
      return res.json({ products, total, page: Number(page), limit: Number(limit) });
    }

    if (category) where.categoryId = category;
    if (lowStock === "true") where.quantity = { lte: 10 };

    const products = await prisma.product.findMany({
      where: { ...where, isActive: { not: false } },
      include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
      orderBy: { name: "asc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.product.count({ where });
    res.json({ products, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List inventory error:", err);
    handleBranchError(res, err);
  }
});

// Categories
router.get("/categories", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    await ensureTenantCategories(tenantId);
    const categories = await prisma.category.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
    res.json(categories);
  } catch (err) {
    console.error("List categories error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/categories", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Category name is required" });

    const slug = slugify(req.body?.slug || name);
    const category = await prisma.category.create({ data: { name, slug, tenantId } });
    res.status(201).json({ message: "Category created", category });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Category already exists" });
    console.error("Create category error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single product
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { category: true, branch: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Create product
router.post("/", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const { tenantId: _tenantId, branchId: _branchId, id: _id, categoryId, ...body } = req.body;

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: scope.tenantId },
        select: { id: true },
      });
      if (!category) return res.status(400).json({ error: "Category not found" });
    }

    const product = await prisma.product.create({
      data: { ...body, categoryId: categoryId || null, tenantId: scope.tenantId, branchId: scope.branchId },
      include: { category: true, branch: true, units: true },
    });
    res.status(201).json({ message: "Product created", product });
  } catch (err) {
    console.error("Create product error:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU or barcode already exists in this branch" });
    handleBranchError(res, err);
  }
});

// Update product
router.put("/:id", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const existing = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
    });
    if (!existing) return res.status(404).json({ error: "Product not found" });

    const { tenantId: _tenantId, branchId, id: _id, categoryId, ...body } = req.body;
    const data = { ...body };

    if (categoryId !== undefined) {
      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, tenantId: existing.tenantId },
          select: { id: true },
        });
        if (!category) return res.status(400).json({ error: "Category not found" });
      }
      data.categoryId = categoryId || null;
    }

    if (branchId !== undefined) {
      const targetScope = await resolveBranchScope(prisma, { ...req, body: { branchId } }, {
        source: "body",
        requireBranch: true,
        allowOwnerAll: false,
      });
      data.branchId = targetScope.branchId;
    }

    const product = await prisma.product.update({
      where: { id: existing.id },
      data,
      include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
    });
    res.json({ message: "Product updated", product });
  } catch (err) {
    console.error("Update product error:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU or barcode already exists in this branch" });
    handleBranchError(res, err);
  }
});

// Delete product
router.delete("/:id", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    res.json({ message: "Product deactivated" });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// ==================== PRODUCT UNITS (Multi-UOM) ====================

// Get units for a product
router.get("/:productId/units", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const units = await prisma.productUnit.findMany({ where: { productId: product.id }, orderBy: { conversionFactor: "asc" } });
    res.json({ units, baseUnit: product.baseUnit });
  } catch (err) { handleBranchError(res, err); }
});

// Add a selling unit to a product
router.post("/:productId/units", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const { unitName, conversionFactor, sellingPrice, isDefault } = req.body;
    if (!unitName || conversionFactor == null || sellingPrice == null) return res.status(400).json({ error: "unitName, conversionFactor, and sellingPrice are required" });
    const unit = await prisma.productUnit.create({ data: { productId: product.id, unitName, conversionFactor: parseFloat(conversionFactor), sellingPrice: parseFloat(sellingPrice), isDefault: isDefault || false } });
    res.status(201).json(unit);
  } catch (err) { handleBranchError(res, err); }
});

// Update a selling unit
router.put("/:productId/units/:unitId", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const { unitName, conversionFactor, sellingPrice, isDefault } = req.body;
    const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    const updated = await prisma.productUnit.update({ where: { id: unit.id }, data: { ...(unitName && { unitName }), ...(conversionFactor != null && { conversionFactor: parseFloat(conversionFactor) }), ...(sellingPrice != null && { sellingPrice: parseFloat(sellingPrice) }), ...(isDefault != null && { isDefault }) } });
    res.json(updated);
  } catch (err) { handleBranchError(res, err); }
});

// Delete a selling unit
router.delete("/:productId/units/:unitId", authenticateToken, requireRole(["owner", "manager"]), async (req, res) => {
  try {
    const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    await prisma.productUnit.delete({ where: { id: unit.id } });
    res.json({ message: "Unit deleted" });
  } catch (err) { handleBranchError(res, err); }
});

export default router;
