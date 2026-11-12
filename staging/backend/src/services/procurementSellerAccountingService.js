import { getReceivablesAccountingConfig, postReceivablesJournal, receiptCollectionLines, saleRecognitionLines } from './receivablesAccountingService.js'

const money = (value) => Math.round((Number(value) || 0) * 100) / 100

async function sellerPostingUser(client, tenantId) {
  const tenant = await client.tenant.findUnique({ where: { id: tenantId }, select: { ownerId: true } })
  if (!tenant?.ownerId) throw Object.assign(new Error('The supplier business needs an active owner account before marketplace accounting can post.'), { statusCode: 409 })
  return tenant.ownerId
}

async function getOrCreateCounterparty(client, { sellerTenantId, buyerTenant, branchId, invoiceTotal }) {
  let link = await client.procurementCustomerLink.findUnique({
    where: { sellerTenantId_buyerTenantId: { sellerTenantId, buyerTenantId: buyerTenant.id } },
    include: { customer: true },
  })
  if (!link) {
    const customer = await client.customer.create({ data: {
      tenantId: sellerTenantId, branchId, name: buyerTenant.name, email: buyerTenant.email || null,
      phone: null, address: buyerTenant.address || null, notes: `System-managed procurement buyer business (${buyerTenant.id}).`,
      creditLimit: invoiceTotal,
    } })
    link = await client.procurementCustomerLink.create({ data: {
      sellerTenantId, buyerTenantId: buyerTenant.id, customerId: customer.id,
    }, include: { customer: true } })
  }
  return link
}

