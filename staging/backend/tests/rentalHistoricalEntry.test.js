import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateHistoricalPaymentBalances } from '../src/services/rentalHistoricalEntryService.js'

test('historical payment records reconcile rental balance and refundable deposit separately', () => {
  const result = allocateHistoricalPaymentBalances(500, 100, [
    { kind: 'rental_payment', amount: 125 },
    { kind: 'deposit', amount: 100 },
    { kind: 'rental_payment', amount: 175 },
    { kind: 'deposit_refund', amount: 40 },
  ])

  assert.equal(result.amountPaid, 300)
  assert.equal(result.balance, 200)
  assert.equal(result.depositPaid, 100)
  assert.equal(result.depositRefunded, 40)
  assert.equal(result.heldDeposit, 60)
  assert.deepEqual(result.payments.map(payment => payment.balanceAfter), [375, 100, 200, 60])
})

test('historical entries reject payments that exceed charges or deposits', () => {
  assert.throws(() => allocateHistoricalPaymentBalances(100, 0, [{ kind: 'rental_payment', amount: 100.01 }]), /cannot exceed the booking total/)
  assert.throws(() => allocateHistoricalPaymentBalances(100, 20, [{ kind: 'deposit', amount: 20.01 }]), /cannot exceed the agreed deposit/)
  assert.throws(() => allocateHistoricalPaymentBalances(100, 20, [{ kind: 'deposit_refund', amount: 1 }]), /cannot exceed deposits recorded as received/)
})

test('a historical booking with no payment evidence has no assumed receipt or collection', () => {
  const result = allocateHistoricalPaymentBalances(250, 40, [])
  assert.equal(result.amountPaid, 0)
  assert.equal(result.balance, 250)
  assert.equal(result.depositPaid, 0)
  assert.equal(result.heldDeposit, 0)
  assert.deepEqual(result.payments, [])
})
