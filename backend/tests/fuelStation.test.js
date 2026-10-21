import test from 'node:test'
import assert from 'node:assert/strict'
import { fuelDeliveryValuation, fuelMeterSaleValuation, fuelShiftReconciliation } from '../src/utils/fuelAccounting.js'
import { fuelShiftJournalLines } from '../src/services/fuelAccountingService.js'

test('fuel delivery uses weighted-average tank cost instead of replacing prior cost', () => {
  const result = fuelDeliveryValuation({ stockLitres: 1000, unitCost: 5000, deliveryLitres: 500, deliveryUnitCost: 5600 })
  assert.equal(result.stockAfter, 1500)
  assert.equal(result.stockValueAfter, 7800000)
  assert.equal(result.averageUnitCost, 5200)
})

test('fuel sale quantity and cost derive from meter difference at current average cost', () => {
  const result = fuelMeterSaleValuation({ stockLitres: 1000, unitCost: 5200, openingReading: 1200, closingReading: 1350 })
  assert.equal(result.litresSold, 150)
  assert.equal(result.stockAfter, 850)
  assert.equal(result.costOfSales, 780000)
  assert.equal(result.stockValueAfter, 4420000)
})

test('shift reconciliation compares counted tender with metered and ancillary sales', () => {
  const result = fuelShiftReconciliation({ fuelSales: 900000, cashSales: 500000, mobileSales: 300000, creditSales: 100000, expenses: 25000 })
  assert.equal(result.totalSales, 900000)
  assert.equal(result.actualTenderTotal, 800000)
  assert.equal(result.reportedSalesTotal, 900000)
  assert.equal(result.variance, 0)
  assert.equal(result.netAmount, 875000)
})

test('fuel meter valuation rejects stock sales that exceed available tank stock', () => {
  assert.throws(
    () => fuelMeterSaleValuation({ stockLitres: 100, unitCost: 5000, openingReading: 100, closingReading: 201 }),
    /cannot exceed available book stock/
  )
})

test('fuel shift journal balances channel allocation, ancillary revenue, expenses and variances', () => {
  const accounts = Object.fromEntries(['creditReceivable', 'salesClearing', 'lubricantRevenue', 'carWashRevenue', 'salesShortage', 'salesOverage', 'shiftExpense'].map(key => [key, { id: key }]))
  const scenarios = [
    { expectedFuelSales: 1000, cashSales: 600, mobileSales: 300, creditSales: 100, variance: 0 },
    { expectedFuelSales: 1000, cashSales: 900, variance: -100 },
    { expectedFuelSales: 1000, cashSales: 1100, variance: 100 },
    { expectedFuelSales: 1000, cashSales: 1100, lubricantSales: 100, variance: 0, expenses: 50 },
  ]
  for (const scenario of scenarios) {
    const lines = fuelShiftJournalLines(accounts, { cashAccountId: 'cash', mobileAccountId: 'mobile', expenseAccountId: 'expense-payment', creditSales: 0, mobileSales: 0, cashSales: 0, lubricantSales: 0, carWashIncome: 0, expenses: 0, expectedFuelSales: 0, variance: 0, ...scenario })
    const debit = lines.reduce((sum, line) => sum + line.debit, 0)
    const credit = lines.reduce((sum, line) => sum + line.credit, 0)
    assert.equal(Math.round((debit - credit) * 100) / 100, 0)
  }
})

test('customer fuel credit invoices stay in receivables and are excluded from shift clearing a second time', () => {
  const reconciliation = fuelShiftReconciliation({ fuelSales: 900, cashSales: 500, mobileSales: 100, creditSales: 300 })
  assert.equal(reconciliation.variance, 0)
  const accounts = Object.fromEntries(['creditReceivable', 'salesClearing', 'lubricantRevenue', 'carWashRevenue', 'salesShortage', 'salesOverage', 'shiftExpense'].map(key => [key, { id: key }]))
  const lines = fuelShiftJournalLines(accounts, {
    cashAccountId: 'cash', mobileAccountId: 'mobile', expenseAccountId: 'expense-payment',
    expectedFuelSales: 700, cashSales: 500, mobileSales: 100, creditSales: 100,
    lubricantSales: 0, carWashIncome: 0, expenses: 0, variance: 0,
  })
  assert.equal(lines.find(line => line.accountId === 'creditReceivable')?.debit, 100)
  assert.equal(lines.find(line => line.accountId === 'salesClearing')?.credit, 700)
  assert.equal(lines.reduce((sum, line) => sum + line.debit, 0), lines.reduce((sum, line) => sum + line.credit, 0))
})
