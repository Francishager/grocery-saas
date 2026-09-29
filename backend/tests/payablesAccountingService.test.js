import test from 'node:test'
import assert from 'node:assert/strict'
import {
  supplierDebitNoteLines,
  supplierOpeningBalanceLines,
  supplierPaymentLines,
  supplierPurchaseLines,
} from '../src/services/payablesAccountingService.js'

test('supplier opening balance is credited to AP with equity offset', () => {
  assert.deepEqual(supplierOpeningBalanceLines({ payableAccountId: 'ap', openingBalanceEquityAccountId: 'equity' }, 2300000), [
    { accountId: 'equity', debit: 2300000, credit: 0, description: 'Supplier opening balance migration' },
    { accountId: 'ap', debit: 0, credit: 2300000, description: 'Opening supplier payable' },
  ])
})

test('supplier purchase recognizes inventory, service expense, cash paid, and outstanding AP', () => {
  const lines = supplierPurchaseLines({ inventoryAccountId: 'inventory', purchaseExpenseAccountId: 'expense', payableAccountId: 'ap' }, {
    amountPaid: 30, balance: 70,
  }, [
    { total: 80, product: { itemType: 'product' } },
    { total: 20, product: { itemType: 'service' } },
  ], 'bank-ledger')
  assert.equal(lines.reduce((sum, line) => sum + line.debit, 0), 100)
  assert.equal(lines.reduce((sum, line) => sum + line.credit, 0), 100)
  assert.deepEqual(lines.map((line) => [line.accountId, line.debit, line.credit]), [
    ['inventory', 80, 0], ['expense', 20, 0], ['bank-ledger', 0, 30], ['ap', 0, 70],
  ])
})

test('supplier payment debits AP and credits the selected transaction account', () => {
  const lines = supplierPaymentLines({ payableAccountId: 'ap' }, 500000, 'cash-ledger', 'PAY-1')
  assert.equal(lines.reduce((sum, line) => sum + line.debit, 0), lines.reduce((sum, line) => sum + line.credit, 0))
  assert.deepEqual(lines.map((line) => [line.accountId, line.debit, line.credit]), [['ap', 500000, 0], ['cash-ledger', 0, 500000]])
})

test('supplier debit note credits returned stock cost and books the allowance difference', () => {
  const lines = supplierDebitNoteLines({ payableAccountId: 'ap', inventoryAccountId: 'inventory', purchaseReturnsAccountId: 'returns' }, 120, 100, 'DN-1')
  assert.equal(lines.reduce((sum, line) => sum + line.debit, 0), 120)
  assert.equal(lines.reduce((sum, line) => sum + line.credit, 0), 120)
  assert.deepEqual(lines.map((line) => [line.accountId, line.debit, line.credit]), [['ap', 120, 0], ['inventory', 0, 100], ['returns', 0, 20]])
})
