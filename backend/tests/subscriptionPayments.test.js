import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelManualSubscriptionPayment, normalizeSubscriptionPaymentAmount, syncPesapalSubscriptionPayment } from '../src/utils/subscriptionPayments.js';
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
      count: async () => 1,
    },
    tenant: {
      findUnique: async () => ({ billingPaymentReference: 'NEWER-RECEIPT' }),
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
  assert.equal(tenantUpdate, undefined);
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
