import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requirePermission, requireTenant, checkPaymentMethodPermission, loadUserPermissions } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'
import { checkUsageLimit } from '../src/utils/usageLimits.js'
import { syncLinkedTransactionAccountBalance } from '../src/utils/accountingSync.js'
import { attachRepaymentTrustScores, getRepaymentTrustScore } from '../src/utils/customerCreditScore.js'

const router = express.Router()
const prisma = new PrismaClient()

const toMoney = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const cashAccountMatchesPaymentMethod = (cashAccount, paymentMethod) => {
  const type = String(cashAccount?.type || '').toLowerCase()
  if (paymentMethod === 'cash') return type === 'cash' || type === 'safe'
  if (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'bank') return type === 'bank'
  if (paymentMethod === 'mobile_money') return type === 'mobile_money'
  if (paymentMethod === 'card') return type === 'card'
  return false
}

async function resolveReceiptCashAccount(client, scope, req, paymentMethod, cashAccountId = null) {
  if (cashAccountId) {
    const account = await client.cashAccount.findFirst({
      where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true }
    })
    if (!account) {
      throw Object.assign(new Error('Invalid or inactive cash account'), { statusCode: 400 })
    }
    if (!cashAccountMatchesPaymentMethod(account, paymentMethod)) {
      throw Object.assign(new Error(`Selected account cannot be used for ${paymentMethod} payments`), { statusCode: 400 })
    }
    return account
  }

  if (req.userCashAccountId) {
    const account = await client.cashAccount.findFirst({
      where: { id: req.userCashAccountId, tenantId: scope.tenantId, isActive: true }
    })
    if (account && cashAccountMatchesPaymentMethod(account, paymentMethod)) {
      return account
    }
  }

  throw Object.assign(
    new Error(`Select an existing ${paymentMethodAccountLabel(paymentMethod)} account for ${paymentMethod} payments. Create it first in Transaction Accounts if it does not exist.`),
    { statusCode: 400, code: 'PAYMENT_ACCOUNT_REQUIRED' }
  )
}

const paymentMethodAccountLabel = (paymentMethod) => {
  if (paymentMethod === 'cash') return 'cash or safe'
  if (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'bank') return 'bank'
  if (paymentMethod === 'mobile_money') return 'mobile money'
  if (paymentMethod === 'card') return 'card'
  return 'matching'
}

const openingBalanceRoles = new Set(['owner', 'admin', 'saas_admin', 'platform_admin', 'super_admin'])

const canManageOpeningBalance = (req) => (
  openingBalanceRoles.has(req.user?.role) ||
  req.user?.isPlatformUser ||
  (req.user?.permissions || []).includes('*')
)

const hasOpeningBalanceInput = (body) => (
  Object.prototype.hasOwnProperty.call(body, 'openingBalance') ||
  Object.prototype.hasOwnProperty.call(body, 'openingBalanceDate') ||
  Object.prototype.hasOwnProperty.call(body, 'openingBalanceNote')
)

const parseOpeningBalanceDate = (value, openingBalance) => {
  if (!value) return openingBalance > 0 ? new Date() : null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const paymentStatusFor = (total, amountPaid) => {
  if (amountPaid >= total) return 'paid'
  if (amountPaid > 0) return 'partial'
  return 'unpaid'
}

const validateCreditLimitRequired = (creditLimit) => {
  const creditLimitAmount = toMoney(creditLimit)
  if (creditLimitAmount <= 0) {
    return {
      valid: false,
      amount: creditLimitAmount,
      message: 'Customer credit limit is required. Set a credit limit greater than zero before saving this customer.'
    }
  }
  return { valid: true, amount: creditLimitAmount }
}

const validateCreditSaleLimit = (customer, balance) => {
  if (balance <= 0) return { valid: true }
  const creditLimitAmount = toMoney(customer.creditLimit)
  if (creditLimitAmount <= 0) {
    return {
      valid: false,
      statusCode: 400,
      code: 'CUSTOMER_CREDIT_LIMIT_REQUIRED',
      message: `Set a credit limit for ${customer.name || 'this customer'} before making a credit sale.`
    }
  }
  const newBalance = toMoney(customer.balance) + balance
  if (newBalance > creditLimitAmount) {
    return {
      valid: false,
      statusCode: 400,
      code: 'CUSTOMER_CREDIT_LIMIT_EXCEEDED',
      message: `Credit limit exceeded. Available credit is ${Math.max(0, creditLimitAmount - toMoney(customer.balance)).toFixed(2)}.`
    }
  }
  return { valid: true }
}

const userSelect = { select: { id: true, fname: true, lname: true } }

const withUser = (record) => {
  if (!record) return record
  const { User, ...rest } = record
  return { ...rest, user: User || record.user || null }
}

const userName = (user) => [user?.fname, user?.lname].filter(Boolean).join(' ') || 'Staff'

const sortLedgerRows = (rows) => rows.sort((a, b) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  const aTime = a.date ? new Date(a.date).getTime() : 0
  const bTime = b.date ? new Date(b.date).getTime() : 0
  if (aTime !== bTime) return aTime - bTime
  return String(a.reference || a.id).localeCompare(String(b.reference || b.id))
})

// === CUSTOMERS ===

// Get all customers for tenant
router.get('/customers', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, search, status } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(status && status !== 'all' && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      })
    })

    const [customersRaw, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.customer.count({ where })
    ])
    const customers = await attachRepaymentTrustScores(prisma, scope, customersRaw)

    res.json({
      customers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get customers error:', error)
    handleBranchError(res, error, 'Failed to fetch customers')
  }
})

