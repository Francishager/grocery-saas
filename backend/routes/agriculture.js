import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;

// ===== FIELDS =====
router.get("/fields", authenticateToken, requirePermission("canViewAgriculture"), requireFeature("agriculture.fields"), async (req, res) => {
  try {
    const fields = await prisma.farmField.findMany({ where: { tenantId: t(req) }, include: { harvests: true, fieldExpenses: true }, orderBy: { name: "asc" } });
    res.json(fields);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/fields", authenticateToken, requirePermission("canCreateAgriculture"), requireFeature("agriculture.fields"), async (req, res) => {
  try {
    const { name, areaSize, areaUnit, cropType, branchId, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Field name is required' });
    const field = await prisma.farmField.create({ data: { name, areaSize, areaUnit: areaUnit || "acre", cropType, branchId, notes, tenantId: t(req) } });
    res.status(201).json(field);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/fields/:id", authenticateToken, requirePermission("canEditAgriculture"), requireFeature("agriculture.fields"), async (req, res) => {
  try {
    const { name, areaSize, areaUnit, cropType, status, notes } = req.body;
    const field = await prisma.farmField.update({ where: { id: req.params.id }, data: { name, areaSize, areaUnit, cropType, status, notes } });
    res.json(field);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/fields/:id", authenticateToken, requirePermission("canDeleteAgriculture"), requireFeature("agriculture.fields"), async (req, res) => {
  try {
    await prisma.farmField.delete({ where: { id: req.params.id } });
    res.json({ message: "Field deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== LIVESTOCK =====
router.get("/livestock", authenticateToken, requirePermission("canViewAgriculture"), requireFeature("agriculture.livestock"), async (req, res) => {
  try {
    const livestock = await prisma.livestock.findMany({ where: { tenantId: t(req) }, include: { harvests: true }, orderBy: { name: "asc" } });
    res.json(livestock);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/livestock", authenticateToken, requirePermission("canCreateAgriculture"), requireFeature("agriculture.livestock"), async (req, res) => {
  try {
    const { name, type, breed, count, branchId, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Livestock name is required' });
    if (count === undefined || count < 1) return res.status(400).json({ error: 'Count must be at least 1' });
    const livestock = await prisma.livestock.create({ data: { name, type, breed, count, branchId, notes, tenantId: t(req) } });
    res.status(201).json(livestock);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/livestock/:id", authenticateToken, requirePermission("canEditAgriculture"), requireFeature("agriculture.livestock"), async (req, res) => {
  try {
    const { name, type, breed, count, notes } = req.body;
    const livestock = await prisma.livestock.update({ where: { id: req.params.id }, data: { name, type, breed, count, notes } });
    res.json(livestock);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/livestock/:id", authenticateToken, requirePermission("canDeleteAgriculture"), requireFeature("agriculture.livestock"), async (req, res) => {
  try {
    await prisma.livestock.delete({ where: { id: req.params.id } });
    res.json({ message: "Livestock deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== HARVESTS =====
router.get("/harvests", authenticateToken, requirePermission("canViewAgriculture"), requireFeature("agriculture.harvests"), async (req, res) => {
  try {
    const harvests = await prisma.harvest.findMany({ where: { tenantId: t(req) }, include: { field: true, livestock: true, product: true }, orderBy: { harvestDate: "desc" } });
    res.json(harvests);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/harvests", authenticateToken, requirePermission("canCreateAgriculture"), requireFeature("agriculture.harvests"), async (req, res) => {
  try {
    const { fieldId, livestockId, type, productName, productId, quantity, unit, quality, harvestDate, branchId, notes } = req.body;
    if (!productName?.trim()) return res.status(400).json({ error: 'Product name is required' });
    if (!quantity || quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    const harvest = await prisma.harvest.create({ data: { fieldId, livestockId, type, productName, productId, quantity, unit: unit || "kg", quality, harvestDate: harvestDate ? new Date(harvestDate) : undefined, branchId, notes, tenantId: t(req) } });
    // If linked to inventory product, increase stock
    if (productId) {
      await prisma.product.update({ where: { id: productId }, data: { quantity: { increment: quantity } } });
    }
    res.status(201).json(harvest);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== FARM EXPENSES =====
router.get("/expenses", authenticateToken, requirePermission("canViewAgriculture"), requireFeature("agriculture.expenses"), async (req, res) => {
  try {
    const expenses = await prisma.farmExpense.findMany({ where: { tenantId: t(req) }, include: { field: true, livestock: true }, orderBy: { date: "desc" } });
    res.json(expenses);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/expenses", authenticateToken, requirePermission("canCreateAgriculture"), requireFeature("agriculture.expenses"), async (req, res) => {
  try {
    const { fieldId, livestockId, category, description, amount, date, branchId } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    const expense = await prisma.farmExpense.create({ data: { fieldId, livestockId, category, description, amount, date: date ? new Date(date) : undefined, branchId, tenantId: t(req) } });
    res.status(201).json(expense);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
