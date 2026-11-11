import prisma from '../db.js';

try {
  await prisma.$executeRawUnsafe('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "salonChairId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "salonStylistId" TEXT');
  await prisma.$executeRawUnsafe(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "bookingType" TEXT NOT NULL DEFAULT 'appointment'`);
  await prisma.$executeRawUnsafe('ALTER TABLE service_technicians ADD COLUMN IF NOT EXISTS "commissionType" TEXT NOT NULL DEFAULT \'percent\'');
  await prisma.$executeRawUnsafe('ALTER TABLE service_technicians ADD COLUMN IF NOT EXISTS "commissionValue" DOUBLE PRECISION NOT NULL DEFAULT 0');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS salon_chairs (
      id TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" TEXT REFERENCES branches(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      code TEXT,
      location TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS salon_chairs_tenant_code_key ON salon_chairs("tenantId", code)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS salon_chairs_tenant_branch_active_idx ON salon_chairs("tenantId", "branchId", "isActive")');
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_salonChairId_fkey') THEN
      ALTER TABLE appointments ADD CONSTRAINT "appointments_salonChairId_fkey" FOREIGN KEY ("salonChairId") REFERENCES salon_chairs(id) ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`);
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_salonStylistId_fkey') THEN
      ALTER TABLE appointments ADD CONSTRAINT "appointments_salonStylistId_fkey" FOREIGN KEY ("salonStylistId") REFERENCES service_technicians(id) ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS salon_commissions (
      id TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "appointmentId" TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      "stylistId" TEXT REFERENCES service_technicians(id) ON DELETE SET NULL,
      "stylistName" TEXT NOT NULL,
      "serviceName" TEXT NOT NULL,
      "serviceRevenue" DOUBLE PRECISION NOT NULL,
      "commissionType" TEXT NOT NULL,
      "commissionValue" DOUBLE PRECISION NOT NULL,
      "commissionAmount" DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "completedAt" TIMESTAMP(3) NOT NULL,
      "payrollReference" TEXT,
      "paymentJournalEntryId" TEXT UNIQUE,
      "paidAt" TIMESTAMP(3),
      "paidByUserId" TEXT,
      "paymentAccountId" TEXT,
      "paymentMethod" TEXT,
      "paymentReference" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS salon_commissions_tenant_completed_status_idx ON salon_commissions("tenantId", "completedAt", status)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS salon_commissions_tenant_stylist_status_idx ON salon_commissions("tenantId", "stylistId", status)');
  await prisma.$executeRawUnsafe('ALTER TABLE salon_commissions ADD COLUMN IF NOT EXISTS "paymentJournalEntryId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE salon_commissions ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3)');
  await prisma.$executeRawUnsafe('ALTER TABLE salon_commissions ADD COLUMN IF NOT EXISTS "paidByUserId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE salon_commissions ADD COLUMN IF NOT EXISTS "paymentAccountId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE salon_commissions ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE salon_commissions ADD COLUMN IF NOT EXISTS "paymentReference" TEXT');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS salon_commissions_payment_journal_key ON salon_commissions("paymentJournalEntryId")');

  const permissionColumns = [
    'canViewSalonChair', 'canCreateSalonChair', 'canEditSalonChair', 'canDeactivateSalonChair', 'canAssignSalonChair',
    'canViewSalonCommission', 'canConfigureSalonCommission', 'canApproveSalonCommission', 'canIncludeSalonCommissionInPayroll', 'canPaySalonCommission',
    'canViewSalonStylist', 'canCreateSalonStylist', 'canEditSalonStylist', 'canDeactivateSalonStylist', 'canAssignSalonStylist',
    'canViewBarQueue', 'canUpdateBarQueue',
  ];
  for (const column of permissionColumns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "${column}" BOOLEAN NOT NULL DEFAULT FALSE`);
  }

  for (const feature of [
    { name: 'salon_spa', displayName: 'Salon & Spa', description: 'Salon and barber operations integrated with services, customers, sales, inventory and staff.' },
    { name: 'salon.chair_scheduling', displayName: 'Chair Scheduling', description: 'Book chairs and stations with branch-aware conflict prevention.' },
    { name: 'salon.stylist_commissions', displayName: 'Stylist Commissions', description: 'Configure, calculate, approve and prepare stylist commissions for payroll.' },
  ]) {
    await prisma.feature.upsert({
      where: { name: feature.name },
      create: { ...feature, module: 'salon_spa', category: 'module', isActive: true },
      update: { ...feature, module: 'salon_spa', category: 'module', isActive: true },
    });
  }
  await prisma.feature.updateMany({ where: { name: { in: ['salon.client_loyalty', 'salon.booking_reminders'] } }, data: { isActive: false } });
  console.log('Salon & Spa schema and opt-in feature definitions are ready.');
} catch (error) {
  console.error('Unable to prepare Salon & Spa schema:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
