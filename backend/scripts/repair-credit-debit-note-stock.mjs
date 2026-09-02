import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CREDIT_RETURN_STATUS = 'stock_adjusted'
const CREDIT_RETURN_METHOD = 'credit_note_stock'
const argValue = (name) => {
  const arg = process.argv.find((value) => value.startsWith(name))
  return arg ? arg.split('=').slice(1).join('=') : null
}

const tenantId = process.env.TENANT_ID || argValue('--tenant=')
const dryRun = process.argv.includes('--dry-run')
const includeDetails = process.argv.includes('--details') || process.argv.includes('--inspect')
const manualCreditNoteRef = argValue('--credit-note=')
const manualDebitNoteRef = argValue('--debit-note=')
const manualSaleRef = argValue('--sale=') || argValue('--sale-id=')
const manualPurchaseRef = argValue('--purchase=') || argValue('--purchase-id=')
const manualItemArgs = process.argv.filter((arg) => arg.startsWith('--item=')).map((arg) => arg.split('=').slice(1).join('='))

if ((manualCreditNoteRef || manualDebitNoteRef) && !tenantId) {
  throw new Error('--tenant is required when manually pairing historical notes')
}
if (manualCreditNoteRef && !manualSaleRef) {
  throw new Error('--sale or --sale-id is required with --credit-note')
}
if (manualDebitNoteRef && !manualPurchaseRef) {
  throw new Error('--purchase or --purchase-id is required with --debit-note')
}
if (manualItemArgs.length && !(manualCreditNoteRef || manualDebitNoteRef)) {
  throw new Error('--item can only be used with --credit-note or --debit-note')
}

const money = (value) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

const sameMoney = (a, b) => Math.abs(money(a) - money(b)) <= 0.01
const returnNoForCreditNote = (noteNo) => `RET-${noteNo}`
const isStockItem = (item) => item.product?.itemType !== 'service'
const noteMatchesRef = (note, ref) => Boolean(ref && (note.id === ref || note.noteNo === ref))
const manualItems = new Map()

