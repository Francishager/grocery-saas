import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCustomerReceivableBalance,
  getCustomerReceivableBalanceMap,
} from '../src/utils/customerBalance.js';

function makeClient({ customer, sales, payments = [], allocations = [] }) {
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
          const key = `${payment.customerId}:${payment.saleId || ''}:${payment.allocationMode || 'legacy'}`;
          const group = grouped.get(key) || { customerId: payment.customerId, saleId: payment.saleId || null, allocationMode: payment.allocationMode || 'legacy', amount: 0 };
          group.amount += payment.amount;
          grouped.set(key, group);
        }
        return [...grouped.values()].map(({ amount, ...group }) => ({ ...group, _sum: { amount } }));
      },
    },
    customerPaymentAllocation: {
      groupBy: async () => allocations.map((allocation) => ({
        customerId: allocation.customerId,
        saleId: allocation.saleId,
        targetType: allocation.targetType || 'sale',
        _sum: { amount: allocation.amount },
      })),
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
  assert.deepEqual(result.components.paymentReconciliationIssues, [{
    saleId: 'sale',
    recordedSaleAmountPaid: 100,
    linkedPaymentTotal: 300,
    difference: 200,
    provisionalAmountUsed: 300,
    status: 'source_mismatch',
    requiresReview: true,
  }]);
});

test('legacy paid amount without linked receipt rows is surfaced without changing its balance', async () => {
  const data = makeClient({ customer, sales: [sale({ amountPaid: 25 })] });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 75);
  assert.equal(result.components.salePayments, 25);
  assert.deepEqual(result.components.paymentReconciliationIssues, [{
    saleId: 'sale',
    recordedSaleAmountPaid: 25,
    linkedPaymentTotal: 0,
    difference: -25,
    provisionalAmountUsed: 25,
    status: 'missing_payment_rows',
    requiresReview: true,
  }]);
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

test('explicit receipt allocations, not receipt totals, reduce invoice receivables', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ legacyPaidAmountAtCutover: 0 })],
    payments: [{ customerId: customer.id, saleId: 'sale', amount: 60, allocationMode: 'explicit' }],
    allocations: [{ customerId: customer.id, saleId: 'sale', amount: 40 }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 60);
  assert.equal(result.components.salePayments, 40);
  assert.equal(result.components.unappliedCustomerReceipts, 20);
  assert.deepEqual(result.components.paymentReconciliationIssues, []);
});

test('unapplied explicit receipts remain separate from invoice receivables', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ legacyPaidAmountAtCutover: 0 })],
    payments: [{ customerId: customer.id, saleId: 'sale', amount: 100, allocationMode: 'explicit' }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 100);
  assert.equal(result.components.salePayments, 0);
  assert.equal(result.components.unappliedCustomerReceipts, 100);
});

test('explicit customer-account allocation reduces the customer account separately from invoice allocations', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ legacyPaidAmountAtCutover: 0 })],
    payments: [{ customerId: customer.id, saleId: null, amount: 80, allocationMode: 'explicit' }],
    allocations: [{ customerId: customer.id, saleId: null, targetType: 'customer_account', amount: 80 }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 20);
  assert.equal(result.components.salePayments, 0);
  assert.equal(result.components.customerAccountAllocations, 80);
  assert.equal(result.components.unappliedCustomerReceipts, 0);
});
