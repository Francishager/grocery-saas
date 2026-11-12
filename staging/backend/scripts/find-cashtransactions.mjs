import 'dotenv/config'
import prisma from '../src/db.js'

const refs = process.argv.slice(2)
if (!refs.length) {
  console.error('Usage: node find-cashtransactions.mjs REF1 REF2')
  process.exit(1)
}

async function main() {
  for (const r of refs) {
    const txns = await prisma.cashTransaction.findMany({ where: { reference: r } })
    if (!txns.length) {
      console.log(`No cash transactions found for reference ${r}`)
      continue
    }
    for (const t of txns) {
      console.log(`Found txn id=${t.id} tenant=${t.tenantId} accountId=${t.accountId} userId=${t.userId} type=${t.type} amount=${t.amount} reference=${t.reference}`)
    }
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  prisma.$disconnect()
})
