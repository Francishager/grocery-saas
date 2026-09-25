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
  const gatewayMerchantReference = gatewayStatus?.merchant_reference;
  if (gatewayMerchantReference && gatewayMerchantReference !== payment.merchantReference) {
    throw new Error('Pesapal merchant reference did not match this payment');
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
        ...(gatewayStatus?.payment_method ? { paymentMethod: String(gatewayStatus.payment_method).slice(0, 40) } : {}),
        ...(gatewayStatus?.created_date && !Number.isNaN(new Date(gatewayStatus.created_date).getTime())
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
      await tx.tenant.update({
        where: { id: current.tenantId },
        data: { paymentReminderStatus: 'due_soon' },
      });
    }
    return updated;
  });
}
