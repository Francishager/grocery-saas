import admin from 'firebase-admin'
import prisma from '../db.js'

let initialized = false

function getFirebaseApp() {
  if (initialized) return admin.app()
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase service account env vars not configured')
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  })
  initialized = true
  return admin.app()
}

/**
 * Send a push notification to a specific user's devices.
 * @param {string} userId - The user ID to send to
 * @param {{ title: string, body: string, data?: Record<string,string>, icon?: string, badge?: string, tag?: string }} payload
 * @returns {Promise<{ success: number, failure: number }>}
 */
export async function sendNotificationToUser(userId, payload) {
  try {
    const app = getFirebaseApp()
    const tokens = await prisma.pushToken.findMany({
      where: { userId, isActive: true },
      select: { token: true },
    })
    if (!tokens.length) return { success: 0, failure: 0 }

    const message = {
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      android: { notification: { icon: payload.icon || 'ic_notification', tag: payload.tag, channelId: 'default' } },
      apns: { payload: { aps: { badge: payload.badge ? Number(payload.badge) : undefined, sound: 'default' } } },
      webpush: {
        notification: {
          icon: payload.icon || '/logo.png',
          badge: payload.badge || '/badge.png',
          tag: payload.tag,
          requireInteraction: payload.requireInteraction || false,
        },
        fcmOptions: { link: payload.data?.url || '/' },
      },
      tokens: tokens.map((t) => t.token),
    }

    const response = await app.messaging().sendEachForMulticast(message)

    // Deactivate invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = []
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code
          if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(tokens[idx].token)
          }
        }
      })
      if (invalidTokens.length) {
        await prisma.pushToken.updateMany({
          where: { token: { in: invalidTokens } },
          data: { isActive: false },
        })
      }
    }

    return { success: response.successCount, failure: response.failureCount }
  } catch (error) {
    console.error('FCM sendNotificationToUser error:', error)
    return { success: 0, failure: 1 }
  }
}

/**
 * Send a push notification to all users in a tenant.
 * @param {string} tenantId
 * @param {{ title: string, body: string, data?: Record<string,string> }} payload
 */
export async function sendNotificationToTenant(tenantId, payload) {
  try {
    const app = getFirebaseApp()
    const tokens = await prisma.pushToken.findMany({
      where: { tenantId, isActive: true },
      select: { token: true },
    })
    if (!tokens.length) return { success: 0, failure: 0 }

    const message = {
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      android: { notification: { icon: payload.icon || 'ic_notification', tag: payload.tag, channelId: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
      webpush: {
        notification: { icon: payload.icon || '/logo.png', tag: payload.tag },
        fcmOptions: { link: payload.data?.url || '/' },
      },
      tokens: tokens.map((t) => t.token),
    }

    const response = await app.messaging().sendEachForMulticast(message)
    return { success: response.successCount, failure: response.failureCount }
  } catch (error) {
    console.error('FCM sendNotificationToTenant error:', error)
    return { success: 0, failure: 1 }
  }
}

/**
 * Send a push notification to all platform admins.
 * @param {{ title: string, body: string, data?: Record<string,string> }} payload
 */
export async function sendNotificationToPlatformAdmins(payload) {
  try {
    const app = getFirebaseApp()
    const tokens = await prisma.pushToken.findMany({
      where: { isActive: true, user: { role: { in: ['saas_admin', 'platform_admin', 'super_admin'] } } },
      select: { token: true },
    })
    if (!tokens.length) return { success: 0, failure: 0 }

    const message = {
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      webpush: {
        notification: { icon: payload.icon || '/logo.png', tag: payload.tag },
        fcmOptions: { link: payload.data?.url || '/' },
      },
      tokens: tokens.map((t) => t.token),
    }

    const response = await app.messaging().sendEachForMulticast(message)
    return { success: response.successCount, failure: response.failureCount }
  } catch (error) {
    console.error('FCM sendNotificationToPlatformAdmins error:', error)
    return { success: 0, failure: 1 }
  }
}

export default { sendNotificationToUser, sendNotificationToTenant, sendNotificationToPlatformAdmins }
