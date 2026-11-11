import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../src/db.js';
import { authenticateToken, requireAnyPermission, requirePermission, requireTenant } from '../middleware/auth.js';
import { hasFeatureAccess, requireAllFeatures, requireFeature } from '../middleware/featureCheck.js';

const router = Router();
const tenantId = req => req.user.tenantId || req.user.tenant_id || req.user.business_id;
const id = () => randomUUID();
const text = value => String(value ?? '').trim();
const fail = (res, error, fallback) => {
  console.error(fallback, error?.code || error?.message || error);
  return res.status(error?.statusCode || 500).json({ error: error?.statusCode ? error.message : fallback });
};

router.use(authenticateToken, requireTenant, requireFeature('pharmacy_management'));

router.get('/dashboard', requirePermission('canViewPharmacy'), async (req, res) => {
  try {
    const tenant = tenantId(req);
    const canSeePrescriptionQueue = Boolean(req.userPermissions?.canViewPharmacyPrescriptions || req.userPermissions?.canDispensePharmacyPrescriptions || req.user?.permissions?.includes?.('canViewPharmacyPrescriptions') || req.user?.permissions?.includes?.('canDispensePharmacyPrescriptions'));
    const [batchSummary, expiry, prescriptions, dispenses] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*)::int AS batches, COALESCE(SUM("quantityRemaining"), 0)::float AS units FROM pharmacy_batches WHERE "tenantId" = ${tenant} AND status = 'active' AND "quantityRemaining" > 0`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM pharmacy_batches WHERE "tenantId" = ${tenant} AND status = 'active' AND "quantityRemaining" > 0 AND "expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
      hasFeatureAccess(req.tenantFeatures || new Set(), 'clinic_management') && canSeePrescriptionQueue
        ? prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM clinic_prescriptions WHERE "tenantId" = ${tenant} AND status IN ('open', 'partially_dispensed')`
        : Promise.resolve([{ count: 0 }]),
      prisma.$queryRaw`SELECT ((SELECT COUNT(*) FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenant} AND outcome = 'dispensed' AND "createdAt" >= CURRENT_DATE) + (SELECT COUNT(*) FROM pharmacy_dispenses WHERE "tenantId" = ${tenant} AND "dispensedAt" >= CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM clinic_prescription_fulfillments f WHERE f."prescriptionId" = pharmacy_dispenses."prescriptionId")))::int AS count`,
    ]);
    res.json({ batches: batchSummary[0]?.batches || 0, batchUnits: batchSummary[0]?.units || 0, expiringWithin90Days: expiry[0]?.count || 0, prescriptionsToDispense: prescriptions[0]?.count || 0, dispensedToday: dispenses[0]?.count || 0 });
  } catch (error) { fail(res, error, 'Could not load pharmacy summary.'); }
});

