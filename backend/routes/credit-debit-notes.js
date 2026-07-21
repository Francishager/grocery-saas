import express from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'

const router = express.Router()
const prisma = new PrismaClient()

const tenantIdOf = (req) => req.user.tenantId || req.user.tenant_id || req.user.business_id

// Generate sequential note number
async function generateNoteNo(prefix, model, tenantId) {
  const count = await model.count({ where: { tenantId } })
  const year = new Date().getFullYear()
  const num = String(count + 1).padStart(5, '0')
  return `${prefix}-${year}-${num}`
}

// ============================================================
// CREDIT NOTES (Customer-facing)
// ============================================================

// List credit notes
router.get('/credit-notes', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, customerId, status, search, from, to } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(customerId && { customerId }),
      ...(status && status !== 'all' && { status }),
      ...(search && {
        OR: [
          { noteNo: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && { createdAt: { lte: new Date(to + 'T23:59:59') } }),
    })

    const [notes, total] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.creditNote.count({ where }),
    ])

    res.json({
      data: notes,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    })
  } catch (error) {
    handleBranchError(res, error, 'Failed to fetch credit notes')
  }
})

// Get single credit note
router.get('/credit-notes/:id', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const note = await prisma.creditNote.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    if (!note) return res.status(404).json({ error: 'Credit note not found' })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to fetch credit note')
  }
})

// Create credit note
router.post('/credit-notes', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const scope = await resolveBranchScope(prisma, req, { source: 'body', allowOwnerAll: false })
    const { customerId, saleId, amount, reason, notes, branchId } = req.body

    if (!customerId) return res.status(400).json({ error: 'customerId is required' })
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
    if (!reason) return res.status(400).json({ error: 'reason is required' })

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    const noteNo = await generateNoteNo('CN', prisma.creditNote, tenantId)

    const note = await prisma.creditNote.create({
      data: {
        noteNo,
        tenantId,
        branchId: branchId || scope.branchId || null,
        customerId,
        saleId: saleId || null,
        amount: Number(amount),
        reason,
        notes: notes || null,
        userId: req.user.id,
        status: 'issued',
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    })

    // Update customer balance (credit note reduces receivable)
    await prisma.customer.update({
      where: { id: customerId },
      data: { balance: { decrement: Number(amount) } },
    })

    res.status(201).json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to create credit note')
  }
})

// Update credit note (only if status is 'issued')
router.put('/credit-notes/:id', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const scope = await resolveBranchScope(prisma, req, { source: 'body', allowOwnerAll: true })
    const existing = await prisma.creditNote.findFirst({ where: scopedWhere(scope, { id: req.params.id }) })
    if (!existing) return res.status(404).json({ error: 'Credit note not found' })
    if (existing.status === 'cancelled') return res.status(400).json({ error: 'Cannot edit a cancelled credit note' })

    const { amount, reason, notes } = req.body
    const updates = {}
    if (amount !== undefined && amount > 0) {
      // Adjust customer balance for the difference
      const diff = Number(amount) - existing.amount
      if (diff !== 0) {
        await prisma.customer.update({
          where: { id: existing.customerId },
          data: { balance: { decrement: diff } },
        })
      }
      updates.amount = Number(amount)
    }
    if (reason !== undefined) updates.reason = reason
    if (notes !== undefined) updates.notes = notes

    const note = await prisma.creditNote.update({
      where: { id: req.params.id },
      data: updates,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to update credit note')
  }
})

// Cancel credit note
router.patch('/credit-notes/:id/cancel', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const existing = await prisma.creditNote.findFirst({ where: scopedWhere(scope, { id: req.params.id }) })
    if (!existing) return res.status(404).json({ error: 'Credit note not found' })
    if (existing.status === 'cancelled') return res.status(400).json({ error: 'Credit note is already cancelled' })

    // Reverse the customer balance adjustment
    await prisma.customer.update({
      where: { id: existing.customerId },
      data: { balance: { increment: existing.amount } },
    })

    const note = await prisma.creditNote.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to cancel credit note')
  }
})

