import { Router } from 'express'
import prisma from '../src/db.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

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
    res.json({ notes })
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
