import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS property_rent_rate_history (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "unitId" TEXT NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    "tenancyId" TEXT REFERENCES property_tenancies(id) ON DELETE CASCADE,
    "previousAmount" DOUBLE PRECISION NOT NULL,
    "newAmount" DOUBLE PRECISION NOT NULL,
    "effectivePeriod" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changeSource" TEXT NOT NULL DEFAULT 'unit_edit',
    note TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_rent_rate_history_tenant_unit_period_idx ON property_rent_rate_history ("tenantId", "unitId", "effectivePeriod")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_rent_rate_history_tenancy_period_idx ON property_rent_rate_history ("tenancyId", "effectivePeriod")')
  console.log('Property rent rate history storage is ready.')
} catch (error) {
  console.error('Unable to prepare property rent rate history storage:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
