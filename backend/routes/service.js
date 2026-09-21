import { Router } from "express";
import crypto from "crypto";
import { ensureServiceFeedbackSchema } from '../src/utils/serviceFeedbackSchema.js';
import prisma from "../src/db.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requireFeature, requireAnyFeature, getTenantFeatures, hasFeatureAccess } from "../middleware/featureCheck.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;

function feedbackTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

async function findServiceProduct(tenantId, productId) {
  if (!productId) return null;
  return prisma.product.findFirst({
    where: { id: productId, tenantId, itemType: "service", isActive: true },
    include: { category: { select: { name: true } } },
  });
}

function publicService(service) {
  if (!service) return null;
  return {
    id: service.id,
    name: service.name,
    description: service.description || "",
    duration: service.duration || null,
    category: service.serviceCategory || service.category?.name || null,
  };
}

async function validateServiceLinks(tenantId, body, productId) {
  for (const [field, model] of [['appointmentId', 'appointment'], ['workOrderId', 'workOrder'], ['contractId', 'serviceContract'], ['branchId', 'branch']]) {
    if (!body[field]) continue;
    if (typeof body[field] !== 'string') return `Invalid ${field}`;
    const record = await prisma[model].findFirst({ where: { id: body[field], tenantId } });
    if (!record || (productId && record.productId && record.productId !== productId)) return `The selected ${field} does not belong to this business and service`;
  }
  return null;
}

