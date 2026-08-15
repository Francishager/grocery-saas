import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSubscriptionCharge, calculateBillingReminder } from '../src/utils/subscriptionPricing.js';

test('calculateBillingReminder marks billing as due soon and tracks the grace period window', () => {
  const now = new Date();
  const subscriptionEnd = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
  const summary = calculateBillingReminder({
    subscriptionEnd: subscriptionEnd.toISOString(),
    gracePeriodDays: 5,
    reminderDaysBeforeDue: 10,
  });

  assert.equal(summary.isDueSoon, true);
  assert.equal(summary.daysRemaining, 7);
  assert.equal(summary.gracePeriodEndsAt !== null, true);
  assert.equal(summary.isGracePeriodActive, false);
});

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
