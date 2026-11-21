import { ensureTenantAccountingSetup } from './tenantAccountingSetupService.js'
import { getReceivablesAccountingConfig } from './receivablesAccountingService.js'
import { calculateCustomerReceivableBalance, reconcileCustomerReceivableBalance } from '../utils/customerBalance.js'
import { linkedCashAccountId } from '../utils/accountingSync.js'

const money = value => Math.round((Number(value) || 0) * 100) / 100
const WALLET_ACCOUNT_MARKER = 'JibuSales system accounting role: customerWalletAccountId'

export function legacyCustomerCreditToReclassify(balance) {
  return money(Math.max(0, -(Number(balance) || 0)))
}

export async function getCustomerWalletBalance(client, tenantId, walletId) {
  if (!walletId) return 0
  const groups = await client.customerWalletTransaction.groupBy({
    by: ['direction'],
    where: { tenantId, walletId },
    _sum: { amount: true },
  })
  return money(groups.reduce((sum, row) => sum + (row.direction === 'in' ? 1 : -1) * money(row._sum.amount), 0))
}

export async function ensureCustomerWalletAccount(client, tenantId) {
  await client.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`
  const marked = await client.account.findFirst({ where: { tenantId, description: { contains: WALLET_ACCOUNT_MARKER } }, include: { _count: { select: { children: true } } } })
  if (marked) {
    if (!marked.isActive || marked.type !== 'liability' || marked.parentId || marked._count.children) {
      throw Object.assign(new Error('The system-managed Customer Wallet Liability account is not postable. Ask an accounting administrator to review the chart.'), { statusCode: 409 })
    }
    return marked
  }
  const existing = await client.account.findMany({ where: { tenantId }, include: { _count: { select: { children: true } } } })
  const match = existing.filter(account => account.isActive && account.type === 'liability' && !account.parentId && !account._count.children && String(account.name).trim().toLowerCase() === 'customer wallet liability')
  if (match.length === 1) return match[0]
  let code = 'SYS-2310'
  let suffix = 1
  while (existing.some(account => account.code === code)) code = `SYS-2310-${suffix++}`
  return client.account.create({ data: {
    tenantId,
    code,
    name: 'Customer Wallet Liability (JibuSales)',
    type: 'liability',
    subType: 'current_liability',
    isActive: true,
    isSystemManaged: true,
    description: WALLET_ACCOUNT_MARKER,
  } })
}

async function migrateLegacyCustomerCredit(client, { scope, customer, wallet, userId, branchId, amount }) {
  const migratedAmount = money(amount)
  if (migratedAmount <= 0) return wallet
  await ensureTenantAccountingSetup(client, { tenantId: scope.tenantId, userId, enableNewSetups: false })
  const config = await getReceivablesAccountingConfig(client, scope.tenantId)
  const walletAccount = await ensureCustomerWalletAccount(client, scope.tenantId)
  if (!config?.customerAdvancesAccountId) throw Object.assign(new Error('Customer Advances accounting is not configured. Configure receivables accounting before migrating customer funds.'), { statusCode: 409 })
  const advancesAccount = await client.account.findFirst({
    where: { id: config.customerAdvancesAccountId, tenantId: scope.tenantId, isActive: true },
    include: { _count: { select: { children: true } } },
  })
  if (!advancesAccount || advancesAccount.type !== 'liability' || advancesAccount.parentId || advancesAccount._count?.children || linkedCashAccountId(advancesAccount)) {
    throw Object.assign(new Error('Customer Advances must be an active, postable liability account before legacy customer funds can be migrated.'), { statusCode: 409 })
  }

  const transaction = await client.customerWalletTransaction.create({ data: {
    tenantId: scope.tenantId,
    branchId: branchId || customer.branchId || wallet.branchId || null,
    walletId: wallet.id,
    userId: userId || null,
    kind: 'legacy_opening',
    direction: 'in',
    amount: migratedAmount,
    reference: `WALLET-RECLASS-${Date.now()}`,
    sourceType: 'legacy_customer_credit',
    sourceId: customer.id,
    notes: 'Existing customer credit reclassified into the customer wallet. No new cash was received.',
  } })
  wallet = await client.customerWallet.update({ where: { id: wallet.id }, data: { migratedLegacyAmount: { increment: migratedAmount } } })
  await postWalletJournal(client, {
    tenantId: scope.tenantId, branchId: branchId || customer.branchId || null, userId,
    sourceType: 'CUSTOMER_WALLET_LEGACY_MIGRATION', sourceId: transaction.id,
    reference: transaction.reference,
    description: `Reclassify existing customer credit into wallet for ${customer.name}`,
    lines: [
      { accountId: advancesAccount.id, debit: migratedAmount, credit: 0, description: 'Reclassify existing customer advance' },
      { accountId: walletAccount.id, debit: 0, credit: migratedAmount, description: 'Recognize customer wallet liability' },
    ],
  })
  return wallet
}

async function postWalletJournal(client, { tenantId, branchId, userId, sourceType, sourceId, date, reference, description, lines }) {
  await ensureTenantAccountingSetup(client, { tenantId, userId, enableNewSetups: false })
  const existing = await client.journalEntry.findFirst({ where: { tenantId, sourceType, sourceId }, include: { lines: true } })
  if (existing) return { posted: false, duplicate: true, entry: existing }
  const normalized = lines.map(line => ({
    accountId: line.accountId, debit: money(line.debit), credit: money(line.credit),
    description: line.description || description,
  })).filter(line => line.debit || line.credit)
  if (!normalized.length || normalized.some(line => line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))) {
    throw Object.assign(new Error('Customer wallet journal lines are invalid.'), { statusCode: 400 })
  }
  const debit = money(normalized.reduce((sum, line) => sum + line.debit, 0))
  const credit = money(normalized.reduce((sum, line) => sum + line.credit, 0))
  if (Math.abs(debit - credit) > 0.01) throw Object.assign(new Error('Customer wallet accounting entry is not balanced.'), { statusCode: 409 })
  const accountIds = [...new Set(normalized.map(line => line.accountId))]
  const accounts = await client.account.findMany({ where: { tenantId, id: { in: accountIds }, isActive: true } })
  if (accounts.length !== accountIds.length) throw Object.assign(new Error('A Customer Wallet accounting account is missing or inactive.'), { statusCode: 409 })
  const byId = new Map(accounts.map(account => [account.id, account]))
  if (accountIds.some(id => byId.get(id).parentId)) throw Object.assign(new Error('Customer Wallet journals cannot post to a parent account.'), { statusCode: 409 })
  const entryNo = `WAL-${String(sourceType).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${String(sourceId).replace(/[^a-zA-Z0-9]/g, '').slice(-32)}`
  const entry = await client.journalEntry.create({
    data: {
      tenantId, branchId, userId, sourceType, sourceId, date, entryNo, reference: reference || sourceId,
      description, status: 'posted',
      lines: { create: normalized },
    }, include: { lines: { include: { account: true } } },
  })
  const deltas = new Map()
  for (const line of normalized) {
    const account = byId.get(line.accountId)
    if (linkedCashAccountId(account)) continue
    const debitNormal = ['asset', 'expense', 'expenses'].includes(String(account.type).toLowerCase())
    const delta = debitNormal ? line.debit - line.credit : line.credit - line.debit
    deltas.set(account.id, money((deltas.get(account.id) || 0) + delta))
  }
  for (const [accountId, delta] of deltas) await client.account.update({ where: { id: accountId }, data: { balance: { increment: delta } } })
  return { posted: true, entry }
}

export async function openCustomerWallet(client, { scope, customerId, userId, branchId, allowLegacyMigration = true }) {
  await client.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} AND "tenantId" = ${scope.tenantId} FOR UPDATE`
  const customer = await client.customer.findFirst({ where: { id: customerId, tenantId: scope.tenantId } })
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
  let wallet = await client.customerWallet.findFirst({ where: { tenantId: scope.tenantId, customerId } })
  if (wallet?.isActive) {
    let migrated = false
    if (allowLegacyMigration) {
      const prior = await calculateCustomerReceivableBalance(client, scope, customerId)
      const amount = legacyCustomerCreditToReclassify(prior?.balance)
      if (amount > 0) {
        wallet = await migrateLegacyCustomerCredit(client, { scope, customer, wallet, userId, branchId, amount })
        migrated = true
      }
    }
    const receivable = await reconcileCustomerReceivableBalance(client, scope, customerId)
    return { wallet, balance: await getCustomerWalletBalance(client, scope.tenantId, wallet.id), receivableBalance: receivable?.balance ?? 0, migrated }
  }

  // The customer row lock makes catch-up migration idempotent across concurrent profile loads.
  if (wallet) {
    wallet = await client.customerWallet.update({
      where: { id: wallet.id },
      data: { isActive: true, branchId: branchId || customer.branchId || wallet.branchId || null, createdById: userId || wallet.createdById || null },
    })
    await ensureTenantAccountingSetup(client, { tenantId: scope.tenantId, userId, enableNewSetups: false })
    await ensureCustomerWalletAccount(client, scope.tenantId)
    let migrated = false
    if (allowLegacyMigration) {
      const prior = await calculateCustomerReceivableBalance(client, scope, customerId)
      const amount = legacyCustomerCreditToReclassify(prior?.balance)
      if (amount > 0) {
        wallet = await migrateLegacyCustomerCredit(client, { scope, customer, wallet, userId, branchId, amount })
        migrated = true
      }
    }
    const receivable = await reconcileCustomerReceivableBalance(client, scope, customerId)
    return { wallet, balance: await getCustomerWalletBalance(client, scope.tenantId, wallet.id), receivableBalance: receivable?.balance ?? 0, migrated }
  }

  const prior = allowLegacyMigration ? await calculateCustomerReceivableBalance(client, scope, customerId) : null
  const migratedLegacyAmount = legacyCustomerCreditToReclassify(prior?.balance)

  wallet = await client.customerWallet.create({ data: {
    tenantId: scope.tenantId,
    customerId,
    branchId: branchId || customer.branchId || null,
    createdById: userId || null,
    migratedLegacyAmount: 0,
  } })
  await client.customer.update({ where: { id: customerId }, data: { walletEnabled: true } })
  await ensureCustomerWalletAccount(client, scope.tenantId)
  if (migratedLegacyAmount > 0) {
    wallet = await migrateLegacyCustomerCredit(client, { scope, customer, wallet, userId, branchId, amount: migratedLegacyAmount })
  }
  const receivable = await reconcileCustomerReceivableBalance(client, scope, customerId)
  return { wallet, balance: await getCustomerWalletBalance(client, scope.tenantId, wallet.id), receivableBalance: receivable?.balance ?? 0, migrated: migratedLegacyAmount > 0 }
}

export async function recordCustomerWalletOpeningBalance(client, { scope, customerId, userId, branchId, amount, date, reference, customerName }) {
  const value = money(amount)
  if (value <= 0) return null
  const wallet = await client.customerWallet.findFirst({ where: { tenantId: scope.tenantId, customerId, isActive: true } })
  if (!wallet) throw Object.assign(new Error('Activate the customer wallet before recording a savings opening balance.'), { statusCode: 409 })
  const config = await getReceivablesAccountingConfig(client, scope.tenantId)
  if (!config?.openingBalanceEquityAccountId) throw Object.assign(new Error('Opening Balance Equity is not configured for this business.'), { statusCode: 409 })
  const equity = await client.account.findFirst({
    where: { id: config.openingBalanceEquityAccountId, tenantId: scope.tenantId, isActive: true },
    include: { _count: { select: { children: true } } },
  })
  if (!equity || equity.type !== 'equity' || equity.parentId || equity._count?.children || linkedCashAccountId(equity)) {
    throw Object.assign(new Error('Opening Balance Equity must be an active, postable equity account before recording customer savings.'), { statusCode: 409 })
  }
  const walletAccount = await ensureCustomerWalletAccount(client, scope.tenantId)
  await client.customerWallet.update({ where: { id: wallet.id }, data: { migratedLegacyAmount: { increment: value } } })
  const transaction = await client.customerWalletTransaction.create({ data: {
    tenantId: scope.tenantId, branchId: branchId || wallet.branchId || null, walletId: wallet.id,
    userId: userId || null, kind: 'opening_balance', direction: 'in', amount: value,
    reference: reference || `WALLET-OPEN-${customerId.slice(-10)}`,
    sourceType: 'customer_opening_balance', sourceId: customerId,
    idempotencyKey: `wallet-opening:${wallet.id}`.slice(0, 160),
    notes: `Customer funds held before JibuSales${customerName ? ` for ${customerName}` : ''}. No cash received at opening.`,
  } })
  await postWalletJournal(client, {
    tenantId: scope.tenantId, branchId: branchId || wallet.branchId || null, userId,
    sourceType: 'CUSTOMER_WALLET_OPENING_BALANCE', sourceId: customerId, date,
    reference: reference || transaction.reference,
    description: `Customer wallet opening balance${customerName ? ` for ${customerName}` : ''}`,
    lines: [
      { accountId: equity.id, debit: value, credit: 0, description: 'Recognize customer opening funds' },
      { accountId: walletAccount.id, debit: 0, credit: value, description: 'Recognize customer wallet liability' },
    ],
  })
  return transaction
}

export async function postWalletJournalEntry(client, { tenantId, branchId, userId, sourceType, sourceId, date, reference, description, lines }) {
  return postWalletJournal(client, { tenantId, branchId, userId, sourceType, sourceId, date, reference, description, lines })
}
