import { Router } from 'express'
import prisma from '../src/db.js'
import { authenticateToken, requireAnyPermission, requireTenant } from '../middleware/auth.js'
import { requireAnyFeature } from '../middleware/featureCheck.js'

const router = Router()
const plannerStorageId = (userId) => `planner_data_${userId}`
const requirePlannerPermission = (permission, legacy = 'canViewRental') => (req, res, next) => {
  const permissions = req.tenantFeatures?.has('rentals') ? [permission, 'canManagePlanner', legacy] : [permission, 'canManagePlanner']
  return requireAnyPermission(permissions)(req, res, next)
}

router.get('/planner', authenticateToken, requireTenant, requireAnyFeature(['planner', 'rentals']), requirePlannerPermission('canViewPlanner'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id || null
    const notes = await prisma.stickyNote.findMany({ where: { OR: [{ tenantId }, { id: plannerStorageId(req.user.id), userId: req.user.id }] }, select: { id: true, userId: true, tenantId: true, lines: true, user: { select: { fname: true, lname: true } } } })
    const items = notes.flatMap(note => {
      const storedItems = note.lines && !Array.isArray(note.lines) && Array.isArray(note.lines.items) ? note.lines.items : []
      const isOwner = note.userId === req.user.id
      const ownerName = [note.user?.fname, note.user?.lname].filter(Boolean).join(' ') || 'Team member'
      return storedItems.filter(item => isOwner || item.visibility === 'workspace' || (Array.isArray(item.sharedWith) && item.sharedWith.some(share => share.userId === req.user.id)))
        .map(({ reminderDeliveredFor, sharedWith = [], ...item }) => ({
          ...item,
          ownerUserId: note.userId,
          ownerName,
          isOwner,
          sharedRole: isOwner ? 'owner' : sharedWith.find(share => share.userId === req.user.id)?.role || 'viewer',
          visibility: item.visibility === 'workspace' ? 'workspace' : 'restricted',
          ...(isOwner ? { sharedWith } : {}),
        }))
    })
    res.json({ items })
  } catch (error) {
    console.error('Get planner entries error:', error)
    res.status(500).json({ error: 'Failed to load planner entries.' })
  }
})