// Get one customer's active credit position with outstanding goods/items
router.get('/customers/:id/credit-info', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params

    const customer = await prisma.customer.findFirst({
      where: scopedWhere(scope, { id }),
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        creditLimit: true,
        balance: true,
        openingBalance: true,
        openingBalanceDate: true,
        openingBalanceNote: true,
        status: true
      }
    })

    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    const [outstandingSales, recentPayments, trustScore] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedWhere(scope, {
          customerId: id,
          balance: { gt: 0 },
          status: { not: 'cancelled' }
        }),
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, itemType: true, baseUnit: true } }
            }
          },
          User: { select: { id: true, fname: true, lname: true } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(scope, { customerId: id }),
        include: {
          sale: { select: { id: true, receiptNo: true } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      getRepaymentTrustScore(prisma, scope, customer)
    ])

    const outstandingItems = outstandingSales.flatMap((sale) =>
      sale.items.map((item) => ({
        id: item.id,
        saleId: sale.id,
        receiptNo: sale.receiptNo,
        date: sale.createdAt,
        dueDate: sale.dueDate,
        productId: item.productId,
        productName: item.product?.name || 'Item',
        itemType: item.product?.itemType || 'product',
        quantity: item.quantity,
        unitName: item.unitName || item.product?.baseUnit || '',
        unitPrice: item.price,
        discount: toMoney(item.discount) + toMoney(item.cashDiscount),
        total: item.total,
        saleTotal: sale.total,
        amountPaid: sale.amountPaid,
        saleBalance: sale.balance,
        paymentStatus: sale.paymentStatus,
        staff: [sale.User?.fname, sale.User?.lname].filter(Boolean).join(' ') || 'Staff',
        branch: sale.branch?.name || ''
      }))
    )

    res.json({
      customer: { ...customer, trustScore },
      summary: {
        balance: toMoney(customer.balance),
        creditLimit: toMoney(customer.creditLimit),
        trustScore,
        openingBalance: toMoney(customer.openingBalance),
        outstandingSalesCount: outstandingSales.length,
        outstandingItemsCount: outstandingItems.length,
        overdueSalesCount: outstandingSales.filter((sale) => sale.dueDate && sale.dueDate < new Date()).length,
        oldestOutstandingDate: outstandingSales[0]?.createdAt || customer.openingBalanceDate || null
      },
      outstandingSales: outstandingSales.map((sale) => ({
        id: sale.id,
        receiptNo: sale.receiptNo,
        date: sale.createdAt,
        dueDate: sale.dueDate,
        total: sale.total,
        amountPaid: sale.amountPaid,
        balance: sale.balance,
        paymentStatus: sale.paymentStatus,
        paymentMethod: sale.paymentMethod,
        staff: [sale.User?.fname, sale.User?.lname].filter(Boolean).join(' ') || 'Staff',
        branch: sale.branch?.name || '',
        items: sale.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name || 'Item',
          itemType: item.product?.itemType || 'product',
          quantity: item.quantity,
          unitName: item.unitName || item.product?.baseUnit || '',
          unitPrice: item.price,
          discount: toMoney(item.discount) + toMoney(item.cashDiscount),
          total: item.total
        }))
      })),
      outstandingItems,
      recentPayments: recentPayments.map((payment) => ({
        id: payment.id,
        saleId: payment.saleId,
        receiptNo: payment.sale?.receiptNo || '',
        date: payment.createdAt,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference || payment.transactionId || '',
        notes: payment.notes || '',
        branch: payment.branch?.name || ''
      }))
    })
  } catch (error) {
    console.error('Customer credit info error:', error)
    handleBranchError(res, error, 'Failed to fetch customer credit information')
  }
})

