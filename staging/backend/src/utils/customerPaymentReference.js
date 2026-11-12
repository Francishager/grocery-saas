import { randomUUID } from 'node:crypto'

function isInternalPaymentKey(value, payment = {}) {
  const reference = String(value || '').trim()
  return !reference || reference === payment.id || reference === payment.idempotencyKey ||
    /^CP-customer-payment-/i.test(reference) || /^customer-payment-/i.test(reference)
}

function conciseReference(value) {
  const reference = String(value || '').trim()
  return reference.length > 40 ? `${reference.slice(0, 36)}...` : reference
}

export function customerPaymentDisplayReference(payment = {}) {
  for (const candidate of [payment.reference, payment.transactionId]) {
    if (!isInternalPaymentKey(candidate, payment)) return conciseReference(candidate)
  }

  const date = new Date(payment.createdAt)
  const datePart = Number.isNaN(date.getTime()) ? 'UNKNOWN' : date.toISOString().slice(0, 10).replace(/-/g, '')
  const idSuffix = String(payment.id || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || randomUUID().slice(-6).toUpperCase()
  return `PAY-${datePart}-${idSuffix}`
}

export function customerPaymentReceiptReference(reference, idempotencyKey) {
  const supplied = String(reference || '').trim()
  if (supplied && !isInternalPaymentKey(supplied) && supplied.length <= 40) return supplied

  const keySuffix = String(idempotencyKey || '').replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()
  return `CP-${keySuffix || randomUUID().slice(-8).toUpperCase()}`
}
