import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSubscriptionCharge, calculateBillingReminder, calculateSubscriptionPaymentProgress, shouldSuspendForSubscriptionPayment, calculateAnnualPartialPaymentReminderWindow } from '../src/utils/subscriptionPricing.js';
import { addSubscriptionPeriods } from '../src/utils/subscriptionPayments.js';

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

test('calculateBillingReminder treats an expired trial as payment-due within grace period', () => {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
  const summary = calculateBillingReminder({
    trialEndsAt: trialEndsAt.toISOString(),
    gracePeriodDays: 5,
    reminderDaysBeforeDue: 10,
  });

  assert.equal(summary.isGracePeriodActive, true);
  assert.equal(summary.daysRemaining, -2);
  assert.equal(summary.dueDate !== null, true);
});

test('trial countdown ignores paid subscription end and expires without a grace period', () => {
  const now = new Date('2026-10-16T12:00:00.000Z');
  const reminder = calculateBillingReminder({
    status: 'trial',
    trialEndsAt: '2026-10-17T12:00:00.000Z',
    subscriptionEnd: '2027-10-16T12:00:00.000Z',
    gracePeriodDays: 10,
    now,
  });
  assert.equal(reminder.isTrialActive, true);
  assert.equal(reminder.daysRemaining, 1);

  const expired = calculateBillingReminder({ status: 'trial', trialEndsAt: '2026-10-16T11:59:59.000Z', gracePeriodDays: 10, now });
  assert.equal(expired.isTrialExpired, true);
  assert.equal(expired.isGracePeriodActive, false);
});

test('trial upgrade reminder window scales with configured trial length and stays quiet early', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const endingSoon = calculateBillingReminder({
    status: 'trial',
    subscriptionStart: '2026-10-01T12:00:00.000Z',
    trialEndsAt: '2026-10-15T12:00:00.000Z',
    reminderDaysBeforeDue: 10,
    now,
  });
  assert.equal(endingSoon.trialDaysTotal, 14);
  assert.equal(endingSoon.trialReminderDays, 5);
  assert.equal(endingSoon.isTrialEndingSoon, true);

  const notYet = calculateBillingReminder({
    status: 'trial',
    subscriptionStart: '2026-10-01T12:00:00.000Z',
    trialEndsAt: '2026-10-15T12:00:00.000Z',
    reminderDaysBeforeDue: 10,
    now: new Date('2026-10-09T12:00:00.000Z'),
  });
  assert.equal(notYet.daysRemaining, 6);
  assert.equal(notYet.isTrialEndingSoon, false);
});

test('unpaid active subscriptions suspend only after the configured grace period', () => {
  const tenant = {
    status: 'active',
    subscriptionEnd: '2026-10-10T12:00:00.000Z',
    gracePeriodDays: 5,
  };
  assert.equal(shouldSuspendForSubscriptionPayment(tenant, true, new Date('2026-10-10T12:00:00.000Z')), false);
  assert.equal(shouldSuspendForSubscriptionPayment(tenant, true, new Date('2026-10-14T12:00:00.000Z')), false);
  assert.equal(shouldSuspendForSubscriptionPayment(tenant, true, new Date('2026-10-15T12:00:00.000Z')), true);
  assert.equal(shouldSuspendForSubscriptionPayment(tenant, false, new Date('2026-10-15T12:00:00.000Z')), false);
});

test('subscription payment progress treats partial receipts as outstanding until fully covered', () => {
  assert.deepEqual(calculateSubscriptionPaymentProgress(100000, 40000), {
    amountDue: 100000, paidAmount: 40000, remainingAmount: 60000, isPaid: false, isPartiallyPaid: true,
  });
  assert.equal(calculateSubscriptionPaymentProgress(100000, 100000).isPaid, true);
});

test('annual partial payment reminder window spans the last ten and first ten Kampala calendar days', () => {
  assert.equal(calculateAnnualPartialPaymentReminderWindow(new Date('2026-10-22T12:00:00.000Z')).isInWindow, true);
  assert.equal(calculateAnnualPartialPaymentReminderWindow(new Date('2026-11-10T12:00:00.000Z')).isInWindow, true);
  assert.equal(calculateAnnualPartialPaymentReminderWindow(new Date('2026-11-11T12:00:00.000Z')).isInWindow, false);
  assert.equal(calculateAnnualPartialPaymentReminderWindow(new Date('2026-10-21T12:00:00.000Z')).isInWindow, false);
  assert.equal(calculateAnnualPartialPaymentReminderWindow(new Date('2026-11-10T12:00:00.000Z')).cycleKey, '2026-10');
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

test('subscription invoices include service and static-IP fees in each billed period', () => {
  const charge = resolveSubscriptionCharge({ price: 100, billingCycle: 'monthly', currency: 'UGX' }, {
    monthlyServiceFee: 15,
    staticIpFee: 5,
  });
  assert.equal(charge.total, 120);
  assert.equal(charge.chargeMode, 'both');
});

test('subscription charge mode uses only the selected per-tenant plan and service charges', () => {
  const basePlan = { price: 100, billingCycle: 'monthly', currency: 'UGX' };
  const tenant = { monthlyServiceFee: 15, staticIpFee: 5 };
  assert.deepEqual(
    ['plan', 'service', 'both'].map(billingChargeMode => resolveSubscriptionCharge(basePlan, { ...tenant, billingChargeMode }).total),
    [100, 20, 120],
  );
});

test('confirmed multi-month subscription payments extend from the current term end without date overflow', () => {
  assert.equal(addSubscriptionPeriods(new Date('2026-01-31T00:00:00.000Z'), 1, 'monthly').toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(addSubscriptionPeriods(new Date('2026-10-16T00:00:00.000Z'), 2, 'monthly').toISOString(), '2026-12-16T00:00:00.000Z');
  assert.equal(addSubscriptionPeriods(new Date('2026-02-28T00:00:00.000Z'), 1, 'yearly').toISOString(), '2027-02-28T00:00:00.000Z');
});
