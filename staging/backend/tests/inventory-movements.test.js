import test from 'node:test';
import assert from 'node:assert/strict';

const day = new Date(2026, 8, 20, 12);
const later = new Date(2026, 8, 21, 12);
const earlier = new Date(2026, 8, 19, 12);
const products = [
  { id: 'active', name: 'Rice', sku: 'RICE', branchId: 'main', quantity: 20, minStock: 5, isActive: true },
  { id: 'low', name: 'Beans', sku: 'BEANS', branchId: 'main', quantity: 2, minStock: 5, isActive: true },
  { id: 'archived', name: 'Old rice', sku: 'OLD', branchId: 'main', quantity: 0, minStock: 5, isActive: false },
  { id: 'unused', name: 'Unused archived product', branchId: 'main', quantity: 0, isActive: false },
  { id: 'service', name: 'Delivery', branchId: 'main', quantity: 0, minStock: 5, isActive: true, itemType: 'service' },
  { id: 'foreign', name: 'Other tenant rice', quantity: 999, isActive: true, tenantId: 'other' },
].map(p => ({ tenantId: 'tenant', itemType: 'product', ...p }));
const data = {
  saleItem: [
    { productId: 'active', quantity: 4, sale: { tenantId: 'tenant', branchId: 'main', createdAt: day, status: 'completed', userId: 'owner' } },
    { productId: 'archived', quantity: 3, conversionFactor: 2, sale: { tenantId: 'tenant', branchId: 'main', createdAt: day, status: 'completed', userId: 'owner' } },
    { productId: 'active', quantity: 2, sale: { tenantId: 'tenant', branchId: 'main', createdAt: later, status: 'completed', userId: 'owner' } },
  ],
  saleRecordItem: [{ productId: 'active', quantity: 2, sale: { tenantId: 'tenant', branchId: 'main', createdAt: day, status: 'completed', userId: 'owner' } }],
  purchaseItem: [{ productId: 'active', quantity: 10, purchase: { tenantId: 'tenant', branchId: 'main', createdAt: day } }],
  saleReturnItem: [{ productId: 'active', quantity: 3, return: { tenantId: 'tenant', branchId: 'main', createdAt: day, status: 'stock_adjusted' } }],
  auditLog: [{ tenantId: 'tenant', model: 'Product', action: 'update', recordId: 'active', id: 'adjustment', createdAt: day, changes: { before: { quantity: 21 }, after: { quantity: 20 }, stockMovement: { type: 'stock_out' } } }],
};

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(condition => matches(row, condition));
    if (key === 'OR') return value.some(condition => matches(row, condition));
    const actual = row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(actual);
      if ('not' in value) return actual !== value.not;
      if ('contains' in value) return String(actual || '').toLowerCase().includes(value.contains.toLowerCase());
      if ('gte' in value || 'lte' in value || 'gt' in value) return (value.gte === undefined || actual >= value.gte) && (value.lte === undefined || actual <= value.lte) && (value.gt === undefined || actual > value.gt);
      return matches(actual || {}, value);
    }
    return actual === value;
  });
}
const fake = {};
for (const name of ['saleItem', 'saleRecordItem', 'purchaseItem', 'supplierPurchaseItem', 'saleReturnItem', 'stockTransferItem', 'productionOrder', 'productionWaste', 'auditLog']) {
  fake[name] = { findMany: async ({ where }) => (data[name] || []).filter(row => matches(row, where)) };
}
fake.product = {
  findMany: async ({ where, skip = 0, take }) => products.filter(row => matches(row, where)).slice(skip, take === undefined ? undefined : skip + take),
  count: async ({ where }) => products.filter(row => matches(row, where)).length,
};
fake.tenant = { findUnique: async () => ({ plan: { maxProducts: 5 } }) };
fake.branch = { findFirst: async ({ where }) => ({ id: where.id }) };
// Never connect these regression tests to a tenant database.
globalThis.prisma = fake;
const { default: router } = await import('../src/routes/inventory.js');
const { checkUsageLimit } = await import('../src/utils/usageLimits.js');
const list = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;
async function inventory(query = {}) {
  let body;
  const response = { json(value) { body = value; return this; }, status(code) { assert.equal(code, 200, JSON.stringify(body)); return this; } };
  await list({ user: { id: 'owner', tenantId: 'tenant', role: 'owner' }, query: { includeDailyMovements: 'true', from: '2026-09-20', to: '2026-09-20', ...query } }, response);
  return body;
}

