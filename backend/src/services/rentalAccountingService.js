import { cashAccountMarker, linkedCashAccountId } from '../utils/accountingSync.js'
import { ensureTenantAccountingSetup } from './tenantAccountingSetupService.js'

const money = value => Math.round((Number(value) || 0) * 100) / 100
const debitNormal = type => ['asset', 'expense', 'expenses'].includes(String(type || '').toLowerCase())
const markerFor = role => `JibuSales rental accounting role: ${role}`
const sourceName = (type, id) => `${type}-${id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
const cents = value => Math.round((Number(value) || 0) * 100)

function allocateCents(total, weights) {
  const positiveTotal = weights.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (!positiveTotal || !total) return weights.map(() => 0)
  let allocated = 0
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return total - allocated
    const share = Math.round(total * Math.max(0, weight) / positiveTotal)
    allocated += share
    return share
  })
}

export function allocateRentalLineAmounts(items, chargeLines, discount, taxRate) {
  const rows = [...items, ...chargeLines]
  const gross = rows.map(row => cents(row.totalAmount))
  const grossTotal = gross.reduce((sum, value) => sum + value, 0)
  const discountCents = Math.min(grossTotal, Math.max(0, cents(discount)))
  const discounts = allocateCents(discountCents, gross)
  const taxable = gross.map((value, index) => Math.max(0, value - discounts[index]))
  const taxCents = Math.round(taxable.reduce((sum, value) => sum + value, 0) * Math.max(0, Number(taxRate) || 0) / 100)
  const taxes = allocateCents(taxCents, taxable)
  const enriched = rows.map((row, index) => ({
    ...row,
    discountAmount: discounts[index] / 100,
    taxAmount: taxes[index] / 100,
    netAmount: (taxable[index] - taxes[index]) / 100,
  }))
  return {
    items: enriched.slice(0, items.length),
    chargeLines: enriched.slice(items.length),
    taxAmount: taxCents / 100,
  }
}

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
  ['renterCreditPayableAccountId', 'Rental Customer Credits Payable', 'RNT-2320', 'liability', 'current_liability'],
  ['cancellationFeeRevenueAccountId', 'Rental Cancellation Fee Revenue', 'RNT-4490', 'revenue', 'operating_revenue'],
  ['openingEquityAccountId', 'Rental Legacy Opening Balance Equity', 'RNT-3905', 'equity', 'opening_balance'],
]

export async function ensureRentalAccounting(tx, tenantId) {
  let sharedConfig = await tx.receivablesAccountingConfig.findUnique({ where: { tenantId } })
  if (!sharedConfig?.inventoryAccountId || !sharedConfig?.costOfGoodsSoldAccountId || !sharedConfig?.salesRevenueAccountId) {
    await ensureTenantAccountingSetup(tx, { tenantId, userId: null, enableNewSetups: false })
    sharedConfig = await tx.receivablesAccountingConfig.findUnique({ where: { tenantId } })
  }
  if (!sharedConfig?.inventoryAccountId || !sharedConfig?.costOfGoodsSoldAccountId || !sharedConfig?.salesRevenueAccountId) {
    throw Object.assign(new Error('Shared inventory, cost-of-sales, and sales revenue mappings are unavailable. Complete system accounting setup before using stocked rental lines.'), { statusCode: 409 })
  }
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
  mapped.inventoryAccountId = sharedConfig.inventoryAccountId
  mapped.costOfGoodsSoldAccountId = sharedConfig.costOfGoodsSoldAccountId
  mapped.salesRevenueAccountId = sharedConfig.salesRevenueAccountId
  if (new Set(roles.map(([field]) => mapped[field])).size !== roles.length) throw Object.assign(new Error('Rental system accounts must be distinct.'), { statusCode: 409 })
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
  const total = money(amount)
  return [
    { accountId: config.deferredRevenueAccountId, debit: total, credit: 0, description: `Recognize earned rental income ${reference}` },
    { accountId: config.revenueAccountId, debit: 0, credit: total, description: `Rental income earned ${reference}` },
  ]
}

export function rentalMixedRevenueRecognitionLines(config, { amount, goodsAmount = 0, reference }) {
  const total = money(amount)
  const goods = Math.min(total, money(goodsAmount))
  const services = money(total - goods)
  if (goods > 0 && !config.salesRevenueAccountId) throw Object.assign(new Error('Rental goods revenue account is not configured.'), { statusCode: 409 })
  return [
    { accountId: config.deferredRevenueAccountId, debit: total, credit: 0, description: `Recognize earned booking income ${reference}` },
    ...(services > 0 ? [{ accountId: config.revenueAccountId, debit: 0, credit: services, description: `Rental and service income earned ${reference}` }] : []),
    ...(goods > 0 ? [{ accountId: config.salesRevenueAccountId, debit: 0, credit: goods, description: `Goods revenue earned ${reference}` }] : []),
  ]
}

export function rentalConsumableCostLines(config, { amount, reference }) {
  const cost = money(amount)
  if (cost > 0 && (!config.inventoryAccountId || !config.costOfGoodsSoldAccountId)) throw Object.assign(new Error('Rental inventory and cost-of-sales accounts are not configured.'), { statusCode: 409 })
  return [
    { accountId: config.costOfGoodsSoldAccountId, debit: cost, credit: 0, description: `Consumables used for booking ${reference}` },
    { accountId: config.inventoryAccountId, debit: 0, credit: cost, description: `Inventory issued for booking ${reference}` },
  ]
}

export function rentalDamageChargeLines(config, { amount, reference }) {
  return [
    { accountId: config.receivableAccountId, debit: money(amount), credit: 0, description: `Damage charge receivable ${reference}` },
    { accountId: config.revenueAccountId, debit: 0, credit: money(amount), description: `Rental damage charge ${reference}` },
  ]
}

export function rentalCreditNoteLines(config, { amount, taxAmount = 0, appliedAmount = 0, refundDue = 0, earned = false, historical = false, reference }) {
  const total = money(amount)
  const tax = Math.min(total, money(taxAmount))
  const applied = Math.min(total, money(appliedAmount))
  const refund = Math.max(0, money(refundDue))
  if (Math.abs(total - applied - refund) > 0.01) throw Object.assign(new Error('Rental credit note allocation does not balance.'), { statusCode: 409 })
  const incomeAccountId = historical ? config.openingEquityAccountId : earned ? config.revenueAccountId : config.deferredRevenueAccountId
  if (historical) {
    return [
      { accountId: incomeAccountId, debit: total, credit: 0, description: `Historical rental balance adjustment ${reference}` },
      ...(applied > 0 ? [{ accountId: config.receivableAccountId, debit: 0, credit: applied, description: `Reduce historical rental receivable ${reference}` }] : []),
      ...(refund > 0 ? [{ accountId: config.renterCreditPayableAccountId, debit: 0, credit: refund, description: `Refund payable to renter ${reference}` }] : []),
    ]
  }
  return [
    ...(total - tax > 0 ? [{ accountId: incomeAccountId, debit: money(total - tax), credit: 0, description: `Rental credit adjustment ${reference}` }] : []),
    ...(tax > 0 ? [{ accountId: config.taxPayableAccountId, debit: tax, credit: 0, description: `Reverse rental output tax ${reference}` }] : []),
    ...(applied > 0 ? [{ accountId: config.receivableAccountId, debit: 0, credit: applied, description: `Reduce rental receivable ${reference}` }] : []),
    ...(refund > 0 ? [{ accountId: config.renterCreditPayableAccountId, debit: 0, credit: refund, description: `Refund payable to renter ${reference}` }] : []),
  ]
}

export function rentalCancellationLines(config, { advanceAmount = 0, feeAmount = 0, taxAmount = 0, refundDue = 0, feeReceivable = 0, reference }) {
  const advances = money(advanceAmount)
  const fee = money(feeAmount)
  const tax = Math.min(fee, money(taxAmount))
  const refund = money(refundDue)
  const receivable = money(feeReceivable)
  if (Math.abs(advances + receivable - fee - refund) > 0.01) {
    throw Object.assign(new Error('Rental cancellation allocation does not balance.'), { statusCode: 409 })
  }
  return [
    ...(advances > 0 ? [{ accountId: config.deferredRevenueAccountId, debit: advances, credit: 0, description: `Release reservation advance on cancellation ${reference}` }] : []),
    ...(receivable > 0 ? [{ accountId: config.receivableAccountId, debit: receivable, credit: 0, description: `Cancellation fee receivable ${reference}` }] : []),
    ...(fee - tax > 0 ? [{ accountId: config.cancellationFeeRevenueAccountId, debit: 0, credit: money(fee - tax), description: `Cancellation fee revenue ${reference}` }] : []),
    ...(tax > 0 ? [{ accountId: config.taxPayableAccountId, debit: 0, credit: tax, description: `Output tax on cancellation fee ${reference}` }] : []),
    ...(refund > 0 ? [{ accountId: config.renterCreditPayableAccountId, debit: 0, credit: refund, description: `Refund payable for cancelled booking ${reference}` }] : []),
  ]
}

export async function ensureLegacyRentalOpeningEntry(tx, { tenantId, rental, userId }) {
  const issued = await tx.journalEntry.findFirst({ where: { tenantId, sourceType: 'RENTAL_ISSUE', sourceId: rental.id } })
  if (issued) return issued
  const historicalReceivable = await tx.journalEntry.findFirst({ where: { tenantId, sourceType: 'RENTAL_HISTORICAL_RECEIVABLE', sourceId: rental.id } })
  if (historicalReceivable) return historicalReceivable
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
