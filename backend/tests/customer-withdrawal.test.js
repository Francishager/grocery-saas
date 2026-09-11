import test from 'node:test'
import assert from 'node:assert/strict'
import { recordCustomerWithdrawal } from '../src/services/customerWithdrawalService.js'

function fixture({ paid = 10000, sales = [], notes = [], previousWithdrawals = [], cash = 50000, status = 'active', openingBalance = 0, failCashPosting = false } = {}) {
  let state = {
    customer: { id: 'customer', tenantId: 'tenant', branchId: 'branch', name: 'Customer', status, openingBalance, balance: -999999, creditLimit: 100000000 },
    cash: { id: 'cash', tenantId: 'tenant', isActive: true, name: 'Till', balance: cash },
    linked: { id: 'linked', balance: cash }, withdrawals: previousWithdrawals.map((amount) => ({ amount })), movements: [],
  }
  const tx = {
    $queryRaw: async (strings, ...values) => {
      assert.match(strings.join('?'), /FOR UPDATE/)
      assert.equal(values[0], 'customer')
      return values[1] === 'tenant' ? [{ id: 'customer' }] : []
    },
    customer: {
      findFirst: async ({ where }) => where.id === state.customer.id && where.tenantId === state.customer.tenantId
        && (!where.branchId || where.branchId === state.customer.branchId) ? { ...state.customer } : null,
      update: async ({ data }) => Object.assign(state.customer, data),
    },
    saleRecord: { findMany: async () => sales },
    creditNote: { findMany: async () => notes },
    customerPayment: { aggregate: async () => ({ _sum: { amount: paid } }) },
    saleReturn: { aggregate: async () => ({ _sum: { total: 0 } }) },
    customerWithdrawal: {
      aggregate: async () => ({ _sum: { amount: state.withdrawals.reduce((sum, row) => sum + row.amount, 0) } }),
      create: async ({ data }) => {
        const row = { id: `withdrawal-${state.withdrawals.length}`, ...data }
        state.withdrawals.push(row)
        return { ...row, customer: { ...state.customer }, cashAccount: { ...state.cash } }
      },
    },
    cashAccount: {
      updateMany: async ({ where, data }) => {
        assert.equal(where.tenantId, 'tenant')
        assert.equal(where.isActive, true)
        if (where.id !== state.cash.id || state.cash.balance < where.balance.gte) return { count: 0 }
        state.cash.balance -= data.balance.decrement
        return { count: 1 }
      },
      findUnique: async () => ({ ...state.cash }),
    },
    cashTransaction: { create: async ({ data }) => {
      if (failCashPosting) throw new Error('Posting failed')
      state.movements.push(data)
      return data
    } },
    account: {
      findFirst: async () => ({ ...state.linked }),
      update: async ({ data }) => Object.assign(state.linked, data),
    },
  }
  let queue = Promise.resolve()
  const client = { $transaction: (action, options) => {
    assert.equal(options.isolationLevel, 'Serializable')
    const run = queue.then(async () => {
      const before = structuredClone(state)
      try { return await action(tx) } catch (error) { state = before; throw error }
    })
    queue = run.catch(() => {})
    return run
  } }
  const withdraw = (amount, extra = {}) => recordCustomerWithdrawal(client, {
    scope: { tenantId: 'tenant', branchId: 'branch' }, customerId: 'customer', userId: 'staff', amount,
    resolveAccount: async () => ({ ...state.cash }), ...extra,
  })
  return { withdraw, state: () => structuredClone(state) }
}

for (const [label, paid, sales] of [
  ['zero funds', 0, []], ['customer debt', 0, [{ total: 50000 }]],
]) {
  test(`rejects ${label} even with a large credit limit and stale saved customer balance`, async () => {
    const f = fixture({ paid, sales })
    const before = f.state()
    await assert.rejects(f.withdraw(100), { code: 'INSUFFICIENT_CUSTOMER_FUNDS', availableFunds: 0 })
    assert.deepEqual(f.state(), before)
  })
}

