import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tenant_crm_workspaces (
      "tenantId" TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('CRM workspace storage is ready.')
} catch (error) {
  console.error('Unable to prepare CRM workspace storage:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
