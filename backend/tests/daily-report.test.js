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
