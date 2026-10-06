import prisma from '../db.js'
import { setupTenantAccountingSystem } from '../services/tenantAccountingSetupService.js'
import { applyTenantAccountingCutover, previewTenantAccountingCutover } from '../services/tenantAccountingCutoverService.js'

try {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      ownerId: true,
      receivablesAccountingConfig: { select: { isEnabled: true } },
      payablesAccountingConfig: { select: { isEnabled: true } },
      accountingCutover: { select: { id: true } },
    },
    orderBy: { id: 'asc' },
  })
  let activated = 0
  let skipped = 0
  let failed = 0

  for (const tenant of tenants) {
    if (tenant.accountingCutover || (tenant.receivablesAccountingConfig?.isEnabled && tenant.payablesAccountingConfig?.isEnabled)) {
      skipped += 1
      continue
    }
    try {
      const user = tenant.ownerId
        ? { id: tenant.ownerId }
        : await prisma.user.findFirst({ where: { tenantId: tenant.id }, select: { id: true }, orderBy: { createdAt: 'asc' } })
      if (!user?.id) throw new Error('No tenant user is available to attribute the opening journal.')

      const setup = await setupTenantAccountingSystem(prisma, { tenantId: tenant.id, userId: user.id })
      if (setup.receivables?.isEnabled && setup.payables?.isEnabled) {
        activated += 1
        console.log(`Accounting posting enabled for tenant ${tenant.id}; no opening snapshot was needed.`)
        continue
      }
      const preview = await previewTenantAccountingCutover(prisma, tenant.id)
      const result = await applyTenantAccountingCutover(prisma, {
        tenantId: tenant.id,
        userId: user.id,
        confirmedFingerprint: preview.sourceFingerprint,
      })
      activated += 1
      console.log(`Accounting posting enabled for tenant ${tenant.id}; ${result.cutover.exceptionCount} differences retained for review.`)
    } catch (error) {
      failed += 1
      console.error(`Accounting cutover skipped for tenant ${tenant.id}; existing records were not rewritten.`, error.code || error.message || '')
    }
  }
  console.log(`Existing-tenant accounting setup complete: ${activated} activated, ${skipped} already active, ${failed} require review.`)
} catch (error) {
  console.error('Existing-tenant accounting setup could not complete; backend startup will continue.', error.code || error.message || '')
} finally {
  await prisma.$disconnect()
}
