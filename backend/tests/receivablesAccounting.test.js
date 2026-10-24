import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cashSaleRecognitionLines,
  creditNoteRecognitionLines,
  customerCreditApplicationLines,
  customerRefundLines,
  posReturnRecognitionLines,
  postCustomerCreditApplicationJournal,
  receiptCollectionLines,
  saleRecognitionLines,
  validateReceivablesAccountingConfig,
} from '../src/services/receivablesAccountingService.js'
import { availableAdvanceFromReceipt, customerCreditOffset } from '../src/services/customerCreditApplicationService.js'

const config = {
  receivableAccountId: 'ar',
  salesRevenueAccountId: 'revenue',
  taxPayableAccountId: 'tax',
  salesReturnsAccountId: 'returns',
  costOfGoodsSoldAccountId: 'cogs',
  inventoryAccountId: 'inventory',
  customerAdvancesAccountId: 'advances',
  openingBalanceEquityAccountId: 'opening-equity',
}

function assertBalanced(lines) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0)
  const credit = lines.reduce((sum, line) => sum + line.credit, 0)
  assert.equal(Math.round(debit * 100), Math.round(credit * 100))
}

test('credit sale recognition debits receivables and recognizes net revenue, tax, and COGS', () => {
  const lines = saleRecognitionLines(config, { total: 115, tax: 15 }, [{ cost: 20, quantity: 2, product: { itemType: 'product' } }])
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'ar').debit, 115)
  assert.equal(lines.find((line) => line.accountId === 'revenue').credit, 100)
  assert.equal(lines.find((line) => line.accountId === 'tax').credit, 15)
  assert.equal(lines.find((line) => line.accountId === 'cogs').debit, 40)
  assert.equal(lines.find((line) => line.accountId === 'inventory').credit, 40)
})

test('seller marketplace invoice recognizes delivery recovery as revenue without altering product COGS', () => {
  const lines = saleRecognitionLines(config, { total: 130, tax: 15, freightAmount: 15 }, [{ cost: 20, quantity: 2, product: { itemType: 'product' } }])
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'ar').debit, 130)
  assert.equal(lines.find((line) => line.accountId === 'revenue').credit, 115)
  assert.equal(lines.find((line) => line.accountId === 'tax').credit, 15)
  assert.equal(lines.find((line) => line.accountId === 'cogs').debit, 40)
})

test('cash sale recognition posts proceeds to the linked transaction account', () => {
  const lines = cashSaleRecognitionLines(config, { total: 115, tax: 15 }, [{ cost: 20, quantity: 2, product: { itemType: 'product' } }], 'till')
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'till').debit, 115)
})

test('service-only sales do not relieve inventory or recognize COGS', () => {
  const lines = saleRecognitionLines(config, { total: 50, tax: 0 }, [{ cost: 8, quantity: 1, product: { itemType: 'service' } }])
  assertBalanced(lines)
  assert.equal(lines.some((line) => line.accountId === 'inventory' || line.accountId === 'cogs'), false)
})

test('receipt splits applied receivable and unapplied customer advance without changing cash total', () => {
  const lines = receiptCollectionLines(config, { transactionAccountId: 'till', amount: 120, receivableApplied: 100 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'ar').credit, 100)
  assert.equal(lines.find((line) => line.accountId === 'advances').credit, 20)
})

test('applying a customer advance clears the liability into receivables without touching cash', () => {
  const lines = customerCreditApplicationLines(config, { amount: 75, reference: 'SALE-1' })
  assertBalanced(lines)
  assert.deepEqual(lines.map(({ accountId, debit, credit }) => ({ accountId, debit, credit })), [
    { accountId: 'advances', debit: 75, credit: 0 },
    { accountId: 'ar', debit: 0, credit: 75 },
  ])
})

test('legacy customer receipts expose only the amount left after settling receivables at receipt date', () => {
  assert.equal(availableAdvanceFromReceipt({ amount: 500, allocatedToCustomer: 500, alreadyApplied: 0, balanceBefore: 300 }), 200)
  assert.equal(availableAdvanceFromReceipt({ amount: 500, allocatedToCustomer: 500, alreadyApplied: 50, balanceBefore: 300 }), 150)
  assert.equal(availableAdvanceFromReceipt({ amount: 500, allocatedToCustomer: 500, alreadyApplied: 0, balanceBefore: 900 }), 0)
  assert.equal(availableAdvanceFromReceipt({ amount: 500, allocatedToCustomer: 150, alreadyApplied: 0, balanceBefore: 0 }), 150)
})