// Get one customer's transaction history without requiring the statement report screen
router.get('/customers/:id/history', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params
    const limit = Math.min(Math.max(Number(req.query.limit || 250), 25), 1000)

    const customer = await prisma.customer.findFirst({
      where: scopedWhere(scope, { id }),
      include: { branch: { select: { id: true, name: true } } }
    })

    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    const customerNameFilter = customer.name
      ? { customerName: { equals: customer.name, mode: 'insensitive' } }
      : { id: '__no_matching_customer_name__' }

    const [receivableSales, payments, posSales, creditNotes, saleReturns, trustScore] = await Promise.all([
      prisma.saleRecord.findMany({
        where: scopedWhere(scope, { customerId: id, status: { not: 'cancelled' } }),
        include: {
          branch: { select: { id: true, name: true } },
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true, itemType: true } } } }
        },
        orderBy: { createdAt: 'asc' },
        take: limit
      }),
      prisma.customerPayment.findMany({
        where: scopedWhere(scope, { customerId: id }),
        include: {
          branch: { select: { id: true, name: true } },
          sale: { select: { id: true, receiptNo: true } }
        },
        orderBy: { createdAt: 'asc' },
        take: limit
      }),
      prisma.sale.findMany({
        where: scopedWhere(scope, { ...customerNameFilter, status: { not: 'cancelled' } }),
        include: {
          branch: { select: { id: true, name: true } },
          user: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true, itemType: true } } } }
        },
        orderBy: { createdAt: 'asc' },
        take: limit
      }),
      prisma.creditNote.findMany({
        where: scopedWhere(scope, { customerId: id, status: { not: 'cancelled' } }),
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
        take: limit
      }),
      prisma.saleReturn.findMany({
        where: scopedWhere(scope, { customerId: id, status: 'completed' }),
        include: {
          branch: { select: { id: true, name: true } },
          user: userSelect,
          sale: { select: { id: true, receiptNo: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true, itemType: true } } } }
        },
        orderBy: { createdAt: 'asc' },
        take: limit
      }),
      getRepaymentTrustScore(prisma, scope, customer)
    ])

    const rows = []
    const paymentTotalBySale = new Map()
    payments.forEach((payment) => {
      if (!payment.saleId) return
      paymentTotalBySale.set(payment.saleId, toMoney(paymentTotalBySale.get(payment.saleId)) + toMoney(payment.amount))
    })

    if (toMoney(customer.openingBalance) > 0) {
      rows.push({
        id: `opening-${customer.id}`,
        source: 'opening_balance',
        type: 'Opening Balance',
        date: customer.openingBalanceDate || customer.createdAt,
        reference: 'Opening Balance',
        description: customer.openingBalanceNote || 'Balance brought forward before using JibuSales',
        debit: toMoney(customer.openingBalance),
        credit: 0,
        amount: toMoney(customer.openingBalance),
        balanceImpact: toMoney(customer.openingBalance),
        affectsBalance: true,
        paymentMethod: null,
        status: 'system',
        branch: customer.branch?.name || '',
        staff: 'System',
        items: [],
        sortOrder: 0
      })
    }

    receivableSales.forEach((sale) => {
      rows.push({
        id: sale.id,
        source: 'receivable_sale',
        type: toMoney(sale.balance) > 0 ? 'Credit Sale' : 'Customer Sale',
        date: sale.createdAt,
        dueDate: sale.dueDate,
        reference: sale.receiptNo,
        description: `${sale.items.length || 0} item${sale.items.length === 1 ? '' : 's'} sold`,
        debit: toMoney(sale.total),
        credit: 0,
        amount: toMoney(sale.total),
        amountPaid: toMoney(sale.amountPaid),
        remainingBalance: toMoney(sale.balance),
        balanceImpact: toMoney(sale.total),
        affectsBalance: true,
        paymentMethod: sale.paymentMethod,
        status: sale.paymentStatus,
        branch: sale.branch?.name || '',
        staff: userName(sale.User),
        items: sale.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name || 'Item',
          sku: item.product?.sku || '',
          itemType: item.product?.itemType || 'product',
          quantity: item.quantity,
          unitName: item.unitName || '',
          unitPrice: item.price,
          discount: toMoney(item.discount) + toMoney(item.cashDiscount),
          total: item.total
        })),
        sortOrder: 10
      })

      const missingPayment = Math.max(0, Math.round((toMoney(sale.amountPaid) - toMoney(paymentTotalBySale.get(sale.id))) * 100) / 100)
      if (missingPayment > 0) {
        rows.push({
          id: `${sale.id}-paid-at-sale`,
          source: 'sale_payment_adjustment',
          type: 'Paid At Sale',
          date: sale.createdAt,
          reference: sale.receiptNo,
          description: `Payment captured on ${sale.receiptNo}`,
          debit: 0,
          credit: missingPayment,
          amount: missingPayment,
          balanceImpact: -missingPayment,
          affectsBalance: true,
          paymentMethod: sale.paymentMethod,
          status: 'paid',
          branch: sale.branch?.name || '',
          staff: userName(sale.User),
          items: [],
          sortOrder: 11
        })
      }
    })

    payments.forEach((payment) => {
      rows.push({
        id: payment.id,
        source: 'customer_payment',
        type: 'Payment',
        date: payment.createdAt,
        reference: payment.reference || payment.transactionId || payment.sale?.receiptNo || payment.id,
        description: payment.sale?.receiptNo ? `Payment for ${payment.sale.receiptNo}` : (payment.notes || 'Customer payment'),
        debit: 0,
        credit: toMoney(payment.amount),
        amount: toMoney(payment.amount),
        balanceImpact: -toMoney(payment.amount),
        affectsBalance: true,
        paymentMethod: payment.paymentMethod,
        status: 'paid',
        branch: payment.branch?.name || '',
        staff: '',
        items: [],
        sortOrder: 20
      })
    })

    creditNotes.forEach((note) => {
      rows.push({
        id: note.id,
        source: 'credit_note',
        type: 'Credit Note',
        date: note.createdAt,
        reference: note.noteNo,
        description: note.notes || note.reason || 'Customer credit note',
        debit: 0,
        credit: toMoney(note.amount),
        amount: toMoney(note.amount),
        balanceImpact: -toMoney(note.amount),
        affectsBalance: true,
        paymentMethod: null,
        status: note.status,
        branch: note.branch?.name || '',
        staff: '',
        items: [],
        sortOrder: 30
      })
    })

    saleReturns.forEach((ret) => {
      const affectsBalance = ret.refundMethod === 'credit'
      rows.push({
        id: ret.id,
        source: 'sale_return',
        type: 'Sale Return',
        date: ret.createdAt,
        reference: ret.returnNo,
        description: ret.sale?.receiptNo ? `Return for ${ret.sale.receiptNo}` : (ret.reason || 'Returned goods'),
        debit: 0,
        credit: affectsBalance ? toMoney(ret.total) : 0,
        amount: toMoney(ret.total),
        balanceImpact: affectsBalance ? -toMoney(ret.total) : 0,
        affectsBalance,
        paymentMethod: ret.refundMethod,
        status: ret.status,
        branch: ret.branch?.name || '',
        staff: userName(ret.user),
        items: ret.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name || 'Item',
          sku: item.product?.sku || '',
          itemType: item.product?.itemType || 'product',
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.total
        })),
        sortOrder: 40
      })
    })

    posSales.forEach((sale) => {
      rows.push({
        id: sale.id,
        source: 'pos_sale',
        type: 'Cash Sale',
        date: sale.createdAt,
        reference: sale.receiptNo,
        description: `${sale.items.length || 0} POS item${sale.items.length === 1 ? '' : 's'} sold`,
        debit: 0,
        credit: 0,
        amount: toMoney(sale.total),
        balanceImpact: 0,
        affectsBalance: false,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        branch: sale.branch?.name || '',
        staff: userName(sale.user),
        items: sale.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name || 'Item',
          sku: item.product?.sku || '',
          itemType: item.product?.itemType || 'product',
          quantity: item.quantity,
          unitName: item.unitName || '',
          unitPrice: item.price,
          discount: toMoney(item.discount) + toMoney(item.cashDiscount),
          total: item.total
        })),
        sortOrder: 50
      })
    })

    let runningBalance = 0
    const transactions = sortLedgerRows(rows).map(({ sortOrder, ...row }) => {
      runningBalance = Math.round((runningBalance + toMoney(row.balanceImpact)) * 100) / 100
      return { ...row, balance: runningBalance }
    }).reverse()

    const totals = rows.reduce((acc, row) => {
      acc.debit += toMoney(row.debit)
      acc.credit += toMoney(row.credit)
      acc.amount += toMoney(row.amount)
      if (row.source === 'receivable_sale') acc.receivableSales += toMoney(row.amount)
      if (row.source === 'pos_sale') acc.cashSales += toMoney(row.amount)
      if (row.source === 'customer_payment') acc.payments += toMoney(row.amount)
      if (row.source === 'credit_note') acc.creditNotes += toMoney(row.amount)
      if (row.source === 'sale_return') acc.returns += toMoney(row.amount)
      return acc
    }, { debit: 0, credit: 0, amount: 0, receivableSales: 0, cashSales: 0, payments: 0, creditNotes: 0, returns: 0 })

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        status: customer.status,
        creditLimit: toMoney(customer.creditLimit),
        balance: toMoney(customer.balance),
        openingBalance: toMoney(customer.openingBalance),
        openingBalanceDate: customer.openingBalanceDate,
        openingBalanceNote: customer.openingBalanceNote,
        trustScore
      },
      summary: {
        ...totals,
        transactionCount: transactions.length,
        currentBalance: toMoney(customer.balance),
        computedBalance: runningBalance,
        availableCredit: toMoney(customer.creditLimit) - toMoney(customer.balance),
        lastTransactionDate: transactions[0]?.date || null
      },
      transactions
    })
  } catch (error) {
    console.error('Customer history error:', error)
    handleBranchError(res, error, 'Failed to fetch customer transaction history')
  }
})

