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