test('existing customer funds offset a credit sale before the remaining balance is checked', () => {
  assert.equal(customerCreditOffset(100, 30), 30)
  assert.equal(100 - customerCreditOffset(100, 30), 70)
  assert.equal(customerCreditOffset(100, 150), 100)
  assert.equal(customerCreditOffset(100, 0), 0)
})

test('customer advance availability is checked with a database-side sum of prior posted applications', async () => {
  const mapped = { ...config, isEnabled: true }
  const roleTypes = {
    receivableAccountId: 'asset', salesRevenueAccountId: 'revenue', taxPayableAccountId: 'liability',
    salesReturnsAccountId: 'revenue', costOfGoodsSoldAccountId: 'expense', inventoryAccountId: 'asset',
    customerAdvancesAccountId: 'liability', openingBalanceEquityAccountId: 'equity',
  }
  let journalCreated = false
  const client = {
    receivablesAccountingConfig: { findUnique: async () => mapped },
    journalEntry: {
      findFirst: async ({ where }) => where.sourceType === 'CUSTOMER_RECEIPT'
        ? { lines: [{ accountId: 'advances', debit: 0, credit: 100 }] }
        : null,
      create: async ({ data }) => { journalCreated = true; return { id: 'new-journal', ...data } },
    },
    $queryRaw: async (parts, ...values) => {
      assert.match(parts.join('?'), /SUM\(jl\."debit" - jl\."credit"\)/)
      assert.deepEqual(values, ['tenant', 'payment-1', 'current-application', 'advances'])
      return [{ amount: 30 }]
    },
    account: {
      findMany: async ({ where }) => where.id.in.map((id) => ({
        id,
        type: Object.entries(roleTypes).find(([key]) => mapped[key] === id)?.[1] || 'asset',
        name: id,
        description: null,
        subType: null,
        isActive: true,
        _count: { children: 0 },
      })),
      update: async () => ({}),
    },
  }

  const result = await postCustomerCreditApplicationJournal(client, {
    tenantId: 'tenant',
    userId: 'user',
    application: { id: 'current-application', sourceId: 'payment-1', amount: 70, createdAt: new Date() },
    reference: 'SALE-1',
  })

  assert.equal(result.posted, true)
  assert.equal(journalCreated, true)
})

