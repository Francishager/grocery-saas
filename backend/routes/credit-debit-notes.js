import express from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'
import { reconcileCustomerReceivableBalance } from '../src/utils/customerBalance.js'

const router = express.Router()
const prisma = new PrismaClient()

const tenantIdOf = (req) => req.user.tenantId || req.user.tenant_id || req.user.business_id
const CREDIT_STOCK_REASONS = new Set(['sales_return'])
const DEBIT_STOCK_REASONS = new Set(['purchase_return'])
const CREDIT_NOTE_STOCK_RETURN_STATUS = 'stock_adjusted'
const CREDIT_NOTE_STOCK_RETURN_METHOD = 'credit_note_stock'

// Generate sequential note number
async function generateNoteNo(prefix, model, tenantId) {
  const count = await model.count({ where: { tenantId } })
  const year = new Date().getFullYear()
  const num = String(count + 1).padStart(5, '0')
  return `${prefix}-${year}-${num}`
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode })
}

function toMoney(value, fallback = 0) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : fallback
}

function positiveQuantity(value, label = 'Quantity') {
  const quantity = Number(value)
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw httpError(400, `${label} must be a whole number`)
  }
  return quantity
}

function itemBaseQuantity(item, quantity = item?.quantity) {
  const conversionFactor = Number(item?.conversionFactor || 1)
  const baseQty = Number(quantity || 0) * (Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1)
  if (!Number.isInteger(baseQty) || baseQty < 0) {
    throw httpError(400, 'Returned quantity must convert to a whole stock quantity')
  }
  return baseQty
}

function requestedQuantityMap(items = []) {
  const map = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.productId) continue
    map.set(item.productId, positiveQuantity(item.quantity, 'Returned quantity'))
  }
  return map
}

function creditNoteReturnNo(noteNo) {
  return `RET-${noteNo}`
}

async function resolveCreditReturnItems(client, scope, { customerId, saleId, items }) {
  if (!saleId) {
    throw httpError(400, 'Select the original customer sale before creating a sales return credit note')
  }

  const sale = await client.saleRecord.findFirst({
    where: scopedWhere(scope, { id: saleId, customerId, status: { not: 'cancelled' } }),
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, itemType: true } },
        },
      },
    },
  })
  if (!sale) throw httpError(404, 'Original customer sale was not found')

  const requested = requestedQuantityMap(items)
  const useAllItems = requested.size === 0
  const returnItems = []

  for (const item of sale.items || []) {
    if (item.product?.itemType === 'service') continue
    const requestedQty = useAllItems ? Number(item.quantity || 0) : Number(requested.get(item.productId) || 0)
    if (requestedQty <= 0) continue
    if (requestedQty > Number(item.quantity || 0)) {
      throw httpError(400, `Returned quantity for ${item.product?.name || 'item'} cannot exceed sold quantity`)
    }

    const baseQty = itemBaseQuantity(item, requestedQty)
    if (baseQty <= 0) continue
    const lineUnitTotal = Number(item.quantity || 0) > 0 ? toMoney(item.total) / Number(item.quantity) : toMoney(item.price)
    const lineTotal = toMoney(lineUnitTotal * requestedQty)
    returnItems.push({
      productId: item.productId,
      quantity: baseQty,
      price: baseQty > 0 ? toMoney(lineTotal / baseQty) : 0,
      total: lineTotal,
      reason: 'Credit note sales return',
    })
  }

  if (!returnItems.length) {
    throw httpError(400, 'Select at least one stock-tracked product to return')
  }

  return { sale, returnItems }
}

async function createCreditNoteStockReturn(client, scope, note, items) {
  if (!CREDIT_STOCK_REASONS.has(String(note.reason || '').toLowerCase())) return null

  const returnNo = creditNoteReturnNo(note.noteNo)
  const existingReturn = await client.saleReturn.findFirst({
    where: { tenantId: note.tenantId, returnNo },
    select: { id: true },
  })
  if (existingReturn) return existingReturn

  const { returnItems } = await resolveCreditReturnItems(client, scope, {
    customerId: note.customerId,
    saleId: note.saleId,
    items,
  })

  for (const item of returnItems) {
    await client.product.update({
      where: { id: item.productId },
      data: { quantity: { increment: item.quantity } },
    })
  }

  return client.saleReturn.create({
    data: {
      returnNo,
      tenantId: note.tenantId,
      branchId: note.branchId || scope.branchId || null,
      saleId: null,
      userId: note.userId,
      customerId: note.customerId,
      total: 0,
      reason: `Stock returned by credit note ${note.noteNo}`,
      refundMethod: CREDIT_NOTE_STOCK_RETURN_METHOD,
      status: CREDIT_NOTE_STOCK_RETURN_STATUS,
      items: { create: returnItems },
    },
    select: { id: true },
  })
}

