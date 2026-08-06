import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const tenantId = 'cms8rr22503iycxem8r0h3zuj'
const email = 'rezofamilyricestore@gmail.com'

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { email }] },
    select: { id: true, email: true, name: true },
  })

  if (!tenant) {
    console.log('Tenant not found')
    return
  }

  const count = await prisma.cashTransaction.count({ where: { tenantId: tenant.id } })
  console.log(`Tenant found: ${tenant.id} (${tenant.email})`)
  console.log(`Cash transaction records before delete: ${count}`)

  if (count > 0) {
    await prisma.cashTransaction.deleteMany({ where: { tenantId: tenant.id } })
  }

  const afterCount = await prisma.cashTransaction.count({ where: { tenantId: tenant.id } })
  console.log(`Cash transaction records after delete: ${afterCount}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
