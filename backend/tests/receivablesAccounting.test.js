import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cashSaleRecognitionLines,
  creditNoteRecognitionLines,
  customerRefundLines,
  posReturnRecognitionLines,
  receiptCollectionLines,
  saleRecognitionLines,
  validateReceivablesAccountingConfig,
} from '../src/services/receivablesAccountingService.js'

const config = {
  receivableAccountId: 'ar',
  salesRevenueAccountId: 'revenue',
  taxPayableAccountId: 'tax',
  salesReturnsAccountId: 'returns',
  costOfGoodsSoldAccountId: 'cogs',
  inventoryAccountId: 'inventory',
  customerAdvancesAccountId: 'advances',
}

function assertBalanced(lines) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0)
  const credit = lines.reduce((sum, line) => sum + line.credit, 0)
  assert.equal(Math.round(debit * 100), Math.round(credit * 100))
}

test('credit sale recognition debits receivables and recognizes net revenue, tax, and COGS', () => {
  const lines = saleRecognitionLines(config, { total: 115, tax: 15 }, [{ cost: 20, quantity: 2, product: { itemType: 'product' } }])
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'ar').debit, 115)
  assert.equal(lines.find((line) => line.accountId === 'revenue').credit, 100)
  assert.equal(lines.find((line) => line.accountId === 'tax').credit, 15)
  assert.equal(lines.find((line) => line.accountId === 'cogs').debit, 40)
  assert.equal(lines.find((line) => line.accountId === 'inventory').credit, 40)
})

test('cash sale recognition posts proceeds to the linked transaction account', () => {
  const lines = cashSaleRecognitionLines(config, { total: 115, tax: 15 }, [{ cost: 20, quantity: 2, product: { itemType: 'product' } }], 'till')
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'till').debit, 115)
})

test('service-only sales do not relieve inventory or recognize COGS', () => {
  const lines = saleRecognitionLines(config, { total: 50, tax: 0 }, [{ cost: 8, quantity: 1, product: { itemType: 'service' } }])
  assertBalanced(lines)
  assert.equal(lines.some((line) => line.accountId === 'inventory' || line.accountId === 'cogs'), false)
})

test('receipt splits applied receivable and unapplied customer advance without changing cash total', () => {
  const lines = receiptCollectionLines(config, { transactionAccountId: 'till', amount: 120, receivableApplied: 100 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'ar').credit, 100)
  assert.equal(lines.find((line) => line.accountId === 'advances').credit, 20)
})

test('credit note separates receivable credit from the paid refund liability', () => {
  const lines = creditNoteRecognitionLines(config, { amount: 50, taxAmount: 5, refundAmount: 10 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'returns').debit, 45)
  assert.equal(lines.find((line) => line.accountId === 'tax').debit, 5)
  assert.equal(lines.find((line) => line.accountId === 'ar').credit, 40)
  assert.equal(lines.find((line) => line.accountId === 'advances').credit, 10)
})

test('cash refund clears customer advances against the linked transaction account', () => {
  const lines = customerRefundLines(config, { transactionAccountId: 'till', amount: 10 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'advances').debit, 10)
  assert.equal(lines.find((line) => line.accountId === 'till').credit, 10)
})

test('POS return reverses net revenue, tax, cash, and returned inventory cost', () => {
  const lines = posReturnRecognitionLines(config, { transactionAccountId: 'till', amount: 55, taxAmount: 5, returnedCogs: 18 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'returns').debit, 50)
  assert.equal(lines.find((line) => line.accountId === 'tax').debit, 5)
  assert.equal(lines.find((line) => line.accountId === 'till').credit, 55)
  assert.equal(lines.find((line) => line.accountId === 'inventory').debit, 18)
  assert.equal(lines.find((line) => line.accountId === 'cogs').credit, 18)
})

test('mapping validation accepts distinct tenant-owned leaf accounts with matching normal types', async () => {
  const config = {
    ...Object.fromEntries(Object.keys({
      receivableAccountId: 1, salesRevenueAccountId: 1, taxPayableAccountId: 1,
      salesReturnsAccountId: 1, costOfGoodsSoldAccountId: 1, inventoryAccountId: 1,
      customerAdvancesAccountId: 1,
    }).map((field) => [field, field])),
    isEnabled: true,
  }
  const types = { receivableAccountId: 'asset', salesRevenueAccountId: 'revenue', taxPayableAccountId: 'liability', salesReturnsAccountId: 'revenue', costOfGoodsSoldAccountId: 'expense', inventoryAccountId: 'asset', customerAdvancesAccountId: 'liability' }
  const client = { account: { findMany: async () => Object.entries(types).map(([field, type]) => ({ id: field, type, name: field, description: null, _count: { children: 0 } })) } }
  const result = await validateReceivablesAccountingConfig(client, 'tenant', config, { requireEnabled: true })
  assert.equal(result.valid, true)
})

test('inventory accounting refuses sales with no saved line cost', () => {
  assert.throws(() => saleRecognitionLines(config, { total: 10, tax: 0 }, [{ cost: null, quantity: 1, product: { itemType: 'product' } }]), /sale-time product cost is missing/)
})
