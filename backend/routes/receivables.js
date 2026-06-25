import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'

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

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.customer.count({ where })
    ])

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

// Create new customer
router.post('/customers', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { name, email, phone, address, creditLimit = 0, notes } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required' })
    }

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

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email,
        phone,
        address,
        creditLimit: toMoney(creditLimit),
        notes,
        tenantId: scope.tenantId,
        branchId: scope.branchId
      }
    })

    res.status(201).json(customer)
  } catch (error) {
    console.error('Create customer error:', error)
    handleBranchError(res, error, 'Failed to create customer')
  }
})

// Update customer
router.put('/customers/:id', authenticateToken, requirePermission('canEditReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params
    const { name, email, phone, address, creditLimit, status, trustScore, notes, branchId } = req.body

    // Check if customer belongs to tenant
    const existingCustomer = await prisma.customer.findFirst({
      where: scopedWhere(scope, { id })
    })

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    const data = {
      name,
      email,
      phone,
      address,
      creditLimit,
      status,
      trustScore,
      notes
    }

    if (branchId !== undefined) {
      const targetScope = await resolveBranchScope(prisma, { ...req, body: { branchId } }, {
        source: 'body',
        requireBranch: true,
        allowOwnerAll: false
      })
      data.branchId = targetScope.branchId
    }

    const customer = await prisma.customer.update({
      where: { id },
      data
    })

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
router.post('/sales', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
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
      paymentStatus = 'paid',
      subtotal,
      tax = 0,
      discount = 0,
      total,
      amountPaid = 0,
      notes 
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
      const itemDiscount = toMoney(item.discount)
      const lineTotal = Math.max(0, price * quantity - itemDiscount)

      if (product.quantity < quantity) {
        throw Object.assign(new Error(`${product.name} has only ${product.quantity} in stock`), { statusCode: 400 })
      }

      return {
        productId: item.productId,
        quantity,
        price,
        discount: itemDiscount,
        total: lineTotal
      }
    })

    const computedSubtotal = saleItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const computedDiscount = saleItems.reduce((sum, item) => sum + item.discount, 0) + toMoney(discount)
    const computedTax = toMoney(tax)
    const computedTotal = total !== undefined ? toMoney(total) : Math.max(0, computedSubtotal + computedTax - computedDiscount)
    const paid = Math.min(toMoney(amountPaid), computedTotal)
    const balance = Math.max(0, computedTotal - paid)
    const finalPaymentStatus = paymentStatusFor(computedTotal, paid)

    // Generate receipt number
    const receiptNo = `SALE-${Date.now()}`

    // Update customer balance if credit sale
    if (balance > 0) {
      const newBalance = customer.balance + balance
      if (customer.creditLimit > 0 && newBalance > customer.creditLimit) {
        return res.status(400).json({ error: 'Credit limit exceeded' })
      }

      await prisma.customer.update({
        where: { id: customerId },
        data: { balance: newBalance }
      })
    }

    const sale = await prisma.saleRecord.create({
      data: {
        receiptNo,
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        userId: req.user.id,
        customerId,
        subtotal: subtotal !== undefined ? toMoney(subtotal) : computedSubtotal,
        tax: computedTax,
        discount: computedDiscount,
        total: computedTotal,
        amountPaid: paid,
        balance,
        paymentMethod,
        paymentStatus: finalPaymentStatus,
        notes,
        dueDate: balance > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined // 30 days
      },
      include: {
        customer: true,
        branch: true,
        User: userSelect
      }
    })

    // Create sale items
    await prisma.saleRecordItem.createMany({
      data: saleItems.map(item => ({
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
        total: item.total
      }))
    })

    // Update product quantities
    for (const item of saleItems) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          quantity: {
            decrement: item.quantity
          }
        }
      })
    }

    res.status(201).json(withUser(sale))
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
router.post('/payments', authenticateToken, requirePermission('canCreateReceivable'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { customerId, saleId, amount, paymentMethod, reference, notes, mobileProvider, phoneNumber, transactionId } = req.body
    const paidAmount = toMoney(amount)
    if (!customerId) return res.status(400).json({ error: 'Customer is required' })
    if (paidAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero' })

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
      if (paidAmount > sale.balance) return res.status(400).json({ error: 'Payment exceeds sale balance' })
    } else if (paidAmount > customer.balance) {
      return res.status(400).json({ error: 'Payment exceeds customer balance' })
    }

    // Create payment
    const payment = await prisma.customerPayment.create({
      data: {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        customerId,
        saleId,
        amount: paidAmount,
        paymentMethod,
        mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : null,
        phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : null,
        transactionId: ['mobile_money', 'card'].includes(paymentMethod) ? transactionId : null,
        reference,
        notes
      }
    })

    // Update customer balance
    const newBalance = Math.max(0, customer.balance - paidAmount)
    await prisma.customer.update({
      where: { id: customerId },
      data: { balance: newBalance }
    })

    // Update sale payment status if fully paid
    if (sale) {
      const newAmountPaid = Math.min(sale.total, sale.amountPaid + paidAmount)
      const newSaleBalance = Math.max(0, sale.balance - paidAmount)

      await prisma.saleRecord.update({
        where: { id: saleId },
        data: {
          amountPaid: newAmountPaid,
          balance: newSaleBalance,
          paymentStatus: newSaleBalance <= 0 ? 'paid' : 'partial'
        }
      })
    }

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
      paymentStatus: 'unpaid',
      balance: { gt: 0 }
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
          paymentStatus: 'unpaid',
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

export default router
