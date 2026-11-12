import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tenant_memberships (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner',
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "grantedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT tenant_memberships_role_check CHECK (role = 'owner')
    )
  `)
  // Earlier deployments may have created this table with only a subset of the
  // columns. Repair it additively so the account switcher can query safely.
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS "grantedById" TEXT`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS "userId" TEXT`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS "tenantId" TEXT`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS id TEXT`)
  await prisma.$executeRawUnsafe(`UPDATE tenant_memberships m SET "tenantId" = u."tenantId" FROM users u WHERE m."userId" = u.id AND m."tenantId" IS NULL`)
  await prisma.$executeRawUnsafe(`UPDATE tenant_memberships m SET "userId" = t."ownerId" FROM tenants t WHERE m."tenantId" = t.id AND m."userId" IS NULL AND t."ownerId" IS NOT NULL`)
  await prisma.$executeRawUnsafe(`UPDATE tenant_memberships SET id = md5(random()::text || clock_timestamp()::text || ctid::text) WHERE id IS NULL`)
  await prisma.$executeRawUnsafe(`UPDATE tenant_memberships SET role = 'owner' WHERE role IS NULL`)
  await prisma.$executeRawUnsafe(`UPDATE tenant_memberships SET "isActive" = TRUE WHERE "isActive" IS NULL`)
  await prisma.$executeRawUnsafe(`UPDATE tenant_memberships SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL`)
  await prisma.$executeRawUnsafe(`UPDATE tenant_memberships SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ALTER COLUMN id SET NOT NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ALTER COLUMN role SET NOT NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ALTER COLUMN "isActive" SET NOT NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ALTER COLUMN "createdAt" SET NOT NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenant_memberships ALTER COLUMN "updatedAt" SET NOT NULL`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_id_key ON tenant_memberships(id)`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_user_tenant_key ON tenant_memberships("userId", "tenantId")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_active_idx ON tenant_memberships("tenantId", "isActive")`)
  await prisma.$executeRawUnsafe(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS "tenants_ownerId_key"`)
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "tenants_ownerId_key"`)
  // Mirror existing ownership only; this does not grant access beyond the owner's current tenant.
  await prisma.$executeRawUnsafe(`
    INSERT INTO tenant_memberships (id, "userId", "tenantId", role, "isActive", "createdAt", "updatedAt")
    SELECT md5(random()::text || clock_timestamp()::text), t."ownerId", t.id, 'owner', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM tenants t
    WHERE t."ownerId" IS NOT NULL
    ON CONFLICT ("userId", "tenantId") DO NOTHING
  `)
  console.log('Shared business login membership schema is ready.')
} catch (error) {
  console.error('Unable to prepare tenant membership schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
