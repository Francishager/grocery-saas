import { Router } from 'express'
import prisma from '../db.js'
import { authenticateToken } from '../../middleware/auth.js'
import { sendNotificationToUser, sendNotificationToTenant, sendNotificationToPlatformAdmins } from '../services/fcm.js'

const router = Router()

/**
 * POST /api/push/register
 * Register or update a device token for the authenticated user.
 * Body: { token, platform?, tenantId? }
 */
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const { token, platform = 'web', tenantId } = req.body
    if (!token) return res.status(400).json({ error: 'Token is required' })

    const userId = req.user.id
    const userTenantId = tenantId || req.user.tenantId || req.user.tenant_id || null

    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      update: { userId, tenantId: userTenantId, platform, isActive: true },
      create: { token, userId, tenantId: userTenantId, platform, isActive: true },
    })

    // Push all unread notifications to this user's devices (screen lock / background)
    const unreadNotifs = await prisma.notification.findMany({
      where: {
        OR: [{ userId }, { userId: null, tenantId: userTenantId }],
        isRead: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    for (const n of unreadNotifs) {
      sendNotificationToUser(userId, {
        title: n.title,
        body: n.message,
        data: { url: '/notifications', notificationId: n.id },
      }).catch(() => {})
    }

    res.json({ message: 'Token registered', pushToken, unreadPushed: unreadNotifs.length })
  } catch (error) {
    console.error('Register push token error:', error)
    res.status(500).json({ error: 'Failed to register token' })
  }
})

/**
 * DELETE /api/push/unregister
 * Unregister a device token.
 * Body: { token }
 */
router.delete('/unregister', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Token is required' })

    await prisma.pushToken.updateMany({
      where: { token, userId: req.user.id },
      data: { isActive: false },
    })

    res.json({ message: 'Token unregistered' })
  } catch (error) {
    console.error('Unregister push token error:', error)
    res.status(500).json({ error: 'Failed to unregister token' })
  }
})

/**
 * POST /api/push/send
 * Send a push notification to a specific user (admin/manager only).
 * Body: { userId, title, body, data? }
 */
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { userId, title, body, data } = req.body
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, and body are required' })
    }

    const result = await sendNotificationToUser(userId, { title, body, data })
    res.json({ message: 'Notification sent', ...result })
  } catch (error) {
    console.error('Send push notification error:', error)
    res.status(500).json({ error: 'Failed to send notification' })
  }
})

/**
 * POST /api/push/send-tenant
 * Send a push notification to all users in a tenant (owner/admin only).
 * Body: { tenantId, title, body, data? }
 */
router.post('/send-tenant', authenticateToken, async (req, res) => {
  try {
    const { tenantId, title, body, data } = req.body
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' })
    }

    const targetTenantId = tenantId || req.user.tenantId || req.user.tenant_id
    if (!targetTenantId) {
      return res.status(400).json({ error: 'tenantId is required' })
    }

    const result = await sendNotificationToTenant(targetTenantId, { title, body, data })
    res.json({ message: 'Notification sent', ...result })
  } catch (error) {
    console.error('Send tenant push notification error:', error)
    res.status(500).json({ error: 'Failed to send notification' })
  }
})

/**
 * POST /api/push/send-platform
 * Send a push notification to all platform admins (saas_admin only).
 * Body: { title, body, data? }
 */
router.post('/send-platform', authenticateToken, async (req, res) => {
  try {
    const isPlatformAdmin = ['saas_admin', 'platform_admin', 'super_admin'].includes(req.user.role)
    if (!isPlatformAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' })
    }

    const { title, body, data } = req.body
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' })
    }

    const result = await sendNotificationToPlatformAdmins({ title, body, data })
    res.json({ message: 'Notification sent', ...result })
  } catch (error) {
    console.error('Send platform push notification error:', error)
    res.status(500).json({ error: 'Failed to send notification' })
  }
})

/**
 * GET /api/push/tokens
 * Get all push tokens for the authenticated user.
 */
router.get('/tokens', authenticateToken, async (req, res) => {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: req.user.id },
      select: { id: true, token: true, platform: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ tokens })
  } catch (error) {
    console.error('Get push tokens error:', error)
    res.status(500).json({ error: 'Failed to fetch tokens' })
  }
})

export default router
