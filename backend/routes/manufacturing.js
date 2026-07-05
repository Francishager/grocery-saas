import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;

// ===== PRODUCTION ORDERS =====
router.get("/orders", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const orders = await prisma.productionOrder.findMany({ where: { tenantId: t(req) }, include: { product: true, recipe: true, user: true, wasteRecords: true }, orderBy: { createdAt: "desc" } });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/orders", authenticateToken, requirePermission("canCreateManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { orderNo, productId, recipeId, quantity, unitCost, branchId, notes } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product is required' });
    if (!quantity || quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    const totalCost = quantity * (unitCost || 0);
    const order = await prisma.productionOrder.create({ data: { orderNo, productId, recipeId, quantity, unitCost: unitCost || 0, totalCost, branchId, notes, userId: req.user.id, tenantId: t(req) } });
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/orders/:id", authenticateToken, requirePermission("canEditManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    const { status, quantity, unitCost, startDate, endDate, notes } = req.body;
    const totalCost = quantity * (unitCost || 0);
    const order = await prisma.productionOrder.update({ where: { id: req.params.id }, data: { status, quantity, unitCost, totalCost, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, notes } });
    // On completion, deduct raw materials from recipe and add finished goods
    if (status === "completed" && order.recipeId) {
      const recipe = await prisma.recipe.findUnique({ where: { id: order.recipeId }, include: { ingredients: true } });
      if (recipe) {
        for (const ing of recipe.ingredients) {
          await prisma.product.update({ where: { id: ing.productId }, data: { quantity: { decrement: ing.quantity * order.quantity } } });
        }
      }
      await prisma.product.update({ where: { id: order.productId }, data: { quantity: { increment: order.quantity } } });
    }
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/orders/:id", authenticateToken, requirePermission("canDeleteManufacturing"), requireFeature("manufacturing.production_orders"), async (req, res) => {
  try {
    await prisma.productionOrder.delete({ where: { id: req.params.id } });
    res.json({ message: "Production order deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== WASTE TRACKING =====
router.get("/waste", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.waste"), async (req, res) => {
  try {
    const waste = await prisma.productionWaste.findMany({ where: { tenantId: t(req) }, include: { productionOrder: true, product: true }, orderBy: { createdAt: "desc" } });
    res.json(waste);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/waste", authenticateToken, requirePermission("canCreateManufacturing"), requireFeature("manufacturing.waste"), async (req, res) => {
  try {
    const { productionOrderId, productId, quantity, unitCost, reason } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product is required' });
    if (!quantity || quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    const totalCost = quantity * (unitCost || 0);
    const waste = await prisma.productionWaste.create({ data: { productionOrderId, productId, quantity, unitCost: unitCost || 0, totalCost, reason, tenantId: t(req) } });
    // Update production order waste qty
    await prisma.productionOrder.update({ where: { id: productionOrderId }, data: { wasteQty: { increment: quantity } } });
    res.status(201).json(waste);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== BOM / RECIPES (reuse existing Recipe model) =====
router.get("/bom", authenticateToken, requirePermission("canViewManufacturing"), requireFeature("manufacturing.bom"), async (req, res) => {
  try {
    const recipes = await prisma.recipe.findMany({ where: { tenantId: t(req) }, include: { product: true, ingredients: { include: { product: true } } } });
    res.json(recipes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
