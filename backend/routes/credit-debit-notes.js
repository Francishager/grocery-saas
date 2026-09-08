import express from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'
import { reconcileCustomerReceivableBalance } from '../src/utils/customerBalance.js'

const router = express.Router()
const prisma = new PrismaClient()

const tenantIdOf = (req) => req.user.tenantId || req.user.tenant_id || req.user.business_id
const CREDIT_REASONS = new Set(['sales_return', 'price_adjustment', 'overcharge', 'cancellation', 'other'])
const DEBIT_REASONS = new Set(['purchase_return', 'short_delivery', 'quality_issue', 'price_adjustment', 'cancellation', 'other'])
const CREDIT_STOCK_REASONS = new Set(['sales_return', 'cancellation'])
const DEBIT_STOCK_REASONS = new Set(['purchase_return', 'short_delivery', 'quality_issue', 'cancellation'])
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

function saleLineGrossTotal(sale) {
  return (sale?.items || []).reduce((sum, item) => sum + toMoney(item.total), 0)
}

function saleNetTotal(sale) {
  const total = toMoney(sale?.total)
  if (total > 0) return total
  return toMoney(saleLineGrossTotal(sale) - toMoney(sale?.discount) - toMoney(sale?.cashDiscount) + toMoney(sale?.tax))
}

function netAmountForReturnedItems(sale, returnItems = []) {
  const rawReturnTotal = returnItems.reduce((sum, item) => sum + toMoney(item.total), 0)
  const grossTotal = saleLineGrossTotal(sale)
  const netTotal = saleNetTotal(sale)
  if (rawReturnTotal <= 0) return 0
  if (grossTotal <= 0 || netTotal <= 0) return toMoney(rawReturnTotal)
  return toMoney(rawReturnTotal * Math.min(1, netTotal / grossTotal))
}

async function remainingSaleCreditCapacity(client, scope, saleId, excludeNoteId = null) {
  if (!saleId) return null
  const sale = await client.saleRecord.findFirst({
    where: scopedWhere(scope, { id: saleId, status: { not: 'cancelled' } }),
    include: { items: true },
  })
  if (!sale) return null

  const creditNotes = await client.creditNote.aggregate({
    where: {
      tenantId: scope.tenantId,
      saleId,
      status: { not: 'cancelled' },
      ...(excludeNoteId ? { id: { not: excludeNoteId } } : {}),
    },
    _sum: { amount: true },
  })

  const alreadyCredited = toMoney(creditNotes._sum.amount)
  return {
    sale,
    alreadyCredited,
    remaining: Math.max(0, toMoney(saleNetTotal(sale) - alreadyCredited)),
  }
}

function normalizeReason(reason) {
  return String(reason || '').trim().toLowerCase()
}

function validateReason(reason, allowedReasons, label) {
  const normalized = normalizeReason(reason)
  if (!normalized) throw httpError(400, 'reason is required')
  if (!allowedReasons.has(normalized)) throw httpError(400, `Invalid ${label} reason`)
  return normalized
}

