import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requirePermission, requireTenant, requireCashAccount, checkPaymentMethodPermission } from '../middleware/auth.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'

const router = express.Router()
const prisma = new PrismaClient()

const CASH_ACCOUNTS_BY_PAYMENT_METHOD = {
  cash: { name: 'Cash Box', type: 'cash' },
  mobile_money: { name: 'Mobile Money', type: 'mobile_money' },
  bank_transfer: { name: 'Bank Account', type: 'bank' },
  card: { name: 'Card Payments', type: 'card' }
}

const DEFAULT_CASH_ACCOUNTS = [
  CASH_ACCOUNTS_BY_PAYMENT_METHOD.cash,
  CASH_ACCOUNTS_BY_PAYMENT_METHOD.mobile_money,
  CASH_ACCOUNTS_BY_PAYMENT_METHOD.bank_transfer,
  CASH_ACCOUNTS_BY_PAYMENT_METHOD.card
]

const toMoney = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const accountForPaymentMethod = (paymentMethod) =>
  CASH_ACCOUNTS_BY_PAYMENT_METHOD[paymentMethod] || CASH_ACCOUNTS_BY_PAYMENT_METHOD.cash

const userSelect = { select: { id: true, fname: true, lname: true } }

const withUser = (record) => {
  if (!record) return record
  const { User, ...rest } = record
  return { ...rest, user: User || record.user || null }
}

async function ensureDefaultCashAccounts(tenantId, client = prisma) {
  await Promise.all(
    DEFAULT_CASH_ACCOUNTS.map((account) =>
      client.cashAccount.upsert({
        where: {
          tenantId_name: {
            tenantId,
            name: account.name
          }
        },
        update: { type: account.type, isActive: true },
        create: {
          tenantId,
          name: account.name,
          type: account.type,
          currency: 'UGX'
        }
      })
    )
  )
}

async function cashAccountForPaymentMethod(tenantId, paymentMethod, client = prisma) {
  const account = accountForPaymentMethod(paymentMethod)

  return client.cashAccount.upsert({
    where: {
      tenantId_name: {
        tenantId,
        name: account.name
      }
    },
    update: { type: account.type, isActive: true },
    create: {
      tenantId,
      name: account.name,
      type: account.type,
      currency: 'UGX'
    }
  })
}

// === EXPENSES ===

// Get all expenses for tenant
router.get('/expenses', authenticateToken, requirePermission('canViewExpense'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { page = 1, limit = 50, category, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = scopedWhere(scope, {
      ...(category && { category }),
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    })

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          branch: { select: { id: true, name: true } },
          User: userSelect,
          cashAccount: { select: { id: true, name: true, type: true } }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.expense.count({ where })
    ])

    res.json({
      expenses: expenses.map(withUser),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get expenses error:', error)
    handleBranchError(res, error, 'Failed to fetch expenses')
  }
})

