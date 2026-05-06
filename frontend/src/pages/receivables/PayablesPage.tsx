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

export default function PayablesPage() {
  const { isFeatureEnabled, canAccessFeature } = useFeatureAccess()
  const { toast } = useToast()
  
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([])
  const [payments, setPayments] = useState<SupplierPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchases' | 'payments'>('suppliers')
  const [summary, setSummary] = useState<any>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<SupplierPurchase | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  useEffect(() => {
    if (isFeatureEnabled('suppliers')) {
      loadSuppliers()
      loadPayablesSummary()
    }
  }, [isFeatureEnabled('suppliers')])

  const loadSuppliers = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const params = new URLSearchParams({
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter && { status: statusFilter })
      })
      
      const response = await fetch(`${API_URL}/api/payables/suppliers?${params}`)
      if (response.ok) {
        const data = await response.json()
        setSuppliers(data.suppliers)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load suppliers',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const loadPurchases = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/payables/purchases`)
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
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/payables/payments`)
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
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/payables/payables/summary`)
      if (response.ok) {
        const data = await response.json()
        setSummary(data)
      }
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const recordPayment = async () => {
    if (!selectedPurchase || !paymentAmount) return

    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/payables/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          supplierId: selectedPurchase.supplier.id,
          purchaseId: selectedPurchase.id,
          amount: parseFloat(paymentAmount),
          paymentMethod,
          notes: `Payment recorded via dashboard`
        })
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Payment recorded successfully'
        })
        setShowPaymentModal(false)
        setSelectedPurchase(null)
        setPaymentAmount('')
        setPaymentMethod('cash')
        loadPurchases()
        loadPayments()
        loadPayablesSummary()
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to record payment',
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
        <Button onClick={() => window.location.href = '/admin/platform'}>
          <Settings className="h-4 w-4 mr-2" />
          Manage Plans
        </Button>
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
            <SelectItem value="">All Status</SelectItem>
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
                      <Button size="sm" variant="outline">
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
                  
                  {purchase.balance > 0 && (
                    <div className="mt-4 flex gap-2">
                      <Button 
                        size="sm"
                        onClick={() => {
                          setSelectedPurchase(purchase)
                          setShowPaymentModal(true)
                        }}
                      >
                        <Wallet className="h-4 w-4 mr-1" />
                        Record Payment
                      </Button>
                      <Button size="sm" variant="outline">
                        <FileText className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  )}
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
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
              <Button onClick={recordPayment} disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}>
                Record Payment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
