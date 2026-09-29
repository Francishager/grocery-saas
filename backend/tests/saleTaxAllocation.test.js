import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateSaleTaxToItems, returnItemTaxAmount } from '../src/utils/saleTaxAllocation.js'

test('sale tax allocation preserves invoice tax and allocates it by net line value', () => {
  const shares = allocateSaleTaxToItems([
    { quantity: 1, price: 100, total: 100 },
    { quantity: 1, price: 200, total: 200 },
  ], 54)
  assert.deepEqual(shares, [18, 36])
  assert.equal(shares.reduce((sum, amount) => sum + amount, 0), 54)
})

test('return tax follows the original sale-line snapshot and supports partial returns', () => {
  assert.equal(returnItemTaxAmount({ quantity: 4, taxAmount: 36 }, 1), 9)
  assert.equal(returnItemTaxAmount({ quantity: 4, taxAmount: 36 }, 4), 36)
  assert.equal(returnItemTaxAmount({ quantity: 4, taxAmount: null }, 1), null)
})