test('missing historical legacy receipt journal is reconstructed with its receipt-date receivable/advance split', async () => {
  const mapped = { ...config, isEnabled: true }
  const roleTypes = {
    receivableAccountId: 'asset', salesRevenueAccountId: 'revenue', taxPayableAccountId: 'liability',
    salesReturnsAccountId: 'revenue', costOfGoodsSoldAccountId: 'expense', inventoryAccountId: 'asset',
    customerAdvancesAccountId: 'liability', openingBalanceEquityAccountId: 'equity',
  }
  const receiptDate = new Date('2026-10-20T10:00:00Z')
  const entries = new Map()
  const payment = {
    id: 'payment-legacy', tenantId: 'tenant', customerId: 'customer-1', saleId: null,
    amount: 100, allocationMode: 'legacy', branchId: null, reference: 'RCPT-1', createdAt: receiptDate,
    allocations: [],
  }
  const client = {
    $queryRaw: async (parts) => parts.join('?').includes('SUM(jl."debit" - jl."credit")') ? [{ amount: 0 }] : [],
    receivablesAccountingConfig: { findUnique: async () => mapped },
    customer: { findFirst: async () => ({ id: 'customer-1', openingBalance: 60, openingBalanceDate: new Date('2026-10-01T00:00:00Z'), createdAt: receiptDate }) },
    saleRecord: { findMany: async () => [] },
    customerPayment: { findFirst: async () => payment, findMany: async () => [] },
    customerPaymentAllocation: { findMany: async () => [] },
    customerWithdrawal: { aggregate: async () => ({ _sum: { amount: 0 } }) },
    creditNote: { findMany: async () => [] },
    saleReturn: { findMany: async () => [] },
    customerCreditApplication: { findMany: async () => [] },
    cashTransaction: { findMany: async () => [{ id: 'cash-row', accountId: 'cash-1', amount: 100, userId: 'cashier', createdAt: receiptDate, reference: 'RCPT-1' }] },
    cashAccount: { findFirst: async () => ({ id: 'cash-1', tenantId: 'tenant', branchId: null }) },
    account: {
      findFirst: async () => ({ id: 'till', description: 'Linked transaction account cashAccount:cash-1', isActive: true }),
      findMany: async ({ where }) => where.id.in.map((id) => ({
        id,
        type: id === 'till' ? 'asset' : Object.entries(roleTypes).find(([key]) => mapped[key] === id)?.[1] || 'asset',
        name: id,
        description: id === 'till' ? 'Linked transaction account cashAccount:cash-1' : null,
        subType: null,
        isActive: true,
        _count: { children: 0 },
      })),
      update: async () => ({}),
    },
    journalEntry: {
      findFirst: async ({ where }) => entries.get(`${where.sourceType}:${where.sourceId}`) || null,
      create: async ({ data }) => {
        const entry = { id: `journal-${entries.size + 1}`, ...data, lines: data.lines.create }
        entries.set(`${data.sourceType}:${data.sourceId}`, entry)
        return entry
      },
    },
  }

  const result = await postCustomerCreditApplicationJournal(client, {
    tenantId: 'tenant', userId: 'user',
    application: { id: 'application-1', sourceId: payment.id, customerId: payment.customerId, amount: 40, createdAt: new Date('2026-10-24T10:00:00Z') },
    reference: 'SALE-1',
  })

  const receipt = entries.get(`CUSTOMER_RECEIPT:${payment.id}`)
  assert.ok(receipt)
  assert.equal(receipt.lines.find((line) => line.accountId === 'till').debit, 100)
  assert.equal(receipt.lines.find((line) => line.accountId === 'ar').credit, 60)
  assert.equal(receipt.lines.find((line) => line.accountId === 'advances').credit, 40)
  assert.equal(result.posted, true)
})

test('legacy receipt journal that credited excess to receivables gets a balanced advance reclassification', async () => {
  const mapped = { ...config, isEnabled: true }
  const roleTypes = {
    receivableAccountId: 'asset', salesRevenueAccountId: 'revenue', taxPayableAccountId: 'liability',
    salesReturnsAccountId: 'revenue', costOfGoodsSoldAccountId: 'expense', inventoryAccountId: 'asset',
    customerAdvancesAccountId: 'liability', openingBalanceEquityAccountId: 'equity',
  }
  const receiptDate = new Date('2026-10-20T10:00:00Z')
  const entries = new Map([['CUSTOMER_RECEIPT:payment-legacy', {
    id: 'old-receipt-journal', lines: [
      { accountId: 'till', debit: 100, credit: 0 },
      { accountId: 'ar', debit: 0, credit: 100 },
    ],
  }]])
  const payment = {
    id: 'payment-legacy', tenantId: 'tenant', customerId: 'customer-1', saleId: null,
    amount: 100, allocationMode: 'legacy', branchId: null, reference: 'RCPT-1', createdAt: receiptDate, allocations: [],
  }
  const client = {
    $queryRaw: async (parts) => parts.join('?').includes('SUM(jl."debit" - jl."credit")') ? [{ amount: 0 }] : [],
    receivablesAccountingConfig: { findUnique: async () => mapped },
    customer: { findFirst: async () => ({ id: 'customer-1', openingBalance: 60, openingBalanceDate: new Date('2026-10-01T00:00:00Z'), createdAt: receiptDate }) },
    saleRecord: { findMany: async () => [] },
    customerPayment: { findFirst: async () => payment, findMany: async () => [] },
    customerPaymentAllocation: { findMany: async () => [] },
    customerWithdrawal: { aggregate: async () => ({ _sum: { amount: 0 } }) },
    creditNote: { findMany: async () => [] },
    saleReturn: { findMany: async () => [] },
    customerCreditApplication: { findMany: async () => [] },
    cashTransaction: { findMany: async () => [{ id: 'cash-row', accountId: 'cash-1', amount: 100, userId: 'cashier', createdAt: receiptDate, reference: 'RCPT-1' }] },
    cashAccount: { findFirst: async () => ({ id: 'cash-1', tenantId: 'tenant', branchId: null }) },
    account: {
      findFirst: async () => ({ id: 'till', description: 'Linked transaction account cashAccount:cash-1', isActive: true }),
      findMany: async ({ where }) => where.id.in.map((id) => ({
        id, type: id === 'till' ? 'asset' : Object.entries(roleTypes).find(([key]) => mapped[key] === id)?.[1] || 'asset',
        name: id, description: id === 'till' ? 'Linked transaction account cashAccount:cash-1' : null,
        subType: null, isActive: true, _count: { children: 0 },
      })),
      update: async () => ({}),
    },
    journalEntry: {
      findFirst: async ({ where }) => entries.get(`${where.sourceType}:${where.sourceId}`) || null,
      create: async ({ data }) => {
        const entry = { id: `journal-${entries.size + 1}`, ...data, lines: data.lines.create }
        entries.set(`${data.sourceType}:${data.sourceId}`, entry)
        return entry
      },
    },
  }

  await postCustomerCreditApplicationJournal(client, {
    tenantId: 'tenant', userId: 'user',
    application: { id: 'application-1', sourceId: payment.id, customerId: payment.customerId, amount: 40, createdAt: new Date('2026-10-24T10:00:00Z') },
    reference: 'SALE-1',
  })

  const reclass = entries.get(`CUSTOMER_RECEIPT_ADVANCE_RECLASS:${payment.id}`)
  assert.ok(reclass)
  assert.equal(reclass.lines.find((line) => line.accountId === 'ar').debit, 40)
  assert.equal(reclass.lines.find((line) => line.accountId === 'advances').credit, 40)
  assert.equal(reclass.lines.reduce((sum, line) => sum + line.debit, 0), reclass.lines.reduce((sum, line) => sum + line.credit, 0))
  assert.ok(entries.has(`CUSTOMER_CREDIT_APPLICATION:application-1`))
})

