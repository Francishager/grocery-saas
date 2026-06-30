import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { apiFetch, inventoryApi, type InventoryItem } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { formatCurrency } from '@/lib/utils'
import CreateCustomerModal from '@/components/modals/CreateCustomerModal'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalReceivableCustomers, getLocalReceivableSales, getLocalReceivablePayments, getLocalProducts } from '@/db/hybrid'
import { UsageLimitBanner } from '@/components/UsageLimitBanner'
import { 
  Users, 
  Building2, 
  CreditCard, 
  FileText, 
  TrendingUp,
  Wallet,
  Settings,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  Calendar,
  DollarSign,
  Shield,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  creditLimit: number
  balance: number
  status: 'active' | 'inactive' | 'blocked'
  trustScore: number
  notes?: string
}

interface Supplier {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  balance: number
  status: 'active' | 'inactive' | 'blocked'
  notes?: string
}

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

interface SaleDraftItem {
  productId: string
  quantity: string
  price: string
  discount: string
}

const createEmptySaleItem = (): SaleDraftItem => ({
  productId: '',
  quantity: '1',
  price: '',
  discount: '0',
})

const parseAmount = (value: string | number | undefined) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

const readResponseError = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => ({}))
  return data?.error || data?.message || fallback
}

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b py-2 last:border-b-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-right text-sm font-medium break-words">{value || 'Not set'}</span>
  </div>
)

