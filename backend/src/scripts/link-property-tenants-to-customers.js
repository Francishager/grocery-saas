import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe('ALTER TABLE "property_tenancies" ADD COLUMN IF NOT EXISTS "customerId" TEXT')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "property_tenancies_tenantId_customerId_idx" ON "property_tenancies"("tenantId", "customerId")')
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_tenancies_customerId_fkey') THEN
      ALTER TABLE "property_tenancies" ADD CONSTRAINT "property_tenancies_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "property_tenant_identities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "tenancyId" TEXT NOT NULL UNIQUE REFERENCES "property_tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "profilePhotoUrl" TEXT,
    "nationalIdFrontUrl" TEXT,
    "nationalIdBackUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
  )`)
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "property_tenant_identities_tenantId_idx" ON "property_tenant_identities"("tenantId")')

  const tenancies = await prisma.propertyTenancy.findMany({
    where: { customerId: null },
    select: { id: true, tenantId: true, tenantName: true, phone: true, email: true, nationalId: true },
    orderBy: { createdAt: 'asc' },
  })

  let linked = 0
  for (const tenancy of tenancies) {
    await prisma.$transaction(async tx => {
      const existingLink = await tx.propertyTenancy.findFirst({ where: { id: tenancy.id, customerId: { not: null } }, select: { customerId: true } })
      if (existingLink) return
      const nameMatch = { name: { equals: tenancy.tenantName, mode: 'insensitive' } }
      let customer = null
      if (tenancy.phone) customer = await tx.customer.findFirst({ where: { tenantId: tenancy.tenantId, phone: tenancy.phone, ...nameMatch } })
      if (!customer && tenancy.email) customer = await tx.customer.findFirst({ where: { tenantId: tenancy.tenantId, email: { equals: tenancy.email, mode: 'insensitive' }, ...nameMatch } })
      if (!customer) customer = await tx.customer.create({ data: {
        tenantId: tenancy.tenantId,
        name: tenancy.tenantName,
        phone: tenancy.phone || null,
        email: tenancy.email || null,
        nin: tenancy.nationalId || null,
        creditLimit: 0,
        balance: 0,
        openingBalance: 0,
      } })
      await tx.propertyTenancy.updateMany({ where: { id: tenancy.id, customerId: null }, data: { customerId: customer.id } })
      linked += 1
    })
  }
  console.log(`Linked ${linked} existing rental tenancies to same-tenant customer profiles.`)
} catch (error) {
  console.error('Unable to link property tenants to customer profiles:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
