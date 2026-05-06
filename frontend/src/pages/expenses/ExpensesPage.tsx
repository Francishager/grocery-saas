import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useFeatureAccess } from '@/services/featureAccessService'
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  CreditCard,
  Building2,
  Users,
  Calendar,
  Filter,
  Download,
  Plus,
  Eye
} from 'lucide-react'

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  paymentMethod: string
  reference?: string
  notes?: string
  date: string
  user: {
    id: string
    fname: string
    lname: string
  }
}

interface CashAccount {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  isActive: boolean
}

interface CashTransaction {
  id: string
  amount: number
  type: string
  balanceAfter: number
  reference?: string
  description?: string
  createdAt: string
  user: {
    id: string
    fname: string
    lname: string
  }
  account: {
    id: string
    name: string
    type: string
  }
}

export default function ExpensesPage() {
  const { isFeatureEnabled, canAccessFeature } = useFeatureAccess()
  const { toast } = useToast()
  
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [transactions, setTransactions] = useState<CashTransaction[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeTab, setActiveTab] = useState<'expenses' | 'accounts' | 'transactions' | 'summary'>('expenses')

  useEffect(() => {
    if (isFeatureEnabled('expenses')) {
      loadExpenses()
      loadCashAccounts()
      loadCashFlowSummary()
    }
  }, [isFeatureEnabled('expenses')])

  const loadExpenses = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const params = new URLSearchParams({
        ...(searchTerm && { search: searchTerm }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(startDate && endDate && { 
          startDate,
          endDate
        })
      })
      
      const response = await fetch(`${API_URL}/api/expenses/expenses?${params}`)
      if (response.ok) {
        const data = await response.json()
        setExpenses(data.expenses)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load expenses',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const loadCashAccounts = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/expenses/cash-accounts`)
      if (response.ok) {
        const data = await response.json()
        setCashAccounts(data)
      }
    } catch (error) {
      console.error('Failed to load cash accounts:', error)
    }
  }

  const loadTransactions = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const params = new URLSearchParams({
        ...(searchTerm && { search: searchTerm }),
        ...(startDate && endDate && { 
          startDate,
          endDate
        })
      })
      
      const response = await fetch(`${API_URL}/api/expenses/cash-transactions?${params}`)
      if (response.ok) {
        const data = await response.json()
        setTransactions(data.transactions)
      }
    } catch (error) {
      console.error('Failed to load transactions:', error)
    }
  }

  const loadCashFlowSummary = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const params = new URLSearchParams({
        ...(startDate && endDate && { 
          startDate,
          endDate
        })
      })
      
      const response = await fetch(`${API_URL}/api/expenses/cash-flow/summary?${params}`)
      if (response.ok) {
        const data = await response.json()
        setSummary(data)
      }
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      rent: '🏢',
      transport: '🚗',
      salaries: '💰',
      utilities: '💡',
      airtime: '📱',
      marketing: '📢',
      maintenance: '🔧',
      supplies: '📎',
      insurance: '🛡️',
      taxes: '📋',
      other: '📝'
    }
    return icons[category] || '📝'
  }

  const getTransactionTypeIcon = (type: string) => {
    return type === 'income' ? 
      <TrendingUp className="h-4 w-4 text-green-600" /> : 
      <TrendingDown className="h-4 w-4 text-red-600" />
  }

  if (!canAccessFeature('expenses')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access expense management.</p>
        </div>
      </div>
    )
  }

  if (!isFeatureEnabled('expenses')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Feature Not Available</h2>
          <p className="text-muted-foreground">Expense tracking is not available in your current plan.</p>
          <Button onClick={() => window.location.href = '/admin/plans'}>
            Upgrade Plan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses & Cash Flow</h1>
          <p className="text-muted-foreground">Track business expenses and manage cash accounts</p>
        </div>
        <Button onClick={() => window.location.href = '/receivables/expenses/new'}>
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {summary.totalIncome?.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary.totalExpenses?.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.netCashFlow?.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cash</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.cashPosition?.totalCash?.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 border-b">
        {['expenses', 'accounts', 'transactions', 'summary'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 py-4">
        <div className="flex items-center gap-2 flex-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="max-w-xs"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="max-w-xs"
          />
        </div>
      </div>

      {/* Content */}
      {activeTab === 'expenses' && (
        <div className="grid gap-4">
          {loading ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            expenses.map((expense) => (
              <Card key={expense.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl">
                        {getCategoryIcon(expense.category)}
                      </div>
                      <div>
                        <h3 className="font-semibold">{expense.description}</h3>
                        <p className="text-sm text-muted-foreground">
                          {expense.category} • {expense.paymentMethod}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          By {expense.user.fname} {expense.user.lname} • {new Date(expense.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-red-600">
                        -{expense.amount.toFixed(2)}
                      </div>
                      {expense.reference && (
                        <p className="text-sm text-muted-foreground">
                          Ref: {expense.reference}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'accounts' && (
        <div className="grid gap-4">
          {cashAccounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{account.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {account.type} • {account.currency}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {account.balance.toFixed(2)}
                    </div>
                    <Badge variant={account.isActive ? 'default' : 'secondary'}>
                      {account.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="grid gap-4">
          {transactions.map((transaction) => (
            <Card key={transaction.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      {getTransactionTypeIcon(transaction.type)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{transaction.description || 'Cash Transaction'}</h3>
                      <p className="text-sm text-muted-foreground">
                        {transaction.account?.name} • {transaction.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        By {transaction.user.fname} {transaction.user.lname} • {new Date(transaction.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {transaction.type === 'income' ? '+' : '-'}{transaction.amount.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Balance: {transaction.balanceAfter.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
