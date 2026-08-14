import 'dotenv/config'
import prisma from '../src/db.js'

const receipts = process.argv.slice(2)
if (!receipts.length) {
  console.error('Usage: node find-receipts.mjs RCP-... RCP-...')
  process.exit(1)
}

async function main() {
  for (const r of receipts) {
    const sales = await prisma.sale.findMany({ where: { receiptNo: r }, include: { user: true } })
    if (!sales.length) {
      console.log(`No sales found for receipt ${r}`)
      continue
    }
    for (const s of sales) {
      console.log(`Found sale ${s.id} tenant=${s.tenantId} receipt=${s.receiptNo} total=${s.total} userId=${s.userId}`)
    }
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  prisma.$disconnect()
})
