import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CREDIT_RETURN_STATUS = 'stock_adjusted'
const CREDIT_RETURN_METHOD = 'credit_note_stock'
const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='))
const tenantId = process.env.TENANT_ID || (tenantArg ? tenantArg.split('=').slice(1).join('=') : null)
const dryRun = process.argv.includes('--dry-run')

const money = (value) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

const sameMoney = (a, b) => Math.abs(money(a) - money(b)) <= 0.01
const returnNoForCreditNote = (noteNo) => `RET-${noteNo}`
const isStockItem = (item) => item.product?.itemType !== 'service'

function saleItemBaseQuantity(item, quantity = item.quantity) {
  const conversionFactor = Number(item.conversionFactor || 1)
  return Number(quantity || 0) * (Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1)
}

function inferReturnItemsFromLinkedLines({ noteAmount, documentTotal, items, quantityField = 'quantity', amountField = 'total', unitField = 'price' }) {
  const stockItems = (items || []).filter(isStockItem)
  if (!stockItems.length) return { items: [], skipped: 'linked document has no stock-tracked products' }

  if (sameMoney(noteAmount, documentTotal)) {
    return {
      items: stockItems.map((item) => ({ item, quantity: Number(item[quantityField] || 0) })).filter((entry) => entry.quantity > 0),
    }
  }

  if (stockItems.length === 1) {
    const item = stockItems[0]
    const unitAmount = Number(item[quantityField] || 0) > 0 ? money(item[amountField]) / Number(item[quantityField]) : money(item[unitField])
    const quantity = unitAmount > 0 ? noteAmount / unitAmount : 0
    if (Number.isInteger(quantity) && quantity > 0 && quantity <= Number(item[quantityField] || 0)) {
      return { items: [{ item, quantity }] }
    }
  }

  const exactLine = stockItems.find((item) => sameMoney(item[amountField], noteAmount))
  if (exactLine) return { items: [{ item: exactLine, quantity: Number(exactLine[quantityField] || 0) }] }

  return { items: [], skipped: 'cannot safely infer returned products from amount-only historical note' }
}

async function hasDebitNoteStockLogs(note) {
  const log = await prisma.auditLog.findFirst({
    where: {
      tenantId: note.tenantId,
      model: 'Product',
      action: 'update',
      AND: [
        { changes: { path: ['stockMovement', 'debitNoteId'], equals: note.id } },
        { changes: { path: ['stockMovement', 'source'], equals: 'debit_note' } },
      ],
    },
    select: { id: true },
  })
  return Boolean(log)
}