// Create new customer
router.post('/customers', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { name, email, phone, address, creditLimit = 0, notes, openingBalanceNote } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required' })
    }

    const creditLimitCheck = validateCreditLimitRequired(creditLimit)
    if (!creditLimitCheck.valid) {
      return res.status(400).json({ error: creditLimitCheck.message, code: 'CUSTOMER_CREDIT_LIMIT_REQUIRED' })
    }

    const openingBalance = toMoney(req.body.openingBalance, 0)
    if (openingBalance < 0) {
      return res.status(400).json({ error: 'Opening balance cannot be negative' })
    }

    if ((openingBalance > 0 || req.body.openingBalanceDate || openingBalanceNote) && !canManageOpeningBalance(req)) {
      return res.status(403).json({ error: 'Only owner and admin users can manage opening balances' })
    }

    const openingBalanceDate = parseOpeningBalanceDate(req.body.openingBalanceDate, openingBalance)
    if (req.body.openingBalanceDate && !openingBalanceDate) {
      return res.status(400).json({ error: 'Opening balance date is invalid' })
    }

    await checkUsageLimit(scope.tenantId, 'customers')

    // Check if customer already exists
    if (phone?.trim()) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          phone
        }
      })

      if (existingCustomer) {
        return res.status(400).json({ error: 'Customer with this phone number already exists' })
      }
    }

    const customerRaw = await prisma.customer.create({
      data: {
        name: name.trim(),
        email,
        phone,
        address,
        creditLimit: creditLimitCheck.amount,
        balance: openingBalance,
        openingBalance,
        openingBalanceDate,
        openingBalanceNote,
        notes,
        trustScore: 0,
        tenantId: scope.tenantId,
        branchId: scope.branchId
      }
    })

    const [customer] = await attachRepaymentTrustScores(prisma, scope, [customerRaw])
    res.status(201).json(customer)
  } catch (error) {
    if (error?.code === 'LIMIT_REACHED') return res.status(403).json({ error: error.message })
    console.error('Create customer error:', error)
    handleBranchError(res, error, 'Failed to create customer')
  }
})

