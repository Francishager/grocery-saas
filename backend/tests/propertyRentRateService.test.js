import test from 'node:test'
import assert from 'node:assert/strict'
import { nextUnchargedRentPeriod, recordTenancyRentRate, rentAmountForPeriod } from '../src/services/propertyRentRateService.js'

function mockTx({ histories = [], charges = [], startDate = new Date('2026-02-01T12:00:00.000Z') } = {}) {
  return {
    historyRows: histories,
    propertyTenancy: {
      findUnique: async () => ({ startDate }),
    },
    rentCharge: {
      findFirst: async ({ where }) => charges.filter(row => row.period >= where.period.gte).sort((a, b) => b.period.localeCompare(a.period))[0] || null,
    },
    propertyRentRateHistory: {
      findFirst: async ({ where }) => histories
        .filter(row => row.tenancyId === where.tenancyId && (!where.effectivePeriod || row.effectivePeriod <= where.effectivePeriod.lte))
        .sort((a, b) => b.effectivePeriod.localeCompare(a.effectivePeriod) || b.createdAt.localeCompare(a.createdAt))[0] || null,
      create: async ({ data }) => {
        const row = { id: `history-${histories.length + 1}`, createdAt: new Date().toISOString(), ...data }
        histories.push(row)
        return row
      },
    },
  }
}

const tenancy = { id: 'tenancy-1', tenantId: 'tenant-1', unitId: 'unit-1', startDate: new Date('2026-02-01T12:00:00.000Z'), rentAmount: 100000 }

test('rent changes become effective after already-issued current and future charges', async () => {
  const tx = mockTx({ charges: [{ period: '2026-10' }, { period: '2026-11' }] })
  assert.equal(await nextUnchargedRentPeriod(tx, tenancy.id, new Date('2026-10-10T12:00:00.000Z')), '2026-12')
})

test('rate history preserves the old amount and applies the new rate only from its effective month', async () => {
  const tx = mockTx()
  await recordTenancyRentRate(tx, { tenancy, newAmount: tenancy.rentAmount, changedById: 'user-1', effectivePeriod: '2026-02', changeSource: 'tenancy_start' })
  await recordTenancyRentRate(tx, { tenancy, newAmount: 125000, changedById: 'user-1', effectivePeriod: '2026-11', changeSource: 'unit_edit' })

  assert.equal(tx.historyRows[0].changeSource, 'legacy_baseline')
  assert.equal(tx.historyRows[1].previousAmount, 100000)
  assert.equal(tx.historyRows[1].newAmount, 125000)
  assert.equal(await rentAmountForPeriod(tx, tenancy, '2026-10'), 100000)
  assert.equal(await rentAmountForPeriod(tx, tenancy, '2026-11'), 125000)
})

test('existing tenancies without history fall back to their stored rate', async () => {
  const tx = mockTx()
  assert.equal(await rentAmountForPeriod(tx, { ...tenancy, rentAmount: 110000 }, '2026-04'), 110000)
})
