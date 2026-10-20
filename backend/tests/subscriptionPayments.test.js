import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelManualSubscriptionPayment, extendSettledSubscriptionTerm, getRefundableSubscriptionPaymentAmount, getSubscriptionPaymentProgress, normalizeSubscriptionPaymentAmount, recordSubscriptionPaymentRefund, syncPesapalSubscriptionPayment } from '../src/utils/subscriptionPayments.js';
import { normalizePesapalStatus } from '../src/services/pesapal.js';

test('subscription receipt amounts normalize to cents without floating point arithmetic', () => {
  assert.equal(normalizeSubscriptionPaymentAmount('50000'), '50000.00');
  assert.equal(normalizeSubscriptionPaymentAmount('1250.5'), '1250.50');
  assert.equal(normalizeSubscriptionPaymentAmount(0.25), '0.25');
});

test('subscription receipt amount validation rejects zero, negatives, excess decimals and overflow', () => {
  for (const amount of ['', '0', '0.00', '-1', '1.005', '1e4', '12345678901234567']) {
    assert.throws(() => normalizeSubscriptionPaymentAmount(amount));
  }
});

test('partial subscription payments remain due while the subscription term is active', async () => {
  const tenant = {
    id: 'tenant-1',
    plan: { price: 100000, billingCycle: 'monthly', currency: 'UGX' },
    billingChargeMode: 'plan',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionStart: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-11-01T00:00:00.000Z'),
    paymentReminderStatus: 'paid',
  };
  const tx = {
    tenant: { findUnique: async () => tenant },
    subscriptionPayment: {
      aggregate: async ({ where }) => {
        assert.equal(where.status, 'completed');
        assert.equal(where.paidAt.gte.toISOString(), '2026-10-01T00:00:00.000Z');
        return { _sum: { amount: 40000 } };
      },
      count: async () => 1,
      findMany: async () => [{ id: 'legacy-payment', amount: 40000, notes: null, paidAt: new Date('2026-10-10T00:00:00.000Z'), createdAt: new Date('2026-10-10T00:00:00.000Z'), refunds: [] }],
    },
  };

  const result = await getSubscriptionPaymentProgress(tx, tenant.id, new Date('2026-10-16T00:00:00.000Z'));
  assert.equal(result.progress.paidAmount, 40000);
  assert.equal(result.progress.remainingAmount, 60000);
  assert.equal(result.progress.isPartiallyPaid, true);
  assert.equal(result.progress.isPaid, false);
});

test('annual-fee invoice balances carry into later monthly windows despite charge-mode changes', async () => {
  const tenant = {
    id: 'tenant-2',
    plan: { price: 100000, billingCycle: 'monthly', currency: 'UGX' },
    billingChargeMode: 'plan',
    monthlyServiceFee: 20000,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionStart: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-12-01T00:00:00.000Z'),
  };
  const tx = {
    tenant: { findUnique: async () => tenant },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 0 } }),
      count: async () => 1,
      findMany: async () => [{
        amount: 40000,
        notes: 'JIBUSALES_INVOICE:{"invoiceKey":"annual-invoice-1","billedTotal":120000,"total":40000,"lineItems":[{"description":"Annual service fee","amount":20000}]}',
        paidAt: new Date('2026-10-10T00:00:00.000Z'),
      }],
    },
  };

  const result = await getSubscriptionPaymentProgress(tx, tenant.id, new Date('2026-11-16T00:00:00.000Z'));
  assert.equal(result.periodTotal, 120000);
  assert.equal(result.progress.remainingAmount, 80000);
  assert.equal(result.progress.isPartiallyPaid, true);
  assert.equal(result.invoiceSnapshot.lineItems[0].description, 'Annual service fee');
});

test('legacy partial plan override remains due when the current invoice is services-only', async () => {
  const tenant = {
    id: 'tenant-3',
    plan: { price: 100000, billingCycle: 'monthly', currency: 'UGX' },
    customPrice: 500000,
    billingChargeMode: 'service',
    monthlyServiceFee: 50000,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionStart: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-11-01T00:00:00.000Z'),
  };
  const tx = {
    tenant: { findUnique: async () => tenant },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 200000 } }),
      count: async () => 1,
      findMany: async () => [{
        id: 'legacy-partial',
        amount: 200000,
        notes: 'Cash received against the tenant-specific plan price',
        paidAt: new Date('2026-10-12T00:00:00.000Z'),
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
      }],
    },
  };

  const result = await getSubscriptionPaymentProgress(tx, tenant.id, new Date('2026-10-16T00:00:00.000Z'));
  assert.equal(result.periodTotal, 500000);
  assert.equal(result.progress.paidAmount, 200000);
  assert.equal(result.progress.remainingAmount, 300000);
  assert.equal(result.progress.isPartiallyPaid, true);
});

