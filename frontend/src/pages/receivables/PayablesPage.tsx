import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useFeatureAccess } from '@/services/featureAccessService'
import { apiFetch, inventoryApi, type InventoryItem } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import CreateSupplierModal from '@/components/modals/CreateSupplierModal'
import { 
  Building2, 
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
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

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

interface SupplierPurchase {
  id: string
  refNo: string
  supplier: {
    id: string
    name: string
    phone?: string
  }
  user: {
    id: string
    fname: string
    lname: string
  }
  total: number
  amountPaid: number
  balance: number
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overdue'
  dueDate?: string
  notes?: string
  items: Array<{
    product: {
      id: string
      name: string
      sku: string
    }
    quantity: number
    cost: number
    total: number
  }>
  createdAt: string
}

interface SupplierPayment {
  id: string
  amount: number
  paymentMethod: string
  reference?: string
  notes?: string
  createdAt: string
  supplier: {
    id: string
    name: string
    phone?: string
  }
  purchase?: {
    id: string
    refNo: string
  }
}

interface PurchaseDraftItem {
  productId: string
  quantity: string
  cost: string
}

const createEmptyPurchaseItem = (): PurchaseDraftItem => ({
  productId: '',
  quantity: '1',
  cost: '',
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

export default function PayablesPage() {
  const { isFeatureEnabled, canAccessFeature } = useFeatureAccess()
  const { toast } = useToast()
  
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierOptions, setSupplierOptions] = useState<Supplier[]>([])
  const [products, setProducts] = useState<InventoryItem[]>([])
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([])
  const [payments, setPayments] = useState<SupplierPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchases' | 'payments'>('suppliers')
  const [summary, setSummary] = useState<any>(null)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<SupplierPurchase | null>(null)
  const [selectedSupplierDetail, setSelectedSupplierDetail] = useState<Supplier | null>(null)
  const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState<SupplierPurchase | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [mobileProvider, setMobileProvider] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    refNo: '',
    amountPaid: '0',
    notes: '',
  })
  const [purchaseItems, setPurchaseItems] = useState<PurchaseDraftItem[]>([createEmptyPurchaseItem()])
  const suppliersEnabled = isFeatureEnabled('suppliers')

  useEffect(() => {
    if (!suppliersEnabled) {
      setLoading(false)
      return
    }

    if (activeTab === 'suppliers') {
      loadSuppliers()
    }
    if (activeTab === 'purchases') loadPurchases()
    if (activeTab === 'payments') loadPayments()
    loadPayablesSummary()
  }, [suppliersEnabled, activeTab, searchTerm, statusFilter])

  const loadSuppliers = async (
    showPageLoading = true,
    overrides?: { search?: string; status?: string }
  ) => {
    try {
      if (showPageLoading) setLoading(true)
      const params = new URLSearchParams({
        ...((overrides?.search ?? searchTerm) && { search: overrides?.search ?? searchTerm }),
        ...((overrides?.status ?? statusFilter) !== 'all' && { status: overrides?.status ?? statusFilter })
      })
      
      const response = await apiFetch(`/api/payables/suppliers?${params}`)
      if (response.ok) {
        const data = await response.json()
        setSuppliers(data.suppliers)
      } else {
        throw new Error(await readResponseError(response, 'Failed to load suppliers'))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load suppliers',
        variant: 'destructive'
      })
    } finally {
      if (showPageLoading) setLoading(false)
    }
  }

  const loadPurchases = async () => {
    try {
      const response = await apiFetch('/api/payables/purchases')
      if (response.ok) {
        const data = await response.json()
        setPurchases(data.purchases)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load purchases',
        variant: 'destructive'
      })
    }
  }

  const loadPayments = async () => {
    try {
      const response = await apiFetch('/api/payables/payments')
      if (response.ok) {
        const data = await response.json()
        setPayments(data.payments)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load payments',
        variant: 'destructive'
      })
    }
  }

  const loadPayablesSummary = async () => {
    try {
      const response = await apiFetch('/api/payables/payables/summary')
      if (response.ok) {
        const data = await response.json()
        setSummary(data)
      }
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const loadProducts = async () => {
    try {
      const data = await inventoryApi.list()
      setProducts(data)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load products',
        variant: 'destructive'
      })
    }
  }

  const loadSupplierOptions = async () => {
    try {
      const response = await apiFetch('/api/payables/suppliers?status=active&limit=100')
      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to load supplier options'))
      }
      const data = await response.json()
      setSupplierOptions(data.suppliers || [])
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load supplier options',
        variant: 'destructive'
      })
    }
  }

  const openPurchaseModal = () => {
    setShowPurchaseModal(true)
    loadSupplierOptions()
    if (products.length === 0) loadProducts()
  }

  const updatePurchaseItem = (index: number, patch: Partial<PurchaseDraftItem>) => {
    setPurchaseItems((prev) =>
      prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    )
  }

  const handlePurchaseProductChange = (index: number, productId: string) => {
    const product = products.find((item) => String(item.id) === productId)
    updatePurchaseItem(index, {
      productId,
      cost: product ? String(product.cost_price) : '',
    })
  }

  const purchaseTotal = purchaseItems.reduce((sum, item) => {
    return sum + parseAmount(item.cost) * Math.max(1, parseInt(item.quantity, 10) || 1)
  }, 0)

  const createPurchase = async (event: React.FormEvent) => {
    event.preventDefault()

    const items = purchaseItems
      .filter((item) => item.productId)
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
        cost: parseAmount(item.cost),
      }))

    if (!purchaseForm.supplierId || items.length === 0) {
      toast({
        title: 'Missing purchase details',
        description: 'Select a supplier and at least one product.',
        variant: 'destructive'
      })
      return
    }

    setSavingPurchase(true)
    try {
      const response = await apiFetch('/api/payables/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: purchaseForm.supplierId,
          refNo: purchaseForm.refNo || undefined,
          items,
          total: purchaseTotal,
          amountPaid: Math.min(parseAmount(purchaseForm.amountPaid), purchaseTotal),
          notes: purchaseForm.notes || undefined,
        })
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to create purchase'))
      }

      toast({
        title: 'Success',
        description: 'Purchase recorded successfully'
      })
      setShowPurchaseModal(false)
      setPurchaseForm({
        supplierId: '',
        refNo: '',
        amountPaid: '0',
        notes: '',
      })
      setPurchaseItems([createEmptyPurchaseItem()])
      loadPurchases()
      if (activeTab === 'suppliers') loadSuppliers()
      loadSupplierOptions()
      loadPayablesSummary()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create purchase',
        variant: 'destructive'
      })
    } finally {
      setSavingPurchase(false)
    }
  }

  const recordPayment = async () => {
    if (!selectedPurchase || !paymentAmount) return

    try {
      const response = await apiFetch('/api/payables/payments', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: selectedPurchase.supplier.id,
          purchaseId: selectedPurchase.id,
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
      setSelectedPurchase(null)
      setPaymentAmount('')
      setPaymentMethod('cash')
      setMobileProvider('')
      setPhoneNumber('')
      setTransactionId('')
      loadPurchases()
      if (activeTab === 'suppliers') loadSuppliers()
      loadSupplierOptions()
      loadPayments()
      loadPayablesSummary()
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

  const getPaymentStatusBadge = (status: string) => {
    const variants = {
      paid: 'default',
      partial: 'secondary',
      unpaid: 'destructive',
      overdue: 'destructive'
    }
    return (
      <Badge variant={variants[status as keyof typeof variants]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const closeDetails = () => {
    setSelectedSupplierDetail(null)
    setSelectedPurchaseDetail(null)
  }

  const formatUserName = (user?: SupplierPurchase['user']) => {
    const name = `${user?.fname || ''} ${user?.lname || ''}`.trim()
    return name || 'Unknown'
  }

  if (!canAccessFeature('suppliers')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access supplier management.</p>
        </div>
      </div>
    )
  }

  if (!isFeatureEnabled('suppliers')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Feature Not Available</h2>
          <p className="text-muted-foreground">Supplier management is not available in your current plan.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payables Management</h1>
          <p className="text-muted-foreground">Manage suppliers and outstanding payments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowSupplierModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
          <Button onClick={openPurchaseModal}>
            <FileText className="h-4 w-4 mr-2" />
            New Purchase
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Payables</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary.totalPayables?.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue Purchases</CardTitle>
              <Calendar className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {summary.overdueCount || 0}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {suppliers.filter(s => s.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blocked Suppliers</CardTitle>
              <Trash2 className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {suppliers.filter(s => s.status === 'blocked').length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 border-b">
        {['suppliers', 'purchases', 'payments'].map((tab) => (
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
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
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
      {activeTab === 'suppliers' && (
        <div className="grid gap-4">
          {loading ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            suppliers.map((supplier) => (
              <Card key={supplier.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{supplier.name}</h3>
                        <p className="text-sm text-muted-foreground">{supplier.phone}</p>
                        <p className="text-sm text-muted-foreground">{supplier.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(supplier.status)}
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                      <p className="text-lg font-bold text-red-600">
                        {supplier.balance.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedSupplierDetail(supplier)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'purchases' && (
        <div className="grid gap-4">
          {loading ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            purchases.map((purchase) => (
              <Card key={purchase.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{purchase.refNo}</h3>
                      <p className="text-sm text-muted-foreground">
                        From {purchase.supplier.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(purchase.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      {getPaymentStatusBadge(purchase.paymentStatus)}
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Amount</p>
                      <p className="font-semibold">{purchase.total.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Amount Paid</p>
                      <p className="font-semibold">{purchase.amountPaid.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Balance</p>
                      <p className="font-semibold text-red-600">{purchase.balance.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    {purchase.balance > 0 && (
                      <Button 
                        size="sm"
                        onClick={() => {
                          setSelectedPurchase(purchase)
                          setPaymentAmount(String(purchase.balance))
                          setShowPaymentModal(true)
                        }}
                      >
                        <Wallet className="h-4 w-4 mr-1" />
                        Record Payment
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSelectedPurchaseDetail(purchase)}>
                      <FileText className="h-4 w-4 mr-1" />
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
          {loading ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            payments.map((payment) => (
              <Card key={payment.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{payment.amount.toFixed(2)}</h3>
                      <p className="text-sm text-muted-foreground">
                        To {payment.supplier.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">
                        {payment.paymentMethod}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    {payment.reference && (
                      <p className="text-sm text-muted-foreground">
                        Reference: {payment.reference}
                      </p>
                    )}
                    {payment.notes && (
                      <p className="text-sm text-muted-foreground">
                        Notes: {payment.notes}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <CreateSupplierModal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        onSuccess={(supplier) => {
          setSuppliers((prev) => [supplier, ...prev.filter((item) => item.id !== supplier.id)])
          setSupplierOptions((prev) => [supplier, ...prev.filter((item) => item.id !== supplier.id)])
          if (activeTab === 'suppliers') loadSuppliers()
          loadPayablesSummary()
        }}
      />

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold mb-4">New Supplier Purchase</h3>
            <form onSubmit={createPurchase} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Supplier</Label>
                  <Select
                    value={purchaseForm.supplierId}
                    onValueChange={(value) => setPurchaseForm((prev) => ({ ...prev, supplierId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {(supplierOptions.length ? supplierOptions : suppliers).map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name} {supplier.phone ? `(${supplier.phone})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="purchaseRef">Reference / Invoice No.</Label>
                  <Input
                    id="purchaseRef"
                    value={purchaseForm.refNo}
                    onChange={(event) => setPurchaseForm((prev) => ({ ...prev, refNo: event.target.value }))}
                    placeholder="Auto-generated if blank"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPurchaseItems((prev) => [...prev, createEmptyPurchaseItem()])}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>

                {purchaseItems.map((item, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_100px_140px_40px]">
                    <Select value={item.productId} onValueChange={(value) => handlePurchaseProductChange(index, value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={String(product.id)}>
                            {product.product_name} {product.product_id ? `(${product.product_id})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updatePurchaseItem(index, { quantity: event.target.value })}
                      placeholder="Qty"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.cost}
                      onChange={(event) => updatePurchaseItem(index, { cost: event.target.value })}
                      placeholder="Unit cost"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={purchaseItems.length === 1}
                      onClick={() => setPurchaseItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="purchasePaid">Amount Paid</Label>
                  <Input
                    id="purchasePaid"
                    type="number"
                    min="0"
                    step="0.01"
                    max={purchaseTotal}
                    value={purchaseForm.amountPaid}
                    onChange={(event) => setPurchaseForm((prev) => ({ ...prev, amountPaid: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="purchaseNotes">Notes</Label>
                  <Textarea
                    id="purchaseNotes"
                    value={purchaseForm.notes}
                    onChange={(event) => setPurchaseForm((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={2}
                  />
                </div>
              </div>

              <div className="rounded-md border p-4 text-sm">
                <div className="flex justify-between">
                  <span>Total Cost</span>
                  <span className="font-semibold">{formatCurrency(purchaseTotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Balance after payment</span>
                  <span>{formatCurrency(Math.max(0, purchaseTotal - parseAmount(purchaseForm.amountPaid)))}</span>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowPurchaseModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingPurchase}>
                  {savingPurchase ? 'Saving...' : 'Record Purchase'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <Label>Supplier</Label>
                <p className="font-medium">{selectedPurchase.supplier.name}</p>
                <p className="text-sm text-muted-foreground">Ref: {selectedPurchase.refNo}</p>
                <p className="text-sm text-red-600">Balance: {selectedPurchase.balance.toFixed(2)}</p>
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
                  max={selectedPurchase.balance}
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
              <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
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

      {(selectedSupplierDetail || selectedPurchaseDetail) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {selectedSupplierDetail ? selectedSupplierDetail.name : selectedPurchaseDetail?.refNo}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedSupplierDetail ? 'Supplier details' : 'Supplier purchase details'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={closeDetails}>
                Close
              </Button>
            </div>

            {selectedSupplierDetail && (
              <div className="space-y-4">
                <div>
                  <DetailRow label="Status" value={getStatusBadge(selectedSupplierDetail.status)} />
                  <DetailRow label="Phone" value={selectedSupplierDetail.phone} />
                  <DetailRow label="Email" value={selectedSupplierDetail.email} />
                  <DetailRow label="Address" value={selectedSupplierDetail.address} />
                  <DetailRow label="Outstanding Balance" value={formatCurrency(selectedSupplierDetail.balance)} />
                  <DetailRow label="Notes" value={selectedSupplierDetail.notes} />
                </div>
              </div>
            )}

            {selectedPurchaseDetail && (
              <div className="space-y-5">
                <div>
                  <DetailRow label="Supplier" value={selectedPurchaseDetail.supplier.name} />
                  <DetailRow label="Status" value={getPaymentStatusBadge(selectedPurchaseDetail.paymentStatus)} />
                  <DetailRow label="Total" value={formatCurrency(selectedPurchaseDetail.total)} />
                  <DetailRow label="Amount Paid" value={formatCurrency(selectedPurchaseDetail.amountPaid)} />
                  <DetailRow label="Balance" value={formatCurrency(selectedPurchaseDetail.balance)} />
                  <DetailRow
                    label="Due Date"
                    value={selectedPurchaseDetail.dueDate ? new Date(selectedPurchaseDetail.dueDate).toLocaleDateString() : 'Not set'}
                  />
                  <DetailRow label="Recorded By" value={formatUserName(selectedPurchaseDetail.user)} />
                  <DetailRow label="Created" value={new Date(selectedPurchaseDetail.createdAt).toLocaleString()} />
                  <DetailRow label="Notes" value={selectedPurchaseDetail.notes} />
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">Items</h4>
                  <div className="space-y-2">
                    {selectedPurchaseDetail.items?.length ? (
                      selectedPurchaseDetail.items.map((item, index) => (
                        <div key={`${item.product?.id || index}-${index}`} className="rounded-md border p-3 text-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium">{item.product?.name || 'Product'}</p>
                              <p className="text-xs text-muted-foreground">{item.product?.sku || 'No SKU'}</p>
                            </div>
                            <p className="font-semibold">{formatCurrency(Number(item.total || 0))}</p>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Qty {item.quantity} x {formatCurrency(Number(item.cost || 0))}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No items found for this purchase.</p>
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
