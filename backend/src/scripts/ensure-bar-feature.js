import prisma from '../db.js'

try {
  await prisma.feature.upsert({
    where: { name: 'bar' },
    create: {
      name: 'bar', displayName: 'Bar',
      description: 'Independent bar orders, menu, and bar service queue.',
      module: 'bar', category: 'module', isActive: true,
    },
    update: {
      displayName: 'Bar',
      description: 'Independent bar orders, menu, and bar service queue.',
      module: 'bar', category: 'module', isActive: true,
    },
  })
  console.log('Standalone Bar feature is ready. Existing Restaurant and Bar Display entitlements are unchanged.')
} catch (error) {
  console.error('Unable to prepare standalone Bar feature:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
