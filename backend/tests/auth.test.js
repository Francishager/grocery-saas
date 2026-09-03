import test from 'node:test'
import assert from 'node:assert/strict'
import { canUseCashTransactions, canUsePaymentMethodOrAssignedCash, hasAccountingPermission } from '../middleware/auth.js'

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
  assert.equal(hasAccountingPermission({ user: { permissions: ['canUseAnyTransactionAccount'] } }), true)
  assert.equal(hasAccountingPermission({ user: { permissions: ['canUseBank'] } }), false)
})

test('cash permission only allows the assigned cash account', () => {
  const req = { user: { role: 'attendant', permissions: ['canUseCash'] }, userCashAccountId: 'own-cash' }

  assert.equal(canUsePaymentMethodOrAssignedCash(req, 'cash', 'own-cash'), true)
  assert.equal(canUsePaymentMethodOrAssignedCash(req, 'cash', 'another-cash'), false)
})

test('other cash permission allows another cash account without broad account access', () => {
  const req = {
    user: { role: 'attendant', permissions: ['canUseCash', 'canUseOtherCashAccount'] },
    userCashAccountId: 'own-cash',
  }

  assert.equal(canUsePaymentMethodOrAssignedCash(req, 'cash', 'another-cash'), true)
})
