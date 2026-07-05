import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requirePermission, requireTenant, requireCashAccount, checkPaymentMethodPermission } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'
import { checkUsageLimit } from '../src/utils/usageLimits.js'

const router = express.Router()
const prisma = new PrismaClient()

const toMoney = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const paymentStatusFor = (total, amountPaid) => {
  if (amountPaid >= total) return 'paid'
  if (amountPaid > 0) return 'partial'
  return 'unpaid'
}

const userSelect = { select: { id: true, fname: true, lname: true } }

const withUser = (record) => {
  if (!record) return record
  const { User, ...rest } = record
  return { ...rest, user: User || record.user || null }
}

// === SUPPLIERS ===

// Get all suppliers for tenant
router.get('/suppliers', authenticateToken, requirePermission('canViewPayable'), requireTenant, async (req, res) => {
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

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.supplier.count({ where })
    ])

    res.json({
      suppliers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get suppliers error:', error)
    handleBranchError(res, error, 'Failed to fetch suppliers')
  }
})

// Create new supplier
router.post('/suppliers', authenticateToken, requirePermission('canCreatePayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { name, email, phone, address, notes } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' })
    }

    await checkUsageLimit(scope.tenantId, 'suppliers')

    // Check if supplier already exists
    if (phone?.trim()) {
      const existingSupplier = await prisma.supplier.findFirst({
        where: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          phone
        }
      })

      if (existingSupplier) {
        return res.status(400).json({ error: 'Supplier with this phone number already exists' })
      }
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        email,
        phone,
        address,
        notes,
        tenantId: scope.tenantId,
        branchId: scope.branchId
      }
    })

    res.status(201).json(supplier)
  } catch (error) {
    if (error?.code === 'LIMIT_REACHED') return res.status(403).json({ error: error.message })
    console.error('Create supplier error:', error)
    handleBranchError(res, error, 'Failed to create supplier')
  }
})

// Update supplier
router.put('/suppliers/:id', authenticateToken, requirePermission('canEditPayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params
    const { name, email, phone, address, status, notes, branchId } = req.body

    // Check if supplier belongs to tenant
    const existingSupplier = await prisma.supplier.findFirst({
      where: scopedWhere(scope, { id })
    })

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    const data = { name, email, phone, address, status, notes }

    if (branchId !== undefined) {
      const targetScope = await resolveBranchScope(prisma, { ...req, body: { branchId } }, {
        source: 'body',
        requireBranch: true,
        allowOwnerAll: false
      })
      data.branchId = targetScope.branchId
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data
    })

    res.json(supplier)
  } catch (error) {
    console.error('Update supplier error:', error)
    handleBranchError(res, error, 'Failed to update supplier')
  }
})

// === SUPPLIER PURCHASES ===

// Get all supplier purchases
router.get('/purchases', authenticateToken, requirePermission('canViewPayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, supplierId, paymentStatus, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(supplierId && { supplierId }),
      ...(paymentStatus && { paymentStatus }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    })

    const [purchases, total] = await Promise.all([
      prisma.supplierPurchase.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          supplier: true,
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
      prisma.supplierPurchase.count({ where })
    ])

    res.json({
      purchases: purchases.map(withUser),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get purchases error:', error)
    handleBranchError(res, error, 'Failed to fetch purchases')
  }
})

