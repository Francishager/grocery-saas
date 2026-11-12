import test from 'node:test'
import assert from 'node:assert/strict'

import {
  linkedCashAccountId,
  isLinkedCashAccountMismatch,
  reconcileCashAccountBalance,
} from '../src/utils/accountingSync.js'

test('linkedCashAccountId extracts the linked cash account id from a transaction account description', () => {
  assert.equal(
    linkedCashAccountId({ description: 'Linked transaction account cashAccount:cash_123' }),
    'cash_123'
  )
})

test('reconcileCashAccountBalance detects stale transaction account balances', () => {
  const result = reconcileCashAccountBalance(
    { id: 'cash_123', balance: 250 },
    { id: 'acct_1', balance: 100, description: 'Linked transaction account cashAccount:cash_123' }
  )

  assert.equal(result.needsSync, true)
  assert.equal(result.targetBalance, 250)
  assert.equal(result.syncedBalance, 250)
})

test('isLinkedCashAccountMismatch returns false when balances already match', () => {
  assert.equal(
    isLinkedCashAccountMismatch(
      { id: 'cash_123', balance: 100 },
      { id: 'acct_1', balance: 100, description: 'Linked transaction account cashAccount:cash_123' }
    ),
    false
  )
})
