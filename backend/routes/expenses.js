import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requireRole, requireTenant } from '../middleware/auth.js'

const router = express.Router()
const prisma = new PrismaClient()

// === EXPENSES ===

// Get all expenses for tenant
router.get('/expenses', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, category, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
      ...(category && { category }),
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          user: { select: { id: true, fname: true, lname: true } }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.expense.count({ where })
    ])

    res.json({
      expenses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get expenses error:', error)
    res.status(500).json({ error: 'Failed to fetch expenses' })
  }
})

// Create new expense
router.post('/expenses', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { 
      category, 
      description, 
      amount, 
      paymentMethod, 
      reference, 
      notes,
      date 
    } = req.body

    const expense = await prisma.expense.create({
      data: {
        tenantId: req.tenant.id,
        category,
        description,
        amount,
        paymentMethod,
        reference,
        notes,
        userId: req.user.id,
        date: date ? new Date(date) : new Date()
      },
      include: {
        user: { select: { id: true, fname: true, lname: true } }
      }
    })

    res.status(201).json(expense)
  } catch (error) {
    console.error('Create expense error:', error)
    res.status(500).json({ error: 'Failed to create expense' })
  }
})

// Update expense
router.put('/expenses/:id', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { id } = req.params
    const { category, description, amount, paymentMethod, reference, notes, date } = req.body

    // Check if expense belongs to tenant
    const existingExpense = await prisma.expense.findFirst({
      where: {
        id,
        tenantId: req.tenant.id
      }
    })

    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' })
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        category,
        description,
        amount,
        paymentMethod,
        reference,
        notes,
        date: date ? new Date(date) : undefined
      }
    })

    res.json(expense)
  } catch (error) {
    console.error('Update expense error:', error)
    res.status(500).json({ error: 'Failed to update expense' })
  }
})

// === CASH ACCOUNTS ===

// Get all cash accounts
router.get('/cash-accounts', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const accounts = await prisma.cashAccount.findMany({
      where: {
        tenantId: req.tenant.id,
        isActive: true
      },
      orderBy: { name: 'asc' }
    })

    res.json(accounts)
  } catch (error) {
    console.error('Get cash accounts error:', error)
    res.status(500).json({ error: 'Failed to fetch cash accounts' })
  }
})

// Create cash account
router.post('/cash-accounts', authenticateToken, requireRole(['owner', 'manager']), requireTenant, async (req, res) => {
  try {
    const { name, type, currency = 'UGX' } = req.body

    // Check if account already exists
    const existingAccount = await prisma.cashAccount.findFirst({
      where: {
        tenantId: req.tenant.id,
        name
      }
    })

    if (existingAccount) {
      return res.status(400).json({ error: 'Account with this name already exists' })
    }

    const account = await prisma.cashAccount.create({
      data: {
        tenantId: req.tenant.id,
        name,
        type,
        currency
      }
    })

    res.status(201).json(account)
  } catch (error) {
    console.error('Create cash account error:', error)
    res.status(500).json({ error: 'Failed to create cash account' })
  }
})

// === CASH TRANSACTIONS ===

// Get cash transactions
router.get('/cash-transactions', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { page = 1, limit = 50, accountId, type, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.tenant.id,
      ...(accountId && { accountId }),
      ...(type && { type }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    }

    const [transactions, total] = await Promise.all([
      prisma.cashTransaction.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          account: { select: { id: true, name: true, type: true } },
          user: { select: { id: true, fname: true, lname: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.cashTransaction.count({ where })
    ])

    res.json({
      transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get cash transactions error:', error)
    res.status(500).json({ error: 'Failed to fetch cash transactions' })
  }
})

// === CASH FLOW SUMMARY ===

// Get cash flow overview
router.get('/cash-flow/summary', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    } : {}

    const [
      totalIncome,
      totalExpenses,
      cashAccounts,
      receivablesSummary,
      payablesSummary
    ] = await Promise.all([
      // Total income
      prisma.cashTransaction.aggregate({
        where: {
          tenantId: req.tenant.id,
          type: 'income',
          ...dateFilter
        },
        _sum: { amount: true }
      }),

      // Total expenses
      prisma.cashTransaction.aggregate({
        where: {
          tenantId: req.tenant.id,
          type: 'expense',
          ...dateFilter
        },
        _sum: { amount: true }
      }),

      // Cash accounts balance
      prisma.cashAccount.findMany({
        where: {
          tenantId: req.tenant.id,
          isActive: true
        },
        select: {
          id: true,
          name: true,
          type: true,
          balance: true,
          currency: true
        }
      }),

      // Receivables
      prisma.customer.aggregate({
        where: { tenantId: req.tenant.id },
        _sum: { balance: true }
      }),

      // Payables
      prisma.supplier.aggregate({
        where: { tenantId: req.tenant.id },
        _sum: { balance: true }
      })
    ])

    const netCashFlow = (totalIncome._sum.amount || 0) - (totalExpenses._sum.amount || 0)

    res.json({
      cashAccounts,
      totalIncome: totalIncome._sum.amount || 0,
      totalExpenses: totalExpenses._sum.amount || 0,
      netCashFlow,
      totalReceivables: receivablesSummary._sum.balance || 0,
      totalPayables: payablesSummary._sum.balance || 0,
      cashPosition: {
        totalCash: cashAccounts.reduce((sum, acc) => sum + acc.balance, 0),
        workingCapital: cashAccounts.reduce((sum, acc) => sum + acc.balance, 0) + (receivablesSummary._sum.balance || 0) - (payablesSummary._sum.balance || 0)
      }
    })
  } catch (error) {
    console.error('Cash flow summary error:', error)
    res.status(500).json({ error: 'Failed to fetch cash flow summary' })
  }
})

// === EXPENSE CATEGORIES ===

// Get expense categories
router.get('/expense-categories', authenticateToken, requireRole(['owner', 'manager', 'accountant']), requireTenant, async (req, res) => {
  try {
    const categories = [
      { name: 'rent', displayName: 'Rent', icon: '🏢' },
      { name: 'transport', displayName: 'Transport', icon: '🚗' },
      { name: 'salaries', displayName: 'Salaries', icon: '💰' },
      { name: 'utilities', displayName: 'Utilities', icon: '💡' },
      { name: 'airtime', displayName: 'Airtime', icon: '📱' },
      { name: 'marketing', displayName: 'Marketing', icon: '📢' },
      { name: 'maintenance', displayName: 'Maintenance', icon: '🔧' },
      { name: 'supplies', displayName: 'Office Supplies', icon: '📎' },
      { name: 'insurance', displayName: 'Insurance', icon: '🛡️' },
      { name: 'taxes', displayName: 'Taxes', icon: '📋' },
      { name: 'other', displayName: 'Other', icon: '📝' }
    ]

    res.json(categories)
  } catch (error) {
    console.error('Get expense categories error:', error)
    res.status(500).json({ error: 'Failed to fetch expense categories' })
  }
})

export default router
