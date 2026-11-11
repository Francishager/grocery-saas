import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../src/db.js';
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureCheck.js';

const router = Router();
const tenantId = req => req.user.tenantId || req.user.tenant_id || req.user.business_id;
const id = () => randomUUID();
const text = value => String(value ?? '').trim();
const fail = (res, error, fallback) => {
  console.error(fallback, error?.code || error?.message || error);
  return res.status(error?.statusCode || 500).json({ error: error?.statusCode ? error.message : fallback });
};

router.use(authenticateToken, requireTenant, requireFeature('clinic_management'));

router.get('/dashboard', requirePermission('canViewClinic'), async (req, res) => {
  try {
    const tenant = tenantId(req);
    const [patients, appointments, encounters, prescriptions] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM clinic_patient_profiles WHERE "tenantId" = ${tenant}`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM clinic_appointments WHERE "tenantId" = ${tenant} AND status = 'scheduled' AND "startsAt" >= CURRENT_DATE AND "startsAt" < CURRENT_DATE + INTERVAL '1 day'`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM clinic_encounters WHERE "tenantId" = ${tenant} AND "createdAt" >= CURRENT_DATE`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM clinic_prescriptions WHERE "tenantId" = ${tenant} AND status IN ('open', 'partially_dispensed')`,
    ]);
    res.json({ patients: patients[0]?.count || 0, appointmentsToday: appointments[0]?.count || 0, encountersToday: encounters[0]?.count || 0, openPrescriptions: prescriptions[0]?.count || 0 });
  } catch (error) { fail(res, error, 'Could not load clinic summary.'); }
});

router.get('/patients', requirePermission('canViewClinicPatients'), async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`SELECT p.id, p."customerId", p."medicalRecordNo", p."dateOfBirth", p.gender, p."bloodGroup", p.allergies, p."emergencyContact", p."emergencyPhone", p."createdAt", c.name, c.phone, c.email, c.address FROM clinic_patient_profiles p JOIN customers c ON c.id = p."customerId" WHERE p."tenantId" = ${tenantId(req)} ORDER BY c.name ASC LIMIT 1000`;
    res.json({ patients: rows });
  } catch (error) { fail(res, error, 'Could not load clinic patients.'); }
});