// Update customer
router.put('/customers/:id', authenticateToken, requirePermission('canEditReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params
    const { name, email, phone, address, creditLimit, status, notes, branchId, openingBalanceNote } = req.body

    // Check if customer belongs to tenant
    const existingCustomer = await prisma.customer.findFirst({
      where: scopedWhere(scope, { id })
    })

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    if (hasOpeningBalanceInput(req.body) && !canManageOpeningBalance(req)) {
      return res.status(403).json({ error: 'Only owner and admin users can manage opening balances' })
    }

    const existingOpeningBalance = toMoney(existingCustomer.openingBalance, 0)
    let openingBalanceDelta = 0
    const openingBalanceData = {}
    if (Object.prototype.hasOwnProperty.call(req.body, 'openingBalance')) {
      const openingBalance = toMoney(req.body.openingBalance, 0)
      if (openingBalance < 0) {
        return res.status(400).json({ error: 'Opening balance cannot be negative' })
      }

      openingBalanceDelta = openingBalance - existingOpeningBalance
      if (openingBalanceDelta !== 0) {
        const transactionCount = await Promise.all([
          prisma.saleRecord.count({ where: scopedWhere(scope, { customerId: id }) }),
          prisma.customerPayment.count({ where: scopedWhere(scope, { customerId: id }) }),
          prisma.creditNote.count({ where: scopedWhere(scope, { customerId: id, status: { not: 'cancelled' } }) }),
          prisma.saleReturn.count({ where: scopedWhere(scope, { customerId: id, status: 'completed' }) })
        ]).then((counts) => counts.reduce((sum, count) => sum + count, 0))

        if (transactionCount > 0 && req.body.confirmOpeningBalanceChange !== true) {
          return res.status(409).json({
            error: 'Changing opening balance after transactions exist requires confirmation',
            requiresConfirmation: true
          })
        }
      }

      const nextBalance = toMoney(existingCustomer.balance, 0) + openingBalanceDelta
      if (nextBalance < 0) {
        return res.status(400).json({ error: 'Opening balance change would make the customer balance negative' })
      }

      openingBalanceData.openingBalance = openingBalance
      openingBalanceData.balance = nextBalance
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'openingBalanceDate')) {
      const openingBalanceForDate = Object.prototype.hasOwnProperty.call(openingBalanceData, 'openingBalance')
        ? openingBalanceData.openingBalance
        : existingOpeningBalance
      const openingBalanceDate = parseOpeningBalanceDate(req.body.openingBalanceDate, openingBalanceForDate)
      if (req.body.openingBalanceDate && !openingBalanceDate) {
        return res.status(400).json({ error: 'Opening balance date is invalid' })
      }
      openingBalanceData.openingBalanceDate = openingBalanceDate
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'openingBalanceNote')) {
      openingBalanceData.openingBalanceNote = openingBalanceNote
    }

    const nextCreditLimit = creditLimit !== undefined ? creditLimit : existingCustomer.creditLimit
    const creditLimitCheck = validateCreditLimitRequired(nextCreditLimit)
    if (!creditLimitCheck.valid) {
      return res.status(400).json({ error: creditLimitCheck.message, code: 'CUSTOMER_CREDIT_LIMIT_REQUIRED' })
    }

    const data = {
      name,
      email,
      phone,
      address,
      creditLimit: creditLimit !== undefined ? creditLimitCheck.amount : undefined,
      status,
      notes,
      ...openingBalanceData
    }

    if (branchId !== undefined) {
      const targetScope = await resolveBranchScope(prisma, { ...req, body: { branchId } }, {
        source: 'body',
        requireBranch: true,
        allowOwnerAll: false
      })
      data.branchId = targetScope.branchId
    }

    const customerRaw = await prisma.customer.update({
      where: { id },
      data
    })

    const [customer] = await attachRepaymentTrustScores(prisma, scope, [customerRaw])
    res.json(customer)
  } catch (error) {
    console.error('Update customer error:', error)
    handleBranchError(res, error, 'Failed to update customer')
  }
})

// === SALES RECORDS (Credit Sales) ===

// Get all sales records
router.get('/sales', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, customerId, paymentStatus, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(customerId && { customerId }),
      ...(paymentStatus && { paymentStatus }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    })

    const [sales, total] = await Promise.all([
      prisma.saleRecord.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          customer: true,
          branch: true,
          User: userSelect,
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.saleRecord.count({ where })
    ])

    res.json({
      sales: sales.map(withUser),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get sales error:', error)
    handleBranchError(res, error, 'Failed to fetch sales')
  }
})

