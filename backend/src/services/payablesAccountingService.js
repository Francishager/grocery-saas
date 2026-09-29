import { linkedCashAccountId } from '../utils/accountingSync.js'

const money = (value) => Math.round((Number(value) || 0) * 100) / 100
const sourceName = (type, id) => `${type}-${id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
const roles = {
  payableAccountId: 'liability',
  openingBalanceEquityAccountId: 'equity',
  purchaseExpenseAccountId: 'expense',
  inventoryAccountId: 'asset',
  purchaseReturnsAccountId: 'expense',
}

export async function getPayablesAccountingConfig(client, tenantId) {
  return client.payablesAccountingConfig.findUnique({ where: { tenantId } })
}

export async function validatePayablesAccountingConfig(client, tenantId, config, { requireEnabled = false } = {}) {
  if (!config || (requireEnabled && !config.isEnabled)) return { valid: false, missing: Object.keys(roles) }
  const missing = Object.keys(roles).filter((key) => !config[key])
  if (missing.length) return { valid: false, missing }
  const accounts = await client.account.findMany({
    where: { tenantId, id: { in: Object.keys(roles).map((key) => config[key]) }, isActive: true },
    include: { _count: { select: { children: true } } },
  })
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const errors = []
  for (const [field, expected] of Object.entries(roles)) {
    const account = byId.get(config[field])
    if (!account) errors.push(`${field} is missing, inactive, or belongs to another business`)
    else if (String(account.type).toLowerCase() !== expected && !(expected === 'expense' && String(account.type).toLowerCase() === 'expenses')) errors.push(`${account.name} must be a ${expected} account`)
    else if (Number(account._count?.children || 0) || String(account.subType || '').toLowerCase() === 'category') errors.push(`${account.name} is a parent account and cannot receive postings`)
    else if (linkedCashAccountId(account)) errors.push(`${account.name} is a transaction account; select a normal chart account for ${field}`)
  }
  if (new Set(Object.keys(roles).map((key) => config[key])).size !== Object.keys(roles).length) errors.push('Each payables accounting role must use a different account')
  return { valid: errors.length === 0, missing: [], errors, accounts }
}

export async function savePayablesAccountingConfig(client, tenantId, userId, values) {
  const config = { ...values, isEnabled: Boolean(values.isEnabled) }
  if (config.isEnabled) {
    const validation = await validatePayablesAccountingConfig(client, tenantId, config)
    if (!validation.valid) throw Object.assign(new Error(validation.errors?.join('. ') || `Complete the payables account mappings first: ${(validation.missing || []).join(', ')}.`), { statusCode: 400 })
  }
  return client.payablesAccountingConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...config, configuredBy: userId, configuredAt: new Date(), updatedBy: userId },
    update: { ...config, configuredBy: userId, configuredAt: new Date(), updatedBy: userId },
  })
}

export async function postPayablesJournal(client, { tenantId, branchId = null, userId, sourceType, sourceId, date = new Date(), reference, description, lines }) {
  const config = await getPayablesAccountingConfig(client, tenantId)
  if (!config?.isEnabled) return { posted: false, disabled: true }
  const validation = await validatePayablesAccountingConfig(client, tenantId, config, { requireEnabled: true })
  if (!validation.valid) throw Object.assign(new Error(validation.errors?.join('. ') || 'Payables accounting mappings are incomplete.'), { statusCode: 409 })

  const normalized = lines.map((line) => ({
    accountId: line.accountId,
    debit: money(line.debit),
    credit: money(line.credit),
    description: line.description || description,
  })).filter((line) => line.debit || line.credit)
  if (normalized.some((line) => line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))) throw Object.assign(new Error('Payables journal lines must contain one positive debit or credit each.'), { statusCode: 400 })
  const debitTotal = money(normalized.reduce((sum, line) => sum + line.debit, 0))
  const creditTotal = money(normalized.reduce((sum, line) => sum + line.credit, 0))
  if (!normalized.length || Math.abs(debitTotal - creditTotal) > 0.01) throw Object.assign(new Error('Payables accounting entry is not balanced.'), { statusCode: 400 })

  const existing = await client.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: true } })
  if (existing) return { posted: false, duplicate: true, entry: existing }
  const accounts = await client.account.findMany({ where: { tenantId, id: { in: normalized.map((line) => line.accountId) }, isActive: true } })
  if (accounts.length !== new Set(normalized.map((line) => line.accountId)).size) throw Object.assign(new Error('A payables journal account is missing, inactive, or belongs to another business.'), { statusCode: 409 })
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const entry = await client.journalEntry.create({
    data: {
      tenantId, branchId, userId, sourceType, sourceId,
      entryNo: sourceName(sourceType, `${sourceId}-${Date.now()}`),
      date, reference: reference || sourceId, description, status: 'posted',
      lines: { create: normalized },
    },
    include: { lines: { include: { account: true } } },
  })
  const deltas = new Map()
  for (const line of normalized) {
    const account = byId.get(line.accountId)
    if (!account || linkedCashAccountId(account)) continue
    const debitNormal = ['asset', 'expense', 'expenses'].includes(String(account.type).toLowerCase())
    deltas.set(account.id, (deltas.get(account.id) || 0) + (debitNormal ? line.debit - line.credit : line.credit - line.debit))
  }
  for (const [accountId, delta] of deltas) await client.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
  return { posted: true, entry }
}

export function supplierOpeningBalanceLines(config, amount) {
  const value = money(amount)
  if (value < 0) throw Object.assign(new Error('Supplier opening balance cannot be negative.'), { statusCode: 400 })
  return [
    { accountId: config.openingBalanceEquityAccountId, debit: value, credit: 0, description: 'Supplier opening balance migration' },
    { accountId: config.payableAccountId, debit: 0, credit: value, description: 'Opening supplier payable' },
  ]
}

export function supplierPurchaseLines(config, purchase, items, cashAccountLedgerId) {
  const lines = []
  const stockTotal = money(items.reduce((sum, item) => sum + (String(item.product?.itemType || '').toLowerCase() === 'service' ? 0 : money(item.total)), 0))
  const serviceTotal = money(items.reduce((sum, item) => sum + (String(item.product?.itemType || '').toLowerCase() === 'service' ? money(item.total) : 0), 0))
  if (stockTotal) lines.push({ accountId: config.inventoryAccountId, debit: stockTotal, credit: 0, description: 'Inventory received from supplier' })
  if (serviceTotal) lines.push({ accountId: config.purchaseExpenseAccountId, debit: serviceTotal, credit: 0, description: 'Supplier service purchase expense' })
  if (purchase.amountPaid > 0) lines.push({ accountId: cashAccountLedgerId, debit: 0, credit: money(purchase.amountPaid), description: 'Supplier purchase paid at receipt' })
  if (purchase.balance > 0) lines.push({ accountId: config.payableAccountId, debit: 0, credit: money(purchase.balance), description: 'Supplier payable recognized' })
  return lines
}

export function supplierPaymentLines(config, amount, cashAccountLedgerId, reference) {
  const value = money(amount)
  return [
    { accountId: config.payableAccountId, debit: value, credit: 0, description: `Supplier payable settled ${reference || ''}`.trim() },
    { accountId: cashAccountLedgerId, debit: 0, credit: value, description: 'Payment from transaction account' },
  ]
}

export function supplierDebitNoteLines(config, amount, returnedCost, reference) {
  const noteAmount = money(amount)
  const stockCost = money(returnedCost)
  const variance = money(noteAmount - stockCost)
  const lines = [
    { accountId: config.payableAccountId, debit: noteAmount, credit: 0, description: `Supplier debit note ${reference || ''}`.trim() },
  ]
  if (stockCost > 0) lines.push({ accountId: config.inventoryAccountId, debit: 0, credit: stockCost, description: 'Inventory returned to supplier' })
  if (variance > 0) lines.push({ accountId: config.purchaseReturnsAccountId, debit: 0, credit: variance, description: 'Supplier allowance / purchase return' })
  if (variance < 0) lines.push({ accountId: config.purchaseReturnsAccountId, debit: Math.abs(variance), credit: 0, description: 'Supplier return cost variance' })
  return lines
}

export async function reversePayablesJournal(client, { tenantId, sourceType, sourceId, userId, reason }) {
  const original = await client.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: { include: { account: true } } } })
  if (!original || original.status === 'reversed' || original.reversalJournalId) return null
  const now = new Date()
  const lines = original.lines.map((line) => ({ accountId: line.accountId, debit: money(line.credit), credit: money(line.debit), description: `Reversal of ${original.entryNo}: ${reason}` }))
  const reversal = await client.journalEntry.create({
    data: {
      tenantId, branchId: original.branchId, userId,
      entryNo: sourceName('AP-REV', `${original.id}-${Date.now()}`), date: now,
      description: `Reversal of ${original.entryNo}: ${reason}`, reference: original.reference || original.entryNo,
      sourceType: 'PAYABLE_JOURNAL_REVERSAL', sourceId: original.id,
      reversalOfId: original.id, reversalReason: reason, status: 'posted', lines: { create: lines },
    },
  })
  await client.journalEntry.update({ where: { id: original.id }, data: { status: 'reversed', reversalJournalId: reversal.id, reversalReason: reason, reversedBy: userId, reversedAt: now } })
  const accountById = new Map(original.lines.map((line) => [line.accountId, line.account]))
  const deltas = new Map()
  for (const line of lines) {
    const account = accountById.get(line.accountId)
    if (!account || linkedCashAccountId(account)) continue
    const debitNormal = ['asset', 'expense', 'expenses'].includes(String(account.type).toLowerCase())
    deltas.set(account.id, (deltas.get(account.id) || 0) + (debitNormal ? line.debit - line.credit : line.credit - line.debit))
  }
  for (const [accountId, delta] of deltas) await client.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
  return reversal
}

export async function reverseCurrentPayablesJournal(client, { tenantId, sourceType, sourceIdPrefix, userId, reason }) {
  const current = await client.journalEntry.findFirst({
    where: { tenantId, sourceType, OR: [{ sourceId: sourceIdPrefix }, { sourceId: { startsWith: `${sourceIdPrefix}-v-` } }], status: 'posted', reversalJournalId: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!current) return null
  return reversePayablesJournal(client, { tenantId, sourceType, sourceId: current.sourceId, userId, reason })
}

export async function getCashAccountLedgerId(client, tenantId, cashAccountId) {
  const accounts = await client.account.findMany({ where: { tenantId, isActive: true } })
  return accounts.find((account) => linkedCashAccountId(account) === cashAccountId)?.id || null
}

export async function getSupplierDebitNoteStockCost(client, tenantId, noteId, purchaseId) {
  const [logs, items] = await Promise.all([
    client.auditLog.findMany({
      where: {
        tenantId,
        model: 'Product',
        AND: [
          { changes: { path: ['stockMovement', 'debitNoteId'], equals: noteId } },
          { changes: { path: ['stockMovement', 'source'], equals: 'debit_note' } },
        ],
      },
    }),
    client.supplierPurchaseItem.findMany({ where: { purchaseId }, select: { productId: true, quantity: true, cost: true } }),
  ])
  const costByProduct = new Map()
  for (const item of items) {
    const current = costByProduct.get(item.productId) || { quantity: 0, totalCost: 0 }
    current.quantity += Number(item.quantity || 0)
    current.totalCost += money(item.cost) * Number(item.quantity || 0)
    costByProduct.set(item.productId, current)
  }
  return money(logs.reduce((sum, log) => {
    const movement = log.changes?.stockMovement
    const cost = costByProduct.get(log.recordId)
    const averageCost = cost?.quantity ? cost.totalCost / cost.quantity : 0
    return sum + averageCost * Number(movement?.quantity || 0)
  }, 0))
}
