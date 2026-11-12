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
  for (const feature of [
    { name: 'planner', displayName: 'Planner', description: 'Personal tasks, schedules, goals, notes, and reminders' },
    { name: 'crm', displayName: 'Customer Relationship Management (CRM)', description: 'Customer contacts, prospects, pipeline, interactions, and support' },
  ]) {
    await prisma.feature.upsert({
      where: { name: feature.name },
      create: { ...feature, module: 'business_tools', category: 'advanced', isActive: true },
      update: { ...feature, module: 'business_tools', category: 'advanced' },
    })
  }
  console.log('Standalone Planner and CRM feature switches are ready.')
} catch (error) {
  console.error('Unable to prepare CRM workspace storage:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
