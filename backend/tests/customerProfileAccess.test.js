import test from 'node:test'
import assert from 'node:assert/strict'
import { customerProfileAccess, customerProfilePayload, filterCustomerHistoryRows, maskCustomerEmail, maskCustomerPhone } from '../src/utils/customerProfileAccess.js'

test('customer profile strips contact and financial fields unless explicitly permitted', () => {
  const access = customerProfileAccess(['canViewCustomer'])
  const customer = customerProfilePayload({
    id: 'customer-1', name: 'A Customer', phone: '+256700123456', email: 'a@example.com', address: 'Kampala',
    balance: 120000, creditLimit: 200000, openingBalance: 50000, trustScore: 82, status: 'active',
  }, access)

  assert.deepEqual(customer, {
    id: 'customer-1', name: 'A Customer', maskedPhone: '+2567xxxxxxxx',
    maskedEmail: 'x******@*****', maskedAddress: '******', status: 'active',
  })
})

test('customer profile exposes only specifically granted contact and balance fields', () => {
  const access = customerProfileAccess(['canViewCustomerPhone', 'canViewCustomerBalance'])
  const customer = customerProfilePayload({
    id: 'customer-1', name: 'A Customer', phone: '+256700123456', email: 'a@example.com', address: 'Kampala',
    balance: 120000.129, creditLimit: 200000, openingBalance: 50000, trustScore: 82, status: 'active',
  }, access)

  assert.equal(customer.phone, '+256700123456')
  assert.equal(customer.balance, 120000.13)
  assert.equal(customer.trustScore, 82)
  assert.equal('email' in customer, false)
  assert.equal('address' in customer, false)
  assert.equal(customer.maskedEmail, 'x******@*****')
})

test('rental balance is omitted unless the feature-aware caller provides it', () => {
  const access = customerProfileAccess(['canViewCustomerBalance'])
  const ordinaryCustomer = customerProfilePayload({ id: 'customer-1', name: 'A Customer', status: 'active' }, access)
  const renter = customerProfilePayload({ id: 'customer-2', name: 'A Tenant', status: 'active', rentalBalance: 90000 }, access)

  assert.equal('rentalBalance' in ordinaryCustomer, false)
  assert.equal(renter.rentalBalance, 90000)
})

test('masked contact formats retain only the requested phone prefix and no email address characters', () => {
  assert.equal(maskCustomerPhone('0754938901'), '07xxxxxxxx')
  assert.equal(maskCustomerPhone('+256 770 123 456'), '+256 7xx xxx xxx')
  assert.equal(maskCustomerEmail('person@example.com'), 'x******@*****')
})

test('customer operational permissions are independent of profile viewing', () => {
  const access = customerProfileAccess(['canRecordCustomerPayment', 'canPrintCustomerReceipts', 'canCreateWithdrawal'])
  assert.equal(access.recordPayment, true)
  assert.equal(access.printReceipts, true)
  assert.equal(access.withdraw, true)
  assert.equal(access.balance, false)
  assert.equal(access.sales, false)
})

test('customer history permission groups do not expose other transaction categories', () => {
  const rows = [
    { source: 'receivable_sale' },
    { source: 'customer_payment' },
    { source: 'sale_return' },
    { source: 'credit_note' },
    { source: 'customer_withdrawal' },
    { source: 'customer_activity' },
    { source: 'opening_balance' },
  ]
  const access = customerProfileAccess(['canViewCustomerPaymentsHistory', 'canViewCustomerReturnsHistory'])
  assert.deepEqual(filterCustomerHistoryRows(rows, access).map((row) => row.source), ['customer_payment', 'sale_return'])
})

test('credit history requires balance visibility and a permitted credit activity domain', () => {
  assert.equal(customerProfileAccess(['canViewCustomerSalesHistory']).creditHistory, false)
  assert.equal(customerProfileAccess(['canViewCustomerBalance']).creditHistory, false)
  assert.equal(customerProfileAccess(['canViewCustomerBalance', 'canViewCustomerPaymentsHistory']).creditHistory, true)
})
