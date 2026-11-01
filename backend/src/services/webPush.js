import webpush from 'web-push'
import prisma from '../db.js'

let configured = false

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) throw new Error('Web Push VAPID settings are not configured')
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
  }
  return publicKey
}

export function isWebPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

function parseSubscription(token) {
  try {
    const subscription = JSON.parse(token)
    const endpoint = new URL(subscription.endpoint)
    if (endpoint.protocol !== 'https:' || !subscription.keys?.p256dh || !subscription.keys?.auth) return null
    return subscription
  } catch {
    return null
  }
}

export function buildWebPushPayload(payload = {}) {
  const data = payload.data || {}
  const route = data.link || data.url
  const safeRoute = typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') ? route.slice(0, 500) : '/tenant/dashboard'
  return {
    title: 'JibuSales notification',
    body: 'Open JibuSales to view your update.',
    icon: '/img/jibusales_logo.png',
    badge: '/img/jibusales_logo.png',
    tag: String(payload.tag || data.notificationId || 'jibusales-update').slice(0, 100),
    data: {
      url: safeRoute,
      notificationId: typeof data.notificationId === 'string' ? data.notificationId.slice(0, 100) : '',
      type: typeof data.type === 'string' ? data.type.slice(0, 40) : 'info',
    },
  }
}

export function buildExpoPushMessages(tokens, payload) {
  const notification = buildWebPushPayload(payload)
  return tokens.map(row => ({
    to: row.token,
    title: notification.title,
    body: notification.body,
    sound: 'default',
    priority: 'default',
    channelId: 'default',
    data: notification.data,
  }))
}

async function sendWebPushTokens(tokens, notification) {
  configureWebPush()
  const serialized = JSON.stringify(notification)
  let success = 0
  let failure = 0

  // Process every subscription while keeping provider requests from spiking at once.
  for (let offset = 0; offset < tokens.length; offset += 20) {
    const batch = tokens.slice(offset, offset + 20)
    const outcomes = await Promise.all(batch.map(async row => {
      const subscription = parseSubscription(row.token)
      if (!subscription) {
        await prisma.pushToken.updateMany({ where: { token: row.token }, data: { isActive: false } })
        return false
      }
      try {
        await webpush.sendNotification(subscription, serialized, { TTL: 3600, urgency: 'normal' })
        return true
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.pushToken.updateMany({ where: { token: row.token }, data: { isActive: false } })
        } else {
          console.error('Web Push delivery failed:', error.statusCode || error.message)
        }
        return false
      }
    }))
    success += outcomes.filter(Boolean).length
    failure += outcomes.length - outcomes.filter(Boolean).length
  }
  return { success, failure }
}

async function sendExpoPushTokens(tokens, payload) {
  const messages = buildExpoPushMessages(tokens, payload)
  let success = 0
  let failure = 0
  for (let offset = 0; offset < messages.length; offset += 100) {
    const batch = messages.slice(offset, offset + 100)
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(8000),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !Array.isArray(result?.data)) {
        failure += batch.length
        console.error('Expo Push delivery failed:', response.status)
        continue
      }
      for (let index = 0; index < result.data.length; index += 1) {
        const ticket = result.data[index]
        if (ticket?.status === 'ok') {
          success += 1
        } else {
          failure += 1
          if (ticket?.details?.error === 'DeviceNotRegistered') {
            await prisma.pushToken.updateMany({ where: { token: batch[index]?.to }, data: { isActive: false } })
          }
          console.error('Expo Push ticket failed:', ticket?.details?.error || ticket?.message || 'Unknown delivery error')
        }
      }
    } catch (error) {
      failure += batch.length
      console.error('Expo Push request failed:', error.message)
    }
  }
  return { success, failure }
}

async function sendToTokens(tokens, payload) {
  if (!tokens.length) return { success: 0, failure: 0 }
  const webTokens = tokens.filter(row => row.platform === 'web')
  const expoTokens = tokens.filter(row => ['android', 'ios'].includes(row.platform))
  const notification = buildWebPushPayload(payload)
  const results = await Promise.all([
    webTokens.length
      ? sendWebPushTokens(webTokens, notification).catch(error => {
        console.error('Web Push configuration failed:', error.message)
        return { success: 0, failure: webTokens.length }
      })
      : Promise.resolve({ success: 0, failure: 0 }),
    expoTokens.length
      ? sendExpoPushTokens(expoTokens, payload).catch(error => {
        console.error('Expo Push delivery failed:', error.message)
        return { success: 0, failure: expoTokens.length }
      })
      : Promise.resolve({ success: 0, failure: 0 }),
  ])
  return results.reduce((total, result) => ({ success: total.success + result.success, failure: total.failure + result.failure }), { success: 0, failure: 0 })
}

export async function sendNotificationToUser(userId, payload) {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId, isActive: true, platform: { in: ['web', 'android', 'ios'] } }, select: { token: true, platform: true } })
    return await sendToTokens(tokens, payload)
  } catch (error) {
    console.error('Web Push send-to-user error:', error.message)
    return { success: 0, failure: 1 }
  }
}

export async function sendNotificationToTenant(tenantId, payload) {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { tenantId, isActive: true, platform: { in: ['web', 'android', 'ios'] } }, select: { token: true, platform: true } })
    return await sendToTokens(tokens, payload)
  } catch (error) {
    console.error('Web Push send-to-tenant error:', error.message)
    return { success: 0, failure: 1 }
  }
}

export async function sendNotificationToPlatformAdmins(payload) {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { isActive: true, platform: { in: ['web', 'android', 'ios'] }, user: { role: { in: ['saas_admin', 'platform_admin', 'super_admin'] } } },
      select: { token: true, platform: true },
    })
    return await sendToTokens(tokens, payload)
  } catch (error) {
    console.error('Web Push send-to-platform error:', error.message)
    return { success: 0, failure: 1 }
  }
}

export default { sendNotificationToUser, sendNotificationToTenant, sendNotificationToPlatformAdmins }
