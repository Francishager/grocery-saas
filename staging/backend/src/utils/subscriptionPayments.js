import { calculateSubscriptionPaymentProgress, resolveSubscriptionCharge } from './subscriptionPricing.js';

export function normalizeSubscriptionPaymentAmount(value) {
  const amount = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(amount)) {
    throw new Error('Enter a valid payment amount with up to 2 decimal places');
  }

  const [whole, fraction = ''] = amount.split('.');
  if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) <= 0n) {
    throw new Error('Payment amount must be greater than zero');
  }
  return BigInt(whole).toString() + '.' + fraction.padEnd(2, '0');
}

export function addSubscriptionPeriods(dateValue, count, billingCycle = 'monthly') {
  const date = new Date(dateValue || Date.now());
  const periods = Math.max(1, Math.trunc(Number(count) || 1));
  const years = String(billingCycle).toLowerCase() === 'yearly' ? periods : 0;
  const months = years ? 0 : periods;
  const originalDay = date.getUTCDate();
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + years + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(targetYear, normalizedMonth, 1);
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date;
}

function readBillingInvoice(notes) {
  if (!String(notes || '').startsWith('JIBUSALES_INVOICE:')) return null;
  try { return JSON.parse(String(notes).slice('JIBUSALES_INVOICE:'.length)); } catch { return null; }
}

function isServiceOnlyInvoice(invoice) {
  const lineItems = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  return lineItems.length > 0 && lineItems.every(item => /service|static\s*ip/i.test(String(item.description || '')));
}

