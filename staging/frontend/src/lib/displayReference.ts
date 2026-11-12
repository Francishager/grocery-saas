export function displayReference(reference: unknown, id?: unknown, label = 'Transaction') {
  const value = String(reference || '').trim()
  const recordId = String(id || '').trim()
  const internalKey = /^CP-customer-payment-/i.test(value) || /^customer-payment-/i.test(value) || value === recordId
  if (value && !internalKey) return value.length > 40 ? `${value.slice(0, 36)}...` : value

  const suffix = recordId.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()
  return suffix ? `${label}-${suffix}` : label
}