// Create new supplier purchase
router.post('/purchases', authenticateToken, requirePermission('canCreatePayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { 
      supplierId, 
      items, 
      refNo,
      total,
      amountPaid = 0,
      paymentStatus = 'unpaid',
      notes 
    } = req.body

    if (!supplierId) return res.status(400).json({ error: 'Supplier is required' })
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one purchase item is required' })

    const supplier = await prisma.supplier.findFirst({
      where: scopedWhere(scope, { id: supplierId })
    })

    if (!supplier) return res.status(404).json({ error: 'Supplier not found' })
    if (supplier.status !== 'active') return res.status(400).json({ error: 'Supplier is not active' })

    const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))]
    const products = await prisma.product.findMany({
      where: scopedWhere(scope, { id: { in: productIds }, isActive: { not: false } })
    })
    const productsById = new Map(products.map((product) => [product.id, product]))
    if (products.length !== productIds.length) return res.status(400).json({ error: 'One or more products were not found' })

    const purchaseItems = items.map((item) => {
      const product = productsById.get(item.productId)
      const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1)
      const cost = toMoney(item.cost, product?.cost || 0)

      return {
        productId: item.productId,
        quantity,
        cost,
        total: cost * quantity
      }
    })

    const computedTotal = total !== undefined ? toMoney(total) : purchaseItems.reduce((sum, item) => sum + item.total, 0)
    const paid = Math.min(toMoney(amountPaid), computedTotal)
    const balance = Math.max(0, computedTotal - paid)
    const finalPaymentStatus = paymentStatusFor(computedTotal, paid)

    // Generate reference number if not provided
    const purchaseRefNo = refNo || `PUR-${Date.now()}`

    // Update supplier balance
    if (balance > 0) {
      const newBalance = supplier.balance + balance
      await prisma.supplier.update({
        where: { id: supplierId },
        data: { balance: newBalance }
      })
    }

    const purchase = await prisma.supplierPurchase.create({
      data: {
        refNo: purchaseRefNo,
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        supplierId,
        userId: req.user.id,
        total: computedTotal,
        amountPaid: paid,
        balance,
        paymentStatus: finalPaymentStatus,
        notes,
        dueDate: balance > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined // 30 days
      },
      include: {
        supplier: true,
        branch: true,
        User: userSelect
      }
    })

    // Create purchase items
    await prisma.supplierPurchaseItem.createMany({
      data: purchaseItems.map(item => ({
        purchaseId: purchase.id,
        productId: item.productId,
        quantity: item.quantity,
        cost: item.cost,
        total: item.total
      }))
    })

    // Update product quantities and costs (skip service items)
    for (const item of purchaseItems) {
      const product = productsById.get(item.productId)
      if (product && product.itemType === 'service') continue
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          quantity: {
            increment: item.quantity
          },
          cost: item.cost
        }
      })
    }

    res.status(201).json(withUser(purchase))
  } catch (error) {
    console.error('Create purchase error:', error)
    handleBranchError(res, error, 'Failed to create purchase')
  }
})

// === SUPPLIER PAYMENTS ===

// Get supplier payments
router.get('/payments', authenticateToken, requirePermission('canViewPayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, supplierId, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(supplierId && { supplierId }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    })

    const [payments, total] = await Promise.all([
      prisma.supplierPayment.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          purchase: { select: { id: true, refNo: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.supplierPayment.count({ where })
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
    console.error('Get supplier payments error:', error)
    handleBranchError(res, error, 'Failed to fetch supplier payments')
  }
})

// Record supplier payment
router.post('/payments', authenticateToken, requirePermission('canCreatePayable'), requireTenant, requireCashAccount, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { supplierId, purchaseId, amount, paymentMethod, reference, notes, mobileProvider, phoneNumber, transactionId } = req.body
    const paidAmount = toMoney(amount)
    if (!supplierId) return res.status(400).json({ error: 'Supplier is required' })
    if (paidAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero' })

    const resolvedPaymentMethod = paymentMethod || 'mobile_money'

    // Cash is not allowed for spending — only for receiving customer payments
    if (resolvedPaymentMethod === 'cash') {
      return res.status(400).json({
        error: 'Cash payment method is not available for spending. Please use mobile money, bank transfer, or card.',
        code: 'INVALID_PAYMENT_METHOD'
      })
    }

    // Gate payment method by permission
    if (!checkPaymentMethodPermission(req, resolvedPaymentMethod)) {
      return res.status(403).json({
        error: `You do not have permission to use ${resolvedPaymentMethod} as a payment method. Please contact your administrator.`,
        code: 'NO_PAYMENT_METHOD_PERMISSION'
      })
    }

    // Get supplier
    const supplier = await prisma.supplier.findFirst({
      where: scopedWhere(scope, { id: supplierId })
    })

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    let purchase = null
    if (purchaseId) {
      purchase = await prisma.supplierPurchase.findFirst({
        where: scopedWhere(scope, { id: purchaseId, supplierId })
      })
      if (!purchase) return res.status(404).json({ error: 'Purchase not found for this supplier' })
      if (paidAmount > purchase.balance) return res.status(400).json({ error: 'Payment exceeds purchase balance' })
    } else if (paidAmount > supplier.balance) {
      return res.status(400).json({ error: 'Payment exceeds supplier balance' })
    }

    // Validate cash account balance if user has one assigned
    let cashAccountUsed = null
    if (req.userCashAccountId) {
      cashAccountUsed = await prisma.cashAccount.findUnique({
        where: { id: req.userCashAccountId }
      })
      if (cashAccountUsed && cashAccountUsed.balance < paidAmount) {
        return res.status(400).json({
          error: `Insufficient funds in ${cashAccountUsed.name}. Available: ${cashAccountUsed.balance.toFixed(2)} ${cashAccountUsed.currency}, Required: ${paidAmount.toFixed(2)}`,
          code: 'INSUFFICIENT_FUNDS'
        })
      }
    }

    // Create payment
    const payment = await prisma.supplierPayment.create({
      data: {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        supplierId,
        purchaseId,
        amount: paidAmount,
        paymentMethod: resolvedPaymentMethod,
        mobileProvider: resolvedPaymentMethod === 'mobile_money' ? mobileProvider : null,
        phoneNumber: resolvedPaymentMethod === 'mobile_money' ? phoneNumber : null,
        transactionId: ['mobile_money', 'card'].includes(resolvedPaymentMethod) ? transactionId : null,
        reference,
        notes
      }
    })

    // Deduct from cash account and record transaction
    if (cashAccountUsed) {
      const updatedAccount = await prisma.cashAccount.update({
        where: { id: cashAccountUsed.id },
        data: { balance: { decrement: paidAmount } }
      })

      await prisma.cashTransaction.create({
        data: {
          tenantId: req.tenant.id,
          accountId: cashAccountUsed.id,
          type: 'payment',
          amount: paidAmount,
          balanceAfter: updatedAccount.balance,
          reference: reference || payment.id,
          description: `Supplier payment: ${supplier.name}`,
          userId: req.user.id
        }
      })
    }

    // Update supplier balance
    const newBalance = Math.max(0, supplier.balance - paidAmount)
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { balance: newBalance }
    })

    // Update purchase payment status if fully paid
    if (purchase) {
      const newAmountPaid = Math.min(purchase.total, purchase.amountPaid + paidAmount)
      const newPurchaseBalance = Math.max(0, purchase.balance - paidAmount)

      await prisma.supplierPurchase.update({
        where: { id: purchaseId },
        data: {
          amountPaid: newAmountPaid,
          balance: newPurchaseBalance,
          paymentStatus: newPurchaseBalance <= 0 ? 'paid' : 'partial'
        }
      })
    }

    res.status(201).json(payment)
  } catch (error) {
    console.error('Record supplier payment error:', error)
    handleBranchError(res, error, 'Failed to record payment')
  }
})

