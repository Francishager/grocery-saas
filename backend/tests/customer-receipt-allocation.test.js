import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateCustomerReceipt } from '../src/utils/customerReceiptAllocation.js'

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