export async function getSubscriptionPaymentProgress(tx, tenantId, asOf = new Date()) {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: true },
  });
  if (!tenant) return null;

  const cycleMonths = String(tenant.customBillingCycle || tenant.plan?.billingCycle || 'monthly').toLowerCase() === 'yearly' ? 12 : 1;
  const subscriptionBoundary = tenant.subscriptionEnd || null;
  let periodStart = tenant.subscriptionStart || tenant.createdAt;
  if (subscriptionBoundary) {
    const dueDate = new Date(subscriptionBoundary);
    const day = dueDate.getUTCDate();
    const start = new Date(dueDate);
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - cycleMonths);
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, lastDay));
    periodStart = start;
  }
  const paymentWhere = {
    tenantId,
    status: 'completed',
    paidAt: { not: null, gte: periodStart, lte: asOf },
  };
  const [ledgerCount, receipts] = await Promise.all([
    tx.subscriptionPayment.count({ where: { tenantId } }),
    tx.subscriptionPayment.findMany({
      where: { tenantId, status: 'completed', paidAt: { not: null, lte: asOf } },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, amount: true, notes: true, paidAt: true, createdAt: true, refunds: { select: { amount: true } } },
    }),
  ]);
  const charge = resolveSubscriptionCharge(tenant.plan || {}, tenant);
  const invoiceGroups = new Map();
  for (const receipt of receipts) {
    const invoice = readBillingInvoice(receipt.notes);
    const billedTotal = Number(invoice?.billedTotal ?? invoice?.total);
    if (!invoice || !Number.isFinite(billedTotal) || billedTotal <= 0) continue;
    const invoiceKey = String(invoice.invoiceKey || `legacy-${invoice.issuedAt || receipt.id}`);
    const group = invoiceGroups.get(invoiceKey) || {
      invoiceKey,
      invoice,
      billedTotal,
      paidAmount: Math.max(0, Number(invoice.priorPaidAmount) || 0),
      hasCurrentPayment: false,
      firstPaidAt: receipt.paidAt,
    };
    group.paidAmount += Math.max(0, Number(receipt.amount || 0) - (receipt.refunds || []).reduce((sum, refund) => sum + Number(refund.amount || 0), 0));
    group.hasCurrentPayment ||= new Date(receipt.paidAt) >= periodStart;
    if (new Date(receipt.paidAt) < new Date(group.firstPaidAt)) group.firstPaidAt = receipt.paidAt;
    invoiceGroups.set(invoiceKey, group);
  }
  const groups = [...invoiceGroups.values()].sort((a, b) => new Date(a.firstPaidAt) - new Date(b.firstPaidAt));
  const isServiceOnlyOverride = charge.chargeMode === 'service' && charge.hasCustomPricing;
  const openInvoices = groups.filter(group => group.paidAmount < group.billedTotal - 0.01);
  const openPlanInvoice = openInvoices.find(group => !isServiceOnlyInvoice(group.invoice));
  const latestCurrentPlanInvoice = groups.filter(group => group.hasCurrentPayment && !isServiceOnlyInvoice(group.invoice)).at(-1);
  const openInvoice = openInvoices[0];
  const latestCurrentInvoice = groups.filter(group => group.hasCurrentPayment).at(-1);
  const trackedInvoice = openPlanInvoice || (isServiceOnlyOverride ? latestCurrentPlanInvoice : openInvoice || latestCurrentInvoice);
  const invoiceSnapshot = trackedInvoice?.invoice || null;
  const legacyBalanceTotal = charge.chargeMode === 'service' ? charge.price : charge.total;
  const periodTotal = trackedInvoice?.billedTotal || legacyBalanceTotal;
  const coveredByActiveTerm = tenant.subscriptionEnd && new Date(tenant.subscriptionEnd) > asOf;
  const recordedThisPeriod = receipts.some(receipt => new Date(receipt.paidAt) >= periodStart && Number(receipt.amount || 0) > 0);
  const legacyReceiptsThisPeriod = receipts
    .filter(receipt => new Date(receipt.paidAt) >= periodStart && !readBillingInvoice(receipt.notes))
    .reduce((sum, receipt) => sum + Math.max(0, Number(receipt.amount || 0) - (receipt.refunds || []).reduce((refundSum, refund) => refundSum + Number(refund.amount || 0), 0)), 0);
  const netReceiptsThisPeriod = receipts
    .filter(receipt => new Date(receipt.paidAt) >= periodStart)
    .reduce((sum, receipt) => sum + Math.max(0, Number(receipt.amount || 0) - (receipt.refunds || []).reduce((refundSum, refund) => refundSum + Number(refund.amount || 0), 0)), 0);
  const trackedPaidAmount = trackedInvoice?.paidAmount ?? (isServiceOnlyOverride ? legacyReceiptsThisPeriod : netReceiptsThisPeriod);
  const hasOpenHistoricalInvoice = openInvoices.length > 0;
  const canAssumeOverridePaid = !charge.hasCustomPricing;
  const progress = (!hasOpenHistoricalInvoice && coveredByActiveTerm && !recordedThisPeriod && canAssumeOverridePaid) || (ledgerCount === 0 && tenant.paymentReminderStatus === 'paid' && canAssumeOverridePaid)
    ? calculateSubscriptionPaymentProgress(periodTotal, periodTotal)
    : calculateSubscriptionPaymentProgress(periodTotal, trackedPaidAmount);
  const hasOutstandingBalance = !progress.isPaid && progress.remainingAmount > 0.01;
  return { tenant, progress, hasOutstandingBalance, invoiceSnapshot, periodStart, periodTotal, invoiceKey: trackedInvoice?.invoiceKey || null };
}

export async function getRefundableSubscriptionPaymentAmount(tx, paymentId) {
  const payment = await tx.subscriptionPayment.findUnique({
    where: { id: paymentId },
    include: { refunds: { select: { amount: true } } },
  });
  if (!payment || payment.status !== 'completed') return { error: 'not_refundable' };
  const invoice = readBillingInvoice(payment.notes);
  const billedTotal = Number(invoice?.billedTotal ?? invoice?.total);
  const invoiceKey = invoice?.invoiceKey;
  if (!invoiceKey || !Number.isFinite(billedTotal) || billedTotal <= 0) return { error: 'invoice_unavailable' };

  const payments = await tx.subscriptionPayment.findMany({
    where: { tenantId: payment.tenantId, status: 'completed' },
    select: { id: true, amount: true, notes: true, refunds: { select: { amount: true } } },
  });
  const invoicePayments = payments.filter(item => readBillingInvoice(item.notes)?.invoiceKey === invoiceKey);
  const netPaid = invoicePayments.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0) - (item.refunds || []).reduce((refundSum, refund) => refundSum + Number(refund.amount || 0), 0)), 0);
  const paymentNet = Math.max(0, Number(payment.amount || 0) - (payment.refunds || []).reduce((sum, refund) => sum + Number(refund.amount || 0), 0));
  return { payment, invoiceKey, billedTotal, refundableAmount: Math.min(paymentNet, Math.max(0, netPaid - billedTotal)) };
}