async function findCreditNoteSale(note) {
  if (note.saleId) {
    const sale = await prisma.saleRecord.findFirst({
      where: { id: note.saleId, tenantId: note.tenantId, customerId: note.customerId, status: { not: 'cancelled' } },
      include: { items: { include: { product: { select: { id: true, name: true, itemType: true } } } } },
    })
    return sale ? { sale } : { skipped: 'linked sale not found' }
  }

  const candidates = await prisma.saleRecord.findMany({
    where: { tenantId: note.tenantId, customerId: note.customerId, status: { not: 'cancelled' }, createdAt: { lte: note.createdAt } },
    include: { items: { include: { product: { select: { id: true, name: true, itemType: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const exactMatches = candidates.filter((sale) => sameMoney(sale.total, note.amount))
  if (exactMatches.length === 1) return { sale: exactMatches[0] }
  if (exactMatches.length > 1) return { skipped: 'multiple possible linked sales match this amount' }
  return { skipped: 'missing linked sale' }
}

async function findDebitNotePurchase(note) {
  if (note.purchaseId) {
    const purchase = await prisma.supplierPurchase.findFirst({
      where: { id: note.purchaseId, tenantId: note.tenantId, supplierId: note.supplierId },
      include: { items: { include: { product: { select: { id: true, name: true, itemType: true, quantity: true } } } } },
    })
    return purchase ? { purchase } : { skipped: 'linked purchase not found' }
  }

  const candidates = await prisma.supplierPurchase.findMany({
    where: { tenantId: note.tenantId, supplierId: note.supplierId, createdAt: { lte: note.createdAt } },
    include: { items: { include: { product: { select: { id: true, name: true, itemType: true, quantity: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const exactMatches = candidates.filter((purchase) => sameMoney(purchase.total, note.amount))
  if (exactMatches.length === 1) return { purchase: exactMatches[0] }
  if (exactMatches.length > 1) return { skipped: 'multiple possible linked purchases match this amount' }
  return { skipped: 'missing linked purchase' }
}

async function repairCreditNotes(summary) {
  const notes = await prisma.creditNote.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      reason: 'sales_return',
      status: { not: 'cancelled' },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const note of notes) {
    const returnNo = returnNoForCreditNote(note.noteNo)
    const existing = await prisma.saleReturn.findFirst({ where: { tenantId: note.tenantId, returnNo }, select: { id: true } })
    if (existing) {
      summary.creditNotes.alreadyFixed += 1
      continue
    }

    const { sale, skipped } = await findCreditNoteSale(note)
    if (!sale) {
      summary.creditNotes.skipped.push({ noteNo: note.noteNo, reason: skipped })
      continue
    }

    const inferred = inferReturnItemsFromLinkedLines({
      noteAmount: note.amount,
      documentTotal: sale.total,
      items: sale.items,
      amountField: 'total',
      unitField: 'price',
    })
    if (inferred.skipped || !inferred.items.length) {
      summary.creditNotes.skipped.push({ noteNo: note.noteNo, reason: inferred.skipped || 'no return quantities found' })
      continue
    }

    const returnItems = inferred.items.map(({ item, quantity }) => {
      const baseQty = saleItemBaseQuantity(item, quantity)
      const lineUnitTotal = Number(item.quantity || 0) > 0 ? money(item.total) / Number(item.quantity) : money(item.price)
      const lineTotal = money(lineUnitTotal * quantity)
      return {
        productId: item.productId,
        quantity: baseQty,
        price: baseQty > 0 ? money(lineTotal / baseQty) : 0,
        total: lineTotal,
        reason: 'Historical credit note stock repair',
      }
    }).filter((item) => item.quantity > 0)

    if (!returnItems.length) {
      summary.creditNotes.skipped.push({ noteNo: note.noteNo, reason: 'inferred quantities were zero' })
      continue
    }

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        for (const item of returnItems) {
          await tx.product.update({ where: { id: item.productId }, data: { quantity: { increment: item.quantity } } })
        }
        await tx.saleReturn.create({
          data: {
            returnNo,
            tenantId: note.tenantId,
            branchId: note.branchId || sale.branchId || null,
            saleId: null,
            userId: note.userId,
            customerId: note.customerId,
            total: 0,
            reason: `Stock returned by historical credit note ${note.noteNo}`,
            refundMethod: CREDIT_RETURN_METHOD,
            status: CREDIT_RETURN_STATUS,
            items: { create: returnItems },
          },
        })
      })
    }

    summary.creditNotes.repaired += 1
  }
}

async function repairDebitNotes(summary) {
  const notes = await prisma.debitNote.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      reason: 'purchase_return',
      status: { not: 'cancelled' },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const note of notes) {
    if (await hasDebitNoteStockLogs(note)) {
      summary.debitNotes.alreadyFixed += 1
      continue
    }

    const { purchase, skipped } = await findDebitNotePurchase(note)
    if (!purchase) {
      summary.debitNotes.skipped.push({ noteNo: note.noteNo, reason: skipped })
      continue
    }

    const inferred = inferReturnItemsFromLinkedLines({
      noteAmount: note.amount,
      documentTotal: purchase.total,
      items: purchase.items,
      amountField: 'total',
      unitField: 'cost',
    })
    if (inferred.skipped || !inferred.items.length) {
      summary.debitNotes.skipped.push({ noteNo: note.noteNo, reason: inferred.skipped || 'no return quantities found' })
      continue
    }

    const returnItems = inferred.items.map(({ item, quantity }) => ({
      productId: item.productId,
      productName: item.product?.name || 'Product',
      quantity: Number(quantity || 0),
      currentStock: Number(item.product?.quantity || 0),
    })).filter((item) => item.quantity > 0)

    const unavailable = returnItems.find((item) => item.currentStock < item.quantity)
    if (unavailable) {
      summary.debitNotes.skipped.push({ noteNo: note.noteNo, reason: `insufficient current stock for ${unavailable.productName}` })
      continue
    }

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        for (const { productId, quantity, productName } of returnItems) {
          const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, quantity: true } })
          const beforeQuantity = Number(product?.quantity || 0)
          const afterQuantity = beforeQuantity - quantity
          await tx.product.update({ where: { id: productId }, data: { quantity: afterQuantity } })
          await tx.auditLog.create({
            data: {
              tenantId: note.tenantId,
              userId: note.userId || 'system',
              userEmail: 'system',
              action: 'update',
              model: 'Product',
              recordId: productId,
              changes: {
                before: { quantity: beforeQuantity },
                after: { quantity: afterQuantity },
                stockMovement: {
                  type: 'stock_out',
                  source: 'debit_note',
                  debitNoteId: note.id,
                  reference: note.noteNo,
                  quantity,
                  reason: `Historical supplier purchase return ${note.noteNo}`,
                  productName,
                },
              },
            },
          })
        }
      })
    }

    summary.debitNotes.repaired += 1
  }
}

async function main() {
  const summary = {
    mode: dryRun ? 'dry-run' : 'repair',
    tenantId: tenantId || 'all-tenants',
    creditNotes: { repaired: 0, alreadyFixed: 0, skipped: [] },
    debitNotes: { repaired: 0, alreadyFixed: 0, skipped: [] },
  }

  await repairCreditNotes(summary)
  await repairDebitNotes(summary)
  console.log(JSON.stringify(summary, null, 2))
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
