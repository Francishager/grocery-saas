import test from 'node:test';
import assert from 'node:assert/strict';
const prisma = {};
for (const model of ['sale', 'saleRecord', 'creditNote', 'customer', 'customerPayment',
  'customerWithdrawal', 'saleReturn', 'purchase', 'supplierPurchase', 'expense', 'journalEntry', 'product']) {
  prisma[model] = Object.fromEntries(['aggregate', 'findMany', 'groupBy', 'count'].map((method) =>
    [method, async () => { throw new Error(`Unexpected query: ${model}.${method}`); }]));
}
// Inject the database dependency before loading the endpoint; tests never connect to a real database.
globalThis.prisma = prisma;
const { default: dashboard } = await import('../src/routes/dashboard.js');

test('dashboard recomputes legacy receivables and excludes reversed sales and sales tax from profit', async (t) => {
  const makeSale = (id, total, tax, extra = {}) => ({ id, tenantId: 'tenant', customerId: 'customer',
    total, subtotal: total - tax, tax, discount: 0, cashDiscount: 0, amountPaid: 0,
    balance: total, status: 'completed', paymentStatus: 'unpaid', paymentMethod: 'credit',
    items: [{ id: id + '-item', productId: 'product', quantity: 1, price: total, total, cost: 20, conversionFactor: 1 }],
    creditNotes: [], ...extra });
  const active = makeSale('active', 118, 18);
  const returned = makeSale('returned', 200, 0);
  const note = { id: 'note', noteNo: 'CN-1', tenantId: 'tenant', customerId: 'customer',
    saleId: returned.id, amount: 200, reason: 'sales_return', status: 'issued', createdAt: new Date() };
  returned.creditNotes = [note];
  t.mock.method(prisma.sale, 'aggregate', async ({ where, _sum }) => {
    assert.deepEqual(where.status, { notIn: ['cancelled', 'refunded'] });
    assert.equal(_sum.tax, true);
    return { _sum: { total: 118, tax: 18, discount: 0 }, _count: 1 };
  });
  t.mock.method(prisma.sale, 'findMany', async () => [{ items: active.items }]);
  t.mock.method(prisma.saleRecord, 'findMany', async () => [active, returned]);
  t.mock.method(prisma.creditNote, 'findMany', async () => [{ ...note, sale: returned }]);
  t.mock.method(prisma.customer, 'findMany', async () => [{ id: 'customer', openingBalance: 20, balance: 99999 }]);
  t.mock.method(prisma.customer, 'count', async () => 1);
  t.mock.method(prisma.customerPayment, 'groupBy', async () => [{ customerId: 'customer', _sum: { amount: 50 } }]);
  t.mock.method(prisma.customerWithdrawal, 'groupBy', async () => []);
  t.mock.method(prisma.saleReturn, 'groupBy', async () => []);
  t.mock.method(prisma.saleReturn, 'findMany', async () => []);
  t.mock.method(prisma.purchase, 'aggregate', async () => ({ _sum: { total: 0 } }));
  t.mock.method(prisma.supplierPurchase, 'aggregate', async () => ({ _sum: { total: 0 } }));
  t.mock.method(prisma.expense, 'aggregate', async () => ({ _sum: { amount: 5 } }));
  t.mock.method(prisma.journalEntry, 'findMany', async () => []);
  t.mock.method(prisma.product, 'count', async () => 0);
  const handler = dashboard.stack.find((layer) => layer.route?.path === '/kpis').route.stack.at(-1).handle;
  let result;
  await handler({ user: { role: 'owner', tenantId: 'tenant' }, query: {} }, {
    json(value) { result = value; }, status(code) { throw new Error(`Unexpected HTTP ${code}`); },
  });
  assert.equal(result.receivablesOutstanding, 88);
  assert.equal(result.receivablesCount, 1);
  assert.equal(result.revenue, 200);
  assert.equal(result.taxCollected, 36);
  assert.equal(result.salesCount, 2);
  assert.equal(result.cogs, 40);
  assert.equal(result.grossProfit, 160);
  assert.equal(result.netProfit, 155);
});

test('dashboard responses cannot be reused as cached financial balances', () => {
  const headers = {};
  let continued = false;
  dashboard.stack.find((layer) => !layer.route).handle({}, { set(key, value) { headers[key] = value; } }, () => { continued = true; });
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(continued, true);
});
