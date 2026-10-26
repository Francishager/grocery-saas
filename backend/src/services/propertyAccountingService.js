import { cashAccountMarker, linkedCashAccountId } from '../utils/accountingSync.js'

const money = value => Math.round((Number(value) || 0) * 100) / 100
const roles = [
  ['rentReceivableAccountId', 'Property Rent Receivable', 'PM-1210', 'asset', 'current_asset'],
  ['rentIncomeAccountId', 'Property Rental Income', 'PM-4200', 'revenue', 'operating_revenue'],
  ['ownerPayableAccountId', 'Landlord Funds Payable', 'PM-2200', 'liability', 'current_liability'],
  ['depositLiabilityAccountId', 'Tenant Security Deposits Payable', 'PM-2250', 'liability', 'current_liability'],
  ['depositOpeningEquityAccountId', 'Property Deposit Opening Balance Equity', 'PM-3900', 'equity', 'opening_balance'],
  ['landSaleReceivableAccountId', 'Land Sale Receivable', 'PM-1220', 'asset', 'current_asset'],
  ['landSaleRevenueAccountId', 'Land Sale Revenue', 'PM-4300', 'revenue', 'operating_revenue'],
  ['landInventoryAccountId', 'Land Held for Sale', 'PM-1310', 'asset', 'inventory'],
  ['landCostOfSalesAccountId', 'Land Cost of Sales', 'PM-5300', 'expense', 'cost_of_sales'],
  ['saleCommissionRevenueAccountId', 'Property Sale Commission Revenue', 'PM-4310', 'revenue', 'operating_revenue'],
  ['saleOwnerPayableAccountId', 'Landowner Sale Proceeds Payable', 'PM-2210', 'liability', 'current_liability'],
  ['saleCustomerAdvanceAccountId', 'Plot Buyer Advances', 'PM-2260', 'liability', 'current_liability'],
  ['landInventoryOpeningEquityAccountId', 'Land Inventory Opening Equity', 'PM-3910', 'equity', 'opening_balance'],
]
const markerFor = role => `JibuSales property accounting role: ${role}`
const sourceName = (type, id) => `${type}-${id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
const debitNormal = type => ['asset', 'expense', 'expenses'].includes(String(type || '').toLowerCase())

async function ensureAccount(tx, tenantId, role, name, baseCode, type, subType, allAccounts) {
  const marker = markerFor(role)
  const existing = allAccounts.find(row => row.description === marker)
  if (existing) {
    const postable = existing.isActive && existing.type === type && !existing.parentId && !existing._count?.children && String(existing.subType || '').toLowerCase() !== 'category'
    if (!postable) throw Object.assign(new Error(`System account “${existing.name}” for Property Management is inactive or not postable.`), { statusCode: 409 })
    return existing
  }
  let code = baseCode, suffix = 1
  while (allAccounts.some(row => row.code === code)) code = `${baseCode}-${suffix++}`
  const account = await tx.account.create({
    data: { tenantId, code, name: `${name} (JibuSales)`, type, subType, isActive: true, isSystemManaged: true, description: marker },
    include: { _count: { select: { children: true } } },
  })
  allAccounts.push(account)
  return account
}

export async function ensurePropertyAccounting(tx, tenantId) {
  const accounts = await tx.account.findMany({ where: { tenantId }, include: { _count: { select: { children: true } } } })
  const values = {}
  for (const [field, name, code, type, subType] of roles) {
    const role = field.replace('AccountId', '')
    values[field] = (await ensureAccount(tx, tenantId, role, name, code, type, subType, accounts)).id
  }
  const distinct = new Set(Object.values(values))
  if (distinct.size !== roles.length) throw Object.assign(new Error('Property Management system accounts must be distinct.'), { statusCode: 409 })
  return tx.propertyAccountingConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...values, isEnabled: true, isSystemManaged: true },
    update: { ...values, isEnabled: true, isSystemManaged: true },
    include: { rentReceivableAccount: true, rentIncomeAccount: true, ownerPayableAccount: true, depositLiabilityAccount: true },
  })
}

export async function ensurePropertyCashLedgerAccount(tx, tenantId, cashAccount) {
  const marker = cashAccountMarker(cashAccount.id)
  let account = await tx.account.findFirst({ where: { tenantId, description: { contains: marker } } })
  if (!account) {
    const baseCode = `TX-${cashAccount.id.slice(-8).toUpperCase()}`
    let code = baseCode, suffix = 1
    while (await tx.account.findFirst({ where: { tenantId, code } })) code = `${baseCode}-${suffix++}`
    account = await tx.account.create({ data: { tenantId, code, name: cashAccount.name, type: 'asset', subType: `transaction_${cashAccount.type}`, balance: cashAccount.balance, branchId: cashAccount.branchId, isSystemManaged: true, description: `Linked transaction account ${marker}` } })
    return account
  }
  if (account.type !== 'asset' || linkedCashAccountId(account) !== cashAccount.id) throw Object.assign(new Error(`Linked chart account for ${cashAccount.name} is invalid; ask an accounting administrator to review it.`), { statusCode: 409 })
  return tx.account.update({ where: { id: account.id }, data: { name: cashAccount.name, subType: `transaction_${cashAccount.type}`, balance: cashAccount.balance, branchId: cashAccount.branchId, isActive: cashAccount.isActive } })
}

export async function recordPropertyCashMovement(tx, { tenantId, userId, cashAccount, amount, direction, reference, description }) {
  const value = money(amount)
  if (!(value > 0)) throw Object.assign(new Error('Cash movement amount must be greater than zero.'), { statusCode: 400 })
  await tx.$queryRaw`SELECT "id" FROM "cash_accounts" WHERE "id" = ${cashAccount.id} AND "tenantId" = ${tenantId} FOR UPDATE`
  const current = await tx.cashAccount.findFirst({ where: { id: cashAccount.id, tenantId, isActive: true } })
  if (!current) throw Object.assign(new Error('Selected transaction account is unavailable.'), { statusCode: 409 })
  if (direction === 'expense' && Number(current.balance) + 0.001 < value) throw Object.assign(new Error(`Insufficient balance in ${current.name}; available ${money(current.balance).toLocaleString()}.`), { statusCode: 409 })
  const updated = await tx.cashAccount.update({ where: { id: current.id }, data: { balance: { [direction === 'receipt' ? 'increment' : 'decrement']: value } } })
  await tx.cashTransaction.create({ data: { tenantId, accountId: updated.id, type: direction === 'receipt' ? 'income' : 'expense', amount: value, balanceAfter: updated.balance, reference, description, userId } })
  const ledgerAccount = await ensurePropertyCashLedgerAccount(tx, tenantId, updated)
  return { cashAccount: updated, ledgerAccount }
}

export async function postPropertyJournal(tx, { tenantId, branchId = null, userId, sourceType, sourceId, date = new Date(), reference, description, lines }) {
  const config = await ensurePropertyAccounting(tx, tenantId)
  const normalized = lines.map(line => ({ accountId: line.accountId, debit: money(line.debit), credit: money(line.credit), description: line.description || description }))
    .filter(line => line.debit || line.credit)
  if (!normalized.length || normalized.some(line => line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))) throw Object.assign(new Error('Property journal lines are invalid.'), { statusCode: 400 })
  const debit = money(normalized.reduce((sum, line) => sum + line.debit, 0))
  const credit = money(normalized.reduce((sum, line) => sum + line.credit, 0))
  if (Math.abs(debit - credit) > 0.01) throw Object.assign(new Error(`Property journal is out of balance (debit ${debit}, credit ${credit}).`), { statusCode: 409 })
  const prior = await tx.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: true } })
  if (prior) return { entry: prior, duplicate: true }
  const ids = [...new Set(normalized.map(line => line.accountId))]
  const accounts = await tx.account.findMany({ where: { tenantId, id: { in: ids }, isActive: true }, include: { _count: { select: { children: true } } } })
  if (accounts.length !== ids.length || accounts.some(account => account._count.children || account.parentId || account.subType === 'category')) throw Object.assign(new Error('A property journal account is inactive, invalid, or not postable.'), { statusCode: 409 })
  const byId = new Map(accounts.map(account => [account.id, account]))
  const entry = await tx.journalEntry.create({
    data: {
      tenantId, branchId, userId, sourceType, sourceId,
      entryNo: sourceName('PM', `${sourceType}-${sourceId}-${Date.now()}`),
      date, reference: reference || sourceId, description, status: 'posted',
      lines: { create: normalized },
    }, include: { lines: true },
  })
  const deltas = new Map()
  for (const line of normalized) {
    const account = byId.get(line.accountId)
    if (linkedCashAccountId(account)) continue
    const delta = debitNormal(account.type) ? line.debit - line.credit : line.credit - line.debit
    deltas.set(account.id, money((deltas.get(account.id) || 0) + delta))
  }
  for (const [accountId, delta] of deltas) await tx.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
  return { entry, duplicate: false, config }
}

export async function reversePropertyJournal(tx, { tenantId, sourceType, sourceId, userId, reason }) {
  const original = await tx.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: { include: { account: true } } } })
  if (!original || original.status === 'reversed' || original.reversalJournalId) return null
  const now = new Date()
  const reversalLines = original.lines.map(line => ({ accountId: line.accountId, debit: money(line.credit), credit: money(line.debit), description: `Reversal of ${original.entryNo}: ${reason}` }))
  const reversal = await tx.journalEntry.create({
    data: {
      tenantId, branchId: original.branchId, userId,
      sourceType: 'PROPERTY_GL_REVERSAL', sourceId: original.id,
      entryNo: sourceName('PM-REV', `${original.id}-${Date.now()}`), date: now,
      reference: original.reference || original.entryNo, description: `Reversal of ${original.entryNo}: ${reason}`,
      status: 'posted', reversalOfId: original.id, reversalReason: reason,
      lines: { create: reversalLines },
    },
  })
  await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'reversed', reversalJournalId: reversal.id, reversalReason: reason, reversedBy: userId, reversedAt: now } })
  const deltas = new Map()
  for (const line of reversalLines) {
    const account = original.lines.find(item => item.accountId === line.accountId)?.account
    if (!account || linkedCashAccountId(account)) continue
    const delta = debitNormal(account.type) ? line.debit - line.credit : line.credit - line.debit
    deltas.set(account.id, money((deltas.get(account.id) || 0) + delta))
  }
  for (const [accountId, delta] of deltas) await tx.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
  return reversal
}

export function propertyRentChargeLines(config, { amount, managed, description }) {
  const value = money(amount)
  return [
    { accountId: config.rentReceivableAccountId, debit: value, credit: 0, description: `${description} receivable` },
    { accountId: managed ? config.ownerPayableAccountId : config.rentIncomeAccountId, debit: 0, credit: value, description: managed ? `${description} due to property owner` : `${description} rental income` },
  ]
}

export function propertyRentReceiptLines(config, { amount, cashAccountLedgerId, reference }) {
  const value = money(amount)
  return [
    { accountId: cashAccountLedgerId, debit: value, credit: 0, description: `Rent receipt ${reference}` },
    { accountId: config.rentReceivableAccountId, debit: 0, credit: value, description: `Tenant rent receivable settled ${reference}` },
  ]
}

export function propertyDepositReceiptLines(config, { amount, cashAccountLedgerId, reference }) {
  const value = money(amount)
  return [
    { accountId: cashAccountLedgerId, debit: value, credit: 0, description: `Tenant security deposit received ${reference}` },
    { accountId: config.depositLiabilityAccountId, debit: 0, credit: value, description: `Security deposit liability ${reference}` },
  ]
}

export function propertyOwnerPayoutLines(config, { amount, cashAccountLedgerId, reference }) {
  const value = money(amount)
  return [
    { accountId: config.ownerPayableAccountId, debit: value, credit: 0, description: `Remit owner funds ${reference}` },
    { accountId: cashAccountLedgerId, debit: 0, credit: value, description: `Owner payout ${reference}` },
  ]
}

export function propertySaleOwnerPayoutLines(config, { amount, cashAccountLedgerId, reference }) {
  const value = money(amount)
  return [
    { accountId: config.saleOwnerPayableAccountId, debit: value, credit: 0, description: `Settle landlord plot sale proceeds ${reference}` },
    { accountId: cashAccountLedgerId, debit: 0, credit: value, description: `Plot sale owner payout ${reference}` },
  ]
}

export function propertyDepositRefundLines(config, { amount, cashAccountLedgerId, reference }) {
  const value = money(amount)
  return [
    { accountId: config.depositLiabilityAccountId, debit: value, credit: 0, description: `Refund tenant deposit ${reference}` },
    { accountId: cashAccountLedgerId, debit: 0, credit: value, description: `Security deposit refund ${reference}` },
  ]
}

export function propertyOpeningDepositLines(config, { amount, reference }) {
  const value = money(amount)
  return [
    { accountId: config.depositOpeningEquityAccountId, debit: value, credit: 0, description: `Opening tenant deposit balance ${reference}` },
    { accountId: config.depositLiabilityAccountId, debit: 0, credit: value, description: `Tenant security deposit held at migration ${reference}` },
  ]
}

export function propertySaleRecognitionLines(config, { amount, commission, costBasis, saleMode, buyerName, reference }) {
  const value = money(amount)
  const fee = money(commission)
  const cost = money(costBasis)
  if (saleMode === 'brokered') {
    if (fee > value) throw Object.assign(new Error('Commission cannot exceed the agreed sale price.'), { statusCode: 400 })
    return [
      { accountId: config.landSaleReceivableAccountId, debit: value, credit: 0, description: `Plot sale receivable from ${buyerName} ${reference}` },
      { accountId: config.saleOwnerPayableAccountId, debit: fee, credit: 0, description: `Agent commission earned ${reference}` },
      { accountId: config.saleOwnerPayableAccountId, debit: 0, credit: value, description: `Net plot proceeds payable to owner ${reference}` },
      { accountId: config.saleCommissionRevenueAccountId, debit: 0, credit: fee, description: `Property sale commission ${reference}` },
    ]
  }
  if (cost <= 0) throw Object.assign(new Error('Record a positive plot acquisition cost before selling an owned plot.'), { statusCode: 409 })
  return [
    { accountId: config.landSaleReceivableAccountId, debit: value, credit: 0, description: `Plot sale receivable from ${buyerName} ${reference}` },
    { accountId: config.landSaleRevenueAccountId, debit: 0, credit: value, description: `Plot sale revenue ${reference}` },
    { accountId: config.landCostOfSalesAccountId, debit: cost, credit: 0, description: `Land cost of sale ${reference}` },
    { accountId: config.landInventoryAccountId, debit: 0, credit: cost, description: `Land inventory relieved ${reference}` },
  ]
}

export function propertySalePaymentLines(config, { amount, cashAccountLedgerId, reference }) {
  const value = money(amount)
  return [
    { accountId: cashAccountLedgerId, debit: value, credit: 0, description: `Plot installment received ${reference}` },
    { accountId: config.landSaleReceivableAccountId, debit: 0, credit: value, description: `Plot sale receivable settled ${reference}` },
  ]
}

export function propertyLandAcquisitionLines(config, { amount, reference }) {
  const value = money(amount)
  return [
    { accountId: config.landInventoryAccountId, debit: value, credit: 0, description: `Land acquired and held for sale ${reference}` },
    { accountId: config.landInventoryOpeningEquityAccountId, debit: 0, credit: value, description: `Initial land inventory funding ${reference}` },
  ]
}
