import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requireRole, requireTenant } from '../middleware/auth.js'

const router = express.Router()
const prisma = new PrismaClient()

// === SUPPLIERS ===

// Get all suppliers for tenant
router.get('/suppliers', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
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
    res.status(500).json({ error: 'Failed to fetch suppliers' })
  }
})

// Create new supplier
router.post('/suppliers', authenticateToken, requireRole(['owner', 'manager']), requireTenant, async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body

    // Check if supplier already exists
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        tenantId: req.tenant.id,
        phone
      }
    })

    if (existingSupplier) {
      return res.status(400).json({ error: 'Supplier with this phone number already exists' })
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        email,
        phone,
        address,
        notes,
        tenantId: req.tenant.id
      }
    })

    res.status(201).json(supplier)
  } catch (error) {
    console.error('Create supplier error:', error)
    res.status(500).json({ error: 'Failed to create supplier' })
  }
})

// Update supplier
router.put('/suppliers/:id', authenticateToken, requireRole(['owner', 'manager']), requireTenant, async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, phone, address, status, notes } = req.body

    // Check if supplier belongs to tenant
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        id,
        tenantId: req.tenant.id
      }
    })

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        address,
        status,
        notes
      }
    })

    res.json(supplier)
  } catch (error) {
    console.error('Update supplier error:', error)
    res.status(500).json({ error: 'Failed to update supplier' })
  }
})

// === SUPPLIER PURCHASES ===

// Get all supplier purchases
router.get('/purchases', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, supplierId, paymentStatus, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
      ...(supplierId && { supplierId }),
      ...(paymentStatus && { paymentStatus }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    }

    const [purchases, total] = await Promise.all([
      prisma.supplierPurchase.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          supplier: true,
          user: { select: { id: true, fname: true, lname: true } },
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
      purchases,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get purchases error:', error)
    res.status(500).json({ error: 'Failed to fetch purchases' })
  }
})

// Create new supplier purchase
router.post('/purchases', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { 
      supplierId, 
      items, 
      refNo,
      total,
      amountPaid = 0,
      paymentStatus = 'unpaid',
      notes 
    } = req.body

    // Generate reference number if not provided
    const purchaseRefNo = refNo || `PUR-${Date.now()}`

    // Update supplier balance
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId }
    })

    if (supplier) {
      const newBalance = supplier.balance + (total - amountPaid)
      await prisma.supplier.update({
        where: { id: supplierId },
        data: { balance: newBalance }
      })
    }

    const purchase = await prisma.supplierPurchase.create({
      data: {
        refNo: purchaseRefNo,
        tenantId: req.tenant.id,
        supplierId,
        userId: req.user.id,
        total,
        amountPaid,
        balance: total - amountPaid,
        paymentStatus,
        notes,
        dueDate: paymentStatus === 'unpaid' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined // 30 days
      },
      include: {
        supplier: true,
        user: { select: { id: true, fname: true, lname: true } }
      }
    })

    // Create purchase items
    if (items && items.length > 0) {
      await prisma.supplierPurchaseItem.createMany({
        data: items.map(item => ({
          purchaseId: purchase.id,
          productId: item.productId,
          quantity: item.quantity,
          cost: item.cost,
          total: item.total
        }))
      })

      // Update product quantities and costs
      for (const item of items) {
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
    }

    res.status(201).json(purchase)
  } catch (error) {
    console.error('Create purchase error:', error)
    res.status(500).json({ error: 'Failed to create purchase' })
  }
})

// === SUPPLIER PAYMENTS ===

// Get supplier payments
router.get('/payments', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, supplierId, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
      ...(supplierId && { supplierId }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    }

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
    res.status(500).json({ error: 'Failed to fetch supplier payments' })
  }
})

// Record supplier payment
router.post('/payments', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { supplierId, purchaseId, amount, paymentMethod, reference, notes } = req.body

    // Get supplier
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId }
    })

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    // Create payment
    const payment = await prisma.supplierPayment.create({
      data: {
        tenantId: req.tenant.id,
        supplierId,
        purchaseId,
        amount,
        paymentMethod,
        reference,
        notes
      }
    })

    // Update supplier balance
    const newBalance = supplier.balance - amount
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { balance: newBalance }
    })

    // Update purchase payment status if fully paid
    if (purchaseId) {
      const purchase = await prisma.supplierPurchase.findUnique({
        where: { id: purchaseId }
      })

      if (purchase) {
        const newAmountPaid = purchase.amountPaid + amount
        const newBalance = purchase.balance - amount

        await prisma.supplierPurchase.update({
          where: { id: purchaseId },
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
    console.error('Record supplier payment error:', error)
    res.status(500).json({ error: 'Failed to record payment' })
  }
})

// === PAYABLES REPORTS ===

// Get payables summary
router.get('/payables/summary', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const [totalPayables, overdueCount, agingReport] = await Promise.all([
      // Total amount owed
      prisma.supplier.aggregate({
        where: { tenantId: req.tenant.id },
        _sum: { balance: true }
      }),
      
      // Overdue purchases count
      prisma.supplierPurchase.count({
        where: {
          tenantId: req.tenant.id,
          paymentStatus: 'unpaid',
          dueDate: { lt: new Date() }
        }
      }),

      // Aging report
      prisma.$queryRaw`
        SELECT 
          supplier_id,
          suppliers.name as supplier_name,
          suppliers.phone,
          SUM(balance) as total_owed,
          COUNT(*) as overdue_purchases,
          MAX(due_date) as latest_due
        FROM supplier_purchases
        JOIN suppliers ON supplier_purchases.supplier_id = suppliers.id
        WHERE supplier_purchases.tenant_id = ${req.tenant.id}
          AND payment_status = 'unpaid'
          AND balance > 0
        GROUP BY supplier_id, suppliers.name, suppliers.phone
        ORDER BY total_owed DESC
      `
    ])

    res.json({
      totalPayables: totalPayables._sum.balance || 0,
      overdueCount,
      agingReport
    })
  } catch (error) {
    console.error('Payables summary error:', error)
    res.status(500).json({ error: 'Failed to fetch payables summary' })
  }
})

export default router
