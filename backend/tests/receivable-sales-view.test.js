import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceivableSalesView, netReceivableSale } from '../src/utils/receivableSalesView.js';
import { effectiveCreditNoteRows } from '../src/utils/customerBalance.js';

const sale = (id, extra = {}) => ({ id, tenantId: 'tenant', customerId: 'customer',
  subtotal: 100, total: 90, tax: 0, discount: 10, cashDiscount: 0, amountPaid: 0,
  balance: 90, paymentMethod: 'credit', paymentStatus: 'unpaid', status: 'completed',
  items: [{ id: 'line', productId: 'product', quantity: 10, conversionFactor: 1, price: 10, total: 100, cost: 4 }],
  creditNotes: [], ...extra });
const note = (saleId, amount, extra = {}) => ({ id: 'note', noteNo: 'CN-1', saleId,
  tenantId: 'tenant', customerId: 'customer', status: 'issued', amount, reason: 'sales_return',
  createdAt: '2026-09-01', ...extra });
const stockReturn = { tenantId: 'tenant', returnNo: 'RET-CN-1', status: 'stock_adjusted',
  refundMethod: 'credit_note_stock', items: [{ productId: 'product', quantity: 5 }] };

test('cancelled, refunded, fully credited and cancellation-note sales are excluded', () => {
  for (const row of [sale('a', { status: 'cancelled' }), sale('a', { status: 'refunded' }),
    sale('a', { creditNotes: [note('a', 90)] }), sale('a', { creditNotes: [note('a', 100)] }),
    sale('a', { creditNotes: [note('a', 80, { reason: 'cancellation' })] })]) {
    assert.equal(netReceivableSale(row), null);
  }
});

test('partial return adjusts remaining debt, product quantity, revenue and COGS', () => {
  const row = netReceivableSale(sale('a', { amountPaid: 10, creditNotes: [note('a', 45)] }), [stockReturn]);
  assert.equal(row.total, 45);
  assert.equal(row.originalTotal, 90);
  assert.equal(row.balance, 35);
  assert.equal(row.creditNoteAmount, 45);
  assert.equal(row.items[0].quantity, 5);
  assert.equal(row.items[0].total, 45);
  assert.equal(row.items[0].quantity * row.items[0].cost, 20);
});

test('price adjustments preserve stock and cancelled notes restore the sale', () => {
  const adjusted = netReceivableSale(sale('a', { creditNotes: [note('a', 10, { reason: 'price_adjustment' })] }), [stockReturn]);
  assert.equal(adjusted.total, 80);
  assert.equal(adjusted.items[0].quantity, 10);
  const restored = netReceivableSale(sale('a', { creditNotes: [note('a', 90, { status: 'cancelled' })] }), [stockReturn]);
  assert.equal(restored.total, 90);
  assert.equal(restored.items[0].quantity, 10);
});

test('tenant and customer mismatches cannot reverse another sale', () => {
  const row = netReceivableSale(sale('a', { creditNotes: [note('a', 90, { tenantId: 'other' })] }), [stockReturn]);
  assert.equal(row.total, 90);
  const otherReturn = { ...stockReturn, tenantId: 'other' };
  const partial = netReceivableSale(sale('a', { creditNotes: [note('a', 45)] }), [otherReturn]);
  assert.equal(partial.items[0].quantity, 10);
});

test('a returned paid sale preserves actual customer funds while capping the invoice discount', () => {
  const original = sale('a', { subtotal: 25000, total: 23000, discount: 2000, amountPaid: 2000 });
  const [credit] = effectiveCreditNoteRows([{ ...note('a', 25000), sale: original }]);
  assert.equal(credit.effectiveAmount, 23000);
  const paidBeforeReturn = 2000;
  const newSale = 25000;
  const secondPayment = 2000;
  assert.equal(original.total + newSale - paidBeforeReturn - secondPayment - credit.effectiveAmount, 21000);
});

test('pagination, count, aggregates and product groups use the same adjusted sale set', async () => {
  const rows = [sale('cancelled', { status: 'cancelled' }),
    sale('returned', { creditNotes: [note('returned', 90)] }),
    sale('partial', { creditNotes: [note('partial', 45)] }), sale('active')];
  const calls = [];
  const view = createReceivableSalesView({
    saleRecord: { findMany: async (args) => { calls.push(args); return rows; } },
    saleReturn: { findMany: async () => [stockReturn] },
  });
  const where = { tenantId: 'tenant', branchId: 'branch', userId: 'staff' };
  assert.deepEqual((await view.findMany({ where, skip: 0, take: 1 })).map((row) => row.id), ['partial']);
  assert.deepEqual((await view.findMany({ where, skip: 1, take: 1 })).map((row) => row.id), ['active']);
  assert.equal(await view.count({ where }), 2);
  const totals = await view.aggregate({ where, _sum: { total: true }, _count: true });
  assert.deepEqual(totals, { _sum: { total: 135 }, _count: 2 });
  const groups = await view.groupBy({ where, by: ['paymentMethod'], _sum: { total: true }, _count: true });
  assert.deepEqual(groups, [{ paymentMethod: 'credit', _sum: { total: 135 }, _count: 2 }]);
  const products = await view.itemGroupBy({ where: { sale: where }, by: ['productId'], _sum: { quantity: true } });
  assert.equal(products[0]._sum.quantity, 15);
  for (const call of calls) {
    assert.deepEqual(call.where.AND[0], where);
    assert.equal(call.take, undefined);
    assert.equal(call.skip, undefined);
  }
});