test('rejects one cent above available funds without touching either ledger', async () => {
  const f = fixture()
  const before = f.state()
  await assert.rejects(f.withdraw(10000.01), { code: 'INSUFFICIENT_CUSTOMER_FUNDS', availableFunds: 10000 })
  assert.deepEqual(f.state(), before)
})

test('exact available funds can be withdrawn and customer, cash, linked account and movement reconcile', async () => {
  const f = fixture()
  const result = await f.withdraw('10000')
  assert.equal(result.customer.balance, 0)
  assert.equal(result.cashAccount.balance, 40000)
  assert.equal(f.state().linked.balance, 40000)
  assert.equal(f.state().withdrawals.length, 1)
  assert.equal(f.state().movements[0].amount, 10000)
  await assert.rejects(f.withdraw(0.01), { code: 'INSUFFICIENT_CUSTOMER_FUNDS', availableFunds: 0 })
})

test('existing withdrawals, opening debt and sales all reduce customer funds', async () => {
  const f = fixture({ paid: 10000, sales: [{ total: 2000 }], openingBalance: 1000, previousWithdrawals: [3000] })
  await assert.rejects(f.withdraw(4000.01), { availableFunds: 4000 })
  const result = await f.withdraw(3500)
  assert.equal(result.customer.balance, -500)
})

test('returned discounted sale makes only real customer payments withdrawable', async () => {
  const sale = { id: 'sale', total: 10000, subtotal: 12000, discount: 2000, status: 'completed', customerId: 'customer' }
  const f = fixture({ paid: 2000, sales: [sale], notes: [{ saleId: sale.id, customerId: 'customer', amount: 12000, sale }] })
  await assert.rejects(f.withdraw(2000.01), { availableFunds: 2000 })
  assert.equal((await f.withdraw(2000)).customer.balance, 0)
})

test('a shared account cannot be overdrawn even when the customer has enough funds', async () => {
  const f = fixture({ cash: 100 })
  const before = f.state()
  await assert.rejects(f.withdraw(101, { resolveAccount: async () => ({ id: 'cash', name: 'Till', balance: 50000 }) }), { code: 'INSUFFICIENT_ACCOUNT_BALANCE' })
  assert.deepEqual(f.state(), before)
})

test('account permission rejection and failed ledger postings roll back the payout', async () => {
  const f = fixture()
  const before = f.state()
  await assert.rejects(f.withdraw(100, { resolveAccount: async () => { throw Object.assign(new Error('Forbidden'), { statusCode: 403 }) } }), { statusCode: 403 })
  assert.deepEqual(f.state(), before)
  const broken = fixture({ failCashPosting: true })
  const original = broken.state()
  await assert.rejects(broken.withdraw(100), /Posting failed/)
  assert.deepEqual(broken.state(), original)
})

test('two queued payouts cannot consume the same customer funds twice', async () => {
  const f = fixture()
  const results = await Promise.allSettled([f.withdraw(6000), f.withdraw(6000)])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'INSUFFICIENT_CUSTOMER_FUNDS')
  assert.equal(f.state().customer.balance, -4000)
  assert.equal(f.state().cash.balance, 44000)
})

test('serializable conflicts return a retryable response', async () => {
  await assert.rejects(recordCustomerWithdrawal({ $transaction: async () => { throw { code: 'P2034' } } },
    { scope: { tenantId: 'tenant' }, customerId: 'customer', amount: 1 }), { statusCode: 409, code: 'CUSTOMER_FUNDS_CHANGED' })
})

test('rejects invalid amounts, inactive customers and inaccessible branches', async () => {
  for (const amount of [0, -1, 0.001, 1.001, NaN, Infinity, '', 'bad', true, null, Number.MAX_VALUE]) {
    await assert.rejects(fixture().withdraw(amount), { code: 'INVALID_WITHDRAWAL_AMOUNT' })
  }
  await assert.rejects(fixture({ status: 'blocked' }).withdraw(10), { code: 'CUSTOMER_INACTIVE' })
  await assert.rejects(fixture().withdraw(10, { scope: { tenantId: 'tenant', branchId: 'other' } }), { statusCode: 404 })
  await assert.rejects(fixture().withdraw(10, { scope: { tenantId: 'other', branchId: 'branch' } }), { statusCode: 404 })
})