// Create new expense
router.post('/expenses', authenticateToken, requirePermission('canCreateExpense'), requireTenant, requireCashAccount, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: 'body',
      requireBranch: true,
      allowOwnerAll: false
    })
    const { 
      category, 
      description, 
      amount, 
      paymentMethod, 
      cashAccountId,
      reference, 
      notes,
      date,
      mobileProvider,
      phoneNumber,
      transactionId
    } = req.body

    const amountValue = toMoney(amount)
    const resolvedPaymentMethod = paymentMethod || 'mobile_money'

    if (!category?.trim()) return res.status(400).json({ error: 'Expense category is required' })
    if (!description?.trim()) return res.status(400).json({ error: 'Expense description is required' })
    if (amountValue <= 0) return res.status(400).json({ error: 'Expense amount must be greater than zero' })

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

    // Use user's assigned cash account as default, or the explicitly selected one
    let resolvedCashAccountId = req.userCashAccountId || null
    if (cashAccountId) {
      // Verify the selected account belongs to tenant and is active
      const account = await prisma.cashAccount.findFirst({
        where: { id: cashAccountId, tenantId: req.tenant.id, isActive: true }
      })
      if (!account) return res.status(400).json({ error: 'Invalid or inactive cash account' })
      resolvedCashAccountId = account.id
    }

    if (!resolvedCashAccountId) {
      return res.status(400).json({ error: 'No cash account available for this transaction' })
    }

    // Validate sufficient balance
    const spendingAccount = await prisma.cashAccount.findUnique({
      where: { id: resolvedCashAccountId }
    })
    if (!spendingAccount) {
      return res.status(400).json({ error: 'Cash account not found' })
    }
    if (spendingAccount.balance < amountValue) {
      return res.status(400).json({
        error: `Insufficient funds in ${spendingAccount.name}. Available: ${spendingAccount.balance.toFixed(2)} ${spendingAccount.currency}, Required: ${amountValue.toFixed(2)}`,
        code: 'INSUFFICIENT_FUNDS'
      })
    }

    const expense = await prisma.$transaction(async (tx) => {
      const createdExpense = await tx.expense.create({
        data: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          category: category.trim(),
          description: description.trim(),
          amount: amountValue,
          paymentMethod: resolvedPaymentMethod,
          cashAccountId: resolvedCashAccountId,
          mobileProvider: resolvedPaymentMethod === 'mobile_money' ? mobileProvider : null,
          phoneNumber: resolvedPaymentMethod === 'mobile_money' ? phoneNumber : null,
          transactionId: ['mobile_money', 'card'].includes(resolvedPaymentMethod) ? transactionId : null,
          reference,
          notes,
          userId: req.user.id,
          date: date ? new Date(date) : new Date()
        },
        include: {
          User: userSelect,
          cashAccount: { select: { id: true, name: true, type: true } }
        }
      })

      // Use the resolved cash account (user's assigned or explicitly selected)
      const account = await tx.cashAccount.findUnique({ where: { id: resolvedCashAccountId } })

      const updatedAccount = await tx.cashAccount.update({
        where: { id: account.id },
        data: {
          balance: {
            decrement: amountValue
          }
        }
      })

      await tx.cashTransaction.create({
        data: {
          tenantId: req.tenant.id,
          accountId: account.id,
          type: 'expense',
          amount: amountValue,
          balanceAfter: updatedAccount.balance,
          reference: reference || createdExpense.id,
          description: createdExpense.description,
          userId: req.user.id
        }
      })

      return createdExpense
    })

    res.status(201).json(withUser(expense))
  } catch (error) {
    console.error('Create expense error:', error)
    handleBranchError(res, error, 'Failed to create expense')
  }
})

// Update expense
router.put('/expenses/:id', authenticateToken, requirePermission('canEditExpense'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { id } = req.params
    const { category, description, amount, paymentMethod, cashAccountId, reference, notes, date, branchId, mobileProvider, phoneNumber, transactionId } = req.body

    // Check if expense belongs to tenant
    const existingExpense = await prisma.expense.findFirst({
      where: scopedWhere(scope, { id })
    })

    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' })
    }

    // Validate cash account if provided
    let resolvedCashAccountId = existingExpense.cashAccountId
    if (cashAccountId !== undefined) {
      if (cashAccountId) {
        const account = await prisma.cashAccount.findFirst({
          where: { id: cashAccountId, tenantId: req.tenant.id, isActive: true }
        })
        if (!account) return res.status(400).json({ error: 'Invalid or inactive cash account' })
        resolvedCashAccountId = account.id
      } else {
        resolvedCashAccountId = null
      }
    }

    const data = {
      category,
      description,
      amount,
      paymentMethod,
      cashAccountId: resolvedCashAccountId,
      mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : null,
      phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : null,
      transactionId: ['mobile_money', 'card'].includes(paymentMethod) ? transactionId : null,
      reference,
      notes,
      date: date ? new Date(date) : undefined
    }

    if (branchId !== undefined) {
      const targetScope = await resolveBranchScope(prisma, { ...req, body: { branchId } }, {
        source: 'body',
        requireBranch: true,
        allowOwnerAll: false
      })
      data.branchId = targetScope.branchId
    }

    const expense = await prisma.expense.update({ where: { id }, data })

    res.json(expense)
  } catch (error) {
    console.error('Update expense error:', error)
    handleBranchError(res, error, 'Failed to update expense')
  }
})

