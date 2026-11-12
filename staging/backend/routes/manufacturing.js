import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;

// ===== MULTI-LEVEL BOM TRAVERSAL =====
// Recursively fetches nested BOM for a product, returning a flat list of all raw materials needed
async function getFlatBOM(productId, quantity = 1, visited = new Set()) {
  if (visited.has(productId)) return []; // prevent cycles
  visited.add(productId);

  const recipe = await prisma.recipe.findFirst({
    where: { productId, isActive: true },
    include: { ingredients: { include: { product: true } } },
  });

  if (!recipe) return [];

  const result = [];
  for (const ing of recipe.ingredients) {
    // Check if this ingredient itself has a recipe (sub-assembly)
    const subRecipe = await prisma.recipe.findFirst({
      where: { productId: ing.productId, isActive: true },
    });

    if (subRecipe) {
      // Recurse into sub-assembly
      const subItems = await getFlatBOM(ing.productId, ing.quantity * quantity, visited);
      result.push(...subItems);
    } else {
      // Leaf-level raw material
      result.push({
        productId: ing.productId,
        productName: ing.product?.name || "Unknown",
        quantity: ing.quantity * quantity,
        unit: ing.unit,
        unitCost: Number(ing.product?.cost || 0),
        lineCost: ing.quantity * quantity * Number(ing.product?.cost || 0),
      });
    }
  }
  return result;
}

// Calculate standard cost from BOM ingredients
async function calculateStandardCost(productId, quantity) {
  const flatBOM = await getFlatBOM(productId, quantity);
  return flatBOM.reduce((sum, item) => sum + item.lineCost, 0);
}