router.get('/catalog', authenticateToken, requirePermission('canViewServiceBusiness'), requireFeature('service'), async (req, res) => {
  try {
    const services = await prisma.product.findMany({ where: { tenantId: t(req), itemType: 'service', isActive: true }, select: { id: true, name: true, description: true, price: true, serviceCategory: true, category: { select: { name: true } } }, orderBy: { name: 'asc' } });
    res.json(services.map(service => ({ id: service.id, product_name: service.name, description: service.description || '', unit_price: service.price, serviceCategory: service.serviceCategory, categoryName: service.category?.name, isActive: true })));
  } catch { res.status(500).json({ error: 'Unable to load services' }); }
});

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
    const service = await findServiceProduct(t(req), productId);
    if (!service) return res.status(400).json({ error: 'Select a saved service from Inventory > Services' });
    const orderTitle = title?.trim() || service.name;
    const linkError = await validateServiceLinks(t(req), req.body, service.id);
    if (linkError) return res.status(400).json({ error: linkError });
    if (customerId && !await prisma.customer.findFirst({ where: { id: customerId, tenantId: t(req) } })) return res.status(400).json({ error: 'Invalid customer' });
    if (technicianId && !await prisma.user.findFirst({ where: { id: technicianId, tenantId: t(req) } })) return res.status(400).json({ error: 'Invalid technician' });
    const cost = Number(estimatedCost ?? service.price ?? 0);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'Estimated cost must be a non-negative number' });
    const order = await prisma.workOrder.create({ data: { orderNo: orderNo || `WO-${Date.now()}`, customerId: customerId || null, customerName, customerPhone, customerEmail, productId: service.id, technicianId: technicianId || null, title: orderTitle, description: description || service.description || null, priority: priority || "normal", serviceCategory: serviceCategory || service.serviceCategory || service.category?.name || null, estimatedCost: cost, branchId: branchId || null, notes, tenantId: t(req) } });
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
    await ensureServiceFeedbackSchema();
    const cards = await prisma.serviceJobCard.findMany({ where: { tenantId: t(req) }, include: { product: { select: { id: true, name: true, serviceCategory: true, duration: true } }, technician: true, appointment: { select: { id: true, title: true, scheduledDate: true } }, workOrder: { select: { id: true, orderNo: true, title: true } } }, orderBy: { createdAt: "desc" } });
    res.json(cards);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/job-cards", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service.job_cards"), async (req, res) => {
  try {
    await ensureServiceFeedbackSchema();
    const { cardNo, appointmentId, workOrderId, productId, technicianId, customerName, customerPhone, serviceTitle, serviceDescription, priority, scheduledStart, scheduledEnd, laborCost, partsCost, partsUsed, branchId } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    const service = await findServiceProduct(t(req), productId);
    if (!service) return res.status(400).json({ error: 'Select a saved service from Inventory > Services' });
    const linkError = await validateServiceLinks(t(req), req.body, service.id);
    if (linkError) return res.status(400).json({ error: linkError });
    if (technicianId && !await prisma.serviceTechnician.findFirst({ where: { id: technicianId, tenantId: t(req) } })) return res.status(400).json({ error: 'Invalid technician' });
    const finalLaborCost = Number(laborCost ?? service.price ?? 0);
    const finalPartsCost = Number(partsCost ?? 0);
    if (![finalLaborCost, finalPartsCost].every(value => Number.isFinite(value) && value >= 0)) return res.status(400).json({ error: 'Costs must be non-negative numbers' });
    const totalCost = finalLaborCost + finalPartsCost;
    const card = await prisma.serviceJobCard.create({ data: { cardNo: cardNo || `JC-${Date.now()}`, appointmentId: appointmentId || null, workOrderId: workOrderId || null, productId: service.id, technicianId: technicianId || null, customerName, customerPhone, serviceTitle: serviceTitle?.trim() || service.name, serviceDescription: serviceDescription || service.description || null, priority: priority || "normal", scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined, scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined, laborCost: finalLaborCost, partsCost: finalPartsCost, totalCost, partsUsed, branchId: branchId || null, tenantId: t(req) } });
    res.status(201).json(card);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/job-cards/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service.job_cards"), async (req, res) => {
  try {
    await ensureServiceFeedbackSchema();
    const { status, technicianId, priority, actualStart, actualEnd, laborHours, laborCost, partsCost, partsUsed, qualityCheckPassed, qualityNotes, completionNotes, customerSignature } = req.body;
    const existing = await prisma.serviceJobCard.findFirst({ where: { id: req.params.id, tenantId: t(req) } });
    if (!existing) return res.status(404).json({ error: 'Job card not found' });
    const totalCost = Number(laborCost ?? existing.laborCost) + Number(partsCost ?? existing.partsCost);
    const data = { status, technicianId, priority, laborHours, laborCost, partsCost, totalCost, partsUsed, qualityCheckPassed, qualityNotes, completionNotes, customerSignature };
    if (req.body.productId !== undefined) {
      const service = await findServiceProduct(t(req), req.body.productId);
      if (!service) return res.status(400).json({ error: 'Select a saved service from Inventory > Services' });
      data.productId = service.id;
      data.serviceTitle = req.body.serviceTitle?.trim() || service.name;
      data.serviceDescription = req.body.serviceDescription || service.description || null;
    }
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
router.get("/feedback", authenticateToken, requirePermission("canViewServiceBusiness"), requireFeature("service"), async (req, res) => {
  try {
    await ensureServiceFeedbackSchema();
    const feedback = await prisma.serviceFeedback.findMany({ where: { tenantId: t(req) }, include: { product: { select: { id: true, name: true, serviceCategory: true } }, customer: { select: { id: true, name: true } }, appointment: { select: { id: true, title: true } }, workOrder: { select: { id: true, orderNo: true } }, contract: { select: { id: true, contractNo: true } } }, orderBy: { createdAt: "desc" } });
    res.json(feedback);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/feedback", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service"), async (req, res) => {
  try {
    await ensureServiceFeedbackSchema();
    const { appointmentId, workOrderId, contractId, productId, customerId, customerName, customerPhone, rating, serviceQuality, timeliness, professionalism, valueForMoney, comment, wouldRecommend, branchId } = req.body;
    if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    const service = productId ? await findServiceProduct(t(req), productId) : null;
    const fb = await prisma.serviceFeedback.create({ data: { appointmentId, workOrderId, contractId, productId: service?.id || null, customerId, customerName, customerPhone, rating, serviceQuality: serviceQuality || 5, timeliness: timeliness || 5, professionalism: professionalism || 5, valueForMoney: valueForMoney || 5, comment, wouldRecommend: wouldRecommend !== false, branchId, tenantId: t(req) } });
    res.status(201).json(fb);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/feedback/:id", authenticateToken, requirePermission("canEditServiceBusiness"), requireFeature("service"), async (req, res) => {
  try {
    await ensureServiceFeedbackSchema();
    const { status, response } = req.body;
    const data = { status };
    if (response !== undefined) { data.response = response; data.respondedAt = new Date(); }
    const fb = await prisma.serviceFeedback.update({ where: { id: req.params.id, tenantId: t(req) }, data });
    res.json(fb);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/feedback/:id", authenticateToken, requirePermission("canDeleteServiceBusiness"), requireFeature("service"), async (req, res) => {
  try {
    await prisma.serviceFeedback.delete({ where: { id: req.params.id, tenantId: t(req) } });
    res.json({ message: "Feedback deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post("/feedback-link", authenticateToken, requirePermission("canCreateServiceBusiness"), requireFeature("service"), async (req, res) => {
  try {
    await ensureServiceFeedbackSchema();
    const { productId, appointmentId, workOrderId, contractId, branchId } = req.body;
    const tenantId = t(req);
    const service = await findServiceProduct(tenantId, productId);
    if (!service) return res.status(400).json({ error: 'Select a saved service from Inventory > Services' });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, logo: true } });
    const linkError = await validateServiceLinks(tenantId, req.body, service.id);
    if (linkError) return res.status(400).json({ error: linkError });
    const token = crypto.randomBytes(32).toString("base64url");
    await prisma.serviceFeedbackLink.create({ data: {
      tenantId,
      productId: service.id,
      appointmentId: appointmentId || null,
      workOrderId: workOrderId || null,
      contractId: contractId || null,
      branchId: branchId || null,
      tokenHash: feedbackTokenHash(token),
    } });
    res.status(201).json({ path: '/service-feedback/' + encodeURIComponent(token), businessName: tenant?.name || 'Business', logo: tenant?.logo || null, service: publicService(service) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function findFeedbackLink(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
  await ensureServiceFeedbackSchema();
  const tokenHash = feedbackTokenHash(token);
  const link = await prisma.serviceFeedbackLink.findUnique({ where: { tokenHash } });
  if (!link || !link.isActive || (link.expiresAt && link.expiresAt < new Date())) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: link.tenantId }, select: { status: true } });
  if (!tenant || !['active', 'trial'].includes(tenant.status)) return null;
  if (!hasFeatureAccess(await getTenantFeatures(link.tenantId), 'service')) return null;
  return link;
}

router.get("/public-feedback/:token", async (req, res) => {
  try {
    const link = await findFeedbackLink(req.params.token);
    if (!link) return res.status(404).json({ error: 'Feedback form not found' });
    const [tenant, service] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: link.tenantId }, select: { id: true, name: true, logo: true, status: true } }),
      findServiceProduct(link.tenantId, link.productId),
    ]);
    if (!tenant || !service) return res.status(404).json({ error: 'Feedback form not found' });
    res.json({ businessName: tenant.name, logo: tenant.logo || null, service: publicService(service) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/public-feedback/:token", async (req, res) => {
  try {
    const link = await findFeedbackLink(req.params.token);
    if (!link) return res.status(404).json({ error: 'Feedback form not found' });
    const service = await findServiceProduct(link.tenantId, link.productId);
    if (!service) return res.status(404).json({ error: 'Feedback form not found' });
    const { customerName, customerPhone, rating, serviceQuality, timeliness, professionalism, valueForMoney, comment, wouldRecommend } = req.body;
    if (typeof customerName !== 'string' || !customerName.trim() || customerName.length > 120) return res.status(400).json({ error: 'Your name is required (up to 120 characters)' });
    if (comment != null && (typeof comment !== 'string' || comment.length > 4000)) return res.status(400).json({ error: 'Comments must be 4000 characters or less' });
    if (customerPhone != null && (typeof customerPhone !== 'string' || customerPhone.length > 40)) return res.status(400).json({ error: 'Invalid phone number' });
    if (wouldRecommend !== undefined && typeof wouldRecommend !== 'boolean') return res.status(400).json({ error: 'Invalid recommendation' });
    const finalRating = Number(rating);
    if (![rating, serviceQuality ?? rating, timeliness ?? rating, professionalism ?? rating, valueForMoney ?? rating].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5)) return res.status(400).json({ error: 'Ratings must be whole numbers from 1 to 5' });
    const fb = await prisma.serviceFeedback.create({ data: {
      tenantId: link.tenantId,
      branchId: link.branchId || null,
      appointmentId: link.appointmentId || null,
      workOrderId: link.workOrderId || null,
      contractId: link.contractId || null,
      productId: service.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone || null,
      rating: finalRating,
      serviceQuality: Number(serviceQuality) || finalRating,
      timeliness: Number(timeliness) || finalRating,
      professionalism: Number(professionalism) || finalRating,
      valueForMoney: Number(valueForMoney) || finalRating,
      comment,
      wouldRecommend: wouldRecommend !== false,
    } });
    res.status(201).json({ id: fb.id, message: 'Thank you for your feedback' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SERVICE CATEGORIES PRESETS =====
router.get("/categories", authenticateToken, requirePermission("canViewServiceBusiness"), async (req, res) => {
  try {
    const { getDefaultCategoryDefinitionsForBusinessType } = await import("../src/utils/categoryDefaults.js");
    const businessType = req.query.businessType || 'service';
    const categories = getDefaultCategoryDefinitionsForBusinessType(businessType).filter(category => category.categoryType === 'service');
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
