import test from 'node:test'
import assert from 'node:assert/strict'
import { correctedRentChargeValues, recordTenancyRentRate, rentAmountForPeriod } from '../src/services/propertyRentRateService.js'

function mockTx({ histories = [], charges = [], startDate = new Date('2026-02-01T12:00:00.000Z') } = {}) {
  return {
    historyRows: histories,
    propertyRentRateHistory: {
      findFirst: async ({ where }) => histories
        .filter(row => row.tenancyId === where.tenancyId && (!where.effectivePeriod || row.effectivePeriod <= where.effectivePeriod.lte))
        .sort((a, b) => b.effectivePeriod.localeCompare(a.effectivePeriod) || b.sequence - a.sequence)[0] || null,
      create: async ({ data }) => {
        const row = { id: `history-${histories.length + 1}`, sequence: histories.length + 1, createdAt: new Date().toISOString(), ...data }
        histories.push(row)
        return row
      },
    },
  }
}

const tenancy = { id: 'tenancy-1', tenantId: 'tenant-1', unitId: 'unit-1', startDate: new Date('2026-02-01T12:00:00.000Z'), rentAmount: 100000 }

test('rate history preserves the old amount and applies the new rate only from its effective month', async () => {
  const tx = mockTx()
  await recordTenancyRentRate(tx, { tenancy, newAmount: tenancy.rentAmount, changedById: 'user-1', effectivePeriod: '2026-02', changeSource: 'tenancy_start' })
  await recordTenancyRentRate(tx, { tenancy, newAmount: 125000, changedById: 'user-1', effectivePeriod: '2026-11', changeSource: 'unit_edit' })
  const afterFirstChange = { ...tenancy, rentAmount: 125000 }
  await recordTenancyRentRate(tx, { tenancy: afterFirstChange, newAmount: 130000, changedById: 'user-1', effectivePeriod: '2026-11', changeSource: 'unit_edit' })

  assert.equal(tx.historyRows[0].changeSource, 'legacy_baseline')
  assert.equal(tx.historyRows[1].previousAmount, 100000)
  assert.equal(tx.historyRows[2].previousAmount, 125000)
  assert.equal(tx.historyRows[2].newAmount, 130000)
  assert.equal(await rentAmountForPeriod(tx, tenancy, '2026-10'), 100000)
  assert.equal(await rentAmountForPeriod(tx, tenancy, '2026-11'), 130000)
})

test('existing tenancies without history fall back to their stored rate', async () => {
  const tx = mockTx()
  assert.equal(await rentAmountForPeriod(tx, { ...tenancy, rentAmount: 110000 }, '2026-04'), 110000)
})

test('correcting a rent period uses the unit rate effective in the selected month', async () => {
  const tx = mockTx()
  await recordTenancyRentRate(tx, { tenancy, newAmount: 100000, changedById: 'user-1', effectivePeriod: '2026-02', changeSource: 'tenancy_start' })
  await recordTenancyRentRate(tx, { tenancy: { ...tenancy, rentAmount: 100000 }, newAmount: 125000, changedById: 'user-1', effectivePeriod: '2026-11', changeSource: 'unit_edit' })

  const correctedOctober = correctedRentChargeValues({ amountPaid: 0, dueDate: new Date('2026-10-01T00:00:00Z') }, await rentAmountForPeriod(tx, tenancy, '2026-10'), new Date('2026-10-29T00:00:00Z'))
  const correctedNovember = correctedRentChargeValues({ amountPaid: 0, dueDate: new Date('2026-11-01T00:00:00Z') }, await rentAmountForPeriod(tx, tenancy, '2026-11'), new Date('2026-10-29T00:00:00Z'))
  assert.deepEqual(correctedOctober, { amount: 100000, status: 'overdue' })
  assert.deepEqual(correctedNovember, { amount: 125000, status: 'unpaid' })
})

test('rent period correction preserves payment state and refuses to erase overpayment', () => {
  assert.deepEqual(correctedRentChargeValues({ amountPaid: 50000, dueDate: new Date('2026-10-01T00:00:00Z') }, 100000, new Date('2026-10-29T00:00:00Z')), { amount: 100000, status: 'partial' })
  assert.deepEqual(correctedRentChargeValues({ amountPaid: 100000, dueDate: new Date('2026-10-01T00:00:00Z') }, 100000, new Date('2026-10-29T00:00:00Z')), { amount: 100000, status: 'paid' })
  assert.throws(() => correctedRentChargeValues({ amountPaid: 120000, dueDate: new Date('2026-10-01T00:00:00Z') }, 100000), /Payments already recorded exceed/)
})
