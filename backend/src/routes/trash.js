import { Router } from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../../middleware/auth.js';
import { TRASH_MODELS, trashScope, expireTrash, resolveTrash } from '../services/trashService.js';

const router = Router();
router.use(authenticateToken);
router.use(async (req, res, next) => {
  try {
    req.trashScope = await trashScope(req.user);
    res.set('Cache-Control', 'no-store');
    next();
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

const publicFields = { id: true, model: true, label: true, deletedBy: true, deletedAt: true, expiresAt: true };
const friendlyError = error => error.code === 'P2034' ? 'Another request changed this record. Refresh Trash and try again.'
  : error.code === 'P2002' ? 'An active record conflicts with this item. Review it before restoring.'
    : error.message || 'Unable to update Trash.';

router.get('/', async (req, res) => {
  try {
    await expireTrash();
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: 'Invalid page or limit.' });
    }
    const search = String(req.query.search || '').trim().slice(0, 200);
    const where = { ...req.trashScope, status: 'active', expiresAt: { gt: new Date() }, ...(search ? { label: { contains: search, mode: 'insensitive' } } : {}) };
    const [items, total] = await Promise.all([
      prisma.trashEntry.findMany({ where, select: publicFields, orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.trashEntry.count({ where }),
    ]);
    res.json({ items: items.map(item => ({ ...item, type: TRASH_MODELS[item.model]?.label || item.model })), total, page, limit });
  } catch (error) { res.status(error.status || 500).json({ error: friendlyError(error) }); }
});

// Bounded batches make Restore All/Delete All work beyond a single page without long transactions.
router.post('/bulk', async (req, res) => {
  try {
    const { action, cursor } = req.body || {};
    if (!['restore', 'delete'].includes(action)) return res.status(400).json({ error: 'Choose Restore or Delete.' });
    const requestedBefore = req.body?.before ? new Date(req.body.before) : new Date();
    if (!Number.isFinite(requestedBefore.getTime())) return res.status(400).json({ error: 'Invalid batch timestamp.' });
    const before = new Date(Math.min(Date.now(), requestedBefore.getTime()));
    const rows = await prisma.trashEntry.findMany({
      where: { ...req.trashScope, status: 'active', expiresAt: { gt: new Date() }, deletedAt: { lte: before }, ...(cursor ? { id: { gt: String(cursor) } } : {}) },
      select: { id: true, label: true }, orderBy: { id: 'asc' }, take: 101,
    });
    const batch = rows.slice(0, 100);
    let succeeded = 0;
    const failed = [];
    for (const row of batch) {
      try { await resolveTrash(req.trashScope, row.id, action, req.user); succeeded++; }
      catch (error) { failed.push({ id: row.id, label: row.label, error: friendlyError(error) }); }
    }
    res.json({ succeeded, failed, hasMore: rows.length > 100, cursor: batch.at(-1)?.id || null, before: before.toISOString() });
  } catch (error) { res.status(error.status || 500).json({ error: friendlyError(error) }); }
});

router.post('/:id/restore', async (req, res) => {
  try { res.json(await resolveTrash(req.trashScope, req.params.id, 'restore', req.user)); }
  catch (error) { res.status(error.status || error.statusCode || (error.code ? 409 : 500)).json({ error: friendlyError(error) }); }
});
router.delete('/:id', async (req, res) => {
  try { res.json(await resolveTrash(req.trashScope, req.params.id, 'delete', req.user)); }
  catch (error) { res.status(error.status || error.statusCode || (error.code ? 409 : 500)).json({ error: friendlyError(error) }); }
});
export default router;