test('fully unpaid tenant price override remains outstanding when billing mode is services-only', async () => {
  const tenant = {
    id: 'tenant-4',
    plan: { price: 100000, billingCycle: 'monthly', currency: 'UGX' },
    customPrice: 500000,
    billingChargeMode: 'service',
    monthlyServiceFee: 50000,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    subscriptionStart: new Date('2026-09-01T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-10-01T00:00:00.000Z'),
    paymentReminderStatus: 'due_soon',
  };
  const tx = {
    tenant: { findUnique: async () => tenant },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 0 } }),
      count: async () => 0,
      findMany: async () => [],
    },
  };

  const result = await getSubscriptionPaymentProgress(tx, tenant.id, new Date('2026-10-16T00:00:00.000Z'));
  assert.equal(result.periodTotal, 500000);
  assert.equal(result.progress.remainingAmount, 500000);
  assert.equal(result.progress.isPartiallyPaid, false);
  assert.equal(result.hasOutstandingBalance, true);
});

test('a paid services-only invoice does not settle the separate tenant plan override', async () => {
  const tenant = {
    id: 'tenant-5',
    plan: { price: 100000, billingCycle: 'monthly', currency: 'UGX' },
    customPrice: 350000,
    billingChargeMode: 'service',
    monthlyServiceFee: 50000,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionStart: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-11-01T00:00:00.000Z'),
  };
  const tx = {
    tenant: { findUnique: async () => tenant },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 50000 } }),
      count: async () => 1,
      findMany: async () => [{
        id: 'service-receipt',
        amount: 50000,
        notes: 'JIBUSALES_INVOICE:{"invoiceKey":"service-only","billedTotal":50000,"total":50000,"lineItems":[{"description":"Service fee","amount":50000}]}',
        paidAt: new Date('2026-10-12T00:00:00.000Z'),
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
      }],
    },
  };

  const result = await getSubscriptionPaymentProgress(tx, tenant.id, new Date('2026-10-16T00:00:00.000Z'));
  assert.equal(result.periodTotal, 350000);
  assert.equal(result.progress.remainingAmount, 350000);
  assert.equal(result.hasOutstandingBalance, true);
});

test('tenant override is not assumed paid from active dates or a legacy paid flag without receipts', async () => {
  const tenant = {
    id: 'tenant-6',
    plan: { price: 100000, billingCycle: 'monthly', currency: 'UGX' },
    customPrice: 200000,
    billingChargeMode: 'plan',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionStart: new Date('2026-10-01T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-11-01T00:00:00.000Z'),
    paymentReminderStatus: 'paid',
  };
  const tx = {
    tenant: { findUnique: async () => tenant },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 0 } }),
      count: async () => 0,
      findMany: async () => [],
    },
  };

  const result = await getSubscriptionPaymentProgress(tx, tenant.id, new Date('2026-10-16T00:00:00.000Z'));
  assert.equal(result.periodTotal, 200000);
  assert.equal(result.progress.remainingAmount, 200000);
  assert.equal(result.hasOutstandingBalance, true);
});