// === CASH ACCOUNTS ===

// Get current user's assigned cash account and payment method permissions
router.get('/my-cash-account', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        cashAccountId: true,
        cashAccount: {
          select: { id: true, name: true, type: true, balance: true, currency: true, accountNumber: true, bankName: true, accountHolder: true, branchName: true }
        },
        permissions: {
          select: { canUseCash: true, canUseMobileMoney: true, canUseBank: true, canUseCard: true }
        }
      }
    })

    if (!user) return res.status(404).json({ error: 'User not found' })

    res.json({
      cashAccountId: user.cashAccountId,
      cashAccount: user.cashAccount,
      paymentMethodPermissions: user.permissions || { canUseCash: true, canUseMobileMoney: false, canUseBank: false, canUseCard: false }
    })
  } catch (error) {
    console.error('Get my cash account error:', error)
    res.status(500).json({ error: 'Failed to fetch cash account info' })
  }
})

// Get all cash accounts
router.get('/cash-accounts', authenticateToken, requirePermission('canViewExpense'), requireTenant, async (req, res) => {
  try {
    await ensureDefaultCashAccounts(req.tenant.id)

    // Include assigned users so we can surface staff + branch on the API response
    const rawAccounts = await prisma.cashAccount.findMany({
      where: {
        tenantId: req.tenant.id,
        isActive: true
      },
      orderBy: { name: 'asc' },
      include: {
        AssignedUsers: {
          where: { isActive: true },
          select: {
            id: true,
            fname: true,
            lname: true,
            email: true,
            role: true,
            branches: {
              include: { branch: { select: { id: true, name: true } } },
            },
          },
        },
      },
    })

    const accounts = rawAccounts.map((account) => {
      const staff = account.AssignedUsers?.[0] || null
      const primaryBranch = staff?.branches?.find((b) => b.isPrimary)?.branch || staff?.branches?.[0]?.branch || null

      return {
        id: account.id,
        tenantId: account.tenantId,
        name: account.name,
        type: account.type,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        accountHolder: account.accountHolder,
        branchName: account.branchName,
        balance: account.balance,
        currency: account.currency,
        isActive: account.isActive,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,

        // Derived fields for UI
        branchId: primaryBranch?.id || null,
        branch: primaryBranch,
        assignedStaffId: staff?.id || null,
        assignedStaff: staff
          ? {
              id: staff.id,
              name: `${staff.fname || ''} ${staff.lname || ''}`.trim() || staff.email,
            }
          : null,

        // Mobile money helpers (reuse existing columns)
        phoneNumber: account.type === 'mobile_money' ? account.accountNumber : null,
        mobileMoneyName: account.type === 'mobile_money' ? account.accountHolder : null,
        network: account.type === 'mobile_money' ? account.branchName : null,
      }
    })

    res.json(accounts)
  } catch (error) {
    console.error('Get cash accounts error:', error)
    res.status(500).json({ error: 'Failed to fetch cash accounts' })
  }
})

