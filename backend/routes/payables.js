import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requirePermission, requireTenant, requireCashAccount, canUsePaymentMethodOrAssignedCash, loadUserPermissions } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'
import { checkUsageLimit } from '../src/utils/usageLimits.js'
import { buildSupplierStatementData } from '../src/utils/reportingHelpers.js'
import { syncLinkedTransactionAccountBalance } from '../src/utils/accountingSync.js'

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

async function resolvePaymentCashAccount(client, scope, req, paymentMethod, cashAccountId = null) {
  if (cashAccountId) {
    const account = await client.cashAccount.findFirst({
      where: { id: cashAccountId, tenantId: scope.tenantId, isActive: true }
    })
    if (!account) {
      throw Object.assign(new Error('Invalid or inactive cash account'), { statusCode: 400 })
    }
    if (!canUsePaymentMethodOrAssignedCash(req, paymentMethod, account.id)) {
      throw Object.assign(new Error(`You do not have permission to use ${paymentMethod} payments from this account`), { statusCode: 403 })
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
    if (
      account &&
      cashAccountMatchesPaymentMethod(account, paymentMethod) &&
      canUsePaymentMethodOrAssignedCash(req, paymentMethod, account.id)
    ) {
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

const userSelect = { select: { id: true, fname: true, lname: true } }

const withUser = (record) => {
  if (!record) return record
  const { User, ...rest } = record
  return { ...rest, user: User || record.user || null }
}

// === SUPPLIERS ===

router.get('/suppliers/:id/statement', authenticateToken, requirePermission('canViewPayable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params

    const [supplier, purchases, payments] = await Promise.all([
      prisma.supplier.findFirst({ where: scopedWhere(scope, { id }) }),
      prisma.supplierPurchase.findMany({
        where: scopedWhere(scope, { supplierId: id }),
        include: { supplier: true, items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.supplierPayment.findMany({
        where: scopedWhere(scope, { supplierId: id }),
        include: { supplier: true, purchase: { select: { id: true, refNo: true } } },
        orderBy: { createdAt: 'desc' }
      })
    ])

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    res.json(buildSupplierStatementData(supplier, purchases, payments))
  } catch (error) {
    console.error('Get supplier statement error:', error)
    handleBranchError(res, error, 'Failed to fetch supplier statement')
  }
})

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
    const { name, email, phone, address, notes, openingBalanceNote } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' })
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
        balance: openingBalance,
        openingBalance,
        openingBalanceDate,
        openingBalanceNote,
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
    const { name, email, phone, address, status, notes, branchId, openingBalanceNote } = req.body

    // Check if supplier belongs to tenant
    const existingSupplier = await prisma.supplier.findFirst({
      where: scopedWhere(scope, { id })
    })

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    if (hasOpeningBalanceInput(req.body) && !canManageOpeningBalance(req)) {
      return res.status(403).json({ error: 'Only owner and admin users can manage opening balances' })
    }

    const existingOpeningBalance = toMoney(existingSupplier.openingBalance, 0)
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
          prisma.supplierPurchase.count({ where: scopedWhere(scope, { supplierId: id }) }),
          prisma.supplierPayment.count({ where: scopedWhere(scope, { supplierId: id }) }),
          prisma.debitNote.count({ where: scopedWhere(scope, { supplierId: id, status: { not: 'cancelled' } }) })
        ]).then((counts) => counts.reduce((sum, count) => sum + count, 0))

        if (transactionCount > 0 && req.body.confirmOpeningBalanceChange !== true) {
          return res.status(409).json({
            error: 'Changing opening balance after transactions exist requires confirmation',
            requiresConfirmation: true
          })
        }
      }

      const nextBalance = toMoney(existingSupplier.balance, 0) + openingBalanceDelta
      if (nextBalance < 0) {
        return res.status(400).json({ error: 'Opening balance change would make the supplier balance negative' })
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

    const data = { name, email, phone, address, status, notes, ...openingBalanceData }

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
router.post('/purchases', authenticateToken, requirePermission('canCreatePayable'), requireTenant, loadUserPermissions, async (req, res) => {
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
      amountPaid = 0,
      paymentMethod,
      cashAccountId,
      mobileProvider,
      phoneNumber,
      transactionId,
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
        total: cost * quantity,
        oldCost: product.cost
      }
    })

    const computedTotal = purchaseItems.reduce((sum, item) => sum + item.total, 0)
    const paid = Math.min(toMoney(amountPaid), computedTotal)
    const balance = Math.max(0, computedTotal - paid)
    const finalPaymentStatus = paymentStatusFor(computedTotal, paid)
    const resolvedPaymentMethod = paymentMethod || 'cash'

    if (paid > 0 && !canUsePaymentMethodOrAssignedCash(req, resolvedPaymentMethod, req.body.cashAccountId || req.userCashAccountId)) {
      return res.status(403).json({
        error: `You do not have permission to use ${resolvedPaymentMethod} as a payment method. Please contact your administrator.`,
        code: 'NO_PAYMENT_METHOD_PERMISSION'
      })
    }

    // Generate reference number if not provided
    const purchaseRefNo = refNo || `PUR-${Date.now()}`

    const purchase = await prisma.$transaction(async (tx) => {
      if (balance > 0) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: balance } }
        })
      }

      const createdPurchase = await tx.supplierPurchase.create({
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
          dueDate: balance > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined
        },
        include: {
          supplier: true,
          branch: true,
          User: userSelect
        }
      })

      await tx.supplierPurchaseItem.createMany({
        data: purchaseItems.map(item => ({
          purchaseId: createdPurchase.id,
          productId: item.productId,
          quantity: item.quantity,
          cost: item.cost,
          total: item.total
        }))
      })

      for (const item of purchaseItems) {
        const product = productsById.get(item.productId)
        if (product && product.itemType === 'service') continue
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              increment: item.quantity
            },
            cost: item.cost
          }
        })
        if (Number(item.oldCost || 0) !== Number(item.cost || 0)) {
          await tx.productPriceHistory.create({
            data: {
              productId: item.productId,
              tenantId: scope.tenantId,
              branchId: scope.branchId,
              oldCost: item.oldCost,
              newCost: item.cost,
              source: 'supplier_purchase',
              reference: createdPurchase.refNo,
              reason: 'Supplier purchase cost update',
              changedByUserId: req.user?.id || null
            }
          })
        }
      }

      if (paid > 0) {
        const payment = await tx.supplierPayment.create({
          data: {
            tenantId: scope.tenantId,
            branchId: scope.branchId,
            supplierId,
            purchaseId: createdPurchase.id,
            amount: paid,
            paymentMethod: resolvedPaymentMethod,
            mobileProvider: resolvedPaymentMethod === 'mobile_money' ? mobileProvider : null,
            phoneNumber: resolvedPaymentMethod === 'mobile_money' ? phoneNumber : null,
            transactionId: ['mobile_money', 'card'].includes(resolvedPaymentMethod) ? transactionId : null,
            reference: purchaseRefNo,
            notes: notes ? `Paid at purchase: ${notes}` : 'Paid at purchase'
          }
        })

        const paymentAccount = await resolvePaymentCashAccount(tx, scope, req, resolvedPaymentMethod, cashAccountId)
        if (Number(paymentAccount.balance || 0) < paid) {
          throw Object.assign(new Error(`Insufficient funds in ${paymentAccount.name}. Available: ${Number(paymentAccount.balance || 0).toFixed(2)}, Required: ${paid.toFixed(2)}`), { statusCode: 400 })
        }

        const updatedAccount = await tx.cashAccount.update({
          where: { id: paymentAccount.id },
          data: { balance: { decrement: paid } }
        })

        await tx.cashTransaction.create({
          data: {
            tenantId: scope.tenantId,
            accountId: paymentAccount.id,
            type: 'payment',
            amount: paid,
            balanceAfter: updatedAccount.balance,
            reference: purchaseRefNo || payment.id,
            description: `Supplier purchase payment: ${supplier.name}`,
            userId: req.user.id
          }
        })

        await syncLinkedTransactionAccountBalance(tx, scope.tenantId, paymentAccount.id)
      }

      return createdPurchase
    })

    res.status(201).json(withUser(purchase))
  } catch (error) {
    console.error('Create purchase error:', error)
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
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
    const { supplierId, purchaseId, amount, paymentMethod, reference, notes, mobileProvider, phoneNumber, transactionId, cashAccountId } = req.body
    const paidAmount = toMoney(amount)
    if (!supplierId) return res.status(400).json({ error: 'Supplier is required' })
    if (paidAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero' })

    const resolvedPaymentMethod = paymentMethod || 'mobile_money'

    // Gate payment method by permission
    if (!canUsePaymentMethodOrAssignedCash(req, resolvedPaymentMethod, cashAccountId || req.userCashAccountId)) {
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

    const cashAccountUsed = await resolvePaymentCashAccount(prisma, scope, req, resolvedPaymentMethod, cashAccountId)
    if (Number(cashAccountUsed.balance || 0) < paidAmount) {
      return res.status(400).json({
        error: `Insufficient funds in ${cashAccountUsed.name}. Available: ${Number(cashAccountUsed.balance || 0).toFixed(2)} ${cashAccountUsed.currency}, Required: ${paidAmount.toFixed(2)}`,
        code: 'INSUFFICIENT_FUNDS'
      })
    }

    const payment = await prisma.$transaction(async (tx) => {
      const createdPayment = await tx.supplierPayment.create({
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

      const updatedAccount = await tx.cashAccount.update({
        where: { id: cashAccountUsed.id },
        data: { balance: { decrement: paidAmount } }
      })

      await tx.cashTransaction.create({
        data: {
          tenantId: scope.tenantId,
          accountId: cashAccountUsed.id,
          type: 'payment',
          amount: paidAmount,
          balanceAfter: updatedAccount.balance,
          reference: reference || createdPayment.id,
          description: `Supplier payment: ${supplier.name}`,
          userId: req.user.id
        }
      })

      await syncLinkedTransactionAccountBalance(tx, scope.tenantId, cashAccountUsed.id)

      const newBalance = Math.max(0, supplier.balance - paidAmount)
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: newBalance }
      })

      if (purchase) {
        const newAmountPaid = Math.min(purchase.total, purchase.amountPaid + paidAmount)
        const newPurchaseBalance = Math.max(0, purchase.balance - paidAmount)

        await tx.supplierPurchase.update({
          where: { id: purchaseId },
          data: {
            amountPaid: newAmountPaid,
            balance: newPurchaseBalance,
            paymentStatus: newPurchaseBalance <= 0 ? 'paid' : 'partial'
          }
        })
      }

      return createdPayment
    })

    res.status(201).json(payment)
  } catch (error) {
    console.error('Record supplier payment error:', error)
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
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
      balance: { gt: 0 },
      paymentStatus: { not: 'paid' }
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
          balance: { gt: 0 },
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