// Create new sale (credit or cash)
router.post('/sales', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, loadUserPermissions, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { 
      customerId, 
      items, 
      paymentMethod, 
      tax = 0,
      discount = 0,
      amountPaid = 0,
      notes,
      cashAccountId,
      mobileProvider,
      phoneNumber,
      transactionId
    } = req.body

    if (!customerId) return res.status(400).json({ error: 'Customer is required' })
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one sale item is required' })

    const customer = await prisma.customer.findFirst({
      where: scopedWhere(scope, { id: customerId })
    })

    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (customer.status !== 'active') return res.status(400).json({ error: 'Customer is not active' })

    const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))]
    const products = await prisma.product.findMany({
      where: scopedWhere(scope, { id: { in: productIds }, isActive: { not: false } })
    })
    const productsById = new Map(products.map((product) => [product.id, product]))
    if (products.length !== productIds.length) return res.status(400).json({ error: 'One or more products were not found' })

    const saleItems = items.map((item) => {
      const product = productsById.get(item.productId)
      const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1)
      const price = toMoney(item.price, product?.price || 0)
      const cost = toMoney(item.cost, product?.cost || 0)
      const itemDiscount = toMoney(item.discount)
      const lineTotal = Math.max(0, price * quantity - itemDiscount)

      if (product.itemType !== 'service' && product.quantity < quantity) {
        throw Object.assign(new Error(`${product.name} has only ${product.quantity} in stock`), { statusCode: 400 })
      }

      return {
        productId: item.productId,
        quantity,
        price,
        cost,
        discount: itemDiscount,
        total: lineTotal
      }
    })

    const computedSubtotal = saleItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const computedDiscount = saleItems.reduce((sum, item) => sum + item.discount, 0) + toMoney(discount)
    const computedTax = toMoney(tax)
    const computedTotal = Math.max(0, computedSubtotal + computedTax - computedDiscount)
    const paid = Math.min(toMoney(amountPaid), computedTotal)
    const balance = Math.max(0, computedTotal - paid)
    const finalPaymentStatus = paymentStatusFor(computedTotal, paid)
    const resolvedPaymentMethod = paymentMethod || (paid > 0 ? 'cash' : 'credit')

    if (paid > 0 && resolvedPaymentMethod === 'credit') {
      return res.status(400).json({ error: 'Select cash, mobile money, bank transfer, or card for the paid amount on this sale' })
    }

    if (paid > 0 && !checkPaymentMethodPermission(req, resolvedPaymentMethod)) {
      return res.status(403).json({
        error: `You do not have permission to use ${resolvedPaymentMethod} as a payment method. Please contact your administrator.`,
        code: 'NO_PAYMENT_METHOD_PERMISSION'
      })
    }

    // Generate receipt number
    const receiptNo = `SALE-${Date.now()}`

    if (balance > 0) {
      const creditLimitCheck = validateCreditSaleLimit(customer, balance)
      if (!creditLimitCheck.valid) {
        return res.status(creditLimitCheck.statusCode || 400).json({
          error: creditLimitCheck.message,
          code: creditLimitCheck.code
        })
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      if (balance > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: balance } }
        })
      }

      const createdSale = await tx.saleRecord.create({
        data: {
          receiptNo,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          userId: req.user.id,
          customerId,
          subtotal: computedSubtotal,
          tax: computedTax,
          discount: computedDiscount,
          total: computedTotal,
          amountPaid: paid,
          balance,
          paymentMethod: resolvedPaymentMethod,
          paymentStatus: finalPaymentStatus,
          notes,
          dueDate: balance > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined
        },
        include: {
          customer: true,
          branch: true,
          User: userSelect
        }
      })

      await tx.saleRecordItem.createMany({
        data: saleItems.map(item => ({
          saleId: createdSale.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          cost: item.cost,
          discount: item.discount,
          total: item.total
        }))
      })

      for (const item of saleItems) {
        const product = productsById.get(item.productId)
        if (product && product.itemType === 'service') continue
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              decrement: item.quantity
            }
          }
        })
      }

      if (paid > 0) {
        const payment = await tx.customerPayment.create({
          data: {
            tenantId: scope.tenantId,
            branchId: scope.branchId,
            customerId,
            saleId: createdSale.id,
            amount: paid,
            paymentMethod: resolvedPaymentMethod,
            mobileProvider: resolvedPaymentMethod === 'mobile_money' ? mobileProvider : null,
            phoneNumber: resolvedPaymentMethod === 'mobile_money' ? phoneNumber : null,
            transactionId: ['mobile_money', 'card'].includes(resolvedPaymentMethod) ? transactionId : null,
            reference: receiptNo,
            notes: notes ? `Paid at sale: ${notes}` : 'Paid at sale'
          }
        })

        const receiptAccount = await resolveReceiptCashAccount(tx, scope, req, resolvedPaymentMethod, cashAccountId)
        const updatedAccount = await tx.cashAccount.update({
          where: { id: receiptAccount.id },
          data: { balance: { increment: paid } }
        })

        await tx.cashTransaction.create({
          data: {
            tenantId: scope.tenantId,
            accountId: receiptAccount.id,
            type: 'receipt',
            amount: paid,
            balanceAfter: updatedAccount.balance,
            reference: receiptNo || payment.id,
            description: `Customer sale payment: ${customer.name || customer.email}`,
            userId: req.user.id
          }
        })

        await syncLinkedTransactionAccountBalance(tx, scope.tenantId, receiptAccount.id)
      }

      return createdSale
    })

    const printableSale = await prisma.saleRecord.findUnique({
      where: { id: sale.id },
      include: {
        customer: true,
        branch: true,
        User: userSelect,
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } }
          }
        }
      }
    })

    res.status(201).json(withUser(printableSale))
  } catch (error) {
    console.error('Create sale error:', error)
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
    handleBranchError(res, error, 'Failed to create sale')
  }
})

// === CUSTOMER PAYMENTS ===

