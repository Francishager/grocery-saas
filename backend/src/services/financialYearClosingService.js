import { createHash } from 'node:crypto'
import { accountCashBalances, ledgerBalanceSheet, postedJournalWhere } from '../utils/reportAccounting.js'

const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const startOfUtcDay = value => {
  const date = value instanceof Date
    ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
    : new Date(`${String(value || '').slice(0, 10)}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) ? date : null
}
const endOfUtcDay = date => new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1)

function validatePeriod(startDate, endDate) {
  const start = startOfUtcDay(startDate)
  const end = startOfUtcDay(endDate)
  if (!start || !end || end < start) {
    const error = new Error('Choose valid financial-year start and end dates.')
    error.statusCode = 400
    throw error
  }
  return { start, end: endOfUtcDay(end) }
}

function sum(rows, key = 'balance') {
  return round(rows.reduce((total, row) => total + Number(row[key] || 0), 0))
}

async function loadFinancialYearBalances(client, tenantId, asOf) {
  const accounts = await client.account.findMany({ where: { tenantId, createdAt: { lte: asOf } }, orderBy: { code: 'asc' } })
  if (!accounts.length) return []
  const accountIds = accounts.map(account => account.id)
  const linkedCashIds = accounts.map(account => String(account.description || '').match(/cashAccount:([^\s]+)/)?.[1]).filter(Boolean)
  const [journalToDate, journalAfterDate, cashAccounts, cashAfterDate] = await Promise.all([
    client.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: accountIds }, entry: { tenantId, date: { lte: asOf }, ...postedJournalWhere } }, _sum: { debit: true, credit: true } }),
    client.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: accountIds }, entry: { tenantId, date: { gt: asOf }, ...postedJournalWhere } }, _sum: { debit: true, credit: true } }),
    linkedCashIds.length ? client.cashAccount.findMany({ where: { tenantId, id: { in: linkedCashIds } } }) : [],
    linkedCashIds.length ? client.cashTransaction.groupBy({ by: ['accountId', 'type'], where: { tenantId, accountId: { in: linkedCashIds }, createdAt: { gt: asOf } }, _sum: { amount: true } }) : [],
  ])
  const toDateByAccount = new Map(journalToDate.map(row => [row.accountId, Number(row._sum.debit || 0) - Number(row._sum.credit || 0)]))
  const afterByAccount = new Map(journalAfterDate.map(row => [row.accountId, Number(row._sum.debit || 0) - Number(row._sum.credit || 0)]))
  const cashBalances = accountCashBalances(cashAccounts, [], cashAfterDate)
  return accounts.map(account => {
    const debitNormal = ['asset', 'expense', 'expenses'].includes(String(account.type).toLowerCase())
    const sign = debitNormal ? 1 : -1
    const linkedCashId = String(account.description || '').match(/cashAccount:([^\s]+)/)?.[1]
    const balance = cashBalances.get(linkedCashId)?.closing ?? round(Number(account.balance || 0) - sign * Number(afterByAccount.get(account.id) || 0))
    const signedBalance = balance * sign
    const unjournaledBalance = round(signedBalance - Number(toDateByAccount.get(account.id) || 0))
    return { ...account, balance, debit: Math.max(0, signedBalance), credit: Math.max(0, -signedBalance), unjournaledBalance }
  })
}

export async function buildFinancialYearCloseSnapshot(prisma, tenantId, startValue, endValue) {
  const { start, end } = validatePeriod(startValue, endValue)
  const priorDay = new Date(start.getTime() - 1)
  const [business, openingAccounts, closingAccounts, periodEntries, draftCount, cutover] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, currency: true } }),
    loadFinancialYearBalances(prisma, tenantId, priorDay),
    loadFinancialYearBalances(prisma, tenantId, end),
    prisma.journalEntry.findMany({
      where: { tenantId, date: { gte: start, lte: end }, ...postedJournalWhere },
      select: { id: true, entryNo: true, date: true, reference: true, description: true, lines: { select: { debit: true, credit: true } } },
      orderBy: [{ date: 'asc' }, { entryNo: 'asc' }],
    }),
    prisma.journalEntry.count({ where: { tenantId, date: { gte: start, lte: end }, status: 'draft' } }),
    prisma.tenantAccountingCutover.findUnique({ where: { tenantId }, select: { exceptionCount: true, status: true } }),
  ])
  if (!business) {
    const error = new Error('Business account not found.')
    error.statusCode = 404
    throw error
  }

  const periodMovement = new Map()
  const unbalancedEntries = []
  for (const entry of periodEntries) {
    const debit = round(entry.lines.reduce((total, line) => total + Number(line.debit || 0), 0))
    const credit = round(entry.lines.reduce((total, line) => total + Number(line.credit || 0), 0))
    if (Math.abs(debit - credit) >= 0.01) unbalancedEntries.push({ id: entry.id, entryNo: entry.entryNo, debit, credit, difference: round(debit - credit) })
  }
  const periodRows = periodEntries.length ? await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { entry: { tenantId, date: { gte: start, lte: end }, ...postedJournalWhere } },
    _sum: { debit: true, credit: true },
  }) : []
  for (const row of periodRows) periodMovement.set(row.accountId, { debit: Number(row._sum.debit || 0), credit: Number(row._sum.credit || 0) })

  const revenue = closingAccounts.filter(account => ['income', 'revenue'].includes(String(account.type).toLowerCase())).map(account => ({
    ...account,
    amount: round((periodMovement.get(account.id)?.credit || 0) - (periodMovement.get(account.id)?.debit || 0)),
  }))
  const expenses = closingAccounts.filter(account => ['expense', 'expenses'].includes(String(account.type).toLowerCase())).map(account => ({
    ...account,
    amount: round((periodMovement.get(account.id)?.debit || 0) - (periodMovement.get(account.id)?.credit || 0)),
  }))
  const incomeStatement = {
    revenue: revenue.map(account => ({ id: account.id, code: account.code, name: account.name, amount: account.amount })),
    expenses: expenses.map(account => ({ id: account.id, code: account.code, name: account.name, amount: account.amount })),
    totalRevenue: sum(revenue, 'amount'),
    totalExpenses: sum(expenses, 'amount'),
    netResult: round(sum(revenue, 'amount') - sum(expenses, 'amount')),
  }
  const balanceSheet = ledgerBalanceSheet(closingAccounts)
  const trialDebit = sum(closingAccounts, 'debit')
  const trialCredit = sum(closingAccounts, 'credit')
  const unjournaledAccounts = closingAccounts.filter(account => Math.abs(Number(account.unjournaledBalance || 0)) >= 0.01)
  const hasCutoverExceptions = Number(cutover?.exceptionCount || 0) > 0
  const checks = [
    { id: 'trial_balance', label: 'Trial balance agrees at year-end', passed: Math.abs(trialDebit - trialCredit) < 0.01, severity: 'blocking', detail: `Debits ${trialDebit}; credits ${trialCredit}; variance ${round(trialDebit - trialCredit)}.` },
    { id: 'balance_sheet', label: 'Balance sheet balances at year-end', passed: balanceSheet.isBalanced, severity: 'blocking', detail: `Assets ${balanceSheet.totalAssets}; liabilities and equity ${round(balanceSheet.totalLiabilities + balanceSheet.totalEquity)}; variance ${balanceSheet.difference}.` },
    { id: 'journal_entries', label: 'Posted entries in the period are balanced', passed: unbalancedEntries.length === 0, severity: 'blocking', detail: unbalancedEntries.length ? `${unbalancedEntries.length} posted journal entries do not balance.` : `${periodEntries.length} posted journal entries checked.` },
    { id: 'draft_entries', label: 'No draft journals remain in the period', passed: draftCount === 0, severity: 'blocking', detail: `${draftCount} draft journal entries dated in the period.` },
    { id: 'unjournaled_balances', label: 'Year-end balances are supported by the ledger', passed: unjournaledAccounts.length === 0, severity: 'blocking', detail: unjournaledAccounts.length ? `${unjournaledAccounts.length} account balances are not represented by journal lines: ${unjournaledAccounts.slice(0, 8).map(account => `${account.code} ${account.name}`).join(', ')}${unjournaledAccounts.length > 8 ? ', and more' : ''}.` : 'All reported account balances reconcile to posted journal lines.' },
    { id: 'cutover_exceptions', label: 'Accounting cutover differences are resolved', passed: !hasCutoverExceptions, severity: 'blocking', detail: hasCutoverExceptions ? `${cutover.exceptionCount} retained cutover differences still need review.` : 'No unresolved cutover differences reported.' },
  ]
  const serializable = {
    business: { name: business.name, currency: business.currency || 'UGX' },
    period: { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) },
    generatedAt: new Date().toISOString(),
    checks,
    summary: { trialDebit, trialCredit, trialVariance: round(trialDebit - trialCredit), netResult: incomeStatement.netResult, totalAssets: balanceSheet.totalAssets, totalLiabilities: balanceSheet.totalLiabilities, totalEquity: balanceSheet.totalEquity, journalCount: periodEntries.length },
    incomeStatement,
    balanceSheet: {
      totalAssets: balanceSheet.totalAssets, totalLiabilities: balanceSheet.totalLiabilities, totalEquity: balanceSheet.totalEquity,
      difference: balanceSheet.difference,
      assets: balanceSheet.assets.map(account => ({ id: account.id, code: account.code, name: account.name, amount: round(account.balance) })),
      liabilities: balanceSheet.liabilities.map(account => ({ id: account.id, code: account.code, name: account.name, amount: round(account.balance) })),
      equity: balanceSheet.equity.map(account => ({ id: account.id, code: account.code, name: account.name, amount: round(account.balance) })),
    },
    trialBalance: closingAccounts.map(account => ({ id: account.id, code: account.code, name: account.name, type: account.type, debit: round(account.debit), credit: round(account.credit), movementDebit: round(periodMovement.get(account.id)?.debit || 0), movementCredit: round(periodMovement.get(account.id)?.credit || 0), openingBalance: round(openingAccounts.find(opening => opening.id === account.id)?.balance || 0), unjournaledBalance: round(account.unjournaledBalance || 0) })),
    unbalancedEntries,
    limitations: ['This management close pack is prepared from recorded JibuSales general-ledger data. It is not a tax return, an audit opinion, or a statutory filing.', 'Review tax schedules, notes, comparatives, source documents, and jurisdiction-specific filing requirements with the responsible accountant before submission.'],
  }
  serializable.snapshotHash = createHash('sha256').update(JSON.stringify(serializable)).digest('hex')
  return serializable
}
