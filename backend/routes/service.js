import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;

// ===== APPOINTMENTS =====
router.get("/appointments", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const appts = await prisma.appointment.findMany({ where: { tenantId: t(req) }, include: { customer: true, product: true }, orderBy: { scheduledDate: "desc" } });
    res.json(appts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/appointments", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, productId, technicianId, title, description, scheduledDate, scheduledTime, duration, price, branchId, notes } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!productId) return res.status(400).json({ error: 'Service is required' });
    if (!scheduledDate) return res.status(400).json({ error: 'Date is required' });
    if (!scheduledTime) return res.status(400).json({ error: 'Time is required' });
    const appt = await prisma.appointment.create({ data: { customerId, customerName, customerPhone, productId, technicianId, title, description, scheduledDate: new Date(scheduledDate), scheduledTime, duration, price: price || 0, branchId, notes, tenantId: t(req) } });
    res.status(201).json(appt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/appointments/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const { status, technicianId, scheduledDate, scheduledTime, duration, price, notes } = req.body;
    const appt = await prisma.appointment.update({ where: { id: req.params.id }, data: { status, technicianId, scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined, scheduledTime, duration, price, notes } });
    res.json(appt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/appointments/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    await prisma.appointment.delete({ where: { id: req.params.id } });
    res.json({ message: "Appointment deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== WORK ORDERS =====
router.get("/work-orders", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service.work_orders"), async (req, res) => {
  try {
    const orders = await prisma.workOrder.findMany({ where: { tenantId: t(req) }, include: { customer: true, product: true }, orderBy: { createdAt: "desc" } });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/work-orders", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.work_orders"), async (req, res) => {
  try {
    const { orderNo, customerId, customerName, customerPhone, productId, technicianId, title, description, priority, estimatedCost, branchId, notes } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const order = await prisma.workOrder.create({ data: { orderNo, customerId, customerName, customerPhone, productId, technicianId, title, description, priority: priority || "normal", estimatedCost: estimatedCost || 0, branchId, notes, tenantId: t(req) } });
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/work-orders/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.work_orders"), async (req, res) => {
  try {
    const { status, technicianId, priority, estimatedCost, actualCost, startDate, endDate, notes } = req.body;
    const order = await prisma.workOrder.update({ where: { id: req.params.id }, data: { status, technicianId, priority, estimatedCost, actualCost, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, notes } });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/work-orders/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service.work_orders"), async (req, res) => {
  try {
    await prisma.workOrder.delete({ where: { id: req.params.id } });
    res.json({ message: "Work order deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SERVICE CONTRACTS =====
router.get("/contracts", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service.contracts"), async (req, res) => {
  try {
    const contracts = await prisma.serviceContract.findMany({ where: { tenantId: t(req) }, include: { customer: true }, orderBy: { createdAt: "desc" } });
    res.json(contracts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/contracts", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.contracts"), async (req, res) => {
  try {
    const { contractNo, customerId, title, description, startDate, endDate, value, billingCycle, branchId, terms } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!customerId) return res.status(400).json({ error: 'Customer is required' });
    if (!startDate) return res.status(400).json({ error: 'Start date is required' });
    const contract = await prisma.serviceContract.create({ data: { contractNo, customerId, title, description, startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : undefined, value: value || 0, billingCycle: billingCycle || "monthly", branchId, terms, tenantId: t(req) } });
    res.status(201).json(contract);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/contracts/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.contracts"), async (req, res) => {
  try {
    const { title, description, endDate, value, billingCycle, status, terms } = req.body;
    const contract = await prisma.serviceContract.update({ where: { id: req.params.id }, data: { title, description, endDate: endDate ? new Date(endDate) : undefined, value, billingCycle, status, terms } });
    res.json(contract);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/contracts/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service.contracts"), async (req, res) => {
  try {
    await prisma.serviceContract.delete({ where: { id: req.params.id } });
    res.json({ message: "Contract deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;

// ===== CAR WASH & GARAGE (simple work-order based entries) =====
// These endpoints create lightweight work order records for car-wash and garage services
// so the frontend can record and list services without a separate DB model.
router.get('/car-wash', authenticateToken, requirePermission('canViewServiceBusiness'), requireFeature('service.car_wash'), async (req, res) => {
  try {
    const where = { tenantId: t(req) };
    const orders = await prisma.workOrder.findMany({ where, include: { product: true }, orderBy: { createdAt: 'desc' } });
    // Filter client-side for car wash related entries (product slug or title/notes match)
    const items = orders.filter(o => (o.product && (o.product.slug === 'car-wash-valet' || (o.product.name || '').toLowerCase().includes('car wash'))) || (o.title && o.title.toLowerCase().includes('car wash')) || (o.notes && o.notes.toLowerCase().includes('car wash')));
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/car-wash', authenticateToken, requirePermission('canCreateServiceBusiness'), requireFeature('service.car_wash'), async (req, res) => {
  try {
    const { date, vehicle, serviceType, amount, attendantId, branchId, notes } = req.body;
    if (!serviceType || !vehicle) return res.status(400).json({ error: 'Vehicle and service type are required' });
    const order = await prisma.workOrder.create({ data: {
      orderNo: `CW-${Date.now()}`,
      customerName: vehicle,
      customerPhone: null,
      productId: null,
      technicianId: attendantId || null,
      title: serviceType,
      description: notes || null,
      priority: 'normal',
      estimatedCost: amount || 0,
      actualCost: amount || 0,
      branchId: branchId || null,
      notes: JSON.stringify({ vehicle, serviceType, extra: notes || null }),
      tenantId: t(req),
    } });
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/garage', authenticateToken, requirePermission('canViewServiceBusiness'), requireFeature('service.garage'), async (req, res) => {
  try {
    const where = { tenantId: t(req) };
    const orders = await prisma.workOrder.findMany({ where, include: { product: true }, orderBy: { createdAt: 'desc' } });
    const items = orders.filter(o => (o.product && (o.product.slug === 'auto-repair-services' || (o.product.name || '').toLowerCase().includes('repair') || (o.product.name || '').toLowerCase().includes('garage'))) || (o.title && (o.title.toLowerCase().includes('repair') || o.title.toLowerCase().includes('garage'))) || (o.notes && o.notes.toLowerCase().includes('repair')));
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/garage', authenticateToken, requirePermission('canCreateServiceBusiness'), requireFeature('service.garage'), async (req, res) => {
  try {
    const { date, vehicle, service, cost, attendantId, branchId, notes } = req.body;
    if (!service || !vehicle) return res.status(400).json({ error: 'Vehicle and service description are required' });
    const order = await prisma.workOrder.create({ data: {
      orderNo: `GR-${Date.now()}`,
      customerName: vehicle,
      customerPhone: null,
      productId: null,
      technicianId: attendantId || null,
      title: service,
      description: notes || null,
      priority: 'normal',
      estimatedCost: cost || 0,
      actualCost: cost || 0,
      branchId: branchId || null,
      notes: JSON.stringify({ vehicle, service, extra: notes || null }),
      tenantId: t(req),
    } });
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