function paymentStatusForBalance(total, amountPaid, balance, adjustmentTotal = 0) {
  if (balance <= 0) return 'paid'
  if (amountPaid > 0 || adjustmentTotal > 0 || balance < total) return 'partial'
  return 'unpaid'
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
    throw httpError(400, 'Select the original customer sale before creating a return or cancellation credit note')
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

  const existingNotes = await client.creditNote.findMany({
    where: {
      tenantId: scope.tenantId,
      saleId,
      status: { not: 'cancelled' },
      reason: { in: [...CREDIT_STOCK_REASONS] },
    },
    select: { noteNo: true },
  })
  const existingReturnNos = existingNotes.map((note) => creditNoteReturnNo(note.noteNo))
  const existingReturns = existingReturnNos.length
    ? await client.saleReturn.findMany({
        where: {
          tenantId: scope.tenantId,
          returnNo: { in: existingReturnNos },
          refundMethod: CREDIT_NOTE_STOCK_RETURN_METHOD,
          status: CREDIT_NOTE_STOCK_RETURN_STATUS,
        },
        include: { items: true },
      })
    : []
  const returnedByProduct = new Map()
  for (const stockReturn of existingReturns) {
    for (const item of stockReturn.items || []) {
      returnedByProduct.set(item.productId, Number(returnedByProduct.get(item.productId) || 0) + Number(item.quantity || 0))
    }
  }

  for (const item of sale.items || []) {
    if (item.product?.itemType === 'service') continue
    const soldBaseQty = itemBaseQuantity(item)
    const returnedForProduct = Number(returnedByProduct.get(item.productId) || 0)
    const consumedFromLine = Math.min(soldBaseQty, returnedForProduct)
    returnedByProduct.set(item.productId, Math.max(0, returnedForProduct - consumedFromLine))
    const remainingBaseQty = Math.max(0, soldBaseQty - consumedFromLine)
    if (remainingBaseQty <= 0) continue

    const requestedQty = useAllItems ? Number(item.quantity || 0) : Number(requested.get(item.productId) || 0)
    if (requestedQty <= 0) continue
    const requestedBaseQty = itemBaseQuantity(item, requestedQty)
    if (requestedBaseQty > remainingBaseQty) {
      throw httpError(400, `Returned quantity for ${item.product?.name || 'item'} exceeds remaining returnable quantity`)
    }

    const lineUnitTotal = Number(item.quantity || 0) > 0 ? toMoney(item.total) / Number(item.quantity) : toMoney(item.price)
    const lineTotal = toMoney(lineUnitTotal * requestedQty)
    returnItems.push({
      productId: item.productId,
      quantity: requestedBaseQty,
      price: requestedBaseQty > 0 ? toMoney(lineTotal / requestedBaseQty) : 0,
      total: lineTotal,
      reason: 'Credit note stock reversal',
    })
  }

  if (!returnItems.length) {
    throw httpError(400, 'Select at least one stock-tracked product to return')
  }

  return { sale, returnItems, netReturnAmount: netAmountForReturnedItems(sale, returnItems) }
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

async function updateLinkedSaleBalanceFromCreditNotes(client, scope, saleId) {
  if (!saleId) return null
  const sale = await client.saleRecord.findFirst({
    where: scopedWhere(scope, { id: saleId, status: { not: 'cancelled' } }),
    select: { id: true, total: true, amountPaid: true },
  })
  if (!sale) return null

  const creditNotes = await client.creditNote.aggregate({
    where: { tenantId: scope.tenantId, saleId, status: { not: 'cancelled' } },
    _sum: { amount: true },
  })
  const total = toMoney(sale.total)
  const amountPaid = toMoney(sale.amountPaid)
  const adjustmentTotal = Math.min(total, toMoney(creditNotes._sum.amount))
  const balance = Math.max(0, toMoney(total - amountPaid - adjustmentTotal))

  return client.saleRecord.update({
    where: { id: sale.id },
    data: {
      balance,
      paymentStatus: paymentStatusForBalance(total, amountPaid, balance, adjustmentTotal),
    },
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
    throw httpError(400, 'Select the original supplier purchase before creating a return, delivery, quality, or cancellation debit note')
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

  const existingNotes = await client.debitNote.findMany({
    where: {
      tenantId: scope.tenantId,
      purchaseId,
      status: { not: 'cancelled' },
      reason: { in: [...DEBIT_STOCK_REASONS] },
    },
    select: { id: true },
  })
  const existingNoteIds = new Set(existingNotes.map((note) => note.id))
  const existingLogs = existingNoteIds.size
    ? await client.auditLog.findMany({
        where: {
          tenantId: scope.tenantId,
          model: 'Product',
          action: 'update',
          AND: [
            { changes: { path: ['stockMovement', 'source'], equals: 'debit_note' } },
          ],
        },
      })
    : []
  const returnedByProduct = new Map()
  for (const log of existingLogs) {
    if (!existingNoteIds.has(log.changes?.stockMovement?.debitNoteId)) continue
    const productId = log.recordId
    const quantity = Number(log.changes?.stockMovement?.quantity || 0)
    if (productId && quantity > 0) {
      returnedByProduct.set(productId, Number(returnedByProduct.get(productId) || 0) + quantity)
    }
  }

  for (const item of purchase.items || []) {
    if (item.product?.itemType === 'service') continue
    const purchasedQty = Number(item.quantity || 0)
    const returnedForProduct = Number(returnedByProduct.get(item.productId) || 0)
    const consumedFromLine = Math.min(purchasedQty, returnedForProduct)
    returnedByProduct.set(item.productId, Math.max(0, returnedForProduct - consumedFromLine))
    const remainingQty = Math.max(0, purchasedQty - consumedFromLine)
    if (remainingQty <= 0) continue

    const requestedQty = useAllItems ? remainingQty : Number(requested.get(item.productId) || 0)
    if (requestedQty <= 0) continue
    if (requestedQty > remainingQty) {
      throw httpError(400, `Returned quantity for ${item.product?.name || 'item'} exceeds remaining returnable quantity`)
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

async function updateLinkedPurchaseBalanceFromDebitNotes(client, scope, purchaseId) {
  if (!purchaseId) return null
  const purchase = await client.supplierPurchase.findFirst({
    where: scopedWhere(scope, { id: purchaseId }),
    select: { id: true, total: true, amountPaid: true },
  })
  if (!purchase) return null

  const debitNotes = await client.debitNote.aggregate({
    where: { tenantId: scope.tenantId, purchaseId, status: { not: 'cancelled' } },
    _sum: { amount: true },
  })
  const adjustmentTotal = toMoney(debitNotes._sum.amount)
  const total = toMoney(purchase.total)
  const amountPaid = toMoney(purchase.amountPaid)
  const balance = Math.max(0, toMoney(total - amountPaid - adjustmentTotal))

  return client.supplierPurchase.update({
    where: { id: purchase.id },
    data: {
      balance,
      paymentStatus: paymentStatusForBalance(total, amountPaid, balance, adjustmentTotal),
    },
  })
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
          sale: { select: { id: true, receiptNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.creditNote.count({ where }),
    ])

    res.json({
      data: notes.map((note) => ({
        ...note,
        documentType: 'Credit Note Adjustment',
        affectsCreditSales: false,
        statementNote: 'Credit notes reduce receivables and may return stock, but they are not credit sales.',
      })),
      note: 'Credit notes are adjustment documents. They do not appear in the credit sales list.',
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
        sale: { select: { id: true, receiptNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    if (!note) return res.status(404).json({ error: 'Credit note not found' })
    res.json({
      ...note,
      documentType: 'Credit Note Adjustment',
      affectsCreditSales: false,
      statementNote: 'Credit notes reduce receivables and may return stock, but they are not credit sales.',
    })
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
    const normalizedReason = validateReason(reason, CREDIT_REASONS, 'credit note')
    let noteAmount = toMoney(amount)
    if (!CREDIT_STOCK_REASONS.has(normalizedReason) && noteAmount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
    if (!saleId) {
      return res.status(400).json({ error: 'Select the original customer sale before creating a credit note' })
    }

    // Verify customer and original sale belong to this tenant scope
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    const originalSale = await prisma.saleRecord.findFirst({
      where: scopedWhere(scope, { id: saleId, customerId, status: { not: 'cancelled' } }),
      select: { id: true },
    })
    if (!originalSale) return res.status(404).json({ error: 'Original customer sale was not found' })

    const creditCapacity = await remainingSaleCreditCapacity(prisma, scope, saleId)
    if (!creditCapacity) return res.status(404).json({ error: 'Original customer sale was not found' })

    if (CREDIT_STOCK_REASONS.has(normalizedReason)) {
      const { netReturnAmount } = await resolveCreditReturnItems(prisma, scope, { customerId, saleId, items })
      noteAmount = normalizedReason === 'cancellation' ? creditCapacity.remaining : netReturnAmount
    }

    if (noteAmount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
    if (noteAmount - creditCapacity.remaining > 0.01) {
      return res.status(400).json({ error: 'Credit note amount exceeds the remaining net sale balance. Maximum allowed is ' + creditCapacity.remaining.toFixed(2) + '.' })
    }
    noteAmount = toMoney(Math.min(noteAmount, creditCapacity.remaining))

    const noteNo = await generateNoteNo('CN', prisma.creditNote, tenantId)
    const note = await prisma.$transaction(async (tx) => {
      const createdNote = await tx.creditNote.create({
        data: {
          noteNo,
          tenantId,
          branchId: branchId || scope.branchId || null,
          customerId,
          saleId: saleId || null,
          amount: noteAmount,
          reason: normalizedReason,
          notes: notes || null,
          userId: req.user.id,
          status: 'issued',
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          sale: { select: { id: true, receiptNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      })
      await createCreditNoteStockReturn(tx, scope, createdNote, items)
      await updateLinkedSaleBalanceFromCreditNotes(tx, scope, createdNote.saleId)
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
    if (amount !== undefined) {
      const nextAmount = toMoney(amount)
      if (nextAmount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
      const creditCapacity = await remainingSaleCreditCapacity(prisma, scope, existing.saleId, existing.id)
      if (creditCapacity && nextAmount - creditCapacity.remaining > 0.01) {
        return res.status(400).json({ error: 'Credit note amount exceeds the remaining net sale balance. Maximum allowed is ' + creditCapacity.remaining.toFixed(2) + '.' })
      }
      updates.amount = nextAmount
    }
    const normalizedReason = reason !== undefined ? validateReason(reason, CREDIT_REASONS, 'credit note') : normalizeReason(existing.reason)
    if (reason !== undefined) updates.reason = normalizedReason
    if (notes !== undefined) updates.notes = notes

    const note = await prisma.$transaction(async (tx) => {
      const existingAffectsStock = CREDIT_STOCK_REASONS.has(normalizeReason(existing.reason))
      const nextAffectsStock = CREDIT_STOCK_REASONS.has(normalizedReason)
      if (existingAffectsStock !== nextAffectsStock) {
        throw httpError(400, 'Cancel this note and create a new one when changing between stock-return and money-only reasons')
      }
      const updatedNote = await tx.creditNote.update({
        where: { id: req.params.id },
        data: updates,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          sale: { select: { id: true, receiptNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      })
      await updateLinkedSaleBalanceFromCreditNotes(tx, scope, existing.saleId)
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
          sale: { select: { id: true, receiptNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      })
      await updateLinkedSaleBalanceFromCreditNotes(tx, scope, existing.saleId)
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
          purchase: { select: { id: true, refNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.debitNote.count({ where }),
    ])

    res.json({
      data: notes.map((note) => ({
        ...note,
        documentType: 'Debit Note Adjustment',
        affectsPurchases: false,
        statementNote: 'Debit notes reduce payables and may return stock, but they are not purchases.',
      })),
      note: 'Debit notes are adjustment documents. They do not appear in purchase or credit-sale lists.',
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
        purchase: { select: { id: true, refNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
        branch: { select: { id: true, name: true } },
      },
    })
    if (!note) return res.status(404).json({ error: 'Debit note not found' })
    res.json({
      ...note,
      documentType: 'Debit Note Adjustment',
      affectsPurchases: false,
      statementNote: 'Debit notes reduce payables and may return stock, but they are not purchases.',
    })
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
    const noteAmount = toMoney(amount)
    if (noteAmount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })
    const normalizedReason = validateReason(reason, DEBIT_REASONS, 'debit note')
    if (!purchaseId) {
      return res.status(400).json({ error: 'Select the original supplier purchase before creating a debit note' })
    }

    // Verify supplier and original purchase belong to this tenant scope
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } })
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' })

    const originalPurchase = await prisma.supplierPurchase.findFirst({
      where: scopedWhere(scope, { id: purchaseId, supplierId }),
      select: { id: true },
    })
    if (!originalPurchase) return res.status(404).json({ error: 'Original supplier purchase was not found' })

    const noteNo = await generateNoteNo('DN', prisma.debitNote, tenantId)

    const note = await prisma.$transaction(async (tx) => {
      const createdNote = await tx.debitNote.create({
        data: {
          noteNo,
          tenantId,
          branchId: branchId || scope.branchId || null,
          supplierId,
          purchaseId: purchaseId || null,
          amount: noteAmount,
          reason: normalizedReason,
          notes: notes || null,
          userId: req.user.id,
          status: 'issued',
        },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          purchase: { select: { id: true, refNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      })

      await createDebitNoteStockReturn(tx, scope, createdNote, items, req)
      await updateLinkedPurchaseBalanceFromDebitNotes(tx, scope, createdNote.purchaseId)

      // Update supplier balance (debit note reduces payable)
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { decrement: noteAmount } },
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
    if (amount !== undefined) {
      const nextAmount = toMoney(amount)
      if (nextAmount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' })

      updates.amount = nextAmount
    }
    const normalizedReason = reason !== undefined ? validateReason(reason, DEBIT_REASONS, 'debit note') : normalizeReason(existing.reason)
    if (reason !== undefined) updates.reason = normalizedReason
    if (notes !== undefined) updates.notes = notes

    const note = await prisma.$transaction(async (tx) => {
      const existingAffectsStock = DEBIT_STOCK_REASONS.has(normalizeReason(existing.reason))
      const nextAffectsStock = DEBIT_STOCK_REASONS.has(normalizedReason)
      if (existingAffectsStock !== nextAffectsStock) {
        throw httpError(400, 'Cancel this note and create a new one when changing between stock-return and money-only reasons')
      }
      if (amount !== undefined && Number(amount) > 0) {
        // Adjust supplier balance for the difference
        const diff = updates.amount - existing.amount
        if (diff !== 0) {
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: { balance: { decrement: diff } },
          })
        }
      }

      const updatedNote = await tx.debitNote.update({
        where: { id: req.params.id },
        data: updates,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          purchase: { select: { id: true, refNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      })
      await updateLinkedPurchaseBalanceFromDebitNotes(tx, scope, existing.purchaseId)
      return updatedNote
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

      const cancelledNote = await tx.debitNote.update({
        where: { id: req.params.id },
        data: { status: 'cancelled' },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          purchase: { select: { id: true, refNo: true, total: true, balance: true, paymentStatus: true, createdAt: true } },
          branch: { select: { id: true, name: true } },
        },
      })
      await updateLinkedPurchaseBalanceFromDebitNotes(tx, scope, existing.purchaseId)
      return cancelledNote
    })
    res.json(note)
  } catch (error) {
    handleBranchError(res, error, 'Failed to cancel debit note')
  }
})

export default router