export default function ReceivablesPage() {
  const { hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const online = useOnlineStatus()
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([])
  const [products, setProducts] = useState<InventoryItem[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers' | 'sales' | 'payments'>('customers')
  const [summary, setSummary] = useState<any>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showSaleModal, setShowSaleModal] = useState(false)
  const [savingSale, setSavingSale] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedSale, setSelectedSale] = useState<any | null>(null)
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<Customer | null>(null)
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [mobileProvider, setMobileProvider] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [saleForm, setSaleForm] = useState({
    customerId: '',
    paymentMethod: 'credit',
    amountPaid: '0',
    tax: '0',
    discount: '0',
    notes: '',
  })
  const [saleItems, setSaleItems] = useState<SaleDraftItem[]>([createEmptySaleItem()])
  const creditEnabled = hasPermission('canViewReceivable')

  useEffect(() => {
    if (!creditEnabled) {
      setLoading(false)
      return
    }

    if (activeTab === 'customers') {
      loadCustomers()
    }
    if (activeTab === 'sales') loadSales()
    if (activeTab === 'payments') loadPayments()
    loadReceivablesSummary()
  }, [creditEnabled, activeTab, searchTerm, statusFilter])

  const loadCustomers = async (
    showPageLoading = true,
    overrides?: { search?: string; status?: string }
  ) => {
    try {
      if (showPageLoading) setLoading(true)
      if (online) {
        const params = new URLSearchParams({
          ...((overrides?.search ?? searchTerm) && { search: overrides?.search ?? searchTerm }),
          ...((overrides?.status ?? statusFilter) !== 'all' && { status: overrides?.status ?? statusFilter })
        })
        const response = await apiFetch(`/api/receivables/customers?${params}`)
        if (response.ok) {
          const data = await response.json()
          setCustomers(data.customers)
        } else {
          throw new Error(await readResponseError(response, 'Failed to load customers'))
        }
      } else {
        const local = await getLocalReceivableCustomers(overrides?.search ?? searchTerm, overrides?.status ?? statusFilter)
        setCustomers(local)
      }
    } catch (error) {
      try {
        const local = await getLocalReceivableCustomers(overrides?.search ?? searchTerm, overrides?.status ?? statusFilter)
        setCustomers(local)
      } catch {
        toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to load customers', variant: 'destructive' })
      }
    } finally {
      if (showPageLoading) setLoading(false)
    }
  }

  const loadSales = async () => {
    try {
      if (online) {
        const response = await apiFetch('/api/receivables/sales')
        if (response.ok) {
          const data = await response.json()
          setSales(data.sales)
        }
      } else {
        const local = await getLocalReceivableSales()
        setSales(local)
      }
    } catch (error) {
      try { setSales(await getLocalReceivableSales()) } catch {}
    }
  }

  const loadPayments = async () => {
    try {
      if (online) {
        const response = await apiFetch('/api/receivables/payments')
        if (response.ok) {
          const data = await response.json()
          setPayments(data.payments)
        }
      } else {
        const local = await getLocalReceivablePayments()
        setPayments(local)
      }
    } catch (error) {
      try { setPayments(await getLocalReceivablePayments()) } catch {}
    }
  }

  const loadReceivablesSummary = async () => {
    try {
      if (online) {
        const response = await apiFetch('/api/receivables/receivables/summary')
        if (response.ok) {
          const data = await response.json()
          setSummary(data)
        }
      } else {
        // Compute summary from local data
        const localCustomers = await getLocalReceivableCustomers()
        const localSales = await getLocalReceivableSales()
        const totalReceivable = localCustomers.reduce((sum, c) => sum + (c.balance || 0), 0)
        const totalSales = localSales.reduce((sum, s) => sum + (s.total || 0), 0)
        setSummary({
          totalReceivable,
          totalSales,
          customerCount: localCustomers.length,
          outstandingBalance: totalReceivable,
        })
      }
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const loadProducts = async () => {
    try {
      if (online) {
        const data = await inventoryApi.list()
        setProducts(data)
      } else {
        const local = await getLocalProducts()
        setProducts(local)
      }
    } catch (error: any) {
      try {
        const local = await getLocalProducts()
        setProducts(local)
      } catch {
        toast({
          title: 'Error',
          description: error.message || 'Failed to load products',
          variant: 'destructive'
        })
      }
    }
  }

  const loadCustomerOptions = async () => {
    try {
      if (online) {
        const response = await apiFetch('/api/receivables/customers?status=active&limit=100')
        if (!response.ok) {
          throw new Error(await readResponseError(response, 'Failed to load customer options'))
        }
        const data = await response.json()
        setCustomerOptions(data.customers || [])
      } else {
        const local = await getLocalReceivableCustomers('', 'active')
        setCustomerOptions(local)
      }
    } catch (error) {
      try {
        const local = await getLocalReceivableCustomers('', 'active')
        setCustomerOptions(local)
      } catch {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to load customer options',
          variant: 'destructive'
        })
      }
    }
  }

  const openSaleModal = () => {
    setShowSaleModal(true)
    loadCustomerOptions()
    if (products.length === 0) loadProducts()
  }

  const updateSaleItem = (index: number, patch: Partial<SaleDraftItem>) => {
    setSaleItems((prev) =>
      prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    )
  }

  const handleSaleProductChange = (index: number, productId: string) => {
    const product = products.find((item) => String(item.id) === productId)
    const itemType = (product as any)?.itemType
    const defaultPrice = itemType === 'rental'
      ? (product as any)?.rentalPrice || product?.unit_price
      : product?.unit_price
    updateSaleItem(index, {
      productId,
      price: product ? String(defaultPrice) : '',
    })
  }

  const saleSubtotal = saleItems.reduce((sum, item) => {
    return sum + parseAmount(item.price) * Math.max(1, parseInt(item.quantity, 10) || 1)
  }, 0)
  const saleItemDiscount = saleItems.reduce((sum, item) => sum + parseAmount(item.discount), 0)
  const saleTotal = Math.max(
    0,
    saleSubtotal + parseAmount(saleForm.tax) - parseAmount(saleForm.discount) - saleItemDiscount
  )

  const createSale = async (event: React.FormEvent) => {
    event.preventDefault()

    const items = saleItems
      .filter((item) => item.productId)
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
        price: parseAmount(item.price),
        discount: parseAmount(item.discount),
      }))

    if (!saleForm.customerId || items.length === 0) {
      toast({
        title: 'Missing sale details',
        description: 'Select a customer and at least one item.',
        variant: 'destructive'
      })
      return
    }

    setSavingSale(true)
    try {
      const response = await apiFetch('/api/receivables/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerId: saleForm.customerId,
          items,
          paymentMethod: saleForm.paymentMethod,
          subtotal: saleSubtotal,
          tax: parseAmount(saleForm.tax),
          discount: parseAmount(saleForm.discount),
          total: saleTotal,
          amountPaid: Math.min(parseAmount(saleForm.amountPaid), saleTotal),
          notes: saleForm.notes || undefined,
        })
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to create sale'))
      }

      toast({
        title: 'Success',
        description: 'Sale recorded successfully'
      })
      setShowSaleModal(false)
      setSaleForm({
        customerId: '',
        paymentMethod: 'credit',
        amountPaid: '0',
        tax: '0',
        discount: '0',
        notes: '',
      })
      setSaleItems([createEmptySaleItem()])
      loadSales()
      if (activeTab === 'customers') loadCustomers()
      loadCustomerOptions()
      loadReceivablesSummary()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create sale',
        variant: 'destructive'
      })
    } finally {
      setSavingSale(false)
    }
  }

  const recordPayment = async () => {
    const targetCustomer = selectedSale?.customer || selectedCustomer
    if (!targetCustomer || !paymentAmount) return

    try {
      const response = await apiFetch('/api/receivables/payments', {
        method: 'POST',
        body: JSON.stringify({
          customerId: targetCustomer.id,
          saleId: selectedSale?.id,
          amount: parseFloat(paymentAmount),
          paymentMethod,
          mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined,
          phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined,
          transactionId: ['mobile_money', 'card'].includes(paymentMethod) ? transactionId : undefined,
          notes: `Payment recorded via dashboard`
        })
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to record payment'))
      }

      toast({
        title: 'Success',
        description: 'Payment recorded successfully'
      })
      setShowPaymentModal(false)
      setSelectedCustomer(null)
      setSelectedSale(null)
      setPaymentAmount('')
      setPaymentMethod('cash')
      setMobileProvider('')
      setPhoneNumber('')
      setTransactionId('')
      if (activeTab === 'customers') loadCustomers()
      loadCustomerOptions()
      loadSales()
      loadPayments()
      loadReceivablesSummary()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to record payment',
        variant: 'destructive'
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'default',
      inactive: 'secondary',
      blocked: 'destructive'
    }
    return (
      <Badge variant={variants[status as keyof typeof variants]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getPaymentStatusBadge = (status: string) => {
    const variants = {
      paid: 'default',
      partial: 'secondary',
      unpaid: 'destructive',
      overdue: 'destructive'
    }
    return (
      <Badge variant={variants[status as keyof typeof variants] as any}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const closeDetails = () => {
    setSelectedCustomerDetail(null)
    setSelectedSaleDetail(null)
  }

  const formatUserName = (user?: { fname?: string; lname?: string }) => {
    const name = `${user?.fname || ''} ${user?.lname || ''}`.trim()
    return name || 'Unknown'
  }

  if (!hasPermission('canViewReceivable')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access receivables management.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receivables Management</h1>
          <p className="text-muted-foreground">Manage customer credit and outstanding payments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowCustomerModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
          <Button onClick={openSaleModal}>
            <FileText className="h-4 w-4 mr-2" />
            New Sale
          </Button>
        </div>
      </div>

      <UsageLimitBanner resource="customers" label="Customers" currentCount={customers.length} />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Receivables</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {summary.totalReceivables?.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue Invoices</CardTitle>
              <Calendar className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary.overdueCount || 0}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {customers.filter(c => c.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blocked Customers</CardTitle>
              <Shield className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {customers.filter(c => c.status === 'blocked').length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 border-b">
        {['customers', 'sales', 'payments'].map((tab) => (
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
      <div className="flex flex-wrap items-center gap-4 py-4">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {activeTab === 'customers' && (
        <div className="grid gap-4">
          {loading ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            customers.map((customer) => (
              <Card key={customer.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{customer.name}</h3>
                        <p className="text-sm text-muted-foreground">{customer.phone}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(customer.status)}
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">Trust Score</p>
                        <p className={`font-bold ${getTrustScoreColor(customer.trustScore)}`}>
                          {customer.trustScore}/100
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Credit Limit</p>
                      <p className="font-semibold">{customer.creditLimit.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Balance</p>
                      <p className="font-semibold text-red-600">{customer.balance.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Available</p>
                      <p className="font-semibold text-green-600">
                        {(customer.creditLimit - customer.balance).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    {customer.balance > 0 && (
                      <Button 
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(customer)
                          setSelectedSale(null)
                          setShowPaymentModal(true)
                        }}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Record Payment
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSelectedCustomerDetail(customer)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'sales' && (
        <div className="grid gap-4">
          {sales.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">No credit sales found.</CardContent>
            </Card>
          ) : (
            sales.map((sale) => (
              <Card key={sale.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{sale.receiptNo}</h3>
                        <p className="text-sm text-muted-foreground">
                          {sale.customer?.name || 'Walk-in customer'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sale.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getPaymentStatusBadge(sale.paymentStatus)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-semibold">{Number(sale.total || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Paid</p>
                      <p className="font-semibold">{Number(sale.amountPaid || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Balance</p>
                      <p className="font-semibold text-red-600">{Number(sale.balance || 0).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    {Number(sale.balance || 0) > 0 && sale.customer && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(sale.customer)
                          setSelectedSale(sale)
                          setPaymentAmount(String(sale.balance))
                          setShowPaymentModal(true)
                        }}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Record Payment
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSelectedSaleDetail(sale)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="grid gap-4">
          {payments.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">No customer payments found.</CardContent>
            </Card>
          ) : (
            payments.map((payment) => (
              <Card key={payment.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Wallet className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{Number(payment.amount || 0).toFixed(2)}</h3>
                        <p className="text-sm text-muted-foreground">
                          From {payment.customer?.name || 'Customer'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{payment.paymentMethod}</Badge>
                  </div>

                  {payment.sale?.receiptNo && (
                    <p className="mt-4 text-sm text-muted-foreground">Sale: {payment.sale.receiptNo}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <CreateCustomerModal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSuccess={(customer) => {
          setCustomers((prev) => [customer, ...prev.filter((item) => item.id !== customer.id)])
          setCustomerOptions((prev) => [customer, ...prev.filter((item) => item.id !== customer.id)])
          if (activeTab === 'customers') loadCustomers()
          loadReceivablesSummary()
        }}
      />

      {/* Sale Modal */}
      {showSaleModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold mb-4">New Customer Sale</h3>
            <form onSubmit={createSale} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Customer</Label>
                  <Select
                    value={saleForm.customerId}
                    onValueChange={(value) => setSaleForm((prev) => ({ ...prev, customerId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(customerOptions.length ? customerOptions : customers).map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} {customer.phone ? `(${customer.phone})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Payment Method</Label>
                  <Select
                    value={saleForm.paymentMethod}
                    onValueChange={(value) => setSaleForm((prev) => ({ ...prev, paymentMethod: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Credit</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSaleItems((prev) => [...prev, createEmptySaleItem()])}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>

                {saleItems.map((item, index) => {
                  const selectedItem = products.find((p) => String(p.id) === item.productId)
                  const selectedItemType = (selectedItem as any)?.itemType
                  const isService = selectedItemType === 'service'
                  const isRental = selectedItemType === 'rental'
                  return (
                  <div key={index} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_90px_120px_120px_40px]">
                    <Select value={item.productId} onValueChange={(value) => handleSaleProductChange(index, value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => {
                          const pType = (product as any)?.itemType || 'product'
                          const typeLabel = pType === 'service' ? 'Service' : pType === 'rental' ? 'Rental' : 'Product'
                          return (
                          <SelectItem key={product.id} value={String(product.id)}>
                            <span className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">[{typeLabel}]</span>
                              {product.product_name} {product.product_id ? `(${product.product_id})` : ''}
                            </span>
                          </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updateSaleItem(index, { quantity: event.target.value })}
                      placeholder={isService ? 'Hours' : isRental ? 'Periods' : 'Qty'}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(event) => updateSaleItem(index, { price: event.target.value })}
                      placeholder="Price"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discount}
                      onChange={(event) => updateSaleItem(index, { discount: event.target.value })}
                      placeholder="Discount"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={saleItems.length === 1}
                      onClick={() => setSaleItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  )
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="saleTax">Tax</Label>
                  <Input
                    id="saleTax"
                    type="number"
                    min="0"
                    step="0.01"
                    value={saleForm.tax}
                    onChange={(event) => setSaleForm((prev) => ({ ...prev, tax: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="saleDiscount">Order Discount</Label>
                  <Input
                    id="saleDiscount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={saleForm.discount}
                    onChange={(event) => setSaleForm((prev) => ({ ...prev, discount: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="salePaid">Amount Paid</Label>
                  <Input
                    id="salePaid"
                    type="number"
                    min="0"
                    step="0.01"
                    max={saleTotal}
                    value={saleForm.amountPaid}
                    onChange={(event) => setSaleForm((prev) => ({ ...prev, amountPaid: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="saleNotes">Notes</Label>
                <Textarea
                  id="saleNotes"
                  value={saleForm.notes}
                  onChange={(event) => setSaleForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={3}
                />
              </div>

              <div className="rounded-md border p-4 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(saleSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Due</span>
                  <span className="font-semibold">{formatCurrency(saleTotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Balance after payment</span>
                  <span>{formatCurrency(Math.max(0, saleTotal - parseAmount(saleForm.amountPaid)))}</span>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowSaleModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingSale}>
                  {savingSale ? 'Saving...' : 'Record Sale'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <Label>Customer</Label>
                <p className="font-medium">{selectedCustomer.name}</p>
                {selectedSale?.receiptNo && (
                  <p className="text-sm text-muted-foreground">Sale: {selectedSale.receiptNo}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Balance: {Number(selectedSale?.balance ?? selectedCustomer.balance).toFixed(2)}
                </p>
              </div>
              
              <div>
                <Label htmlFor="amount">Payment Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  max={Number(selectedSale?.balance ?? selectedCustomer.balance)}
                />
              </div>
              
              <div>
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'mobile_money' && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mobile Money Details</p>
                  <div>
                    <Label>Network Provider *</Label>
                    <select
                      value={mobileProvider}
                      onChange={(e) => setMobileProvider(e.target.value)}
                      className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select provider</option>
                      <option value="MTN">MTN</option>
                      <option value="Airtel">Airtel</option>
                      <option value="Zamtel">Zamtel</option>
                      <option value="Vodafone">Vodafone</option>
                      <option value="M-Pesa">M-Pesa</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label>Phone Number *</Label>
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g. 0977123456"
                      type="tel"
                    />
                  </div>
                  <div>
                    <Label>Transaction ID *</Label>
                    <Input
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="e.g. TXN123456789"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Card Payment Details</p>
                  <div>
                    <Label>Transaction ID *</Label>
                    <Input
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="e.g. TXN123456789"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentModal(false)
                  setSelectedSale(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={recordPayment} disabled={
                !paymentAmount || parseFloat(paymentAmount) <= 0 ||
                (paymentMethod === 'mobile_money' ? (!mobileProvider || !phoneNumber.trim() || !transactionId.trim()) : false) ||
                (paymentMethod === 'card' ? !transactionId.trim() : false)
              }>
                Record Payment
              </Button>
            </div>
          </div>
        </div>
      )}

      {(selectedCustomerDetail || selectedSaleDetail) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {selectedCustomerDetail ? selectedCustomerDetail.name : selectedSaleDetail?.receiptNo}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedCustomerDetail ? 'Customer details' : 'Sale details'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={closeDetails}>
                Close
              </Button>
            </div>

            {selectedCustomerDetail && (
              <div>
                <DetailRow label="Status" value={getStatusBadge(selectedCustomerDetail.status)} />
                <DetailRow label="Phone" value={selectedCustomerDetail.phone} />
                <DetailRow label="Email" value={selectedCustomerDetail.email} />
                <DetailRow label="Address" value={selectedCustomerDetail.address} />
                <DetailRow label="Credit Limit" value={formatCurrency(selectedCustomerDetail.creditLimit)} />
                <DetailRow label="Balance" value={formatCurrency(selectedCustomerDetail.balance)} />
                <DetailRow
                  label="Available Credit"
                  value={formatCurrency(selectedCustomerDetail.creditLimit - selectedCustomerDetail.balance)}
                />
                <DetailRow label="Trust Score" value={`${selectedCustomerDetail.trustScore}/100`} />
                <DetailRow label="Notes" value={selectedCustomerDetail.notes} />
              </div>
            )}

            {selectedSaleDetail && (
              <div className="space-y-5">
                <div>
                  <DetailRow label="Customer" value={selectedSaleDetail.customer?.name || 'Walk-in customer'} />
                  <DetailRow label="Status" value={getPaymentStatusBadge(selectedSaleDetail.paymentStatus)} />
                  <DetailRow label="Payment Method" value={selectedSaleDetail.paymentMethod} />
                  <DetailRow label="Subtotal" value={formatCurrency(Number(selectedSaleDetail.subtotal || 0))} />
                  <DetailRow label="Tax" value={formatCurrency(Number(selectedSaleDetail.tax || 0))} />
                  <DetailRow label="Discount" value={formatCurrency(Number(selectedSaleDetail.discount || 0))} />
                  <DetailRow label="Total" value={formatCurrency(Number(selectedSaleDetail.total || 0))} />
                  <DetailRow label="Amount Paid" value={formatCurrency(Number(selectedSaleDetail.amountPaid || 0))} />
                  <DetailRow label="Balance" value={formatCurrency(Number(selectedSaleDetail.balance || 0))} />
                  <DetailRow
                    label="Due Date"
                    value={selectedSaleDetail.dueDate ? new Date(selectedSaleDetail.dueDate).toLocaleDateString() : 'Not set'}
                  />
                  <DetailRow label="Recorded By" value={formatUserName(selectedSaleDetail.user || selectedSaleDetail.User)} />
                  <DetailRow label="Created" value={new Date(selectedSaleDetail.createdAt).toLocaleString()} />
                  <DetailRow label="Notes" value={selectedSaleDetail.notes} />
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">Items</h4>
                  <div className="space-y-2">
                    {selectedSaleDetail.items?.length ? (
                      selectedSaleDetail.items.map((item: any, index: number) => (
                        <div key={`${item.product?.id || index}-${index}`} className="rounded-md border p-3 text-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium">{item.product?.name || 'Product'}</p>
                              <p className="text-xs text-muted-foreground">{item.product?.sku || 'No SKU'}</p>
                            </div>
                            <p className="font-semibold">{formatCurrency(Number(item.total || 0))}</p>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Qty {item.quantity} x {formatCurrency(Number(item.price || 0))}
                            {Number(item.discount || 0) > 0 ? `, discount ${formatCurrency(Number(item.discount || 0))}` : ''}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No items found for this sale.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
