import { Router } from 'express'
import prisma from '../db.js'
import { authenticateToken, loadUserPermissions, requirePermission } from '../../middleware/auth.js'
import { requireFeature } from '../../middleware/featureCheck.js'
import { isWebPushConfigured, sendNotificationToUser, sendNotificationToTenant, sendNotificationToPlatformAdmins } from '../services/webPush.js'

const router = Router()

/**
 * POST /api/push/register
 * Register or update a device token for the authenticated user.
 * Body: { subscription }
 */
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const subscription = req.body?.subscription
    if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ error: 'A valid Web Push subscription is required' })
    }
    let endpoint
    try { endpoint = new URL(subscription.endpoint) } catch { return res.status(400).json({ error: 'Invalid push endpoint' }) }
    const approvedHost = ['.googleapis.com', '.mozilla.com', '.apple.com', '.windows.com'].some(suffix => endpoint.hostname.endsWith(suffix))
    if (endpoint.protocol !== 'https:' || !approvedHost || endpoint.username || endpoint.password) {
      return res.status(400).json({ error: 'Unsupported push service endpoint' })
    }
    if (!isWebPushConfigured()) {
      return res.status(503).json({ code: 'PUSH_NOT_CONFIGURED', error: 'Push delivery is not configured on the server.' })
    }

    const userId = req.user.id
    const userTenantId = req.user.tenantId || req.user.tenant_id || null

    const token = JSON.stringify({ endpoint: endpoint.toString(), keys: subscription.keys })
    if (token.length > 8192) return res.status(400).json({ error: 'Push subscription is too large' })
    const activeSubscriptions = await prisma.pushToken.findMany({ where: { platform: 'web', isActive: true, token: { contains: endpoint.toString() } }, select: { token: true } })
    const staleEndpointTokens = activeSubscriptions.filter(row => {
      try { return JSON.parse(row.token)?.endpoint === endpoint.toString() && row.token !== token } catch { return false }
    }).map(row => row.token)
    if (staleEndpointTokens.length) {
      await prisma.pushToken.updateMany({ where: { token: { in: staleEndpointTokens } }, data: { isActive: false } })
    }
    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      update: { userId, tenantId: userTenantId, platform: 'web', isActive: true },
      create: { token, userId, tenantId: userTenantId, platform: 'web', isActive: true },
    })

    res.json({ message: 'Token registered', registered: Boolean(pushToken.isActive) })
  } catch (error) {
    console.error('Register push token error:', error)
    res.status(500).json({ error: 'Failed to register token' })
  }
})

/**
 * DELETE /api/push/unregister
 * Unregister a device token.
 * Body: { endpoint }
 */
router.delete('/unregister', authenticateToken, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint
    if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Subscription endpoint is required' })
    const subscriptions = await prisma.pushToken.findMany({ where: { userId: req.user.id, platform: 'web', isActive: true }, select: { token: true } })
    const matchingTokens = subscriptions.filter(row => {
      try { return JSON.parse(row.token)?.endpoint === endpoint } catch { return false }
    }).map(row => row.token)
    if (matchingTokens.length) {
      await prisma.pushToken.updateMany({ where: { token: { in: matchingTokens }, userId: req.user.id }, data: { isActive: false } })
    }

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
router.post('/send', authenticateToken, loadUserPermissions, requirePermission('canCreateCommunication'), requireFeature('communication'), async (req, res) => {
  try {
    const { userId, title, body, data } = req.body
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, and body are required' })
    }

    const tenantId = req.user.tenantId || req.user.tenant_id
    if (!tenantId) return res.status(403).json({ error: 'Tenant access required' })
    const recipient = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } })
    if (!recipient) return res.status(404).json({ error: 'Recipient not found in this business' })

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
router.post('/send-tenant', authenticateToken, loadUserPermissions, async (req, res) => {
  try {
    const { tenantId, title, body, data } = req.body
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' })
    }

    const ownTenantId = req.user.tenantId || req.user.tenant_id
    const isPlatformAdmin = ['saas_admin', 'platform_admin', 'super_admin'].includes(req.user.role)
    if (!isPlatformAdmin && (!req.userPermissions?.canCreateCommunication || !ownTenantId)) {
      return res.status(403).json({ error: 'Communication permission is required' })
    }
    const targetTenantId = isPlatformAdmin ? (tenantId || ownTenantId) : ownTenantId
    if (!targetTenantId || (!isPlatformAdmin && tenantId && tenantId !== ownTenantId)) {
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
      return res.status(403).json({ error: 'JibuSales Admin access required' })
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
 * Get registered Web Push devices for the authenticated user.
 */
router.get('/tokens', authenticateToken, async (req, res) => {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: req.user.id, platform: 'web' },
      select: { id: true, platform: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ tokens })
  } catch (error) {
    console.error('Get push tokens error:', error)
    res.status(500).json({ error: 'Failed to fetch tokens' })
  }
})

export default router
