import test from 'node:test'
import assert from 'node:assert/strict'
import { customerProfileAccess, customerProfilePayload, filterCustomerHistoryRows } from '../src/utils/customerProfileAccess.js'

test('customer profile strips contact and financial fields unless explicitly permitted', () => {
  const access = customerProfileAccess(['canViewCustomer'])
  const customer = customerProfilePayload({
    id: 'customer-1', name: 'A Customer', phone: '+256700123456', email: 'a@example.com', address: 'Kampala',
    balance: 120000, creditLimit: 200000, openingBalance: 50000, trustScore: 82, status: 'active',
  }, access)

  assert.deepEqual(customer, { id: 'customer-1', name: 'A Customer', status: 'active' })
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
