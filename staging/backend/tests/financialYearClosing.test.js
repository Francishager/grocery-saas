import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialYearCloseSnapshot } from '../src/services/financialYearClosingService.js'
import { ALL_PERMISSION_KEYS, PERMISSION_METADATA, permissionAllowedForTenant } from '../src/utils/permissions.js'

function mockPrisma() {
  const start = new Date('2010-01-01T00:00:00.000Z')
  const revenue = { id: 'revenue', code: '4000', name: 'Sales', type: 'revenue', balance: 100, createdAt: start, description: null, branchId: null }
  const cash = { id: 'cash', code: '1000', name: 'Cash', type: 'asset', balance: 100, createdAt: start, description: null, branchId: null }
  const lines = [
    { accountId: 'cash', debit: 100, credit: 0, entry: { id: 'entry-1', entryNo: 'J-1', date: new Date('2025-06-01T10:00:00.000Z'), reference: null, description: 'Cash sale', status: 'posted' } },
    { accountId: 'revenue', debit: 0, credit: 100, entry: { id: 'entry-1', entryNo: 'J-1', date: new Date('2025-06-01T10:00:00.000Z'), reference: null, description: 'Cash sale', status: 'posted' } },
  ]
  const groupedLines = args => {
    const range = args.where.entry.date
    const filtered = lines.filter(line => (!range.lte || line.entry.date <= range.lte) && (!range.gt || line.entry.date > range.gt) && (!range.gte || line.entry.date >= range.gte))
    const groups = new Map()
    for (const line of filtered) {
      const group = groups.get(line.accountId) || { accountId: line.accountId, _sum: { debit: 0, credit: 0 } }
      group._sum.debit += line.debit
      group._sum.credit += line.credit
      groups.set(line.accountId, group)
    }
    return [...groups.values()]
  }
  return {
    tenant: { findUnique: async () => ({ name: 'Example Business', currency: 'UGX' }) },
    account: { findMany: async () => [cash, revenue] },
    journalLine: { groupBy: async args => groupedLines(args) },
    cashAccount: { findMany: async () => [] },
    journalEntry: {
      findMany: async () => [{ id: 'entry-1', entryNo: 'J-1', date: lines[0].entry.date, lines: [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }] }],
      count: async () => 0,
    },
    tenantAccountingCutover: { findUnique: async () => ({ exceptionCount: 0, status: 'active' }) },
    cashTransaction: { groupBy: async () => [] },
  }
}

test('financial-year close builds balanced financial statements for a Date-valued stored period', async () => {
  const result = await buildFinancialYearCloseSnapshot(mockPrisma(), 'tenant-1', new Date('2025-01-01T00:00:00.000Z'), new Date('2025-12-31T00:00:00.000Z'))
  assert.equal(result.period.startDate, '2025-01-01')
  assert.equal(result.period.endDate, '2025-12-31')
  assert.equal(result.summary.trialVariance, 0)
  assert.equal(result.incomeStatement.netResult, 100)
  assert.ok(result.checks.every(check => check.passed))
  assert.match(result.snapshotHash, /^[a-f0-9]{64}$/)
})

test('financial-year close rejects invalid or inverted periods', async () => {
  await assert.rejects(() => buildFinancialYearCloseSnapshot(mockPrisma(), 'tenant-1', '2025-12-31', '2025-01-01'), /valid financial-year/)
})

test('financial-year close permissions are surfaced and scoped to the accounting feature', () => {
  for (const key of ['canManageFinancialYearClose', 'canSignOffFinancialYearClose', 'canReopenFinancialYearClose']) {
    assert.ok(ALL_PERMISSION_KEYS.includes(key))
    assert.ok(PERMISSION_METADATA[key]?.name)
    assert.equal(permissionAllowedForTenant(key, ['accounting']), true)
    assert.equal(permissionAllowedForTenant(key, []), false)
  }
})
