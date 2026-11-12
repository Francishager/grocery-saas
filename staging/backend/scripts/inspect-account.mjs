import 'dotenv/config'
import prisma from '../src/db.js'
import process from 'process'

const CREDIT_TYPES = new Set(['sale', 'receipt', 'income', 'journal_in', 'transfer_in'])
const DEBIT_TYPES = new Set(['expense', 'payment', 'transfer', 'journal_out', 'transfer_out'])

const accountId = process.argv[2]
if (!accountId) {
  console.error('Usage: node inspect-account.mjs <accountId>')
  process.exit(1)
}

async function main() {
  const acc = await prisma.cashAccount.findUnique({ where: { id: accountId } })
  if (!acc) { console.error('Account not found:', accountId); process.exit(1) }

  console.log(`Inspecting account ${acc.id} '${acc.name}' balance=${acc.balance}`)

  const txns = await prisma.cashTransaction.findMany({ where: { accountId }, orderBy: { createdAt: 'asc' } })
  console.log(`Found ${txns.length} transactions for this account`)

  let credit = 0, debit = 0
  for (const t of txns) {
    const amt = Number(t.amount)
    if (CREDIT_TYPES.has(t.type)) credit += amt
    else if (DEBIT_TYPES.has(t.type)) debit += amt
    else credit += amt
  }

  console.log(`  Credits total: ${credit}`)
  console.log(`  Debits total:  ${debit}`)
  console.log(`  Net (credits - debits): ${credit - debit}`)

  console.log('\nRecent transactions (last 20):')
  txns.slice(-20).forEach(t => console.log(`  id=${t.id} type=${t.type} amount=${t.amount} ref=${t.reference} user=${t.userId} createdAt=${t.createdAt}`))

  await prisma.$disconnect()
}

main().catch((e)=>{ console.error(e); prisma.$disconnect() })