test('a fully settled invoice extends an expired subscription once and clears payment suspension', async () => {
  const invoice = { invoiceKey: 'invoice-settled', billedTotal: 100, total: 100, periodCount: 1, periodUnit: 'monthly' };
  const receipt = { id: 'receipt-1', amount: 100, notes: `JIBUSALES_INVOICE:${JSON.stringify(invoice)}`, paidAt: new Date('2026-10-19T12:00:00.000Z'), createdAt: new Date('2026-10-19T12:00:00.000Z') };
  const tenant = {
    id: 'tenant-paid', status: 'suspended', paymentReminderStatus: 'subscription_overdue',
    plan: { price: 100, billingCycle: 'monthly', currency: 'UGX' }, billingChargeMode: 'plan',
    createdAt: new Date('2026-08-20T00:00:00.000Z'), subscriptionStart: new Date('2026-08-20T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-09-20T00:00:00.000Z'),
  };
  const tenantUpdates = [];
  const receiptUpdates = [];
  const tx = {
    tenant: {
      findUnique: async () => tenant,
      update: async ({ data }) => { Object.assign(tenant, data); tenantUpdates.push(data); return tenant; },
    },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 100 } }),
      count: async () => 1,
      findMany: async () => [receipt],
      update: async ({ data }) => { Object.assign(receipt, data); receiptUpdates.push(data); return receipt; },
    },
  };

  const result = await extendSettledSubscriptionTerm(tx, tenant.id, new Date('2026-10-20T12:00:00.000Z'));
  assert.equal(result.termExtended, true);
  assert.equal(tenant.status, 'active');
  assert.equal(tenant.paymentReminderStatus, 'paid');
  assert.equal(tenant.subscriptionEnd.toISOString(), '2026-11-20T12:00:00.000Z');
  assert.equal(receiptUpdates.length, 1);
  assert.equal(JSON.parse(receipt.notes.slice('JIBUSALES_INVOICE:'.length)).coverageEnd, tenant.subscriptionEnd.toISOString());
});

test('partial subscription payment does not extend the term or reactivate a suspended tenant', async () => {
  const invoice = { invoiceKey: 'invoice-partial', billedTotal: 100, total: 40, periodCount: 1, periodUnit: 'monthly' };
  const tenant = {
    id: 'tenant-partial', status: 'suspended', paymentReminderStatus: 'subscription_overdue',
    plan: { price: 100, billingCycle: 'monthly', currency: 'UGX' }, billingChargeMode: 'plan',
    createdAt: new Date('2026-08-20T00:00:00.000Z'), subscriptionStart: new Date('2026-08-20T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-09-20T00:00:00.000Z'),
  };
  let tenantUpdateCount = 0;
  const tx = {
    tenant: { findUnique: async () => tenant, update: async () => { tenantUpdateCount += 1; } },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 40 } }),
      count: async () => 1,
      findMany: async () => [{ id: 'partial-1', amount: 40, notes: `JIBUSALES_INVOICE:${JSON.stringify(invoice)}`, paidAt: new Date('2026-10-19T12:00:00.000Z'), createdAt: new Date('2026-10-19T12:00:00.000Z') }],
    },
  };

  const result = await extendSettledSubscriptionTerm(tx, tenant.id, new Date('2026-10-20T12:00:00.000Z'));
  assert.equal(result.termExtended, false);
  assert.equal(result.progress.isPartiallyPaid, true);
  assert.equal(tenant.status, 'suspended');
  assert.equal(tenant.subscriptionEnd.toISOString(), '2026-09-20T00:00:00.000Z');
  assert.equal(tenantUpdateCount, 0);
});

test('settling payment does not undo an explicit SaaS Admin suspension', async () => {
  const invoice = { invoiceKey: 'invoice-admin-suspended', billedTotal: 100, total: 100, periodCount: 1, periodUnit: 'monthly' };
  const receipt = { id: 'receipt-admin-suspended', amount: 100, notes: `JIBUSALES_INVOICE:${JSON.stringify(invoice)}`, paidAt: new Date('2026-10-19T12:00:00.000Z'), createdAt: new Date('2026-10-19T12:00:00.000Z') };
  const tenant = {
    id: 'tenant-admin-suspended', status: 'suspended', paymentReminderStatus: 'admin_suspended',
    plan: { price: 100, billingCycle: 'monthly', currency: 'UGX' }, billingChargeMode: 'plan',
    createdAt: new Date('2026-08-20T00:00:00.000Z'), subscriptionStart: new Date('2026-08-20T00:00:00.000Z'),
    subscriptionEnd: new Date('2026-09-20T00:00:00.000Z'),
  };
  const tx = {
    tenant: {
      findUnique: async () => tenant,
      update: async ({ data }) => { Object.assign(tenant, data); return tenant; },
    },
    subscriptionPayment: {
      aggregate: async () => ({ _sum: { amount: 100 } }),
      count: async () => 1,
      findMany: async () => [receipt],
      update: async ({ data }) => { Object.assign(receipt, data); return receipt; },
    },
  };

  const result = await extendSettledSubscriptionTerm(tx, tenant.id, new Date('2026-10-20T12:00:00.000Z'));
  assert.equal(result.termExtended, true);
  assert.equal(tenant.subscriptionEnd.toISOString(), '2026-11-20T12:00:00.000Z');
  assert.equal(tenant.status, 'suspended');
  assert.equal(tenant.paymentReminderStatus, 'admin_suspended');
});

