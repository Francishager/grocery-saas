import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidStockQuantity } from '../src/utils/stockQuantity.js';

test('stock quantities accept zero and fractional values to three decimal places', () => {
  for (const value of [0, 0.5, 0.025, 12.125]) assert.equal(isValidStockQuantity(value), true);
});

test('stock adjustments require positive quantities and reject unsupported precision', () => {
  assert.equal(isValidStockQuantity(0, { allowZero: false }), false);
  assert.equal(isValidStockQuantity(0.025, { allowZero: false }), true);
  assert.equal(isValidStockQuantity(0.0005), false);
  assert.equal(isValidStockQuantity(-0.5), false);
  assert.equal(isValidStockQuantity(Number.NaN), false);
});
