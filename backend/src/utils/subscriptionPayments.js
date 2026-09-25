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
    const updated = await tx.subscriptionPayment.update({
      where: { id: current.id },
      data: {
        status,
        ...(gatewayStatus?.confirmation_code ? { reference: String(gatewayStatus.confirmation_code).slice(0, 200) } : {}),
        ...(gatewayStatus?.payment_method ? { gatewayPaymentMethod: String(gatewayStatus.payment_method).slice(0, 40) } : {}),
        ...(status === 'completed' && gatewayStatus?.created_date && !Number.isNaN(new Date(gatewayStatus.created_date).getTime())
          ? { paidAt: new Date(gatewayStatus.created_date) }
          : {}),
      },
    });
    if (status === 'completed') {
      await tx.tenant.update({
        where: { id: current.tenantId },
        data: {
          billingPaymentMethod: updated.paymentMethod,
          billingPaymentReference: current.merchantReference,
          paymentReminderStatus: 'paid',
          paymentReminderSentAt: updated.paidAt,
        },
      });
    } else if (status === 'reversed') {
      const otherCompletedPayments = await tx.subscriptionPayment.count({
        where: { tenantId: current.tenantId, status: 'completed', id: { not: current.id } },
      });
      if (otherCompletedPayments === 0) {
        await tx.tenant.update({
          where: { id: current.tenantId },
          data: { paymentReminderStatus: 'due_soon' },
        });
      }
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

    const remainingCompleted = await tx.subscriptionPayment.count({
      where: { tenantId: payment.tenantId, status: 'completed' },
    });
    const tenantData = remainingCompleted > 0 ? {} : { paymentReminderStatus: 'due_soon' };
    if (Object.keys(tenantData).length) {
      const tenant = await tx.tenant.findUnique({ where: { id: payment.tenantId }, select: { billingPaymentReference: true } });
      if (tenant?.billingPaymentReference === payment.reference) {
        tenantData.billingPaymentReference = null;
        tenantData.billingPaymentMethod = null;
      }
      if (payment.paidAt) tenantData.paymentReminderSentAt = payment.paidAt;
      await tx.tenant.update({ where: { id: payment.tenantId }, data: tenantData });
    }
    return { payment: await tx.subscriptionPayment.findUnique({ where: { id: payment.id } }), remainingCompleted };
  });
}