async function reverseCreditNoteStockReturn(client, tenantId, noteNo) {
  const stockReturn = await client.saleReturn.findFirst({
    where: { tenantId, returnNo: creditNoteReturnNo(noteNo), status: CREDIT_NOTE_STOCK_RETURN_STATUS },
    include: { items: { include: { product: { select: { id: true, name: true, quantity: true } } } } },
  })
  if (!stockReturn) return null

  for (const item of stockReturn.items || []) {
    if (Number(item.product?.quantity || 0) < Number(item.quantity || 0)) {
      throw httpError(400, `Cannot cancel this note because ${item.product?.name || 'a returned product'} no longer has enough stock to reverse the return`)
    }
  }

  for (const item of stockReturn.items || []) {
    await client.product.update({
      where: { id: item.productId },
      data: { quantity: { decrement: item.quantity } },
    })
  }

  return client.saleReturn.update({
    where: { id: stockReturn.id },
    data: { status: 'cancelled' },
    select: { id: true },
  })
}

async function resolveDebitReturnItems(client, scope, { supplierId, purchaseId, items }) {
  if (!purchaseId) {
    throw httpError(400, 'Select the original supplier purchase before creating a purchase return debit note')
  }

  const purchase = await client.supplierPurchase.findFirst({
    where: scopedWhere(scope, { id: purchaseId, supplierId }),
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, itemType: true, quantity: true } },
        },
      },
    },
  })
  if (!purchase) throw httpError(404, 'Original supplier purchase was not found')

  const requested = requestedQuantityMap(items)
  const useAllItems = requested.size === 0
  const returnItems = []

  for (const item of purchase.items || []) {
    if (item.product?.itemType === 'service') continue
    const requestedQty = useAllItems ? Number(item.quantity || 0) : Number(requested.get(item.productId) || 0)
    if (requestedQty <= 0) continue
    if (requestedQty > Number(item.quantity || 0)) {
      throw httpError(400, `Returned quantity for ${item.product?.name || 'item'} cannot exceed purchased quantity`)
    }
    if (Number(item.product?.quantity || 0) < requestedQty) {
      throw httpError(400, `Insufficient stock for ${item.product?.name || 'item'} to return to supplier`)
    }
    returnItems.push({
      productId: item.productId,
      productName: item.product?.name || 'Product',
      quantity: requestedQty,
      cost: toMoney(item.cost),
      total: toMoney(Number(item.cost || 0) * requestedQty),
    })
  }

  if (!returnItems.length) {
    throw httpError(400, 'Select at least one stock-tracked product to return to the supplier')
  }

  return { purchase, returnItems }
}

