import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateRentPaymentToPeriods } from '../src/utils/rentPaymentAllocation.js'

const arrears = [
  { id: 'oct', period: '2026-10', amount: 100000, amountPaid: 0 },
  { id: 'nov', period: '2026-11', amount: 100000, amountPaid: 0 },
]

test('allocates only selected periods, leaving unselected arrears untouched', () => {
  const result = allocateRentPaymentToPeriods({ amount: 100000, charges: [arrears[0]] })
  assert.deepEqual(result.allocations, [{ chargeId: 'oct', period: '2026-10', amount: 100000 }])
  assert.equal(result.advanceAmount, 0)
})

test('partial receipt applies only to selected periods in chronological order', () => {
  const result = allocateRentPaymentToPeriods({ amount: 125000, charges: arrears })
  assert.deepEqual(result.allocations, [
    { chargeId: 'oct', period: '2026-10', amount: 100000 },
    { chargeId: 'nov', period: '2026-11', amount: 25000 },
  ])
  assert.equal(result.advanceAmount, 0)
})

test('amount above selected arrears is rejected unless advance months were specified', () => {
  const rejected = allocateRentPaymentToPeriods({ amount: 150000, charges: [arrears[0]] })
  assert.match(rejected.error, /exceeds selected rent periods/)

  const accepted = allocateRentPaymentToPeriods({ amount: 150000, charges: [arrears[0]], advanceCapacity: 100000 })
  assert.equal(accepted.appliedAmount, 100000)
  assert.equal(accepted.advanceAmount, 50000)
})
