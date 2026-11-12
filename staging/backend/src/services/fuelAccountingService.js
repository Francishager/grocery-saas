import { cashAccountMarker, linkedCashAccountId } from '../utils/accountingSync.js'

const roles = [
  ['inventory', 'Fuel Inventory', '1310', 'asset', 'inventory'],
  ['supplierClearing', 'Fuel Supplier Clearing', '2025', 'liability', 'current_liability'],
  ['salesClearing', 'Fuel Sales Clearing', '1255', 'asset', 'current_asset'],
  ['creditReceivable', 'Fuel Credit Receivables', '1215', 'asset', 'current_asset'],
  ['fuelRevenue', 'Fuel Sales Revenue', '4100', 'revenue', 'operating_revenue'],
  ['lubricantRevenue', 'Lubricant Sales Revenue', '4150', 'revenue', 'operating_revenue'],
  ['carWashRevenue', 'Car Wash Revenue', '4160', 'revenue', 'operating_revenue'],
  ['fuelCogs', 'Fuel Cost of Sales', '5100', 'expense', 'cost_of_sales'],
  ['shiftExpense', 'Fuel Station Expenses', '6400', 'expense', 'operating_expense'],
  ['salesShortage', 'Fuel Shift Shortages', '6410', 'expense', 'operating_expense'],
  ['salesOverage', 'Fuel Shift Overages', '4170', 'revenue', 'other_revenue'],
  ['stockGain', 'Fuel Stock Adjustment Gains', '4180', 'revenue', 'other_revenue'],
  ['stockLoss', 'Fuel Stock Adjustment Losses', '6420', 'expense', 'operating_expense'],
  ['openingEquity', 'Fuel Opening Balance Equity', '3910', 'equity', 'opening_balance'],
]

const markerFor = (key) => `JibuSales fuel accounting role: ${key}`
const money = (value) => Math.round((Number(value) || 0) * 100) / 100
const debitNormal = (type) => ['asset', 'expense', 'expenses'].includes(String(type).toLowerCase())

export async function ensureFuelAccountingAccounts(tx, tenantId) {
  const accounts = await tx.account.findMany({ where: { tenantId }, include: { _count: { select: { children: true } } } })
  const result = {}
  for (const [key, name, baseCode, type, subType] of roles) {
    const marker = markerFor(key)
    const managed = accounts.find((account) => String(account.description || '').includes(marker))
    if (managed) {
      if (!managed.isActive || managed.type !== type || managed.parentId || managed._count.children) {
        throw Object.assign(new Error(`Fuel accounting account “${managed.name}” is inactive or not postable. Ask an accounting administrator to review it.`), { statusCode: 409 })
      }
      result[key] = managed
      continue
    }
    let code = `FUEL-${baseCode}`
    let suffix = 1
    while (accounts.some((account) => account.code === code)) code = `FUEL-${baseCode}-${suffix++}`
    const created = await tx.account.create({
      data: { tenantId, code, name: `${name} (JibuSales)`, type, subType, isActive: true, isSystemManaged: true, description: marker },
      include: { _count: { select: { children: true } } },
    })
    accounts.push(created)
    result[key] = created
  }
  return result
}

export async function ensureFuelLinkedAccount(tx, tenantId, cashAccount) {
  const marker = cashAccountMarker(cashAccount.id)
  let linked = await tx.account.findFirst({ where: { tenantId, description: { contains: marker } } })
  if (!linked) {
    let code = `TX-${cashAccount.id.slice(-8).toUpperCase()}`
    let suffix = 1
    while (await tx.account.findFirst({ where: { tenantId, code } })) code = `TX-${cashAccount.id.slice(-6).toUpperCase()}-${suffix++}`
    linked = await tx.account.create({
      data: { tenantId, code, name: cashAccount.name, type: 'asset', subType: `transaction_${cashAccount.type}`, balance: cashAccount.balance, branchId: cashAccount.branchId, description: `Linked transaction account ${marker}` },
    })
    return linked
  }
  if (linked.balance !== cashAccount.balance) linked = await tx.account.update({ where: { id: linked.id }, data: { balance: cashAccount.balance, name: cashAccount.name, type: 'asset', subType: `transaction_${cashAccount.type}`, isActive: cashAccount.isActive } })
  return linked
}

