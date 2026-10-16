import test from 'node:test'
import assert from 'node:assert/strict'
import { approveProcurementSupplierPayment, registerProcurementSupplierPaymentApproval } from '../src/services/procurementSellerAccountingService.js'

test('buyer repayment stays pending until seller approval, then posts once to marketplace clearing', async () => {
  const config = {
    receivableAccountId: 'ar', salesRevenueAccountId: 'revenue', taxPayableAccountId: 'tax',
    salesReturnsAccountId: 'returns', costOfGoodsSoldAccountId: 'cogs', inventoryAccountId: 'inventory',
    customerAdvancesAccountId: 'advances', openingBalanceEquityAccountId: 'equity',
    marketplaceSettlementAccountId: 'clearing', isEnabled: true,
  }
  const accountTypes = { ar: 'asset', revenue: 'revenue', tax: 'liability', returns: 'revenue', cogs: 'expense', inventory: 'asset', advances: 'liability', equity: 'equity', clearing: 'asset' }
  const accounts = Object.fromEntries(Object.entries(accountTypes).map(([id, type]) => [id, { id, type, name: id, description: null, balance: 0, _count: { children: 0 } }]))
  const sale = { id: 'sale-1', tenantId: 'seller', customerId: 'customer-1', branchId: 'branch-1', balance: 100, amountPaid: 0 }
  const approval = { id: 'approval-1', invoiceId: 'invoice-1', supplierPaymentId: 'buyer-payment-1', sellerTenantId: 'seller', buyerTenantId: 'buyer', amount: 40, status: 'pending' }
  const payments = new Map()
  let allocations = 0
  let journals = 0
  let cashWrites = 0
  let sellerCustomerUpdates = 0
  let approvalCreates = 0
  const client = {
    procurementInvoice: { findFirst: async () => ({ id: 'invoice-1', sellerTenantId: 'seller', buyerTenantId: 'buyer', sellerSaleRecordId: sale.id, supplierPurchaseId: 'purchase-1', invoiceNo: 'INV-1', sellerSaleRecord: { id: sale.id } }) },
    procurementPaymentApproval: { create: async ({ data }) => { approvalCreates += 1; Object.assign(approval, data); return approval } },
    supplierPayment: { findUnique: async () => ({ id: 'buyer-payment-1', purchaseId: 'purchase-1', amount: 40, reference: 'BANK-1', createdAt: new Date() }) },
    saleRecord: {
      findFirst: async () => ({ ...sale }),
      update: async ({ data }) => { sale.amountPaid += data.amountPaid.increment; sale.balance = data.balance; sale.paymentStatus = data.paymentStatus },
    },
    customerPayment: {
      findUnique: async ({ where }) => where.idempotencyKey ? payments.get(where.idempotencyKey) || null : null,
      create: async ({ data }) => { const row = { id: 'seller-payment-1', ...data }; payments.set(data.idempotencyKey, row); return row },
    },
    customerPaymentAllocation: { create: async ({ data }) => { allocations += 1; return data } },
    customer: { update: async () => { sellerCustomerUpdates += 1; return {} } },
    tenant: { findUnique: async () => ({ ownerId: 'seller-owner' }) },
    receivablesAccountingConfig: { findUnique: async () => config },
    account: {
      findMany: async ({ where }) => where.id.in.map((id) => accounts[id]).filter(Boolean),
      update: async ({ where, data }) => { accounts[where.id].balance += data.balance.increment },
    },
    journalEntry: {
      findFirst: async () => null,
      create: async ({ data }) => { journals += 1; assert.equal(data.tenantId, 'seller'); assert.equal(data.lines.create.find((line) => line.accountId === 'clearing').debit, 40); assert.equal(data.lines.create.find((line) => line.accountId === 'ar').credit, 40); return { id: `journal-${journals}` } },
    },
    cashTransaction: { create: async () => { cashWrites += 1 } },
    cashAccount: { update: async () => { cashWrites += 1 } },
  }
  const supplierPayment = { id: 'buyer-payment-1', amount: 40, reference: 'BANK-1', createdAt: new Date() }

  const pending = await registerProcurementSupplierPaymentApproval(client, { supplierPayment, purchaseId: 'purchase-1' })
  assert.equal(pending.status, 'pending')
  assert.equal(approvalCreates, 1)
  assert.equal(sale.balance, 100)
  assert.equal(sale.amountPaid, 0)
  assert.equal(sellerCustomerUpdates, 0)
  assert.equal(journals, 0)

  const first = await approveProcurementSupplierPayment(client, { approval: pending })
  assert.equal(first.paymentMethod, 'procurement_settlement')
  assert.equal(sale.balance, 60)
  assert.equal(sale.amountPaid, 40)
  assert.equal(allocations, 1)
  assert.equal(journals, 1)
  assert.equal(accounts.clearing.balance, 40)
  assert.equal(cashWrites, 0)

  const retry = await approveProcurementSupplierPayment(client, { approval: pending })
  assert.equal(retry.id, first.id)
  assert.equal(allocations, 1)
  assert.equal(journals, 1)
  assert.equal(sale.balance, 60)
})
