import prisma from '../db.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS "fuel_vehicles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT,
    "registration" TEXT NOT NULL,
    "makeModel" TEXT,
    "fuelType" TEXT,
    "notes" TEXT,
    "isAuthorized" BOOLEAN NOT NULL DEFAULT TRUE,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fuel_vehicles_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "fuel_maintenance_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "assetType" TEXT NOT NULL,
    "assetId" TEXT,
    "assetName" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fuel_maintenance_records_pkey" PRIMARY KEY ("id")
  )`,
  'ALTER TABLE "fuel_sales" ADD COLUMN IF NOT EXISTS "vehicleId" TEXT',
  'CREATE UNIQUE INDEX IF NOT EXISTS "fuel_vehicles_tenantId_registration_key" ON "fuel_vehicles"("tenantId", "registration")',
  'CREATE INDEX IF NOT EXISTS "fuel_vehicles_tenantId_branchId_isActive_idx" ON "fuel_vehicles"("tenantId", "branchId", "isActive")',
  'CREATE INDEX IF NOT EXISTS "fuel_vehicles_tenantId_customerId_idx" ON "fuel_vehicles"("tenantId", "customerId")',
  'CREATE INDEX IF NOT EXISTS "fuel_maintenance_records_tenantId_branchId_status_dueAt_idx" ON "fuel_maintenance_records"("tenantId", "branchId", "status", "dueAt")',
  'CREATE INDEX IF NOT EXISTS "fuel_maintenance_records_tenantId_assetType_assetId_dueAt_idx" ON "fuel_maintenance_records"("tenantId", "assetType", "assetId", "dueAt")',
  'CREATE INDEX IF NOT EXISTS "fuel_sales_vehicleId_idx" ON "fuel_sales"("vehicleId")',
];

const constraints = [
  ['fuel_vehicles_tenantId_fkey', 'ALTER TABLE "fuel_vehicles" ADD CONSTRAINT "fuel_vehicles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE'],
  ['fuel_vehicles_branchId_fkey', 'ALTER TABLE "fuel_vehicles" ADD CONSTRAINT "fuel_vehicles_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
  ['fuel_vehicles_customerId_fkey', 'ALTER TABLE "fuel_vehicles" ADD CONSTRAINT "fuel_vehicles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
  ['fuel_maintenance_records_tenantId_fkey', 'ALTER TABLE "fuel_maintenance_records" ADD CONSTRAINT "fuel_maintenance_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE'],
  ['fuel_maintenance_records_branchId_fkey', 'ALTER TABLE "fuel_maintenance_records" ADD CONSTRAINT "fuel_maintenance_records_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
  ['fuel_sales_vehicleId_fkey', 'ALTER TABLE "fuel_sales" ADD CONSTRAINT "fuel_sales_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "fuel_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
];

try {
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    for (const [name, statement] of constraints) {
      const table = statement.match(/ALTER TABLE "([^"]+)"/)?.[1];
      if (!table) throw new Error(`Cannot determine table for fuel constraint ${name}`);
      await tx.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}' AND conrelid = '"${table}"'::regclass) THEN ${statement}; END IF; END $$`);
    }
  }, { timeout: 30000 });

  const [schemaReady] = await prisma.$queryRaw`SELECT
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'fuel_vehicles')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'fuel_maintenance_records')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'fuel_sales' AND column_name = 'vehicleId') AS ready`;
  if (!schemaReady?.ready) throw new Error('Fuel fleet and maintenance schema verification failed');

  for (const feature of [
    { name: 'fuel_station.fleet', displayName: 'Fleet & Vehicle Authorization', description: 'Register customer vehicles, authorize fueling, and link fuel invoices to the vehicle and customer.' },
    { name: 'fuel_station.maintenance', displayName: 'Equipment Maintenance & Calibration', description: 'Schedule and track pump, tank, station inspections, servicing, and calibration due dates.' },
  ]) {
    await prisma.feature.upsert({
      where: { name: feature.name },
      create: { ...feature, module: 'fuel_station', category: 'module', isActive: true },
      update: { ...feature, module: 'fuel_station', category: 'module', isActive: true },
    });
  }
  console.log('Fuel fleet and maintenance schema and opt-in features are ready.');
} catch (error) {
  console.error('Unable to prepare fuel fleet and maintenance schema:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