// Create cash account
router.post('/cash-accounts', authenticateToken, requirePermission('canCreateExpense'), requireTenant, async (req, res) => {
  try {
    const { name, type, currency = 'UGX', accountNumber, bankName, accountHolder, branchName, balance, assignedStaffId, phoneNumber, mobileMoneyName, network, branchId, depletionAlertThreshold } = req.body

    // Map frontend mobile money fields to schema columns
    const resolvedAccountNumber = accountNumber || phoneNumber || null
    const resolvedAccountHolder = accountHolder || mobileMoneyName || null

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Account name is required' })
    }
    if (!type || !['cash', 'mobile_money', 'bank', 'card', 'safe'].includes(type)) {
      return res.status(400).json({ error: 'Valid account type is required (cash, mobile_money, bank, safe, card)' })
    }
    // Bank accounts require bank name and account number
    if (type === 'bank') {
      if (!bankName || !String(bankName).trim()) {
        return res.status(400).json({ error: 'Bank name is required for bank accounts' })
      }
      if (!resolvedAccountNumber || !String(resolvedAccountNumber).trim()) {
        return res.status(400).json({ error: 'Account number is required for bank accounts' })
      }
    }
    // Mobile money requires phone number (accountNumber)
    if (type === 'mobile_money') {
      if (!resolvedAccountNumber || !String(resolvedAccountNumber).trim()) {
        return res.status(400).json({ error: 'Phone number is required for mobile money accounts' })
      }
    }

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

    const balanceValue = toMoney(balance, 0)

    const account = await prisma.cashAccount.create({
      data: {
        tenantId: req.tenant.id,
        name,
        type,
        currency,
        accountNumber: resolvedAccountNumber,
        bankName: type === 'bank' ? bankName : null,
        accountHolder: resolvedAccountHolder,
        branchName: type === 'bank' ? (branchName || null) : (type === 'mobile_money' ? (network || null) : null),
        balance: balanceValue,
      }
    })

    // Optionally assign this cash account to a staff member for till accountability
    if (assignedStaffId) {
      const staff = await prisma.user.findFirst({
        where: { id: assignedStaffId, tenantId: req.tenant.id, isActive: true }
      })
      if (!staff) {
        return res.status(400).json({ error: 'Invalid staff selected for this cash account' })
      }

      await prisma.user.update({
        where: { id: assignedStaffId },
        data: { cashAccountId: account.id }
      })
    }

    res.status(201).json(account)
  } catch (error) {
    console.error('Create cash account error:', error)
    res.status(500).json({ error: 'Failed to create cash account' })
  }
})

// Update cash account
router.put('/cash-accounts/:id', authenticateToken, requirePermission('canCreateExpense'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params
    const { name, type, currency = 'UGX', accountNumber, bankName, accountHolder, branchName, balance, assignedStaffId, isActive, phoneNumber, mobileMoneyName, network, branchId, depletionAlertThreshold } = req.body

    // Map frontend mobile money fields to schema columns
    const resolvedAccountNumber = accountNumber || phoneNumber || null
    const resolvedAccountHolder = accountHolder || mobileMoneyName || null

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Account name is required' })
    }
    if (!type || !['cash', 'mobile_money', 'bank', 'card', 'safe'].includes(type)) {
      return res.status(400).json({ error: 'Valid account type is required (cash, mobile_money, bank, safe, card)' })
    }
    if (type === 'bank') {
      if (!bankName || !String(bankName).trim()) {
        return res.status(400).json({ error: 'Bank name is required for bank accounts' })
      }
      if (!resolvedAccountNumber || !String(resolvedAccountNumber).trim()) {
        return res.status(400).json({ error: 'Account number is required for bank accounts' })
      }
    }
    if (type === 'mobile_money') {
      if (!resolvedAccountNumber || !String(resolvedAccountNumber).trim()) {
        return res.status(400).json({ error: 'Phone number is required for mobile money accounts' })
      }
    }

    const existing = await prisma.cashAccount.findFirst({
      where: { id, tenantId: req.tenant.id }
    })

    if (!existing) {
      return res.status(404).json({ error: 'Cash account not found' })
    }

    const nameConflict = await prisma.cashAccount.findFirst({
      where: {
        tenantId: req.tenant.id,
        name,
        id: { not: id }
      }
    })

    if (nameConflict) {
      return res.status(400).json({ error: 'Account with this name already exists' })
    }

    const balanceValue = balance !== undefined ? toMoney(balance, existing.balance) : existing.balance

    const account = await prisma.cashAccount.update({
      where: { id },
      data: {
        name,
        type,
        currency,
        accountNumber: resolvedAccountNumber,
        bankName: type === 'bank' ? bankName : null,
        accountHolder: resolvedAccountHolder,
        branchName: type === 'bank' ? (branchName || null) : (type === 'mobile_money' ? (network || null) : null),
        balance: balanceValue,
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
      }
    })

    // Optionally (re)assign this cash account to a staff member
    if (assignedStaffId) {
      const staff = await prisma.user.findFirst({
        where: { id: assignedStaffId, tenantId: req.tenant.id, isActive: true }
      })
      if (!staff) {
        return res.status(400).json({ error: 'Invalid staff selected for this cash account' })
      }

      await prisma.user.update({
        where: { id: assignedStaffId },
        data: { cashAccountId: id }
      })
    }

    res.json(account)
  } catch (error) {
    console.error('Update cash account error:', error)
    res.status(500).json({ error: 'Failed to update cash account' })
  }
})

