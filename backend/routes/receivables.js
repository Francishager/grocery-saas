import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requireRole, requireTenant } from '../middleware/auth.js'

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
router.get('/customers', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
      ...(status && status !== 'all' && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      })
    }

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
    res.status(500).json({ error: 'Failed to fetch customers' })
  }
})

// Create new customer
router.post('/customers', authenticateToken, requireRole(['owner', 'manager']), requireTenant, async (req, res) => {
  try {
    const { name, email, phone, address, creditLimit = 0, notes } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required' })
    }

    // Check if customer already exists
    if (phone?.trim()) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          tenantId: req.tenant.id,
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
        tenantId: req.tenant.id
      }
    })

    res.status(201).json(customer)
  } catch (error) {
    console.error('Create customer error:', error)
    res.status(500).json({ error: 'Failed to create customer' })
  }
})

// Update customer
router.put('/customers/:id', authenticateToken, requireRole(['owner', 'manager']), requireTenant, async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, phone, address, creditLimit, status, trustScore, notes } = req.body

    // Check if customer belongs to tenant
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        tenantId: req.tenant.id
      }
    })

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        address,
        creditLimit,
        status,
        trustScore,
        notes
      }
    })

    res.json(customer)
  } catch (error) {
    console.error('Update customer error:', error)
    res.status(500).json({ error: 'Failed to update customer' })
  }
})

// === SALES RECORDS (Credit Sales) ===

// Get all sales records
router.get('/sales', authenticateToken, requireRole(['owner', 'manager', 'accountant', 'attendant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, customerId, paymentStatus, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
      ...(customerId && { customerId }),
      ...(paymentStatus && { paymentStatus }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    }

    const [sales, total] = await Promise.all([
      prisma.saleRecord.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          customer: true,
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
    res.status(500).json({ error: 'Failed to fetch sales' })
  }
})

// Create new sale (credit or cash)
router.post('/sales', authenticateToken, requireRole(['owner', 'manager', 'accountant', 'attendant']), requireTenant, async (req, res) => {
  try {
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
      where: { id: customerId, tenantId: req.tenant.id }
    })

    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (customer.status !== 'active') return res.status(400).json({ error: 'Customer is not active' })

    const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))]
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.tenant.id, isActive: { not: false } }
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
        tenantId: req.tenant.id,
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
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to create sale' })
  }
})

// === CUSTOMER PAYMENTS ===

// Get customer payments
router.get('/payments', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, customerId, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
      ...(customerId && { customerId }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    }

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
    res.status(500).json({ error: 'Failed to fetch payments' })
  }
})

// Record customer payment
router.post('/payments', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { customerId, saleId, amount, paymentMethod, reference, notes } = req.body
    const paidAmount = toMoney(amount)
    if (!customerId) return res.status(400).json({ error: 'Customer is required' })
    if (paidAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero' })

    // Get customer
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: req.tenant.id }
    })

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    let sale = null
    if (saleId) {
      sale = await prisma.saleRecord.findFirst({
        where: { id: saleId, customerId, tenantId: req.tenant.id }
      })
      if (!sale) return res.status(404).json({ error: 'Sale not found for this customer' })
      if (paidAmount > sale.balance) return res.status(400).json({ error: 'Payment exceeds sale balance' })
    } else if (paidAmount > customer.balance) {
      return res.status(400).json({ error: 'Payment exceeds customer balance' })
    }

    // Create payment
    const payment = await prisma.customerPayment.create({
      data: {
        tenantId: req.tenant.id,
        customerId,
        saleId,
        amount: paidAmount,
        paymentMethod,
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
    res.status(500).json({ error: 'Failed to record payment' })
  }
})

// === RECEIVABLES REPORTS ===

// Get receivables summary
router.get('/receivables/summary', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const [totalReceivables, overdueCount, agingReport] = await Promise.all([
      // Total amount owed
      prisma.customer.aggregate({
        where: { tenantId: req.tenant.id },
        _sum: { balance: true }
      }),
      
      // Overdue customers count
      prisma.saleRecord.count({
        where: {
          tenantId: req.tenant.id,
          paymentStatus: 'unpaid',
          dueDate: { lt: new Date() }
        }
      }),

      // Aging report
      prisma.$queryRaw`
        SELECT 
          sale_records."customerId" as customer_id,
          customers.name as customer_name,
          customers.phone,
          SUM(sale_records.balance) as total_owed,
          COUNT(*)::int as overdue_invoices,
          MAX(sale_records."dueDate") as latest_due
        FROM sale_records
        JOIN customers ON sale_records."customerId" = customers.id
        WHERE sale_records."tenantId" = ${req.tenant.id}
          AND sale_records."paymentStatus" = 'unpaid'
          AND sale_records.balance > 0
        GROUP BY sale_records."customerId", customers.name, customers.phone
        ORDER BY total_owed DESC
      `
    ])

    const agingReportRows = agingReport.map((row) => ({
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      phone: row.phone,
      total_owed: Number(row.total_owed || 0),
      overdue_invoices: Number(row.overdue_invoices || 0),
      latest_due: row.latest_due
    }))

    res.json({
      totalReceivables: totalReceivables._sum.balance || 0,
      overdueCount,
      agingReport: agingReportRows
    })
  } catch (error) {
    console.error('Receivables summary error:', error)
    res.status(500).json({ error: 'Failed to fetch receivables summary' })
  }
})

export default router
