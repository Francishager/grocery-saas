import prisma from '../db.js'

try {
  const creditLimitFeature = await prisma.feature.upsert({
    where: { name: 'customers.credit_limits' },
    update: {
      displayName: 'Customer Credit Limits',
      module: 'customers',
      category: 'advanced',
      description: 'Authorize and manage trade credit limits for customers.',
      isActive: true,
    },
    create: {
      name: 'customers.credit_limits',
      displayName: 'Customer Credit Limits',
      module: 'customers',
      category: 'advanced',
      description: 'Authorize and manage trade credit limits for customers.',
      isActive: true,
    },
  })

  const customersFeature = await prisma.feature.findUnique({
    where: { name: 'customers' },
    select: { id: true },
  })

  if (customersFeature) {
    const customerEnabledPlans = await prisma.planFeature.findMany({
      where: { featureId: customersFeature.id, enabled: true },
      select: { planId: true },
    })

    for (const { planId } of customerEnabledPlans) {
      const existing = await prisma.planFeature.findUnique({
        where: { planId_featureId: { planId, featureId: creditLimitFeature.id } },
        select: { id: true },
      })
      if (!existing) {
        await prisma.planFeature.create({
          data: { planId, featureId: creditLimitFeature.id, enabled: true },
        })
      }
    }
  }

  console.log('Customer credit-limit feature is ready; existing customer plans were granted it only where no plan decision existed.')
} catch (error) {
  console.error('Unable to prepare customer credit-limit feature:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
