import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSubscriptionCharge } from '../src/utils/subscriptionPricing.js';

test('resolveSubscriptionCharge prefers tenant override values over plan defaults', () => {
  const charge = resolveSubscriptionCharge({
    price: 49,
    billingCycle: 'monthly',
    currency: 'USD',
  }, {
    customPrice: 79,
    customBillingCycle: 'yearly',
    customCurrency: 'UGX',
  });

  assert.equal(charge.price, 79);
  assert.equal(charge.billingCycle, 'yearly');
  assert.equal(charge.currency, 'UGX');
});

test('resolveSubscriptionCharge falls back to plan values when no tenant override exists', () => {
  const charge = resolveSubscriptionCharge({
    price: 120,
    billingCycle: 'yearly',
    currency: 'USD',
  }, {
    customPrice: null,
    customBillingCycle: null,
    customCurrency: '',
  });

  assert.equal(charge.price, 120);
  assert.equal(charge.billingCycle, 'yearly');
  assert.equal(charge.currency, 'USD');
});