router.put('/planner', authenticateToken, requireTenant, requireAnyFeature(['planner', 'rentals']), requirePlannerPermission('canManagePlanner'), async (req, res) => {
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
    const id = plannerStorageId(req.user.id)
    const existing = await prisma.stickyNote.findUnique({ where: { id }, select: { id: true, userId: true, lines: true } })
    if (existing && existing.userId !== req.user.id) return res.status(409).json({ error: 'Planner storage is unavailable.' })
    const previousItems = Array.isArray(existing?.lines?.items) ? existing.lines.items : []
    const previousById = new Map(previousItems.map((item) => [String(item.id), item]))
    const items = req.body.items.map((item) => {
      const kind = String(item?.kind || '')
      const title = String(item?.title || '').trim()
      if (!allowedKinds.has(kind) || !title || title.length > 160) throw new Error('Each planner entry needs a valid type and a title up to 160 characters.')
      const reminderAt = validDate(item.reminderAt)
      const previous = previousById.get(String(item.id || ''))
      return {
        id: String(item.id || '').slice(0, 100) || `planner_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        kind,
        title,
        details: String(item.details || '').slice(0, 5000),
        startAt: validDate(item.startAt),
        endAt: validDate(item.endAt),
        dueAt: validDate(item.dueAt),
        reminderAt,
        ...(previous?.reminderAt === reminderAt && previous?.reminderDeliveredFor === reminderAt ? { reminderDeliveredFor: reminderAt } : {}),
        goalId: item.goalId ? String(item.goalId).slice(0, 100) : null,
        priority: allowedPriorities.has(item.priority) ? item.priority : 'normal',
        color: allowedColors.has(item.color) ? item.color : 'yellow',
        completed: item.completed === true,
        createdAt: validDate(item.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        visibility: previous?.visibility === 'workspace' ? 'workspace' : 'restricted',
        sharedWith: Array.isArray(previous?.sharedWith) ? previous.sharedWith : [],
      }
    })

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

router.post('/planner/entry', authenticateToken, requireTenant, requireAnyFeature(['planner', 'rentals']), requirePlannerPermission('canManagePlanner'), async (req, res) => {
  try {
    const input = req.body || {}
    const kinds = new Set(['task', 'appointment', 'goal', 'note', 'habit'])
    const priorities = new Set(['low', 'normal', 'high'])
    const colors = new Set(['yellow', 'pink', 'blue', 'green', 'orange', 'purple'])
    const title = String(input.title || '').trim()
    if (!kinds.has(input.kind) || !title || title.length > 160) return res.status(400).json({ error: 'Each planner entry needs a valid type and a title up to 160 characters.' })
    const date = value => {
      if (value == null || value === '') return null
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) throw new Error('Planner dates must be valid.')
      return parsed.toISOString()
    }
    const tenantId = req.user.tenantId || req.user.tenant_id || null
    const id = plannerStorageId(req.user.id)
    const item = {
      id: String(input.id || `planner_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`).slice(0, 100),
      kind: input.kind,
      title,
      details: String(input.details || '').slice(0, 5000),
      startAt: date(input.startAt),
      endAt: date(input.endAt),
      dueAt: date(input.dueAt),
      reminderAt: date(input.reminderAt),
      goalId: input.goalId ? String(input.goalId).slice(0, 100) : null,
      priority: priorities.has(input.priority) ? input.priority : 'normal',
      color: colors.has(input.color) ? input.color : 'yellow',
      completed: input.completed === true,
      createdAt: date(input.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      visibility: 'restricted',
      sharedWith: [],
    }
    await prisma.$transaction(async tx => {
      await tx.stickyNote.upsert({ where: { id }, create: { id, userId: req.user.id, tenantId, title: '__JIBUSALES_PLANNER_DATA__', lines: { version: 1, items: [] }, color: 'yellow' }, update: {} })
      const [row] = await tx.$queryRaw`SELECT lines FROM sticky_notes WHERE id = ${id} FOR UPDATE`
      const items = Array.isArray(row?.lines?.items) ? row.lines.items : []
      if (items.some(existing => String(existing.id) === item.id)) throw Object.assign(new Error('Planner entry already exists. Refresh and try again.'), { statusCode: 409 })
      await tx.stickyNote.update({ where: { id }, data: { tenantId, lines: { version: 1, items: [...items, item] } } })
    }, { isolationLevel: 'Serializable' })
    res.status(201).json({ item: { ...item, ownerUserId: req.user.id, isOwner: true, sharedRole: 'owner', ownerName: [req.user.fname, req.user.lname].filter(Boolean).join(' ') || 'Team member' } })
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message })
    if (error instanceof RangeError || error instanceof TypeError || error.message === 'Planner dates must be valid.') return res.status(400).json({ error: error.message })
    console.error('Create planner entry error:', error)
    res.status(500).json({ error: 'Could not create planner entry.' })
  }
})

router.get('/planner/share-users', authenticateToken, requireTenant, requireAnyFeature(['planner', 'rentals']), requirePlannerPermission('canManagePlanner'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id
    const users = await prisma.user.findMany({ where: { tenantId, isActive: true, id: { not: req.user.id } }, select: { id: true, fname: true, lname: true }, orderBy: [{ fname: 'asc' }, { lname: 'asc' }] })
    res.json({ users: users.map(user => ({ id: user.id, name: [user.fname, user.lname].filter(Boolean).join(' ') || 'Team member' })) })
  } catch (error) {
    console.error('Get planner sharing users error:', error)
    res.status(500).json({ error: 'Could not load team members.' })
  }
})

router.post('/planner/:entryId/share', authenticateToken, requireTenant, requireAnyFeature(['planner', 'rentals']), requirePlannerPermission('canManagePlanner'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id
    const visibility = req.body?.visibility === 'restricted' ? 'restricted' : 'workspace'
    const shares = Array.isArray(req.body?.sharedWith) ? req.body.sharedWith : []
    if (shares.length > 100) return res.status(400).json({ error: 'Share with no more than 100 team members.' })
    const shareIds = [...new Set(shares.map(share => String(share?.userId || '').trim()).filter(Boolean))]
    const users = shareIds.length ? await prisma.user.findMany({ where: { tenantId, isActive: true, id: { in: shareIds } }, select: { id: true } }) : []
    if (users.length !== shareIds.length) return res.status(400).json({ error: 'One or more selected users are not active members of this business.' })
    const normalized = visibility === 'restricted' ? shareIds.map(userId => ({ userId, role: shares.find(share => String(share?.userId) === userId)?.role === 'editor' ? 'editor' : 'viewer' })) : []
    const id = plannerStorageId(req.user.id)
    const stored = await prisma.stickyNote.findFirst({ where: { id, userId: req.user.id } })
    if (stored?.tenantId && stored.tenantId !== tenantId) return res.status(404).json({ error: 'Planner entry not found.' })
    if (!stored) return res.status(404).json({ error: 'Planner entry not found.' })
    const sharedItem = await prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw`SELECT lines FROM sticky_notes WHERE id = ${id} FOR UPDATE`
      const items = Array.isArray(row?.lines?.items) ? row.lines.items : []
      const index = items.findIndex(item => String(item.id) === req.params.entryId)
      if (index < 0) throw Object.assign(new Error('Planner entry not found.'), { statusCode: 404 })
      const next = [...items]
      next[index] = { ...next[index], visibility, sharedWith: normalized, updatedAt: new Date().toISOString() }
      await tx.stickyNote.update({ where: { id }, data: { tenantId, lines: { version: 1, items: next } } })
      return next[index]
    }, { isolationLevel: 'Serializable' })
    res.json({ item: sharedItem })
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message })
    console.error('Share planner entry error:', error)
    res.status(500).json({ error: 'Could not update planner sharing.' })
  }
})

router.patch('/planner/:entryId', authenticateToken, requireTenant, requireAnyFeature(['planner', 'rentals']), requirePlannerPermission('canManagePlanner'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id
    const notes = await prisma.stickyNote.findMany({ where: { OR: [{ tenantId }, { id: plannerStorageId(req.user.id), userId: req.user.id }] }, select: { id: true, userId: true, tenantId: true, lines: true } })
    const note = notes.find(candidate => Array.isArray(candidate.lines?.items) && candidate.lines.items.some(item => String(item.id) === req.params.entryId))
    if (!note) return res.status(404).json({ error: 'Planner entry not found.' })
    const patch = req.body || {}
    const allowed = ['title', 'details', 'startAt', 'endAt', 'dueAt', 'reminderAt', 'goalId', 'priority', 'color', 'completed']
    const updated = await prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw`SELECT lines FROM sticky_notes WHERE id = ${note.id} FOR UPDATE`
      const items = Array.isArray(row?.lines?.items) ? row.lines.items : []
      const index = items.findIndex(item => String(item.id) === req.params.entryId)
      if (index < 0) throw Object.assign(new Error('Planner entry not found.'), { statusCode: 404 })
      const current = items[index]
      const share = (Array.isArray(current.sharedWith) ? current.sharedWith : []).find(entry => entry.userId === req.user.id)
      if (note.userId !== req.user.id && share?.role !== 'editor') throw Object.assign(new Error('This planner item is shared as view-only.'), { statusCode: 403 })
      const nextEntry = { ...current }
      for (const key of allowed) if (Object.hasOwn(patch, key)) nextEntry[key] = patch[key]
      if (typeof nextEntry.title !== 'string' || !nextEntry.title.trim() || nextEntry.title.length > 160) throw Object.assign(new Error('Planner title is required and must be 160 characters or fewer.'), { statusCode: 400 })
      if (!['task', 'appointment', 'goal', 'note', 'habit'].includes(nextEntry.kind) || !['low', 'normal', 'high'].includes(nextEntry.priority) || !['yellow', 'pink', 'blue', 'green', 'orange', 'purple'].includes(nextEntry.color) || typeof nextEntry.completed !== 'boolean') throw Object.assign(new Error('Planner entry values are invalid.'), { statusCode: 400 })
      nextEntry.title = nextEntry.title.trim()
      nextEntry.details = String(nextEntry.details || '').slice(0, 5000)
      for (const key of ['startAt', 'endAt', 'dueAt', 'reminderAt']) if (nextEntry[key]) {
        const date = new Date(nextEntry[key])
        if (Number.isNaN(date.getTime())) throw Object.assign(new Error('Planner dates must be valid.'), { statusCode: 400 })
        nextEntry[key] = date.toISOString()
      }
      nextEntry.updatedAt = new Date().toISOString()
      const next = [...items]
      next[index] = nextEntry
      await tx.stickyNote.update({ where: { id: note.id }, data: { lines: { version: 1, items: next } } })
      return { ...nextEntry, ownerUserId: note.userId, isOwner: note.userId === req.user.id, sharedRole: note.userId === req.user.id ? 'owner' : share.role }
    }, { isolationLevel: 'Serializable' })
    res.json({ item: updated })
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message })
    console.error('Update shared planner entry error:', error)
    res.status(500).json({ error: 'Could not update this planner entry.' })
  }
})

router.delete('/planner/:entryId', authenticateToken, requireTenant, requireAnyFeature(['planner', 'rentals']), requirePlannerPermission('canManagePlanner'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id || null
    const notes = await prisma.stickyNote.findMany({ where: { OR: [{ tenantId }, { id: plannerStorageId(req.user.id), userId: req.user.id }] }, select: { id: true, userId: true, tenantId: true, lines: true } })
    const note = notes.find(candidate => candidate.userId === req.user.id && candidate.id === plannerStorageId(req.user.id))
    if (!note || (note.tenantId && note.tenantId !== tenantId)) return res.status(404).json({ error: 'Planner entry not found.' })
    await prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw`SELECT lines FROM sticky_notes WHERE id = ${note.id} FOR UPDATE`
      const items = Array.isArray(row?.lines?.items) ? row.lines.items : []
      if (!items.some(item => String(item.id) === req.params.entryId)) throw Object.assign(new Error('Planner entry not found.'), { statusCode: 404 })
      const next = items.filter(item => String(item.id) !== req.params.entryId).map(item => item.goalId === req.params.entryId ? { ...item, goalId: null } : item)
      await tx.stickyNote.update({ where: { id: note.id }, data: { tenantId, lines: { version: 1, items: next } } })
    }, { isolationLevel: 'Serializable' })
    res.json({ deleted: true })
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message })
    console.error('Delete planner entry error:', error)
    res.status(500).json({ error: 'Could not delete planner entry.' })
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
