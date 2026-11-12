import 'dotenv/config'
import prisma from '../src/db.js'

import process from 'process'

const CREDIT_TYPES = new Set(['sale', 'receipt', 'income', 'journal_in', 'transfer_in'])
const DEBIT_TYPES = new Set(['expense', 'payment', 'transfer', 'journal_out', 'transfer_out'])

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { tenant: null, user: null }
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--tenant' && args[i + 1]) { out.tenant = args[i + 1]; i += 2; continue }
    if (a === '--user' && args[i + 1]) { out.user = args[i + 1]; i += 2; continue }
    i++
  }
  return out
}

async function main() {
  const { tenant, user } = parseArgs()
  if (!tenant || !user) {
    console.error('Usage: node inspect-staff-till.mjs --tenant <tenantId> --user <userId>')
    process.exit(1)
  }

  const staff = await prisma.user.findUnique({ where: { id: user }, select: { id: true, fname: true, lname: true, cashAccountId: true } })
  if (!staff) {
    console.error('User not found:', user)
    process.exit(1)
  }

  console.log(`Inspecting till for user ${staff.id} (${staff.fname} ${staff.lname}) tenant=${tenant}`)

  const accountId = staff.cashAccountId
  const orClause = accountId ? { OR: [{ userId: user }, { accountId }] } : { userId: user }

  const txns = await prisma.cashTransaction.findMany({
    where: { tenantId: tenant, ...orClause },
    orderBy: { createdAt: 'desc' }
  })

  console.log(`Found ${txns.length} cash transactions for this user/account`)

  let credit = 0
  let debit = 0
  for (const t of txns) {
    const amt = Number(t.amount)
    if (CREDIT_TYPES.has(t.type)) credit += amt
    else if (DEBIT_TYPES.has(t.type)) debit += amt
    else credit += amt
  }

  const net = credit - debit

  console.log(`Totals for tenant ${tenant} / user ${user}:`)
  console.log(`  Credit total: ${credit}`)
  console.log(`  Debit total:  ${debit}`)
  console.log(`  Net (credit-debit): ${net}`)

  if (accountId) {
    const acc = await prisma.cashAccount.findUnique({ where: { id: accountId } })
    if (acc) console.log(`Assigned cash account ${acc.id} '${acc.name}' balance=${acc.balance}`)
  }

  // Also show transactions with amount 10000000 or reference containing 'NALONGO' or similar
  const matches = txns.filter(t => Number(t.amount) === 10000000 || (t.reference && String(t.reference).toLowerCase().includes('nalongo')))
  if (matches.length) {
    console.log(`
Transactions matching amount=10000000 or reference includes 'nalongo':`)
    for (const t of matches) console.log(`  id=${t.id} accountId=${t.accountId} userId=${t.userId} type=${t.type} amount=${t.amount} reference=${t.reference} createdAt=${t.createdAt}`)
  }

  // Also compute today's totals (local date)
  const todayStart = new Date()
  todayStart.setHours(0,0,0,0)
  const todayTxns = txns.filter(t => new Date(t.createdAt) >= todayStart)
  let todayCredit = 0, todayDebit = 0
  for (const t of todayTxns) {
    const amt = Number(t.amount)
    if (CREDIT_TYPES.has(t.type)) todayCredit += amt
    else if (DEBIT_TYPES.has(t.type)) todayDebit += amt
    else todayCredit += amt
  }
  console.log(`\nToday's transactions count: ${todayTxns.length}`)
  console.log(`  Today credit: ${todayCredit}`)
  console.log(`  Today debit:  ${todayDebit}`)
  console.log(`  Today net:    ${todayCredit - todayDebit}`)

  await prisma.$disconnect()
}

main().catch((err) => { console.error(err); prisma.$disconnect().catch(()=>{}); process.exit(2) })
