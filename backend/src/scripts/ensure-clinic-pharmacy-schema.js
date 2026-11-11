import prisma from '../db.js';

const permissions = [
  'canViewClinic', 'canViewClinicPatients', 'canViewClinicAppointments', 'canViewClinicEncounters', 'canViewClinicPrescriptions',
  'canManageClinicPatients', 'canManageClinicAppointments', 'canManageClinicEncounters', 'canManageClinicPrescriptions',
  'canViewPharmacy', 'canViewPharmacyCatalogue', 'canViewPharmacyBatches', 'canViewPharmacyPrescriptions', 'canViewPharmacyDispenses',
  'canManagePharmacyCatalogue', 'canManagePharmacyBatches', 'canDispensePharmacyPrescriptions', 'canViewPharmacyReports',
];

try {
  for (const permission of permissions) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "${permission}" BOOLEAN NOT NULL DEFAULT FALSE`);
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS clinic_patient_profiles (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "medicalRecordNo" TEXT NOT NULL, "dateOfBirth" DATE, gender TEXT, "bloodGroup" TEXT,
    allergies TEXT, "emergencyContact" TEXT, "emergencyPhone" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT clinic_patient_tenant_record_key UNIQUE ("tenantId", "medicalRecordNo"),
    CONSTRAINT clinic_patient_customer_key UNIQUE ("customerId")
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS clinic_appointments (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    "branchId" TEXT REFERENCES branches(id) ON DELETE SET NULL, "providerName" TEXT, "startsAt" TIMESTAMP(3) NOT NULL,
    reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT, "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS clinic_encounters (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    "appointmentId" TEXT REFERENCES clinic_appointments(id) ON DELETE SET NULL,
    "clinicianName" TEXT, "chiefComplaint" TEXT NOT NULL, assessment TEXT, diagnosis TEXT, "treatmentPlan" TEXT,
    notes TEXT, "createdByUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS clinic_prescriptions (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    "encounterId" TEXT REFERENCES clinic_encounters(id) ON DELETE SET NULL,
    reference TEXT NOT NULL, "prescriberName" TEXT, status TEXT NOT NULL DEFAULT 'open', notes TEXT,
    "createdByUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT clinic_prescription_tenant_reference_key UNIQUE ("tenantId", reference)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS clinic_prescription_items (
    id TEXT PRIMARY KEY, "prescriptionId" TEXT NOT NULL REFERENCES clinic_prescriptions(id) ON DELETE CASCADE,
    "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT, quantity NUMERIC(18,6) NOT NULL,
    dosage TEXT, frequency TEXT, "durationDays" INTEGER, instructions TEXT
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pharmacy_batches (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    "branchId" TEXT REFERENCES branches(id) ON DELETE SET NULL, "batchNumber" TEXT NOT NULL,
    "expiryDate" DATE, "quantityReceived" NUMERIC(18,6) NOT NULL, "quantityRemaining" NUMERIC(18,6) NOT NULL,
    "unitCost" NUMERIC(18,6), status TEXT NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pharmacy_batch_scope_key UNIQUE ("tenantId", "productId", "branchId", "batchNumber")
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pharmacy_catalogue (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    "activeIngredient" TEXT, strength TEXT, "dosageForm" TEXT, manufacturer TEXT,
    "prescriptionRequired" BOOLEAN NOT NULL DEFAULT TRUE, "controlledClass" TEXT, notes TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pharmacy_catalogue_tenant_product_key UNIQUE ("tenantId", "productId")
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS pharmacy_batches_expiry_idx ON pharmacy_batches("tenantId", "expiryDate", status)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pharmacy_dispenses (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "prescriptionId" TEXT NOT NULL REFERENCES clinic_prescriptions(id) ON DELETE RESTRICT,
    "saleId" TEXT REFERENCES sales(id) ON DELETE RESTRICT,
    "saleRecordId" TEXT REFERENCES sale_records(id) ON DELETE RESTRICT,
    "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    "dispensedByUserId" TEXT NOT NULL, "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pharmacy_dispense_prescription_key UNIQUE ("prescriptionId")
  )`);
  await prisma.$executeRawUnsafe('ALTER TABLE pharmacy_dispenses ALTER COLUMN "saleId" DROP NOT NULL');
  await prisma.$executeRawUnsafe('ALTER TABLE pharmacy_dispenses ADD COLUMN IF NOT EXISTS "saleRecordId" TEXT REFERENCES sale_records(id) ON DELETE RESTRICT');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_dispense_pos_sale_key ON pharmacy_dispenses("saleId")');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_dispense_credit_sale_key ON pharmacy_dispenses("saleRecordId")');
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pharmacy_dispense_lines (
    id TEXT PRIMARY KEY, "dispenseId" TEXT NOT NULL REFERENCES pharmacy_dispenses(id) ON DELETE CASCADE,
    "batchId" TEXT NOT NULL REFERENCES pharmacy_batches(id) ON DELETE RESTRICT,
    "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT, quantity NUMERIC(18,6) NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS clinic_prescription_fulfillments (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "prescriptionId" TEXT NOT NULL REFERENCES clinic_prescriptions(id) ON DELETE CASCADE,
    "prescriptionItemId" TEXT NOT NULL REFERENCES clinic_prescription_items(id) ON DELETE RESTRICT,
    "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    "quantityDispensed" NUMERIC(18,6) NOT NULL DEFAULT 0, outcome TEXT NOT NULL,
    reason TEXT, "saleId" TEXT REFERENCES sales(id) ON DELETE RESTRICT,
    "saleRecordId" TEXT REFERENCES sale_records(id) ON DELETE RESTRICT,
    "batchId" TEXT REFERENCES pharmacy_batches(id) ON DELETE RESTRICT,
    "dispensedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT clinic_prescription_fulfillment_outcome_check CHECK (outcome IN ('dispensed', 'not_available', 'patient_declined', 'other')),
    CONSTRAINT clinic_prescription_fulfillment_sale_check CHECK ("quantityDispensed" = 0 OR ("saleId" IS NOT NULL AND "saleRecordId" IS NULL) OR ("saleId" IS NULL AND "saleRecordId" IS NOT NULL))
  )`);
  await prisma.$executeRawUnsafe('ALTER TABLE clinic_prescription_fulfillments ADD COLUMN IF NOT EXISTS "productId" TEXT REFERENCES products(id) ON DELETE RESTRICT');
  await prisma.$executeRawUnsafe('UPDATE clinic_prescription_fulfillments f SET "productId" = i."productId" FROM clinic_prescription_items i WHERE f."prescriptionItemId" = i.id AND f."productId" IS NULL');
  await prisma.$executeRawUnsafe('ALTER TABLE clinic_prescription_fulfillments ALTER COLUMN "productId" SET NOT NULL');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS clinic_prescription_fulfillment_item_idx ON clinic_prescription_fulfillments("tenantId", "prescriptionItemId", "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS clinic_prescription_fulfillment_rx_idx ON clinic_prescription_fulfillments("tenantId", "prescriptionId", "createdAt" DESC)');
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pharmacy_sale_batch_allocations (
    id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "saleId" TEXT REFERENCES sales(id) ON DELETE CASCADE,
    "saleRecordId" TEXT REFERENCES sale_records(id) ON DELETE CASCADE,
    "batchId" TEXT NOT NULL REFERENCES pharmacy_batches(id) ON DELETE RESTRICT,
    "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS pharmacy_sale_batch_sale_idx ON pharmacy_sale_batch_allocations("saleId", "saleRecordId", "productId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS clinic_appointments_tenant_starts_idx ON clinic_appointments("tenantId", "startsAt", status)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS clinic_encounters_patient_idx ON clinic_encounters("tenantId", "customerId", "createdAt" DESC)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS clinic_prescriptions_status_idx ON clinic_prescriptions("tenantId", status, "createdAt" DESC)');

  for (const feature of [
    { name: 'clinic_management', displayName: 'Clinic Management', description: 'Patient records, appointments, clinical encounters, prescriptions and clinic reporting.' },
    { name: 'pharmacy_management', displayName: 'Pharmacy Management', description: 'Medicine catalogue, batch and expiry control, prescription dispensing and pharmacy reporting.' },
  ]) {
    await prisma.feature.upsert({
      where: { name: feature.name },
      create: { ...feature, category: 'module', module: feature.name, isActive: true },
      update: { ...feature, category: 'module', module: feature.name, isActive: true },
    });
  }
  console.log('Clinic and Pharmacy additive schema and feature definitions are ready.');
} catch (error) {
  console.error('Unable to prepare Clinic and Pharmacy schema:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
