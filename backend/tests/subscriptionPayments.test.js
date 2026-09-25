import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSubscriptionPaymentAmount } from '../src/utils/subscriptionPayments.js';

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
