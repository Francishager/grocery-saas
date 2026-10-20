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
  const configuredChargeMode = String(tenant.billingChargeMode || 'both').trim().toLowerCase();
  const chargeMode = ['plan', 'service', 'both'].includes(configuredChargeMode) ? configuredChargeMode : 'both';
  const serviceFee = normalizedCycle === 'yearly' ? annualServiceFee || monthlyServiceFee : monthlyServiceFee;
  const planCharge = chargeMode === 'service' ? 0 : normalizedPrice;
  const includedServiceFee = chargeMode === 'plan' ? 0 : serviceFee;
  const includedStaticIpFee = chargeMode === 'plan' ? 0 : staticIpFee;

  return {
    price: normalizedPrice,
    planCharge,
    billingCycle: normalizedCycle,
    currency: normalizedCurrency,
    chargeMode,
    hasCustomPricing: hasCustomPrice,
    monthlyServiceFee,
    annualServiceFee,
    staticIpFee,
    serviceFee: includedServiceFee,
    includedStaticIpFee,
    total: planCharge + includedServiceFee + includedStaticIpFee,
    isCustom: hasCustomPrice,
  };
}

export function calculateBillingReminder(tenant = {}) {
  const now = tenant.now ? new Date(tenant.now) : new Date();
  const subscriptionEnd = tenant.subscriptionEnd ? new Date(tenant.subscriptionEnd) : null;
  const trialEndsAt = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
  const trialStartedAt = tenant.trialStartedAt || tenant.subscriptionStart || tenant.createdAt ? new Date(tenant.trialStartedAt || tenant.subscriptionStart || tenant.createdAt) : null;
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
  const trialDaysTotal = isTrial && trialStartedAt && !Number.isNaN(trialStartedAt.getTime())
    ? Math.max(1, Math.ceil((dueDate.getTime() - trialStartedAt.getTime()) / (24 * 60 * 60 * 1000)))
    : null;
  const trialReminderDays = isTrial
    ? Math.min(7, Math.max(1, Number.isFinite(trialDaysTotal) ? Math.ceil(trialDaysTotal / 3) : 7), Math.max(1, reminderDaysBeforeDue))
    : null;
  const isTrialActive = isTrial && !isOverdue;
  const isTrialEndingSoon = isTrialActive && daysRemaining <= trialReminderDays;

  return {
    isDueSoon,
    isGracePeriodActive,
    isOverdue,
    isTrial,
    isTrialExpired: isTrial && isOverdue,
    isTrialActive,
    isTrialEndingSoon,
    trialDaysTotal,
    trialReminderDays,
    daysRemaining,
    gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    reminderDaysBeforeDue,
    gracePeriodDays,
    dueDate: dueDate.toISOString(),
  };
}

export function shouldSuspendForSubscriptionPayment(tenant = {}, hasOutstandingBalance = false, now = new Date()) {
  if (String(tenant.status || '').trim().toLowerCase() !== 'active' || !hasOutstandingBalance) return false;
  const reminder = calculateBillingReminder({ ...tenant, now });
  return reminder.isOverdue === true;
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

export function calculateAnnualPartialPaymentReminderWindow(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return { isInWindow: false, cycleKey: null };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isInWindow = day <= 10 || day >= lastDay - 9;
  const cycleDate = day <= 10 ? new Date(Date.UTC(year, month - 2, 1)) : new Date(Date.UTC(year, month - 1, 1));
  const cycleKey = `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, '0')}`;
  return { isInWindow, cycleKey };
}