// Get customer payments
router.get('/payments', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, customerId, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(customerId && { customerId }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    })

    const [payments, total] = await Promise.all([
      prisma.customerPayment.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          sale: { select: { id: true, receiptNo: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.customerPayment.count({ where })
    ])

    res.json({
      payments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get payments error:', error)
    handleBranchError(res, error, 'Failed to fetch payments')
  }
})

// Record customer payment
router.post('/payments', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, loadUserPermissions, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { customerId, saleId, amount, paymentMethod, reference, notes, mobileProvider, phoneNumber, transactionId, cashAccountId } = req.body
    const paidAmount = toMoney(amount)
    if (!customerId) return res.status(400).json({ error: 'Customer is required' })
    if (paidAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero' })

    const resolvedPaymentMethod = paymentMethod || 'cash'

    // Gate payment method by permission
    if (!checkPaymentMethodPermission(req, resolvedPaymentMethod)) {
      return res.status(403).json({
        error: `You do not have permission to use ${resolvedPaymentMethod} as a payment method. Please contact your administrator.`,
        code: 'NO_PAYMENT_METHOD_PERMISSION'
      })
    }

    // Get customer
    const customer = await prisma.customer.findFirst({
      where: scopedWhere(scope, { id: customerId })
    })

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    let sale = null
    if (saleId) {
      sale = await prisma.saleRecord.findFirst({
        where: scopedWhere(scope, { id: saleId, customerId })
      })
      if (!sale) return res.status(404).json({ error: 'Sale not found for this customer' })
      // Allow payment amounts larger than the sale balance. We'll allocate to the sale first,
      // then apply any remainder to the customer's balance (resulting in a negative balance i.e. credit).
    }

    const payment = await prisma.$transaction(async (tx) => {
      const createdPayment = await tx.customerPayment.create({
        data: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          customerId,
          saleId,
          amount: paidAmount,
          paymentMethod: resolvedPaymentMethod,
          mobileProvider: resolvedPaymentMethod === 'mobile_money' ? mobileProvider : null,
          phoneNumber: resolvedPaymentMethod === 'mobile_money' ? phoneNumber : null,
          transactionId: ['mobile_money', 'card'].includes(resolvedPaymentMethod) ? transactionId : null,
          reference,
          notes
        }
      })

      const accountToUse = await resolveReceiptCashAccount(tx, scope, req, resolvedPaymentMethod, cashAccountId)
      const updatedAccount = await tx.cashAccount.update({
        where: { id: accountToUse.id },
        data: { balance: { increment: paidAmount } }
      })

      await tx.cashTransaction.create({
        data: {
          tenantId: scope.tenantId,
          accountId: accountToUse.id,
          type: 'receipt',
          amount: paidAmount,
          balanceAfter: updatedAccount.balance,
          reference: reference || createdPayment.id,
          description: `Customer payment: ${customer.name || customer.email}`,
          userId: req.user.id
        }
      })

      await syncLinkedTransactionAccountBalance(tx, scope.tenantId, accountToUse.id)

      let remaining = paidAmount

      if (sale) {
        const allocateToSale = Math.min(remaining, sale.balance)
        const newAmountPaid = Math.min(sale.total, (sale.amountPaid || 0) + allocateToSale)
        const newSaleBalance = Math.max(0, sale.balance - allocateToSale)

        await tx.saleRecord.update({
          where: { id: saleId },
          data: {
            amountPaid: newAmountPaid,
            balance: newSaleBalance,
            paymentStatus: newSaleBalance <= 0 ? 'paid' : 'partial'
          }
        })

        remaining = Math.round((remaining - allocateToSale) * 100) / 100
      }

      const newBalance = Math.round(((customer.balance || 0) - paidAmount) * 100) / 100
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: newBalance }
      })

      return createdPayment
    })

    res.status(201).json(payment)
  } catch (error) {
    console.error('Record payment error:', error)
    handleBranchError(res, error, 'Failed to record payment')
  }
})

// === RECEIVABLES REPORTS ===

// Get receivables summary
router.get('/receivables/summary', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const receivableWhere = scopedWhere(scope)
    const saleWhere = scopedWhere(scope, {
      balance: { gt: 0 },
      paymentStatus: { not: 'paid' }
    })

    const [totalReceivables, overdueCount, agingSales] = await Promise.all([
      // Total amount owed
      prisma.customer.aggregate({
        where: receivableWhere,
        _sum: { balance: true }
      }),
      
      // Overdue customers count
      prisma.saleRecord.count({
        where: scopedWhere(scope, {
          balance: { gt: 0 },
          dueDate: { lt: new Date() }
        })
      }),

      // Aging report
      prisma.saleRecord.findMany({
        where: saleWhere,
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: { balance: 'desc' }
      })
    ])

    const agingByCustomer = new Map()
    agingSales.forEach((sale) => {
      if (!sale.customerId) return
      const current = agingByCustomer.get(sale.customerId) || {
        customer_id: sale.customerId,
        customer_name: sale.customer?.name || 'Customer',
        phone: sale.customer?.phone,
        total_owed: 0,
        overdue_invoices: 0,
        latest_due: null
      }
      current.total_owed += Number(sale.balance || 0)
      current.overdue_invoices += 1
      if (!current.latest_due || (sale.dueDate && sale.dueDate > current.latest_due)) {
        current.latest_due = sale.dueDate
      }
      agingByCustomer.set(sale.customerId, current)
    })

    const agingReportRows = Array.from(agingByCustomer.values())
      .sort((a, b) => b.total_owed - a.total_owed)

    res.json({
      totalReceivables: totalReceivables._sum.balance || 0,
      overdueCount,
      agingReport: agingReportRows
    })
  } catch (error) {
    console.error('Receivables summary error:', error)
    handleBranchError(res, error, 'Failed to fetch receivables summary')
  }
})

// === FUEL CARDS ===

// List fuel cards
router.get('/fuel-cards', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { search, status, cardType } = req.query

    const where = scopedWhere(scope, {
      ...(status && { status }),
      ...(cardType && { cardType }),
      ...(search && {
        OR: [
          { cardNumber: { contains: search, mode: 'insensitive' } },
          { holderName: { contains: search, mode: 'insensitive' } }
        ]
      })
    })

    const cards = await prisma.fuelCard.findMany({
      where,
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ cards })
  } catch (error) {
    console.error('Get fuel cards error:', error)
    handleBranchError(res, error, 'Failed to fetch fuel cards')
  }
})