async function debitNoteStockLogs(client, tenantId, noteId, source = 'debit_note') {
  return client.auditLog.findMany({
    where: {
      tenantId,
      model: 'Product',
      action: 'update',
      AND: [
        { changes: { path: ['stockMovement', 'debitNoteId'], equals: noteId } },
        { changes: { path: ['stockMovement', 'source'], equals: source } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function createDebitNoteStockReturn(client, scope, note, items, req) {
  if (!DEBIT_STOCK_REASONS.has(String(note.reason || '').toLowerCase())) return []

  const existingLogs = await debitNoteStockLogs(client, note.tenantId, note.id)
  if (existingLogs.length) return existingLogs

  const { returnItems } = await resolveDebitReturnItems(client, scope, {
    supplierId: note.supplierId,
    purchaseId: note.purchaseId,
    items,
  })

  const logs = []
  for (const item of returnItems) {
    const product = await client.product.findFirst({
      where: scopedWhere(scope, { id: item.productId }),
      select: { id: true, name: true, quantity: true },
    })
    if (!product) throw httpError(404, `${item.productName} was not found`)
    const beforeQuantity = Number(product.quantity || 0)
    const afterQuantity = beforeQuantity - Number(item.quantity || 0)
    if (afterQuantity < 0) throw httpError(400, `Insufficient stock for ${product.name} to return to supplier`)

    await client.product.update({
      where: { id: product.id },
      data: { quantity: afterQuantity },
    })
    logs.push(await client.auditLog.create({
      data: {
        tenantId: note.tenantId,
        userId: req.user?.id || 'system',
        userEmail: req.user?.email || '',
        action: 'update',
        model: 'Product',
        recordId: product.id,
        changes: {
          before: { quantity: beforeQuantity },
          after: { quantity: afterQuantity },
          stockMovement: {
            type: 'stock_out',
            source: 'debit_note',
            debitNoteId: note.id,
            reference: note.noteNo,
            quantity: item.quantity,
            reason: `Supplier purchase return ${note.noteNo}`,
            productName: product.name,
          },
        },
        ip: req.ip || req.connection?.remoteAddress || null,
        statusCode: 200,
        severity: 'info',
      },
    }))
  }
  return logs
}

async function reverseDebitNoteStockReturn(client, scope, note, req) {
  const reversalLogs = await debitNoteStockLogs(client, note.tenantId, note.id, 'debit_note_cancel')
  if (reversalLogs.length) return null

  const logs = await debitNoteStockLogs(client, note.tenantId, note.id)
  for (const log of logs) {
    const quantity = Number(log.changes?.stockMovement?.quantity || 0)
    if (!log.recordId || quantity <= 0) continue
    const product = await client.product.findFirst({
      where: scopedWhere(scope, { id: log.recordId }),
      select: { id: true, name: true, quantity: true },
    })
    if (!product) continue
    const beforeQuantity = Number(product.quantity || 0)
    const afterQuantity = beforeQuantity + quantity
    await client.product.update({
      where: { id: product.id },
      data: { quantity: afterQuantity },
    })
    await client.auditLog.create({
      data: {
        tenantId: note.tenantId,
        userId: req.user?.id || 'system',
        userEmail: req.user?.email || '',
        action: 'update',
        model: 'Product',
        recordId: product.id,
        changes: {
          before: { quantity: beforeQuantity },
          after: { quantity: afterQuantity },
          stockMovement: {
            type: 'stock_in',
            source: 'debit_note_cancel',
            debitNoteId: note.id,
            reference: note.noteNo,
            quantity,
            reason: `Cancelled supplier purchase return ${note.noteNo}`,
            productName: product.name,
          },
        },
        ip: req.ip || req.connection?.remoteAddress || null,
        statusCode: 200,
        severity: 'info',
      },
    })
  }
  return logs
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
    const { customerId, saleId, amount, reason, notes, branchId, items = [] } = req.body

    if (!customerId) return res.status(400).json({ error: 'customerId is required' })
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
    if (!reason) return res.status(400).json({ error: 'reason is required' })
    if (CREDIT_STOCK_REASONS.has(String(reason).toLowerCase()) && !saleId) {
      return res.status(400).json({ error: 'Select the original customer sale before creating a sales return credit note' })
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    const noteNo = await generateNoteNo('CN', prisma.creditNote, tenantId)

    const note = await prisma.$transaction(async (tx) => {
      const createdNote = await tx.creditNote.create({
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
      await createCreditNoteStockReturn(tx, scope, createdNote, items)
      await reconcileCustomerReceivableBalance(tx, scope, customerId)
      return createdNote
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
      updates.amount = Number(amount)
    }
    if (reason !== undefined) updates.reason = reason
    if (notes !== undefined) updates.notes = notes

    const note = await prisma.$transaction(async (tx) => {
      const nextReason = reason !== undefined ? reason : existing.reason
      if (existing.reason === 'sales_return' && nextReason !== 'sales_return') {
        await reverseCreditNoteStockReturn(tx, existing.tenantId, existing.noteNo)
      }
      const updatedNote = await tx.creditNote.update({
        where: { id: req.params.id },
        data: updates,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      })
      await reconcileCustomerReceivableBalance(tx, scope, existing.customerId)
      return updatedNote
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

    const note = await prisma.$transaction(async (tx) => {
      await reverseCreditNoteStockReturn(tx, existing.tenantId, existing.noteNo)
      const cancelledNote = await tx.creditNote.update({
        where: { id: req.params.id },
        data: { status: 'cancelled' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      })
      await reconcileCustomerReceivableBalance(tx, scope, existing.customerId)
      return cancelledNote
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
    const { supplierId, purchaseId, amount, reason, notes, branchId, items = [] } = req.body

    if (!supplierId) return res.status(400).json({ error: 'supplierId is required' })
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
    if (!reason) return res.status(400).json({ error: 'reason is required' })
    if (DEBIT_STOCK_REASONS.has(String(reason).toLowerCase()) && !purchaseId) {
      return res.status(400).json({ error: 'Select the original supplier purchase before creating a purchase return debit note' })
    }

    // Verify supplier belongs to tenant
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } })
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' })

    const noteNo = await generateNoteNo('DN', prisma.debitNote, tenantId)

    const note = await prisma.$transaction(async (tx) => {
      const createdNote = await tx.debitNote.create({
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

      await createDebitNoteStockReturn(tx, scope, createdNote, items, req)

      // Update supplier balance (debit note reduces payable)
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { decrement: Number(amount) } },
      })

      return createdNote
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
      updates.amount = Number(amount)
    }
    if (reason !== undefined) updates.reason = reason
    if (notes !== undefined) updates.notes = notes

    const note = await prisma.$transaction(async (tx) => {
      const nextReason = reason !== undefined ? reason : existing.reason
      if (existing.reason === 'purchase_return' && nextReason !== 'purchase_return') {
        await reverseDebitNoteStockReturn(tx, scope, existing, req)
      }
      if (amount !== undefined && Number(amount) > 0) {
        // Adjust supplier balance for the difference
        const diff = Number(amount) - existing.amount
        if (diff !== 0) {
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: { balance: { decrement: diff } },
          })
        }
      }

      return tx.debitNote.update({
        where: { id: req.params.id },
        data: updates,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      })
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

    const note = await prisma.$transaction(async (tx) => {
      await reverseDebitNoteStockReturn(tx, scope, existing, req)

      // Reverse the supplier balance adjustment
      await tx.supplier.update({
        where: { id: existing.supplierId },
        data: { balance: { increment: existing.amount } },
      })

      return tx.debitNote.update({
        where: { id: req.params.id },
        data: { status: 'cancelled' },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      })
    })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to cancel debit note')
  }
})

export default router