// === CASH TRANSACTIONS ===

// Get cash transactions
router.get('/cash-transactions', authenticateToken, requirePermission('canViewExpense'), requireTenant, async (req, res) => {
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
          User: userSelect
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.cashTransaction.count({ where })
    ])

    res.json({
      transactions: transactions.map(withUser),
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
router.get('/cash-flow/summary', authenticateToken, requirePermission('canViewExpense'), requireTenant, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true })
    const { startDate, endDate } = req.query
    await ensureDefaultCashAccounts(req.tenant.id)

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
      prisma.sale.aggregate({
        where: scopedWhere(scope, {
          ...(Object.keys(dateFilter).length ? { createdAt: dateFilter.createdAt } : {})
        }),
        _sum: { total: true }
      }),

      // Total expenses
      prisma.expense.aggregate({
        where: scopedWhere(scope, {
          ...(Object.keys(dateFilter).length ? { date: dateFilter.createdAt } : {})
        }),
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
        where: scopedWhere(scope),
        _sum: { balance: true }
      }),

      // Payables
      prisma.supplier.aggregate({
        where: scopedWhere(scope),
        _sum: { balance: true }
      })
    ])

    const incomeAmount = totalIncome._sum.total || 0
    const expenseAmount = totalExpenses._sum.amount || 0
    const netCashFlow = incomeAmount - expenseAmount

    res.json({
      cashAccounts,
      totalIncome: incomeAmount,
      totalExpenses: expenseAmount,
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
    handleBranchError(res, error, 'Failed to fetch cash flow summary')
  }
})

// === EXPENSE CATEGORIES ===

// === STAFF TILL SHEET ===

