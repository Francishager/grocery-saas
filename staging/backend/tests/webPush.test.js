import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWebPushPayload } from '../src/services/webPush.js'

test('Web Push keeps sensitive notification details off the lock screen', () => {
  const payload = buildWebPushPayload({
    title: 'Sale by Alice for UGX 900,000',
    body: 'Customer Jane owes UGX 400,000',
    data: { url: '/tenant/receivables/customers/secret-id', notificationId: 'notice-1', type: 'sale', customerName: 'Jane' },
  })

  assert.equal(payload.title, 'JibuSales notification')
  assert.equal(payload.body, 'Open JibuSales to view your update.')
  assert.deepEqual(payload.data, { url: '/tenant/receivables/customers/secret-id', notificationId: 'notice-1', type: 'sale' })
})

test('Web Push rejects external notification click URLs', () => {
  assert.equal(buildWebPushPayload({ data: { url: 'https://attacker.example' } }).data.url, '/tenant/dashboard')
  assert.equal(buildWebPushPayload({ data: { url: '//attacker.example' } }).data.url, '/tenant/dashboard')
})
