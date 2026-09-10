import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCustomerReceivableBalance } from '../src/utils/customerBalance.js';
import { applyDiscountCreditRepair, planDiscountCreditRepair } from '../src/utils/discountCreditRepair.js';

function fixture() {
  const customer = { id: 'customer', tenantId: 'tenant', name: 'Customer',
    openingBalance: 10500000, balance: 10300000 };
  const sale = { id: 'sale', tenantId: 'tenant', customerId: 'customer', receiptNo: 'SALE-1',
    subtotal: 13200000, total: 13000000, discount: 200000, cashDiscount: 0,
    tax: 0, amountPaid: 0, balance: 0, status: 'completed', paymentStatus: 'paid' };
  const notes = [{ id: 'note', tenantId: 'tenant', customerId: 'customer', saleId: 'sale',
    sale, amount: 13200000, noteNo: 'CN-1', status: 'issued', createdAt: '2026-09-01' }];
  const audits = [];
  const update = (rows) => async ({ where, data }) => {
    const row = rows.find((item) => item.id === where.id);
    if (!row || Object.entries(where).some(([key, value]) => typeof value !== 'object' && row[key] !== value)) {
      return { count: 0 };
    }
    Object.assign(row, data);
    return { count: 1 };
  };
  const zero = { aggregate: async () => ({ _sum: { amount: 0, total: 0 } }) };
  const client = {
    customer: { findFirst: async () => customer, updateMany: update([customer]) },
    saleRecord: { findMany: async () => [sale], updateMany: update([sale]) },
    creditNote: { findMany: async () => notes.filter((note) => note.status !== 'cancelled'), updateMany: update(notes) },
    customerPayment: zero, customerWithdrawal: zero, saleReturn: zero,
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  const plan = async () => {
    const calculated = await calculateCustomerReceivableBalance(client, { tenantId: 'tenant' }, customer.id);
    return planDiscountCreditRepair(customer, notes, calculated.balance);
  };
  return { customer, sale, notes, audits, client, plan };
}

test('restores only the excess discount to debt and a repeat run makes no further changes', async () => {
  const data = fixture();
  const first = await data.plan();
  assert.equal(first.status, 'repair');
  assert.equal(first.correction, 200000);
  assert.equal(first.before, 10300000);
  assert.equal(first.after, 10500000);
  await applyDiscountCreditRepair(data.client, first);
  assert.equal(data.customer.balance, 10500000);
  assert.equal(data.notes[0].amount, 13000000);
  assert.equal(data.sale.balance, 0);
  assert.equal(data.audits.length, 1);
  assert.equal(data.audits[0].changes.noteChanges[0].before, 13200000);
  const second = await data.plan();
  assert.equal(second.status, 'unchanged');
  assert.equal(await applyDiscountCreditRepair(data.client, second), false);
  assert.equal(data.customer.balance, 10500000);
  assert.equal(data.audits.length, 1);
});

test('a customer whose saved balance was already corrected is not credited twice', async () => {
  const data = fixture();
  data.customer.balance = 10500000;
  const plan = await data.plan();
  assert.equal(plan.status, 'repair');
  await applyDiscountCreditRepair(data.client, plan);
  assert.equal(data.customer.balance, 10500000);
  assert.equal(data.notes[0].amount, 13000000);
});

test('removes a false negative customer balance after full cancellation', async () => {
  const data = fixture();
  data.customer.openingBalance = 0;
  data.customer.balance = -200000;
  await applyDiscountCreditRepair(data.client, await data.plan());
  assert.equal(data.customer.balance, 0);
});

test('multiple notes share one net sale ceiling in chronological order', async () => {
  const data = fixture();
  data.notes[0].amount = 500000;
  data.notes.unshift({ ...data.notes[0], id: 'later', noteNo: 'CN-2', amount: 12700000, createdAt: '2026-09-02' });
  const plan = await data.plan();
  assert.equal(plan.status, 'repair');
  assert.deepEqual(plan.noteChanges, [{ id: 'later', noteNo: 'CN-2', before: 12700000, after: 12500000 }]);
});

test('unexplained customer balance differences require review and produce no writes', async () => {
  const data = fixture();
  data.customer.balance = 10000000;
  const plan = await data.plan();
  assert.equal(plan.status, 'review');
  assert.equal(await applyDiscountCreditRepair(data.client, plan), false);
  assert.equal(data.customer.balance, 10000000);
  assert.equal(data.notes[0].amount, 13200000);
  assert.equal(data.audits.length, 0);
});

test('paid, cancelled, cross-tenant and excessive overcredits require review', async () => {
  for (const change of [
    { amountPaid: 100000 }, { status: 'cancelled' }, { tenantId: 'different-tenant' },
    { customerId: 'different-customer' }, { total: 13200000 },
  ]) {
    const data = fixture();
    Object.assign(data.sale, change);
    const plan = await data.plan();
    assert.equal(plan.status, 'review', JSON.stringify(change));
    assert.equal(await applyDiscountCreditRepair(data.client, plan), false);
  }
  const data = fixture();
  data.notes[0].amount += 100000;
  assert.equal((await data.plan()).status, 'review');
});

test('cancelled notes and properly discounted notes are never changed', async () => {
  for (const change of [{ status: 'cancelled' }, { amount: 13000000 }, { amount: 500000 }]) {
    const data = fixture();
    Object.assign(data.notes[0], change);
    data.customer.balance = (await calculateCustomerReceivableBalance(data.client, { tenantId: 'tenant' }, 'customer')).balance;
    const plan = await data.plan();
    assert.equal(plan.status, 'unchanged');
    assert.equal(await applyDiscountCreditRepair(data.client, plan), false);
  }
});

test('an already corrected note with an unexplained saved balance is flagged for review', async () => {
  const data = fixture();
  data.notes[0].amount = 13000000;
  const plan = await data.plan();
  assert.equal(plan.status, 'review');
  assert.equal(plan.review[0].difference, 200000);
  assert.equal(await applyDiscountCreditRepair(data.client, plan), false);
});

test('concurrent credit note edits abort the repair before other writes', async () => {
  const data = fixture();
  const plan = await data.plan();
  data.notes[0].amount = 12900000;
  await assert.rejects(() => applyDiscountCreditRepair(data.client, plan), /Credit note changed/);
  assert.equal(data.customer.balance, 10300000);
  assert.equal(data.audits.length, 0);
});