test('historical receipt reconciliation refuses ambiguous or missing cash evidence', async () => {
  const mapped = { ...config, isEnabled: true }
  const receiptDate = new Date('2026-10-20T10:00:00Z')
  const client = {
    $queryRaw: async (parts) => parts.join('?').includes('SUM(jl."debit" - jl."credit")') ? [{ amount: 0 }] : [],
    receivablesAccountingConfig: { findUnique: async () => mapped },
    journalEntry: { findFirst: async () => null },
    customerPayment: { findFirst: async () => ({
      id: 'payment-legacy', customerId: 'customer-1', saleId: null, amount: 100,
      allocationMode: 'explicit', reference: 'RCPT-1', createdAt: receiptDate,
      allocations: [{ targetType: 'customer_account', amount: 100 }],
    }), findMany: async () => [] },
    customer: { findFirst: async () => ({ id: 'customer-1', openingBalance: 0, createdAt: receiptDate }) },
    saleRecord: { findMany: async () => [] }, customerPaymentAllocation: { findMany: async () => [] },
    customerWithdrawal: { aggregate: async () => ({ _sum: { amount: 0 } }) }, creditNote: { findMany: async () => [] },
    saleReturn: { findMany: async () => [] }, customerCreditApplication: { findMany: async () => [] },
    cashTransaction: { findMany: async () => [] },
  }
  await assert.rejects(
    postCustomerCreditApplicationJournal(client, {
      tenantId: 'tenant', userId: 'user',
      application: { id: 'application-1', sourceId: 'payment-legacy', customerId: 'customer-1', amount: 40, createdAt: new Date() },
      reference: 'SALE-1',
    }),
    (error) => error.code === 'CUSTOMER_ADVANCE_SOURCE_UNRESOLVED' && /no unique matching cash transaction/i.test(error.message),
  )
})

test('customer opening balance is recognized as receivable against opening equity', async () => {
  const { customerOpeningBalanceLines } = await import('../src/services/receivablesAccountingService.js')
  const lines = customerOpeningBalanceLines(config, 450000, 'Opening receivable for John Traders')
  assertBalanced(lines)
  assert.deepEqual(lines.map((line) => [line.accountId, line.debit, line.credit]), [
    ['ar', 450000, 0], ['opening-equity', 0, 450000],
  ])
})