test('movement cards include archived history and every matching page without adding archived items to the catalogue', async () => {
  const result = await inventory({ limit: 1 });
  assert.equal(result.products.length, 1);
  assert.equal(result.total, 3);
  assert.equal(result.movementSummary.unitsSold, 12);
  assert.equal(result.movementSummary.productsSold, 2);
  assert.equal(result.movementSummary.receivableUnitsSold, 2);
  assert.equal(result.movementSummary.stockReceived, 10);
  assert.equal(result.movementSummary.otherStockOut, 1);
  assert.equal(result.movementSummary.returns, 3);
  assert.equal(result.movementSummary.lowStockProducts, 1);
  assert.equal(result.movementSummary.outOfStockProducts, 0);
  assert(result.movementProducts.some(p => p.id === 'archived'));
  assert(!result.movementProducts.some(p => p.id === 'unused' || p.id === 'foreign'));
  const movement = result.products[0].dailyMovement;
  assert.equal(movement.openingStock, 16);
  assert.equal(movement.closingStock, 22);
  assert.equal(movement.currentStock, 20);
  assert.equal(result.movementProducts.reduce((sum, p) => sum + p.dailyMovement.soldDetails.reduce((n, row) => n + row.quantity, 0), 0), result.movementSummary.unitsSold);
});

test('searching archived products retains their historical movements', async () => {
  const result = await inventory({ search: 'Old rice' });
  assert.equal(result.products.length, 0);
  assert.equal(result.movementProducts.length, 1);
  assert.equal(result.movementSummary.unitsSold, 6);
});

test('archived products do not consume existing tenant product slots', async () => {
  await assert.doesNotReject(() => checkUsageLimit('tenant', 'products'));
});

test('received transfers use destination product and receipt date; in-transit stock is not counted as received', async () => {
  products.push({ id: 'destination', name: 'Rice', sku: 'RICE', branchId: 'destination', tenantId: 'tenant', isActive: true, quantity: 5 });
  data.stockTransferItem = [
    { productId: 'active', quantity: 5, product: products[0], transfer: { id: 'received', tenantId: 'tenant', fromBranchId: 'main', toBranchId: 'destination', createdAt: earlier, updatedAt: day, status: 'received' } },
    { productId: 'active', quantity: 7, product: products[0], transfer: { id: 'pending', tenantId: 'tenant', fromBranchId: 'main', toBranchId: 'destination', createdAt: day, updatedAt: day, status: 'in_transit' } },
  ];
  try {
    const result = await inventory({ branchId: 'destination' });
    assert.equal(result.movementSummary.stockReceived, 5);
    assert.equal(result.movementSummary.otherStockOut, 0);
    assert.equal(result.products[0].dailyMovement.openingStock, 0);
    assert.equal(result.products[0].dailyMovement.stockInDetails[0].referenceId, 'received');
  } finally { products.pop(); data.stockTransferItem = []; }
});

test('transfer cancellation restores source stock on its actual cancellation day', async () => {
  data.stockTransferItem = [{ productId: 'active', quantity: 5, product: products[0], transfer: { id: 'cancelled', tenantId: 'tenant', fromBranchId: 'main', toBranchId: 'destination', createdAt: earlier, updatedAt: day, status: 'cancelled' } }];
  try {
    const result = await inventory({ branchId: 'main' });
    assert.equal(result.movementSummary.stockReceived, 15);
    assert.equal(result.movementSummary.otherStockOut, 1);
  } finally { data.stockTransferItem = []; }
});
