import test from 'node:test'
import assert from 'node:assert/strict'
import {
  propertyDepositReceiptLines,
  propertyDepositRefundLines,
  propertyOpeningDepositLines,
  propertyOwnerPayoutLines,
  propertyRentChargeLines,
  propertyRentReceiptLines,
} from '../src/services/propertyAccountingService.js'

const config = {
  rentReceivableAccountId: 'rent-ar',
  rentIncomeAccountId: 'rent-income',
  ownerPayableAccountId: 'owner-payable',
  depositLiabilityAccountId: 'deposit-liability',
  depositOpeningEquityAccountId: 'opening-equity',
}

function balanced(lines) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0)
  const credit = lines.reduce((sum, line) => sum + line.credit, 0)
  assert.equal(debit, credit)
}

test('rent charges recognize landlord income for a direct landlord and funds payable for a manager', () => {
  const landlord = propertyRentChargeLines(config, { amount: 125000, managed: false, description: 'June rent' })
  const manager = propertyRentChargeLines(config, { amount: 125000, managed: true, description: 'June rent' })
  assert.deepEqual(landlord.map(line => [line.accountId, line.debit, line.credit]), [['rent-ar', 125000, 0], ['rent-income', 0, 125000]])
  assert.deepEqual(manager.map(line => [line.accountId, line.debit, line.credit]), [['rent-ar', 125000, 0], ['owner-payable', 0, 125000]])
  balanced(landlord); balanced(manager)
})

test('rent receipts and landlord payouts settle their respective control accounts', () => {
  const receipt = propertyRentReceiptLines(config, { amount: 50000, cashAccountLedgerId: 'cash', reference: 'R-1' })
  const payout = propertyOwnerPayoutLines(config, { amount: 50000, cashAccountLedgerId: 'cash', reference: 'P-1' })
  assert.deepEqual(receipt.map(line => [line.accountId, line.debit, line.credit]), [['cash', 50000, 0], ['rent-ar', 0, 50000]])
  assert.deepEqual(payout.map(line => [line.accountId, line.debit, line.credit]), [['owner-payable', 50000, 0], ['cash', 0, 50000]])
  balanced(receipt); balanced(payout)
})

test('tenant deposits remain liabilities on receipt, opening migration, and refund', () => {
  const receipt = propertyDepositReceiptLines(config, { amount: 30000, cashAccountLedgerId: 'cash', reference: 'D-1' })
  const opening = propertyOpeningDepositLines(config, { amount: 30000, reference: 'D-1' })
  const refund = propertyDepositRefundLines(config, { amount: 30000, cashAccountLedgerId: 'cash', reference: 'D-1' })
  assert.equal(receipt[1].accountId, 'deposit-liability')
  assert.equal(opening[1].accountId, 'deposit-liability')
  assert.equal(refund[0].accountId, 'deposit-liability')
  balanced(receipt); balanced(opening); balanced(refund)
})
