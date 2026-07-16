import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature, requireAnyFeature } from "../middleware/featureCheck.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;

// ===== APPOINTMENTS =====
router.get("/appointments", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const appts = await prisma.appointment.findMany({ where: { tenantId: t(req) }, include: { customer: true, product: true, technician: { select: { id: true, fname: true, lname: true, email: true } } }, orderBy: { scheduledDate: "desc" } });
    res.json(appts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/appointments", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, customerEmail, productId, technicianId, title, description, scheduledDate, scheduledTime, endTime, duration, price, branchId, notes } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!scheduledDate) return res.status(400).json({ error: 'Date is required' });
    if (!scheduledTime) return res.status(400).json({ error: 'Time is required' });
    const appt = await prisma.appointment.create({ data: { customerId, customerName, customerPhone, customerEmail, productId, technicianId, title, description, scheduledDate: new Date(scheduledDate), scheduledTime, endTime, duration, price: price || 0, branchId, notes, tenantId: t(req) } });
    res.status(201).json(appt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/appointments/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const { status, technicianId, scheduledDate, scheduledTime, endTime, duration, price, actualPrice, notes, cancelledReason } = req.body;
    const data = { status, technicianId, scheduledTime, endTime, duration, price, actualPrice, notes, cancelledReason };
    if (scheduledDate) data.scheduledDate = new Date(scheduledDate);
    if (status === 'completed') data.completedAt = new Date();
    const appt = await prisma.appointment.update({ where: { id: req.params.id }, data });
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
    const orders = await prisma.workOrder.findMany({ where: { tenantId: t(req) }, include: { customer: true, product: true, technician: { select: { id: true, fname: true, lname: true, email: true } } }, orderBy: { createdAt: "desc" } });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/work-orders", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.work_orders"), async (req, res) => {
  try {
    const { orderNo, customerId, customerName, customerPhone, customerEmail, productId, technicianId, title, description, priority, serviceCategory, estimatedCost, branchId, notes } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const order = await prisma.workOrder.create({ data: { orderNo: orderNo || `WO-${Date.now()}`, customerId, customerName, customerPhone, customerEmail, productId, technicianId, title, description, priority: priority || "normal", serviceCategory, estimatedCost: estimatedCost || 0, branchId, notes, tenantId: t(req) } });
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/work-orders/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.work_orders"), async (req, res) => {
  try {
    const { status, technicianId, priority, serviceCategory, estimatedCost, actualCost, laborCost, partsCost, startDate, endDate, diagnostics, warrantyInfo, notes } = req.body;
    const data = { status, technicianId, priority, serviceCategory, estimatedCost, actualCost, laborCost, partsCost, diagnostics, warrantyInfo, notes };
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    const order = await prisma.workOrder.update({ where: { id: req.params.id }, data });
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
    const { contractNo, customerId, title, description, serviceCategory, startDate, endDate, renewalDate, autoRenew, value, billingCycle, discountPercent, branchId, terms } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!customerId) return res.status(400).json({ error: 'Customer is required' });
    if (!startDate) return res.status(400).json({ error: 'Start date is required' });
    const contract = await prisma.serviceContract.create({ data: { contractNo: contractNo || `CON-${Date.now()}`, customerId, title, description, serviceCategory, startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : undefined, renewalDate: renewalDate ? new Date(renewalDate) : undefined, autoRenew: autoRenew || false, value: value || 0, billingCycle: billingCycle || "monthly", discountPercent: discountPercent || 0, branchId, terms, tenantId: t(req) } });
    res.status(201).json(contract);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/contracts/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.contracts"), async (req, res) => {
  try {
    const { title, description, serviceCategory, endDate, renewalDate, autoRenew, nextBillingDate, value, billingCycle, discountPercent, status, terms } = req.body;
    const data = { title, description, serviceCategory, autoRenew, value, billingCycle, discountPercent, status, terms };
    if (endDate) data.endDate = new Date(endDate);
    if (renewalDate) data.renewalDate = new Date(renewalDate);
    if (nextBillingDate) data.nextBillingDate = new Date(nextBillingDate);
    const contract = await prisma.serviceContract.update({ where: { id: req.params.id }, data });
    res.json(contract);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/contracts/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service.contracts"), async (req, res) => {
  try {
    await prisma.serviceContract.delete({ where: { id: req.params.id } });
    res.json({ message: "Contract deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SERVICE TECHNICIANS =====
router.get("/technicians", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service.technicians"), async (req, res) => {
  try {
    const techs = await prisma.serviceTechnician.findMany({ where: { tenantId: t(req) }, include: { branch: { select: { name: true } }, user: { select: { id: true, fname: true, lname: true, email: true } } }, orderBy: { createdAt: "desc" } });
    res.json(techs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/technicians", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.technicians"), async (req, res) => {
  try {
    const { name, email, phone, role, skills, specializations, hourlyRate, availability, branchId, userId, hireDate, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Technician name is required' });
    const tech = await prisma.serviceTechnician.create({ data: { name, email, phone, role: role || "technician", skills: skills || [], specializations: specializations || [], hourlyRate: hourlyRate || 0, availability: availability || "full_time", branchId, userId, hireDate: hireDate ? new Date(hireDate) : undefined, notes, tenantId: t(req) } });
    res.status(201).json(tech);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/technicians/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.technicians"), async (req, res) => {
  try {
    const { name, email, phone, role, skills, specializations, hourlyRate, availability, isActive, notes } = req.body;
    const tech = await prisma.serviceTechnician.update({ where: { id: req.params.id }, data: { name, email, phone, role, skills, specializations, hourlyRate, availability, isActive, notes } });
    res.json(tech);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/technicians/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service.technicians"), async (req, res) => {
  try {
    await prisma.serviceTechnician.delete({ where: { id: req.params.id } });
    res.json({ message: "Technician deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SERVICE JOB CARDS =====
router.get("/job-cards", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service.job_cards"), async (req, res) => {
  try {
    const cards = await prisma.serviceJobCard.findMany({ where: { tenantId: t(req) }, include: { technician: true, appointment: { select: { id: true, title: true, scheduledDate: true } }, workOrder: { select: { id: true, orderNo: true, title: true } } }, orderBy: { createdAt: "desc" } });
    res.json(cards);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/job-cards", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.job_cards"), async (req, res) => {
  try {
    const { cardNo, appointmentId, workOrderId, technicianId, customerName, customerPhone, serviceTitle, serviceDescription, priority, scheduledStart, scheduledEnd, laborCost, partsCost, partsUsed, branchId } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!serviceTitle?.trim()) return res.status(400).json({ error: 'Service title is required' });
    const totalCost = (laborCost || 0) + (partsCost || 0);
    const card = await prisma.serviceJobCard.create({ data: { cardNo: cardNo || `JC-${Date.now()}`, appointmentId, workOrderId, technicianId, customerName, customerPhone, serviceTitle, serviceDescription, priority: priority || "normal", scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined, scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined, laborCost: laborCost || 0, partsCost: partsCost || 0, totalCost, partsUsed, branchId, tenantId: t(req) } });
    res.status(201).json(card);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/job-cards/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.job_cards"), async (req, res) => {
  try {
    const { status, technicianId, priority, actualStart, actualEnd, laborHours, laborCost, partsCost, partsUsed, qualityCheckPassed, qualityNotes, completionNotes, customerSignature } = req.body;
    const totalCost = (laborCost || 0) + (partsCost || 0);
    const data = { status, technicianId, priority, laborHours, laborCost, partsCost, totalCost, partsUsed, qualityCheckPassed, qualityNotes, completionNotes, customerSignature };
    if (actualStart) data.actualStart = new Date(actualStart);
    if (actualEnd) data.actualEnd = new Date(actualEnd);
    const card = await prisma.serviceJobCard.update({ where: { id: req.params.id }, data });
    res.json(card);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/job-cards/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service.job_cards"), async (req, res) => {
  try {
    await prisma.serviceJobCard.delete({ where: { id: req.params.id } });
    res.json({ message: "Job card deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SERVICE FEEDBACK =====
router.get("/feedback", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const feedback = await prisma.serviceFeedback.findMany({ where: { tenantId: t(req) }, include: { customer: { select: { id: true, name: true } }, appointment: { select: { id: true, title: true } }, workOrder: { select: { id: true, orderNo: true } }, contract: { select: { id: true, contractNo: true } } }, orderBy: { createdAt: "desc" } });
    res.json(feedback);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/feedback", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const { appointmentId, workOrderId, contractId, customerId, customerName, customerPhone, rating, serviceQuality, timeliness, professionalism, valueForMoney, comment, wouldRecommend, branchId } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    const fb = await prisma.serviceFeedback.create({ data: { appointmentId, workOrderId, contractId, customerId, customerName, customerPhone, rating, serviceQuality: serviceQuality || 5, timeliness: timeliness || 5, professionalism: professionalism || 5, valueForMoney: valueForMoney || 5, comment, wouldRecommend: wouldRecommend !== false, branchId, tenantId: t(req) } });
    res.status(201).json(fb);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/feedback/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    const { status, response } = req.body;
    const data = { status };
    if (response !== undefined) { data.response = response; data.respondedAt = new Date(); }
    const fb = await prisma.serviceFeedback.update({ where: { id: req.params.id }, data });
    res.json(fb);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/feedback/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service.appointments"), async (req, res) => {
  try {
    await prisma.serviceFeedback.delete({ where: { id: req.params.id } });
    res.json({ message: "Feedback deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SERVICE CATEGORIES PRESETS =====
router.get("/categories", authenticateToken, requirePermission("canViewServiceBusiness"), async (req, res) => {
  try {
    const { getDefaultCategoryDefinitionsForBusinessType } = await import("../src/utils/categoryDefaults.js");
    const businessType = req.query.businessType || 'service';
    const categories = getDefaultCategoryDefinitionsForBusinessType(businessType);
    res.json(categories);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;

// ===== CAR WASH & GARAGE (simple work-order based entries) =====
// These endpoints create lightweight work order records for car-wash and garage services
// so the frontend can record and list services without a separate DB model.
router.get('/car-wash', authenticateToken, requirePermission('canViewServiceBusiness'), requireAnyFeature(['service.car_wash','service.car-wash','fuel_station.car_wash','fuel_station.car-wash']), async (req, res) => {
  try {
    const where = { tenantId: t(req) };
    const orders = await prisma.workOrder.findMany({ where, include: { product: true }, orderBy: { createdAt: 'desc' } });
    // Filter client-side for car wash related entries (product slug or title/notes match)
    const items = orders.filter(o => (o.product && (o.product.slug === 'car-wash-valet' || (o.product.name || '').toLowerCase().includes('car wash'))) || (o.title && o.title.toLowerCase().includes('car wash')) || (o.notes && o.notes.toLowerCase().includes('car wash')));
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/car-wash', authenticateToken, requirePermission('canCreateServiceBusiness'), requireAnyFeature(['service.car_wash','service.car-wash','fuel_station.car_wash','fuel_station.car-wash']), async (req, res) => {
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
    // If dedicated CarWashRecord model exists in Prisma client, create a record there as well
    try {
      if (prisma.carWashRecord) {
        await prisma.carWashRecord.create({ data: {
          tenantId: t(req),
          branchId: branchId || null,
          vehicle,
          serviceType,
          amount: amount || 0,
          attendantId: attendantId || null,
          notes: notes || null,
        } });
      }
    } catch (e) {
      console.warn('CarWashRecord model write skipped or failed:', e.message || e);
    }
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/car-wash/:id', authenticateToken, requirePermission('canViewServiceBusiness'), requireAnyFeature(['service.car_wash','service.car-wash','fuel_station.car_wash','fuel_station.car-wash']), async (req, res) => {
  try {
    const order = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/car-wash/:id', authenticateToken, requirePermission('canEditServiceBusiness'), requireAnyFeature(['service.car_wash','service.car-wash','fuel_station.car_wash','fuel_station.car-wash']), async (req, res) => {
  try {
    const { vehicle, serviceType, amount, attendantId, notes } = req.body;
    const data = {};
    if (vehicle !== undefined) data.customerName = vehicle;
    if (serviceType !== undefined) data.title = serviceType;
    if (amount !== undefined) { data.estimatedCost = amount; data.actualCost = amount }
    if (attendantId !== undefined) data.technicianId = attendantId;
    if (notes !== undefined) data.notes = typeof notes === 'string' ? notes : JSON.stringify(notes);
    const updated = await prisma.workOrder.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/car-wash/:id', authenticateToken, requirePermission('canDeleteServiceBusiness'), requireAnyFeature(['service.car_wash','service.car-wash','fuel_station.car_wash','fuel_station.car-wash']), async (req, res) => {
  try {
    await prisma.workOrder.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/garage', authenticateToken, requirePermission('canViewServiceBusiness'), requireAnyFeature(['service.garage','service.auto_repair','service.auto-repair','auto-repair-services']), async (req, res) => {
  try {
    const where = { tenantId: t(req) };
    const orders = await prisma.workOrder.findMany({ where, include: { product: true }, orderBy: { createdAt: 'desc' } });
    const items = orders.filter(o => (o.product && (o.product.slug === 'auto-repair-services' || (o.product.name || '').toLowerCase().includes('repair') || (o.product.name || '').toLowerCase().includes('garage'))) || (o.title && (o.title.toLowerCase().includes('repair') || o.title.toLowerCase().includes('garage'))) || (o.notes && o.notes.toLowerCase().includes('repair')));
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/garage', authenticateToken, requirePermission('canCreateServiceBusiness'), requireAnyFeature(['service.garage','service.auto_repair','service.auto-repair','auto-repair-services']), async (req, res) => {
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
    try {
      if (prisma.garageService) {
        await prisma.garageService.create({ data: {
          tenantId: t(req),
          branchId: branchId || null,
          vehicle,
          service,
          cost: cost || 0,
          attendantId: attendantId || null,
          status: 'open',
          notes: notes || null,
        } });
      }
    } catch (e) {
      console.warn('GarageService model write skipped or failed:', e.message || e);
    }
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/garage/:id', authenticateToken, requirePermission('canViewServiceBusiness'), requireAnyFeature(['service.garage','service.auto_repair','service.auto-repair','auto-repair-services']), async (req, res) => {
  try {
    const order = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/garage/:id', authenticateToken, requirePermission('canEditServiceBusiness'), requireAnyFeature(['service.garage','service.auto_repair','service.auto-repair','auto-repair-services']), async (req, res) => {
  try {
    const { vehicle, service, cost, attendantId, status, notes } = req.body;
    const data = {};
    if (vehicle !== undefined) data.customerName = vehicle;
    if (service !== undefined) data.title = service;
    if (cost !== undefined) { data.estimatedCost = cost; data.actualCost = cost }
    if (attendantId !== undefined) data.technicianId = attendantId;
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = typeof notes === 'string' ? notes : JSON.stringify(notes);
    const updated = await prisma.workOrder.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/garage/:id', authenticateToken, requirePermission('canDeleteServiceBusiness'), requireAnyFeature(['service.garage','service.auto_repair','service.auto-repair','auto-repair-services']), async (req, res) => {
  try {
    await prisma.workOrder.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
