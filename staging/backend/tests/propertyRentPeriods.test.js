import test from 'node:test'
import assert from 'node:assert/strict'
import { propertyRentPeriods } from '../src/utils/propertyRentPeriods.js'

const charge = period => ({ charge: { period } })

test('uses saved charge allocations as the receipt rent periods', () => {
  assert.deepEqual(propertyRentPeriods({
    paymentType: 'rent_plan',
    allocations: [charge('2026-09'), charge('2026-10')],
  }), ['2026-09', '2026-10'])
})

test('includes selected months from the recording month when that month was charged', () => {
  assert.deepEqual(propertyRentPeriods({
    paymentType: 'rent',
    createdAt: '2026-10-14T10:00:00.000Z',
    rentMonths: 3,
    advanceAmount: 200,
    monthlyRent: 100,
    allocations: [charge('2026-10')],
  }), ['2026-10', '2026-11', '2026-12'])
})

test('starts future rent after the recording month when it was already settled', () => {
  assert.deepEqual(propertyRentPeriods({
    paymentType: 'rent',
    createdAt: '2026-10-14T10:00:00.000Z',
    rentMonths: 2,
    advanceAmount: 100,
    monthlyRent: 100,
    allocations: [],
  }), ['2026-11'])
})

test('does not invent future periods for a payment that only settled arrears', () => {
  assert.deepEqual(propertyRentPeriods({
    paymentType: 'rent',
    createdAt: '2026-10-14T10:00:00.000Z',
    rentMonths: 1,
    advanceAmount: 0,
    allocations: [charge('2026-08')],
  }), ['2026-08'])
})

test('reconstructs named periods for legacy receipts without saved charge allocations', () => {
  assert.deepEqual(propertyRentPeriods({
    paymentType: 'rent',
    createdAt: '2026-10-14T10:00:00.000Z',
    rentMonths: 2,
    allocations: [],
  }), ['2026-10', '2026-11'])
})
