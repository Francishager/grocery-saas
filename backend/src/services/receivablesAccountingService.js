import { linkedCashAccountId } from '../utils/accountingSync.js'

const money = (value) => Math.round((Number(value) || 0) * 100) / 100
const sourceName = (type, id) => `${type}-${id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)

const accountRoles = {
  receivableAccountId: 'asset',
  salesRevenueAccountId: 'revenue',
  taxPayableAccountId: 'liability',
  salesReturnsAccountId: 'revenue',
  costOfGoodsSoldAccountId: 'expense',
  inventoryAccountId: 'asset',
  customerAdvancesAccountId: 'liability',
  openingBalanceEquityAccountId: 'equity',
}

export async function validateReceivablesAccountingConfig(client, tenantId, config, { requireEnabled = false } = {}) {
  if (!config || (requireEnabled && !config.isEnabled)) return { valid: false, missing: Object.keys(accountRoles) }
  const missing = Object.keys(accountRoles).filter((key) => !config[key])
  if (missing.length) return { valid: false, missing }
  const accounts = await client.account.findMany({
    where: { tenantId, id: { in: [...Object.keys(accountRoles).map((field) => config[field]), config.marketplaceSettlementAccountId].filter(Boolean) }, isActive: true },
    include: { _count: { select: { children: true } } },
  })
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const errors = []
  for (const [field, expectedType] of Object.entries(accountRoles)) {
    const account = byId.get(config[field])
    if (!account) errors.push(`${field} account is missing, inactive, or belongs to another business`)
    else if (String(account.type).toLowerCase() !== expectedType && !(expectedType === 'expense' && String(account.type).toLowerCase() === 'expenses')) errors.push(`${account.name} must be a ${expectedType} account`)
    else if (Number(account._count?.children || 0) > 0 || String(account.subType || '').toLowerCase() === 'category') errors.push(`${account.name} is a parent account and cannot receive postings`)
    else if (linkedCashAccountId(account)) errors.push(`${account.name} is a transaction account; select a normal chart account for ${field}`)
  }
  if (config.marketplaceSettlementAccountId) {
    const settlement = byId.get(config.marketplaceSettlementAccountId)
    if (!settlement) errors.push('Marketplace settlement account is missing, inactive, or belongs to another business')
    else if (String(settlement.type).toLowerCase() !== 'asset' || Number(settlement._count?.children || 0) > 0 || String(settlement.subType || '').toLowerCase() === 'category' || linkedCashAccountId(settlement)) errors.push('Marketplace settlement account must be a postable asset account, not a transaction account')
  }
  const ids = [...Object.keys(accountRoles).map((field) => config[field]), config.marketplaceSettlementAccountId].filter(Boolean)
  if (new Set(ids).size !== ids.length) errors.push('Each receivables accounting role must use a different account')
  return { valid: errors.length === 0, missing: [], errors, accounts: [...byId.values()] }
}

export async function getReceivablesAccountingConfig(client, tenantId) {
  return client.receivablesAccountingConfig.findUnique({ where: { tenantId } })
}

export async function saveReceivablesAccountingConfig(client, tenantId, userId, values) {
  const config = { ...values, isEnabled: Boolean(values.isEnabled) }
  if (config.isEnabled) {
    const validation = await validateReceivablesAccountingConfig(client, tenantId, config)
    if (!validation.valid) throw Object.assign(new Error(validation.errors?.join('. ') || 'Complete all receivables account mappings first.'), { statusCode: 400 })
  }
  return client.receivablesAccountingConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...config, configuredBy: userId, configuredAt: new Date(), updatedBy: userId },
    update: { ...config, configuredBy: userId, configuredAt: new Date(), updatedBy: userId },
  })
}

function normalBalanceDelta(account, debit, credit) {
  const debitNormal = ['asset', 'expense', 'expenses'].includes(String(account.type).toLowerCase())
  return debitNormal ? debit - credit : credit - debit
}

export async function postReceivablesJournal(client, {
  tenantId, branchId = null, userId, sourceType, sourceId, date = new Date(), reference, description, lines, allowDisabled = false,
}) {
  const config = await getReceivablesAccountingConfig(client, tenantId)
  if (!config?.isEnabled && !allowDisabled) return { posted: false, disabled: true }
  const validation = await validateReceivablesAccountingConfig(client, tenantId, config, { requireEnabled: !allowDisabled })
  if (!validation.valid) throw Object.assign(new Error(validation.errors?.join('. ') || 'Receivables accounting mappings are incomplete.'), { statusCode: 409 })

  const normalized = lines.map((line) => ({
    accountId: line.accountId,
    debit: money(line.debit),
    credit: money(line.credit),
    description: line.description || description,
  })).filter((line) => line.debit || line.credit)
  if (normalized.some((line) => line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))) {
    throw Object.assign(new Error('Receivables journal lines must contain one positive debit or credit each.'), { statusCode: 400 })
  }
  const debitTotal = money(normalized.reduce((sum, line) => sum + line.debit, 0))
  const creditTotal = money(normalized.reduce((sum, line) => sum + line.credit, 0))
  if (!normalized.length || Math.abs(debitTotal - creditTotal) > 0.01) {
    throw Object.assign(new Error('Receivables accounting entry is not balanced.'), { statusCode: 400 })
  }

  const existing = await client.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: true } })
  if (existing) return { posted: false, duplicate: true, entry: existing }
  const accounts = await client.account.findMany({ where: { tenantId, id: { in: normalized.map((line) => line.accountId) }, isActive: true } })
  if (accounts.length !== new Set(normalized.map((line) => line.accountId)).size) {
    throw Object.assign(new Error('A receivables journal account is missing, inactive, or belongs to another business.'), { statusCode: 409 })
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const entryNo = sourceName(sourceType, `${sourceId}-${Date.now()}`)
  const entry = await client.journalEntry.create({
    data: {
      tenantId, branchId, userId, sourceType, sourceId, entryNo,
      date, reference: reference || sourceId, description, status: 'posted',
      lines: { create: normalized },
    },
    include: { lines: { include: { account: true } } },
  })
  const deltas = new Map()
  for (const line of normalized) {
    const account = accountById.get(line.accountId)
    if (linkedCashAccountId(account)) continue
    deltas.set(account.id, (deltas.get(account.id) || 0) + normalBalanceDelta(account, line.debit, line.credit))
  }
  for (const [accountId, delta] of deltas) {
    await client.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
  }
  return { posted: true, entry }
}

export function saleRecognitionLines(config, sale, items = []) {
  const total = money(sale.total)
  const tax = money(sale.tax)
  const netRevenue = money(total - tax)
  const cogs = money(items.reduce((sum, item) => {
    if (String(item.product?.itemType || item.itemType || '').toLowerCase() === 'service') return sum
    if (item.cost == null || !Number.isFinite(Number(item.cost))) throw Object.assign(new Error('Saved sale-time product cost is missing; this sale cannot be posted to inventory accounting safely.'), { statusCode: 409 })
    return sum + money(item.cost) * Number(item.quantity || 0)
  }, 0))
  const lines = [
    { accountId: config.receivableAccountId, debit: total, credit: 0, description: 'Customer invoice receivable' },
    { accountId: config.salesRevenueAccountId, debit: 0, credit: netRevenue, description: 'Net sales revenue' },
  ]
  if (tax > 0) lines.push({ accountId: config.taxPayableAccountId, debit: 0, credit: tax, description: 'Output tax payable' })
  if (cogs > 0) lines.push(
    { accountId: config.costOfGoodsSoldAccountId, debit: cogs, credit: 0, description: 'Cost of goods sold' },
    { accountId: config.inventoryAccountId, debit: 0, credit: cogs, description: 'Inventory relieved on sale' },
  )
  return lines
}

export function cashSaleRecognitionLines(config, sale, items = [], transactionAccountId) {
  const total = money(sale.total)
  const tax = money(sale.tax)
  const netRevenue = money(total - tax)
  const cogs = money(items.reduce((sum, item) => {
    if (String(item.product?.itemType || item.itemType || '').toLowerCase() === 'service') return sum
    if (item.cost == null || !Number.isFinite(Number(item.cost))) throw Object.assign(new Error('Saved sale-time product cost is missing; this sale cannot be posted to inventory accounting safely.'), { statusCode: 409 })
    return sum + money(item.cost) * Number(item.quantity || 0)
  }, 0))
  const lines = [
    { accountId: transactionAccountId, debit: total, credit: 0, description: 'Cash / transaction account received' },
    { accountId: config.salesRevenueAccountId, debit: 0, credit: netRevenue, description: 'Net sales revenue' },
  ]
  if (tax > 0) lines.push({ accountId: config.taxPayableAccountId, debit: 0, credit: tax, description: 'Output tax payable' })
  if (cogs > 0) lines.push(
    { accountId: config.costOfGoodsSoldAccountId, debit: cogs, credit: 0, description: 'Cost of goods sold' },
    { accountId: config.inventoryAccountId, debit: 0, credit: cogs, description: 'Inventory relieved on sale' },
  )
  return lines
}

export function receiptCollectionLines(config, { transactionAccountId, amount, receivableApplied, reference }) {
  const value = money(amount)
  const applied = Math.min(value, money(receivableApplied))
  const advance = money(value - applied)
  const lines = [
    { accountId: transactionAccountId, debit: value, credit: 0, description: `Customer receipt ${reference || ''}`.trim() },
    { accountId: config.receivableAccountId, debit: 0, credit: applied, description: 'Receipt applied to receivables' },
  ]
  if (advance > 0) lines.push({ accountId: config.customerAdvancesAccountId, debit: 0, credit: advance, description: 'Unapplied customer receipt / advance' })
  return lines
}

export function customerCreditApplicationLines(config, { amount, reference }) {
  const value = money(amount)
  return [
    { accountId: config.customerAdvancesAccountId, debit: value, credit: 0, description: `Apply customer advance ${reference || ''}`.trim() },
    { accountId: config.receivableAccountId, debit: 0, credit: value, description: `Apply customer credit to receivable ${reference || ''}`.trim() },
  ]
}

export async function postCustomerCreditApplicationJournal(client, { tenantId, branchId = null, userId, application, reference }) {
  const config = await getReceivablesAccountingConfig(client, tenantId)
  if (!config?.isEnabled) return { posted: false, disabled: true }
  const receiptEntry = await client.journalEntry.findFirst({
    where: { tenantId, sourceType: 'CUSTOMER_RECEIPT', sourceId: application.sourceId, status: 'posted' },
    include: { lines: true },
  })
  if (!receiptEntry) throw Object.assign(new Error('This customer credit comes from a receipt without a posted advances-account entry. Reconcile the original receipt before applying it.'), { statusCode: 409, code: 'CUSTOMER_ADVANCE_GL_SOURCE_MISSING' })
  const advancesCredit = money(receiptEntry.lines.filter((line) => line.accountId === config.customerAdvancesAccountId)
    .reduce((sum, line) => sum + money(line.credit) - money(line.debit), 0))
  const [previousApplicationBalance] = await client.$queryRaw`
    SELECT COALESCE(SUM(jl."debit" - jl."credit"), 0)::double precision AS amount
    FROM "customer_credit_applications" cca
    JOIN "journal_entries" je
      ON je."tenantId" = cca."tenantId"
      AND je."sourceType" = 'CUSTOMER_CREDIT_APPLICATION'
      AND je."sourceId" = cca."id"
    JOIN "journal_lines" jl ON jl."entryId" = je."id"
    WHERE cca."tenantId" = ${tenantId}
      AND cca."sourceType" = 'payment'
      AND cca."sourceId" = ${application.sourceId}
      AND cca."id" <> ${application.id}
      AND je."status" = 'posted'
      AND jl."accountId" = ${config.customerAdvancesAccountId}
  `
  const alreadyApplied = money(previousApplicationBalance?.amount)
  if (money(advancesCredit - alreadyApplied) + 0.01 < money(application.amount)) {
    throw Object.assign(new Error('The original receipt does not have enough unapplied customer-advance balance in the general ledger. Reconcile the receipt before using this credit.'), { statusCode: 409, code: 'CUSTOMER_ADVANCE_GL_BALANCE_INSUFFICIENT' })
  }
  return postReceivablesJournal(client, {
    tenantId, branchId, userId,
    sourceType: 'CUSTOMER_CREDIT_APPLICATION', sourceId: application.id,
    date: application.createdAt, reference,
    description: `Customer credit applied to ${reference || 'receivable sale'}`,
    lines: customerCreditApplicationLines(config, { amount: application.amount, reference }),
  })
}

export function customerOpeningBalanceLines(config, amount, description = 'Customer opening balance') {
  const value = money(amount)
  if (value < 0) throw Object.assign(new Error('Customer opening balance cannot be negative.'), { statusCode: 400 })
  return [
    { accountId: config.receivableAccountId, debit: value, credit: 0, description },
    { accountId: config.openingBalanceEquityAccountId, debit: 0, credit: value, description: 'Opening balance equity offset' },
  ]
}

export function creditNoteRecognitionLines(config, { amount, taxAmount = 0, refundAmount = 0, returnedCogs = 0, reference }) {
  const total = money(amount)
  const tax = money(taxAmount)
  const refund = money(refundAmount)
  if (tax < 0 || tax - total > 0.01 || refund < 0 || refund - total > 0.01) {
    throw Object.assign(new Error('Credit note tax/refund amounts are outside the note total.'), { statusCode: 400 })
  }
  const lines = [
    { accountId: config.salesReturnsAccountId, debit: money(total - tax), credit: 0, description: `Sales return / allowance ${reference || ''}`.trim() },
    { accountId: config.receivableAccountId, debit: 0, credit: money(total - refund), description: 'Credit note applied to customer receivable' },
  ]
  if (tax > 0) lines.push({ accountId: config.taxPayableAccountId, debit: tax, credit: 0, description: 'Reverse output tax on credit note' })
  if (refund > 0) lines.push({ accountId: config.customerAdvancesAccountId, debit: 0, credit: refund, description: 'Customer credit pending refund' })
  const stockCost = money(returnedCogs)
  if (stockCost > 0) lines.push(
    { accountId: config.inventoryAccountId, debit: stockCost, credit: 0, description: 'Inventory restored from customer return' },
    { accountId: config.costOfGoodsSoldAccountId, debit: 0, credit: stockCost, description: 'Reverse cost of goods sold for returned stock' },
  )
  return lines
}

export function posReturnRecognitionLines(config, { transactionAccountId, amount, taxAmount = 0, returnedCogs = 0, reference }) {
  const total = money(amount)
  const tax = money(taxAmount)
  const stockCost = money(returnedCogs)
  if (tax < 0 || tax - total > 0.01 || stockCost < 0) throw Object.assign(new Error('POS return tax or cost is outside the return total.'), { statusCode: 400 })
  const lines = [
    { accountId: config.salesReturnsAccountId, debit: money(total - tax), credit: 0, description: `Sales return ${reference || ''}`.trim() },
    { accountId: transactionAccountId, debit: 0, credit: total, description: 'Refund paid from transaction account' },
  ]
  if (tax > 0) lines.push({ accountId: config.taxPayableAccountId, debit: tax, credit: 0, description: 'Reverse output tax on return' })
  if (stockCost > 0) lines.push(
    { accountId: config.inventoryAccountId, debit: stockCost, credit: 0, description: 'Inventory restored from POS return' },
    { accountId: config.costOfGoodsSoldAccountId, debit: 0, credit: stockCost, description: 'Reverse cost of goods sold for returned stock' },
  )
  return lines
}

export function customerRefundLines(config, { transactionAccountId, amount, reference }) {
  const value = money(amount)
  return [
    { accountId: config.customerAdvancesAccountId, debit: value, credit: 0, description: `Customer refund ${reference || ''}`.trim() },
    { accountId: transactionAccountId, debit: 0, credit: value, description: 'Refund paid from transaction account' },
  ]
}

export async function reverseReceivablesJournal(client, { tenantId, sourceType, sourceId, userId, reason }) {
  const original = await client.journalEntry.findFirst({
    where: { tenantId, sourceType, sourceId },
    include: { lines: { include: { account: true } } },
  })
  if (!original || original.status === 'reversed' || original.reversalJournalId) return null
  const lines = original.lines.map((line) => ({
    accountId: line.accountId,
    debit: money(line.credit),
    credit: money(line.debit),
    description: `Reversal of ${original.entryNo}: ${reason}`,
  }))
  const now = new Date()
  const reversal = await client.journalEntry.create({
    data: {
      tenantId, branchId: original.branchId, userId,
      entryNo: sourceName('AR-REV', `${original.id}-${Date.now()}`),
      date: now, description: `Reversal of ${original.entryNo}: ${reason}`,
      reference: original.reference || original.entryNo,
      sourceType: 'RECEIVABLE_JOURNAL_REVERSAL', sourceId: original.id,
      reversalOfId: original.id, reversalReason: reason, status: 'posted',
      lines: { create: lines },
    },
    include: { lines: { include: { account: true } } },
  })
  await client.journalEntry.update({ where: { id: original.id }, data: {
    status: 'reversed', reversalJournalId: reversal.id, reversalReason: reason, reversedBy: userId, reversedAt: now,
  } })
  const accountById = new Map(original.lines.map((line) => [line.accountId, line.account]))
  const deltas = new Map()
  for (const line of lines) {
    const account = accountById.get(line.accountId)
    if (!account || linkedCashAccountId(account)) continue
    deltas.set(account.id, (deltas.get(account.id) || 0) + normalBalanceDelta(account, line.debit, line.credit))
  }
  for (const [accountId, delta] of deltas) await client.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
  return reversal
}