// Create fuel card
router.post('/fuel-cards', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'body', requireBranch: true, allowOwnerAll: false })
    const { cardNumber, holderName, customerId, cardType = 'prepaid', balance = 0, creditLimit = 0, expiresAt, notes } = req.body

    if (!cardNumber?.trim()) return res.status(400).json({ error: 'Card number is required' })
    if (!holderName?.trim()) return res.status(400).json({ error: 'Holder name is required' })

    // Check unique card number within tenant
    const existing = await prisma.fuelCard.findFirst({
      where: { tenantId: scope.tenantId, cardNumber: cardNumber.trim() }
    })
    if (existing) return res.status(400).json({ error: 'Card number already exists' })

    // Validate customer if provided
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: scopedWhere(scope, { id: customerId }) })
      if (!customer) return res.status(404).json({ error: 'Customer not found' })
    }

    const card = await prisma.fuelCard.create({
      data: {
        cardNumber: cardNumber.trim(),
        holderName: holderName.trim(),
        customerId: customerId || null,
        cardType,
        balance: toMoney(balance),
        creditLimit: toMoney(creditLimit),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes,
        tenantId: scope.tenantId,
        branchId: scope.branchId
      },
      include: { customer: { select: { id: true, name: true, phone: true } } }
    })

    res.status(201).json(card)
  } catch (error) {
    console.error('Create fuel card error:', error)
    handleBranchError(res, error, 'Failed to create fuel card')
  }
})

// Update fuel card
router.put('/fuel-cards/:id', authenticateToken, requirePermission('canEditReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params
    const { holderName, customerId, cardType, creditLimit, status, expiresAt, notes } = req.body

    const existing = await prisma.fuelCard.findFirst({ where: scopedWhere(scope, { id }) })
    if (!existing) return res.status(404).json({ error: 'Fuel card not found' })

    const card = await prisma.fuelCard.update({
      where: { id },
      data: {
        ...(holderName !== undefined && { holderName }),
        ...(customerId !== undefined && { customerId: customerId || null }),
        ...(cardType !== undefined && { cardType }),
        ...(creditLimit !== undefined && { creditLimit: toMoney(creditLimit) }),
        ...(status !== undefined && { status }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(notes !== undefined && { notes })
      },
      include: { customer: { select: { id: true, name: true, phone: true } } }
    })

    res.json(card)
  } catch (error) {
    console.error('Update fuel card error:', error)
    handleBranchError(res, error, 'Failed to update fuel card')
  }
})

// Reload fuel card (add balance)
router.post('/fuel-cards/:id/reload', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'body', requireBranch: true, allowOwnerAll: false })
    const { id } = req.params
    const { amount, reference, notes } = req.body
    const reloadAmount = toMoney(amount)
    if (reloadAmount <= 0) return res.status(400).json({ error: 'Reload amount must be greater than zero' })

    const card = await prisma.fuelCard.findFirst({ where: scopedWhere(scope, { id }) })
    if (!card) return res.status(404).json({ error: 'Fuel card not found' })
    if (card.status !== 'active') return res.status(400).json({ error: 'Card is not active' })

    const newBalance = card.balance + reloadAmount
    const [updatedCard] = await Promise.all([
      prisma.fuelCard.update({ where: { id }, data: { balance: newBalance }, include: { customer: { select: { id: true, name: true, phone: true } } } }),
      prisma.fuelCardTransaction.create({
        data: {
          cardId: id,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          type: 'reload',
          amount: reloadAmount,
          balanceAfter: newBalance,
          reference,
          notes
        }
      })
    ])

    res.json(updatedCard)
  } catch (error) {
    console.error('Reload fuel card error:', error)
    handleBranchError(res, error, 'Failed to reload fuel card')
  }
})

// Delete fuel card
router.delete('/fuel-cards/:id', authenticateToken, requirePermission('canEditReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params

    const existing = await prisma.fuelCard.findFirst({ where: scopedWhere(scope, { id }) })
    if (!existing) return res.status(404).json({ error: 'Fuel card not found' })

    await prisma.fuelCard.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete fuel card error:', error)
    handleBranchError(res, error, 'Failed to delete fuel card')
  }
})

// === CREDIT ACCOUNTS (customers with credit limit > 0) ===

router.get('/credit-accounts', authenticateToken, requirePermission('canViewReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { search, status } = req.query

    const where = scopedWhere(scope, {
      creditLimit: { gt: 0 },
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      })
    })

    const accountsRaw = await prisma.customer.findMany({
      where,
      orderBy: { balance: 'desc' }
    })
    const accounts = await attachRepaymentTrustScores(prisma, scope, accountsRaw)

    res.json({ accounts })
  } catch (error) {
    console.error('Get credit accounts error:', error)
    handleBranchError(res, error, 'Failed to fetch credit accounts')
  }
})

// Update credit terms. Trust score is calculated from repayment history.
router.put('/credit-accounts/:id', authenticateToken, requirePermission('canEditReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params
    const { creditLimit, status, notes } = req.body

    const existing = await prisma.customer.findFirst({ where: scopedWhere(scope, { id }) })
    if (!existing) return res.status(404).json({ error: 'Customer not found' })

    let creditLimitAmount
    if (creditLimit !== undefined) {
      const creditLimitCheck = validateCreditLimitRequired(creditLimit)
      if (!creditLimitCheck.valid) {
        return res.status(400).json({ error: creditLimitCheck.message, code: 'CUSTOMER_CREDIT_LIMIT_REQUIRED' })
      }
      creditLimitAmount = creditLimitCheck.amount
    }

    const customerRaw = await prisma.customer.update({
      where: { id },
      data: {
        ...(creditLimit !== undefined && { creditLimit: creditLimitAmount }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes })
      }
    })

    const [customer] = await attachRepaymentTrustScores(prisma, scope, [customerRaw])
    res.json(customer)
  } catch (error) {
    console.error('Update credit account error:', error)
    handleBranchError(res, error, 'Failed to update credit account')
  }
})

export default router
