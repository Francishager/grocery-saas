import { linkedCashAccountId } from '../utils/accountingSync.js'
import { getReceivablesAccountingConfig, saveReceivablesAccountingConfig, validateReceivablesAccountingConfig } from './receivablesAccountingService.js'
import { getPayablesAccountingConfig, savePayablesAccountingConfig, validatePayablesAccountingConfig } from './payablesAccountingService.js'

const SYSTEM_ACCOUNT_MARKER = 'JibuSales system accounting role:'

const SYSTEM_ACCOUNT_ROLES = [
  { key: 'receivableAccountId', name: 'Accounts Receivable', code: '1200', type: 'asset', subType: 'current_asset', candidates: ['1200', 'AR', 'Accounts Receivable', 'Trade Receivables'] },
  { key: 'inventoryAccountId', name: 'Inventory', code: '1300', type: 'asset', subType: 'inventory', candidates: ['1300', 'Inventory', 'Inventory Asset'] },
  { key: 'taxPayableAccountId', name: 'Output Tax Payable', code: '2200', type: 'liability', subType: 'current_liability', candidates: ['2200', 'VAT Payable', 'Sales Tax Payable', 'Output Tax Payable'] },
  { key: 'customerAdvancesAccountId', name: 'Customer Advances', code: '2300', type: 'liability', subType: 'current_liability', candidates: ['2300', 'Customer Advances', 'Customer Deposits', 'Unearned Revenue'] },
  { key: 'salesRevenueAccountId', name: 'Sales Revenue', code: '4000', type: 'revenue', subType: 'operating_revenue', candidates: ['4000', 'Sales Revenue', 'Sales'] },
  { key: 'salesReturnsAccountId', name: 'Sales Returns and Allowances', code: '4050', type: 'revenue', subType: 'contra_revenue', candidates: ['4050', 'Sales Returns', 'Sales Returns and Allowances'] },
  { key: 'costOfGoodsSoldAccountId', name: 'Cost of Goods Sold', code: '5000', type: 'expense', subType: 'cost_of_sales', candidates: ['5000', 'Cost of Goods Sold', 'Cost of Sales'] },
  { key: 'payableAccountId', name: 'Accounts Payable', code: '2000', type: 'liability', subType: 'current_liability', candidates: ['AP', 'Accounts Payable', 'Trade Payables'] },
  { key: 'openingBalanceEquityAccountId', name: 'Opening Balance Equity', code: '3900', type: 'equity', subType: 'opening_balance', candidates: ['Opening Balance Equity'] },
  { key: 'purchaseExpenseAccountId', name: 'Supplier Service Purchases', code: '6200', type: 'expense', subType: 'operating_expense', candidates: ['6200', 'Supplier Service Purchases'] },
  { key: 'purchaseReturnsAccountId', name: 'Purchase Returns and Allowances', code: '6050', type: 'expense', subType: 'contra_expense', candidates: ['6050', 'Purchase Returns', 'Purchase Returns and Allowances'] },
]

function isPostable(account) {
  return Boolean(account?.isActive) && !account.parentId && !Number(account._count?.children || 0) && !linkedCashAccountId(account) && String(account.subType || '').toLowerCase() !== 'category'
}

async function provisionAccount(client, tenantId, role) {
  const accounts = await client.account.findMany({
    where: { tenantId },
    include: { _count: { select: { children: true } } },
    orderBy: { code: 'asc' },
  })
  const marker = `${SYSTEM_ACCOUNT_MARKER} ${role.key}`
  const managed = accounts.find((account) => String(account.description || '').includes(marker))
  if (managed) {
    if (!isPostable(managed) || String(managed.type).toLowerCase() !== role.type) {
      throw Object.assign(new Error(`System accounting account for ${role.key} is inactive or no longer valid. Ask an accounting administrator to review the chart.`), { statusCode: 409 })
    }
    return managed
  }

  const candidateNames = new Set(role.candidates.map((candidate) => candidate.toLowerCase()))
  const matches = accounts.filter((account) => (
    isPostable(account) &&
    String(account.type).toLowerCase() === role.type &&
    candidateNames.has(String(account.name || '').trim().toLowerCase())
  ))
  if (matches.length === 1) return matches[0]

  let code = `SYS-${role.code}`
  let suffix = 1
  while (accounts.some((account) => account.code === code)) code = `SYS-${role.code}-${suffix++}`
  return client.account.create({
    data: {
      tenantId,
      code,
      name: `${role.name} (JibuSales)` ,
      type: role.type,
      subType: role.subType,
      isActive: true,
      isSystemManaged: true,
      description: marker,
    },
    include: { _count: { select: { children: true } } },
  })
}

