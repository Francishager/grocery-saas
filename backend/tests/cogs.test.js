import test from 'node:test';
import assert from 'node:assert/strict';

import { saleLineCogs } from '../src/utils/cogs.js';

test('saleLineCogs falls back to product cost when saved line cost is null', () => {
  const item = {
    quantity: 2,
    cost: null,
    conversionFactor: 1,
    product: { cost: 25 },
  };

  assert.equal(saleLineCogs(item), 50);
});

test('saleLineCogs uses the saved line cost when present', () => {
  const item = {
    quantity: 3,
    cost: 10,
    conversionFactor: 1,
    product: { cost: 25 },
  };

  assert.equal(saleLineCogs(item), 30);
});