router.get('/patients/:customerId/medication-history', requirePermission('canViewClinicPrescriptions'), async (req, res) => {
  try {
    const tenant = tenantId(req);
    const patient = await prisma.$queryRaw`SELECT c.id, c.name, p."medicalRecordNo" FROM customers c JOIN clinic_patient_profiles p ON p."customerId" = c.id WHERE c.id = ${req.params.customerId} AND c."tenantId" = ${tenant} AND p."tenantId" = ${tenant}`;
    if (!patient.length) return res.status(404).json({ error: 'Clinic patient not found.' });
    const prescriptions = await prisma.$queryRaw`SELECT id, reference, status, "prescriberName", notes, "createdAt" FROM clinic_prescriptions WHERE "tenantId" = ${tenant} AND "customerId" = ${req.params.customerId} ORDER BY "createdAt" DESC`;
    const items = await prisma.$queryRaw`SELECT i.id, i."prescriptionId", i."productId", i.quantity, i.dosage, i.frequency, i."durationDays", i.instructions, p.name AS "productName", p."baseUnit" FROM clinic_prescription_items i JOIN clinic_prescriptions r ON r.id = i."prescriptionId" JOIN products p ON p.id = i."productId" WHERE r."tenantId" = ${tenant} AND r."customerId" = ${req.params.customerId} ORDER BY i.id`;
    const events = await prisma.$queryRaw`SELECT f.id, f."prescriptionId", f."prescriptionItemId", f."quantityDispensed", f.outcome, f.reason, f."createdAt", CONCAT_WS(' ', u.fname, u.lname) AS "pharmacistName" FROM clinic_prescription_fulfillments f LEFT JOIN users u ON u.id = f."dispensedByUserId" WHERE f."tenantId" = ${tenant} AND f."prescriptionId" IN (SELECT id FROM clinic_prescriptions WHERE "tenantId" = ${tenant} AND "customerId" = ${req.params.customerId}) ORDER BY f."createdAt"`;
    const legacy = await prisma.$queryRaw`SELECT d.id, d."prescriptionId", l."productId", SUM(l.quantity)::numeric AS quantity, d."dispensedAt" AS "createdAt", CONCAT_WS(' ', u.fname, u.lname) AS "pharmacistName" FROM pharmacy_dispenses d JOIN pharmacy_dispense_lines l ON l."dispenseId" = d.id LEFT JOIN users u ON u.id = d."dispensedByUserId" WHERE d."tenantId" = ${tenant} AND d."customerId" = ${req.params.customerId} AND NOT EXISTS (SELECT 1 FROM clinic_prescription_fulfillments f WHERE f."prescriptionId" = d."prescriptionId") GROUP BY d.id, d."prescriptionId", l."productId", d."dispensedAt", u.fname, u.lname`;
    const result = prescriptions.map(prescription => ({
      ...prescription,
      items: items.filter(item => item.prescriptionId === prescription.id).map(item => {
        const fulfillmentHistory = events.filter(event => event.prescriptionItemId === item.id);
        const legacyForItem = legacy.filter(event => event.prescriptionId === prescription.id && event.productId === item.productId);
        const dispensedQuantity = fulfillmentHistory.reduce((sum, event) => sum + Number(event.quantityDispensed), 0) + legacyForItem.reduce((sum, event) => sum + Number(event.quantity), 0);
        return { ...item, dispensedQuantity, remainingQuantity: Math.max(Number(item.quantity) - dispensedQuantity, 0), fulfillmentHistory, legacyDispenses: legacyForItem };
      }),
    }));
    res.json({ patient: patient[0], prescriptions: result });
  } catch (error) { fail(res, error, 'Could not load patient medication history.'); }
});

router.get('/catalogue', requirePermission('canManageClinicPrescriptions'), async (req, res) => {
  try {
    const medicines = await prisma.product.findMany({ where: { tenantId: tenantId(req), isActive: true, itemType: 'product' }, select: { id: true, name: true, sku: true, quantity: true, price: true, baseUnit: true, category: { select: { name: true } } }, orderBy: { name: 'asc' }, take: 2000 });
    res.json({ medicines });
  } catch (error) { fail(res, error, 'Could not load inventory items for prescriptions.'); }
});

router.patch('/patients/:customerId', requirePermission('canManageClinicPatients'), async (req, res) => {
  const name = req.body.name === undefined ? undefined : text(req.body.name);
  if (name !== undefined && !name) return res.status(400).json({ error: 'Patient name cannot be empty.' });
  try {
    const profile = await prisma.$queryRaw`SELECT id FROM clinic_patient_profiles WHERE "tenantId" = ${tenantId(req)} AND "customerId" = ${req.params.customerId}`;
    if (!profile.length) return res.status(404).json({ error: 'Clinic patient not found.' });
    await prisma.$transaction(async tx => {
      await tx.customer.updateMany({ where: { id: req.params.customerId, tenantId: tenantId(req) }, data: {
        ...(name !== undefined && { name }),
        ...(req.body.phone !== undefined && { phone: text(req.body.phone) || null }),
        ...(req.body.email !== undefined && { email: text(req.body.email) || null }),
        ...(req.body.address !== undefined && { address: text(req.body.address) || null }),
      } });
      await tx.$executeRaw`UPDATE clinic_patient_profiles SET "medicalRecordNo" = COALESCE(${req.body.medicalRecordNo === undefined ? null : text(req.body.medicalRecordNo)}, "medicalRecordNo"), "dateOfBirth" = COALESCE(${req.body.dateOfBirth === undefined ? null : req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null}, "dateOfBirth"), gender = COALESCE(${req.body.gender === undefined ? null : text(req.body.gender)}, gender), "bloodGroup" = COALESCE(${req.body.bloodGroup === undefined ? null : text(req.body.bloodGroup)}, "bloodGroup"), allergies = COALESCE(${req.body.allergies === undefined ? null : text(req.body.allergies)}, allergies), "emergencyContact" = COALESCE(${req.body.emergencyContact === undefined ? null : text(req.body.emergencyContact)}, "emergencyContact"), "emergencyPhone" = COALESCE(${req.body.emergencyPhone === undefined ? null : text(req.body.emergencyPhone)}, "emergencyPhone"), "updatedAt" = NOW() WHERE "tenantId" = ${tenantId(req)} AND "customerId" = ${req.params.customerId}`;
    });
    res.json({ message: 'Clinic patient updated.' });
  } catch (error) { fail(res, error, 'Could not update clinic patient.'); }
});

