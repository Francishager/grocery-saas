import test from 'node:test'
import assert from 'node:assert/strict'
import { canUseCashTransactions, hasAccountingPermission } from '../middleware/auth.js'

test('owners can transact when they have a cash account assigned', () => {
  assert.equal(canUseCashTransactions({ role: 'owner' }, true), true)
})

test('owners without a cash account cannot transact', () => {
  assert.equal(canUseCashTransactions({ role: 'owner' }, false), false)
})

test('staff users with a cash account can transact', () => {
  assert.equal(canUseCashTransactions({ role: 'attendant' }, true), true)
})

test('users with accounting permissions can post journal entries without payment method gate restrictions', () => {
  assert.equal(hasAccountingPermission({ user: { permissions: ['canCreateAccounting'] } }), true)
  assert.equal(hasAccountingPermission({ user: { permissions: ['canUseBank'] } }), false)
})