export async function postProcurementSellerInvoice(client, {
  invoice, order, invoiceLines, productsById, buyerTenant, userId,
}) {
  const tenantId = invoice.sellerTenantId
  const config = await getReceivablesAccountingConfig(client, tenantId)
  if (!config) throw Object.assign(new Error('Receivables account setup is unavailable for the supplier. Run automatic accounting setup before approving this invoice.'), { statusCode: 409 })
  if (!config.marketplaceSettlementAccountId) throw Object.assign(new Error('Marketplace settlement clearing is not configured for the supplier. Run automatic accounting setup before approving this invoice.'), { statusCode: 409 })

  const sellerUserId = await sellerPostingUser(client, tenantId)
  const branchIds = [...new Set(invoiceLines.map((line) => productsById.get(line.sellerProductId)?.branchId ?? null))]
  if (branchIds.length > 1) throw Object.assign(new Error('Seller invoice items must be fulfilled from one seller branch so inventory and reporting stay branch-consistent.'), { statusCode: 409 })
  const branchId = branchIds[0] || null
  const total = money(invoice.total)
  const customerLink = await getOrCreateCounterparty(client, {
    sellerTenantId: tenantId, buyerTenant, branchId, invoiceTotal: total,
  })
  const customer = customerLink.customer
  const items = invoiceLines.map((line) => {
    const product = productsById.get(line.sellerProductId)
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)
    const itemType = String(product.itemType || '').toLowerCase()
    if (itemType !== 'service' && (product.cost == null || !Number.isFinite(Number(product.cost)))) {
      throw Object.assign(new Error(`Set a cost price for seller item "${product.name}" before recognizing its COGS.`), { statusCode: 409 })
    }
    return {
      line, product, quantity, unitPrice, itemType,
      cost: itemType === 'service' ? 0 : Number(product.cost),
      total: money(quantity * unitPrice),
      taxAmount: money(quantity * unitPrice * Number(line.taxRate || 0) / 100),
    }
  })
  const calculatedTax = money(items.reduce((sum, item) => sum + item.taxAmount, 0))
  if (Math.abs(calculatedTax - money(invoice.taxAmount)) > 0.01) {
    throw Object.assign(new Error('Seller invoice tax does not match the invoice line tax rates. Review tax before approving.'), { statusCode: 409 })
  }
  const subtotal = money(items.reduce((sum, item) => sum + item.total, 0))
  const freight = money(invoice.deliveryFee)
  if (Math.abs(subtotal + calculatedTax + freight - total) > 0.01) {
    throw Object.assign(new Error('Seller invoice lines, tax and freight do not reconcile to its total.'), { statusCode: 409 })
  }

  for (const item of items) {
    if (item.itemType === 'service') continue
    if (!Number.isInteger(item.quantity)) throw Object.assign(new Error('Seller inventory accounting currently requires whole-unit goods quantities.'), { statusCode: 409 })
    const movement = await client.product.updateMany({
      where: { id: item.product.id, tenantId, isActive: true, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    })
    if (movement.count !== 1) throw Object.assign(new Error(`Seller stock for "${item.product.name}" is insufficient. Reconcile stock before approving the invoice.`), { statusCode: 409 })
    await client.auditLog.create({ data: {
      tenantId, userId: sellerUserId, userEmail: '', action: 'update', model: 'Product', recordId: item.product.id,
      changes: { stockMovement: {
        type: 'stock_out', quantity: item.quantity, reason: 'Procurement invoice fulfilment',
        reference: invoice.invoiceNo, procurementInvoiceId: invoice.id,
        procurementOrderId: order.id, productName: item.product.name,
      } }, ip: null, statusCode: 200, severity: 'info',
    } })
  }

  const sale = await client.saleRecord.create({ data: {
    tenantId, branchId, customerId: customer.id, userId: sellerUserId,
    receiptNo: `PROC-${invoice.id}`, subtotal: money(subtotal + freight),
    freightAmount: freight, tax: calculatedTax, total, amountPaid: 0, balance: total,
    paymentMethod: 'credit', paymentStatus: 'unpaid', status: 'completed', dueDate: invoice.dueDate,
    notes: `Auto-posted marketplace receivable for ${buyerTenant.name}; procurement invoice ${invoice.invoiceNo}.`,
    items: { create: items.map((item) => ({
      productId: item.product.id, quantity: item.quantity, price: item.unitPrice, cost: item.cost,
      productRevenue: item.itemType === 'service' ? 0 : item.total,
      serviceRevenue: item.itemType === 'service' ? item.total : 0,
      total: item.total, taxAmount: item.taxAmount,
    })) },
  } })
  await client.customer.update({ where: { id: customer.id }, data: {
    balance: { increment: total }, creditLimit: Math.max(Number(customer.creditLimit || 0), Number(customer.balance || 0) + total),
    ...(branchId && !customer.branchId ? { branchId } : {}),
  } })
  const posting = await postReceivablesJournal(client, {
    tenantId, branchId, userId: sellerUserId, sourceType: 'PROCUREMENT_SELLER_INVOICE', sourceId: invoice.id,
    date: invoice.createdAt, reference: invoice.invoiceNo,
    description: `Marketplace sale to ${buyerTenant.name}: ${invoice.invoiceNo} (approved by ${userId})`,
    lines: saleRecognitionLines(config, sale, items.map((item) => ({
      quantity: item.quantity, cost: item.cost, product: item.product,
    }))), allowDisabled: true,
  })
  if (!posting.posted && !posting.duplicate) throw Object.assign(new Error('Seller receivable journal was not posted.'), { statusCode: 409 })
  return { sale, customer, branchId, customerLink }
}

export async function registerProcurementSupplierPaymentApproval(client, { supplierPayment, purchaseId }) {
  const invoice = await client.procurementInvoice.findFirst({
    where: { supplierPurchaseId: purchaseId, status: 'approved', sellerSaleRecordId: { not: null } },
    select: { id: true, sellerTenantId: true, buyerTenantId: true },
  })
  if (!invoice) return null
  return client.procurementPaymentApproval.create({ data: {
    invoiceId: invoice.id, supplierPaymentId: supplierPayment.id,
    sellerTenantId: invoice.sellerTenantId, buyerTenantId: invoice.buyerTenantId,
    amount: money(supplierPayment.amount), status: 'pending',
  } })
}

