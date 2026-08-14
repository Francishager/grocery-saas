import 'dotenv/config'
import prisma from '../src/db.js'

/**
 * Usage:
 *  node fix-staff-tillsheet.mjs --tenant <tenantId> --receipts RCP-... RCP-... [--apply]
 *
 * By default this script runs in dry-run mode and will only print planned adjustments.
 */
import process from 'process'

const CREDIT_TYPES = new Set(['sale', 'receipt', 'income', 'journal_in', 'transfer_in'])
const DEBIT_TYPES = new Set(['expense', 'payment', 'transfer', 'journal_out', 'transfer_out'])

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { receipts: [], tenant: null, apply: false }
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--tenant' && args[i + 1]) { out.tenant = args[i + 1]; i += 2; continue }
    if (a === '--receipts') {
      i++
      while (i < args.length && !args[i].startsWith('--')) { out.receipts.push(args[i]); i++ }
      continue
    }
    if (a === '--apply') { out.apply = true; i++; continue }
    i++
  }
  return out
}

async function main() {
  const { receipts, tenant, apply } = parseArgs()
  if (!tenant || !receipts.length) {
    console.error('Usage: node fix-staff-tillsheet.mjs --tenant <tenantId> --receipts RCP-... RCP-... [--apply]')
    process.exit(1)
  }

  console.log('Tenant:', tenant)
  console.log('Receipts:', receipts.join(', '))
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN')

  for (const receiptNo of receipts) {
    const sale = await prisma.sale.findFirst({ where: { tenantId: tenant, receiptNo }, include: { user: true } })
    if (!sale) {
      console.warn(`Sale not found for receipt ${receiptNo} (tenant ${tenant})`)
      // If no sale exists but there are cash transactions referencing this receipt, we'll plan to reverse them
      const txnsOrphan = await prisma.cashTransaction.findMany({ where: { tenantId: tenant, reference: receiptNo } })
      if (!txnsOrphan.length) {
        console.log('No related cash transactions found either. Skipping.')
        continue
      }

      let netOrphan = 0
      for (const t of txnsOrphan) {
        if (CREDIT_TYPES.has(t.type)) netOrphan += Number(t.amount)
        else if (DEBIT_TYPES.has(t.type)) netOrphan -= Number(t.amount)
        else netOrphan += Number(t.amount)
      }

      console.log(`Found ${txnsOrphan.length} orphan cash transaction(s) referencing ${receiptNo}, net amount=${netOrphan}`)
      const plannedDelta = -Math.round(netOrphan * 100) / 100
      console.log(`Planned reversal delta: ${plannedDelta} (will ${plannedDelta > 0 ? 'credit' : 'debit'})`)
      if (!apply) continue

      // Apply reversal by creating an opposite transaction against the same account
      const accountId = txnsOrphan[0].accountId
      await prisma.$transaction(async (tx) => {
        const acc = await tx.cashAccount.findUnique({ where: { id: accountId } })
        if (!acc) throw new Error(`Cash account ${accountId} not found`)

        const newBalance = Math.round((acc.balance + plannedDelta) * 100) / 100
        await tx.cashAccount.update({ where: { id: accountId }, data: { balance: newBalance } })

        const adjType = plannedDelta > 0 ? 'journal_in' : 'journal_out'
        const adjAmount = Math.abs(plannedDelta)

        const created = await tx.cashTransaction.create({
          data: {
            tenantId: tenant,
            accountId,
            type: adjType,
            amount: adjAmount,
            balanceAfter: newBalance,
            reference: receiptNo,
            description: `Reversal: orphan cash transactions for ${receiptNo}`,
            userId: txnsOrphan[0].userId || 'system',
          },
        })

        console.log(`Created reversal transaction id=${created.id} amount=${created.amount} newBalance=${newBalance}`)
      })

      continue
    }

    console.log(`\nFound sale: id=${sale.id} receipt=${sale.receiptNo} total=${sale.total} userId=${sale.userId}`)

    const txns = await prisma.cashTransaction.findMany({ where: { tenantId: tenant, reference: sale.receiptNo } })
    if (!txns.length) {
      console.log('No cash transactions found referencing this receipt.')
    } else {
      console.log(`Found ${txns.length} cash transaction(s) referencing ${sale.receiptNo}:`)
      for (const t of txns) console.log(`  txn id=${t.id} accountId=${t.accountId} userId=${t.userId} type=${t.type} amount=${t.amount}`)
    }

    // Compute net credited amount for this receipt across found transactions
    let netExisting = 0
    for (const t of txns) {
      if (CREDIT_TYPES.has(t.type)) netExisting += Number(t.amount)
      else if (DEBIT_TYPES.has(t.type)) netExisting -= Number(t.amount)
      else netExisting += Number(t.amount) // unknown -> treat as credit
    }

    console.log(`Net existing amount for receipt ${sale.receiptNo}: ${netExisting}`)
    const desired = Number(sale.total || 0)
    const delta = Math.round((desired - netExisting) * 100) / 100
    if (delta === 0) {
      console.log('No adjustment required; sale total matches recorded transactions.')
      continue
    }

    console.log(`Planned adjustment: ${delta > 0 ? 'credit' : 'debit'} ${Math.abs(delta)} to align with sale total ${desired}`)

    if (!apply) continue

    // Choose account for adjustment: prefer account from first txn, else user's assigned cash account
    let accountId = txns.length ? txns[0].accountId : null
    if (!accountId) {
      const user = await prisma.user.findUnique({ where: { id: sale.userId } })
      accountId = user?.cashAccountId || null
    }

    if (!accountId) {
      console.error('No cash account available to apply adjustment. Skipping.')
      continue
    }

    await prisma.$transaction(async (tx) => {
      const acc = await tx.cashAccount.findUnique({ where: { id: accountId } })
      if (!acc) throw new Error(`Cash account ${accountId} not found`)

      const newBalance = Math.round((acc.balance + delta) * 100) / 100

      await tx.cashAccount.update({ where: { id: accountId }, data: { balance: newBalance } })

      const adjType = delta > 0 ? 'journal_in' : 'journal_out'
      const adjAmount = Math.abs(delta)

      const created = await tx.cashTransaction.create({
        data: {
          tenantId: tenant,
          accountId,
          type: adjType,
          amount: adjAmount,
          balanceAfter: newBalance,
          reference: sale.receiptNo,
          description: `Adjustment to align till with sale ${sale.receiptNo}`,
          userId: sale.userId || acc.assignedUserId || 'system',
        },
      })

      console.log(`Created adjustment transaction id=${created.id} amount=${created.amount} newBalance=${newBalance}`)
    })
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Script error:', err)
  prisma.$disconnect().catch(() => {})
  process.exit(2)
})