router.post('/patients', requirePermission('canManageClinicPatients'), async (req, res) => {
  const name = text(req.body.name);
  const medicalRecordNo = text(req.body.medicalRecordNo);
  if (!name || !medicalRecordNo) return res.status(400).json({ error: 'Patient name and medical record number are required.' });
  try {
    const created = await prisma.$transaction(async tx => {
      const customer = await tx.customer.create({ data: {
        id: id(), tenantId: tenantId(req), name, phone: text(req.body.phone) || null,
        email: text(req.body.email) || null, address: text(req.body.address) || null,
        notes: 'Clinic patient record',
      } });
      await tx.$executeRaw`INSERT INTO clinic_patient_profiles (id, "tenantId", "customerId", "medicalRecordNo", "dateOfBirth", gender, "bloodGroup", allergies, "emergencyContact", "emergencyPhone")
        VALUES (${id()}, ${tenantId(req)}, ${customer.id}, ${medicalRecordNo}, ${req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null}, ${text(req.body.gender) || null}, ${text(req.body.bloodGroup) || null}, ${text(req.body.allergies) || null}, ${text(req.body.emergencyContact) || null}, ${text(req.body.emergencyPhone) || null})`;
      return customer;
    });
    res.status(201).json({ patient: created });
  } catch (error) { fail(res, error, 'Could not create clinic patient. Check that the record number and contact details are not duplicates.'); }
});

router.get('/appointments', requirePermission('canViewClinicAppointments'), async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`SELECT a.*, c.name AS "patientName", c.phone AS "patientPhone", b.name AS "branchName" FROM clinic_appointments a JOIN customers c ON c.id = a."customerId" LEFT JOIN branches b ON b.id = a."branchId" WHERE a."tenantId" = ${tenantId(req)} ORDER BY a."startsAt" DESC LIMIT 500`;
    res.json({ appointments: rows });
  } catch (error) { fail(res, error, 'Could not load clinic appointments.'); }
});

router.post('/appointments', requirePermission('canManageClinicAppointments'), async (req, res) => {
  const customerId = text(req.body.customerId);
  const reason = text(req.body.reason);
  const startsAt = new Date(req.body.startsAt);
  if (!customerId || !reason || Number.isNaN(startsAt.getTime())) return res.status(400).json({ error: 'Select a patient, appointment reason, and valid start time.' });
  try {
    const patient = await prisma.$queryRaw`SELECT id FROM clinic_patient_profiles WHERE "tenantId" = ${tenantId(req)} AND "customerId" = ${customerId}`;
    if (!patient.length) return res.status(404).json({ error: 'Clinic patient not found.' });
    const branchId = text(req.body.branchId) || req.user.branchId || req.user.branch_id || null;
    if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenantId(req) }, select: { id: true } })) return res.status(400).json({ error: 'Choose a branch belonging to this business.' });
    const appointmentId = id();
    await prisma.$executeRaw`INSERT INTO clinic_appointments (id, "tenantId", "customerId", "branchId", "providerName", "startsAt", reason, notes, "createdByUserId") VALUES (${appointmentId}, ${tenantId(req)}, ${customerId}, ${branchId}, ${text(req.body.providerName) || null}, ${startsAt}, ${reason}, ${text(req.body.notes) || null}, ${req.user.id})`;
    res.status(201).json({ id: appointmentId, message: 'Appointment scheduled.' });
  } catch (error) { fail(res, error, 'Could not schedule clinic appointment.'); }
});

