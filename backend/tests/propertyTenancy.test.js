import test from 'node:test'
import assert from 'node:assert/strict'
import { countUnpaidRentMonths, proratedStartingMonthRent, tenancyOccupiesRentPeriod } from '../src/utils/propertyTenancy.js'

const tenancy = overrides => ({ startDate: new Date('2026-01-01T12:00:00.000Z'), endDate: null, status: 'active', ...overrides })

test('rent payments or legacy paid-through dates do not end active occupancy', () => {
  const active = tenancy({ endDate: new Date('2026-03-31T12:00:00.000Z') })
  assert.equal(tenancyOccupiesRentPeriod(active, '2026-03'), true)
  assert.equal(tenancyOccupiesRentPeriod(active, '2026-04'), true)
  assert.equal(tenancyOccupiesRentPeriod(active, '2026-10'), true)
})

test('an explicitly ended tenancy stops rent charges after its move-out month', () => {
  const ended = tenancy({ status: 'ended', endDate: new Date('2026-03-31T12:00:00.000Z') })
  assert.equal(tenancyOccupiesRentPeriod(ended, '2026-03'), true)
  assert.equal(tenancyOccupiesRentPeriod(ended, '2026-04'), false)
  assert.equal(tenancyOccupiesRentPeriod(tenancy({ status: 'ended' }), '2026-03'), false)
})

test('rent charges do not precede the tenancy start month', () => {
  const future = tenancy({ startDate: new Date('2026-04-01T12:00:00.000Z') })
  assert.equal(tenancyOccupiesRentPeriod(future, '2026-03'), false)
  assert.equal(tenancyOccupiesRentPeriod(future, '2026-04'), true)
})

test('a mid-month tenancy includes its start month and charges remaining days inclusively', () => {
  const midMonth = tenancy({ startDate: new Date('2026-10-16T12:00:00.000Z') })
  assert.equal(tenancyOccupiesRentPeriod(midMonth, '2026-09'), false)
  assert.equal(tenancyOccupiesRentPeriod(midMonth, '2026-10'), true)
  assert.equal(proratedStartingMonthRent(310000, midMonth.startDate, '2026-10'), 160000)
  assert.equal(proratedStartingMonthRent(310000, midMonth.startDate, '2026-11'), 310000)
})

test('the unpaid rent month count includes the current month but not months before tenancy start', () => {
  const charges = [
    { period: '2026-09', amount: 100, amountPaid: 0 },
    { period: '2026-10', amount: 100, amountPaid: 0 },
    { period: '2026-11', amount: 100, amountPaid: 0 },
    { period: '2026-10', amount: 100, amountPaid: 100 },
  ]
  assert.equal(countUnpaidRentMonths(charges, '2026-10', '2026-10'), 1)
  assert.equal(countUnpaidRentMonths(charges, '2026-09', '2026-10'), 2)
})
