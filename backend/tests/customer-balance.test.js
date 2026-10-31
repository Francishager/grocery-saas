import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCustomerReceivableBalance,
  getCustomerReceivableBalanceMap,
} from '../src/utils/customerBalance.js';

function makeClient({ customer, sales, payments = [], allocations = [], creditNotes = [], creditApplications = [], returns = [] }) {
  return {
    customer: {
      findFirst: async () => customer,
    },
    saleRecord: {
      findMany: async () => sales,
    },
    customerPayment: {
      findMany: async () => payments.map((payment, index) => ({ id: payment.id || `payment-${index}`, allocationMode: 'legacy', ...payment })),
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
      findMany: async () => allocations.map((allocation, index) => ({ id: `allocation-${index}`, paymentId: allocation.paymentId || `payment-${index}`, ...allocation, targetType: allocation.targetType || 'sale' })),
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
      findMany: async () => creditNotes,
    },
    customerCreditApplication: {
      findMany: async () => creditApplications,
    },
    saleReturn: {
      findMany: async () => returns,
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

test('tenants without Property Management do not query plot-sale data in customer balances', async () => {
  const data = makeClient({ customer, sales: [sale({ total: 275, subtotal: 275 })] });
  let plotSalesQueried = false;
  data.propertySale = { findMany: async () => { plotSalesQueried = true; return [{ salePrice: 1000 }]; } };
  data.propertySalePayment = { findMany: async () => { plotSalesQueried = true; return []; } };

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 275);
  assert.equal(plotSalesQueried, false);
  assert.equal(result.components.propertySaleReceivables, 0);
  assert.equal(result.components.propertySalePayments, 0);
});

test('explicit receipt allocations reduce invoice receivables and receipt surplus remains a customer advance', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ legacyPaidAmountAtCutover: 0 })],
    payments: [{ customerId: customer.id, saleId: 'sale', amount: 60, allocationMode: 'explicit' }],
    allocations: [{ customerId: customer.id, saleId: 'sale', amount: 40 }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 40);
  assert.equal(result.components.salePayments, 40);
  assert.equal(result.components.unappliedCustomerReceipts, 20);
  assert.equal(result.components.customerPayments, 20);
  assert.deepEqual(result.components.paymentReconciliationIssues, []);
});

test('unapplied explicit receipts reduce net customer balance without being counted as invoice payment', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ legacyPaidAmountAtCutover: 0 })],
    payments: [{ customerId: customer.id, saleId: 'sale', amount: 100, allocationMode: 'explicit' }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 0);
  assert.equal(result.components.salePayments, 0);
  assert.equal(result.components.unappliedCustomerReceipts, 100);
  assert.equal(result.components.customerPayments, 100);
});

test('applying a linked receipt surplus to a later sale consumes that customer advance once', async () => {
  const data = makeClient({
    customer,
    sales: [
      sale({ id: 'old-sale', amountPaid: 40, legacyPaidAmountAtCutover: 0 }),
      sale({ id: 'new-sale', total: 30, subtotal: 30, amountPaid: 20, legacyPaidAmountAtCutover: 0 }),
    ],
    payments: [{ id: 'surplus-payment', customerId: customer.id, saleId: 'old-sale', amount: 60, allocationMode: 'explicit' }],
    allocations: [{ id: 'old-sale-allocation', paymentId: 'surplus-payment', customerId: customer.id, saleId: 'old-sale', amount: 40 }],
    creditApplications: [{ customerId: customer.id, saleId: 'new-sale', sourceType: 'payment', sourceId: 'surplus-payment', amount: 20 }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 70);
  assert.equal(result.components.unappliedCustomerReceipts, 0);
  assert.equal(result.components.customerPayments, 0);
});

test('linked explicit receipt allocated across multiple invoices is not counted as customer credit twice', async () => {
  const data = makeClient({
    customer,
    sales: [
      sale({ id: 'selected-sale', total: 100, subtotal: 100, amountPaid: 100, legacyPaidAmountAtCutover: 0 }),
      sale({ id: 'next-sale', total: 100, subtotal: 100, amountPaid: 50, legacyPaidAmountAtCutover: 0 }),
    ],
    payments: [{ id: 'receipt', customerId: customer.id, saleId: 'selected-sale', amount: 150, allocationMode: 'explicit' }],
    allocations: [
      { id: 'selected-allocation', paymentId: 'receipt', customerId: customer.id, saleId: 'selected-sale', amount: 100 },
      { id: 'next-allocation', paymentId: 'receipt', customerId: customer.id, saleId: 'next-sale', amount: 50 },
    ],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 50);
  assert.equal(result.components.salePayments, 150);
  assert.equal(result.components.unappliedCustomerReceipts, 0);
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

test('credit-note balance applied to a new sale reallocates credit without changing total customer balance', async () => {
  const oldSale = sale({ id: 'old-sale', total: 50, subtotal: 50, amountPaid: 50, legacyPaidAmountAtCutover: 0 });
  const data = makeClient({
    customer,
    sales: [oldSale, sale({ id: 'new-sale', total: 50, subtotal: 50, amountPaid: 50, legacyPaidAmountAtCutover: 0 })],
    payments: [{ id: 'old-payment', customerId: customer.id, saleId: 'old-sale', amount: 50, allocationMode: 'explicit' }],
    allocations: [{ id: 'old-allocation', customerId: customer.id, paymentId: 'old-payment', saleId: 'old-sale', amount: 50 }],
    creditNotes: [{ id: 'note-1', customerId: customer.id, saleId: 'old-sale', amount: 50, createdAt: new Date(), sale: oldSale }],
    creditApplications: [{ customerId: customer.id, saleId: 'new-sale', sourceType: 'credit_note', sourceId: 'note-1', amount: 50 }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 0);
  assert.equal(result.components.salePayments, 100);
  assert.equal(result.components.creditNotes, 0);
});

test('existing customer advance applied to a sale is not counted as cash twice', async () => {
  const data = makeClient({
    customer,
    sales: [sale({ id: 'new-sale', total: 30, subtotal: 30, amountPaid: 30, legacyPaidAmountAtCutover: 0 })],
    payments: [{ id: 'advance-payment', customerId: customer.id, saleId: null, amount: 30, allocationMode: 'explicit' }],
    allocations: [{ customerId: customer.id, paymentId: 'advance-payment', saleId: null, targetType: 'customer_account', amount: 30 }],
    creditApplications: [{ customerId: customer.id, saleId: 'new-sale', sourceType: 'payment', sourceId: 'advance-payment', amount: 30 }],
  });

  const result = await calculateCustomerReceivableBalance(data, { tenantId: 'tenant' }, customer.id);

  assert.equal(result.balance, 0);
  assert.equal(result.components.salePayments, 30);
  assert.equal(result.components.customerAccountAllocations, 0);
  assert.equal(result.components.unappliedCustomerReceipts, 0);
});