async function ensureWithClient(client, { tenantId, userId, enableNewSetups }) {
  if (!tenantId) throw new Error('Tenant is required for accounting setup.')
  const [receivablesExisting, payablesExisting] = await Promise.all([
    getReceivablesAccountingConfig(client, tenantId),
    getPayablesAccountingConfig(client, tenantId),
  ])
  const accountsByRole = new Map()
  for (const role of SYSTEM_ACCOUNT_ROLES) {
    const existingId = receivablesExisting?.[role.key] || payablesExisting?.[role.key]
    if (existingId) {
      const existingAccount = await client.account.findFirst({ where: { id: existingId, tenantId } })
      if (existingAccount) accountsByRole.set(role.key, existingAccount)
    }
  }
  const receivablesRoles = SYSTEM_ACCOUNT_ROLES.filter((role) => ['receivableAccountId', 'salesRevenueAccountId', 'taxPayableAccountId', 'salesReturnsAccountId', 'costOfGoodsSoldAccountId', 'inventoryAccountId', 'customerAdvancesAccountId', 'openingBalanceEquityAccountId'].includes(role.key))
  const payablesRoles = SYSTEM_ACCOUNT_ROLES.filter((role) => ['payableAccountId', 'openingBalanceEquityAccountId', 'purchaseExpenseAccountId', 'inventoryAccountId', 'purchaseReturnsAccountId'].includes(role.key))
  const rolesToProvision = new Set([
    ...receivablesRoles.filter((role) => !receivablesExisting?.[role.key]).map((role) => role.key),
    ...payablesRoles.filter((role) => !payablesExisting?.[role.key]).map((role) => role.key),
  ])
  for (const role of SYSTEM_ACCOUNT_ROLES) {
    if (rolesToProvision.has(role.key) && !accountsByRole.has(role.key)) accountsByRole.set(role.key, await provisionAccount(client, tenantId, role))
  }

  if (!receivablesExisting || receivablesRoles.some((role) => !receivablesExisting[role.key])) {
    const values = Object.fromEntries(receivablesRoles.map((role) => [role.key, receivablesExisting?.[role.key] || accountsByRole.get(role.key).id]))
    values.isEnabled = receivablesExisting ? Boolean(receivablesExisting.isEnabled) : Boolean(enableNewSetups)
    const validation = await validateReceivablesAccountingConfig(client, tenantId, values)
    if (!validation.valid) throw Object.assign(new Error(validation.errors?.join('. ') || 'Automatic receivables account setup did not validate.'), { statusCode: 409 })
    await saveReceivablesAccountingConfig(client, tenantId, userId, values)
  }

  if (!payablesExisting || payablesRoles.some((role) => !payablesExisting[role.key])) {
    const values = Object.fromEntries(payablesRoles.map((role) => [role.key, payablesExisting?.[role.key] || accountsByRole.get(role.key).id]))
    values.isEnabled = payablesExisting ? Boolean(payablesExisting.isEnabled) : Boolean(enableNewSetups)
    const validation = await validatePayablesAccountingConfig(client, tenantId, values)
    if (!validation.valid) throw Object.assign(new Error(validation.errors?.join('. ') || 'Automatic payables account setup did not validate.'), { statusCode: 409 })
    await savePayablesAccountingConfig(client, tenantId, userId, values)
  }

  return {
    receivables: await getReceivablesAccountingConfig(client, tenantId),
    payables: await getPayablesAccountingConfig(client, tenantId),
    automatic: !receivablesExisting && !payablesExisting && Boolean(enableNewSetups),
  }
}

export async function ensureTenantAccountingSetup(client, options) {
  if (typeof client.$transaction === 'function') {
    return client.$transaction((tx) => ensureWithClient(tx, options))
  }
  return ensureWithClient(client, options)
}

export async function setupTenantAccountingSystem(client, { tenantId, userId }) {
  const accountingConfigAlreadyExists = await Promise.all([
    getReceivablesAccountingConfig(client, tenantId),
    getPayablesAccountingConfig(client, tenantId),
  ])
  const historicalActivityCount = await countAccountingHistory(client, tenantId)
  const isTrulyNew = historicalActivityCount === 0 && accountingConfigAlreadyExists.every((config) => !config)
  const setup = await ensureTenantAccountingSetup(client, { tenantId, userId, enableNewSetups: isTrulyNew })
  return {
    ...setup,
    historicalActivityCount,
    historicalReviewRequired: historicalActivityCount > 0 && (!setup.receivables?.isEnabled || !setup.payables?.isEnabled),
  }
}

export async function countAccountingHistory(client, tenantId) {
  const historyModels = ['sale', 'saleRecord', 'purchase', 'supplierPurchase', 'customerPayment', 'supplierPayment', 'expense', 'journalEntry', 'creditNote', 'debitNote', 'saleReturn', 'customerWithdrawal', 'cashTransaction']
  const historyCounts = await Promise.all([
    ...historyModels.map((model) => client[model].count({ where: { tenantId } })),
    client.customer.count({ where: { tenantId, OR: [{ balance: { gt: 0 } }, { openingBalance: { gt: 0 } }] } }),
    client.supplier.count({ where: { tenantId, OR: [{ balance: { gt: 0 } }, { openingBalance: { gt: 0 } }] } }),
    client.product.count({ where: { tenantId, quantity: { gt: 0 } } }),
    client.cashAccount.count({ where: { tenantId, balance: { not: 0 } } }),
    client.account.count({ where: { tenantId, balance: { not: 0 } } }),
    client.auditLog.count({ where: { tenantId } }),
    client.payroll.count({ where: { tenantId } }),
    client.salaryAdvance.count({ where: { tenantId } }),
  ])
  return historyCounts.reduce((total, count) => total + count, 0)
}

export const tenantAccountingSystemRoles = SYSTEM_ACCOUNT_ROLES