export async function postFuelJournal(tx, { tenantId, userId, branchId = null, sourceType, sourceId, date = new Date(), reference, description, lines }) {
  const existing = await tx.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: true } })
  if (existing) return { entry: existing, alreadyPosted: true }
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }))
    .filter((line) => line.debit || line.credit)
  if (!normalized.length || normalized.some((line) => line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))) {
    throw Object.assign(new Error('Fuel journal lines are invalid.'), { statusCode: 400 })
  }
  const debitTotal = money(normalized.reduce((sum, line) => sum + line.debit, 0))
  const creditTotal = money(normalized.reduce((sum, line) => sum + line.credit, 0))
  if (Math.abs(debitTotal - creditTotal) > 0.01) throw Object.assign(new Error(`Fuel journal is out of balance (debit ${debitTotal}, credit ${creditTotal}).`), { statusCode: 409 })
  const accountIds = [...new Set(normalized.map((line) => line.accountId))]
  const accounts = await tx.account.findMany({ where: { tenantId, id: { in: accountIds }, isActive: true } })
  if (accounts.length !== accountIds.length) throw Object.assign(new Error('A fuel journal account is missing, inactive, or belongs to another business.'), { statusCode: 409 })
  const byId = new Map(accounts.map((account) => [account.id, account]))
  if (accountIds.some((id) => byId.get(id).parentId)) throw Object.assign(new Error('Fuel journals cannot post to a parent account.'), { statusCode: 409 })

  const entryNo = `FUEL-${String(sourceId).replace(/[^a-zA-Z0-9]/g, '').slice(-40)}`
  const entry = await tx.journalEntry.create({
    data: {
      tenantId, branchId, userId, sourceType, sourceId, entryNo, date,
      reference: reference || sourceId, description, status: 'posted',
      lines: { create: normalized.map(({ accountId, debit, credit, description: lineDescription }) => ({ accountId, debit, credit, description: lineDescription || description })) },
    }, include: { lines: true },
  })
  const deltas = new Map()
  for (const line of normalized) {
    const account = byId.get(line.accountId)
    if (linkedCashAccountId(account)) continue
    const delta = debitNormal(account.type) ? line.debit - line.credit : line.credit - line.debit
    deltas.set(account.id, (deltas.get(account.id) || 0) + delta)
  }
  for (const [accountId, delta] of deltas) await tx.account.update({ where: { id: accountId }, data: { balance: { increment: money(delta) } } })
  return { entry, alreadyPosted: false }
}

export function fuelOpeningLines(accounts, value) {
  const amount = money(value)
  return amount > 0 ? [
    { accountId: accounts.inventory.id, debit: amount, credit: 0, description: 'Fuel opening inventory' },
    { accountId: accounts.openingEquity.id, debit: 0, credit: amount, description: 'Fuel opening balance equity' },
  ] : []
}

export function fuelDeliveryLines(accounts, amount) {
  const value = money(amount)
  return value > 0 ? [
    { accountId: accounts.inventory.id, debit: value, credit: 0, description: 'Fuel inventory received' },
    { accountId: accounts.supplierClearing.id, debit: 0, credit: value, description: 'Unallocated fuel supplier invoice balance' },
  ] : []
}

export function fuelMeterSaleLines(accounts, { revenue, cogs }) {
  const sales = money(revenue), cost = money(cogs)
  return [
    ...(sales > 0 ? [
      { accountId: accounts.salesClearing.id, debit: sales, credit: 0, description: 'Metered fuel sales pending shift allocation' },
      { accountId: accounts.fuelRevenue.id, debit: 0, credit: sales, description: 'Fuel sales revenue' },
    ] : []),
    ...(cost > 0 ? [
      { accountId: accounts.fuelCogs.id, debit: cost, credit: 0, description: 'Fuel cost of sales' },
      { accountId: accounts.inventory.id, debit: 0, credit: cost, description: 'Fuel inventory relieved at weighted-average cost' },
    ] : []),
  ]
}

export function fuelShiftJournalLines(accounts, {
  cashAccountId, mobileAccountId, expenseAccountId, expectedFuelSales, cashSales,
  mobileSales, creditSales, lubricantSales, carWashIncome, expenses, variance,
}) {
  const amount = (value) => money(value)
  const lines = []
  if (amount(cashSales) > 0) lines.push({ accountId: cashAccountId, debit: amount(cashSales), credit: 0, description: 'Cash fuel sales collected' })
  if (amount(mobileSales) > 0) lines.push({ accountId: mobileAccountId, debit: amount(mobileSales), credit: 0, description: 'Mobile money fuel sales collected' })
  if (amount(creditSales) > 0) lines.push({ accountId: accounts.creditReceivable.id, debit: amount(creditSales), credit: 0, description: 'Fuel credit sales receivable control' })
  if (amount(expectedFuelSales) > 0) lines.push({ accountId: accounts.salesClearing.id, debit: 0, credit: amount(expectedFuelSales), description: 'Allocate metered fuel sales to payment channels' })
  if (amount(lubricantSales) > 0) lines.push({ accountId: accounts.lubricantRevenue.id, debit: 0, credit: amount(lubricantSales), description: 'Lubricant sales revenue' })
  if (amount(carWashIncome) > 0) lines.push({ accountId: accounts.carWashRevenue.id, debit: 0, credit: amount(carWashIncome), description: 'Car wash revenue' })
  if (Math.abs(amount(variance)) > 0.01) lines.push(amount(variance) < 0
    ? { accountId: accounts.salesShortage.id, debit: Math.abs(amount(variance)), credit: 0, description: 'Fuel shift shortage pending independent review' }
    : { accountId: accounts.salesOverage.id, debit: 0, credit: amount(variance), description: 'Fuel shift overage pending independent review' })
  if (amount(expenses) > 0) lines.push(
    { accountId: accounts.shiftExpense.id, debit: amount(expenses), credit: 0, description: 'Fuel station shift expenses' },
    { accountId: expenseAccountId, debit: 0, credit: amount(expenses), description: 'Payment of fuel shift expenses' },
  )
  return lines
}
