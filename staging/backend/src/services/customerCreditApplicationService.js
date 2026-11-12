import { calculateCustomerReceivableBalance, calculateCustomerReceivableBalanceBefore, effectiveCreditNoteRows } from '../utils/customerBalance.js'

const money = (value) => Math.round((Number(value) || 0) * 100) / 100

export function customerCreditOffset(amountDue, availableCredit) {
  return money(Math.min(Math.max(0, money(amountDue)), Math.max(0, money(availableCredit))))
}

export function traceableCustomerCreditTarget(amountDue, availableCredit, sources = []) {
  const requested = customerCreditOffset(amountDue, availableCredit)
  const traceable = money(sources.reduce((sum, source) => sum + Math.max(0, money(source.amount)), 0))
  return money(Math.min(requested, traceable))
}

export function validateCustomerCreditSaleLimit(customer, amountDue) {
  const projectedBalance = money(customer?.balance) + money(amountDue)
  if (projectedBalance <= 0) return { valid: true }
  const creditLimit = money(customer?.creditLimit)
  if (creditLimit <= 0) {
    return {
      valid: false,
      statusCode: 400,
      code: 'CUSTOMER_CREDIT_LIMIT_REQUIRED',
      message: `Set a credit limit for ${customer?.name || 'this customer'} before making a credit sale.`,
    }
  }
  if (projectedBalance > creditLimit) {
    return {
      valid: false,
      statusCode: 400,
      code: 'CUSTOMER_CREDIT_LIMIT_EXCEEDED',
      message: `Credit limit exceeded. Available credit is ${Math.max(0, creditLimit - money(customer?.balance)).toFixed(2)}.`,
    }
  }
  return { valid: true }
}

export function availableAdvanceFromReceipt({ amount, allocatedToCustomer, alreadyApplied, balanceBefore }) {
  const receiptAmount = money(amount)
  const allocationCap = Math.min(receiptAmount, Math.max(0, money(allocatedToCustomer)))
  const receivableSettled = Math.min(receiptAmount, Math.max(0, money(balanceBefore)))
  const advancesRecognizable = money(receiptAmount - receivableSettled)
  return money(Math.max(0, Math.min(allocationCap, advancesRecognizable) - money(alreadyApplied)))
}

export function customerAdvanceAllocation(payment, allocations = []) {
  const receiptAmount = money(payment?.amount)
  const paymentAllocations = allocations.filter((allocation) => allocation.paymentId === payment?.id)
  const allocatedTotal = money(paymentAllocations.reduce((sum, allocation) => sum + money(allocation.amount), 0))
  const allocatedToCustomer = money(paymentAllocations
    .filter((allocation) => allocation.targetType === 'customer_account')
    .reduce((sum, allocation) => sum + money(allocation.amount), 0))
  const unallocatedRemainder = money(Math.max(0, receiptAmount - allocatedTotal))
  return money(Math.min(receiptAmount, allocatedToCustomer + unallocatedRemainder))
}

