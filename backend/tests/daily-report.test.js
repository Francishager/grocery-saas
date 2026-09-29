import test from 'node:test';
import assert from 'node:assert/strict';

const prisma = {
  tenant: { findUnique: async () => ({ name: 'Report Test Business' }) },
  branch: { findMany: async () => [] },
  customer: { findMany: async () => [] },
  saleRecord: { findMany: async () => [] },
  customerPayment: { findMany: async () => [] },
  expense: { findMany: async () => [] },
  journalEntry: { findMany: async () => [] },
  sale: { findMany: async () => [] },
  creditNote: { findMany: async () => [] },
  saleReturn: { findMany: async () => [] },
  cashAccount: { findMany: async () => [] },
  cashTransaction: { findMany: async () => [], groupBy: async () => [] },
};
globalThis.prisma = prisma;
const { default: reports } = await import('../src/routes/reports.js');

test('daily report totals and drilldowns include every matching row even with limit=1', async (t) => {
  const date = new Date('2026-09-01T12:00:00Z');
  const sales = Array.from({ length: 1601 }, (_, i) => ({
    id: 'sale-' + i, receiptNo: 'receipt-' + i, paymentMethod: 'cash', total: 100, tax: 0,
    status: 'completed', createdAt: date, items: [], user: { id: 'staff', fname: 'Staff' },
  }));
  t.mock.method(prisma.sale, 'findMany', async (args) => {
    assert.equal(args.take, undefined);
    assert.equal(args.where.tenantId, 'tenant');
    return sales;
  });
  t.mock.method(prisma.cashAccount, 'findMany', async () => [
    { id: 'till', name: 'Till', type: 'cash', balance: 160100, AssignedUsers: [] },
  ]);
  t.mock.method(prisma.cashTransaction, 'findMany', async (args) => {
    assert.equal(args.take, undefined);
    assert.equal(args.where.account.tenantId, 'tenant');
    assert.equal(args.where.createdAt.gte.toISOString(), '2026-08-31T21:00:00.000Z', 'Kampala business day starts at local midnight');
    assert.equal(args.where.createdAt.lte.toISOString(), '2026-09-01T20:59:59.999Z', 'Kampala business day ends at local midnight');
    return sales.map((sale, index) => ({
      id: 'cash-' + index, accountId: 'till', reference: sale.receiptNo, type: 'income',
      amount: 100, balanceAfter: (index + 1) * 100, createdAt: date, userId: 'staff',
      account: { id: 'till', name: 'Till', type: 'cash' },
    }));
  });
  const routes = reports.stack.filter((layer) => layer.route?.path === '/daily-business');
  assert.equal(routes.length, 1);
  let result;
  await routes[0].route.stack.at(-1).handle({
    user: { id: 'owner', role: 'owner', tenantId: 'tenant', permissions: ['*'] },
    query: { from: '2026-09-01', to: '2026-09-01', limit: '1' },
  }, { json(body) { result = body; }, status(code) { throw Error('Unexpected HTTP ' + code); } });
  assert.equal(result.summary.totalSales, 160100);
  assert.equal(result.summary.cashAtHand, 160100);
  assert.equal(result.transactions.length, 1601);
  assert.equal(result.cashLedger.length, 1601);
  assert.equal(result.cashMovement.expectedCash, result.summary.cashAtHand);
  assert.equal(result.staffTills[0].balance, result.summary.cashAtHand);
  assert.equal(result.pagination.truncated, false);
});

