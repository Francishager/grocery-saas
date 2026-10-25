import prisma from '../db.js'
import { ensurePropertyAccounting } from '../services/propertyAccountingService.js'

try {
  await prisma.feature.upsert({
    where: { name: 'property_management' },
    update: { displayName: 'Property & Rent Management', module: 'property_management', category: 'module', isActive: true },
    create: { name: 'property_management', displayName: 'Property & Rent Management', description: 'Property portfolios, rental units, tenancies, rent collection, statements, reminders and arrears reporting.', module: 'property_management', category: 'module', isActive: true },
  })
  const feature = await prisma.feature.findUnique({ where: { name: 'property_management' }, select: { id: true } })
  const tenants = await prisma.tenant.findMany({ select: { id: true } })
  for (const tenant of tenants) {
    await prisma.$transaction(async tx => {
      await tx.tenantFeature.upsert({
        where: { tenantId_featureId: { tenantId: tenant.id, featureId: feature.id } },
        create: { tenantId: tenant.id, featureId: feature.id, enabled: true },
        update: { enabled: true },
      })
      await ensurePropertyAccounting(tx, tenant.id)
    }, { timeout: 30000 })
  }
  console.log(`Property Management enabled and its system accounts configured for ${tenants.length} existing tenants.`)
} catch (error) {
  console.error('Unable to prepare Property Management feature:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