test('Pesapal statuses only settle successful verified payments', () => {
  assert.equal(normalizePesapalStatus({ payment_status_description: 'COMPLETED', status_code: 1 }), 'completed');
  assert.equal(normalizePesapalStatus({ payment_status_description: 'FAILED', status_code: 2 }), 'failed');
  assert.equal(normalizePesapalStatus({ payment_status_description: 'REVERSED', status_code: 3 }), 'reversed');
  assert.equal(normalizePesapalStatus({ payment_status_description: 'PENDING', status_code: 4 }), 'pending');
});

test('admin cancellation voids a manual receipt with an audit reason and leaves remaining received payments intact', async () => {
  const payment = { id: 'payment-1', tenantId: 'tenant-1', provider: 'manual', status: 'completed', reference: 'CASH-1', amount: { toString: () => '25000.00' }, paidAt: new Date() };
  let updateData;
  let tenantUpdate;
  let reads = 0;
  const tx = {
    subscriptionPayment: {
      findUnique: async () => { reads += 1; return reads === 1 ? payment : { ...payment, ...updateData }; },
      updateMany: async ({ where, data }) => {
        assert.equal(where.status, 'completed');
        assert.equal(where.provider, 'manual');
        updateData = data;
        return { count: 1 };
      },
      aggregate: async () => ({ _sum: { amount: 0 } }),
      count: async () => 1,
      findMany: async () => [],
    },
    tenant: {
      findUnique: async ({ include } = {}) => include
        ? { id: 'tenant-1', plan: { price: 25000, billingCycle: 'monthly', currency: 'UGX' }, createdAt: new Date(), subscriptionStart: new Date(), subscriptionEnd: null }
        : { billingPaymentReference: 'NEWER-RECEIPT' },
      update: async ({ data }) => { tenantUpdate = data; },
    },
  };
  const result = await cancelManualSubscriptionPayment({ $transaction: callback => callback(tx) }, {
    paymentId: payment.id,
    adminId: 'admin-1',
    adminEmail: 'admin@example.com',
    reason: 'Duplicate entry',
  });
  assert.equal(result.payment.status, 'cancelled');
  assert.equal(updateData.cancellationReason, 'Duplicate entry');
  assert.equal(updateData.cancelledByEmail, 'admin@example.com');
  assert.equal(tenantUpdate.paymentReminderStatus, 'due_soon');
  assert.equal(tenantUpdate.billingPaymentReference, undefined);
});

test('admin cannot cancel Pesapal transactions through manual receipt cancellation', async () => {
  const tx = {
    subscriptionPayment: { findUnique: async () => ({ id: 'pesapal-1', provider: 'pesapal', status: 'completed', gatewayTrackingId: 'tracking-1' }) },
  };
  const result = await cancelManualSubscriptionPayment({ $transaction: callback => callback(tx) }, {
    paymentId: 'pesapal-1', adminId: 'admin-1', reason: 'duplicate',
  });
  assert.equal(result.error, 'not_manual');
});

test('only invoice overpayment is refundable, not the amount needed to settle the invoice', async () => {
  const invoice = { invoiceKey: 'refund-invoice', billedTotal: 100, total: 100, periodCount: 1 };
  const rows = [
    { id: 'receipt-a', tenantId: 'tenant-refund', amount: 70, currency: 'UGX', status: 'completed', provider: 'manual', notes: `JIBUSALES_INVOICE:${JSON.stringify(invoice)}`, paidAt: new Date('2026-10-10T00:00:00.000Z'), createdAt: new Date('2026-10-10T00:00:00.000Z'), refunds: [] },
    { id: 'receipt-b', tenantId: 'tenant-refund', amount: 60, currency: 'UGX', status: 'completed', provider: 'manual', notes: `JIBUSALES_INVOICE:${JSON.stringify(invoice)}`, paidAt: new Date('2026-10-11T00:00:00.000Z'), createdAt: new Date('2026-10-11T00:00:00.000Z'), refunds: [] },
  ];
  const tenant = { id: 'tenant-refund', plan: { price: 100, billingCycle: 'monthly', currency: 'UGX' }, billingChargeMode: 'plan', createdAt: new Date('2026-10-01T00:00:00.000Z'), subscriptionStart: new Date('2026-10-01T00:00:00.000Z'), subscriptionEnd: new Date('2026-11-01T00:00:00.000Z') };
  const tx = {
    subscriptionPayment: {
      findUnique: async () => rows[1],
      findMany: async () => rows,
      count: async () => rows.length,
      aggregate: async () => ({ _sum: { amount: 130 } }),
      update: async () => {},
    },
    tenant: { findUnique: async () => tenant, update: async () => tenant },
  };
  const availability = await getRefundableSubscriptionPaymentAmount(tx, 'receipt-b');
  assert.equal(availability.refundableAmount, 30);
  assert.equal(availability.billedTotal, 100);
  let refundInsertCount = 0;
  const rejected = await recordSubscriptionPaymentRefund({
    $transaction: callback => callback({
      ...tx,
      subscriptionPaymentRefund: { create: async () => { refundInsertCount += 1; } },
    }),
  }, { paymentId: 'receipt-b', amount: '31.00', reason: 'Too much', adminId: 'admin-1' });
  assert.equal(rejected.error, 'exceeds_overpayment');
  assert.equal(rejected.refundableAmount, 30);
  assert.equal(refundInsertCount, 0);
});

