import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSubledgerAdjustmentLines, previewTenantAccountingCutover } from '../src/services/tenantAccountingCutoverService.js'

function makeClient() {
  const accounts = [
    { id: 'ar', tenantId: 't1', code: '1200', name: 'Accounts Receivable', type: 'asset', balance: 125, isActive: true, parentId: null, subType: 'current_asset', _count: { children: 0 } },
    { id: 'cash-ledger', tenantId: 't1', code: 'SYS-1000', name: 'Cash account', type: 'asset', balance: 75, isActive: true, parentId: null, subType: 'transaction_cash', description: 'cashAccount:cash-1', _count: { children: 0 } },
    { id: 'ap', tenantId: 't1', code: '2000', name: 'Accounts Payable', type: 'liability', balance: 10, isActive: true, parentId: null, subType: 'current_liability', _count: { children: 0 } },
    { id: 'parent', tenantId: 't1', code: '1000', name: 'Assets', type: 'asset', balance: 200, isActive: true, parentId: null, subType: 'category', _count: { children: 1 } },
  ]
  return {
    account: { findMany: async () => accounts },
    journalLine: { findMany: async () => [
      { accountId: 'ar', debit: 100, credit: 0 },
      { accountId: 'cash-ledger', debit: 40, credit: 0 },
      { accountId: 'ap', debit: 0, credit: 10 },
    ] },
    customer: { findMany: async () => [{ id: 'c1', name: 'Customer', balance: 125 }] },
    supplier: { findMany: async () => [{ id: 's1', name: 'Supplier', balance: 20 }] },
    cashAccount: { findMany: async () => [{ id: 'cash-1', name: 'Till', balance: 75 }] },
    receivablesAccountingConfig: { findUnique: async () => ({ receivableAccountId: 'ar', openingBalanceEquityAccountId: 'equity' }) },
    payablesAccountingConfig: { findUnique: async () => ({ payableAccountId: 'ap', openingBalanceEquityAccountId: 'equity' }) },
  }
}

test('cutover preview reports account and subledger differences without mutating source data', async () => {
  const plan = await previewTenantAccountingCutover(makeClient(), 't1')
  assert.equal(plan.snapshots.length, 3)
  assert.equal(plan.snapshots.find((row) => row.accountId === 'ar').difference, 25)
  assert.equal(plan.snapshots.find((row) => row.accountId === 'ar').targetBalance, 125)
  assert.equal(plan.snapshots.find((row) => row.accountId === 'cash-ledger').difference, 35)
  assert.equal(plan.snapshots.find((row) => row.accountId === 'ap').targetBalance, 20)
  assert.equal(plan.snapshots.find((row) => row.accountId === 'ap').difference, 10)
  assert.equal(plan.exceptions.some((row) => row.key === 'subledger:receivables'), true)
  assert.equal(plan.exceptions.some((row) => row.key === 'subledger:payables'), true)
  assert.equal(typeof plan.sourceFingerprint, 'string')
  assert.equal(plan.sourceFingerprint.length, 64)
})

test('control-account adjustments align receivables and payables in the correct debit/credit direction', () => {
  const equity = { id: 'equity', name: 'Opening Balance Equity', type: 'equity' }
  const ar = { id: 'ar', name: 'Accounts Receivable', type: 'asset' }
  const ap = { id: 'ap', name: 'Accounts Payable', type: 'liability' }
  const arIncrease = buildSubledgerAdjustmentLines(ar, equity, 125, 'Reconciliation')
  const apIncrease = buildSubledgerAdjustmentLines(ap, equity, 125, 'Reconciliation')
  const arDecrease = buildSubledgerAdjustmentLines(ar, equity, -125, 'Reconciliation')
  const apDecrease = buildSubledgerAdjustmentLines(ap, equity, -125, 'Reconciliation')

  assert.deepEqual(arIncrease.map(({ debit, credit }) => ({ debit, credit })), [{ debit: 125, credit: 0 }, { debit: 0, credit: 125 }])
  assert.deepEqual(apIncrease.map(({ debit, credit }) => ({ debit, credit })), [{ debit: 0, credit: 125 }, { debit: 125, credit: 0 }])
  assert.deepEqual(arDecrease.map(({ debit, credit }) => ({ debit, credit })), [{ debit: 0, credit: 125 }, { debit: 125, credit: 0 }])
  assert.deepEqual(apDecrease.map(({ debit, credit }) => ({ debit, credit })), [{ debit: 125, credit: 0 }, { debit: 0, credit: 125 }])
  for (const lines of [arIncrease, apIncrease, arDecrease, apDecrease]) {
    assert.equal(lines.reduce((sum, line) => sum + line.debit, 0), lines.reduce((sum, line) => sum + line.credit, 0))
  }
})