// Get staff till sheet data — aggregates all cash transactions per staff member
router.get('/staff-till-sheets', authenticateToken, requirePermission('canViewStaffTillSheet'), requireTenant, async (req, res) => {
  try {
    const { startDate, endDate, staffId, branchId } = req.query

    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    } : {}

    // Get all users with cash accounts assigned
    const users = await prisma.user.findMany({
      where: {
        tenantId: req.tenant.id,
        isActive: true,
        cashAccountId: { not: null },
        ...(staffId && { id: staffId })
      },
      select: {
        id: true,
        fname: true,
        lname: true,
        email: true,
        role: true,
        cashAccountId: true,
        cashAccount: {
          select: { id: true, name: true, type: true, balance: true, currency: true, accountNumber: true }
        },
        branches: {
          include: { branch: { select: { id: true, name: true } } }
        }
      }
    })

    // Get all cash transactions for these users within the date range
    const transactions = await prisma.cashTransaction.findMany({
      where: {
        tenantId: req.tenant.id,
        userId: { in: users.map(u => u.id) },
        ...dateFilter
      },
      include: {
        account: { select: { id: true, name: true, type: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Group transactions by user
    const tillSheets = users.map(user => {
      const userTxns = transactions.filter(t => t.userId === user.id)
      const primaryBranch = user.branches?.find(b => b.isPrimary)?.branch || user.branches?.[0]?.branch || null

      // Credited (money in): sales, receipts
      const credited = userTxns.filter(t => ['sale', 'receipt', 'income'].includes(t.type))
      const totalCredited = credited.reduce((sum, t) => sum + t.amount, 0)

      // Debited (money out): expenses, payments
      const debited = userTxns.filter(t => ['expense', 'payment', 'transfer'].includes(t.type))
      const totalDebited = debited.reduce((sum, t) => sum + t.amount, 0)

      // Group by type for breakdown
      const byType = userTxns.reduce((acc, t) => {
        if (!acc[t.type]) acc[t.type] = { count: 0, total: 0 }
        acc[t.type].count++
        acc[t.type].total += t.amount
        return acc
      }, {})

      return {
        staffId: user.id,
        staff: {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          email: user.email,
          role: user.role
        },
        branch: primaryBranch,
        cashAccount: user.cashAccount,
        currentBalance: user.cashAccount?.balance || 0,
        totalCredited,
        totalDebited,
        netMovement: totalCredited - totalDebited,
        transactionCount: userTxns.length,
        transactions: userTxns.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          balanceAfter: t.balanceAfter,
          reference: t.reference,
          description: t.description,
          account: t.account,
          createdAt: t.createdAt
        })),
        breakdown: byType
      }
    })

    // Filter by branch if specified
    const filtered = branchId
      ? tillSheets.filter(ts => ts.branch?.id === branchId)
      : tillSheets

    res.json({
      tillSheets: filtered,
      summary: {
        totalStaff: filtered.length,
        totalCredited: filtered.reduce((s, t) => s + t.totalCredited, 0),
        totalDebited: filtered.reduce((s, t) => s + t.totalDebited, 0),
        totalBalance: filtered.reduce((s, t) => s + t.currentBalance, 0)
      }
    })
  } catch (error) {
    console.error('Staff till sheets error:', error)
    res.status(500).json({ error: 'Failed to fetch staff till sheets' })
  }
})

// Get expense categories
router.get('/expense-categories', authenticateToken, requirePermission('canViewExpense'), requireTenant, async (req, res) => {
  try {
    const categories = [
      // Operating Expenses
      { name: 'rent', displayName: 'Rent', icon: '🏢', group: 'Operating' },
      { name: 'utilities', displayName: 'Utilities (Electricity, Water, Gas)', icon: '💡', group: 'Operating' },
      { name: 'maintenance', displayName: 'Maintenance & Repairs', icon: '🔧', group: 'Operating' },
      { name: 'cleaning', displayName: 'Cleaning & Sanitation', icon: '🧹', group: 'Operating' },
      { name: 'security', displayName: 'Security Services', icon: '👮', group: 'Operating' },
      { name: 'waste_disposal', displayName: 'Waste Disposal', icon: '🗑️', group: 'Operating' },
      { name: 'supplies', displayName: 'Office Supplies', icon: '📎', group: 'Operating' },
      // Cost of Goods Sold
      { name: 'purchases', displayName: 'Inventory Purchases', icon: '📦', group: 'COGS' },
      { name: 'raw_materials', displayName: 'Raw Materials', icon: '🏭', group: 'COGS' },
      { name: 'packaging', displayName: 'Packaging Materials', icon: '🎁', group: 'COGS' },
      { name: 'freight_in', displayName: 'Freight & Inward Transport', icon: '�', group: 'COGS' },
      // Staff & Personnel
      { name: 'salaries', displayName: 'Salaries & Wages', icon: '💰', group: 'Personnel' },
      { name: 'staff_meals', displayName: 'Staff Meals & Welfare', icon: '🍽️', group: 'Personnel' },
      { name: 'staff_training', displayName: 'Staff Training', icon: '🎓', group: 'Personnel' },
      { name: 'medical', displayName: 'Medical & Health', icon: '🏥', group: 'Personnel' },
      { name: 'pensions', displayName: 'Pensions & NSSF', icon: '🏦', group: 'Personnel' },
      // Transport & Travel
      { name: 'transport', displayName: 'Transport (Local)', icon: '�', group: 'Travel' },
      { name: 'travel', displayName: 'Travel (Upcountry/International)', icon: '✈️', group: 'Travel' },
      { name: 'accommodation', displayName: 'Accommodation', icon: '🏨', group: 'Travel' },
      { name: 'meals', displayName: 'Meals & Entertainment', icon: '🍴', group: 'Travel' },
      { name: 'fuel', displayName: 'Fuel & Vehicle Expenses', icon: '⛽', group: 'Travel' },
      // Marketing & Sales
      { name: 'marketing', displayName: 'Marketing & Advertising', icon: '📢', group: 'Marketing' },
      { name: 'promotions', displayName: 'Promotions & Discounts', icon: '🏷️', group: 'Marketing' },
      { name: 'samples', displayName: 'Samples & Giveaways', icon: '🎁', group: 'Marketing' },
      // Professional Services
      { name: 'legal', displayName: 'Legal Fees', icon: '⚖️', group: 'Professional' },
      { name: 'accounting', displayName: 'Accounting & Audit', icon: '📊', group: 'Professional' },
      { name: 'consulting', displayName: 'Consulting Fees', icon: '🧠', group: 'Professional' },
      // IT & Technology
      { name: 'software_licenses', displayName: 'Software & Subscriptions', icon: '💻', group: 'IT' },
      { name: 'internet', displayName: 'Internet & Data', icon: '🌐', group: 'IT' },
      { name: 'airtime', displayName: 'Airtime & Communications', icon: '�', group: 'IT' },
      { name: 'hosting', displayName: 'Hosting & Cloud Services', icon: '☁️', group: 'IT' },
      // Banking & Finance
      { name: 'bank_charges', displayName: 'Bank Charges & Fees', icon: '🏦', group: 'Finance' },
      { name: 'loan_interest', displayName: 'Loan Interest', icon: '📉', group: 'Finance' },
      { name: 'fx_losses', displayName: 'Foreign Exchange Losses', icon: '💱', group: 'Finance' },
      { name: 'fines', displayName: 'Fines & Penalties', icon: '⚠️', group: 'Finance' },
      // Compliance & Regulatory
      { name: 'taxes', displayName: 'Taxes (VAT, PAYE, Income Tax)', icon: '📋', group: 'Compliance' },
      { name: 'licenses', displayName: 'Business Licenses & Permits', icon: '📜', group: 'Compliance' },
      { name: 'inspection_fees', displayName: 'Inspection & Certification Fees', icon: '�', group: 'Compliance' },
      { name: 'insurance', displayName: 'Insurance Premiums', icon: '🛡️', group: 'Compliance' },
      // Equipment & Assets
      { name: 'equipment_purchase', displayName: 'Equipment Purchase', icon: '🛠️', group: 'Assets' },
      { name: 'equipment_rental', displayName: 'Equipment Rental/Lease', icon: '🔁', group: 'Assets' },
      { name: 'depreciation', displayName: 'Depreciation', icon: '📉', group: 'Assets' },
      // Other
      { name: 'donations', displayName: 'Donations & Sponsorships', icon: '🤝', group: 'Other' },
      { name: 'refunds', displayName: 'Customer Refunds', icon: '↩️', group: 'Other' },
      { name: 'write_offs', displayName: 'Bad Debts & Write-offs', icon: '❌', group: 'Other' },
      { name: 'miscellaneous', displayName: 'Miscellaneous', icon: '�', group: 'Other' },
      { name: 'other', displayName: 'Other (Specify in Description)', icon: '📝', group: 'Other' }
    ]

    res.json(categories)
  } catch (error) {
    console.error('Get expense categories error:', error)
    res.status(500).json({ error: 'Failed to fetch expense categories' })
  }
})

export default router
