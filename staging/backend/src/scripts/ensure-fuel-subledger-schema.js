import prisma from '../db.js';

const statements = [
  'ALTER TABLE "fuel_deliveries" ADD COLUMN IF NOT EXISTS "supplierId" TEXT',
  'ALTER TABLE "fuel_deliveries" ADD COLUMN IF NOT EXISTS "supplierPurchaseId" TEXT',
  'ALTER TABLE "fuel_shift_reports" ADD COLUMN IF NOT EXISTS "salesMode" TEXT NOT NULL DEFAULT \'aggregate\'',
  `CREATE TABLE IF NOT EXISTS "fuel_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "tankId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "litres" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fuel_sales_pkey" PRIMARY KEY ("id")
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "fuel_deliveries_supplierPurchaseId_key" ON "fuel_deliveries"("supplierPurchaseId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "fuel_deliveries_tenantId_supplierId_invoiceNo_key" ON "fuel_deliveries"("tenantId", "supplierId", "invoiceNo")',
  'CREATE INDEX IF NOT EXISTS "fuel_deliveries_tenantId_supplierId_idx" ON "fuel_deliveries"("tenantId", "supplierId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "fuel_sales_saleId_key" ON "fuel_sales"("saleId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "fuel_sales_idempotencyKey_key" ON "fuel_sales"("idempotencyKey")',
  'CREATE INDEX IF NOT EXISTS "fuel_sales_tenantId_shiftId_createdAt_idx" ON "fuel_sales"("tenantId", "shiftId", "createdAt")',
];

const constraints = [
  ['fuel_deliveries_supplierId_fkey', 'ALTER TABLE "fuel_deliveries" ADD CONSTRAINT "fuel_deliveries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE'],
  ['fuel_deliveries_supplierPurchaseId_fkey', 'ALTER TABLE "fuel_deliveries" ADD CONSTRAINT "fuel_deliveries_supplierPurchaseId_fkey" FOREIGN KEY ("supplierPurchaseId") REFERENCES "supplier_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
  ['fuel_sales_tenantId_fkey', 'ALTER TABLE "fuel_sales" ADD CONSTRAINT "fuel_sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE'],
  ['fuel_sales_branchId_fkey', 'ALTER TABLE "fuel_sales" ADD CONSTRAINT "fuel_sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
  ['fuel_sales_tankId_fkey', 'ALTER TABLE "fuel_sales" ADD CONSTRAINT "fuel_sales_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE'],
  ['fuel_sales_shiftId_fkey', 'ALTER TABLE "fuel_sales" ADD CONSTRAINT "fuel_sales_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "fuel_shift_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE'],
  ['fuel_sales_saleId_fkey', 'ALTER TABLE "fuel_sales" ADD CONSTRAINT "fuel_sales_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE CASCADE ON UPDATE CASCADE'],
];

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    for (const [name, statement] of constraints) {
      await tx.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN ${statement}; END IF; END $$`);
    }
  }, { timeout: 30000 });
  console.log('Fuel customer and supplier subledger links are ready.');
} catch (error) {
  console.error('Unable to prepare fuel subledger schema.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
