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
