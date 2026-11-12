import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExpoPushMessages } from '../src/services/webPush.js'

test('native push messages use safe generic lock-screen text and a validated in-app route', () => {
  const [message] = buildExpoPushMessages(
    [{ token: 'ExpoPushToken[abc123]' }],
    { title: 'Private sale details', body: 'Customer paid UGX 400,000', data: { url: '/tenant/receivables', notificationId: 'notice-1' } },
  )

  assert.equal(message.to, 'ExpoPushToken[abc123]')
  assert.equal(message.title, 'JibuSales notification')
  assert.equal(message.body, 'Open JibuSales to view your update.')
  assert.deepEqual(message.data, { url: '/tenant/receivables', notificationId: 'notice-1', type: 'info' })
})

test('native push payloads never carry an external URL as an app navigation target', () => {
  const [message] = buildExpoPushMessages([{ token: 'ExponentPushToken[abc123]' }], {
    data: { url: 'https://example.com/phishing', notificationId: 'notice-2' },
  })

  assert.equal(message.data.url, '/tenant/dashboard')
})
