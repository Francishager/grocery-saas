export function normalizeBillingCycle(value) {
  const normalized = String(value || 'monthly').trim().toLowerCase();
  if (normalized === 'yearly' || normalized === 'annual') return 'yearly';
  return 'monthly';
}

export function calculateDefaultSubscriptionEndDate({ subscriptionStart, billingCycle }) {
  const startDate = subscriptionStart ? new Date(subscriptionStart) : new Date();
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const endDate = new Date(startDate);
  const normalizedCycle = String(billingCycle || 'monthly').trim().toLowerCase();
  if (normalizedCycle === 'yearly' || normalizedCycle === 'annual') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  return endDate;
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
  const now = tenant.now ? new Date(tenant.now) : new Date();
  const subscriptionEnd = tenant.subscriptionEnd ? new Date(tenant.subscriptionEnd) : null;
  const trialEndsAt = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
  const isTrial = String(tenant.status || '').toLowerCase() === 'trial';
  const dueDate = isTrial && trialEndsAt && !Number.isNaN(trialEndsAt.getTime())
    ? trialEndsAt
    : subscriptionEnd && !Number.isNaN(subscriptionEnd.getTime())
    ? subscriptionEnd
    : trialEndsAt && !Number.isNaN(trialEndsAt.getTime())
      ? trialEndsAt
      : null;
  const gracePeriodDays = Number(tenant.gracePeriodDays ?? 0) || 0;
  const reminderDaysBeforeDue = Number(tenant.reminderDaysBeforeDue ?? 10) || 10;

  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return {
      isDueSoon: false,
      isGracePeriodActive: false,
      isOverdue: false,
      daysRemaining: null,
      gracePeriodEndsAt: null,
      reminderDaysBeforeDue,
      gracePeriodDays,
      dueDate: null,
    };
  }

  const diffMs = dueDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const gracePeriodEndsAt = new Date(dueDate.getTime() + (gracePeriodDays * 24 * 60 * 60 * 1000));
  const isDueSoon = daysRemaining <= reminderDaysBeforeDue && daysRemaining >= 0;
  const isGracePeriodActive = !isTrial && now > dueDate && now < gracePeriodEndsAt;
  const isOverdue = isTrial ? now >= dueDate : now >= gracePeriodEndsAt;

  return {
    isDueSoon,
    isGracePeriodActive,
    isOverdue,
    isTrial,
    isTrialExpired: isTrial && isOverdue,
    isTrialActive: isTrial && !isOverdue,
    daysRemaining,
    gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    reminderDaysBeforeDue,
    gracePeriodDays,
    dueDate: dueDate.toISOString(),
  };
}

export function calculateSubscriptionPaymentProgress(amountDue, paidAmount) {
  const amount = Math.max(0, Number(amountDue) || 0);
  const paid = Math.max(0, Number(paidAmount) || 0);
  const remaining = Math.max(0, Math.round((amount - paid) * 100) / 100);
  return {
    amountDue: amount,
    paidAmount: paid,
    remainingAmount: remaining,
    isPaid: remaining <= 0.01,
    isPartiallyPaid: paid > 0 && remaining > 0.01,
  };
}