// === PAYABLES REPORTS ===

// Get payables summary
router.get('/payables/summary', authenticateToken, requirePermission('canViewPayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const supplierWhere = scopedWhere(scope)
    const purchaseWhere = scopedWhere(scope, {
      paymentStatus: 'unpaid',
      balance: { gt: 0 }
    })

    const [totalPayables, overdueCount, agingPurchases] = await Promise.all([
      // Total amount owed
      prisma.supplier.aggregate({
        where: supplierWhere,
        _sum: { balance: true }
      }),
      
      // Overdue purchases count
      prisma.supplierPurchase.count({
        where: scopedWhere(scope, {
          paymentStatus: 'unpaid',
          dueDate: { lt: new Date() }
        })
      }),

      // Aging report
      prisma.supplierPurchase.findMany({
        where: purchaseWhere,
        include: { supplier: { select: { id: true, name: true, phone: true } } },
        orderBy: { balance: 'desc' }
      })
    ])

    const agingBySupplier = new Map()
    agingPurchases.forEach((purchase) => {
      const current = agingBySupplier.get(purchase.supplierId) || {
        supplier_id: purchase.supplierId,
        supplier_name: purchase.supplier?.name || 'Supplier',
        phone: purchase.supplier?.phone,
        total_owed: 0,
        overdue_purchases: 0,
        latest_due: null
      }
      current.total_owed += Number(purchase.balance || 0)
      current.overdue_purchases += 1
      if (!current.latest_due || (purchase.dueDate && purchase.dueDate > current.latest_due)) {
        current.latest_due = purchase.dueDate
      }
      agingBySupplier.set(purchase.supplierId, current)
    })

    const agingReportRows = Array.from(agingBySupplier.values())
      .sort((a, b) => b.total_owed - a.total_owed)

    res.json({
      totalPayables: totalPayables._sum.balance || 0,
      overdueCount,
      agingReport: agingReportRows
    })
  } catch (error) {
    console.error('Payables summary error:', error)
    handleBranchError(res, error, 'Failed to fetch payables summary')
  }
})

export default router