test('daily report nets credit notes and POS returns, reverses returned COGS, and allocates partial credit invoices by payment method', async (t) => {
  const date = new Date('2026-09-01T12:00:00Z');
  const creditSale = {
    id: 'credit-sale', receiptNo: 'CR-1', total: 1180, subtotal: 1000, tax: 180, discount: 0,
    amountPaid: 400, balance: 780, paymentMethod: 'credit', paymentStatus: 'partial', status: 'completed', createdAt: date,
    customerId: 'customer', customer: { id: 'customer', name: 'Ada', balance: 780, creditLimit: 2000 },
    User: { id: 'staff', fname: 'Staff' }, branch: null,
    items: [{ productId: 'credit-product', quantity: 2, conversionFactor: 1, cost: 300, total: 1000, price: 500, product: { id: 'credit-product', name: 'Rice', sku: 'R', quantity: 8, cost: 300 } }],
  };
  const posSale = {
    id: 'pos-sale', receiptNo: 'POS-1', total: 1180, subtotal: 1000, tax: 180, discount: 0,
    paymentMethod: 'cash', status: 'completed', createdAt: date, customerName: 'Walk-in',
    user: { id: 'staff', fname: 'Staff' }, branch: null,
    items: [{ productId: 'pos-product', quantity: 2, conversionFactor: 1, cost: 50, total: 1000, price: 500, product: { id: 'pos-product', name: 'Soap', sku: 'S', quantity: 8, cost: 50 } }],
  };
  t.mock.method(prisma.sale, 'findMany', async () => [posSale]);
  t.mock.method(prisma.saleRecord, 'findMany', async () => [creditSale]);
  const paidAtSaleAmount = { value: 400 };
  const taxSnapshots = { enabled: false };
  t.mock.method(prisma.customerPayment, 'findMany', async () => [{
    id: 'paid-at-sale', saleId: creditSale.id, customerId: 'customer', amount: paidAtSaleAmount.value, paymentMethod: 'cash',
    notes: 'Paid at sale', createdAt: date, customer: creditSale.customer, sale: { receiptNo: creditSale.receiptNo }, reference: 'PAY-1',
  }]);
  t.mock.method(prisma.creditNote, 'findMany', async () => [{
    id: 'cn1', noteNo: 'CN-1', amount: 500, reason: 'sales_return', status: 'issued', refundAmount: 0,
    taxAmount: taxSnapshots.enabled ? 90 : null,
    customerId: 'customer', customer: creditSale.customer, createdAt: date, sale: creditSale, userId: 'staff',
  }]);
  t.mock.method(prisma.saleReturn, 'findMany', async (args) => {
    if (args.where.returnNo?.in) return [{
      id: 'stock-return', returnNo: 'RET-CN-1', status: 'stock_adjusted',
      taxAmount: taxSnapshots.enabled ? 90 : null,
      items: [{ productId: 'credit-product', quantity: 1, price: 500, total: 500, taxAmount: taxSnapshots.enabled ? 90 : null, product: { name: 'Rice' } }],
    }];
    return [{
      id: 'pos-return', returnNo: 'RET-POS-1', total: 100, reason: 'Damaged goods', refundMethod: 'cash', status: 'completed',
      taxAmount: taxSnapshots.enabled ? 90 : null,
      createdAt: date, userId: 'staff', user: { id: 'staff', fname: 'Staff' }, customer: null,
      items: [{ productId: 'pos-product', quantity: 1, price: 500, total: 500, taxAmount: taxSnapshots.enabled ? 90 : null }],
      sale: { ...posSale, customerName: 'Walk-in' },
    }];
  });
  const routes = reports.stack.filter((layer) => layer.route?.path === '/daily-business');
  const handler = routes[0].route.stack.at(-1).handle;
  const run = async (paymentMethod) => {
    let result;
    await handler({
      user: { id: 'owner', role: 'owner', tenantId: 'tenant', permissions: ['*'] },
      query: { from: '2026-09-01', to: '2026-09-01', ...(paymentMethod ? { paymentMethod } : {}) },
    }, { json(body) { result = body; }, status(code) { throw Error('Unexpected HTTP ' + code); } });
    return result;
  };

  const all = await run();
  assert.equal(all.summary.totalSales, 2360);
  assert.equal(all.summary.salesReturns, 600);
  assert.equal(all.summary.netSales, 1400);
  assert.equal(all.summary.returnedTax, 108);
  assert.equal(all.summary.taxCollected, 252);
  assert.equal(all.accountingReconciliation.tax.status, 'estimated_from_original_sale');
  assert.equal(all.profitability.cogs, 350);
  assert.equal(all.profitability.returnedCogs, 350);
  assert.equal(all.summary.grossProfit, 1050);
  assert.equal(all.transactions.filter((row) => row.kind === 'sales-adjustment').length, 2);

  const cash = await run('cash');
  assert.equal(cash.summary.cashSales, 1580, 'cash filter includes cash paid at sale, not the full partially paid invoice');
  assert.equal(cash.summary.creditSales, 0);
  assert.equal(cash.summary.totalSales, 1580);

  paidAtSaleAmount.value = 1400;
  const overpaid = await run('cash');
  assert.equal(overpaid.summary.cashSales, 2360, 'payment allocations are capped at the invoice value');
  assert.equal(overpaid.summary.totalSales, 2360);

  taxSnapshots.enabled = true;
  const withTaxSnapshots = await run();
  assert.equal(withTaxSnapshots.summary.returnedTax, 180);
  assert.equal(withTaxSnapshots.accountingReconciliation.tax.status, 'recorded_at_transaction');
  assert.equal(withTaxSnapshots.accountingReconciliation.tax.estimatedAdjustments, 0);
});

test('bank report recognizes incoming transfers and reconstructs the opening balance', async (t) => {
  t.mock.method(prisma.cashAccount, 'findMany', async () => [
    { id: 'bank', name: 'Business Bank', type: 'bank', balance: 800 },
  ]);
  t.mock.method(prisma.cashTransaction, 'findMany', async () => [
    { id: 'deposit', accountId: 'bank', type: 'transfer_in', amount: 500, createdAt: new Date('2026-09-01T12:00:00Z'), account: { name: 'Business Bank' } },
    { id: 'payment', accountId: 'bank', type: 'expense', amount: 100, createdAt: new Date('2026-09-01T13:00:00Z'), account: { name: 'Business Bank' } },
  ]);
  t.mock.method(prisma.cashTransaction, 'groupBy', async () => [
    { accountId: 'bank', type: 'income', _sum: { amount: 300 } },
  ]);
  let result;
  const handler = reports.stack.find((layer) => layer.route?.path === '/financial/bank-transactions').route.stack.at(-1).handle;
  await handler({ user: { id: 'owner', role: 'owner', tenantId: 'tenant' }, query: { from: '2026-09-01', to: '2026-09-01' } },
    { json(body) { result = body; }, status(code) { throw Error('Unexpected HTTP ' + code); } });
  assert.equal(result.summary.openingBalance, 100);
  assert.equal(result.summary.totalInflow, 500);
  assert.equal(result.summary.totalOutflow, 100);
  assert.equal(result.currentBalance, 500);
});
