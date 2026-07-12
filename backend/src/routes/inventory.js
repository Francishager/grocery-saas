import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission, requireFeature } from "../../middleware/auth.js";
import {
  handleBranchError,
  resolveBranchScope,
  scopedWhere,
  tenantIdFromUser,
} from "../utils/branchAccess.js";
import { checkUsageLimit } from "../utils/usageLimits.js";
import { getDefaultCategoryDefinitionsForBusinessType } from "../utils/categoryDefaults.js";

const router = Router();

// Check the correct permission based on itemType in the request body
function requireItemTypePermission(action) {
  const permMap = {
    create: { product: 'canCreateProduct', service: 'canCreateService', rental: 'canCreateRental' },
    edit:   { product: 'canEditProduct',   service: 'canEditService',   rental: 'canEditRental' },
    delete: { product: 'canDeleteProduct', service: 'canDeleteService', rental: 'canDeleteRental' },
  };
  return (req, res, next) => {
    const itemType = req.body?.itemType || 'product';
    const perm = permMap[action]?.[itemType] || permMap[action]?.product;
    if (!perm) return res.status(403).json({ error: 'Permission denied' });
    // Reuse requirePermission logic
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(perm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${perm} required` });
    }
    next();
  };
}

const slugify = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normalizeProductName = (value = "") => String(value).trim().replace(/\s+/g, " ");

export function mapImportRouteError(err) {
  if (err?.code === 'LIMIT_REACHED') {
    return { statusCode: 403, message: err.message || 'Product limit reached' };
  }

  if (err?.statusCode) {
    return { statusCode: err.statusCode, message: err.message || 'Import failed' };
  }

  return { statusCode: 500, message: 'Internal server error during import' };
}

export const buildSkuBase = (name = "", category = "") => {
  const categoryValue = typeof category === "string" ? category : category?.name || category?.slug || "";
  const categoryLetters = String(categoryValue)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const baseCategory = categoryLetters.slice(0, 3).padEnd(3, "X") || "GEN";

  if (categoryValue) {
    return baseCategory;
  }

  const slug = slugify(name) || "item";
  const letters = (slug.match(/[a-z]+/gi) || ["item"]).join("").toUpperCase();
  const firstPart = letters.slice(0, 3).padEnd(3, "X");
  const secondPart = letters.slice(3, 5).padEnd(2, "X");
  return `${firstPart}-${secondPart}`;
};

const getDynamicSkuDateToken = (date = new Date()) => {
  const value = new Date(date);
  return value.toISOString().slice(2, 10).replace(/-/g, "");
};

export async function resolveUniqueSku(prisma, tenantId, branchId, name, itemType = "product", category = "", excludeId = null, reserved = new Set()) {
  const baseSku = buildSkuBase(name, category);
  const dateToken = getDynamicSkuDateToken();
  let counter = 1;

  while (true) {
    const candidate = `${baseSku}-${dateToken}-${String(counter).padStart(4, "0")}`;

    if (reserved.has(candidate)) {
      counter += 1;
      continue;
    }

    const existing = await prisma.product.findFirst({
      where: {
        tenantId,
        branchId,
        sku: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      reserved.add(candidate);
      return candidate;
    }

    counter += 1;
  }
}

async function ensureUniqueProductName(prisma, tenantId, branchId, name, excludeId = null) {
  const normalizedName = normalizeProductName(name);
  if (!normalizedName) return { ok: false, error: "Product name is required" };

  const existing = await prisma.product.findFirst({
    where: {
      tenantId,
      branchId,
      name: { equals: normalizedName, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (existing) {
    return { ok: false, error: `Product name "${normalizedName}" already exists` };
  }

  return { ok: true, name: normalizedName };
}

async function ensureTenantCategories(tenantId) {
  if (!tenantId) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { businessType: true },
  });

  const categories = getDefaultCategoryDefinitionsForBusinessType(tenant?.businessType || "other").map((category) => ({
    ...category,
    tenantId,
  }));

  if (categories.length > 0) {
    await prisma.category.createMany({
      data: categories,
      skipDuplicates: true,
    });
  }
}

// List products
router.get("/", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const tenantId = scope.tenantId;
    const { search, category, page = 1, limit = 100, lowStock, barcode, itemType } = req.query;
    const where = scopedWhere(scope, { isActive: { not: false } });

    // Filter by itemType if provided
    if (itemType) where.itemType = String(itemType);

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
    const { type } = req.query;
    const where = { tenantId };
    if (type) where.categoryType = String(type);
    const categories = await prisma.category.findMany({ where, orderBy: { name: "asc" } });
    res.json(categories);
  } catch (err) {
    console.error("List categories error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/categories", authenticateToken, requirePermission("canCreateProduct"), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Category name is required" });

    const slug = slugify(req.body?.slug || name);
    const categoryType = ["service", "rental"].includes(req.body?.categoryType) ? req.body.categoryType : "product";
    const category = await prisma.category.create({ data: { name, slug, tenantId, categoryType } });
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
router.post("/", authenticateToken, requireItemTypePermission('create'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const { tenantId: _tenantId, branchId: _branchId, id: _id, categoryId, itemType, ...body } = req.body;

    if (body.batchNumber !== undefined && body.batchNumber !== null) {
      body.batchNumber = String(body.batchNumber).trim() || null;
    }
    if (body.expiryDate !== undefined && body.expiryDate !== null && body.expiryDate !== '') {
      body.expiryDate = new Date(body.expiryDate);
    } else {
      body.expiryDate = null;
    }

    if (!categoryId) {
      return res.status(400).json({ error: "Category is required" });
    }

    const quantityValue = body.quantity;
    if (quantityValue === undefined || quantityValue === null || quantityValue === "") {
      return res.status(400).json({ error: "Stock quantity is required" });
    }
    const parsedQuantity = Number(quantityValue);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({ error: "Stock quantity must be a non-negative integer" });
    }
    body.quantity = parsedQuantity;

    const costValue = body.cost;
    if (costValue === undefined || costValue === null || costValue === "") {
      return res.status(400).json({ error: "Cost price is required" });
    }
    const parsedCost = Number(costValue);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return res.status(400).json({ error: "Cost price must be a non-negative number" });
    }
    body.cost = parsedCost;

    if (!itemType || !["product", "service", "rental"].includes(String(itemType).toLowerCase())) {
      return res.status(400).json({ error: "Item type is required and must be product, service, or rental" });
    }

    const normalizedName = normalizeProductName(body.name);
    if (!normalizedName) {
      return res.status(400).json({ error: "Product name is required" });
    }
    if (body.price === undefined || body.price === null || Number(body.price) <= 0) {
      return res.status(400).json({ error: "Selling price must be greater than 0" });
    }

    // Set itemType (default to product, allow rental)
    const itemTypeValue = ["service", "rental"].includes(itemType) ? itemType : "product";
    body.itemType = itemTypeValue;

    const duplicateCheck = await ensureUniqueProductName(prisma, scope.tenantId, scope.branchId, normalizedName);
    if (!duplicateCheck.ok) {
      return res.status(409).json({ error: duplicateCheck.error });
    }

    let categoryForSku = null;
    if (categoryId) {
      categoryForSku = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: scope.tenantId },
        select: { id: true, name: true, slug: true },
      });
      if (!categoryForSku) {
        return res.status(400).json({ error: "Category not found" });
      }
    }

    body.name = duplicateCheck.name;
    body.sku = await resolveUniqueSku(prisma, scope.tenantId, scope.branchId, duplicateCheck.name, itemTypeValue, categoryForSku);

    // For service items, zero out inventory fields
    if (itemTypeValue === "service") {
      body.quantity = 0;
      body.minStock = 0;
      body.cost = null;
      body.barcode = null;
      body.sku = body.sku || null;
      body.baseUnit = "Service";
    }
    // For rental items, keep stock tracking but set defaults
    if (itemTypeValue === "rental") {
      body.rentalPrice = body.rentalPrice || body.price || 0;
      body.rentalPeriod = body.rentalPeriod || "daily";
      body.depositAmount = body.depositAmount || 0;
      body.replacementValue = body.replacementValue || 0;
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: scope.tenantId },
        select: { id: true },
      });
      if (!category) return res.status(400).json({ error: "Category not found" });
    }

    await checkUsageLimit(scope.tenantId, 'products');

    const product = await prisma.product.create({
      data: { ...body, categoryId: categoryId || null, tenantId: scope.tenantId, branchId: scope.branchId },
      include: { category: true, branch: true, units: true },
    });
    res.status(201).json({ message: "Product created", product });
  } catch (err) {
    if (err?.code === 'LIMIT_REACHED') return res.status(403).json({ error: err.message });
    console.error("Create product error:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU or barcode already exists in this branch" });
    handleBranchError(res, err);
  }
});

// Update product
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const existing = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
    });
    if (!existing) return res.status(404).json({ error: "Product not found" });

    // Check permission based on the existing item's type
    const existingType = existing.itemType || 'product';
    const editPermMap = { product: 'canEditProduct', service: 'canEditService', rental: 'canEditRental' };
    const requiredPerm = editPermMap[existingType] || 'canEditProduct';
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(requiredPerm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${requiredPerm} required` });
    }

    const { tenantId: _tenantId, branchId, id: _id, categoryId, itemType, ...body } = req.body;
    const data = { ...body };

    if (data.batchNumber !== undefined && data.batchNumber !== null) {
      data.batchNumber = String(data.batchNumber).trim() || null;
    }
    if (data.expiryDate !== undefined && data.expiryDate !== null && data.expiryDate !== '') {
      data.expiryDate = new Date(data.expiryDate);
    } else if (data.expiryDate === '') {
      data.expiryDate = null;
    }

    // For updates, allow categoryId to be undefined (don't change it). But if provided, it must be valid.
    if (categoryId !== undefined && (categoryId === null || categoryId === "")) {
      return res.status(400).json({ error: "Category cannot be empty if provided" });
    }
    if (body.quantity === undefined || body.quantity === null || body.quantity === "") {
      return res.status(400).json({ error: "Stock quantity is required" });
    }
    const parsedQuantity = Number(body.quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({ error: "Stock quantity must be a non-negative integer" });
    }
    data.quantity = parsedQuantity;

    if (body.cost === undefined || body.cost === null || body.cost === "") {
      return res.status(400).json({ error: "Cost price is required" });
    }
    const parsedCost = Number(body.cost);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return res.status(400).json({ error: "Cost price must be a non-negative number" });
    }
    data.cost = parsedCost;

    if (!itemType || !["product", "service", "rental"].includes(String(itemType).toLowerCase())) {
      return res.status(400).json({ error: "Item type is required and must be product, service, or rental" });
    }

    if (body.name !== undefined) {
      const normalizedName = normalizeProductName(body.name);
      if (!normalizedName) return res.status(400).json({ error: "Product name is required" });
      const duplicateCheck = await ensureUniqueProductName(prisma, existing.tenantId, existing.branchId || scope.branchId, normalizedName, existing.id);
      if (!duplicateCheck.ok) return res.status(409).json({ error: duplicateCheck.error });
      data.name = duplicateCheck.name;

      const categoryForSku = categoryId
        ? await prisma.category.findFirst({
            where: { id: categoryId, tenantId: existing.tenantId },
            select: { id: true, name: true, slug: true },
          })
        : existing.categoryId
          ? await prisma.category.findFirst({
              where: { id: existing.categoryId, tenantId: existing.tenantId },
              select: { id: true, name: true, slug: true },
            })
          : null;

      data.sku = await resolveUniqueSku(prisma, existing.tenantId, existing.branchId || scope.branchId, duplicateCheck.name, existing.itemType || 'product', categoryForSku, existing.id);
    }

    // Handle itemType update
    if (itemType === "service") {
      data.itemType = "service";
      data.quantity = 0;
      data.minStock = 0;
      data.cost = null;
      data.baseUnit = "Service";
    } else if (itemType === "product") {
      data.itemType = "product";
    } else if (itemType === "rental") {
      data.itemType = "rental";
    }

    if (categoryId !== undefined) {
      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, tenantId: existing.tenantId },
          select: { id: true },
        });
        if (!category) return res.status(400).json({ error: "Category not found" });
      }
      data.categoryId = categoryId || null;
      data.isUncategorized = categoryId ? false : true;
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
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Check permission based on the item's type
    const itemType = product.itemType || 'product';
    const deletePermMap = { product: 'canDeleteProduct', service: 'canDeleteService', rental: 'canDeleteRental' };
    const requiredPerm = deletePermMap[itemType] || 'canDeleteProduct';
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(requiredPerm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${requiredPerm} required` });
    }

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
router.post("/:productId/units", authenticateToken, requirePermission("canCreateProduct"), async (req, res) => {
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
router.put("/:productId/units/:unitId", authenticateToken, requirePermission("canEditProduct"), async (req, res) => {
  try {
    const { unitName, conversionFactor, sellingPrice, isDefault } = req.body;
    const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    const updated = await prisma.productUnit.update({ where: { id: unit.id }, data: { ...(unitName && { unitName }), ...(conversionFactor != null && { conversionFactor: parseFloat(conversionFactor) }), ...(sellingPrice != null && { sellingPrice: parseFloat(sellingPrice) }), ...(isDefault != null && { isDefault }) } });
    res.json(updated);
  } catch (err) { handleBranchError(res, err); }
});

// Delete a selling unit
router.delete("/:productId/units/:unitId", authenticateToken, requirePermission("canEditProduct"), async (req, res) => {
  try {
    const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    await prisma.productUnit.delete({ where: { id: unit.id } });
    res.json({ message: "Unit deleted" });
  } catch (err) { handleBranchError(res, err); }
});

// =====================================================
// Bulk Import Inventory from Excel data
// Frontend parses the Excel file and sends JSON rows.
// Backend validates each row and returns detailed errors.
// =====================================================
router.post("/import", authenticateToken, requirePermission("canImportInventory"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });

    const { rows, branchId } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data rows provided" });
    }

    // Fetch existing categories for this tenant to map by name
    const existingCategories = await prisma.category.findMany({
      where: { tenantId: scope.tenantId },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(existingCategories.map(c => [c.name.toLowerCase(), c.id]));

    // Fetch existing names and barcodes for duplicate check
    const existingProducts = await prisma.product.findMany({
      where: { tenantId: scope.tenantId, branchId: scope.branchId },
      select: { name: true, barcode: true },
    });
    const existingNames = new Set(existingProducts.map(p => normalizeProductName(p.name).toLowerCase()).filter(Boolean));
    const existingBarcodes = new Set(existingProducts.map(p => p.barcode).filter(Boolean));

    const errors = [];
    const validRows = [];
    const seenNames = new Set();
    const seenBarcodes = new Set();
    const reservedSkus = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is the header in Excel
      const rowErrors = [];

      // Required: name
      const name = normalizeProductName(String(row.name || row["Product Name"] || ""));
      if (!name) rowErrors.push("Product Name is required");

      // Required: selling price
      const price = parseFloat(row.price || row["Selling Price"]);
      if (isNaN(price) || price <= 0) rowErrors.push("Selling Price must be a number greater than 0");

      // Required: cost price
      const costValue = row.cost ?? row["Cost Price"];
      let cost = null;
      if (costValue === undefined || costValue === null || String(costValue).trim() === "") {
        rowErrors.push("Cost Price is required");
      } else {
        cost = parseFloat(costValue);
        if (isNaN(cost) || cost < 0) rowErrors.push("Cost Price must be a non-negative number");
      }

      // Required: quantity
      const quantityRaw = row.quantity ?? row["Stock Quantity"];
      let quantity = null;
      if (quantityRaw === undefined || quantityRaw === null || String(quantityRaw).trim() === "") {
        rowErrors.push("Stock Quantity is required");
      } else {
        quantity = parseInt(quantityRaw, 10);
        if (isNaN(quantity) || quantity < 0) rowErrors.push("Stock Quantity must be a non-negative integer");
      }

      // Optional: minStock
      const minStock = parseInt(row.minStock ?? row["Reorder Level"] ?? 10, 10);
      if (isNaN(minStock) || minStock < 0) rowErrors.push("Reorder Level must be a non-negative integer");

      if (name) {
        const normalizedNameKey = name.toLowerCase();
        if (existingNames.has(normalizedNameKey) || seenNames.has(normalizedNameKey)) {
          rowErrors.push(`Product name "${name}" already exists in this branch`);
        } else {
          seenNames.add(normalizedNameKey);
        }
      }

      // Optional: barcode
      const barcode = String(row.barcode || row["Barcode"] || "").trim() || null;
      if (barcode) {
        if (existingBarcodes.has(barcode) || seenBarcodes.has(barcode)) {
          rowErrors.push(`Barcode "${barcode}" already exists in this branch`);
        } else {
          seenBarcodes.add(barcode);
        }
      }

      // Optional: category (match by name) — if category doesn't exist, mark as uncategorized
      const categoryName = String(row.category || row["Category"] || "").trim();
      let categoryId = null;
      let isUncategorized = false;
      if (categoryName) {
        categoryId = categoryMap.get(categoryName.toLowerCase());
        if (!categoryId) {
          // Category name provided but not found — mark as uncategorized for user to fix
          isUncategorized = true;
        }
      } else {
        // No category provided — mark as uncategorized
        isUncategorized = true;
      }

      // Optional: baseUnit
      const baseUnit = String(row.baseUnit || row["Base Unit"] || "Piece").trim() || "Piece";

      // Optional: description
      const description = String(row.description || row["Description"] || "").trim() || null;

      // Required: itemType
      const itemType = String(row.itemType || row["Item Type"] || "").trim().toLowerCase();
      if (!itemType) {
        rowErrors.push("Item Type is required");
      } else if (!["product", "service", "rental"].includes(itemType)) {
        rowErrors.push(`Item Type must be "product", "service", or "rental" (got "${itemType}")`);
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, name: name || "(unnamed)", errors: rowErrors });
      } else {
        const generatedSku = await resolveUniqueSku(prisma, scope.tenantId, scope.branchId, name, itemType, categoryName, null, reservedSkus);
        validRows.push({
          name,
          price,
          cost: cost != null ? cost : null,
          quantity: itemType === "service" ? 0 : quantity,
          minStock: itemType === "service" ? 0 : minStock,
          sku: generatedSku,
          barcode,
          categoryId,
          baseUnit: itemType === "service" ? "Service" : baseUnit,
          description,
          itemType,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          isActive: true,
          isUncategorized,
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        validationErrors: errors,
        validCount: validRows.length,
        errorCount: errors.length,
      });
    }

    // Check usage limit
    await checkUsageLimit(scope.tenantId, 'products');

    // Bulk create
    const created = await prisma.$transaction(
      validRows.map(data => prisma.product.create({ data }))
    );

    res.status(201).json({
      message: `Successfully imported ${created.length} product${created.length !== 1 ? 's' : ''}`,
      imported: created.length,
    });
  } catch (err) {
    const mappedError = mapImportRouteError(err);
    if (mappedError.statusCode >= 400 && mappedError.statusCode < 500) {
      console.warn("Import inventory request failed:", mappedError);
      return res.status(mappedError.statusCode).json({ error: mappedError.message });
    }

    console.error("Import inventory error:", err);
    return res.status(mappedError.statusCode).json({ error: mappedError.message });
  }
});

export default router;