test('recorded refund is audited and reduces net subscription payment progress', async () => {
  const invoice = { invoiceKey: 'refund-invoice', billedTotal: 100, total: 100, periodCount: 1 };
  const rows = [
    { id: 'receipt-a', tenantId: 'tenant-refund', amount: 70, currency: 'UGX', status: 'completed', provider: 'manual', notes: `JIBUSALES_INVOICE:${JSON.stringify(invoice)}`, paidAt: new Date('2026-10-10T00:00:00.000Z'), createdAt: new Date('2026-10-10T00:00:00.000Z'), refunds: [] },
    { id: 'receipt-b', tenantId: 'tenant-refund', amount: 60, currency: 'UGX', status: 'completed', provider: 'manual', notes: `JIBUSALES_INVOICE:${JSON.stringify(invoice)}`, paidAt: new Date('2026-10-11T00:00:00.000Z'), createdAt: new Date('2026-10-11T00:00:00.000Z'), refunds: [] },
  ];
  const tenant = { id: 'tenant-refund', paymentReminderStatus: 'paid', plan: { price: 100, billingCycle: 'monthly', currency: 'UGX' }, billingChargeMode: 'plan', createdAt: new Date('2026-10-01T00:00:00.000Z'), subscriptionStart: new Date('2026-10-01T00:00:00.000Z'), subscriptionEnd: new Date('2026-11-01T00:00:00.000Z') };
  const created = [];
  const tx = {
    subscriptionPayment: {
      findUnique: async () => rows[1],
      findMany: async () => rows,
      count: async () => rows.length,
    },
    subscriptionPaymentRefund: {
      create: async ({ data }) => { created.push(data); rows[1].refunds.push({ amount: Number(data.amount) }); return { id: 'refund-1', ...data, amount: Number(data.amount) }; },
    },
    tenant: { findUnique: async () => tenant, update: async () => tenant },
  };
  const result = await recordSubscriptionPaymentRefund({ $transaction: callback => callback(tx) }, {
    paymentId: 'receipt-b', amount: '20.00', reason: 'Excess returned by bank transfer', adminId: 'admin-1', adminEmail: 'admin@example.com',
  });
  assert.equal(result.refund.id, 'refund-1');
  assert.equal(created[0].recordedByEmail, 'admin@example.com');
  assert.equal(result.refundableAmount, 10);
  const progress = await getSubscriptionPaymentProgress(tx, tenant.id, new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(progress.progress.paidAmount, 110);
  assert.equal(progress.progress.remainingAmount, 0);
});

test('Pesapal settlement rejects a mismatched provider tracking ID', async () => {
  const payment = { id: 'pending-1', merchantReference: 'MERCHANT-1', gatewayTrackingId: 'TRACK-1', amount: { toFixed: () => '100.00' }, currency: 'UGX' };
  await assert.rejects(
    syncPesapalSubscriptionPayment({}, payment, {
      merchant_reference: 'MERCHANT-1',
      order_tracking_id: 'TRACK-OTHER',
      payment_status_description: 'COMPLETED',
      status_code: 1,
      amount: 100,
      currency: 'UGX',
    }),
    /tracking ID did not match/,
  );
});
