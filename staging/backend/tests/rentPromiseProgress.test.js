import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRentPromiseProgress } from '../src/utils/rentPromiseProgress.js'

const date = value => new Date(value)

test('rent promise progress attributes posted payments once in promise order', () => {
  const promises = [
    { id: 'p1', amount: 100, dueDate: date('2026-10-01'), createdAt: date('2026-09-01'), allocations: [{ id: 'a1', chargeId: 'c1', amount: 100, charge: { id: 'c1', allocations: [{ id: 'pay1', amount: 60, payment: { status: 'posted', createdAt: date('2026-09-10') } }] } }] },
    { id: 'p2', amount: 40, dueDate: date('2026-10-20'), createdAt: date('2026-09-15'), allocations: [{ id: 'a2', chargeId: 'c1', amount: 40, charge: { id: 'c1', allocations: [{ id: 'pay1', amount: 60, payment: { status: 'posted', createdAt: date('2026-09-10') } }, { id: 'pay2', amount: 80, payment: { status: 'posted', createdAt: date('2026-09-20') } }] } }] },
  ]
  const result = calculateRentPromiseProgress(promises, date('2026-10-21'))
  assert.equal(result.promises[0].fulfilledAmount, 100)
  assert.equal(result.promises[0].status, 'kept')
  assert.equal(result.promises[1].fulfilledAmount, 40)
  assert.equal(result.promises[1].status, 'kept')
  assert.equal(result.counts.kept, 2)
})

test('payments recorded before a promise do not satisfy it and missed status is calculated', () => {
  const result = calculateRentPromiseProgress([{
    id: 'p1', amount: 50, dueDate: date('2026-10-01'), createdAt: date('2026-09-15'),
    allocations: [{ id: 'a1', chargeId: 'c1', amount: 50, charge: { id: 'c1', allocations: [
      { id: 'old', amount: 50, payment: { status: 'posted', createdAt: date('2026-09-01') } },
      { id: 'void', amount: 50, payment: { status: 'voided', createdAt: date('2026-09-20') } },
    ] } }],
  }], date('2026-10-02'))
  assert.equal(result.promises[0].fulfilledAmount, 0)
  assert.equal(result.promises[0].status, 'missed')
})

test('a renewed promise can cover remaining arrears while the expired promise stays missed', () => {
  const result = calculateRentPromiseProgress([
    { id: 'old', amount: 100, dueDate: date('2026-09-10T23:59:59.999Z'), createdAt: date('2026-09-01'), allocations: [{ id: 'old-line', chargeId: 'c1', amount: 100, charge: { id: 'c1', allocations: [{ id: 'late', amount: 100, payment: { status: 'posted', createdAt: date('2026-09-20') } }, { id: 'on-time', amount: 40, payment: { status: 'posted', createdAt: date('2026-09-05') } }] } }] },
    { id: 'renewed', amount: 60, dueDate: date('2026-10-05T23:59:59.999Z'), createdAt: date('2026-09-15'), allocations: [{ id: 'new-line', chargeId: 'c1', amount: 60, charge: { id: 'c1', allocations: [{ id: 'late', amount: 100, payment: { status: 'posted', createdAt: date('2026-09-20') } }, { id: 'on-time', amount: 40, payment: { status: 'posted', createdAt: date('2026-09-05') } }] } }] },
  ], date('2026-09-21'))
  const old = result.promises.find(row => row.id === 'old')
  const renewed = result.promises.find(row => row.id === 'renewed')
  assert.equal(old.fulfilledAmount, 40)
  assert.equal(old.status, 'partially_kept')
  assert.equal(renewed.fulfilledAmount, 60)
  assert.equal(renewed.status, 'kept')
  assert.equal(result.counts.remainingAmount, 0)
})