for (const itemArg of manualItemArgs) {
  const [productId, quantityText] = itemArg.split(':')
  const quantity = Number(quantityText)
  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Invalid --item=${itemArg}. Use --item=productId:quantity`)
  }
  manualItems.set(productId, Number(manualItems.get(productId) || 0) + quantity)
}

function noteSkip(note, reason, extras = {}) {
  if (!includeDetails) return { noteNo: note.noteNo, reason }
  return {
    id: note.id,
    noteNo: note.noteNo,
    tenantId: note.tenantId,
    branchId: note.branchId,
    amount: money(note.amount),
    createdAt: note.createdAt,
    reason,
    ...extras,
  }
}

function itemSummary(items = []) {
  return items.slice(0, 8).map((item) => {
    const quantity = Number(item.quantity || 0)
    return {
      productId: item.productId,
      productName: item.product?.name || 'Product',
      quantity,
      unitAmount: quantity > 0 ? money(item.total) / quantity : money(item.price ?? item.cost ?? 0),
      total: money(item.total),
    }
  })
}

function saleCandidateSummary(candidates = []) {
  return candidates.slice(0, 8).map((sale) => ({
    id: sale.id,
    receiptNo: sale.receiptNo,
    total: money(sale.total),
    createdAt: sale.createdAt,
    items: itemSummary(sale.items),
  }))
}

function purchaseCandidateSummary(candidates = []) {
  return candidates.slice(0, 8).map((purchase) => ({
    id: purchase.id,
    refNo: purchase.refNo,
    total: money(purchase.total),
    createdAt: purchase.createdAt,
    items: itemSummary(purchase.items),
  }))
}

function inferManualReturnItems({ noteAmount, stockItems, quantityField, amountField, unitField }) {
  if (!manualItems.size) return null

  const selected = []
  for (const [productId, quantity] of manualItems.entries()) {
    const matchingLines = stockItems.filter((item) => item.productId === productId)
    if (matchingLines.length !== 1) {
      return { items: [], skipped: `${productId} must match exactly one stock-tracked document line` }
    }
    const item = matchingLines[0]
    const available = Number(item[quantityField] || 0)
    if (quantity > available) {
      return { items: [], skipped: `${item.product?.name || productId} quantity exceeds original document quantity` }
    }
    selected.push({ item, quantity })
  }

  const selectedTotal = selected.reduce((sum, { item, quantity }) => {
    const lineQuantity = Number(item[quantityField] || 0)
    const unitAmount = lineQuantity > 0 ? money(item[amountField]) / lineQuantity : money(item[unitField])
    return sum + money(unitAmount * quantity)
  }, 0)

  if (!sameMoney(selectedTotal, noteAmount)) {
    return {
      items: [],
      skipped: `manual item total ${money(selectedTotal)} does not match note amount ${money(noteAmount)}`,
    }
  }

  return { items: selected }
}

function saleItemBaseQuantity(item, quantity = item.quantity) {
  const conversionFactor = Number(item.conversionFactor || 1)
  return Number(quantity || 0) * (Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1)
}

function inferReturnItemsFromLinkedLines({ noteAmount, documentTotal, items, quantityField = 'quantity', amountField = 'total', unitField = 'price' }) {
  const stockItems = (items || []).filter(isStockItem)
  if (!stockItems.length) return { items: [], skipped: 'linked document has no stock-tracked products' }

  const manual = inferManualReturnItems({ noteAmount, stockItems, quantityField, amountField, unitField })
  if (manual) return manual

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

  const partialLineMatches = stockItems
    .map((item) => {
      const originalQuantity = Number(item[quantityField] || 0)
      const unitAmount = originalQuantity > 0 ? money(item[amountField]) / originalQuantity : money(item[unitField])
      const quantity = unitAmount > 0 ? noteAmount / unitAmount : 0
      return Number.isInteger(quantity) && quantity > 0 && quantity <= originalQuantity
        ? { item, quantity }
        : null
    })
    .filter(Boolean)

  if (partialLineMatches.length === 1) return { items: partialLineMatches }
  if (partialLineMatches.length > 1) {
    return { items: [], skipped: 'multiple product lines could match this amount' }
  }

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
  if (manualSaleRef && (!manualCreditNoteRef || noteMatchesRef(note, manualCreditNoteRef))) {
    const sale = await prisma.saleRecord.findFirst({
      where: {
        tenantId: note.tenantId,
        customerId: note.customerId,
        status: { not: 'cancelled' },
        OR: [{ id: manualSaleRef }, { receiptNo: manualSaleRef }],
      },
      include: { items: { include: { product: { select: { id: true, name: true, itemType: true } } } } },
    })
    return sale ? { sale } : { skipped: `manual sale ${manualSaleRef} not found for this note/customer` }
  }

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
  if (exactMatches.length > 1) {
    return {
      skipped: 'multiple possible linked sales match this amount',
      candidates: saleCandidateSummary(exactMatches),
    }
  }

  const inferableMatches = candidates
    .map((sale) => ({
      sale,
      inferred: inferReturnItemsFromLinkedLines({
        noteAmount: note.amount,
        documentTotal: sale.total,
        items: sale.items,
        amountField: 'total',
        unitField: 'price',
      }),
    }))
    .filter(({ inferred }) => inferred.items?.length && !inferred.skipped)

  if (inferableMatches.length === 1) return { sale: inferableMatches[0].sale }
  if (inferableMatches.length > 1) {
    return {
      skipped: 'multiple possible linked sales have product lines matching this amount',
      candidates: saleCandidateSummary(inferableMatches.map(({ sale }) => sale)),
    }
  }

  return {
    skipped: 'missing linked sale',
    candidates: saleCandidateSummary(candidates),
  }
}

async function findDebitNotePurchase(note) {
  if (manualPurchaseRef && (!manualDebitNoteRef || noteMatchesRef(note, manualDebitNoteRef))) {
    const purchase = await prisma.supplierPurchase.findFirst({
      where: {
        tenantId: note.tenantId,
        supplierId: note.supplierId,
        OR: [{ id: manualPurchaseRef }, { refNo: manualPurchaseRef }],
      },
      include: { items: { include: { product: { select: { id: true, name: true, itemType: true, quantity: true } } } } },
    })
    return purchase ? { purchase } : { skipped: `manual purchase ${manualPurchaseRef} not found for this note/supplier` }
  }

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
  if (exactMatches.length > 1) {
    return {
      skipped: 'multiple possible linked purchases match this amount',
      candidates: purchaseCandidateSummary(exactMatches),
    }
  }

  const inferableMatches = candidates
    .map((purchase) => ({
      purchase,
      inferred: inferReturnItemsFromLinkedLines({
        noteAmount: note.amount,
        documentTotal: purchase.total,
        items: purchase.items,
        amountField: 'total',
        unitField: 'cost',
      }),
    }))
    .filter(({ inferred }) => inferred.items?.length && !inferred.skipped)

  if (inferableMatches.length === 1) return { purchase: inferableMatches[0].purchase }
  if (inferableMatches.length > 1) {
    return {
      skipped: 'multiple possible linked purchases have product lines matching this amount',
      candidates: purchaseCandidateSummary(inferableMatches.map(({ purchase }) => purchase)),
    }
  }

  return {
    skipped: 'missing linked purchase',
    candidates: purchaseCandidateSummary(candidates),
  }
}

async function repairCreditNotes(summary) {
  const notes = await prisma.creditNote.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(manualCreditNoteRef ? { OR: [{ id: manualCreditNoteRef }, { noteNo: manualCreditNoteRef }] } : {}),
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

    const { sale, skipped, candidates } = await findCreditNoteSale(note)
    if (!sale) {
      summary.creditNotes.skipped.push(noteSkip(note, skipped, { customerId: note.customerId, candidates }))
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
      summary.creditNotes.skipped.push(noteSkip(note, inferred.skipped || 'no return quantities found', { customerId: note.customerId, saleId: sale.id, receiptNo: sale.receiptNo }))
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
        if (!note.saleId) {
          await tx.creditNote.update({ where: { id: note.id }, data: { saleId: sale.id } })
        }
      })
    }

    summary.creditNotes.repaired += 1
  }
}

async function repairDebitNotes(summary) {
  const notes = await prisma.debitNote.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(manualDebitNoteRef ? { OR: [{ id: manualDebitNoteRef }, { noteNo: manualDebitNoteRef }] } : {}),
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

    const { purchase, skipped, candidates } = await findDebitNotePurchase(note)
    if (!purchase) {
      summary.debitNotes.skipped.push(noteSkip(note, skipped, { supplierId: note.supplierId, candidates }))
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
      summary.debitNotes.skipped.push(noteSkip(note, inferred.skipped || 'no return quantities found', { supplierId: note.supplierId, purchaseId: purchase.id, refNo: purchase.refNo }))
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
      summary.debitNotes.skipped.push(noteSkip(note, `insufficient current stock for ${unavailable.productName}`, { supplierId: note.supplierId, purchaseId: purchase.id, refNo: purchase.refNo }))
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
        if (!note.purchaseId) {
          await tx.debitNote.update({ where: { id: note.id }, data: { purchaseId: purchase.id } })
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
    manual: {
      creditNote: manualCreditNoteRef || null,
      sale: manualSaleRef || null,
      debitNote: manualDebitNoteRef || null,
      purchase: manualPurchaseRef || null,
      items: Array.from(manualItems.entries()).map(([productId, quantity]) => ({ productId, quantity })),
    },
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