router.patch('/appointments/:id/status', requirePermission('canManageClinicAppointments'), async (req, res) => {
  const status = text(req.body.status);
  if (!['scheduled', 'arrived', 'completed', 'cancelled', 'no_show'].includes(status)) return res.status(400).json({ error: 'Choose a valid appointment status.' });
  try {
    const result = await prisma.$executeRaw`UPDATE clinic_appointments SET status = ${status}, "updatedAt" = NOW() WHERE id = ${req.params.id} AND "tenantId" = ${tenantId(req)}`;
    if (!result) return res.status(404).json({ error: 'Appointment not found.' });
    res.json({ message: 'Appointment updated.' });
  } catch (error) { fail(res, error, 'Could not update appointment.'); }
});

router.get('/encounters', requirePermission('canViewClinicEncounters'), async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`SELECT e.*, c.name AS "patientName", p."medicalRecordNo" FROM clinic_encounters e JOIN customers c ON c.id = e."customerId" JOIN clinic_patient_profiles p ON p."customerId" = c.id WHERE e."tenantId" = ${tenantId(req)} ORDER BY e."createdAt" DESC LIMIT 500`;
    res.json({ encounters: rows });
  } catch (error) { fail(res, error, 'Could not load clinical encounters.'); }
});

router.post('/encounters', requirePermission('canManageClinicEncounters'), async (req, res) => {
  const customerId = text(req.body.customerId);
  const chiefComplaint = text(req.body.chiefComplaint);
  if (!customerId || !chiefComplaint) return res.status(400).json({ error: 'Select a patient and enter the chief complaint.' });
  try {
    const patient = await prisma.$queryRaw`SELECT id FROM clinic_patient_profiles WHERE "tenantId" = ${tenantId(req)} AND "customerId" = ${customerId}`;
    if (!patient.length) return res.status(404).json({ error: 'Clinic patient not found.' });
    const encounterId = id();
    const appointmentId = text(req.body.appointmentId) || null;
    if (appointmentId) {
      const appointment = await prisma.$queryRaw`SELECT id FROM clinic_appointments WHERE id = ${appointmentId} AND "tenantId" = ${tenantId(req)} AND "customerId" = ${customerId}`;
      if (!appointment.length) return res.status(400).json({ error: 'Appointment does not belong to this patient and business.' });
    }
    await prisma.$executeRaw`INSERT INTO clinic_encounters (id, "tenantId", "customerId", "appointmentId", "clinicianName", "chiefComplaint", assessment, diagnosis, "treatmentPlan", notes, "createdByUserId") VALUES (${encounterId}, ${tenantId(req)}, ${customerId}, ${appointmentId}, ${text(req.body.clinicianName) || null}, ${chiefComplaint}, ${text(req.body.assessment) || null}, ${text(req.body.diagnosis) || null}, ${text(req.body.treatmentPlan) || null}, ${text(req.body.notes) || null}, ${req.user.id})`;
    res.status(201).json({ id: encounterId, message: 'Clinical encounter saved.' });
  } catch (error) { fail(res, error, 'Could not save clinical encounter.'); }
});