router.get('/reports', requirePermission('canViewPharmacyReports'), async (req, res) => {
  try {
    const tenant = tenantId(req);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date('1970-01-01T00:00:00.000Z');
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? new Date(`${req.query.to}T00:00:00.000Z`) : new Date('2100-01-01T00:00:00.000Z');
    to.setUTCDate(to.getUTCDate() + 1);
    const [batchSummary, expiry, fulfillmentOutcomes, fulfilledProducts] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS batches, COALESCE(SUM("quantityRemaining") FILTER (WHERE status = 'active'), 0)::numeric AS units FROM pharmacy_batches WHERE "tenantId" = ${tenant}`,
      prisma.$queryRaw`SELECT COUNT(*) FILTER (WHERE "expiryDate" < CURRENT_DATE)::int AS expired, COUNT(*) FILTER (WHERE "expiryDate" >= CURRENT_DATE AND "expiryDate" < CURRENT_DATE + INTERVAL '90 days')::int AS "expiringSoon" FROM pharmacy_batches WHERE "tenantId" = ${tenant} AND status = 'active'`,
      prisma.$queryRaw`SELECT outcome, COUNT(*)::int AS count, COALESCE(SUM("quantityDispensed"), 0)::numeric AS quantity FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenant} AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY outcome ORDER BY outcome`,
      prisma.$queryRaw`SELECT p.name AS "medicine", COALESCE(SUM(f."quantityDispensed"), 0)::numeric AS quantity FROM clinic_prescription_fulfillments f JOIN products p ON p.id = f."productId" WHERE f."tenantId" = ${tenant} AND f."createdAt" >= ${from} AND f."createdAt" < ${to} AND f.outcome = 'dispensed' GROUP BY p.name ORDER BY quantity DESC LIMIT 20`,
    ]);
    res.json({ summary: { activeBatches: batchSummary[0]?.batches || 0, batchUnits: batchSummary[0]?.units || 0, expiredBatches: expiry[0]?.expired || 0, expiringSoon: expiry[0]?.expiringSoon || 0, fulfillmentEvents: fulfillmentOutcomes.reduce((sum, row) => sum + Number(row.count || 0), 0) }, fulfillmentOutcomes, fulfilledProducts, period: { from: req.query.from || null, to: req.query.to || null } });
  } catch (error) { fail(res, error, 'Could not load pharmacy reports.'); }
});

router.get('/catalogue', requireAnyPermission(['canViewPharmacyCatalogue', 'canCreatePharmacyCatalogue', 'canEditPharmacyCatalogue', 'canViewPharmacyBatches', 'canCreatePharmacyBatches']), async (req, res) => {
  try {
    const medicines = await prisma.$queryRaw`SELECT c.id AS "catalogueId", c."productId", c."activeIngredient", c.strength, c."dosageForm", c.manufacturer, c."prescriptionRequired", c."controlledClass", p.name, p.sku, p.barcode, p.quantity, p.price, p.cost, p."baseUnit", p."branchId", cat.name AS "categoryName" FROM pharmacy_catalogue c JOIN products p ON p.id = c."productId" LEFT JOIN categories cat ON cat.id = p."categoryId" WHERE c."tenantId" = ${tenantId(req)} AND p."tenantId" = ${tenantId(req)} AND p."isActive" = TRUE ORDER BY p.name ASC LIMIT 2000`;
    res.json({ medicines });
  } catch (error) { fail(res, error, 'Could not load pharmacy medicines.'); }
});

router.post('/catalogue', requirePermission('canCreatePharmacyCatalogue'), async (req, res) => {
  const productId = text(req.body.productId);
  if (!productId) return res.status(400).json({ error: 'Select an existing inventory product to add to the medicine catalogue.' });
  try {
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenantId(req), isActive: true, itemType: 'product' }, select: { id: true } });
    if (!product) return res.status(404).json({ error: 'Select an active product from this business inventory.' });
    const existing = await prisma.$queryRaw`SELECT id FROM pharmacy_catalogue WHERE "tenantId" = ${tenantId(req)} AND "productId" = ${productId}`;
    if (existing.length) return res.status(409).json({ error: 'This inventory product is already in the pharmacy catalogue. Edit its details instead.' });
    const catalogueId = id();
    await prisma.$executeRaw`INSERT INTO pharmacy_catalogue (id, "tenantId", "productId", "activeIngredient", strength, "dosageForm", manufacturer, "prescriptionRequired", "controlledClass", notes) VALUES (${catalogueId}, ${tenantId(req)}, ${productId}, ${text(req.body.activeIngredient) || null}, ${text(req.body.strength) || null}, ${text(req.body.dosageForm) || null}, ${text(req.body.manufacturer) || null}, ${req.body.prescriptionRequired !== false}, ${text(req.body.controlledClass) || null}, ${text(req.body.notes) || null})`;
    res.status(201).json({ id: catalogueId, message: 'Medicine linked to shared inventory.' });
  } catch (error) { fail(res, error, 'Could not add medicine to the pharmacy catalogue.'); }
});

router.get('/inventory-products', requireAnyPermission(['canCreatePharmacyCatalogue', 'canEditPharmacyCatalogue']), async (req, res) => {
  try {
    const products = await prisma.product.findMany({ where: { tenantId: tenantId(req), isActive: true, itemType: 'product' }, select: { id: true, name: true, sku: true, quantity: true, baseUnit: true }, orderBy: { name: 'asc' }, take: 2000 });
    res.json({ products });
  } catch (error) { fail(res, error, 'Could not load inventory products.'); }
});

router.patch('/catalogue/:productId', requirePermission('canEditPharmacyCatalogue'), async (req, res) => {
  try {
    const result = await prisma.$executeRaw`UPDATE pharmacy_catalogue SET "activeIngredient" = COALESCE(${req.body.activeIngredient === undefined ? null : text(req.body.activeIngredient)}, "activeIngredient"), strength = COALESCE(${req.body.strength === undefined ? null : text(req.body.strength)}, strength), "dosageForm" = COALESCE(${req.body.dosageForm === undefined ? null : text(req.body.dosageForm)}, "dosageForm"), manufacturer = COALESCE(${req.body.manufacturer === undefined ? null : text(req.body.manufacturer)}, manufacturer), "prescriptionRequired" = COALESCE(${req.body.prescriptionRequired === undefined ? null : Boolean(req.body.prescriptionRequired)}, "prescriptionRequired"), "controlledClass" = COALESCE(${req.body.controlledClass === undefined ? null : text(req.body.controlledClass)}, "controlledClass"), notes = COALESCE(${req.body.notes === undefined ? null : text(req.body.notes)}, notes), "updatedAt" = NOW() WHERE "tenantId" = ${tenantId(req)} AND "productId" = ${req.params.productId}`;
    if (!result) return res.status(404).json({ error: 'Medicine not found in the pharmacy catalogue.' });
    res.json({ message: 'Pharmacy medicine details updated.' });
  } catch (error) { fail(res, error, 'Could not update pharmacy medicine details.'); }
});

router.get('/batches', requireAnyPermission(['canViewPharmacyBatches', 'canCreatePharmacyBatches']), async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`SELECT b.*, p.name AS "productName", p.sku, br.name AS "branchName" FROM pharmacy_batches b JOIN products p ON p.id = b."productId" LEFT JOIN branches br ON br.id = b."branchId" WHERE b."tenantId" = ${tenantId(req)} ORDER BY b."expiryDate" ASC NULLS LAST, b."createdAt" DESC LIMIT 2000`;
    res.json({ batches: rows });
  } catch (error) { fail(res, error, 'Could not load medicine batches.'); }
});

router.post('/batches', requirePermission('canCreatePharmacyBatches'), async (req, res) => {
  const productId = text(req.body.productId);
  const batchNumber = text(req.body.batchNumber);
  const quantity = Number(req.body.quantity);
  const branchId = text(req.body.branchId) || req.user.branchId || req.user.branch_id || null;
  if (!productId || !batchNumber || !Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Medicine, batch number, and a positive batch quantity are required.' });
  const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) return res.status(400).json({ error: 'Enter a valid expiry date.' });
  if (expiryDate && expiryDate < new Date(new Date().setHours(0, 0, 0, 0))) return res.status(400).json({ error: 'An already expired batch cannot be added as available stock.' });
  try {
    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId: tenantId(req), isActive: true, itemType: 'product', ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}) }, select: { id: true, quantity: true } });
      if (!product) throw Object.assign(new Error('Choose an active inventory medicine belonging to this business and branch.'), { statusCode: 400 });
      const catalogue = await tx.$queryRaw`SELECT id FROM pharmacy_catalogue WHERE "tenantId" = ${tenantId(req)} AND "productId" = ${productId}`;
      if (!catalogue.length) throw Object.assign(new Error('Add this medicine to the Pharmacy Catalogue before registering batches.'), { statusCode: 400 });
      const existing = await tx.$queryRaw`SELECT COALESCE(SUM("quantityRemaining"), 0)::numeric AS quantity FROM pharmacy_batches WHERE "tenantId" = ${tenantId(req)} AND "productId" = ${productId} AND "branchId" IS NOT DISTINCT FROM ${branchId} AND status = 'active'`;
      const availableToAssign = Number(product.quantity) - Number(existing[0]?.quantity || 0);
      if (quantity > availableToAssign + 0.000001) throw Object.assign(new Error(`Only ${Math.max(availableToAssign, 0)} unassigned inventory units are available. Record stock through Inventory first, then allocate it to this batch.`), { statusCode: 409 });
      const duplicate = await tx.$queryRaw`SELECT id FROM pharmacy_batches WHERE "tenantId" = ${tenantId(req)} AND "productId" = ${productId} AND "branchId" IS NOT DISTINCT FROM ${branchId} AND "batchNumber" = ${batchNumber}`;
      if (duplicate.length) throw Object.assign(new Error('That batch number already exists for this medicine and branch.'), { statusCode: 409 });
      const batchId = id();
      await tx.$executeRaw`INSERT INTO pharmacy_batches (id, "tenantId", "productId", "branchId", "batchNumber", "expiryDate", "quantityReceived", "quantityRemaining", "unitCost") VALUES (${batchId}, ${tenantId(req)}, ${productId}, ${branchId}, ${batchNumber}, ${expiryDate}, ${quantity}, ${quantity}, ${req.body.unitCost != null && Number(req.body.unitCost) >= 0 ? Number(req.body.unitCost) : null})`;
      return batchId;
    });
    res.status(201).json({ id: result, message: 'Existing inventory allocated to a traceable batch. Stock and accounting balances were not changed.' });
  } catch (error) { fail(res, error, 'Could not register medicine batch.'); }
});

router.get('/prescriptions', requireAllFeatures('clinic_management', 'pharmacy_management'), requireAnyPermission(['canViewPharmacyPrescriptions', 'canDispensePharmacyPrescriptions']), async (req, res) => {
  try {
    const prescriptions = await prisma.$queryRaw`SELECT r.id, r.reference, c.name AS "patientName", r.status, r."createdAt" FROM clinic_prescriptions r JOIN customers c ON c.id = r."customerId" WHERE r."tenantId" = ${tenantId(req)} ORDER BY CASE WHEN r.status IN ('open', 'partially_dispensed') THEN 0 ELSE 1 END, r."createdAt" DESC LIMIT 500`;
    const lines = await prisma.$queryRaw`SELECT i.id, i."prescriptionId", i."productId", i.quantity, i.dosage, i.frequency, i."durationDays", i.instructions, p.name AS "productName", p."baseUnit" FROM clinic_prescription_items i JOIN clinic_prescriptions r ON r.id = i."prescriptionId" JOIN products p ON p.id = i."productId" WHERE r."tenantId" = ${tenantId(req)} ORDER BY i.id`;
    const events = await prisma.$queryRaw`SELECT "prescriptionItemId", "quantityDispensed" FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenantId(req)}`;
    const legacy = await prisma.$queryRaw`SELECT d.id, d."prescriptionId", l."productId", SUM(l.quantity)::numeric AS quantity, d."dispensedAt" AS "createdAt" FROM pharmacy_dispenses d JOIN pharmacy_dispense_lines l ON l."dispenseId" = d.id WHERE d."tenantId" = ${tenantId(req)} AND NOT EXISTS (SELECT 1 FROM clinic_prescription_fulfillments f WHERE f."prescriptionId" = d."prescriptionId") GROUP BY d.id, d."prescriptionId", l."productId", d."dispensedAt"`;
    const prescriptionsWithItems = prescriptions.map(p => {
      const legacyByProduct = new Map();
      legacy.filter(event => event.prescriptionId === p.id).forEach(event => legacyByProduct.set(event.productId, Number(legacyByProduct.get(event.productId) || 0) + Number(event.quantity || 0)));
      const items = lines.filter(line => line.prescriptionId === p.id).map(item => {
        const posted = events.filter(event => event.prescriptionItemId === item.id).reduce((sum, event) => sum + Number(event.quantityDispensed || 0), 0);
        const legacyRemaining = Number(legacyByProduct.get(item.productId) || 0);
        const legacyApplied = Math.min(Math.max(Number(item.quantity) - posted, 0), legacyRemaining);
        legacyByProduct.set(item.productId, legacyRemaining - legacyApplied);
        const dispensedQuantity = posted + legacyApplied;
        return { ...item, dispensedQuantity, remainingQuantity: Math.max(Number(item.quantity) - dispensedQuantity, 0) };
      });
      return { ...p, items };
    });
    res.json({ prescriptions: prescriptionsWithItems });
  } catch (error) { fail(res, error, 'Could not load pharmacy prescriptions.'); }
});

router.get('/prescriptions/:id/sale-context', requireAllFeatures('clinic_management', 'pharmacy_management'), requirePermission('canDispensePharmacyPrescriptions'), async (req, res) => {
  try {
    const tenant = tenantId(req);
    const rows = await prisma.$queryRaw`SELECT r.id, r.reference, c.name AS "patientName", r.status FROM clinic_prescriptions r JOIN customers c ON c.id = r."customerId" WHERE r.id = ${req.params.id} AND r."tenantId" = ${tenant}`;
    const prescription = rows[0];
    if (!prescription) return res.status(404).json({ error: 'Prescription not found.' });
    if (!['open', 'partially_dispensed'].includes(prescription.status)) return res.status(409).json({ error: 'This prescription is no longer open for a sale.' });
    const lines = await prisma.$queryRaw`SELECT i.id AS "prescriptionItemId", i."productId", i.quantity, i.dosage, i.frequency, i."durationDays", i.instructions, p.name AS "productName", p."baseUnit" FROM clinic_prescription_items i JOIN products p ON p.id = i."productId" WHERE i."prescriptionId" = ${prescription.id}`;
    const fulfillment = await prisma.$queryRaw`SELECT "prescriptionItemId", SUM("quantityDispensed")::numeric AS quantity FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenant} AND "prescriptionId" = ${prescription.id} GROUP BY "prescriptionItemId"`;
    const legacy = await prisma.$queryRaw`SELECT l."productId", SUM(l.quantity)::numeric AS quantity FROM pharmacy_dispenses d JOIN pharmacy_dispense_lines l ON l."dispenseId" = d.id WHERE d."tenantId" = ${tenant} AND d."prescriptionId" = ${prescription.id} AND NOT EXISTS (SELECT 1 FROM clinic_prescription_fulfillments f WHERE f."prescriptionId" = d."prescriptionId") GROUP BY l."productId"`;
    const dispensedByLine = new Map(fulfillment.map(row => [row.prescriptionItemId, Number(row.quantity || 0)]));
    const legacyByProduct = new Map(legacy.map(row => [row.productId, Number(row.quantity || 0)]));
    const saleLines = lines.map(line => {
      const recorded = Number(dispensedByLine.get(line.prescriptionItemId) || 0);
      const legacyRemaining = Number(legacyByProduct.get(line.productId) || 0);
      const legacyTake = Math.min(Math.max(Number(line.quantity) - recorded, 0), legacyRemaining);
      if (legacyTake > 0) legacyByProduct.set(line.productId, legacyRemaining - legacyTake);
      return { ...line, remainingQuantity: Math.max(Number(line.quantity) - recorded - legacyTake, 0) };
    }).filter(line => line.remainingQuantity > 0);
    res.json({ prescription: { id: prescription.id, reference: prescription.reference, patientName: prescription.patientName, items: saleLines } });
  } catch (error) { fail(res, error, 'Could not prepare this prescription for sale.'); }
});

router.get('/sale-options', requireAllFeatures('clinic_management', 'pharmacy_management'), requirePermission('canDispensePharmacyPrescriptions'), async (req, res) => {
  const patientId = text(req.query.patientId);
  if (!patientId) return res.status(400).json({ error: 'Select a patient before loading eligible receipts.' });
  try {
    const patient = await prisma.customer.findFirst({ where: { id: patientId, tenantId: tenantId(req) }, select: { id: true, name: true } });
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });
    const options = await prisma.$queryRaw`SELECT id, "receiptNo", "customerName", "createdAt", total, 'cash_sale'::text AS "sourceType" FROM sales WHERE "tenantId" = ${tenantId(req)} AND status = 'completed' AND LOWER(TRIM(COALESCE("customerName", ''))) = LOWER(TRIM(${patient.name})) UNION ALL SELECT s.id, s."receiptNo", c.name AS "customerName", s."createdAt", s.total, 'credit_sale'::text AS "sourceType" FROM sale_records s JOIN customers c ON c.id = s."customerId" WHERE s."tenantId" = ${tenantId(req)} AND s.status = 'completed' AND s."customerId" = ${patientId} ORDER BY "createdAt" DESC LIMIT 300`;
    res.json({ sales: options });
  } catch (error) { fail(res, error, 'Could not load eligible sales for this patient.'); }
});

router.post('/prescriptions/:id/fulfillments', requireAllFeatures('clinic_management', 'pharmacy_management'), requirePermission('canDispensePharmacyPrescriptions'), async (req, res) => {
  const submitted = Array.isArray(req.body.items) ? req.body.items : [];
  const saleId = text(req.body.saleId) || null;
  const saleRecordId = text(req.body.saleRecordId) || null;
  const tenant = tenantId(req);
  if (!submitted.length) return res.status(400).json({ error: 'Record at least one medicine as dispensed or not supplied.' });
  if (Boolean(saleId) === Boolean(saleRecordId) && submitted.some(item => Number(item.quantityDispensed) > 0)) return res.status(400).json({ error: 'Select exactly one completed receipt when any medicine is dispensed.' });
  try {
    const result = await prisma.$transaction(async tx => {
      const rxRows = await tx.$queryRaw`SELECT * FROM clinic_prescriptions WHERE id = ${req.params.id} AND "tenantId" = ${tenant} FOR UPDATE`;
      const prescription = rxRows[0];
      if (!prescription) throw Object.assign(new Error('Prescription not found.'), { statusCode: 404 });
      if (!['open', 'partially_dispensed'].includes(prescription.status)) throw Object.assign(new Error('This prescription is already closed.'), { statusCode: 409 });
      const lines = await tx.$queryRaw`SELECT * FROM clinic_prescription_items WHERE "prescriptionId" = ${prescription.id}`;
      const lineById = new Map(lines.map(line => [line.id, line]));
      const currentEvents = await tx.$queryRaw`SELECT * FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenant} AND "prescriptionId" = ${prescription.id}`;
      const patient = await tx.customer.findFirst({ where: { id: prescription.customerId, tenantId: tenant }, select: { id: true, name: true } });
      if (!patient) throw Object.assign(new Error('The patient linked to this prescription was not found.'), { statusCode: 404 });

      let sale = null;
      if (saleId) {
        const locked = await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} AND "tenantId" = ${tenant} FOR UPDATE`;
        sale = locked.length ? await tx.sale.findFirst({ where: { id: saleId, tenantId: tenant, status: 'completed' }, include: { items: true } }) : null;
        if (!sale || String(sale.customerName || '').trim().toLowerCase() !== String(patient.name || '').trim().toLowerCase()) throw Object.assign(new Error('Choose a completed POS receipt for this patient.'), { statusCode: 409 });
      } else if (saleRecordId) {
        const locked = await tx.$queryRaw`SELECT id FROM sale_records WHERE id = ${saleRecordId} AND "tenantId" = ${tenant} FOR UPDATE`;
        sale = locked.length ? await tx.saleRecord.findFirst({ where: { id: saleRecordId, tenantId: tenant, customerId: patient.id, status: 'completed' }, include: { items: true } }) : null;
        if (!sale) throw Object.assign(new Error('Choose a completed credit sale for this patient.'), { statusCode: 409 });
      }

      const requestedByProduct = new Map();
      const seenPrescriptionItems = new Set();
      const normalized = submitted.map(input => {
        const line = lineById.get(text(input.prescriptionItemId));
        if (!line) throw Object.assign(new Error('A medicine line does not belong to this prescription.'), { statusCode: 400 });
        if (seenPrescriptionItems.has(line.id)) throw Object.assign(new Error('Submit each prescribed medicine line only once per fulfillment.'), { statusCode: 400 });
        seenPrescriptionItems.add(line.id);
        const quantity = Number(input.quantityDispensed || 0);
        const outcome = text(input.outcome || (quantity > 0 ? 'dispensed' : 'not_available'));
        const reason = text(input.reason) || null;
        if (!Number.isFinite(quantity) || quantity < 0 || !['dispensed', 'not_available', 'patient_declined', 'other'].includes(outcome)) throw Object.assign(new Error('Enter a valid quantity and supply outcome for every medicine.'), { statusCode: 400 });
        if ((quantity > 0) !== (outcome === 'dispensed')) throw Object.assign(new Error('A supplied quantity must use “dispensed”; unsupplied lines must use a reasoned outcome.'), { statusCode: 400 });
        if (quantity <= 0 && !reason) throw Object.assign(new Error('Explain why a medicine was not supplied.'), { statusCode: 400 });
        const previous = currentEvents.filter(event => event.prescriptionItemId === line.id).reduce((sum, event) => sum + Number(event.quantityDispensed), 0);
        if (previous >= Number(line.quantity) - 0.000001) throw Object.assign(new Error('This medicine line has already been fully supplied.'), { statusCode: 409 });
        if (currentEvents.some(event => event.prescriptionItemId === line.id && ['not_available', 'patient_declined', 'other'].includes(event.outcome))) throw Object.assign(new Error('This medicine line was already closed with a non-supply outcome.'), { statusCode: 409 });
        if (quantity > Number(line.quantity) - previous + 0.000001) throw Object.assign(new Error(`Dispensed quantity exceeds the remaining prescription quantity for item ${line.id}.`), { statusCode: 409 });
        if (quantity > 0) requestedByProduct.set(line.productId, (requestedByProduct.get(line.productId) || 0) + quantity);
        return { line, quantity, outcome, reason };
      });

      if (requestedByProduct.size && !sale) throw Object.assign(new Error('A completed POS or credit-sale receipt is required for supplied medicines.'), { statusCode: 400 });
      if (sale) {
        for (const [productId, requestedQty] of requestedByProduct) {
          const soldQty = sale.items.filter(item => item.productId === productId).reduce((sum, item) => sum + Number(item.quantity) * Number(item.conversionFactor || 1), 0);
          const alreadyLinked = await tx.$queryRaw`SELECT COALESCE(SUM("quantityDispensed"), 0)::numeric AS qty FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenant} AND "productId" = ${productId} AND ("saleId" = ${saleId} OR "saleRecordId" = ${saleRecordId})`;
          const legacyLinked = saleId
            ? await tx.$queryRaw`SELECT COALESCE(SUM(l.quantity), 0)::numeric AS qty FROM pharmacy_dispenses d JOIN pharmacy_dispense_lines l ON l."dispenseId" = d.id WHERE d."tenantId" = ${tenant} AND d."saleId" = ${saleId} AND l."productId" = ${productId}`
            : await tx.$queryRaw`SELECT COALESCE(SUM(l.quantity), 0)::numeric AS qty FROM pharmacy_dispenses d JOIN pharmacy_dispense_lines l ON l."dispenseId" = d.id WHERE d."tenantId" = ${tenant} AND d."saleRecordId" = ${saleRecordId} AND l."productId" = ${productId}`;
          if (Number(alreadyLinked[0]?.qty || 0) + Number(legacyLinked[0]?.qty || 0) + requestedQty > soldQty + 0.000001) throw Object.assign(new Error('This receipt does not have enough unallocated medicine quantity to cover this dispense.'), { statusCode: 409 });
        }
      }

      for (const entry of normalized) {
        if (entry.quantity <= 0) {
          await tx.$executeRaw`INSERT INTO clinic_prescription_fulfillments (id, "tenantId", "prescriptionId", "prescriptionItemId", "productId", "quantityDispensed", outcome, reason, "dispensedByUserId") VALUES (${id()}, ${tenant}, ${prescription.id}, ${entry.line.id}, ${entry.line.productId}, 0, ${entry.outcome}, ${entry.reason}, ${req.user.id})`;
          continue;
        }
        const allocations = saleId
          ? await tx.$queryRaw`SELECT a."batchId", a.quantity, b."expiryDate" FROM pharmacy_sale_batch_allocations a JOIN pharmacy_batches b ON b.id = a."batchId" WHERE a."tenantId" = ${tenant} AND a."productId" = ${entry.line.productId} AND a."saleId" = ${saleId} ORDER BY b."expiryDate" ASC NULLS LAST, a."createdAt" ASC`
          : await tx.$queryRaw`SELECT a."batchId", a.quantity, b."expiryDate" FROM pharmacy_sale_batch_allocations a JOIN pharmacy_batches b ON b.id = a."batchId" WHERE a."tenantId" = ${tenant} AND a."productId" = ${entry.line.productId} AND a."saleRecordId" = ${saleRecordId} ORDER BY b."expiryDate" ASC NULLS LAST, a."createdAt" ASC`;
        if (allocations.length) {
          const prior = await tx.$queryRaw`SELECT COALESCE(SUM("quantityDispensed"), 0)::numeric AS qty FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenant} AND "productId" = ${entry.line.productId} AND ("saleId" = ${saleId} OR "saleRecordId" = ${saleRecordId})`;
          let remaining = entry.quantity;
          let priorQty = Number(prior[0]?.qty || 0);
          for (const batch of allocations) {
            if (priorQty >= Number(batch.quantity)) { priorQty -= Number(batch.quantity); continue; }
            const available = Number(batch.quantity) - priorQty;
            priorQty = 0;
            if (batch.expiryDate && new Date(batch.expiryDate) < new Date(new Date().setHours(0, 0, 0, 0))) throw Object.assign(new Error('The linked receipt contains expired batch stock; resolve that sale before dispensing.'), { statusCode: 409 });
            const take = Math.min(available, remaining);
            if (take > 0) await tx.$executeRaw`INSERT INTO clinic_prescription_fulfillments (id, "tenantId", "prescriptionId", "prescriptionItemId", "productId", "quantityDispensed", outcome, reason, "saleId", "saleRecordId", "batchId", "dispensedByUserId") VALUES (${id()}, ${tenant}, ${prescription.id}, ${entry.line.id}, ${entry.line.productId}, ${take}, 'dispensed', ${entry.reason}, ${saleId}, ${saleRecordId}, ${batch.batchId}, ${req.user.id})`;
            remaining -= take;
            if (remaining <= 0.000001) break;
          }
          if (remaining > 0.000001) throw Object.assign(new Error('The receipt’s recorded batch allocation cannot cover this medicine. Do not create another sale; review stock lots.'), { statusCode: 409 });
        } else {
          await tx.$executeRaw`INSERT INTO clinic_prescription_fulfillments (id, "tenantId", "prescriptionId", "prescriptionItemId", "productId", "quantityDispensed", outcome, reason, "saleId", "saleRecordId", "dispensedByUserId") VALUES (${id()}, ${tenant}, ${prescription.id}, ${entry.line.id}, ${entry.line.productId}, ${entry.quantity}, 'dispensed', ${entry.reason}, ${saleId}, ${saleRecordId}, ${req.user.id})`;
        }
      }

      const allEvents = await tx.$queryRaw`SELECT * FROM clinic_prescription_fulfillments WHERE "tenantId" = ${tenant} AND "prescriptionId" = ${prescription.id}`;
      const fullySupplied = lines.every(line => allEvents.filter(event => event.prescriptionItemId === line.id).reduce((sum, event) => sum + Number(event.quantityDispensed), 0) >= Number(line.quantity) - 0.000001);
      const closedWithOmissions = lines.every(line => {
        const history = allEvents.filter(event => event.prescriptionItemId === line.id);
        const supplied = history.reduce((sum, event) => sum + Number(event.quantityDispensed), 0);
        return supplied >= Number(line.quantity) - 0.000001 || history.some(event => ['not_available', 'patient_declined', 'other'].includes(event.outcome));
      });
      const status = fullySupplied ? 'dispensed' : closedWithOmissions ? 'completed_with_omissions' : allEvents.some(event => Number(event.quantityDispensed) > 0) ? 'partially_dispensed' : 'open';
      await tx.$executeRaw`UPDATE clinic_prescriptions SET status = ${status} WHERE id = ${prescription.id} AND "tenantId" = ${tenant}`;
      return { status, receiptNo: sale?.receiptNo || null };
    });
    res.status(201).json({ ...result, message: 'Prescription fulfillment recorded and shared with the clinic patient record.' });
  } catch (error) { fail(res, error, 'Could not record prescription fulfillment.'); }
});

