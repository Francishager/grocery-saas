import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS property_tenant_notes (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "tenancyId" TEXT REFERENCES property_tenancies(id) ON DELETE SET NULL,
    "createdById" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL DEFAULT 'communication',
    priority TEXT NOT NULL DEFAULT 'normal',
    body TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    status TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS property_tenant_note_follow_ups (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "noteId" TEXT NOT NULL REFERENCES property_tenant_notes(id) ON DELETE CASCADE,
    "createdById" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "idempotencyKey" TEXT,
    body TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("tenantId", "idempotencyKey")
  )`)
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_tenant_note_follow_ups_note_idx ON property_tenant_note_follow_ups ("tenantId", "customerId", "noteId", "createdAt")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_tenant_notes_customer_followup_idx ON property_tenant_notes ("tenantId", "customerId", status, "followUpAt")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS property_tenant_notes_customer_created_idx ON property_tenant_notes ("tenantId", "customerId", "createdAt")')
  await prisma.$executeRawUnsafe('ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "canViewTenantNotes" BOOLEAN NOT NULL DEFAULT FALSE')
  await prisma.$executeRawUnsafe('ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "canManageTenantNotes" BOOLEAN NOT NULL DEFAULT FALSE')
  await prisma.$executeRawUnsafe('ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "canEditTenantNotes" BOOLEAN NOT NULL DEFAULT FALSE')
  await prisma.$executeRawUnsafe('ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "canCompleteTenantNotes" BOOLEAN NOT NULL DEFAULT FALSE')
  await prisma.$executeRawUnsafe('ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "canAddTenantNoteFollowUps" BOOLEAN NOT NULL DEFAULT FALSE')
  console.log('Property tenant notes schema is ready.')
} catch (error) {
  console.error('Unable to prepare property tenant notes schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
