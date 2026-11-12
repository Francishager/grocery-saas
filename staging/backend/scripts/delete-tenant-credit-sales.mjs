import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const tenantId = 'cms8rr22503iycxem8r0h3zuj'
const email = 'rezofamilyricestore@gmail.com'

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantId }, { email }],
    },
    select: { id: true, email: true, name: true },
  })

  if (!tenant) {
    console.log('Tenant not found')
    return
  }

  const beforeSaleRecords = await prisma.saleRecord.count({ where: { tenantId: tenant.id } })
  const beforeSaleRecordItems = await prisma.saleRecordItem.count({ where: { sale: { tenantId: tenant.id } } })

  console.log(JSON.stringify({ tenant, beforeSaleRecords, beforeSaleRecordItems }, null, 2))

  if (beforeSaleRecordItems > 0) {
    await prisma.saleRecordItem.deleteMany({ where: { sale: { tenantId: tenant.id } } })
  }
  if (beforeSaleRecords > 0) {
    await prisma.saleRecord.deleteMany({ where: { tenantId: tenant.id } })
  }

  const afterSaleRecords = await prisma.saleRecord.count({ where: { tenantId: tenant.id } })
  const afterSaleRecordItems = await prisma.saleRecordItem.count({ where: { sale: { tenantId: tenant.id } } })

  console.log(JSON.stringify({ afterSaleRecords, afterSaleRecordItems }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
