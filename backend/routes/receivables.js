import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authorize, requireTenant } from '../accessControl.js'

const router = express.Router()
const prisma = new PrismaClient()

// === CUSTOMERS ===

// Get all customers for tenant
router.get('/customers', authorize(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
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
router.post('/customers', authorize(['owner', 'manager']), requireTenant, async (req, res) => {
  try {
    const { name, email, phone, address, creditLimit = 0, notes } = req.body

    // Check if customer already exists
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        tenantId: req.tenant.id,
        phone
      }
    })

    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this phone number already exists' })
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        email,
        phone,
        address,
        creditLimit,
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
router.put('/customers/:id', authorize(['owner', 'manager']), requireTenant, async (req, res) => {
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
router.get('/sales', authorize(['owner', 'manager', 'accountant', 'attendant']), requireTenant, async (req, res) => {
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
          user: { select: { id: true, fname: true, lname: true } },
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
      sales,
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
router.post('/sales', authorize(['owner', 'manager', 'accountant', 'attendant']), requireTenant, async (req, res) => {
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

    // Generate receipt number
    const receiptNo = `SALE-${Date.now()}`

    // Update customer balance if credit sale
    if (customerId && paymentStatus === 'unpaid') {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      })

      if (customer && customer.creditLimit > 0) {
        const newBalance = customer.balance + (total - amountPaid)
        if (newBalance > customer.creditLimit) {
          return res.status(400).json({ error: 'Credit limit exceeded' })
        }

        await prisma.customer.update({
          where: { id: customerId },
          data: { balance: newBalance }
        })
      }
    }

    const sale = await prisma.saleRecord.create({
      data: {
        receiptNo,
        tenantId: req.tenant.id,
        userId: req.user.id,
        customerId,
        subtotal,
        tax,
        discount,
        total,
        amountPaid,
        balance: total - amountPaid,
        paymentMethod,
        paymentStatus,
        notes,
        dueDate: paymentStatus === 'unpaid' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined // 30 days
      },
      include: {
        customer: true,
        user: { select: { id: true, fname: true, lname: true } }
      }
    })

    // Create sale items
    if (items && items.length > 0) {
      await prisma.saleRecordItem.createMany({
        data: items.map(item => ({
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount || 0,
          total: item.total
        }))
      })

      // Update product quantities
      for (const item of items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              decrement: item.quantity
            }
          }
        })
      }
    }

    res.status(201).json(sale)
  } catch (error) {
    console.error('Create sale error:', error)
    res.status(500).json({ error: 'Failed to create sale' })
  }
})

// === CUSTOMER PAYMENTS ===

// Get customer payments
router.get('/payments', authorize(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
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
router.post('/payments', authorize(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { customerId, saleId, amount, paymentMethod, reference, notes } = req.body

    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    // Create payment
    const payment = await prisma.customerPayment.create({
      data: {
        tenantId: req.tenant.id,
        customerId,
        saleId,
        amount,
        paymentMethod,
        reference,
        notes
      }
    })

    // Update customer balance
    const newBalance = customer.balance - amount
    await prisma.customer.update({
      where: { id: customerId },
      data: { balance: newBalance }
    })

    // Update sale payment status if fully paid
    if (saleId) {
      const sale = await prisma.saleRecord.findUnique({
        where: { id: saleId }
      })

      if (sale) {
        const newAmountPaid = sale.amountPaid + amount
        const newBalance = sale.balance - amount

        await prisma.saleRecord.update({
          where: { id: saleId },
          data: {
            amountPaid: newAmountPaid,
            balance: newBalance,
            paymentStatus: newBalance <= 0 ? 'paid' : 'partial'
          }
        })
      }
    }

    res.status(201).json(payment)
  } catch (error) {
    console.error('Record payment error:', error)
    res.status(500).json({ error: 'Failed to record payment' })
  }
})

// === RECEIVABLES REPORTS ===

// Get receivables summary
router.get('/receivables/summary', authorize(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
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
          customer_id,
          customers.name as customer_name,
          customers.phone,
          SUM(balance) as total_owed,
          COUNT(*) as overdue_invoices,
          MAX(due_date) as latest_due
        FROM sale_records
        JOIN customers ON sale_records.customer_id = customers.id
        WHERE sale_records.tenant_id = ${req.tenant.id}
          AND payment_status = 'unpaid'
          AND balance > 0
        GROUP BY customer_id, customers.name, customers.phone
        ORDER BY total_owed DESC
      `
    ])

    res.json({
      totalReceivables: totalReceivables._sum.balance || 0,
      overdueCount,
      agingReport
    })
  } catch (error) {
    console.error('Receivables summary error:', error)
    res.status(500).json({ error: 'Failed to fetch receivables summary' })
  }
})

export default router