// ===== PRODUCTION ORDERS =====
router.get("/orders", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { status, branchId } = req.query;
    const where = { tenantId: t(req) };
    if (status) where.status = String(status);
    if (branchId) where.branchId = String(branchId);

    const orders = await prisma.productionOrder.findMany({
      where,
      include: {
        product: true,
        recipe: true,
        user: true,
        wasteRecords: true,
        qualityChecks: { orderBy: { createdAt: "desc" } },
        batches: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/orders", authenticateToken, requirePermission("canCreateManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const {
      orderNo, productId, recipeId, quantity, unitCost, branchId, notes,
      laborCost, overheadCost, batchNumber, expectedYield,
      plannedStartDate, plannedEndDate,
    } = req.body;

    if (!productId) return res.status(400).json({ error: "Product is required" });
    if (!quantity || quantity < 1) return res.status(400).json({ error: "Quantity must be at least 1" });

    const tenantId = t(req);

    // Calculate standard cost from BOM if recipe is linked
    let standardCost = 0;
    if (recipeId) {
      standardCost = await calculateStandardCost(productId, quantity);
    }

    const materialCost = quantity * (unitCost || 0);
    const totalCost = materialCost + Number(laborCost || 0) + Number(overheadCost || 0);

    const order = await prisma.productionOrder.create({
      data: {
        orderNo: orderNo || `PROD-${Date.now()}`,
        productId,
        recipeId: recipeId || null,
        quantity,
        unitCost: unitCost || 0,
        laborCost: laborCost || 0,
        overheadCost: overheadCost || 0,
        standardCost,
        totalCost,
        actualCost: totalCost,
        expectedYield: expectedYield || quantity,
        batchNumber: batchNumber || null,
        branchId,
        notes,
        plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : null,
        plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null,
        userId: req.user.id,
        tenantId,
      },
      include: { product: true, recipe: true },
    });

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/orders/:id", authenticateToken, requirePermission("canEditManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const {
      status, quantity, unitCost, startDate, endDate, notes,
      laborCost, overheadCost, actualQuantity, actualYield,
      batchNumber, qualityStatus, qualityNotes,
      plannedStartDate, plannedEndDate,
    } = req.body;

    const existing = await prisma.productionOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Production order not found" });

    const materialCost = quantity != null ? quantity * (unitCost ?? existing.unitCost) : existing.totalCost - existing.laborCost - existing.overheadCost;
    const labor = laborCost != null ? Number(laborCost) : existing.laborCost;
    const overhead = overheadCost != null ? Number(overheadCost) : existing.overheadCost;
    const totalCost = materialCost + labor + overhead;

    const updateData = {
      status,
      quantity,
      unitCost,
      laborCost: labor,
      overheadCost: overhead,
      totalCost,
      actualCost: totalCost,
      actualQuantity,
      actualYield,
      batchNumber,
      qualityStatus,
      qualityNotes,
      qualityCheckedBy: qualityStatus ? req.user.id : undefined,
      qualityCheckedAt: qualityStatus ? new Date() : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : undefined,
      plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : undefined,
      notes,
    };

    // Remove undefined fields to avoid overwriting with null
    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

    const order = await prisma.productionOrder.update({
      where: { id: req.params.id },
      data: updateData,
      include: { product: true, recipe: true, wasteRecords: true, qualityChecks: true, batches: true },
    });

    // On completion: deduct ingredients (multi-level BOM) and add finished goods
    if (status === "completed" && existing.status !== "completed") {
      const qty = quantity || existing.quantity;

      if (order.recipeId) {
        // Multi-level BOM deduction
        const flatBOM = await getFlatBOM(order.productId, qty);
        for (const item of flatBOM) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: Math.ceil(item.quantity) } },
          });
        }
      }

      // Add finished product stock
      const producedQty = actualQuantity || qty;
      await prisma.product.update({
        where: { id: order.productId },
        data: { quantity: { increment: Math.ceil(producedQty) } },
      });

      // Auto-create a batch record if batchNumber is set
      if (order.batchNumber) {
        await prisma.productionBatch.upsert({
          where: { tenantId_batchNumber: { tenantId: t(req), batchNumber: order.batchNumber } },
          update: {
            quantity: producedQty,
            status: "active",
            productionOrderId: order.id,
          },
          create: {
            tenantId: t(req),
            productionOrderId: order.id,
            productId: order.productId,
            batchNumber: order.batchNumber,
            quantity: producedQty,
            status: "active",
          },
        });
      }
    }

    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/orders/:id", authenticateToken, requirePermission("canDeleteManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    await prisma.productionOrder.delete({ where: { id: req.params.id } });
    res.json({ message: "Production order deleted" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BOM COST PREVIEW (multi-level) =====
router.get("/bom/cost-preview", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.bom"), async (req, res) => {
  try {
    const { productId, quantity } = req.query;
    if (!productId) return res.status(400).json({ error: "productId is required" });
    const qty = Number(quantity) || 1;
    const flatBOM = await getFlatBOM(String(productId), qty);
    const totalCost = flatBOM.reduce((sum, item) => sum + item.lineCost, 0);
    res.json({ items: flatBOM, totalCost, quantity: qty });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== WASTE TRACKING =====
router.get("/waste", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.waste"), async (req, res) => {
  try {
    const waste = await prisma.productionWaste.findMany({
      where: { tenantId: t(req) },
      include: { productionOrder: true, product: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(waste);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/waste", authenticateToken, requirePermission("canCreateManufacturing"), requireFeature("manufacturing.waste"), async (req, res) => {
  try {
    const { productionOrderId, productId, quantity, unitCost, reason } = req.body;
    if (!productId) return res.status(400).json({ error: "Product is required" });
    if (!quantity || quantity < 1) return res.status(400).json({ error: "Quantity must be at least 1" });
    const totalCost = quantity * (unitCost || 0);
    const waste = await prisma.productionWaste.create({
      data: { productionOrderId, productId, quantity, unitCost: unitCost || 0, totalCost, reason, tenantId: t(req) },
    });
    await prisma.productionOrder.update({
      where: { id: productionOrderId },
      data: { wasteQty: { increment: quantity } },
    });
    res.status(201).json(waste);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== QUALITY CHECKS =====
router.get("/quality-checks", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { orderId, status } = req.query;
    const where = { tenantId: t(req) };
    if (orderId) where.productionOrderId = String(orderId);
    if (status) where.status = String(status);

    const checks = await prisma.qualityCheck.findMany({
      where,
      include: { productionOrder: { include: { product: true } }, user: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(checks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/quality-checks", authenticateToken, requirePermission("canCreateManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { productionOrderId, checkType, status, notes, defectQty, defectDescription } = req.body;
    if (!productionOrderId) return res.status(400).json({ error: "Production order is required" });
    if (!checkType) return res.status(400).json({ error: "Check type is required" });

    const check = await prisma.qualityCheck.create({
      data: {
        productionOrderId,
        userId: req.user.id,
        checkType,
        status: status || "pending",
        checkedBy: req.user.fname ? `${req.user.fname} ${req.user.lname || ""}`.trim() : req.user.email,
        checkedAt: status && status !== "pending" ? new Date() : null,
        notes,
        defectQty: defectQty || 0,
        defectDescription,
        tenantId: t(req),
      },
    });

    // Update production order quality status
    if (status && status !== "pending") {
      await prisma.productionOrder.update({
        where: { id: productionOrderId },
        data: {
          qualityStatus: status,
          qualityCheckedBy: req.user.id,
          qualityCheckedAt: new Date(),
        },
      });
    }

    res.status(201).json(check);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/quality-checks/:id", authenticateToken, requirePermission("canEditManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { status, notes, defectQty, defectDescription } = req.body;
    const check = await prisma.qualityCheck.update({
      where: { id: req.params.id },
      data: {
        status,
        notes,
        defectQty,
        defectDescription,
        checkedAt: status && status !== "pending" ? new Date() : undefined,
      },
    });

    // Update production order quality status
    if (status && status !== "pending") {
      await prisma.productionOrder.update({
        where: { id: check.productionOrderId },
        data: {
          qualityStatus: status,
          qualityCheckedBy: req.user.id,
          qualityCheckedAt: new Date(),
        },
      });
    }

    res.json(check);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BATCH TRACKING =====
router.get("/batches", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { orderId, status } = req.query;
    const where = { tenantId: t(req) };
    if (orderId) where.productionOrderId = String(orderId);
    if (status) where.status = String(status);

    const batches = await prisma.productionBatch.findMany({
      where,
      include: { productionOrder: { include: { product: true } }, product: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(batches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/batches", authenticateToken, requirePermission("canCreateManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { productionOrderId, productId, batchNumber, quantity, manufacturedDate, expiryDate, notes } = req.body;
    if (!batchNumber) return res.status(400).json({ error: "Batch number is required" });
    if (!productionOrderId) return res.status(400).json({ error: "Production order is required" });

    const batch = await prisma.productionBatch.create({
      data: {
        productionOrderId,
        productId: productId || null,
        batchNumber,
        quantity: quantity || 0,
        manufacturedDate: manufacturedDate ? new Date(manufacturedDate) : new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        notes,
        tenantId: t(req),
      },
    });
    res.status(201).json(batch);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/batches/:id", authenticateToken, requirePermission("canEditManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { status, quantity, expiryDate, notes } = req.body;
    const batch = await prisma.productionBatch.update({
      where: { id: req.params.id },
      data: {
        status,
        quantity,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        notes,
      },
    });
    res.json(batch);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BOM / RECIPES =====
router.get("/bom", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.bom"), async (req, res) => {
  try {
    const recipes = await prisma.recipe.findMany({
      where: { tenantId: t(req) },
      include: { product: true, ingredients: { include: { product: true } } },
    });

    // Enrich each recipe with sub-assembly detection
    const enriched = await Promise.all(recipes.map(async (recipe) => {
      const ingredientsWithSubAssemblies = await Promise.all(recipe.ingredients.map(async (ing) => {
        const subRecipe = await prisma.recipe.findFirst({
          where: { productId: ing.productId, isActive: true },
          select: { id: true, name: true },
        });
        return {
          ...ing,
          hasSubRecipe: !!subRecipe,
          subRecipeName: subRecipe?.name || null,
        };
      }));
      return { ...recipe, ingredients: ingredientsWithSubAssemblies };
    }));

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/bom", authenticateToken, requirePermission("canCreateManufacturing"), requireFeature("manufacturing.bom"), async (req, res) => {
  try {
    const { productId, name, yield: yieldText, ingredients } = req.body;
    if (!productId || !name?.trim()) return res.status(400).json({ error: "Product and recipe name are required" });

    const tenantId = t(req);
    const recipe = await prisma.recipe.upsert({
      where: { tenantId_productId: { tenantId, productId } },
      update: { name, yield: yieldText || null, isActive: true },
      create: { tenantId, productId, name, yield: yieldText || null, isActive: true },
    });

    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });

    const ingredientRows = Array.isArray(ingredients) ? ingredients.filter((item) => item?.productId) : [];
    if (ingredientRows.length) {
      await prisma.recipeIngredient.createMany({
        data: ingredientRows.map((item) => ({
          recipeId: recipe.id,
          productId: item.productId,
          quantity: Number(item.quantity) || 0,
          unit: item.unit || "Piece",
          notes: null,
        })),
      });
    }

    res.status(201).json(recipe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