export async function recordSubscriptionPaymentRefund(prisma, { paymentId, amount, reason, adminId, adminEmail }) {
  return prisma.$transaction(async tx => {
    const refundable = await getRefundableSubscriptionPaymentAmount(tx, paymentId);
    if (refundable.error) return refundable;
    const refundAmount = Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) return { error: 'invalid_amount' };
    if (refundAmount - refundable.refundableAmount > 0.001) {
      return { error: 'exceeds_overpayment', refundableAmount: refundable.refundableAmount };
    }
    const refund = await tx.subscriptionPaymentRefund.create({
      data: {
        paymentId,
        amount: amount,
        currency: refundable.payment.currency,
        reason,
        refundedAt: new Date(),
        recordedById: adminId || null,
        recordedByEmail: adminEmail || null,
      },
    });
    await refreshSubscriptionPaymentStatus(tx, refundable.payment.tenantId, new Date());
    return { payment: refundable.payment, refund, refundableAmount: refundable.refundableAmount - refundAmount };
  }, { isolationLevel: 'Serializable' });
}

export async function refreshSubscriptionPaymentStatus(tx, tenantId, asOf = new Date()) {
  const result = await getSubscriptionPaymentProgress(tx, tenantId, asOf);
  if (!result) return null;
  const { progress } = result;
  const isAdminSuspended = result.tenant.status === 'suspended' && result.tenant.paymentReminderStatus === 'admin_suspended';
  await tx.tenant.update({
    where: { id: tenantId },
    data: {
      paymentReminderStatus: isAdminSuspended ? 'admin_suspended' : progress.isPaid ? 'paid' : 'due_soon',
      paymentReminderSentAt: asOf,
    },
  });
  return progress;
}

export async function extendSettledSubscriptionTerm(tx, tenantId, asOf = new Date()) {
  const result = await getSubscriptionPaymentProgress(tx, tenantId, asOf);
  const invoice = result?.invoiceSnapshot;
  const periodCount = Number(invoice?.periodCount);
  if (!result?.progress.isPaid || !invoice || !Number.isInteger(periodCount) || periodCount < 1 || periodCount > 60) {
    return { ...result, termExtended: false };
  }

  if (invoice.coverageEnd) return { ...result, termExtended: false, subscriptionEnd: invoice.coverageEnd };

  const tenant = result.tenant;
  const isAdminSuspended = tenant.status === 'suspended' && tenant.paymentReminderStatus === 'admin_suspended';
  const currentEnd = tenant.subscriptionEnd ? new Date(tenant.subscriptionEnd) : null;
  const coverageStart = currentEnd && currentEnd > asOf ? currentEnd : asOf;
  const cycle = String(tenant.customBillingCycle || tenant.plan?.billingCycle || invoice.periodUnit || 'monthly').toLowerCase();
  const subscriptionEnd = addSubscriptionPeriods(coverageStart, periodCount, cycle);

  const receipts = await tx.subscriptionPayment.findMany({
    where: { tenantId, status: 'completed' },
    select: { id: true, notes: true },
  });
  for (const receipt of receipts) {
    const receiptInvoice = readBillingInvoice(receipt.notes);
    if (receiptInvoice?.invoiceKey === invoice.invoiceKey) {
      const receiptInvoiceWithCoverage = { ...receiptInvoice, coverageStart: coverageStart.toISOString(), coverageEnd: subscriptionEnd.toISOString() };
      await tx.subscriptionPayment.update({
        where: { id: receipt.id },
        data: { notes: `JIBUSALES_INVOICE:${JSON.stringify(receiptInvoiceWithCoverage)}` },
      });
    }
  }

  await tx.tenant.update({
    where: { id: tenantId },
    data: {
      ...(tenant.subscriptionStart ? {} : { subscriptionStart: asOf }),
      subscriptionEnd,
      ...(tenant.status === 'suspended' && !isAdminSuspended ? { status: 'active' } : {}),
      paymentReminderStatus: isAdminSuspended ? 'admin_suspended' : 'paid',
    },
  });

  return { ...result, termExtended: true, subscriptionEnd };
}

