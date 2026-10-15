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
  const [aggregate, ledgerCount, receipts] = await Promise.all([
    tx.subscriptionPayment.aggregate({
      where: paymentWhere,
      _sum: { amount: true },
    }),
    tx.subscriptionPayment.count({ where: { tenantId } }),
    tx.subscriptionPayment.findMany({
      where: { tenantId, status: 'completed', paidAt: { not: null, lte: asOf } },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, amount: true, notes: true, paidAt: true, createdAt: true },
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
    group.paidAmount += Number(receipt.amount || 0);
    group.hasCurrentPayment ||= new Date(receipt.paidAt) >= periodStart;
    if (new Date(receipt.paidAt) < new Date(group.firstPaidAt)) group.firstPaidAt = receipt.paidAt;
    invoiceGroups.set(invoiceKey, group);
  }
  const groups = [...invoiceGroups.values()].sort((a, b) => new Date(a.firstPaidAt) - new Date(b.firstPaidAt));
  const openInvoice = groups.find(group => group.paidAmount < group.billedTotal - 0.01);
  const latestCurrentInvoice = groups.filter(group => group.hasCurrentPayment).at(-1);
  const trackedInvoice = openInvoice || latestCurrentInvoice;
  const invoiceSnapshot = trackedInvoice?.invoice || null;
  const periodTotal = trackedInvoice?.billedTotal || charge.total;
  const coveredByActiveTerm = tenant.subscriptionEnd && new Date(tenant.subscriptionEnd) > asOf;
  const recordedThisPeriod = Number(aggregate._sum.amount || 0) > 0;
  const trackedPaidAmount = trackedInvoice?.paidAmount ?? aggregate._sum.amount;
  const hasOpenHistoricalInvoice = Boolean(openInvoice);
  const progress = (!hasOpenHistoricalInvoice && coveredByActiveTerm && !recordedThisPeriod) || (ledgerCount === 0 && tenant.paymentReminderStatus === 'paid')
    ? calculateSubscriptionPaymentProgress(periodTotal, periodTotal)
    : calculateSubscriptionPaymentProgress(periodTotal, trackedPaidAmount);
  return { tenant, progress, invoiceSnapshot, periodStart, periodTotal, invoiceKey: trackedInvoice?.invoiceKey || null };
}

export async function refreshSubscriptionPaymentStatus(tx, tenantId, asOf = new Date()) {
  const result = await getSubscriptionPaymentProgress(tx, tenantId, asOf);
  if (!result) return null;
  const { progress } = result;
  await tx.tenant.update({
    where: { id: tenantId },
    data: {
      paymentReminderStatus: progress.isPaid ? 'paid' : 'due_soon',
      paymentReminderSentAt: asOf,
    },
  });
  return progress;
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
      const invoice = readBillingInvoice(current.notes);
      let subscriptionEnd = undefined;
      if (invoice?.periodCount) {
        const tenant = await tx.tenant.findUnique({ where: { id: current.tenantId }, select: { subscriptionEnd: true, plan: { select: { billingCycle: true } }, customBillingCycle: true } });
        const cycle = String(tenant?.customBillingCycle || tenant?.plan?.billingCycle || invoice.periodUnit || 'monthly').toLowerCase();
        const coverageStart = tenant?.subscriptionEnd && tenant.subscriptionEnd > new Date() ? tenant.subscriptionEnd : new Date();
        subscriptionEnd = addSubscriptionPeriods(coverageStart, invoice.periodCount, cycle);
        const updatedInvoice = { ...invoice, coverageStart: coverageStart.toISOString(), coverageEnd: subscriptionEnd.toISOString() };
        await tx.subscriptionPayment.update({ where: { id: current.id }, data: { notes: `JIBUSALES_INVOICE:${JSON.stringify(updatedInvoice)}` } });
      }
      await tx.tenant.update({
        where: { id: current.tenantId },
        data: {
          billingPaymentMethod: updated.paymentMethod,
          billingPaymentReference: current.merchantReference,
          ...(subscriptionEnd ? { subscriptionEnd, status: 'active' } : {}),
        },
      });
    }
    if (status === 'completed' || status === 'reversed' || status === 'failed') {
      await refreshSubscriptionPaymentStatus(tx, current.tenantId, new Date());
    }
    return updated;
  });
}

export async function cancelManualSubscriptionPayment(prisma, { paymentId, adminId, adminEmail, reason }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return { error: 'not_found' };
    if (payment.provider !== 'manual' && (payment.provider || payment.gatewayTrackingId || payment.merchantReference)) return { error: 'not_manual' };
    if (payment.status !== 'completed') return { error: 'not_completed' };

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
