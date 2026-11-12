import prisma from '../db.js'

try {
  await prisma.$transaction(async tx => {
    const legacy = await tx.feature.findUnique({ where: { name: 'property_management' }, select: { id: true } })
    if (legacy) {
      await tx.tenantFeature.deleteMany({ where: { featureId: legacy.id } })
      await tx.feature.update({ where: { id: legacy.id }, data: { isActive: false } })
    }

    for (const feature of [
      { name: 'property_management.landlord', displayName: 'Landlord', description: 'Property portfolio and landlord rental management workflows.' },
      { name: 'property_management.agent', displayName: 'Property Agent', description: 'Managed property and rental workflows for property agents.' },
    ]) {
      await tx.feature.upsert({
        where: { name: feature.name },
        update: { ...feature, module: 'property_management', category: 'module', isActive: true },
        create: { ...feature, module: 'property_management', category: 'module', isActive: true },
      })
    }
  })
  console.log('Property Management feature definitions prepared. Landlord and Property Agent access must be explicitly assigned through a plan or tenant override.')
} catch (error) {
  console.error('Unable to prepare Property Management feature:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
