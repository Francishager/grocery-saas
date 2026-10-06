import { ensureTenantAccountingSetup } from './tenantAccountingSetupService.js'
import { linkedCashAccountId } from '../utils/accountingSync.js'

const money = (value) => Math.round((Number(value) || 0) * 100) / 100
const debitNormal = (type) => ['asset', 'expense', 'expenses'].includes(String(type || '').toLowerCase())
const normalBalance = (account, debit, credit) => debitNormal(account.type) ? debit - credit : credit - debit
async function fingerprint(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
const postedOrReversed = { OR: [{ status: 'posted' }, { status: 'reversed', reversalJournalId: { not: null } }] }

async function buildPlan(client, tenantId) {
  const [accounts, lines, customers, suppliers, cashAccounts, arConfig, apConfig] = await Promise.all([
    client.account.findMany({ where: { tenantId, isActive: true }, include: { _count: { select: { children: true } } }, orderBy: { code: 'asc' } }),
    client.journalLine.findMany({ where: { entry: { tenantId, ...postedOrReversed } }, select: { accountId: true, debit: true, credit: true }, orderBy: { id: 'asc' } }),
    client.customer.findMany({ where: { tenantId }, select: { id: true, name: true, balance: true }, orderBy: { id: 'asc' } }),
    client.supplier.findMany({ where: { tenantId }, select: { id: true, name: true, balance: true }, orderBy: { id: 'asc' } }),
    client.cashAccount.findMany({ where: { tenantId }, select: { id: true, name: true, balance: true }, orderBy: { id: 'asc' } }),
    client.receivablesAccountingConfig.findUnique({ where: { tenantId } }),
    client.payablesAccountingConfig.findUnique({ where: { tenantId } }),
  ])
  const cashById = new Map(cashAccounts.map((row) => [row.id, row]))
  const totalCustomers = money(customers.reduce((sum, row) => sum + Number(row.balance || 0), 0))
  const totalSuppliers = money(suppliers.reduce((sum, row) => sum + Number(row.balance || 0), 0))
  const journalBalanceByAccount = new Map()
  for (const line of lines) {
    const account = accounts.find((row) => row.id === line.accountId)
    if (!account) continue
    journalBalanceByAccount.set(line.accountId, money((journalBalanceByAccount.get(line.accountId) || 0) + normalBalance(account, line.debit, line.credit)))
  }
  const openEquityId = arConfig?.openingBalanceEquityAccountId || apConfig?.openingBalanceEquityAccountId
  const snapshots = []
  const exceptions = []
  for (const account of accounts) {
    if (account.parentId || Number(account._count?.children || 0) || String(account.subType || '').toLowerCase() === 'category') continue
    const linkedId = linkedCashAccountId(account)
    const cash = linkedId ? cashById.get(linkedId) : null
    const target = money(cash
      ? cash.balance
      : account.id === arConfig?.receivableAccountId
        ? totalCustomers
        : account.id === apConfig?.payableAccountId
          ? totalSuppliers
          : account.balance)
    const journal = money(journalBalanceByAccount.get(account.id) || 0)
    const difference = money(target - journal)
    snapshots.push({ accountId: account.id, code: account.code, accountName: account.name, type: account.type, targetBalance: target, postedJournalBalance: journal, difference })
    if (Math.abs(difference) >= 0.01) exceptions.push({ key: `account:${account.id}`, type: 'account_balance', label: `${account.code} ${account.name}`, storedBalance: target, ledgerBalance: journal, difference, reviewStatus: 'included_in_snapshot' })
  }

  const ar = accounts.find((row) => row.id === arConfig?.receivableAccountId)
  const ap = accounts.find((row) => row.id === apConfig?.payableAccountId)
  const arJournal = ar ? money(journalBalanceByAccount.get(ar.id) || 0) : 0
  const apJournal = ap ? money(journalBalanceByAccount.get(ap.id) || 0) : 0
  if (ar && Math.abs(totalCustomers - arJournal) >= 0.01) exceptions.push({ key: 'subledger:receivables', type: 'subledger_control', label: 'Customer balances vs Accounts Receivable', storedBalance: totalCustomers, ledgerBalance: arJournal, difference: money(totalCustomers - arJournal), reviewStatus: 'open' })
  if (ap && Math.abs(totalSuppliers - apJournal) >= 0.01) exceptions.push({ key: 'subledger:payables', type: 'subledger_control', label: 'Supplier balances vs Accounts Payable', storedBalance: totalSuppliers, ledgerBalance: apJournal, difference: money(totalSuppliers - apJournal), reviewStatus: 'open' })
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  let openingDebit = 0
  let openingCredit = 0
  for (const row of snapshots) {
    if (row.accountId === openEquityId) continue
    const account = accountById.get(row.accountId)
    if (!account) continue
    openingDebit += debitNormal(account.type) ? Math.max(0, row.difference) : Math.max(0, -row.difference)
    openingCredit += debitNormal(account.type) ? Math.max(0, -row.difference) : Math.max(0, row.difference)
  }
  const openingEquityOffset = money(openingDebit - openingCredit)
  const payload = { tenantId, snapshots, exceptions, customerBalanceTotal: totalCustomers, supplierBalanceTotal: totalSuppliers, postedJournalLineCount: lines.length, openEquityAccountId: openEquityId, openingEquityOffset }
  return { ...payload, sourceFingerprint: await fingerprint(payload) }
}

export async function previewTenantAccountingCutover(client, tenantId) {
  return buildPlan(client, tenantId)
}

export async function applyTenantAccountingCutover(client, { tenantId, userId, confirmedFingerprint }) {
  if (!tenantId || !userId || !confirmedFingerprint) throw Object.assign(new Error('A tenant, signed-in user, and confirmed preview are required.'), { statusCode: 400 })
  const run = async (tx) => {
    const existing = await tx.tenantAccountingCutover.findUnique({ where: { tenantId } })
    if (existing) return { alreadyApplied: true, cutover: existing }
    await ensureTenantAccountingSetup(tx, { tenantId, userId, enableNewSetups: false })
    const plan = await buildPlan(tx, tenantId)
    if (plan.sourceFingerprint !== confirmedFingerprint) throw Object.assign(new Error('Business balances changed after preview. Refresh the preview before starting the cutover.'), { statusCode: 409 })
    const equity = plan.openEquityAccountId ? await tx.account.findFirst({ where: { id: plan.openEquityAccountId, tenantId, isActive: true } }) : null
    if (!equity) throw Object.assign(new Error('Automatic opening-equity account is not available; accounting setup must be repaired before cutover.'), { statusCode: 409 })

    const journalLines = []
    let debitTotal = 0
    let creditTotal = 0
    for (const row of plan.snapshots) {
      if (row.accountId === equity.id || Math.abs(row.difference) < 0.01) continue
      const account = await tx.account.findFirst({ where: { id: row.accountId, tenantId } })
      if (!account) continue
      const debit = debitNormal(account.type) ? Math.max(0, row.difference) : Math.max(0, -row.difference)
      const credit = debitNormal(account.type) ? Math.max(0, -row.difference) : Math.max(0, row.difference)
      if (!debit && !credit) continue
      debitTotal += debit
      creditTotal += credit
      journalLines.push({ accountId: account.id, debit: money(debit), credit: money(credit), description: `Opening snapshot at cutover: ${account.code} ${account.name}` })
    }
    const equityOffset = money(debitTotal - creditTotal)
    if (Math.abs(equityOffset) >= 0.01) journalLines.push({
      accountId: equity.id,
      debit: Math.max(0, -equityOffset),
      credit: Math.max(0, equityOffset),
      description: 'Legacy cutover offset; retained as an open review exception where applicable',
    })
    const balancedDebits = money(journalLines.reduce((sum, row) => sum + row.debit, 0))
    const balancedCredits = money(journalLines.reduce((sum, row) => sum + row.credit, 0))
    if (Math.abs(balancedDebits - balancedCredits) >= 0.01) throw Object.assign(new Error('Cutover snapshot did not balance; posting was stopped without changing tenant books.'), { statusCode: 409 })

    let journal = null
    if (journalLines.length) {
      journal = await tx.journalEntry.create({ data: {
        tenantId, userId, date: new Date(), status: 'posted', sourceType: 'TENANT_ACCOUNTING_CUTOVER', sourceId: tenantId,
        entryNo: `CUTOVER-${tenantId}`.slice(0, 64), reference: `CUTOVER-${tenantId}`.slice(0, 64),
        description: 'Opening balance snapshot for automated accounting cutover', lines: { create: journalLines },
      } })
      const accountIds = [...new Set(journalLines.map((line) => line.accountId))]
      const ledgerAccounts = await tx.account.findMany({ where: { tenantId, id: { in: accountIds } } })
      const byId = new Map(ledgerAccounts.map((row) => [row.id, row]))
      const deltas = new Map()
      for (const line of journalLines) {
        const account = byId.get(line.accountId)
        if (!account || linkedCashAccountId(account)) continue
        deltas.set(account.id, money((deltas.get(account.id) || 0) + normalBalance(account, line.debit, line.credit)))
      }
      for (const [accountId, delta] of deltas) await tx.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
    }

    const cutover = await tx.tenantAccountingCutover.create({ data: {
      tenantId, performedById: userId, sourceFingerprint: plan.sourceFingerprint,
      openingJournalId: journal?.id || null, snapshot: plan.snapshots, exceptions: plan.exceptions,
      exceptionCount: plan.exceptions.length, status: plan.exceptions.length ? 'active_with_exceptions' : 'active',
    } })
    await tx.receivablesAccountingConfig.update({ where: { tenantId }, data: { isEnabled: true } })
    await tx.payablesAccountingConfig.update({ where: { tenantId }, data: { isEnabled: true } })
    return { alreadyApplied: false, cutover }
  }
  if (typeof client.$transaction === 'function') {
    try {
      return await client.$transaction(run, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (['P2002', 'P2034', '40001'].includes(error?.code)) {
        const applied = await client.tenantAccountingCutover.findUnique({ where: { tenantId } })
        if (applied) return { alreadyApplied: true, cutover: applied }
        if (error?.code === 'P2034' || error?.code === '40001') throw Object.assign(new Error('Transactions changed during cutover. No changes were committed; refresh the preview and retry.'), { statusCode: 409 })
      }
      throw error
    }
  }
  return run(client)
}

