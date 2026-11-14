import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateInventorySales, calendarDaysBetween, inventoryQuantityChange, isExplicitDamageReason, summarizeInventoryMovements } from '../src/utils/inventoryReportHelpers.js';

test('product movement rankings convert sales quantities to base units and keep same-name products separate', () => {
  const products = [
    { id: 'a', name: 'Sugar', baseUnit: 'kg', branch: { name: 'North' } },
    { id: 'b', name: 'Sugar', baseUnit: 'bag', branch: { name: 'South' } },
    { id: 'c', name: 'Rice', baseUnit: 'kg' },
  ];
  const sales = [{ items: [
    { productId: 'a', quantity: 2, conversionFactor: 0.5, total: 1000 },
    { productId: 'b', quantity: 1, conversionFactor: 1, total: 5000 },
    { productId: 'a', quantity: 1, conversionFactor: 0.25, total: 250 },
  ] }];

  assert.deepEqual(aggregateInventorySales(sales, products), [
    { productId: 'a', product: 'Sugar', quantity: 1.25, revenue: 1250, baseUnit: 'kg', branch: 'North', saleCount: 2 },
    { productId: 'b', product: 'Sugar', quantity: 1, revenue: 5000, baseUnit: 'bag', branch: 'South', saleCount: 1 },
  ]);
  assert.equal(aggregateInventorySales(sales, products, { includeUnsold: true }).find((row) => row.productId === 'c').quantity, 0);
});

test('stock adjustment reports require an actual quantity change and damaged report requires an explicit reason', () => {
  assert.deepEqual(inventoryQuantityChange({ changes: { before: { quantity: '4' }, after: { quantity: '2.5' } } }), { before: 4, after: 2.5, delta: -1.5 });
  assert.equal(inventoryQuantityChange({ changes: { before: { quantity: 4 }, after: { quantity: 4 }, stockMovement: { reason: 'price update' } } }), null);
  assert.equal(isExplicitDamageReason('Damaged packaging'), true);
  assert.equal(isExplicitDamageReason('Routine stock adjustment'), false);
});

test('expiry days use calendar dates, so an item expiring today is not marked expired mid-day', () => {
  assert.equal(calendarDaysBetween('2026-11-14T00:00:00.000Z', new Date('2026-11-14T12:00:00.000Z')), 0);
  assert.equal(calendarDaysBetween('2026-11-13T00:00:00.000Z', new Date('2026-11-14T12:00:00.000Z')), -1);
});

test('movement totals stay separated by unit instead of adding unlike quantities', () => {
  assert.deepEqual(summarizeInventoryMovements([
    { baseUnit: 'kg', inQty: 4, outQty: 1 },
    { baseUnit: 'box', inQty: 2, outQty: 3 },
  ]), {
    totalInbound: '4 kg · 2 box',
    totalOutbound: '1 kg · 3 box',
    netChange: '3 kg · -1 box',
    movementCount: 2,
  });
});