router.post('/prescriptions/:id/dispense', requireAllFeatures('clinic_management', 'pharmacy_management'), requirePermission('canDispensePharmacyPrescriptions'), async (req, res) => {
  const saleId = text(req.body.saleId) || null;
  const saleRecordId = text(req.body.saleRecordId) || null;
  if (Boolean(saleId) === Boolean(saleRecordId)) return res.status(400).json({ error: 'Select one completed POS receipt or credit sale to finalize dispensing.' });
  try {
    const prescription = await prisma.$queryRaw`SELECT * FROM clinic_prescriptions WHERE id = ${req.params.id} AND "tenantId" = ${tenantId(req)} AND status = 'open'`;
    if (!prescription.length) return res.status(404).json({ error: 'Open prescription not found.' });
    const prescriptionItems = await prisma.$queryRaw`SELECT * FROM clinic_prescription_items WHERE "prescriptionId" = ${req.params.id}`;
    const patient = await prisma.customer.findFirst({ where: { id: prescription[0].customerId, tenantId: tenantId(req) }, select: { id: true, name: true } });
    const sale = saleId
      ? await prisma.sale.findFirst({ where: { id: saleId, tenantId: tenantId(req), status: 'completed' }, include: { items: true } })
      : await prisma.saleRecord.findFirst({ where: { id: saleRecordId, tenantId: tenantId(req), customerId: prescription[0].customerId, status: 'completed' }, include: { items: true } });
    if (!sale) return res.status(404).json({ error: 'Choose a completed sale from this business.' });
    if (saleId && String(sale.customerName || '').trim().toLowerCase() !== String(patient?.name || '').trim().toLowerCase()) return res.status(409).json({ error: 'The POS receipt customer does not match the patient on this prescription.' });

    const required = new Map(prescriptionItems.map(item => [item.productId, Number(item.quantity)]));
    for (const [productId, qty] of required) {
      const sold = sale.items.filter(item => item.productId === productId).reduce((sum, item) => sum + Number(item.quantity) * Number(item.conversionFactor || 1), 0);
      if (sold + 0.000001 < qty) return res.status(409).json({ error: 'The selected sale does not include the prescribed medicines and quantities.' });
    }

    const dispenseId = id();
    await prisma.$transaction(async tx => {
      const already = await tx.$queryRaw`SELECT id FROM pharmacy_dispenses WHERE "prescriptionId" = ${req.params.id} OR (${saleId}::text IS NOT NULL AND "saleId" = ${saleId}) OR (${saleRecordId}::text IS NOT NULL AND "saleRecordId" = ${saleRecordId})`;
      if (already.length) throw Object.assign(new Error('This prescription or sale has already been linked to a dispense.'), { statusCode: 409 });
      for (const [productId, requiredQty] of required) {
        let remaining = requiredQty;
        const allocations = await tx.$queryRaw`SELECT a."batchId", a.quantity, b."expiryDate" FROM pharmacy_sale_batch_allocations a JOIN pharmacy_batches b ON b.id = a."batchId" WHERE a."tenantId" = ${tenantId(req)} AND a."productId" = ${productId} AND a."saleId" IS NOT DISTINCT FROM ${saleId} AND a."saleRecordId" IS NOT DISTINCT FROM ${saleRecordId} ORDER BY b."expiryDate" ASC NULLS LAST, a."createdAt" ASC`;
        const allocated = allocations.reduce((sum, row) => sum + Number(row.quantity), 0);
        if (allocated + 0.000001 < requiredQty) throw Object.assign(new Error('This sale has no sufficient recorded batch allocation for the prescribed quantity. Complete a correctly batched sale before dispensing.'), { statusCode: 409 });
        for (const batch of allocations) {
          if (remaining <= 0.000001) break;
          if (batch.expiryDate && new Date(batch.expiryDate) < new Date(new Date().setHours(0, 0, 0, 0))) throw Object.assign(new Error('The linked sale includes expired batch stock; do not dispense. Resolve the sale and batch records first.'), { statusCode: 409 });
          const take = Math.min(Number(batch.quantity), remaining);
          await tx.$executeRaw`INSERT INTO pharmacy_dispense_lines (id, "dispenseId", "batchId", "productId", quantity) VALUES (${id()}, ${dispenseId}, ${batch.batchId}, ${productId}, ${take})`;
          remaining -= take;
        }
        if (remaining > 0.000001) throw Object.assign(new Error('The recorded batch allocation could not cover the dispensed quantity. Do not repeat the sale.'), { statusCode: 409 });
      }
      await tx.$executeRaw`INSERT INTO pharmacy_dispenses (id, "tenantId", "prescriptionId", "saleId", "saleRecordId", "customerId", "dispensedByUserId") VALUES (${dispenseId}, ${tenantId(req)}, ${req.params.id}, ${saleId}, ${saleRecordId}, ${prescription[0].customerId}, ${req.user.id})`;
      await tx.$executeRaw`UPDATE clinic_prescriptions SET status = 'dispensed' WHERE id = ${req.params.id} AND "tenantId" = ${tenantId(req)} AND status = 'open'`;
    });
    res.status(201).json({ id: dispenseId, saleId, saleRecordId, receiptNo: sale.receiptNo, message: 'Dispense recorded against the completed sale. Sale accounting was posted by the standard Sales or Receivables workflow.' });
  } catch (error) { fail(res, error, 'Could not finalize pharmacy dispense.'); }
});

