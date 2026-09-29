import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureTenantAccountingSetup, setupTenantAccountingSystem } from '../src/services/tenantAccountingSetupService.js'

function createDatabase({ history = 0 } = {}) {
  const accounts = []
  const configs = { receivables: null, payables: null }
  const db = {
    account: {
      findMany: async ({ where = {} } = {}) => {
        let rows = accounts.filter((account) => account.tenantId === where.tenantId)
        if (where.id?.in) rows = rows.filter((account) => where.id.in.includes(account.id))
        return rows.map((account) => ({ ...account, _count: { children: 0 } }))
      },
      findFirst: async ({ where }) => accounts.find((account) => account.id === where.id && account.tenantId === where.tenantId) || null,
      create: async ({ data }) => {
        const account = { id: `account-${accounts.length + 1}`, ...data, _count: { children: 0 } }
        accounts.push(account)
        return account
      },
      count: async () => history,
    },
    receivablesAccountingConfig: {
      findUnique: async () => configs.receivables,
      upsert: async ({ create, update }) => {
        configs.receivables = configs.receivables ? { ...configs.receivables, ...update } : { id: 'ar-config', ...create }
        return configs.receivables
      },
    },
    payablesAccountingConfig: {
      findUnique: async () => configs.payables,
      upsert: async ({ create, update }) => {
        configs.payables = configs.payables ? { ...configs.payables, ...update } : { id: 'ap-config', ...create }
        return configs.payables
      },
    },
    _accounts: accounts,
    _configs: configs,
  }
  for (const model of ['sale', 'saleRecord', 'purchase', 'supplierPurchase', 'customerPayment', 'supplierPayment', 'expense', 'journalEntry', 'creditNote', 'debitNote', 'saleReturn', 'customerWithdrawal', 'cashTransaction', 'customer', 'supplier', 'product', 'cashAccount', 'auditLog', 'payroll', 'salaryAdvance']) {
    db[model] = { count: async () => history }
  }
  return db
}

test('new tenant setup provisions valid account mappings and is idempotent', async () => {
  const db = createDatabase()
  const first = await ensureTenantAccountingSetup(db, { tenantId: 'new-tenant', userId: 'owner', enableNewSetups: true })
  assert.equal(first.receivables.isEnabled, true)
  assert.equal(first.payables.isEnabled, true)
  assert.equal(db._accounts.length, 11)
  const second = await ensureTenantAccountingSetup(db, { tenantId: 'new-tenant', userId: 'owner', enableNewSetups: true })
  assert.equal(second.receivables.isEnabled, true)
  assert.equal(second.payables.isEnabled, true)
  assert.equal(db._accounts.length, 11)
})

test('existing tenant with transaction history gets mappings but stays disabled for signed-off migration', async () => {
  const db = createDatabase({ history: 1 })
  const setup = await setupTenantAccountingSystem(db, { tenantId: 'legacy-tenant', userId: 'owner' })
  assert.equal(setup.historicalReviewRequired, true)
  assert.equal(setup.historicalActivityCount, 21)
  assert.equal(setup.receivables.isEnabled, false)
  assert.equal(setup.payables.isEnabled, false)
  assert.equal(db._accounts.length, 11)
})

test('existing incomplete configuration gets only missing mappings and stays disabled', async () => {
  const db = createDatabase({ history: 1 })
  const initial = await ensureTenantAccountingSetup(db, { tenantId: 'legacy-tenant', userId: 'owner', enableNewSetups: false })
  db._configs.receivables.openingBalanceEquityAccountId = null
  const accountCount = db._accounts.length
  const repaired = await ensureTenantAccountingSetup(db, { tenantId: 'legacy-tenant', userId: 'owner', enableNewSetups: false })
  assert.equal(repaired.receivables.isEnabled, false)
  assert.equal(repaired.receivables.openingBalanceEquityAccountId, initial.payables.openingBalanceEquityAccountId)
  assert.equal(db._accounts.length, accountCount)
})

test('validated mappings auto-enable posting when no accounting history exists', async () => {
  const db = createDatabase()
  await ensureTenantAccountingSetup(db, { tenantId: 'empty-tenant', userId: 'owner', enableNewSetups: false })
  assert.equal(db._configs.receivables.isEnabled, false)
  const setup = await setupTenantAccountingSystem(db, { tenantId: 'empty-tenant', userId: 'owner' })
  assert.equal(setup.historicalActivityCount, 0)
  assert.equal(setup.receivables.isEnabled, true)
  assert.equal(setup.payables.isEnabled, true)
})
