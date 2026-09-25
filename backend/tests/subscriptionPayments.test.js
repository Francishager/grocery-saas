import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSubscriptionPaymentAmount } from '../src/utils/subscriptionPayments.js';
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
