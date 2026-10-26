import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRentAging } from '../src/utils/rentAging.js'

const asOf = new Date('2026-10-26T12:00:00.000Z')
const charge = (dueDate, amount, amountPaid = 0) => ({ dueDate: new Date(`${dueDate}T12:00:00.000Z`), amount, amountPaid })

test('rent arrears age into exact days-past-due buckets and retain not-yet-due rent separately', () => {
  const result = calculateRentAging([
    charge('2026-10-26', 500),
    charge('2026-10-25', 1000, 250),
    charge('2026-09-26', 2000),
    charge('2026-08-27', 3000),
    charge('2026-07-28', 4000),
    charge('2026-06-27', 5000),
  ], asOf)

  assert.deepEqual(result, {
    notDue: 500,
    days1To30: 2750,
    days31To60: 3000,
    days61To90: 4000,
    over90Days: 5000,
    overdueTotal: 14750,
  })
})

test('fully settled and future charges do not inflate overdue arrears', () => {
  const result = calculateRentAging([
    charge('2026-10-25', 1000, 1000),
    charge('2026-11-26', 2000),
    charge('2026-01-01', 500, 700),
  ], asOf)
  assert.deepEqual(result, { notDue: 2000, days1To30: 0, days31To60: 0, days61To90: 0, over90Days: 0, overdueTotal: 0 })
})
