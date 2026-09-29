import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { findPotentialLegacyJournalMatches, journalSummary } from '../src/services/receivablesGlMigrationSafety.js'
import {
  cashSaleRecognitionLines,
  creditNoteRecognitionLines,
  customerRefundLines,
  getReceivablesAccountingConfig,
  postReceivablesJournal,
  posReturnRecognitionLines,
  receiptCollectionLines,
  saleRecognitionLines,
  validateReceivablesAccountingConfig,
} from '../src/services/receivablesAccountingService.js'

const args = process.argv.slice(2)
const valueAfter = (name) => args[args.indexOf(name) + 1]
const tenantId = valueAfter('--tenant')
const apply = args.includes('--apply')
const signoffPath = valueAfter('--signoff')
const planOut = valueAfter('--plan-out')
const templateOut = valueAfter('--signoff-template')
const prisma = new PrismaClient()
const money = (value) => Math.round((Number(value) || 0) * 100) / 100

if (!tenantId || tenantId.startsWith('--')) {
  console.error('Usage: node scripts/receivables-gl-migration.mjs --tenant <tenant-id> [--plan-out plan.json] [--signoff-template signoff.json] [--apply --signoff signed-off.json]')
  process.exitCode = 2
} else if (apply && (!signoffPath || process.env.ALLOW_RECEIVABLE_GL_MIGRATION !== 'YES')) {
  console.error('Apply refused. Provide --signoff <file> and set ALLOW_RECEIVABLE_GL_MIGRATION=YES after independent review.')
  process.exitCode = 2
} else {
  try {
    const plan = await buildPlan(prisma, tenantId)
    if (planOut) await writeFile(planOut, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
    if (templateOut) {
      await writeFile(templateOut, `${JSON.stringify({ approved: false, tenantId, fingerprint: plan.fingerprint, acknowledgedBlockedCount: plan.blocked.length, approvedByUserId: '', approvedAt: '' }, null, 2)}\n`, { flag: 'wx' })
    }
    if (!apply) {
      console.log(JSON.stringify({ tenantId, fingerprint: plan.fingerprint, ready: plan.actions.length, blocked: plan.blocked.length, alreadyPosted: plan.alreadyPosted, actions: plan.actions, blockedItems: plan.blocked }, null, 2))
    } else {
      const approval = JSON.parse(await readFile(signoffPath, 'utf8'))
      const approvedAt = new Date(approval.approvedAt)
      if (approval.approved !== true || approval.tenantId !== tenantId || approval.fingerprint !== plan.fingerprint || Number(approval.acknowledgedBlockedCount) !== plan.blocked.length || !String(approval.approvedByUserId || '').trim() || !Number.isFinite(approvedAt.getTime()) || approvedAt > new Date()) {
        throw new Error('Sign-off is missing, incomplete, or does not match the current tenant plan fingerprint. No writes were made.')
      }
      if (plan.blocked.length) throw new Error(`Apply refused: ${plan.blocked.length} records have unresolved or potentially duplicate postings. Resolve them and generate a new plan; no writes were made.`)
      if (!plan.actions.length) throw new Error('Apply refused: the plan has no missing source journals to create.')
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { ownerId: true } })
      const approver = await prisma.user.findFirst({
        where: {
          id: approval.approvedByUserId,
          isActive: true,
          OR: [
            ...(tenant?.ownerId ? [{ id: tenant.ownerId }] : []),
            { tenantId, role: 'owner' },
            { tenantId, permissions: { some: { canEditAccounting: true } } },
          ],
        },
        select: { id: true },
      })
      if (!approver) throw new Error('Approver must be an active user in this tenant who is the owner or has accounting-edit permission. No writes were made.')
      await prisma.$transaction(async (tx) => {
        const current = await buildPlan(tx, tenantId)
        if (current.fingerprint !== approval.fingerprint) throw new Error('Source records changed after sign-off. No migration entries were written; prepare and review a new plan.')
        if (current.blocked.length) throw new Error('The refreshed plan contains blocked records. No migration entries were written.')
        for (const action of current.actions) {
          await postReceivablesJournal(tx, action)
        }
        await tx.receivablesGlMigrationBatch.create({
          data: {
            tenantId,
            fingerprint: current.fingerprint,
            approvedByUserId: approver.id,
            approvedAt,
            appliedAt: new Date(),
            actionCount: current.actions.length,
            blockedCount: current.blocked.length,
            plan: JSON.parse(JSON.stringify(current)),
          },
        })
      }, { isolationLevel: 'Serializable', timeout: 120000 })
      console.log(JSON.stringify({ tenantId, applied: plan.actions.length, fingerprint: plan.fingerprint, approvedByUserId: approver.id, approvedAt: approvedAt.toISOString() }, null, 2))
    }
  } catch (error) {
    console.error(error?.message || error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

async function buildPlan(db, scopedTenantId) {
  const config = await getReceivablesAccountingConfig(db, scopedTenantId)
  const validation = await validateReceivablesAccountingConfig(db, scopedTenantId, config, { requireEnabled: true })
  const actions = []
  const blocked = []
  let alreadyPosted = 0
  if (!validation.valid) {
    blocked.push({ sourceType: 'TENANT_CONFIG', sourceId: scopedTenantId, reason: validation.errors?.join('; ') || 'Receivables accounting mappings are not enabled and complete.' })
  } else {
    const accounts = await db.account.findMany({ where: { tenantId: scopedTenantId, isActive: true } })
    const cashChartById = new Map(accounts.map((account) => {
      const match = String(account.description || '').match(/cashAccount:([^\s]+)/)
      return [match?.[1], account]
    }).filter(([cashId]) => cashId))
    const journals = await db.journalEntry.findMany({ where: { tenantId: scopedTenantId }, select: { id: true, entryNo: true, sourceType: true, sourceId: true, status: true, reference: true, description: true, date: true } })
    const journalByKey = new Map(journals.filter((entry) => entry.sourceType && entry.sourceId).map((entry) => [`${entry.sourceType}:${entry.sourceId}`, entry]))
    const cashRows = await db.cashTransaction.findMany({ where: { tenantId: scopedTenantId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    const addAction = (action) => {
      const exact = journalByKey.get(`${action.sourceType}:${action.sourceId}`)
      if (exact?.status === 'posted') {
        const duplicates = findPotentialLegacyJournalMatches(action, journals)
        if (duplicates.length) blocked.push({ sourceType: action.sourceType, sourceId: action.sourceId, reason: 'The source is posted, but other legacy/manual journals share its reference and may duplicate it.', matchingJournals: duplicates.map(journalSummary) })
        else alreadyPosted += 1
        return
      }
      if (exact) {
        blocked.push({ sourceType: action.sourceType, sourceId: action.sourceId, reason: `A matching source journal exists with status ${exact.status}; review its reversal/draft history.`, matchingJournals: [journalSummary(exact)] })
        return
      }
      const collisions = findPotentialLegacyJournalMatches(action, journals)
      if (collisions.length) {
        blocked.push({ sourceType: action.sourceType, sourceId: action.sourceId, reason: 'A legacy/manual journal may already represent this event. Resolve it before migrating to avoid duplicate postings.', matchingJournals: collisions.map(journalSummary) })
        return
      }
      actions.push(action)
    }
    const skipIfPosted = (sourceType, sourceId) => {
      const existing = journalByKey.get(`${sourceType}:${sourceId}`)
      if (!existing) return false
      if (existing.status === 'posted') {
        const duplicates = findPotentialLegacyJournalMatches({ sourceType, sourceId, reference: existing.reference }, journals)
        if (duplicates.length) blocked.push({ sourceType, sourceId, reason: 'The source is posted, but other legacy/manual journals share its reference and may duplicate it.', matchingJournals: duplicates.map(journalSummary) })
        else alreadyPosted += 1
      }
      else blocked.push({ sourceType, sourceId, reason: `A matching source journal exists with status ${existing.status}; review its reversal/draft history.`, matchingJournals: [journalSummary(existing)] })
      return true
    }
    const accountForCash = (cashAccountId, sourceType, sourceId) => {
      const account = cashChartById.get(cashAccountId)
      if (!account) blocked.push({ sourceType, sourceId, reason: 'No active linked chart account found for the source transaction account.' })
      return account
    }
    const costIsMissing = (items) => items.some((item) => String(item.product?.itemType || item.itemType || '').toLowerCase() !== 'service' && (item.cost == null || !Number.isFinite(Number(item.cost))))

    const posSales = await db.sale.findMany({ where: { tenantId: scopedTenantId, status: { in: ['completed', 'refunded'] } }, include: { items: { include: { product: { select: { itemType: true } } } }, saleReturns: { where: { status: { not: 'cancelled' }, refundMethod: { not: 'credit_note_stock' } }, include: { items: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    for (const sale of posSales) {
      if (skipIfPosted('POS_SALE', sale.id)) continue
      const candidates = cashRows.filter((row) => row.type === 'sale' && row.reference === sale.receiptNo && Math.abs(money(row.amount) - money(sale.total)) <= 0.01)
      if (candidates.length !== 1) { blocked.push({ sourceType: 'POS_SALE', sourceId: sale.id, reason: candidates.length ? 'Multiple matching till transactions; source account is ambiguous.' : 'No exact matching till transaction found.' }); continue }
      const linked = accountForCash(candidates[0].accountId, 'POS_SALE', sale.id)
      if (!linked) continue
      if (costIsMissing(sale.items)) { blocked.push({ sourceType: 'POS_SALE', sourceId: sale.id, reason: 'One or more inventory sale lines have no saved sale-time cost.' }); continue }
      addAction({ tenantId: scopedTenantId, branchId: sale.branchId, userId: sale.userId, sourceType: 'POS_SALE', sourceId: sale.id, date: sale.createdAt, reference: sale.receiptNo, description: `Point-of-sale ${sale.receiptNo}`, lines: cashSaleRecognitionLines(config, sale, sale.items, linked.id) })
      for (const returned of sale.saleReturns || []) {
        if (skipIfPosted('POS_SALE_RETURN', returned.id)) continue
        const refundRows = cashRows.filter((row) => row.type === 'refund' && row.reference === returned.returnNo && money(row.amount) === money(returned.total))
        if (refundRows.length !== 1) { blocked.push({ sourceType: 'POS_SALE_RETURN', sourceId: returned.id, reason: refundRows.length ? 'Multiple matching refund cash rows make the source account ambiguous.' : 'No exact refund cash transaction matches this return.' }); continue }
        const refundChart = accountForCash(refundRows[0].accountId, 'POS_SALE_RETURN', returned.id)
        if (!refundChart) continue
        if (returned.taxAmount == null && money(sale.tax) > 0) { blocked.push({ sourceType: 'POS_SALE_RETURN', sourceId: returned.id, reason: 'Exact line-level tax is missing; the return tax cannot be estimated for GL migration.' }); continue }
        let returnedCogs = 0
        let costBlocked = false
        for (const returnedItem of returned.items || []) {
          const sourceLines = sale.items.filter((line) => line.productId === returnedItem.productId && String(line.product?.itemType || '').toLowerCase() !== 'service')
          const perBase = sourceLines.map((line) => Number(line.cost) * Number(line.quantity || 0) / (Number(line.quantity || 0) * Number(line.conversionFactor || 1)))
          if (!sourceLines.length || sourceLines.some((line) => line.cost == null) || perBase.some((cost) => Math.abs(cost - perBase[0]) > 0.01)) { costBlocked = true; break }
          returnedCogs += perBase[0] * Number(returnedItem.quantity || 0)
        }
        if (costBlocked) { blocked.push({ sourceType: 'POS_SALE_RETURN', sourceId: returned.id, reason: 'Returned inventory cost is missing or cannot be allocated to a unique sale-time cost.' }); continue }
        addAction({ tenantId: scopedTenantId, branchId: returned.branchId, userId: returned.userId, sourceType: 'POS_SALE_RETURN', sourceId: returned.id, date: returned.createdAt, reference: returned.returnNo, description: `POS sales return ${returned.returnNo}`, lines: posReturnRecognitionLines(config, { transactionAccountId: refundChart.id, amount: returned.total, taxAmount: returned.taxAmount || 0, returnedCogs, reference: returned.returnNo }) })
      }
    }

    const creditSales = await db.saleRecord.findMany({ where: { tenantId: scopedTenantId, status: 'completed' }, include: { items: { include: { product: { select: { itemType: true } } } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    for (const sale of creditSales) {
      if (skipIfPosted('RECEIVABLE_SALE', sale.id)) continue
      if (costIsMissing(sale.items)) { blocked.push({ sourceType: 'RECEIVABLE_SALE', sourceId: sale.id, reason: 'One or more inventory sale lines have no saved sale-time cost.' }); continue }
      addAction({ tenantId: scopedTenantId, branchId: sale.branchId, userId: sale.userId, sourceType: 'RECEIVABLE_SALE', sourceId: sale.id, date: sale.createdAt, reference: sale.receiptNo, description: `Credit sale ${sale.receiptNo}`, lines: saleRecognitionLines(config, sale, sale.items) })
    }

    const payments = await db.customerPayment.findMany({ where: { tenantId: scopedTenantId }, include: { allocations: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    for (const payment of payments) {
      if (skipIfPosted('CUSTOMER_RECEIPT', payment.id)) continue
      if (payment.allocationMode !== 'explicit') { blocked.push({ sourceType: 'CUSTOMER_RECEIPT', sourceId: payment.id, reason: 'Receipt has no explicit, signed-off allocation; legacy receipt allocation is intentionally not inferred.' }); continue }
      if (!payment.allocations.length || payment.allocations.some((allocation) => allocation.targetType !== 'sale' || !allocation.saleId)) { blocked.push({ sourceType: 'CUSTOMER_RECEIPT', sourceId: payment.id, reason: 'Customer-account allocations do not retain the exact receivable-versus-advance split needed for historical GL posting.' }); continue }
      const allocated = money(payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0))
      if (allocated - money(payment.amount) > 0.01) { blocked.push({ sourceType: 'CUSTOMER_RECEIPT', sourceId: payment.id, reason: 'Explicit allocations exceed the receipt amount.' }); continue }
      const refs = new Set([payment.reference, payment.id].filter(Boolean))
      const candidates = cashRows.filter((row) => row.type === 'receipt' && money(row.amount) === money(payment.amount) && refs.has(row.reference))
      if (candidates.length !== 1) { blocked.push({ sourceType: 'CUSTOMER_RECEIPT', sourceId: payment.id, reason: candidates.length ? 'Multiple matching cash transactions; source account is ambiguous.' : 'No exact matching receipt transaction found.' }); continue }
      const linked = accountForCash(candidates[0].accountId, 'CUSTOMER_RECEIPT', payment.id)
      if (!linked) continue
      addAction({ tenantId: scopedTenantId, branchId: payment.branchId, userId: candidates[0].userId, sourceType: 'CUSTOMER_RECEIPT', sourceId: payment.id, date: payment.createdAt, reference: payment.reference || payment.id, description: 'Customer receipt', lines: receiptCollectionLines(config, { transactionAccountId: linked.id, amount: payment.amount, receivableApplied: allocated, reference: payment.reference }) })
    }

    const creditNotes = await db.creditNote.findMany({ where: { tenantId: scopedTenantId, status: { not: 'cancelled' } }, include: { sale: { select: { tax: true, items: { include: { product: { select: { itemType: true } } } } } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    for (const note of creditNotes) {
      const noteAlreadyPosted = skipIfPosted('RECEIVABLE_CREDIT_NOTE', note.id)
      if (!noteAlreadyPosted) {
        if (note.taxAmount == null && money(note.sale?.tax) > 0) blocked.push({ sourceType: 'RECEIVABLE_CREDIT_NOTE', sourceId: note.id, reason: 'Exact tax component is missing; tax must not be guessed during migration.' })
        else {
          let returnedCogs = 0
          if (['sales_return', 'cancellation'].includes(String(note.reason || '').toLowerCase())) {
            const stockReturn = await db.saleReturn.findFirst({ where: { tenantId: scopedTenantId, returnNo: `RET-${note.noteNo}`, refundMethod: 'credit_note_stock', status: 'stock_adjusted' }, include: { items: true } })
            if (!stockReturn?.items?.length) {
              blocked.push({ sourceType: 'RECEIVABLE_CREDIT_NOTE', sourceId: note.id, reason: 'The note identifies a stock return but its linked stock-return lines are missing.' })
              returnedCogs = null
            }
            for (const returned of stockReturn?.items || []) {
              const sourceLines = (note.sale?.items || []).filter((line) => line.productId === returned.productId && String(line.product?.itemType || '').toLowerCase() !== 'service')
              const ratios = sourceLines.map((line) => Number(line.cost) * Number(line.quantity || 0) / (Number(line.quantity || 0) * Number(line.conversionFactor || 1)))
              if (!sourceLines.length || sourceLines.some((line) => line.cost == null) || ratios.some((cost) => Math.abs(cost - ratios[0]) > 0.01)) {
                blocked.push({ sourceType: 'RECEIVABLE_CREDIT_NOTE', sourceId: note.id, reason: `Returned stock cost cannot be attributed unambiguously for product ${returned.productId}.` })
                returnedCogs = null
                break
              }
              returnedCogs += ratios[0] * Number(returned.quantity || 0)
            }
          }
          if (returnedCogs != null) addAction({ tenantId: scopedTenantId, branchId: note.branchId, userId: note.userId, sourceType: 'RECEIVABLE_CREDIT_NOTE', sourceId: note.id, date: note.createdAt, reference: note.noteNo, description: `Customer credit note ${note.noteNo}`, lines: creditNoteRecognitionLines(config, { amount: note.amount, taxAmount: note.taxAmount || 0, refundAmount: note.refundAmount || 0, returnedCogs, reference: note.noteNo }) })
        }
      }
      if (money(note.refundAmount) > 0 && !note.refundWithdrawalId) {
        blocked.push({ sourceType: 'CUSTOMER_WITHDRAWAL', sourceId: note.id, reason: 'The credit note records a refund amount but has no linked withdrawal record.' })
      } else if (money(note.refundAmount) > 0 && note.refundWithdrawalId && !skipIfPosted('CUSTOMER_WITHDRAWAL', note.refundWithdrawalId)) {
        const withdrawal = await db.customerWithdrawal.findFirst({ where: { id: note.refundWithdrawalId, tenantId: scopedTenantId } })
        if (!withdrawal) blocked.push({ sourceType: 'CUSTOMER_WITHDRAWAL', sourceId: note.refundWithdrawalId, reason: 'The credit note refund points to a missing withdrawal record.' })
        else {
          const refundRows = cashRows.filter((row) => row.type === 'credit_note_refund' && row.reference === withdrawal.reference && money(row.amount) === money(withdrawal.amount) && row.accountId === withdrawal.cashAccountId)
          if (refundRows.length !== 1) blocked.push({ sourceType: 'CUSTOMER_WITHDRAWAL', sourceId: withdrawal.id, reason: 'The linked refund cash transaction is missing or ambiguous.' })
          else {
            const linked = accountForCash(withdrawal.cashAccountId, 'CUSTOMER_WITHDRAWAL', withdrawal.id)
            if (linked) addAction({ tenantId: scopedTenantId, branchId: withdrawal.branchId, userId: withdrawal.userId, sourceType: 'CUSTOMER_WITHDRAWAL', sourceId: withdrawal.id, date: withdrawal.createdAt, reference: withdrawal.reference, description: `Customer credit refund ${withdrawal.reference || note.noteNo}`, lines: customerRefundLines(config, { transactionAccountId: linked.id, amount: withdrawal.amount, reference: withdrawal.reference }) })
          }
        }
      }
    }

    const openingBalanceCustomers = await db.customer.findMany({ where: { tenantId: scopedTenantId, openingBalance: { not: 0 } }, select: { id: true, name: true, openingBalance: true } })
    for (const customer of openingBalanceCustomers) {
      blocked.push({ sourceType: 'CUSTOMER_OPENING_BALANCE', sourceId: customer.id, reason: `Customer ${customer.name} has an opening balance. The opening-balance offset account and signed opening entry are not configured by this migration.` })
    }
    const withdrawals = await db.customerWithdrawal.findMany({ where: { tenantId: scopedTenantId }, select: { id: true, reference: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    const noteWithdrawalIds = new Set(creditNotes.map((note) => note.refundWithdrawalId).filter(Boolean))
    for (const withdrawal of withdrawals) {
      if (noteWithdrawalIds.has(withdrawal.id) || skipIfPosted('CUSTOMER_WITHDRAWAL', withdrawal.id)) continue
      blocked.push({ sourceType: 'CUSTOMER_WITHDRAWAL', sourceId: withdrawal.id, reason: 'Standalone customer withdrawal depends on the historical source of customer credit; that advance provenance is not unambiguous for automatic migration.' })
    }
  }

  actions.sort((a, b) => `${a.sourceType}:${a.sourceId}`.localeCompare(`${b.sourceType}:${b.sourceId}`))
  blocked.sort((a, b) => `${a.sourceType}:${a.sourceId}`.localeCompare(`${b.sourceType}:${b.sourceId}`))
  const payload = { tenantId: scopedTenantId, actions, blocked, alreadyPosted }
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return { ...payload, fingerprint }
}