export async function applyAvailableCustomerCredit(client, { scope, customerId, saleId, amountDue, availableCredit, userId, branchId }) {
  const balanceSnapshot = await calculateCustomerReceivableBalance(client, scope, customerId)
  const creditAvailable = availableCredit == null ? Math.max(0, -money(balanceSnapshot?.balance)) : Math.max(0, money(availableCredit))
  const target = customerCreditOffset(amountDue, creditAvailable)
  if (target <= 0) return { amount: 0, applications: [] }

  const [payments, allocations, creditNotes, returns, existingApplications] = await Promise.all([
    client.customerPayment.findMany({
      where: { tenantId: scope.tenantId, customerId },
      select: { id: true, saleId: true, allocationMode: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    client.customerPaymentAllocation.findMany({
      where: { tenantId: scope.tenantId, customerId },
      select: { paymentId: true, saleId: true, targetType: true, amount: true },
    }),
    client.creditNote.findMany({
      where: { tenantId: scope.tenantId, customerId, status: { not: 'cancelled' } },
      select: { id: true, noteNo: true, saleId: true, amount: true, refundAmount: true, createdAt: true, sale: { select: { id: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    client.saleReturn.findMany({
      where: { tenantId: scope.tenantId, customerId, status: 'completed', refundMethod: 'credit' },
      select: { id: true, returnNo: true, total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    client.customerCreditApplication.findMany({
      where: { tenantId: scope.tenantId, customerId },
      select: { sourceType: true, sourceId: true, amount: true },
    }),
  ])

  const previouslyApplied = new Map()
  for (const app of existingApplications) {
    const key = `${app.sourceType}:${app.sourceId}`
    previouslyApplied.set(key, money((previouslyApplied.get(key) || 0) + money(app.amount)))
  }
  const sources = []
  for (const payment of payments) {
    const alreadyUsed = previouslyApplied.get(`payment:${payment.id}`) || 0
    const accountAllocation = customerAdvanceAllocation(payment, allocations)
    if (accountAllocation <= 0) continue
    const beforeReceipt = await calculateCustomerReceivableBalanceBefore(
      client, scope, customerId, payment.createdAt,
    )
    if (!beforeReceipt) continue
    const available = availableAdvanceFromReceipt({
      amount: payment.amount,
      allocatedToCustomer: accountAllocation,
      alreadyApplied: alreadyUsed,
      balanceBefore: beforeReceipt.balance,
    })
    if (available > 0.009) sources.push({ sourceType: 'payment', sourceId: payment.id, amount: available, createdAt: payment.createdAt })
  }

  const effectiveNotes = effectiveCreditNoteRows(creditNotes)
  for (const note of effectiveNotes) {
    const available = money(note.effectiveAmount - money(note.refundAmount) - (previouslyApplied.get(`credit_note:${note.id}`) || 0))
    if (available > 0.009) sources.push({ sourceType: 'credit_note', sourceId: note.id, amount: available, expectedAmount: money(note.amount), expectedRefundAmount: money(note.refundAmount), createdAt: note.createdAt })
  }
  for (const creditReturn of returns) {
    const available = money(Number(creditReturn.total) - (previouslyApplied.get(`sale_return:${creditReturn.id}`) || 0))
    if (available > 0.009) sources.push({ sourceType: 'sale_return', sourceId: creditReturn.id, amount: available, createdAt: creditReturn.createdAt })
  }

  sources.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.sourceType.localeCompare(b.sourceType))
  const applications = []
  const traceableTarget = traceableCustomerCreditTarget(amountDue, creditAvailable, sources)
  let remaining = traceableTarget
  for (const source of sources) {
    if (remaining <= 0.009) break
    if (source.sourceType === 'credit_note') {
      await client.$queryRaw`SELECT id FROM credit_notes WHERE id = ${source.sourceId} AND "tenantId" = ${scope.tenantId} FOR UPDATE`
      const currentNote = await client.creditNote.findFirst({ where: { id: source.sourceId, tenantId: scope.tenantId, customerId, status: { not: 'cancelled' } }, select: { id: true, amount: true, refundAmount: true } })
      if (!currentNote || money(currentNote.amount) !== source.expectedAmount || money(currentNote.refundAmount) !== source.expectedRefundAmount) {
        throw Object.assign(new Error('A customer credit note changed while this sale was being recorded. Refresh the customer ledger and try again.'), { statusCode: 409 })
      }
    }
    const amount = money(Math.min(source.amount, remaining))
    if (amount <= 0) continue
    applications.push(await client.customerCreditApplication.create({
      data: { tenantId: scope.tenantId, branchId: branchId || null, customerId, saleId, sourceType: source.sourceType, sourceId: source.sourceId, amount, createdById: userId },
    }))
    remaining = money(remaining - amount)
  }

  const applied = money(traceableTarget - remaining)
  if (remaining > 0.01) {
    throw Object.assign(new Error('Verified customer credit changed while this sale was being recorded. Refresh the customer ledger and try again.'), { statusCode: 409, code: 'CUSTOMER_CREDIT_SOURCE_CHANGED' })
  }
  if (applied > 0) {
    const sale = await client.saleRecord.findFirst({ where: { id: saleId, tenantId: scope.tenantId, customerId } })
    if (!sale) throw Object.assign(new Error('Sale not found while applying customer credit.'), { statusCode: 409 })
    const newAmountPaid = money(Number(sale.amountPaid || 0) + applied)
    const newBalance = money(Math.max(0, Number(sale.total) - newAmountPaid))
    await client.saleRecord.update({
      where: { id: saleId },
      data: { amountPaid: newAmountPaid, balance: newBalance, paymentStatus: newBalance <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid' },
    })
  }
  return { amount: applied, applications }
}
