import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Clock, ArrowLeft, Package, Check, AlertTriangle, X } from 'lucide-react'
import { rentalsApi, inventoryApi, branchesApi, settingsApi, type BranchOption, type InventoryItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalRentals, getLocalBranches, getLocalProducts, getLocalSettings } from '@/db/hybrid'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'

interface RentalItem {
  id: string
  productId: string
  product: { id: string; name: string; sku?: string }
  quantity: number
  unitHirePrice: number
  rentalPeriod: string
  periods: number
  totalAmount: number
  conditionOut: string
  conditionReturn?: string | null
  damageFee?: number | null
  notes?: string | null
}

interface Rental {
  id: string
  rentalNo: string
  customer?: { id: string; name: string; phone?: string } | null
  branch?: { id: string; name: string } | null
  user?: { id: string; fname?: string; lname?: string } | null
  hireDate: string
  expectedReturnDate: string
  actualReturnDate?: string | null
  totalAmount: number
  depositAmount: number
  depositStatus: string
  amountPaid: number
  balance: number
  paymentStatus: string
  paymentMethod?: string
  status: string
  notes?: string | null
  items: RentalItem[]
}

export default function RentalsPage() {
  const [rentals, setRentals] = useState<Rental[]>([])
  const { paginatedItems: paginatedRentals, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(rentals, 10)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [returningRental, setReturningRental] = useState<Rental | null>(null)
  const [selectedRental, setSelectedRental] = useState<Rental | null>(null)
  const [rentalItems, setRentalItems] = useState<InventoryItem[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [summary, setSummary] = useState<any>(null)

  // Form state
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0])
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [depositAmount, setDepositAmount] = useState(0)
  const [amountPaid, setAmountPaid] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [mobileProvider, setMobileProvider] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [discount, setDiscount] = useState(0)
  const [guarantorName, setGuarantorName] = useState('')
  const [guarantorPhone, setGuarantorPhone] = useState('')
  const [customerNin, setCustomerNin] = useState('')
  const [taxConfig, setTaxConfig] = useState<{ taxEnabled: boolean; taxRate: number; taxId: string } | null>(null)
  const [notes, setNotes] = useState('')
  const [branchId, setBranchId] = useState('')
  const [selectedItems, setSelectedItems] = useState<{ productId: string; quantity: number; unitHirePrice: number; rentalPeriod: string; periods: number; conditionOut: string }[]>([])
  const formRef = useRef<HTMLDivElement>(null)

  // Return form state
  const [returnConditions, setReturnConditions] = useState<Record<string, string>>({})
  const [returnDamageFees, setReturnDamageFees] = useState<Record<string, number>>({})
  const [returnDepositStatus, setReturnDepositStatus] = useState('refunded')

  const { toast } = useToast()
  const { hasPermission } = useJWTAuth()
  const online = useOnlineStatus()
  const canCreateRental = hasPermission('canCreateRental')
  const canProcessReturn = hasPermission('canProcessRentalReturn')
  const canDeleteRental = hasPermission('canDeleteRental')
  const canViewReport = hasPermission('canViewRentalReport')

  useEffect(() => {
    loadRentals()
    loadBranches()
    loadTaxConfig()
    if (canViewReport) loadSummary()
  }, [statusFilter])

  const loadTaxConfig = async () => {
    try {
      if (online) {
        const data = await settingsApi.get()
        setTaxConfig({ taxEnabled: data.taxEnabled, taxRate: data.taxRate || 0, taxId: data.taxId || '' })
      } else {
        const local = await getLocalSettings()
        if (local) setTaxConfig({ taxEnabled: local.taxEnabled, taxRate: local.taxRate || 0, taxId: local.taxId || '' })
      }
    } catch {}
  }

  const loadRentals = async () => {
    setLoading(true)
    try {
      if (online) {
        const data = await rentalsApi.list({ status: statusFilter !== 'all' ? statusFilter : undefined })
        setRentals(data?.rentals || [])
      } else {
        const local = await getLocalRentals(statusFilter)
        setRentals(local as any)
      }
    } catch (err: any) {
      try {
        const local = await getLocalRentals(statusFilter)
        setRentals(local as any)
      } catch {
        toast({ title: 'Error', description: err.message || 'Failed to load rentals', variant: 'destructive' })
      }
    } finally {
      setLoading(false)
    }
  }

  const loadBranches = async () => {
    try {
      if (online) {
        const data = await branchesApi.active()
        setBranches(data || [])
        if (data.length === 1) setBranchId(data[0].id)
      } else {
        const local = await getLocalBranches()
        setBranches(local as any)
        if (local.length === 1) setBranchId(local[0].id)
      }
    } catch (err: any) {
      try {
        const local = await getLocalBranches()
        setBranches(local as any)
      } catch {}
    }
  }

  const loadSummary = async () => {
    try {
      const data = await rentalsApi.summary()
      setSummary(data)
    } catch (err: any) {
      console.error('Failed to load summary:', err)
    }
  }

  const loadRentalItems = async () => {
    try {
      const data = await inventoryApi.list(undefined, undefined, 'rental')
      setRentalItems(data)
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to load rental items', variant: 'destructive' })
    }
  }

  const openNewForm = () => {
    setShowForm(true)
    setCustomerId('')
    setCustomerName('')
    setCustomerPhone('')
    setHireDate(new Date().toISOString().split('T')[0])
    setExpectedReturnDate('')
    setDepositAmount(0)
    setAmountPaid(0)
    setPaymentMethod('cash')
    setMobileProvider('')
    setPhoneNumber('')
    setTransactionId('')
    setDiscount(0)
    setGuarantorName('')
    setGuarantorPhone('')
    setCustomerNin('')
    setNotes('')
    setSelectedItems([])
    loadRentalItems()
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const openReturnForm = (rental: Rental) => {
    setReturningRental(rental)
    setShowReturnForm(true)
    const conditions: Record<string, string> = {}
    const fees: Record<string, number> = {}
    rental.items.forEach((item) => {
      conditions[item.id] = 'good'
      fees[item.id] = 0
    })
    setReturnConditions(conditions)
    setReturnDamageFees(fees)
    setReturnDepositStatus('refunded')
  }

  const addItemToRental = (item: InventoryItem) => {
    const itemId = String(item.id)
    const existing = selectedItems.find((si) => si.productId === itemId)
    if (existing) {
      setSelectedItems(selectedItems.map((si) =>
        si.productId === itemId ? { ...si, quantity: si.quantity + 1 } : si
      ))
    } else {
      setSelectedItems([...selectedItems, {
        productId: itemId,
        quantity: 1,
        unitHirePrice: Number((item as any).rentalPrice || item.unit_price || 0),
        rentalPeriod: String((item as any).rentalPeriod || 'daily'),
        periods: 1,
        conditionOut: 'good',
      }])
    }
  }

  const updateSelectedItem = (productId: string, field: string, value: any) => {
    setSelectedItems(selectedItems.map((si) =>
      si.productId === productId ? { ...si, [field]: value } : si
    ))
  }

  const removeSelectedItem = (productId: string) => {
    setSelectedItems(selectedItems.filter((si) => si.productId !== productId))
  }

  const subtotal = selectedItems.reduce((sum, si) => sum + si.unitHirePrice * si.quantity * si.periods, 0)
  const taxableAmount = Math.max(0, subtotal - discount)
  const taxAmount = (taxConfig?.taxEnabled && taxConfig?.taxRate) ? Math.round(taxableAmount * taxConfig.taxRate / 100 * 100) / 100 : 0
  const totalAmount = Math.max(0, taxableAmount + taxAmount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedItems.length === 0) {
      toast({ title: 'Error', description: 'Add at least one rental item', variant: 'destructive' })
      return
    }
    if (!expectedReturnDate) {
      toast({ title: 'Error', description: 'Expected return date is required', variant: 'destructive' })
      return
    }

    try {
      await rentalsApi.create({
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: selectedItems,
        hireDate,
        expectedReturnDate,
        depositAmount,
        amountPaid,
        paymentMethod,
        mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined,
        phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined,
        transactionId: ['mobile_money', 'card'].includes(paymentMethod) ? transactionId : undefined,
        discount,
        guarantorName: guarantorName || undefined,
        guarantorPhone: guarantorPhone || undefined,
        customerNin: customerNin || undefined,
        notes,
        branchId: branchId || undefined,
      })
      toast({ title: 'Success', description: 'Rental created successfully' })
      setShowForm(false)
      loadRentals()
      if (canViewReport) loadSummary()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create rental', variant: 'destructive' })
    }
  }

  const handleReturn = async () => {
    if (!returningRental) return
    try {
      const items = returningRental.items.map((item) => ({
        rentalItemId: item.id,
        conditionReturn: returnConditions[item.id] || 'good',
        damageFee: returnDamageFees[item.id] || 0,
      }))
      await rentalsApi.return(returningRental.id, {
        items,
        depositStatus: returnDepositStatus,
        damageFees: returnDamageFees,
      })
      toast({ title: 'Success', description: 'Items returned successfully' })
      setShowReturnForm(false)
      setReturningRental(null)
      loadRentals()
      if (canViewReport) loadSummary()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to process return', variant: 'destructive' })
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this rental? Stock will be restored.')) return
    try {
      await rentalsApi.cancel(id)
      toast({ title: 'Success', description: 'Rental cancelled' })
      loadRentals()
      if (canViewReport) loadSummary()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to cancel rental', variant: 'destructive' })
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-blue-100 text-blue-700',
      returned: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
      lost: 'bg-orange-100 text-orange-700',
      cancelled: 'bg-gray-100 text-gray-700',
    }
    return styles[status] || 'bg-gray-100 text-gray-700'
  }

  const isOverdue = (rental: Rental) => {
    return rental.status === 'active' && new Date(rental.expectedReturnDate) < new Date()
  }

  if (selectedRental) {
    return (
      <div className="space-y-6 p-6">
        <Button variant="ghost" onClick={() => setSelectedRental(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Rentals
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Rental Details — {selectedRental.rentalNo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Customer:</span> {selectedRental.customer?.name || 'Walk-in'}</div>
              <div><span className="font-medium">Phone:</span> {selectedRental.customer?.phone || '-'}</div>
              <div><span className="font-medium">Hire Date:</span> {new Date(selectedRental.hireDate).toLocaleDateString()}</div>
              <div><span className="font-medium">Expected Return:</span> {new Date(selectedRental.expectedReturnDate).toLocaleDateString()}</div>
              {selectedRental.actualReturnDate && (
                <div><span className="font-medium">Actual Return:</span> {new Date(selectedRental.actualReturnDate).toLocaleDateString()}</div>
              )}
              <div><span className="font-medium">Status:</span> <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusBadge(selectedRental.status))}>{selectedRental.status}</span></div>
              <div><span className="font-medium">Total:</span> {formatCurrency(selectedRental.totalAmount)}</div>
              <div><span className="font-medium">Deposit:</span> {formatCurrency(selectedRental.depositAmount)} ({selectedRental.depositStatus})</div>
              <div><span className="font-medium">Paid:</span> {formatCurrency(selectedRental.amountPaid)}</div>
              <div><span className="font-medium">Balance:</span> {formatCurrency(selectedRental.balance)}</div>
              {(selectedRental as any).discount > 0 && (
                <div><span className="font-medium">Discount:</span> {formatCurrency((selectedRental as any).discount)}</div>
              )}
              {(selectedRental as any).taxAmount > 0 && (
                <div><span className="font-medium">Tax:</span> {formatCurrency((selectedRental as any).taxAmount)}</div>
              )}
              {(selectedRental as any).guarantorName && (
                <div><span className="font-medium">Guarantor:</span> {(selectedRental as any).guarantorName} ({(selectedRental as any).guarantorPhone || '—'})</div>
              )}
              {(selectedRental as any).customerNin && (
                <div><span className="font-medium">National ID (NIN):</span> {(selectedRental as any).customerNin}</div>
              )}
              {selectedRental.paymentMethod && selectedRental.paymentMethod !== 'cash' && (
                <div><span className="font-medium">Payment:</span> {selectedRental.paymentMethod}{(selectedRental as any).transactionId ? ` — ${(selectedRental as any).transactionId}` : ''}</div>
              )}
            </div>
            {selectedRental.notes && (
              <div className="text-sm"><span className="font-medium">Notes:</span> {selectedRental.notes}</div>
            )}
            <div>
              <h4 className="font-medium mb-2">Items</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 font-medium text-right">Qty</th>
                      <th className="pb-2 font-medium text-right">Unit Price</th>
                      <th className="pb-2 font-medium">Period</th>
                      <th className="pb-2 font-medium text-right">Periods</th>
                      <th className="pb-2 font-medium">Out Condition</th>
                      <th className="pb-2 font-medium">Return Condition</th>
                      <th className="pb-2 font-medium text-right">Damage Fee</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRental.items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2">{item.product.name}</td>
                        <td className="py-2 text-right">{item.quantity}</td>
                        <td className="py-2 text-right">{formatCurrency(item.unitHirePrice)}</td>
                        <td className="py-2">{item.rentalPeriod}</td>
                        <td className="py-2 text-right">{item.periods}</td>
                        <td className="py-2">{item.conditionOut}</td>
                        <td className="py-2">{item.conditionReturn || '—'}</td>
                        <td className="py-2 text-right">{item.damageFee ? formatCurrency(item.damageFee) : '—'}</td>
                        <td className="py-2 text-right">{formatCurrency(item.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rentals</h1>
          <p className="text-muted-foreground">Hire out items and track returns</p>
        </div>
        {canCreateRental && (
          <Button onClick={openNewForm}>
            <Plus className="mr-2 h-4 w-4" />
            New Hire
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{summary.activeRentals}</div>
              <p className="text-xs text-muted-foreground">Active Rentals</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{summary.overdueRentals}</div>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{formatCurrency(summary.totalDepositsHeld)}</div>
              <p className="text-xs text-muted-foreground">Deposits Held</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search rentals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {['all', 'active', 'overdue', 'returned', 'cancelled'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors",
                statusFilter === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Rentals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Rentals ({rentals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : rentals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No rentals found</p>
              {canCreateRental && (
                <Button onClick={openNewForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Hire
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Rental No</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Items</th>
                    <th className="pb-3 font-medium">Hire Date</th>
                    <th className="pb-3 font-medium">Expected Return</th>
                    <th className="pb-3 font-medium text-right">Total</th>
                    <th className="pb-3 font-medium text-right">Deposit</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRentals.map((rental) => (
                    <tr key={rental.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-medium cursor-pointer" onClick={() => setSelectedRental(rental)}>
                        {rental.rentalNo}
                      </td>
                      <td className="py-3">{rental.customer?.name || 'Walk-in'}</td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {rental.items.length} item(s)
                      </td>
                      <td className="py-3 text-sm">{new Date(rental.hireDate).toLocaleDateString()}</td>
                      <td className="py-3 text-sm">
                        {new Date(rental.expectedReturnDate).toLocaleDateString()}
                        {isOverdue(rental) && (
                          <span className="ml-1 inline-flex items-center text-xs text-red-600">
                            <AlertTriangle className="h-3 w-3" /> Overdue
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">{formatCurrency(rental.totalAmount)}</td>
                      <td className="py-3 text-right">{formatCurrency(rental.depositAmount)}</td>
                      <td className="py-3">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusBadge(rental.status))}>
                          {rental.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {canProcessReturn && rental.status === 'active' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReturnForm(rental)}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Return
                            </Button>
                          )}
                          {canDeleteRental && rental.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancel(rental.id)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={goToPage}
          />
        </CardContent>
      </Card>

      {/* New Rental Form */}
      {showForm && (
        <Card ref={formRef}>
          <CardHeader>
            <CardTitle>New Hire — Hire Out Items</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Customer info */}
              <div className="grid gap-4 sm:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input
                    id="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer full name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerPhone">Customer Phone *</Label>
                  <Input
                    id="customerPhone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerNin">National ID No. (NIN) *</Label>
                  <Input
                    id="customerNin"
                    value={customerNin}
                    onChange={(e) => setCustomerNin(e.target.value)}
                    placeholder="e.g. CF9802001234567"
                    maxLength={20}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hireDate">Hire Date *</Label>
                  <Input
                    id="hireDate"
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expectedReturnDate">Expected Return Date *</Label>
                  <Input
                    id="expectedReturnDate"
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Branch */}
              {branches.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="branchId">Branch</Label>
                  <select
                    id="branchId"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Item selection */}
              <div className="space-y-2">
                <Label>Select Rental Items</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                  {rentalItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No rental items available. Create rental items in Inventory first.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {rentalItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-md border p-2 hover:bg-muted/50 cursor-pointer"
                          onClick={() => addItemToRental(item)}
                        >
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{item.product_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.quantity} available
                            </span>
                          </div>
                          <span className="text-sm">
                            {formatCurrency((item as any).rentalPrice || item.unit_price)}/{(item as any).rentalPeriod || 'day'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected items */}
              {selectedItems.length > 0 && (
                <div className="space-y-2">
                  <Label>Selected Items</Label>
                  <div className="space-y-2">
                    {selectedItems.map((si) => {
                      const item = rentalItems.find((ri) => ri.id === si.productId)
                      return (
                        <div key={si.productId} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
                          <span className="col-span-3 text-sm font-medium">{item?.product_name || si.productId}</span>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min="1"
                              value={si.quantity}
                              onChange={(e) => updateSelectedItem(si.productId, 'quantity', parseInt(e.target.value) || 1)}
                              className="h-8 text-sm"
                              placeholder="Qty"
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={si.unitHirePrice}
                              onChange={(e) => updateSelectedItem(si.productId, 'unitHirePrice', parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm"
                              placeholder="Price"
                            />
                          </div>
                          <div className="col-span-2">
                            <select
                              value={si.rentalPeriod}
                              onChange={(e) => updateSelectedItem(si.productId, 'rentalPeriod', e.target.value)}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                            >
                              <option value="hourly">Hourly</option>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="weekend">Weekend</option>
                              <option value="monthly">Monthly</option>
                              <option value="custom">Custom</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min="1"
                              value={si.periods}
                              onChange={(e) => updateSelectedItem(si.productId, 'periods', parseInt(e.target.value) || 1)}
                              className="h-8 text-sm"
                              placeholder="Periods"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSelectedItem(si.productId)}
                            className="col-span-1 text-destructive hover:text-destructive/80"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <div className="space-y-1 text-right text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal:</span> <span>{formatCurrency(subtotal)}</span></div>
                    {discount > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>Discount:</span> <span>-{formatCurrency(discount)}</span></div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>Tax{taxConfig?.taxId ? ` (${taxConfig.taxId})` : ''}:</span> <span>{formatCurrency(taxAmount)}</span></div>
                    )}
                    <div className="flex justify-between font-medium"><span>Total:</span> <span>{formatCurrency(totalAmount)}</span></div>
                  </div>
                </div>
              )}

              {/* Discount & Payment */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="discount">Discount</Label>
                  <Input
                    id="discount"
                    type="number"
                    min="0"
                    step="any"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depositAmount">Security Deposit</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    min="0"
                    step="any"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amountPaid">Amount Paid</Label>
                  <Input
                    id="amountPaid"
                    type="number"
                    min="0"
                    step="any"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method *</Label>
                <select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              {/* Mobile Money fields */}
              {paymentMethod === 'mobile_money' && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mobile Money Details</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-sm font-medium">Network Provider *</Label>
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
                      <Label className="text-sm font-medium">Phone Number *</Label>
                      <Input
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. 0977123456"
                        type="tel"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Transaction ID *</Label>
                      <Input
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        placeholder="e.g. TXN123456789"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Card fields */}
              {paymentMethod === 'card' && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Card Payment Details</p>
                  <div>
                    <Label className="text-sm font-medium">Transaction ID *</Label>
                    <Input
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="e.g. TXN123456789"
                    />
                  </div>
                </div>
              )}

              {/* Guarantor (optional) */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="guarantorName">Guarantor Name <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="guarantorName"
                    value={guarantorName}
                    onChange={(e) => setGuarantorName(e.target.value)}
                    placeholder="Guarantor full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guarantorPhone">Guarantor Phone <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="guarantorPhone"
                    value={guarantorPhone}
                    onChange={(e) => setGuarantorPhone(e.target.value)}
                    placeholder="Guarantor phone number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions or terms..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !customerName.trim() ||
                    !customerPhone.trim() ||
                    !customerNin.trim() ||
                    !hireDate ||
                    !expectedReturnDate ||
                    selectedItems.length === 0 ||
                    (paymentMethod === 'mobile_money' ? (!mobileProvider || !phoneNumber.trim() || !transactionId.trim()) :
                     paymentMethod === 'card' ? !transactionId.trim() :
                     false)
                  }
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Hire Out Items
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Return Form */}
      {showReturnForm && returningRental && (
        <Card>
          <CardHeader>
            <CardTitle>Process Return — {returningRental.rentalNo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Customer: {returningRental.customer?.name || 'Walk-in'} | 
              Hired: {new Date(returningRental.hireDate).toLocaleDateString()} | 
              Expected Return: {new Date(returningRental.expectedReturnDate).toLocaleDateString()}
            </div>

            {/* Items return conditions */}
            <div className="space-y-2">
              <Label>Item Conditions</Label>
              {returningRental.items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
                  <span className="col-span-4 text-sm font-medium">{item.product.name}</span>
                  <span className="col-span-1 text-sm text-muted-foreground">x{item.quantity}</span>
                  <div className="col-span-3">
                    <select
                      value={returnConditions[item.id] || 'good'}
                      onChange={(e) => setReturnConditions({ ...returnConditions, [item.id]: e.target.value })}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="damaged">Damaged</option>
                      <option value="broken">Broken (not returnable)</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={returnDamageFees[item.id] || 0}
                      onChange={(e) => setReturnDamageFees({ ...returnDamageFees, [item.id]: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm"
                      placeholder="Damage fee"
                    />
                  </div>
                  <div className="col-span-1 text-xs text-muted-foreground text-right">
                    Out: {item.conditionOut}
                  </div>
                </div>
              ))}
            </div>

            {/* Deposit handling */}
            <div className="space-y-2">
              <Label htmlFor="returnDepositStatus">Deposit Status</Label>
              <select
                id="returnDepositStatus"
                value={returnDepositStatus}
                onChange={(e) => setReturnDepositStatus(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="refunded">Refund Deposit</option>
                <option value="forfeited">Forfeit Deposit</option>
                <option value="collected">Keep Collected</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowReturnForm(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleReturn}>
                <Check className="mr-2 h-4 w-4" />
                Confirm Return
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