router.get('/prescriptions', requirePermission('canViewClinicPrescriptions'), async (req, res) => {
  try {
    const prescriptions = await prisma.$queryRaw`SELECT r.*, c.name AS "patientName", e.diagnosis FROM clinic_prescriptions r JOIN customers c ON c.id = r."customerId" LEFT JOIN clinic_encounters e ON e.id = r."encounterId" WHERE r."tenantId" = ${tenantId(req)} ORDER BY r."createdAt" DESC LIMIT 500`;
    const items = await prisma.$queryRaw`SELECT i.*, p.name AS "productName" FROM clinic_prescription_items i JOIN clinic_prescriptions r ON r.id = i."prescriptionId" JOIN products p ON p.id = i."productId" WHERE r."tenantId" = ${tenantId(req)} ORDER BY i.id`;
    const events = await prisma.$queryRaw`SELECT f.*, CONCAT_WS(' ', u.fname, u.lname) AS "pharmacistName" FROM clinic_prescription_fulfillments f LEFT JOIN users u ON u.id = f."dispensedByUserId" WHERE f."tenantId" = ${tenantId(req)} ORDER BY f."createdAt"`;
    res.json({ prescriptions: prescriptions.map(p => ({ ...p, items: items.filter(i => i.prescriptionId === p.id).map(item => {
      const fulfillmentHistory = events.filter(event => event.prescriptionItemId === item.id);
      const dispensedQuantity = fulfillmentHistory.reduce((sum, event) => sum + Number(event.quantityDispensed), 0);
      return { ...item, dispensedQuantity, remainingQuantity: Math.max(Number(item.quantity) - dispensedQuantity, 0), fulfillmentHistory };
    }) })) });
  } catch (error) { fail(res, error, 'Could not load prescriptions.'); }
});

router.post('/prescriptions', requirePermission('canManageClinicPrescriptions'), async (req, res) => {
  const customerId = text(req.body.customerId);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!customerId || !items.length) return res.status(400).json({ error: 'Select a patient and at least one prescribed medicine.' });
  try {
    const patient = await prisma.$queryRaw`SELECT id FROM clinic_patient_profiles WHERE "tenantId" = ${tenantId(req)} AND "customerId" = ${customerId}`;
    if (!patient.length) return res.status(404).json({ error: 'Clinic patient not found.' });
    const prescriptionId = id();
    const reference = `RX-${Date.now()}`;
    const encounterId = text(req.body.encounterId) || null;
    if (encounterId) {
      const encounter = await prisma.$queryRaw`SELECT id FROM clinic_encounters WHERE id = ${encounterId} AND "tenantId" = ${tenantId(req)} AND "customerId" = ${customerId}`;
      if (!encounter.length) return res.status(400).json({ error: 'Clinical encounter does not belong to the selected patient and business.' });
    }
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO clinic_prescriptions (id, "tenantId", "customerId", "encounterId", reference, "prescriberName", notes, "createdByUserId") VALUES (${prescriptionId}, ${tenantId(req)}, ${customerId}, ${encounterId}, ${reference}, ${text(req.body.prescriberName) || null}, ${text(req.body.notes) || null}, ${req.user.id})`;
      for (const item of items) {
        const productId = text(item.productId);
        const quantity = Number(item.quantity);
        if (!productId || !Number.isFinite(quantity) || quantity <= 0) throw Object.assign(new Error('Every prescription line needs a medicine and a quantity greater than zero.'), { statusCode: 400 });
        const product = await tx.product.findFirst({ where: { id: productId, tenantId: tenantId(req), isActive: true, itemType: 'product' }, select: { id: true } });
        if (!product) throw Object.assign(new Error('A prescribed medicine is not available in this business inventory.'), { statusCode: 400 });
        await tx.$executeRaw`INSERT INTO clinic_prescription_items (id, "prescriptionId", "productId", quantity, dosage, frequency, "durationDays", instructions) VALUES (${id()}, ${prescriptionId}, ${productId}, ${quantity}, ${text(item.dosage) || null}, ${text(item.frequency) || null}, ${Number(item.durationDays) > 0 ? Number(item.durationDays) : null}, ${text(item.instructions) || null})`;
      }
    });
    res.status(201).json({ id: prescriptionId, reference, message: 'Prescription created.' });
  } catch (error) { fail(res, error, 'Could not create prescription.'); }
});

export default router;