export async function syncPesapalSubscriptionPayment(prisma, payment, gatewayStatus) {
  const { normalizePesapalStatus } = await import('../services/pesapal.js');
  const gatewayMerchantReference = gatewayStatus?.merchant_reference || gatewayStatus?.merchantReference;
  if (gatewayMerchantReference && gatewayMerchantReference !== payment.merchantReference) {
    throw new Error('Pesapal merchant reference did not match this payment');
  }
  const gatewayTrackingId = gatewayStatus?.order_tracking_id || gatewayStatus?.orderTrackingId;
  if (gatewayTrackingId && gatewayTrackingId !== payment.gatewayTrackingId) {
    throw new Error('Pesapal tracking ID did not match this payment');
  }

  let status = normalizePesapalStatus(gatewayStatus);
  if (status === 'completed') {
    let amountMatches = false;
    try {
      amountMatches = normalizeSubscriptionPaymentAmount(String(gatewayStatus?.amount)) === payment.amount.toFixed(2);
    } catch {
      amountMatches = false;
    }
    const currencyMatches = String(gatewayStatus?.currency || '').toUpperCase() === String(payment.currency).toUpperCase();
    if (!amountMatches || !currencyMatches) {
      throw new Error('Pesapal payment amount or currency does not match the recorded subscription charge');
    }
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.subscriptionPayment.findUnique({ where: { id: payment.id } });
    if (!current || current.status === 'reversed' || (current.status === 'completed' && status === 'completed')) return current;
    const transitioned = await tx.subscriptionPayment.updateMany({
      where: { id: current.id, status: current.status },
      data: {
        status,
        ...(gatewayStatus?.confirmation_code ? { reference: String(gatewayStatus.confirmation_code).slice(0, 200) } : {}),
        ...(gatewayStatus?.payment_method ? { gatewayPaymentMethod: String(gatewayStatus.payment_method).slice(0, 40) } : {}),
        ...(status === 'completed'
          ? { paidAt: gatewayStatus?.created_date && !Number.isNaN(new Date(gatewayStatus.created_date).getTime()) ? new Date(gatewayStatus.created_date) : new Date() }
          : {}),
      },
    });
    if (transitioned.count !== 1) return tx.subscriptionPayment.findUnique({ where: { id: current.id } });
    const updated = await tx.subscriptionPayment.findUnique({ where: { id: current.id } });
    if (status === 'completed') {
      await tx.tenant.update({
        where: { id: current.tenantId },
        data: {
          billingPaymentMethod: updated.paymentMethod,
          billingPaymentReference: current.merchantReference,
        },
      });
      await extendSettledSubscriptionTerm(tx, current.tenantId, new Date());
    }
    if (status === 'completed' || status === 'reversed' || status === 'failed') {
      await refreshSubscriptionPaymentStatus(tx, current.tenantId, new Date());
    }
    return updated;
  });
}

export async function cancelManualSubscriptionPayment(prisma, { paymentId, adminId, adminEmail, reason }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId }, include: { refunds: { select: { id: true } } } });
    if (!payment) return { error: 'not_found' };
    if (payment.provider !== 'manual' && (payment.provider || payment.gatewayTrackingId || payment.merchantReference)) return { error: 'not_manual' };
    if (payment.status !== 'completed') return { error: 'not_completed' };
    if (payment.refunds?.length) return { error: 'has_refunds' };

    const cancelledAt = new Date();
    const update = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, provider: payment.provider, status: 'completed', gatewayTrackingId: payment.gatewayTrackingId, merchantReference: payment.merchantReference },
      data: {
        status: 'cancelled',
        cancelledAt,
        cancelledById: adminId || null,
        cancelledByEmail: adminEmail || null,
        cancellationReason: reason,
      },
    });
    if (update.count !== 1) return { error: 'already_changed' };

    const tenant = await tx.tenant.findUnique({ where: { id: payment.tenantId }, select: { billingPaymentReference: true } });
    if (tenant?.billingPaymentReference === payment.reference) {
      await tx.tenant.update({
        where: { id: payment.tenantId },
        data: { billingPaymentReference: null, billingPaymentMethod: null },
      });
    }
    const progress = await refreshSubscriptionPaymentStatus(tx, payment.tenantId, new Date());
    return { payment: await tx.subscriptionPayment.findUnique({ where: { id: payment.id } }), progress };
  });
}
