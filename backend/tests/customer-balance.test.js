import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCustomerReceivableBalance,
  getCustomerReceivableBalanceMap,
} from '../src/utils/customerBalance.js';

function makeClient({ customer, sales, payments = [] }) {
  return {
    customer: {
      findFirst: async () => customer,
    },
    saleRecord: {
      findMany: async () => sales,
    },
    customerPayment: {
      groupBy: async () => {
        const grouped = new Map();
        for (const payment of payments) {
          const key = `${payment.customerId}:${payment.saleId || ''}`;
          const group = grouped.get(key) || { customerId: payment.customerId, saleId: payment.saleId || null, amount: 0 };
          group.amount += payment.amount;
          grouped.set(key, group);
        }
        return [...grouped.values()].map(({ amount, ...group }) => ({ ...group, _sum: { amount } }));
      },
    },
    customerWithdrawal: {
      groupBy: async () => [],
      aggregate: async () => ({ _sum: { amount: 0 } }),
    },
    creditNote: {
      findMany: async () => [],
    },
    saleReturn: {
      groupBy: async () => [],
      aggregate: async () => ({ _sum: { total: 0 } }),
    },
  };
}

const customer = { id: 'customer', openingBalance: 0 };
const sale = (overrides = {}) => ({
  id: 'sale',
  customerId: customer.id,
  total: 100,
  subtotal: 100,
  tax: 0,
  discount: 0,
  cashDiscount: 0,
  amountPaid: 0,
  status: 'completed',
  ...overrides,
});

test('fully paid sales do not create receivables when payment is recorded on the sale and as a linked payment', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ amountPaid: 100 })],
    payments: [{ customerId: customer.id, saleId: 'sale', amount: 100 }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 0);
  assert.equal(result.components.salePayments, 100);
  assert.equal(result.components.customerPayments, 0);
});

test('linked payments are not subtracted twice while unlinked customer payments reduce the balance', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ total: 2000, subtotal: 2000, amountPaid: 470 })],
    payments: [
      { customerId: customer.id, saleId: 'sale', amount: 360 },
      { customerId: customer.id, saleId: 'sale', amount: 110 },
      { customerId: customer.id, saleId: null, amount: 100 },
    ],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 1430);
  assert.equal(result.components.salePayments, 470);
  assert.equal(result.components.customerPayments, 100);
});

test('linked payment rows can reconcile a stale sale amountPaid without double-counting it', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ amountPaid: 100 })],
    payments: [
      { customerId: customer.id, saleId: 'sale', amount: 100 },
      { customerId: customer.id, saleId: 'sale', amount: 200 },
    ],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, -200);
  assert.equal(result.components.salePayments, 300);
});

test('balance map uses the same paid-sale reconciliation as single-customer calculation', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ amountPaid: 60 })],
    payments: [{ customerId: customer.id, saleId: 'sale', amount: 60 }],
  });

  const [result] = await getCustomerReceivableBalanceMap(data, { tenantId: 'tenant' }, [customer]);

  assert.equal(result[0], customer.id);
  assert.equal(result[1].balance, 40);
  assert.equal(result[1].components.salePayments, 60);
});
