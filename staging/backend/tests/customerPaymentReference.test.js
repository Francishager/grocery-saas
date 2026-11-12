import assert from 'node:assert/strict'
import test from 'node:test'
import { customerPaymentDisplayReference, customerPaymentReceiptReference } from '../src/utils/customerPaymentReference.js'

const internalKey = 'CP-customer-payment-cmuioo3gi003ncaxfc4dwo3pa-cmuiov1vv003wcaxf5l7qmbsx-a9e7aaa8-67'

test('generated customer receipt references never expose idempotency keys', () => {
  const reference = customerPaymentReceiptReference('', internalKey)
  assert.match(reference, /^CP-[A-Z0-9]{8}$/)
  assert.doesNotMatch(reference, /customer-payment|cmuioo3gi003ncaxfc4dwo3pa/i)
})

test('legacy internal receipt references are replaced with a compact display reference', () => {
  const reference = customerPaymentDisplayReference({
    id: 'cmuioo3gi003ncaxfc4dwo3pa',
    reference: internalKey,
    idempotencyKey: internalKey,
    createdAt: '2026-10-24T10:00:00.000Z',
  })
  assert.match(reference, /^PAY-20261024-[A-Z0-9]{6}$/)
  assert.doesNotMatch(reference, /customer-payment|cmuioo3gi003ncaxfc4dwo3pa/i)
})

test('a user-entered payment reference remains readable', () => {
  assert.equal(customerPaymentReceiptReference('MOBILE-12345', 'secret-idempotency-key'), 'MOBILE-12345')
})
