import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS property_rent_promises (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "tenancyId" TEXT NOT NULL REFERENCES property_tenancies(id) ON DELETE RESTRICT,
    "createdById" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "idempotencyKey" TEXT,
    amount DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    notes TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS property_rent_promise_charge_allocations (
    id TEXT PRIMARY KEY,
    "promiseId" TEXT NOT NULL REFERENCES property_rent_promises(id) ON DELETE CASCADE,
    "chargeId" TEXT NOT NULL REFERENCES rent_charges(id) ON DELETE RESTRICT,
    amount DOUBLE PRECISION NOT NULL
  )`)
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_rent_promises_tenant_tenancy_created_idx ON property_rent_promises ("tenantId", "tenancyId", "createdAt")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_rent_promises_tenant_due_idx ON property_rent_promises ("tenantId", "dueDate")')
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS property_rent_promises_tenant_idempotency_key ON property_rent_promises ("tenantId", "idempotencyKey")')
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS property_rent_promise_charge_unique_idx ON property_rent_promise_charge_allocations ("promiseId", "chargeId")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_rent_promise_charge_idx ON property_rent_promise_charge_allocations ("chargeId")')
  await prisma.$executeRawUnsafe('ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "canViewRentPromises" BOOLEAN NOT NULL DEFAULT FALSE')
  await prisma.$executeRawUnsafe('ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "canManageRentPromises" BOOLEAN NOT NULL DEFAULT FALSE')
  console.log('Property rent promise tracking schema is ready.')
} catch (error) {
  console.error('Unable to prepare property rent promise tracking schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
