import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const updated = await prisma.tenant.updateMany({
    where: {
      OR: [
        { dateFormat: null },
        { dateFormat: '' },
        { dateFormat: 'DD/MM/YYYY' },
        { dateFormat: 'MM/DD/YYYY' },
        { dateFormat: 'YYYY-MM-DD' },
      ],
    },
    data: { dateFormat: 'DD/MM/YY' },
  })

  console.log(`✅ Updated ${updated.count} tenant(s) to DD/MM/YY format.`)
}

main()
  .catch((error) => {
    console.error('❌ Failed to normalize tenant date formats:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
