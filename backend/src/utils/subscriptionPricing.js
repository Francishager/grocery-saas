export function normalizeBillingCycle(value) {
  const normalized = String(value || 'monthly').trim().toLowerCase();
  if (normalized === 'yearly' || normalized === 'annual') return 'yearly';
  return 'monthly';
}

export function resolveSubscriptionCharge(plan = {}, tenant = {}) {
  const customPriceValue = tenant.customPrice ?? tenant.priceOverride ?? tenant.subscriptionPrice ?? null;
  const customBillingCycle = tenant.customBillingCycle ?? tenant.subscriptionBillingCycle ?? null;
  const customCurrency = tenant.customCurrency ?? tenant.subscriptionCurrency ?? null;

  const hasCustomPrice = customPriceValue !== null && customPriceValue !== undefined && customPriceValue !== '';
  const parsedCustomPrice = hasCustomPrice ? Number(customPriceValue) : null;

  const normalizedPrice = Number.isFinite(parsedCustomPrice) && parsedCustomPrice >= 0
    ? parsedCustomPrice
    : Number(plan.price ?? 0);

  const normalizedCycle = normalizeBillingCycle(customBillingCycle || plan.billingCycle || 'monthly');
  const normalizedCurrency = customCurrency || plan.currency || tenant.currency || 'UGX';

  const monthlyServiceFee = Number(tenant.monthlyServiceFee ?? 0) || 0;
  const annualServiceFee = Number(tenant.annualServiceFee ?? 0) || 0;
  const staticIpFee = Number(tenant.staticIpFee ?? 0) || 0;

  return {
    price: normalizedPrice,
    billingCycle: normalizedCycle,
    currency: normalizedCurrency,
    hasCustomPricing: hasCustomPrice,
    monthlyServiceFee,
    annualServiceFee,
    staticIpFee,
    serviceFee: normalizedCycle === 'yearly' ? annualServiceFee || monthlyServiceFee : monthlyServiceFee,
    isCustom: hasCustomPrice,
  };
}

export function calculateBillingReminder(tenant = {}) {
  const subscriptionEnd = tenant.subscriptionEnd ? new Date(tenant.subscriptionEnd) : null;
  const gracePeriodDays = Number(tenant.gracePeriodDays ?? 0) || 0;
  const reminderDaysBeforeDue = Number(tenant.reminderDaysBeforeDue ?? 10) || 10;

  if (!subscriptionEnd || Number.isNaN(subscriptionEnd.getTime())) {
    return {
      isDueSoon: false,
      isGracePeriodActive: false,
      daysRemaining: null,
      gracePeriodEndsAt: null,
      reminderDaysBeforeDue,
      gracePeriodDays,
    };
  }

  const now = new Date();
  const diffMs = subscriptionEnd.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const gracePeriodEndsAt = new Date(subscriptionEnd.getTime() + (gracePeriodDays * 24 * 60 * 60 * 1000));
  const isDueSoon = daysRemaining <= reminderDaysBeforeDue && daysRemaining >= 0;
  const isGracePeriodActive = now > subscriptionEnd && now < gracePeriodEndsAt;

  return {
    isDueSoon,
    isGracePeriodActive,
    daysRemaining,
    gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    reminderDaysBeforeDue,
    gracePeriodDays,
  };
}
