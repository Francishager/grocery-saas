import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rentalInvoiceLines,
  rentalReceiptLines,
  rentalDepositReceiptLines,
  rentalDepositRefundLines,
  rentalDepositForfeitLines,
  rentalRevenueRecognitionLines,
  rentalDamageChargeLines,
} from '../src/services/rentalAccountingService.js'

const config = {
  receivableAccountId: 'rental-ar',
  revenueAccountId: 'rental-income',
  deferredRevenueAccountId: 'unearned-rent',
  depositLiabilityAccountId: 'deposit-liability',
  taxPayableAccountId: 'tax-payable',
}

function assertBalanced(lines) {
  const debits = lines.reduce((sum, line) => sum + line.debit, 0)
  const credits = lines.reduce((sum, line) => sum + line.credit, 0)
  assert.equal(debits, credits)
}

test('rental invoice separates receivable, unearned rent, and output tax', () => {
  const lines = rentalInvoiceLines(config, { total: 120, tax: 20, reference: 'HIRE-1' })
  assert.deepEqual(lines.map(({ accountId, debit, credit }) => [accountId, debit, credit]), [
    ['rental-ar', 120, 0], ['unearned-rent', 0, 100], ['tax-payable', 0, 20],
  ])
  assertBalanced(lines)
})

test('rent receipts settle receivables while reservation advances stay unearned', () => {
  const collection = rentalReceiptLines(config, { amount: 45, cashAccountId: 'cash-ledger', reference: 'R-1' })
  const advance = rentalReceiptLines(config, { amount: 45, cashAccountId: 'cash-ledger', reference: 'R-2', advance: true })
  assert.equal(collection[1].accountId, config.receivableAccountId)
  assert.equal(advance[1].accountId, config.deferredRevenueAccountId)
  assertBalanced(collection)
  assertBalanced(advance)
})

test('security deposits remain liabilities until refund or forfeiture', () => {
  const receipt = rentalDepositReceiptLines(config, { amount: 100, cashAccountId: 'cash-ledger', reference: 'D-1' })
  const refund = rentalDepositRefundLines(config, { amount: 60, cashAccountId: 'cash-ledger', reference: 'D-2' })
  const forfeiture = rentalDepositForfeitLines(config, { amount: 40, reference: 'D-3' })
  assert.equal(receipt[1].accountId, config.depositLiabilityAccountId)
  assert.equal(refund[0].accountId, config.depositLiabilityAccountId)
  assert.equal(forfeiture[1].accountId, config.revenueAccountId)
  assertBalanced(receipt)
  assertBalanced(refund)
  assertBalanced(forfeiture)
})

test('earned rent and assessed damage charges post as balanced entries', () => {
  const earned = rentalRevenueRecognitionLines(config, { amount: 100, reference: 'HIRE-1' })
  const damage = rentalDamageChargeLines(config, { amount: 15, reference: 'HIRE-1' })
  assert.equal(earned[0].accountId, config.deferredRevenueAccountId)
  assert.equal(earned[1].accountId, config.revenueAccountId)
  assert.equal(damage[0].accountId, config.receivableAccountId)
  assertBalanced(earned)
  assertBalanced(damage)
})
