import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;

// ===== PUMPS =====
router.get("/pumps", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const pumps = await prisma.fuelPump.findMany({ where: { tenantId: t(req) }, include: { tank: true }, orderBy: { name: "asc" } });
    res.json(pumps);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/pumps", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, tankId, nozzleCount, branchId, isActive } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Pump name is required' });
    if (!tankId) return res.status(400).json({ error: 'Tank is required' });
    const pump = await prisma.fuelPump.create({ data: { name, tankId, nozzleCount: nozzleCount || 1, branchId, isActive: isActive !== false, tenantId: t(req) } });
    res.status(201).json(pump);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/pumps/:id", authenticateToken, requirePermission("canEditFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, tankId, nozzleCount, branchId, isActive } = req.body;
    const pump = await prisma.fuelPump.update({ where: { id: req.params.id }, data: { name, tankId, nozzleCount, branchId, isActive } });
    res.json(pump);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/pumps/:id", authenticateToken, requirePermission("canDeleteFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    await prisma.fuelPump.delete({ where: { id: req.params.id } });
    res.json({ message: "Pump deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TANKS =====
router.get("/tanks", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const tanks = await prisma.fuelTank.findMany({ where: { tenantId: t(req) }, include: { pumps: true }, orderBy: { name: "asc" } });
    res.json(tanks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/tanks", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, fuelType, capacity, currentStock, unitCost, branchId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tank name is required' });
    if (capacity === undefined || capacity <= 0) return res.status(400).json({ error: 'Capacity must be greater than 0' });
    const tank = await prisma.fuelTank.create({ data: { name, fuelType, capacity, currentStock: currentStock || 0, unitCost: unitCost || 0, branchId, tenantId: t(req) } });
    res.status(201).json(tank);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/tanks/:id", authenticateToken, requirePermission("canEditFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, fuelType, capacity, currentStock, unitCost, isActive } = req.body;
    const tank = await prisma.fuelTank.update({ where: { id: req.params.id }, data: { name, fuelType, capacity, currentStock, unitCost, isActive } });
    res.json(tank);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/tanks/:id", authenticateToken, requirePermission("canDeleteFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    await prisma.fuelTank.delete({ where: { id: req.params.id } });
    res.json({ message: "Tank deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== DELIVERIES =====
router.get("/deliveries", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.deliveries"), async (req, res) => {
  try {
    const deliveries = await prisma.fuelDelivery.findMany({ where: { tenantId: t(req) }, include: { tank: true }, orderBy: { deliveryDate: "desc" } });
    res.json(deliveries);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/deliveries", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.deliveries"), async (req, res) => {
  try {
    const { tankId, supplierName, invoiceNo, litres, unitCost, branchId, deliveryDate, notes } = req.body;
    if (!tankId) return res.status(400).json({ error: 'Tank is required' });
    if (!supplierName?.trim()) return res.status(400).json({ error: 'Supplier name is required' });
    if (!litres || litres <= 0) return res.status(400).json({ error: 'Litres must be greater than 0' });
    const totalCost = litres * unitCost;
    const delivery = await prisma.fuelDelivery.create({ data: { tankId, supplierName, invoiceNo, litres, unitCost, totalCost, branchId, deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined, notes, tenantId: t(req) } });
    // Increase tank stock
    await prisma.fuelTank.update({ where: { id: tankId }, data: { currentStock: { increment: litres } } });
    res.status(201).json(delivery);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== METER READINGS =====
router.get("/meter-readings", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.meter_readings"), async (req, res) => {
  try {
    const readings = await prisma.fuelMeterReading.findMany({ where: { tenantId: t(req) }, include: { pump: true }, orderBy: { readingDate: "desc" } });
    res.json(readings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/meter-readings", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.meter_readings"), async (req, res) => {
  try {
    const { pumpId, openingReading, closingReading, litresSold, amount, shiftId } = req.body;
    const reading = await prisma.fuelMeterReading.create({ data: { pumpId, openingReading, closingReading, litresSold, amount, shiftId, tenantId: t(req) } });
    res.status(201).json(reading);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SHIFT REPORTS =====
router.get("/shifts", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.shift_reports"), async (req, res) => {
  try {
    const shifts = await prisma.fuelShiftReport.findMany({ where: { tenantId: t(req) }, include: { pump: true, user: true }, orderBy: { createdAt: "desc" } });
    res.json(shifts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/shifts", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.shift_reports"), async (req, res) => {
  try {
    const { shiftNo, pumpId, openingReading, startDate, branchId } = req.body;
    if (!pumpId) return res.status(400).json({ error: 'Pump is required' });
    if (!startDate) return res.status(400).json({ error: 'Start date is required' });
    const shift = await prisma.fuelShiftReport.create({ data: { shiftNo, pumpId, openingReading, startDate: new Date(startDate), branchId, userId: req.user.id, tenantId: t(req) } });
    res.status(201).json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/shifts/:id/close", authenticateToken, requirePermission("canEditFuelStation"), requireFeature("fuel_station.shift_reports"), async (req, res) => {
  try {
    const { closingReading, litresSold, cashSales, mobileSales, creditSales, lubricantSales, carWashIncome, expenses, notes } = req.body;
    const totalSales = (cashSales || 0) + (mobileSales || 0) + (creditSales || 0);
    const netAmount = totalSales + (lubricantSales || 0) + (carWashIncome || 0) - (expenses || 0);
    const shift = await prisma.fuelShiftReport.update({ where: { id: req.params.id }, data: { closingReading, litresSold, cashSales, mobileSales, creditSales, totalSales, lubricantSales, carWashIncome, expenses, netAmount, status: "closed", endDate: new Date(), notes } });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== DIPSTICK READINGS =====
// Gated on the `fuel_station` module feature (owner's subscription/override),
// staff access controlled by permission (canViewFuelStation) granted by owner.
router.get("/dipstick", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station"), async (req, res) => {
  try {
    const rows = await prisma.fuelDipstickReading.findMany({ where: { tenantId: t(req) }, include: { tank: true }, orderBy: { readingDate: "desc" } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/dipstick", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station"), async (req, res) => {
  try {
    const { tankId, readingDate, dipstickLevel, bookStock, attendant, notes } = req.body;
    if (!tankId) return res.status(400).json({ error: 'Tank is required' });
    const variance = (Number(dipstickLevel) || 0) - (Number(bookStock) || 0);
    const row = await prisma.fuelDipstickReading.create({ data: { tankId, readingDate: readingDate ? new Date(readingDate) : undefined, dipstickLevel: Number(dipstickLevel) || 0, bookStock: Number(bookStock) || 0, variance, attendant, notes, tenantId: t(req) } });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PRICING =====
router.get("/pricing", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station"), async (req, res) => {
  try {
    const rows = await prisma.fuelPricing.findMany({ where: { tenantId: t(req) }, orderBy: { effectiveDate: "desc" } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/pricing", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station"), async (req, res) => {
  try {
    const { fuelType, pumpPrice, costPrice, effectiveDate, notes } = req.body;
    if (!fuelType?.trim()) return res.status(400).json({ error: 'Fuel type is required' });
    const margin = (Number(pumpPrice) || 0) - (Number(costPrice) || 0);
    const row = await prisma.fuelPricing.create({ data: { fuelType, pumpPrice: Number(pumpPrice) || 0, costPrice: Number(costPrice) || 0, margin, effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined, notes, tenantId: t(req) } });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== COMPLIANCE =====
router.get("/compliance", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station"), async (req, res) => {
  try {
    const rows = await prisma.fuelCompliance.findMany({ where: { tenantId: t(req) }, orderBy: { inspectionDate: "desc" } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/compliance", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station"), async (req, res) => {
  try {
    const { inspectionDate, type, result, nextDue, notes } = req.body;
    if (!type?.trim()) return res.status(400).json({ error: 'Inspection type is required' });
    if (!result?.trim()) return res.status(400).json({ error: 'Result is required' });
    const row = await prisma.fuelCompliance.create({ data: { inspectionDate: inspectionDate ? new Date(inspectionDate) : undefined, type, result, nextDue: nextDue ? new Date(nextDue) : undefined, notes, tenantId: t(req) } });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
