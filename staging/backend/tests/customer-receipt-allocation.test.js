import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateCustomerReceipt, allocateCustomerReceiptToRentals } from '../src/utils/customerReceiptAllocation.js'

test('allocates receipts to open sales oldest-first and leaves only the excess unallocated', () => {
  const result = allocateCustomerReceipt(160, [
    { id: 'oldest', openAmount: 100 },
    { id: 'next', openAmount: 40 },
    { id: 'paid', openAmount: 0 },
  ])

  assert.deepEqual(result, {
    allocations: [{ saleId: 'oldest', amount: 100 }, { saleId: 'next', amount: 40 }],
    unallocated: 20,
  })
})

test('allocates to a selected invoice first, then continues to other open sales', () => {
  const result = allocateCustomerReceipt(125, [
    { id: 'oldest', openAmount: 100 },
    { id: 'selected', openAmount: 50 },
  ], 'selected')

  assert.deepEqual(result, {
    allocations: [{ saleId: 'selected', amount: 50 }, { saleId: 'oldest', amount: 75 }],
    unallocated: 0,
  })
})

test('does not create negative allocations for zero or invalid receipt amounts', () => {
  assert.deepEqual(allocateCustomerReceipt(-10, [{ id: 'sale', openAmount: 20 }]), {
    allocations: [],
    unallocated: 0,
  })
  assert.deepEqual(allocateCustomerReceipt(10, [{ id: 'sale', openAmount: -20 }]), {
    allocations: [],
    unallocated: 10,
  })
})

test('allocates receipt remainder to historical rental balances oldest-first without exceeding due', () => {
  const result = allocateCustomerReceiptToRentals(125, [
    { id: 'old-rental', balance: 80 },
    { id: 'next-rental', balance: 30 },
    { id: 'closed-rental', balance: 0 },
  ])

  assert.deepEqual(result, {
    allocations: [{ rentalId: 'old-rental', amount: 80 }, { rentalId: 'next-rental', amount: 30 }],
    unallocated: 15,
  })
})