// ============================================================
// DEBIT NOTES (Supplier-facing)
// ============================================================

// List debit notes
router.get('/debit-notes', authenticateToken, requirePermission('canViewPayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, supplierId, status, search, from, to } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(supplierId && { supplierId }),
      ...(status && status !== 'all' && { status }),
      ...(search && {
        OR: [
          { noteNo: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && { createdAt: { lte: new Date(to + 'T23:59:59') } }),
    })

    const [notes, total] = await Promise.all([
      prisma.debitNote.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.debitNote.count({ where }),
    ])

    res.json({
      data: notes,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    })
  } catch (error) {
    handleBranchError(res, error, 'Failed to fetch debit notes')
  }
})

// Get single debit note
router.get('/debit-notes/:id', authenticateToken, requirePermission('canViewPayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const note = await prisma.debitNote.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: {
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    if (!note) return res.status(404).json({ error: 'Debit note not found' })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to fetch debit note')
  }
})

// Create debit note
router.post('/debit-notes', authenticateToken, requirePermission('canCreatePayable'), requireTenant, async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const scope = await resolveBranchScope(prisma, req, { source: 'body', allowOwnerAll: false })
    const { supplierId, purchaseId, amount, reason, notes, branchId } = req.body

    if (!supplierId) return res.status(400).json({ error: 'supplierId is required' })
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
    if (!reason) return res.status(400).json({ error: 'reason is required' })

    // Verify supplier belongs to tenant
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } })
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' })

    const noteNo = await generateNoteNo('DN', prisma.debitNote, tenantId)

    const note = await prisma.debitNote.create({
      data: {
        noteNo,
        tenantId,
        branchId: branchId || scope.branchId || null,
        supplierId,
        purchaseId: purchaseId || null,
        amount: Number(amount),
        reason,
        notes: notes || null,
        userId: req.user.id,
        status: 'issued',
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    })

    // Update supplier balance (debit note reduces payable)
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { balance: { decrement: Number(amount) } },
    })

    res.status(201).json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to create debit note')
  }
})

// Update debit note (only if status is 'issued')
router.put('/debit-notes/:id', authenticateToken, requirePermission('canCreatePayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'body', allowOwnerAll: true })
    const existing = await prisma.debitNote.findFirst({ where: scopedWhere(scope, { id: req.params.id }) })
    if (!existing) return res.status(404).json({ error: 'Debit note not found' })
    if (existing.status === 'cancelled') return res.status(400).json({ error: 'Cannot edit a cancelled debit note' })

    const { amount, reason, notes } = req.body
    const updates = {}
    if (amount !== undefined && amount > 0) {
      // Adjust supplier balance for the difference
      const diff = Number(amount) - existing.amount
      if (diff !== 0) {
        await prisma.supplier.update({
          where: { id: existing.supplierId },
          data: { balance: { decrement: diff } },
        })
      }
      updates.amount = Number(amount)
    }
    if (reason !== undefined) updates.reason = reason
    if (notes !== undefined) updates.notes = notes

    const note = await prisma.debitNote.update({
      where: { id: req.params.id },
      data: updates,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to update debit note')
  }
})

// Cancel debit note
router.patch('/debit-notes/:id/cancel', authenticateToken, requirePermission('canCreatePayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const existing = await prisma.debitNote.findFirst({ where: scopedWhere(scope, { id: req.params.id }) })
    if (!existing) return res.status(404).json({ error: 'Debit note not found' })
    if (existing.status === 'cancelled') return res.status(400).json({ error: 'Debit note is already cancelled' })

    // Reverse the supplier balance adjustment
    await prisma.supplier.update({
      where: { id: existing.supplierId },
      data: { balance: { increment: existing.amount } },
    })

    const note = await prisma.debitNote.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to cancel debit note')
  }
})

export default router