export async function approveProcurementSupplierPayment(client, { approval, transactionAccountId = null, paymentMethod = null }) {
  if (approval.status === 'approved' && approval.sellerCustomerPaymentId) {
    return client.customerPayment.findUnique({ where: { id: approval.sellerCustomerPaymentId } })
  }
  if (approval.status !== 'pending') throw Object.assign(new Error('This marketplace repayment is no longer awaiting approval.'), { statusCode: 409 })
  const invoice = await client.procurementInvoice.findFirst({
    where: { id: approval.invoiceId, sellerTenantId: approval.sellerTenantId, status: 'approved', sellerSaleRecordId: { not: null } },
    include: { sellerSaleRecord: true },
  })
  if (!invoice?.sellerSaleRecord) throw Object.assign(new Error('The linked seller receivable was not found; repayment was not approved.'), { statusCode: 409 })
  const supplierPayment = await client.supplierPayment.findUnique({ where: { id: approval.supplierPaymentId } })
  if (!supplierPayment || supplierPayment.purchaseId !== invoice.supplierPurchaseId) throw Object.assign(new Error('The buyer payment no longer matches this seller invoice.'), { statusCode: 409 })
  const sale = await client.saleRecord.findFirst({ where: { id: invoice.sellerSaleRecordId, tenantId: invoice.sellerTenantId, status: 'completed' } })
  if (!sale) throw Object.assign(new Error('Linked seller receivable was not found; payment was not recorded.'), { statusCode: 409 })
  const idempotencyKey = `PROC-PAY-${supplierPayment.id}`
  const duplicate = await client.customerPayment.findUnique({ where: { idempotencyKey } })
  if (duplicate) return duplicate
  const amount = money(approval.amount)
  if (amount > money(sale.balance) + 0.001) throw Object.assign(new Error('Buyer payment exceeds the linked seller receivable balance.'), { statusCode: 409 })
  const config = await getReceivablesAccountingConfig(client, invoice.sellerTenantId)
  if (!config?.isEnabled) throw Object.assign(new Error('Enable seller Receivables Accounting before applying marketplace repayments.'), { statusCode: 409 })
  if (!config.marketplaceSettlementAccountId) throw Object.assign(new Error('The seller marketplace settlement account is unavailable; payment was not recorded.'), { statusCode: 409 })
  const userId = await sellerPostingUser(client, invoice.sellerTenantId)
  const settlementAccountId = transactionAccountId || config.marketplaceSettlementAccountId
  const payment = await client.customerPayment.create({ data: {
    tenantId: invoice.sellerTenantId, branchId: sale.branchId, customerId: sale.customerId, saleId: sale.id,
    amount, paymentMethod: paymentMethod || 'procurement_settlement', reference: supplierPayment.reference || supplierPayment.id,
    transactionId: supplierPayment.transactionId || null, idempotencyKey, allocationMode: 'explicit',
    notes: transactionAccountId
      ? `Seller-recorded marketplace receipt ${supplierPayment.id}; mirrored to buyer payable through Marketplace Settlement Clearing.`
      : `Seller-approved buyer repayment ${supplierPayment.id}; settled to Marketplace Settlement Clearing.`,
  } })
  await client.customerPaymentAllocation.create({ data: {
    tenantId: invoice.sellerTenantId, customerId: sale.customerId, paymentId: payment.id,
    targetType: 'sale', saleId: sale.id, amount, createdById: userId,
  } })
  const remaining = Math.max(0, money(sale.balance - amount))
  await client.saleRecord.update({ where: { id: sale.id }, data: {
    amountPaid: { increment: amount }, balance: remaining, paymentStatus: remaining <= 0.01 ? 'paid' : 'partial',
  } })
  await client.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: amount } } })
  const posting = await postReceivablesJournal(client, {
    tenantId: invoice.sellerTenantId, branchId: sale.branchId, userId,
    sourceType: 'PROCUREMENT_SELLER_PAYMENT', sourceId: supplierPayment.id,
    date: supplierPayment.createdAt, reference: supplierPayment.reference || supplierPayment.id,
    description: `Seller-approved marketplace repayment received from buyer; ${invoice.invoiceNo}`,
    lines: receiptCollectionLines(config, {
      transactionAccountId: settlementAccountId, amount, receivableApplied: amount,
      reference: supplierPayment.reference || supplierPayment.id,
    }), allowDisabled: true,
  })
  if (!posting.posted && !posting.duplicate) throw Object.assign(new Error('Seller payment journal was not posted.'), { statusCode: 409 })
  return payment
}
