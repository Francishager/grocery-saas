import { cashAccountMarker, linkedCashAccountId } from '../utils/accountingSync.js'

const money = value => Math.round((Number(value) || 0) * 100) / 100
const debitNormal = type => ['asset', 'expense', 'expenses'].includes(String(type || '').toLowerCase())
const markerFor = role => `JibuSales rental accounting role: ${role}`
const sourceName = (type, id) => `${type}-${id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)

export function heldRentalDeposit(rental) {
  const paid = Number(rental?.depositPaid || 0)
  const legacyCollected = ['collected', 'held'].includes(String(rental?.depositStatus || '').toLowerCase())
  const collected = paid > 0 ? paid : legacyCollected ? Number(rental?.depositAmount || 0) : 0
  return money(Math.max(0, collected - Number(rental?.depositRefunded || 0)))
}

const roles = [
  ['receivableAccountId', 'Rental Receivables', 'RNT-1140', 'asset', 'current_asset'],
  ['revenueAccountId', 'Rental Revenue', 'RNT-4400', 'revenue', 'operating_revenue'],
  ['deferredRevenueAccountId', 'Unearned Rental Revenue', 'RNT-2300', 'liability', 'current_liability'],
  ['depositLiabilityAccountId', 'Rental Security Deposits Payable', 'RNT-2310', 'liability', 'current_liability'],
  ['taxPayableAccountId', 'Rental Tax Payable', 'RNT-2200', 'liability', 'current_liability'],
  ['openingEquityAccountId', 'Rental Legacy Opening Balance Equity', 'RNT-3905', 'equity', 'opening_balance'],
]

export async function ensureRentalAccounting(tx, tenantId) {
  const accounts = await tx.account.findMany({ where: { tenantId }, include: { _count: { select: { children: true } } } })
  const mapped = {}
  for (const [field, name, baseCode, type, subType] of roles) {
    const role = field.replace('AccountId', '')
    const marker = markerFor(role)
    let account = accounts.find(row => row.description === marker)
    if (account) {
      if (!account.isActive || account.type !== type || account.parentId || account._count?.children || String(account.subType || '').toLowerCase() === 'category' || linkedCashAccountId(account)) {
        throw Object.assign(new Error(`System rental account “${account.name}” is inactive or not postable. Ask an accounting administrator to review it.`), { statusCode: 409 })
      }
    } else {
      let code = baseCode, suffix = 1
      while (accounts.some(row => row.code === code)) code = `${baseCode}-${suffix++}`
      account = await tx.account.create({ data: { tenantId, code, name: `${name} (JibuSales)`, type, subType, isActive: true, isSystemManaged: true, description: marker }, include: { _count: { select: { children: true } } } })
      accounts.push(account)
    }
    mapped[field] = account.id
  }
  if (new Set(Object.values(mapped)).size !== roles.length) throw Object.assign(new Error('Rental system accounts must be distinct.'), { statusCode: 409 })
  return tx.rentalAccountingConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...mapped, isEnabled: true, isSystemManaged: true },
    update: { ...mapped, isEnabled: true, isSystemManaged: true },
  })
}

export async function ensureRentalCashLedgerAccount(tx, tenantId, cashAccount) {
  const marker = cashAccountMarker(cashAccount.id)
  let account = await tx.account.findFirst({ where: { tenantId, description: { contains: marker } } })
  if (!account) {
    const base = `TX-${cashAccount.id.slice(-8).toUpperCase()}`
    let code = base, suffix = 1
    while (await tx.account.findFirst({ where: { tenantId, code } })) code = `${base}-${suffix++}`
    return tx.account.create({ data: { tenantId, code, name: cashAccount.name, type: 'asset', subType: `transaction_${cashAccount.type}`, balance: cashAccount.balance, branchId: cashAccount.branchId, isSystemManaged: true, description: `Linked transaction account ${marker}` } })
  }
  if (account.type !== 'asset' || linkedCashAccountId(account) !== cashAccount.id) throw Object.assign(new Error(`Linked accounting account for ${cashAccount.name} is invalid.`), { statusCode: 409 })
  return tx.account.update({ where: { id: account.id }, data: { name: cashAccount.name, type: 'asset', subType: `transaction_${cashAccount.type}`, balance: cashAccount.balance, branchId: cashAccount.branchId, isActive: cashAccount.isActive } })
}

export async function recordRentalCashMovement(tx, { tenantId, userId, cashAccount, amount, direction, reference, description }) {
  const value = money(amount)
  if (!(value > 0) || !['receipt', 'expense'].includes(direction)) throw Object.assign(new Error('Cash movement must have a positive amount and valid direction.'), { statusCode: 400 })
  await tx.$queryRaw`SELECT "id" FROM "cash_accounts" WHERE "id" = ${cashAccount.id} AND "tenantId" = ${tenantId} FOR UPDATE`
  const current = await tx.cashAccount.findFirst({ where: { id: cashAccount.id, tenantId, isActive: true } })
  if (!current) throw Object.assign(new Error('Selected transaction account is unavailable.'), { statusCode: 409 })
  if (direction === 'expense' && Number(current.balance) + 0.001 < value) throw Object.assign(new Error(`Insufficient balance in ${current.name}.`), { statusCode: 409 })
  const updated = await tx.cashAccount.update({ where: { id: current.id }, data: { balance: { [direction === 'receipt' ? 'increment' : 'decrement']: value } } })
  await tx.cashTransaction.create({ data: { tenantId, accountId: updated.id, type: direction === 'receipt' ? 'income' : 'expense', amount: value, balanceAfter: updated.balance, reference, description, userId } })
  return { cashAccount: updated, ledgerAccount: await ensureRentalCashLedgerAccount(tx, tenantId, updated) }
}

export async function postRentalJournal(tx, { tenantId, branchId = null, userId, sourceType, sourceId, date = new Date(), reference, description, lines }) {
  const config = await ensureRentalAccounting(tx, tenantId)
  const normalized = lines.map(line => ({ accountId: line.accountId, debit: money(line.debit), credit: money(line.credit), description: line.description || description })).filter(line => line.debit || line.credit)
  if (!normalized.length || normalized.some(line => line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))) throw Object.assign(new Error('Rental journal lines are invalid.'), { statusCode: 400 })
  const debit = money(normalized.reduce((sum, line) => sum + line.debit, 0))
  const credit = money(normalized.reduce((sum, line) => sum + line.credit, 0))
  if (Math.abs(debit - credit) > 0.01) throw Object.assign(new Error('Rental journal is not balanced.'), { statusCode: 409 })
  const prior = await tx.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: true } })
  if (prior) return { entry: prior, duplicate: true }
  const ids = [...new Set(normalized.map(line => line.accountId))]
  const accounts = await tx.account.findMany({ where: { tenantId, id: { in: ids }, isActive: true }, include: { _count: { select: { children: true } } } })
  if (accounts.length !== ids.length || accounts.some(account => account.parentId || account._count.children || (linkedCashAccountId(account) && account.type !== 'asset'))) throw Object.assign(new Error('A rental journal account is inactive, invalid, or not postable.'), { statusCode: 409 })
  const byId = new Map(accounts.map(account => [account.id, account]))
  const entry = await tx.journalEntry.create({
    data: { tenantId, branchId, userId, sourceType, sourceId, entryNo: sourceName('RNT', `${sourceType}-${sourceId}-${Date.now()}`), date, reference: reference || sourceId, description, status: 'posted', lines: { create: normalized } },
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

export function rentalInvoiceLines(config, { total, tax, reference }) {
  const net = money(total - tax)
  return [
    { accountId: config.receivableAccountId, debit: money(total), credit: 0, description: `Rental receivable ${reference}` },
    ...(net > 0 ? [{ accountId: config.deferredRevenueAccountId, debit: 0, credit: net, description: `Unearned rental income ${reference}` }] : []),
    ...(tax > 0 ? [{ accountId: config.taxPayableAccountId, debit: 0, credit: money(tax), description: `Rental output tax ${reference}` }] : []),
  ]
}

export function rentalReceiptLines(config, { amount, cashAccountId, reference, advance = false }) {
  return [
    { accountId: cashAccountId, debit: money(amount), credit: 0, description: `Rental receipt ${reference}` },
    { accountId: advance ? config.deferredRevenueAccountId : config.receivableAccountId, debit: 0, credit: money(amount), description: `${advance ? 'Rental advance' : 'Rental receivable settled'} ${reference}` },
  ]
}

export function rentalDepositReceiptLines(config, { amount, cashAccountId, reference }) {
  return [
    { accountId: cashAccountId, debit: money(amount), credit: 0, description: `Rental deposit receipt ${reference}` },
    { accountId: config.depositLiabilityAccountId, debit: 0, credit: money(amount), description: `Refundable renter deposit held ${reference}` },
  ]
}

export function rentalDepositRefundLines(config, { amount, cashAccountId, reference }) {
  return [
    { accountId: config.depositLiabilityAccountId, debit: money(amount), credit: 0, description: `Rental deposit returned ${reference}` },
    { accountId: cashAccountId, debit: 0, credit: money(amount), description: `Cash refund of renter deposit ${reference}` },
  ]
}

export function rentalDepositForfeitLines(config, { amount, reference }) {
  return [
    { accountId: config.depositLiabilityAccountId, debit: money(amount), credit: 0, description: `Release forfeited rental deposit ${reference}` },
    { accountId: config.revenueAccountId, debit: 0, credit: money(amount), description: `Forfeited rental deposit ${reference}` },
  ]
}

export function rentalRevenueRecognitionLines(config, { amount, reference }) {
  return [
    { accountId: config.deferredRevenueAccountId, debit: money(amount), credit: 0, description: `Recognize earned rental income ${reference}` },
    { accountId: config.revenueAccountId, debit: 0, credit: money(amount), description: `Rental income earned ${reference}` },
  ]
}

export function rentalDamageChargeLines(config, { amount, reference }) {
  return [
    { accountId: config.receivableAccountId, debit: money(amount), credit: 0, description: `Damage charge receivable ${reference}` },
    { accountId: config.revenueAccountId, debit: 0, credit: money(amount), description: `Rental damage charge ${reference}` },
  ]
}

export async function ensureLegacyRentalOpeningEntry(tx, { tenantId, rental, userId }) {
  const issued = await tx.journalEntry.findFirst({ where: { tenantId, sourceType: 'RENTAL_ISSUE', sourceId: rental.id } })
  if (issued) return issued
  const balance = money(Math.max(0, rental.balance))
  const depositHeld = heldRentalDeposit(rental)
  if (balance <= 0 && depositHeld <= 0) return null
  const existing = await tx.journalEntry.findFirst({ where: { tenantId, sourceType: 'RENTAL_LEGACY_OPENING', sourceId: rental.id } })
  if (existing) return existing
  const config = await ensureRentalAccounting(tx, tenantId)
  const netEquity = money(balance - depositHeld)
  const lines = [
    ...(balance > 0 ? [{ accountId: config.receivableAccountId, debit: balance, credit: 0, description: `Legacy rental balance brought forward ${rental.rentalNo}` }] : []),
    ...(depositHeld > 0 ? [{ accountId: config.depositLiabilityAccountId, debit: 0, credit: depositHeld, description: `Legacy deposit held brought forward ${rental.rentalNo}` }] : []),
    ...(netEquity > 0 ? [{ accountId: config.openingEquityAccountId, debit: 0, credit: netEquity, description: `Legacy rental opening control ${rental.rentalNo}` }] : []),
    ...(netEquity < 0 ? [{ accountId: config.openingEquityAccountId, debit: -netEquity, credit: 0, description: `Legacy rental deposit opening control ${rental.rentalNo}` }] : []),
  ]
  return (await postRentalJournal(tx, { tenantId, branchId: rental.branchId, userId, sourceType: 'RENTAL_LEGACY_OPENING', sourceId: rental.id, reference: rental.rentalNo, description: `Opening rental receivable/deposit bridge for legacy rental ${rental.rentalNo}; no historical cash receipt inferred.`, lines })).entry
}