router.get('/dispenses', requireAllFeatures('clinic_management', 'pharmacy_management'), requirePermission('canViewPharmacyDispenses'), async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`SELECT f.id, f."createdAt" AS "dispensedAt", f.outcome, f.reason, f."quantityDispensed" AS quantity, r.reference AS "prescriptionReference", c.name AS "patientName", COALESCE(s."receiptNo", cr."receiptNo") AS "receiptNo", p.name AS "productName", CONCAT_WS(' ', u.fname, u.lname) AS "pharmacistName" FROM clinic_prescription_fulfillments f JOIN clinic_prescriptions r ON r.id = f."prescriptionId" JOIN clinic_prescription_items i ON i.id = f."prescriptionItemId" JOIN products p ON p.id = i."productId" JOIN customers c ON c.id = r."customerId" LEFT JOIN sales s ON s.id = f."saleId" LEFT JOIN sale_records cr ON cr.id = f."saleRecordId" LEFT JOIN users u ON u.id = f."dispensedByUserId" WHERE f."tenantId" = ${tenantId(req)} UNION ALL SELECT d.id || ':' || l.id AS id, d."dispensedAt", 'dispensed'::text AS outcome, NULL::text AS reason, l.quantity, r.reference AS "prescriptionReference", c.name AS "patientName", COALESCE(s."receiptNo", cr."receiptNo") AS "receiptNo", p.name AS "productName", CONCAT_WS(' ', u.fname, u.lname) AS "pharmacistName" FROM pharmacy_dispenses d JOIN pharmacy_dispense_lines l ON l."dispenseId" = d.id JOIN clinic_prescriptions r ON r.id = d."prescriptionId" JOIN products p ON p.id = l."productId" JOIN customers c ON c.id = d."customerId" LEFT JOIN sales s ON s.id = d."saleId" LEFT JOIN sale_records cr ON cr.id = d."saleRecordId" LEFT JOIN users u ON u.id = d."dispensedByUserId" WHERE d."tenantId" = ${tenantId(req)} AND NOT EXISTS (SELECT 1 FROM clinic_prescription_fulfillments f WHERE f."prescriptionId" = d."prescriptionId") ORDER BY "dispensedAt" DESC LIMIT 1000`;
    res.json({ dispenses: rows });
  } catch (error) { fail(res, error, 'Could not load pharmacy dispense history.'); }
});

export default router;
