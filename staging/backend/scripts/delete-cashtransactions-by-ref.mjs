import 'dotenv/config'
import prisma from '../src/db.js'
import fs from 'fs'

// Usage: node delete-cashtransactions-by-ref.mjs --refs RCP-... RCP-... [--apply]

const args = process.argv.slice(2)
const out = { refs: [], apply: false }
let i = 0
while (i < args.length) {
  const a = args[i]
  if (a === '--refs') { i++; while (i < args.length && !args[i].startsWith('--')) { out.refs.push(args[i]); i++ } continue }
  if (a === '--apply') { out.apply = true; i++; continue }
  i++
}

if (!out.refs.length) {
  console.error('Usage: node delete-cashtransactions-by-ref.mjs --refs RCP-... RCP-... [--apply]')
  process.exit(1)
}

async function main() {
  console.log('Refs:', out.refs.join(', '), 'Mode:', out.apply ? 'APPLY' : 'DRY-RUN')

  const allToDelete = []
  for (const r of out.refs) {
    const txns = await prisma.cashTransaction.findMany({ where: { reference: r } })
    if (!txns.length) {
      console.log(`No transactions found for reference ${r}`)
      continue
    }
    console.log(`Found ${txns.length} txns for ${r}:`)
    for (const t of txns) {
      console.log(`  id=${t.id} tenant=${t.tenantId} accountId=${t.accountId} userId=${t.userId} type=${t.type} amount=${t.amount}`)
      allToDelete.push(t)
    }
  }

  if (!allToDelete.length) {
    console.log('Nothing to delete.')
    await prisma.$disconnect()
    return
  }

  if (!out.apply) {
    console.log('\nDry-run complete. To delete these transactions, re-run with --apply')
    await prisma.$disconnect()
    return
  }

  const backupPath = `./tmp/cashtransactions-backup-${Date.now()}.json`
  fs.mkdirSync('./tmp', { recursive: true })
  fs.writeFileSync(backupPath, JSON.stringify(allToDelete, null, 2))
  console.log('Backed up transactions to', backupPath)

  const ids = allToDelete.map(t => t.id)
  const deleted = await prisma.cashTransaction.deleteMany({ where: { id: { in: ids } } })
  console.log(`Deleted ${deleted.count} transactions`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); prisma.$disconnect() })
