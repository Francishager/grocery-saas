import { Router } from 'express'
import prisma from '../src/db.js'
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js'
import { requireFeature } from '../middleware/featureCheck.js'

const router = Router()
const plannerStorageId = (userId) => `planner_data_${userId}`

router.get('/planner', authenticateToken, requireTenant, requirePermission('canViewRental'), requireFeature('rentals'), async (req, res) => {
  try {
    const stored = await prisma.stickyNote.findFirst({ where: { id: plannerStorageId(req.user.id), userId: req.user.id } })
    const items = stored?.lines && !Array.isArray(stored.lines) && Array.isArray(stored.lines.items) ? stored.lines.items : []
    res.json({ items })
  } catch (error) {
    console.error('Get planner entries error:', error)
    res.status(500).json({ error: 'Failed to load planner entries.' })
  }
})

router.put('/planner', authenticateToken, requireTenant, requirePermission('canViewRental'), requireFeature('rentals'), async (req, res) => {
  try {
    if (!Array.isArray(req.body?.items) || req.body.items.length > 500) return res.status(400).json({ error: 'Planner must contain no more than 500 entries.' })
    const allowedKinds = new Set(['task', 'appointment', 'goal', 'note', 'habit'])
    const allowedPriorities = new Set(['low', 'normal', 'high'])
    const allowedColors = new Set(['yellow', 'pink', 'blue', 'green', 'orange', 'purple'])
    const validDate = (value) => {
      if (value == null || value === '') return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) throw new Error('Planner dates must be valid date values.')
      return date.toISOString()
    }
    const items = req.body.items.map((item) => {
      const kind = String(item?.kind || '')
      const title = String(item?.title || '').trim()
      if (!allowedKinds.has(kind) || !title || title.length > 160) throw new Error('Each planner entry needs a valid type and a title up to 160 characters.')
      return {
        id: String(item.id || '').slice(0, 100) || `planner_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        kind,
        title,
        details: String(item.details || '').slice(0, 5000),
        startAt: validDate(item.startAt),
        endAt: validDate(item.endAt),
        dueAt: validDate(item.dueAt),
        reminderAt: validDate(item.reminderAt),
        goalId: item.goalId ? String(item.goalId).slice(0, 100) : null,
        priority: allowedPriorities.has(item.priority) ? item.priority : 'normal',
        color: allowedColors.has(item.color) ? item.color : 'yellow',
        completed: item.completed === true,
        createdAt: validDate(item.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })

    const id = plannerStorageId(req.user.id)
    const existing = await prisma.stickyNote.findUnique({ where: { id }, select: { id: true, userId: true } })
    if (existing && existing.userId !== req.user.id) return res.status(409).json({ error: 'Planner storage is unavailable.' })
    await prisma.stickyNote.upsert({
      where: { id },
      create: { id, userId: req.user.id, tenantId: req.user.tenantId || req.user.tenant_id || null, title: '__JIBUSALES_PLANNER_DATA__', lines: { version: 1, items }, color: 'yellow' },
      update: { tenantId: req.user.tenantId || req.user.tenant_id || null, lines: { version: 1, items } },
    })
    res.json({ items })
  } catch (error) {
    if (error?.message?.startsWith('Each planner') || error?.message?.startsWith('Planner dates')) return res.status(400).json({ error: error.message })
    console.error('Save planner entries error:', error)
    res.status(500).json({ error: 'Failed to save planner entries.' })
  }
})

/**
 * GET /api/widgets/sticky-notes
 * Get all sticky notes for the authenticated user
 */
router.get('/sticky-notes', authenticateToken, async (req, res) => {
  try {
    const notes = await prisma.stickyNote.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ notes: notes.filter(note => note.id !== plannerStorageId(req.user.id)) })
  } catch (error) {
    console.error('Get sticky notes error:', error)
    res.status(500).json({ error: 'Failed to fetch sticky notes' })
  }
})

/**
 * POST /api/widgets/sticky-notes
 * Create a new sticky note
 * Body: { title?, lines?, color?, pinned? }
 */
router.post('/sticky-notes', authenticateToken, async (req, res) => {
  try {
    const { id, title, lines, color, pinned } = req.body
    const tenantId = req.user.tenantId || req.user.tenant_id || null

    const note = await prisma.stickyNote.create({
      data: {
        ...(id && { id }),
        userId: req.user.id,
        tenantId,
        title: title || '',
        lines: lines || [],
        color: color || 'yellow',
        pinned: pinned || false,
      },
    })
    res.json({ note })
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Note already exists' })
    }
    console.error('Create sticky note error:', error)
    res.status(500).json({ error: 'Failed to create sticky note' })
  }
})

/**
 * PUT /api/widgets/sticky-notes/:id
 * Update a sticky note
 * Body: { title?, lines?, color?, pinned? }
 */
router.put('/sticky-notes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { title, lines, color, pinned } = req.body

    // Verify ownership
    const existing = await prisma.stickyNote.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: 'Note not found' })
    }

    const note = await prisma.stickyNote.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(lines !== undefined && { lines }),
        ...(color !== undefined && { color }),
        ...(pinned !== undefined && { pinned }),
      },
    })
    res.json({ note })
  } catch (error) {
    console.error('Update sticky note error:', error)
    res.status(500).json({ error: 'Failed to update sticky note' })
  }
})

/**
 * DELETE /api/widgets/sticky-notes/:id
 * Delete a sticky note
 */
router.delete('/sticky-notes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.stickyNote.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: 'Note not found' })
    }

    await prisma.stickyNote.delete({ where: { id } })
    res.json({ message: 'Note deleted' })
  } catch (error) {
    console.error('Delete sticky note error:', error)
    res.status(500).json({ error: 'Failed to delete sticky note' })
  }
})

/**
 * GET /api/widgets/calculator-history
 * Get calculator history for the authenticated user
 */
router.get('/calculator-history', authenticateToken, async (req, res) => {
  try {
    const record = await prisma.calculatorHistory.findUnique({
      where: { userId: req.user.id },
    })
    res.json({ history: record?.history || [] })
  } catch (error) {
    console.error('Get calculator history error:', error)
    res.status(500).json({ error: 'Failed to fetch calculator history' })
  }
})

/**
 * PUT /api/widgets/calculator-history
 * Upsert calculator history
 * Body: { history: [{ expression, result, timestamp }] }
 */
router.put('/calculator-history', authenticateToken, async (req, res) => {
  try {
    const { history } = req.body
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: 'history must be an array' })
    }

    const tenantId = req.user.tenantId || req.user.tenant_id || null

    const record = await prisma.calculatorHistory.upsert({
      where: { userId: req.user.id },
      update: { history },
      create: {
        userId: req.user.id,
        tenantId,
        history,
      },
    })
    res.json({ history: record.history })
  } catch (error) {
    console.error('Update calculator history error:', error)
    res.status(500).json({ error: 'Failed to update calculator history' })
  }
})

export default router