test('credit note separates receivable credit from the paid refund liability', () => {
  const lines = creditNoteRecognitionLines(config, { amount: 50, taxAmount: 5, refundAmount: 10 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'returns').debit, 45)
  assert.equal(lines.find((line) => line.accountId === 'tax').debit, 5)
  assert.equal(lines.find((line) => line.accountId === 'ar').credit, 40)
  assert.equal(lines.find((line) => line.accountId === 'advances').credit, 10)
})

test('cash refund clears customer advances against the linked transaction account', () => {
  const lines = customerRefundLines(config, { transactionAccountId: 'till', amount: 10 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'advances').debit, 10)
  assert.equal(lines.find((line) => line.accountId === 'till').credit, 10)
})

test('POS return reverses net revenue, tax, cash, and returned inventory cost', () => {
  const lines = posReturnRecognitionLines(config, { transactionAccountId: 'till', amount: 55, taxAmount: 5, returnedCogs: 18 })
  assertBalanced(lines)
  assert.equal(lines.find((line) => line.accountId === 'returns').debit, 50)
  assert.equal(lines.find((line) => line.accountId === 'tax').debit, 5)
  assert.equal(lines.find((line) => line.accountId === 'till').credit, 55)
  assert.equal(lines.find((line) => line.accountId === 'inventory').debit, 18)
  assert.equal(lines.find((line) => line.accountId === 'cogs').credit, 18)
})

test('mapping validation accepts distinct tenant-owned leaf accounts with matching normal types', async () => {
  const config = {
    ...Object.fromEntries(Object.keys({
      receivableAccountId: 1, salesRevenueAccountId: 1, taxPayableAccountId: 1,
      salesReturnsAccountId: 1, costOfGoodsSoldAccountId: 1, inventoryAccountId: 1,
      customerAdvancesAccountId: 1,
      openingBalanceEquityAccountId: 1,
    }).map((field) => [field, field])),
    isEnabled: true,
  }
  const types = { receivableAccountId: 'asset', salesRevenueAccountId: 'revenue', taxPayableAccountId: 'liability', salesReturnsAccountId: 'revenue', costOfGoodsSoldAccountId: 'expense', inventoryAccountId: 'asset', customerAdvancesAccountId: 'liability', openingBalanceEquityAccountId: 'equity' }
  const client = { account: { findMany: async () => Object.entries(types).map(([field, type]) => ({ id: field, type, name: field, description: null, _count: { children: 0 } })) } }
  const result = await validateReceivablesAccountingConfig(client, 'tenant', config, { requireEnabled: true })
  assert.equal(result.valid, true)
})

test('marketplace settlements require a separate postable asset account', async () => {
  const mapped = {
    ...Object.fromEntries(Object.keys({
      receivableAccountId: 1, salesRevenueAccountId: 1, taxPayableAccountId: 1,
      salesReturnsAccountId: 1, costOfGoodsSoldAccountId: 1, inventoryAccountId: 1,
      customerAdvancesAccountId: 1, openingBalanceEquityAccountId: 1,
    }).map((field) => [field, field])),
    marketplaceSettlementAccountId: 'settlement', isEnabled: true,
  }
  const types = { receivableAccountId: 'asset', salesRevenueAccountId: 'revenue', taxPayableAccountId: 'liability', salesReturnsAccountId: 'revenue', costOfGoodsSoldAccountId: 'expense', inventoryAccountId: 'asset', customerAdvancesAccountId: 'liability', openingBalanceEquityAccountId: 'equity', marketplaceSettlementAccountId: 'asset' }
  const client = { account: { findMany: async () => Object.entries(types).map(([field, type]) => ({ id: field === 'marketplaceSettlementAccountId' ? 'settlement' : field, type, name: field, description: null, _count: { children: 0 } })) } }
  const result = await validateReceivablesAccountingConfig(client, 'tenant', mapped, { requireEnabled: true })
  assert.equal(result.valid, true)
  assert.equal(receiptCollectionLines(mapped, { transactionAccountId: mapped.marketplaceSettlementAccountId, amount: 125, receivableApplied: 125 }).find((line) => line.accountId === 'settlement').debit, 125)
})

test('inventory accounting refuses sales with no saved line cost', () => {
  assert.throws(() => saleRecognitionLines(config, { total: 10, tax: 0 }, [{ cost: null, quantity: 1, product: { itemType: 'product' } }]), /sale-time product cost is missing/)
})
