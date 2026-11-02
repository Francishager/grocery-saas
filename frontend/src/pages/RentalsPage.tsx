import { appConfirm } from '@/lib/appFeedback'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Plus, Search, Clock, ArrowLeft, Package, Check, AlertTriangle, X, Sparkles, CalendarCheck, Printer, ChevronsUpDown } from 'lucide-react'
import { apiFetch, rentalsApi, inventoryApi, branchesApi, settingsApi, categoriesApi, type BranchOption, type InventoryItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { defaultBranchId } from '@/lib/branchSelection'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalRentals, getLocalBranches, getLocalProducts, getLocalSettings } from '@/db/hybrid'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { RichTextArea, RichTextDisplay, markdownToHtml } from '@/components/RichTextArea'

const localDateInput = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const RENTAL_LINE_CATEGORIES = [
  { name: 'Service', value: 'service' },
  { name: 'Delivery', value: 'delivery' },
  { name: 'Setup', value: 'setup' },
  { name: 'Staffing', value: 'staffing' },
  { name: 'Venue', value: 'venue' },
  { name: 'Cleaning', value: 'cleaning' },
  { name: 'Other', value: 'other' },
]

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

interface RentalCreditNote {
  id: string
  noteNo: string
  amount: number
  taxAmount: number
  appliedAmount: number
  refundDue: number
  refundedAmount: number
  reason: string
  notes?: string | null
  status: string
  createdAt: string
  payments?: { id: string; receiptNo: string; amount: number; paymentDate: string; paymentMethod?: string | null; cashAccount?: { name: string } | null }[]
}

interface Rental {
  id: string
  rentalNo: string
  customerId?: string | null
  customer?: { id: string; name: string; phone?: string } | null
  customerName?: string | null
  customerPhone?: string | null
  branch?: { id: string; name: string } | null
  user?: { id: string; fname?: string; lname?: string } | null
  hireDate: string
  expectedReturnDate: string
  actualReturnDate?: string | null
  totalAmount: number
  cancellationChargePercent?: number
  cancellationChargeAmount?: number
  cancellationTaxAmount?: number
  cancellationChargeBalance?: number
  cancellationRefundDue?: number
  cancellationRefundedAmount?: number
  cancellationReason?: string | null
  cancelledAt?: string | null
  depositAmount: number
  depositStatus: string
  amountPaid: number
  balance: number
  paymentStatus: string
  paymentMethod?: string
  depositPaid?: number
  depositRefunded?: number
  payments?: { id: string; receiptNo: string; kind: string; amount: number; balanceAfter: number; status?: string; createdAt?: string; paymentMethod?: string | null; paymentDate: string; transactionRef?: string | null; notes?: string | null; cashAccount?: { name: string; type: string } | null; user?: { id: string; fname?: string; lname?: string } | null }[]
  creditNotes?: RentalCreditNote[]
  isHistoricalRecord?: boolean
  isHistoricalReceivable?: boolean
  historicalReceivableAmount?: number
  historicalReference?: string | null
  status: string
  bookingState?: string
  bookingPurpose?: string | null
  deliveryAddress?: string | null
  deliveryFee?: number
  contractDraft?: string | null
  contractGeneratedAt?: string | null
  notes?: string | null
  items: RentalItem[]
  chargeLines?: { id: string; label: string; category: string; quantity: number; unitPrice: number; totalAmount: number }[]
}

interface RentalChargeDraft { lineType: 'service' | 'consumable'; productId?: string; label: string; category: string; quantity: number; unitPrice: number; unitCost?: number }
interface RentalChargeCatalogItem { id: string; name: string; sku?: string | null; itemType: 'service' | 'product'; price: number; quantity: number; baseUnit?: string | null }

function heldDepositAmount(rental: Pick<Rental, 'depositPaid' | 'depositAmount' | 'depositRefunded' | 'depositStatus'>) {
  const paid = Number(rental.depositPaid || 0)
  const legacyCollected = ['collected', 'held'].includes(String(rental.depositStatus || '').toLowerCase())
  const collected = paid > 0 ? paid : legacyCollected ? Number(rental.depositAmount || 0) : 0
  return Math.max(0, collected - Number(rental.depositRefunded || 0))
}

export default function RentalsPage({ section = 'bookings' }: { section?: 'bookings' | 'returns' | 'receivables' }) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const customerFilter = searchParams.get('customerId') || ''
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [bookingMode, setBookingMode] = useState<'reserve' | 'checkout'>('checkout')
  const [showForm, setShowForm] = useState(false)
  const [historicalMode, setHistoricalMode] = useState(false)
  const [historicalImportKey, setHistoricalImportKey] = useState('')
  const [historicalReference, setHistoricalReference] = useState('')
  const [collectUnpaidBalance, setCollectUnpaidBalance] = useState(false)
  const [historicalReceivableReference, setHistoricalReceivableReference] = useState('')
  const [historicalReceivableCustomerId, setHistoricalReceivableCustomerId] = useState('')
  const [historicalReceivableCustomerSearch, setHistoricalReceivableCustomerSearch] = useState('')
  const [historicalReceivableCustomerOptions, setHistoricalReceivableCustomerOptions] = useState<any[]>([])
  const [searchingHistoricalCustomers, setSearchingHistoricalCustomers] = useState(false)
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [returningRental, setReturningRental] = useState<Rental | null>(null)
  const [checkingOutRental, setCheckingOutRental] = useState<Rental | null>(null)
  const [savingCheckout, setSavingCheckout] = useState(false)
  const [selectedRental, setSelectedRental] = useState<Rental | null>(null)
  const [cancellingRental, setCancellingRental] = useState<Rental | null>(null)
  const [cancellationChargePercent, setCancellationChargePercent] = useState(0)
  const [cancellationReason, setCancellationReason] = useState('')
  const [rentalItems, setRentalItems] = useState<InventoryItem[]>([])
  const [chargeCatalog, setChargeCatalog] = useState<RentalChargeCatalogItem[]>([])
  const [rentalCategories, setRentalCategories] = useState<Array<{ id: string; name: string }>>([])
  const [openCategoryLine, setOpenCategoryLine] = useState<number | null>(null)
  const [categorySearch, setCategorySearch] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [openCatalogLine, setOpenCatalogLine] = useState<number | null>(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [summary, setSummary] = useState<any>(null)

  // Form state
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOptions, setCustomerOptions] = useState<any[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [manualRenter, setManualRenter] = useState(false)
  const [hireDate, setHireDate] = useState(localDateInput())
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [actualReturnDate, setActualReturnDate] = useState(localDateInput())
  const [historicalTaxRate, setHistoricalTaxRate] = useState(0)
  const [historicalPayments, setHistoricalPayments] = useState<{ kind: 'rental_payment' | 'deposit' | 'deposit_refund'; amount: number; paymentDate: string; paymentMethod: string; mobileProvider: string; phoneNumber: string; transactionRef: string; notes: string }[]>([])
  const [depositAmount, setDepositAmount] = useState(0)
  const [amountPaid, setAmountPaid] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentAccounts, setPaymentAccounts] = useState<{ id: string; name: string; type: string; balance: number; currency: string }[]>([])
  const [cashAccountId, setCashAccountId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [depositRefundAmount, setDepositRefundAmount] = useState(0)
  const [advanceRefundAmount, setAdvanceRefundAmount] = useState(0)
  const [forfeitureReason, setForfeitureReason] = useState('')
  const [savingRental, setSavingRental] = useState(false)
  const [savingRentalPayment, setSavingRentalPayment] = useState(false)
  const [savingCancellation, setSavingCancellation] = useState(false)
  const [savingCreditNote, setSavingCreditNote] = useState(false)
  const [showCreditNoteForm, setShowCreditNoteForm] = useState(false)
  const [creditNoteAmount, setCreditNoteAmount] = useState(0)
  const [creditNoteReason, setCreditNoteReason] = useState('price_adjustment')
  const [creditNoteNotes, setCreditNoteNotes] = useState('')
  const [refundCreditNote, setRefundCreditNote] = useState<RentalCreditNote | null>(null)
  const [creditRefundAmount, setCreditRefundAmount] = useState(0)
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
  const [additionalCharges, setAdditionalCharges] = useState<RentalChargeDraft[]>([])
  const [bookingPurpose, setBookingPurpose] = useState('')
  const [deliveryRequired, setDeliveryRequired] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [availabilityByProduct, setAvailabilityByProduct] = useState<Record<string, number>>({})
  const [generatingContract, setGeneratingContract] = useState(false)
  const [contractDraftValue, setContractDraftValue] = useState('')
  const [savingContract, setSavingContract] = useState(false)

  // Return form state
  const [returnConditions, setReturnConditions] = useState<Record<string, string>>({})
  const [returnDamageFees, setReturnDamageFees] = useState<Record<string, number>>({})
  const [returnDepositStatus, setReturnDepositStatus] = useState('held')

  const { toast } = useToast()
  const { hasPermission, user } = useJWTAuth()
  const online = useOnlineStatus()
  const canCreateRental = hasPermission('canCreateRental')
  const canProcessReturn = hasPermission('canProcessRentalReturn')
  const canDeleteRental = hasPermission('canDeleteRental')
  const canRecordRentalPayment = hasPermission('canRecordRentalPayment') || canCreateRental
  const canRefundRentalDeposit = hasPermission('canRefundRentalDeposit') || canProcessReturn
  const canRefundRentalAdvance = hasPermission('canRefundRentalAdvance') || canDeleteRental
  const canViewRentalCreditNotes = hasPermission('canViewRentalCreditNotes')
  const canCreateRentalCreditNote = hasPermission('canCreateRentalCreditNote')
  const canEditRentalCreditNote = hasPermission('canEditRentalCreditNote')
  const canRefundRentalCreditNote = hasPermission('canRefundRentalCreditNote')
  const canForfeitRentalDeposit = hasPermission('canForfeitRentalDeposit') || canProcessReturn
  const canCancelRental = hasPermission('canCancelRental') || canDeleteRental
  const canViewReport = hasPermission('canViewReportRentalsSummary')
  const canGenerateContract = hasPermission('canGenerateRentalContract')
  const canSelectExistingCustomer = hasPermission('canViewCustomer')
  const canSearchCustomerPhone = hasPermission('canViewCustomerPhone')

  useEffect(() => {
    if (!showForm || !canSelectExistingCustomer || manualRenter || customerId || !customerSearch.trim()) {
      setCustomerOptions([])
      setSearchingCustomers(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchingCustomers(true)
      try {
        const params = new URLSearchParams({ page: '1', limit: '20', search: customerSearch.trim(), status: 'active' })
        const response = await apiFetch(`/api/receivables/customers?${params}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not search customers')
        const data = await response.json()
        if (!controller.signal.aborted) setCustomerOptions(data?.customers || [])
      } catch (error: any) {
        if (!controller.signal.aborted) setCustomerOptions([])
      } finally {
        if (!controller.signal.aborted) setSearchingCustomers(false)
      }
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [showForm, canSelectExistingCustomer, manualRenter, customerId, customerSearch])

  useEffect(() => {
    if (!selectedRental?.isHistoricalRecord || selectedRental.customerId || !canSelectExistingCustomer || !historicalReceivableCustomerSearch.trim()) {
      setHistoricalReceivableCustomerOptions([])
      setSearchingHistoricalCustomers(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchingHistoricalCustomers(true)
      try {
        const params = new URLSearchParams({ page: '1', limit: '20', search: historicalReceivableCustomerSearch.trim(), status: 'active' })
        const response = await apiFetch(`/api/receivables/customers?${params}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not search customers')
        const data = await response.json()
        if (!controller.signal.aborted) setHistoricalReceivableCustomerOptions(data?.customers || [])
      } catch {
        if (!controller.signal.aborted) setHistoricalReceivableCustomerOptions([])
      } finally {
        if (!controller.signal.aborted) setSearchingHistoricalCustomers(false)
      }
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [selectedRental?.id, selectedRental?.isHistoricalRecord, selectedRental?.customerId, canSelectExistingCustomer, historicalReceivableCustomerSearch])

  useEffect(() => {
    setStatusFilter(section === 'returns' ? 'active' : 'all')
    setSelectedRental(null)
    setShowForm(false)
    setShowReturnForm(false)
  }, [section])

  useEffect(() => {
    const openRentalId = (location.state as any)?.openRentalId
    if (!openRentalId) return
    rentalsApi.get(openRentalId).then((data: any) => setSelectedRental(data?.rental || data)).catch((error: any) => {
      toast({ title: 'Could not open booking', description: error?.message || 'The booking may no longer be available.', variant: 'destructive' })
    })
  }, [location.key])

  useEffect(() => {
    loadRentals()
    loadBranches()
    loadTaxConfig()
    if (canViewReport) loadSummary()
  }, [statusFilter, customerFilter, section])

  const loadTaxConfig = async () => {
    try {
      if (online) {
        const data = await settingsApi.getTaxConfig()
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
        if (section === 'receivables') {
          const first = await rentalsApi.receivables({ page: 1, limit: 250 })
          const pages = Number(first?.pagination?.pages || 1)
          const remaining = pages > 1
            ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => rentalsApi.receivables({ page: index + 2, limit: 250 })))
            : []
          setRentals([...(first?.rentals || []), ...remaining.flatMap((result: any) => result?.rentals || [])])
        } else {
          const data = await rentalsApi.list({ status: statusFilter !== 'all' ? statusFilter : undefined, customerId: customerFilter || undefined })
          setRentals(data?.rentals || [])
        }
      } else {
        const local = await getLocalRentals(statusFilter)
        setRentals((local as any[]).filter(rental => !customerFilter || rental.customerId === customerFilter))
      }
    } catch (err: any) {
      try {
        const local = await getLocalRentals(statusFilter)
        setRentals((local as any[]).filter(rental => !customerFilter || rental.customerId === customerFilter))
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
        setBranchId(current => current || defaultBranchId(user, data))
      } else {
        const local = await getLocalBranches()
        setBranches(local as any)
        setBranchId(current => current || defaultBranchId(user, local))
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
    const [rentalResult, catalogResult, categoriesResult] = await Promise.allSettled([
      inventoryApi.list(undefined, branchId || undefined, 'rental'),
      rentalsApi.catalog(),
      categoriesApi.list('rental'),
    ])
    if (rentalResult.status === 'fulfilled') setRentalItems(rentalResult.value)
    else toast({ title: 'Error', description: 'Failed to load rental items', variant: 'destructive' })
    if (catalogResult.status === 'fulfilled') setChargeCatalog(catalogResult.value.filter((item: any) => item.itemType === 'product' || item.itemType === 'service'))
    else setChargeCatalog([])
    if (categoriesResult.status === 'fulfilled') setRentalCategories(categoriesResult.value.filter(category => category.categoryType === 'rental'))
    else setRentalCategories([])
  }

  const createRentalCategory = async (lineIndex: number) => {
    const name = categorySearch.normalize('NFKC').trim().replace(/\s+/g, ' ')
    if (!name || !canCreateRental || !online || savingCategory) return
    setSavingCategory(true)
    try {
      const { category } = await categoriesApi.create({ name, categoryType: 'rental' })
      setRentalCategories(current => [...current.filter(row => row.id !== category.id), category].sort((a, b) => a.name.localeCompare(b.name)))
      setAdditionalCharges(rows => rows.map((row, index) => index === lineIndex ? { ...row, category: category.name } : row))
      setCategorySearch('')
      setOpenCategoryLine(null)
      toast({ title: 'Category saved' })
    } catch (error: any) {
      toast({ title: 'Unable to create category', description: error?.message || 'Please try again.', variant: 'destructive' })
    } finally {
      setSavingCategory(false)
    }
  }

  const openNewForm = () => {
    setShowForm(true)
    setHistoricalMode(false)
    setHistoricalImportKey('')
    setHistoricalReference('')
    setCollectUnpaidBalance(false)
    setCustomerId('')
    setCustomerName('')
    setCustomerPhone('')
    setHireDate(localDateInput())
    setExpectedReturnDate('')
    setActualReturnDate(localDateInput())
    setHistoricalTaxRate(0)
    setHistoricalPayments([])
    setDepositAmount(0)
    setAmountPaid(0)
    setPaymentMethod('cash')
    setCashAccountId('')
    setPaymentAccounts([])
    setMobileProvider('')
    setPhoneNumber('')
    setTransactionId('')
    setDiscount(0)
    setGuarantorName('')
    setGuarantorPhone('')
    setCustomerNin('')
    setNotes('')
    setSelectedItems([])
    setAdditionalCharges([])
    setBookingMode('checkout')
    setCustomerSearch('')
    setCustomerOptions([])
    setManualRenter(false)
    setBookingPurpose('')
    setDeliveryRequired(false)
    setDeliveryAddress('')
    setDeliveryFee(0)
    loadRentalItems()
  }

  const openHistoricalForm = () => {
    openNewForm()
    setHistoricalMode(true)
    setCollectUnpaidBalance(section === 'receivables')
    setHistoricalImportKey(globalThis.crypto?.randomUUID?.() || `history-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`)
    setBookingMode('checkout')
    setActualReturnDate(localDateInput())
  }

  useEffect(() => {
    if (!showForm || !selectedItems.length || !hireDate || !expectedReturnDate) {
      setAvailabilityByProduct({})
      return
    }
    let cancelled = false
    const availabilityStart = bookingMode === 'checkout' ? new Date().toISOString() : hireDate
    rentalsApi.availability(selectedItems.map(item => item.productId), availabilityStart, expectedReturnDate, branchId || undefined)
      .then(result => {
        if (!cancelled) setAvailabilityByProduct(Object.fromEntries((result.availability || []).map((row: any) => [row.productId, Number(row.available)])))
      })
      .catch(() => { if (!cancelled) setAvailabilityByProduct({}) })
    return () => { cancelled = true }
  }, [showForm, selectedItems, hireDate, expectedReturnDate, branchId, bookingMode])

  useEffect(() => {
    if ((!showForm && !selectedRental) || !online || (showForm && amountPaid <= 0 && depositAmount <= 0) || (!showForm && paymentAmount <= 0 && depositRefundAmount <= 0 && advanceRefundAmount <= 0)) {
      if (!showForm && !selectedRental) { setPaymentAccounts([]); setCashAccountId('') }
      return
    }
    let cancelled = false
    rentalsApi.paymentAccounts(paymentMethod, branchId || undefined).then(accounts => {
      if (cancelled) return
      setPaymentAccounts(accounts)
      setCashAccountId(current => accounts.some((account: any) => account.id === current) ? current : accounts.length === 1 ? accounts[0].id : '')
    }).catch(() => { if (!cancelled) { setPaymentAccounts([]); setCashAccountId('') } })
    return () => { cancelled = true }
  }, [showForm, selectedRental?.id, online, paymentMethod, amountPaid, depositAmount, paymentAmount, depositRefundAmount, advanceRefundAmount, branchId])

  useEffect(() => {
    setContractDraftValue(selectedRental?.contractDraft || '')
  }, [selectedRental?.id, selectedRental?.contractDraft])

  useEffect(() => {
    setHistoricalReceivableCustomerId(selectedRental?.customerId || '')
    setHistoricalReceivableCustomerSearch('')
    setHistoricalReceivableCustomerOptions([])
    setHistoricalReceivableReference(selectedRental?.historicalReference || '')
  }, [selectedRental?.id])

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
    setReturnDepositStatus('held')
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

  const hireSubtotal = selectedItems.reduce((sum, si) => sum + si.unitHirePrice * si.quantity * si.periods, 0)
  const chargesSubtotal = additionalCharges.reduce((sum, charge) => sum + charge.quantity * charge.unitPrice, 0)
  const subtotal = hireSubtotal + chargesSubtotal + (deliveryRequired ? Math.max(0, Number(deliveryFee) || 0) : 0)
  const taxableAmount = Math.max(0, subtotal - discount)
  const taxAmount = historicalMode
    ? Math.round(taxableAmount * historicalTaxRate / 100 * 100) / 100
    : (taxConfig?.taxEnabled && taxConfig?.taxRate) ? Math.round(taxableAmount * taxConfig.taxRate / 100 * 100) / 100 : 0
  const totalAmount = Math.max(0, taxableAmount + taxAmount)
  const historicalRentalPaid = historicalPayments.filter(row => row.kind === 'rental_payment').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const historicalOpenBalance = Math.max(0, totalAmount - historicalRentalPaid)

  const handleHistoricalSubmit = async () => {
    const shouldCollectHistoricalBalance = section === 'receivables' || collectUnpaidBalance
    if (!customerId && !customerName.trim()) {
      toast({ title: 'Customer name required', description: 'Select an existing customer or enter the customer name from the old booking.', variant: 'destructive' })
      return
    }
    if (shouldCollectHistoricalBalance && !customerId) {
      toast({ title: 'Existing customer required', description: 'Link this past booking to an existing customer before adding its balance to receivables.', variant: 'destructive' })
      return
    }
    if (!hireDate || !expectedReturnDate || !actualReturnDate || actualReturnDate < hireDate) {
      toast({ title: 'Past dates required', description: 'Enter the original hire, expected return, and actual return dates. Actual return cannot be before hire.', variant: 'destructive' })
      return
    }
    if (!selectedItems.length && !additionalCharges.length) {
      toast({ title: 'Booking details required', description: 'Add at least one hire item, service, or goods line.', variant: 'destructive' })
      return
    }
    if (additionalCharges.some(line => !line.label.trim())) {
      toast({ title: 'Description required', description: 'Complete each historical service or goods line.', variant: 'destructive' })
      return
    }
    if (deliveryRequired && !deliveryAddress.trim()) {
      toast({ title: 'Delivery destination required', description: 'Enter where this rental booking should be delivered.', variant: 'destructive' })
      return
    }
    if (deliveryRequired && (!Number.isFinite(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
      toast({ title: 'Invalid delivery fee', description: 'Enter a valid non-negative delivery fee.', variant: 'destructive' })
      return
    }
    if (branches.length && !branchId) {
      toast({ title: 'Branch required', description: 'Select the branch associated with the historical booking.', variant: 'destructive' })
      return
    }
    const chargePaid = historicalRentalPaid
    const depositsReceived = historicalPayments.filter(row => row.kind === 'deposit').reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const depositsRefunded = historicalPayments.filter(row => row.kind === 'deposit_refund').reduce((sum, row) => sum + Number(row.amount || 0), 0)
    if (chargePaid > totalAmount + 0.01 || depositsReceived > depositAmount + 0.01 || depositsRefunded > depositsReceived + 0.01) {
      toast({ title: 'Payment totals do not reconcile', description: 'Rental payments cannot exceed the booking total, and deposit refunds cannot exceed deposits recorded as received.', variant: 'destructive' })
      return
    }
    if (historicalPayments.some(row => !row.paymentDate || Number(row.amount) <= 0 || (row.paymentMethod === 'mobile_money' && (!row.mobileProvider || !row.phoneNumber.trim() || !row.transactionRef.trim())) || (['card', 'bank_transfer', 'cheque'].includes(row.paymentMethod) && !row.transactionRef.trim()))) {
      toast({ title: 'Payment details incomplete', description: 'Enter a date, positive amount, method, and required transaction details for every historical payment.', variant: 'destructive' })
      return
    }
    setSavingRental(true)
    try {
      const created = await rentalsApi.createHistorical({
        historicalImportKey,
        historicalReference: historicalReference.trim() || undefined,
        collectUnpaidBalance: shouldCollectHistoricalBalance,
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: selectedItems.map(item => ({ ...item, conditionReturn: 'good' })),
        additionalCharges,
        deliveryAddress: deliveryRequired ? deliveryAddress.trim() : undefined,
        deliveryFee: deliveryRequired ? Number(deliveryFee) || 0 : 0,
        hireDate,
        expectedReturnDate,
        actualReturnDate,
        depositAmount,
        discount,
        taxRate: historicalTaxRate,
        payments: historicalPayments,
        bookingPurpose: bookingPurpose || undefined,
        notes,
        branchId: branchId || undefined,
      })
      toast({ title: 'Historical booking recorded', description: shouldCollectHistoricalBalance ? 'The remaining amount is now a collectible customer receivable. No past cash or stock movement was recreated.' : 'Dated record and historical receipt copies were saved. No current cash, stock, customer balance, or ledger amounts were changed.' })
      setShowForm(false)
      setHistoricalImportKey('')
      setSelectedRental(created)
      loadRentals()
      if (canViewReport) loadSummary()
    } catch (err: any) {
      toast({ title: 'Could not record historical booking', description: err.message || 'Review the dates and payment totals, then try again.', variant: 'destructive' })
    } finally { setSavingRental(false) }
  }

  const makeSelectedHistoricalReceivable = async () => {
    if (!selectedRental?.isHistoricalRecord || !canCreateRental || Number(selectedRental.balance) <= 0) return
    const resolvedCustomerId = historicalReceivableCustomerId || selectedRental.customerId
    if (!resolvedCustomerId) {
      toast({ title: 'Customer link required', description: 'Select an existing customer before posting this balance to receivables.', variant: 'destructive' })
      return
    }
    setSavingRental(true)
    try {
      const result = await rentalsApi.makeHistoricalReceivable(selectedRental.id, { customerId: resolvedCustomerId, historicalReference: historicalReceivableReference.trim() || selectedRental.historicalReference || undefined })
      setSelectedRental((current) => current ? { ...current, ...result.rental, isHistoricalReceivable: true, historicalReceivableAmount: Number(result.rental.historicalReceivableAmount) } : current)
      setHistoricalReceivableReference('')
      setHistoricalReceivableCustomerId('')
      setHistoricalReceivableCustomerSearch('')
      toast({ title: 'Receivable added', description: 'The remaining balance is in the customer ledger and rental receivables account. No cash, inventory, or past sales revenue was recreated.' })
      loadRentals()
    } catch (err: any) {
      toast({ title: 'Could not add receivable', description: err.message || 'Refresh the rental and try again.', variant: 'destructive' })
    } finally { setSavingRental(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingRental) return
    if (historicalMode) return handleHistoricalSubmit()
    if (section === 'receivables' && !customerId) {
      toast({ title: 'Existing customer required', description: 'Select an existing customer so any unpaid rental amount can be tracked and collected from their receivables profile.', variant: 'destructive' })
      return
    }
    if (!customerId && (!customerName.trim() || !customerPhone.trim() || !customerNin.trim())) {
      toast({ title: 'Renter details required', description: 'Enter the renter’s name, phone number, and National ID, or select an existing customer.', variant: 'destructive' })
      return
    }
    if (bookingMode === 'reserve' && !hireDate) {
      toast({ title: 'Reservation date required', description: 'Choose the date the reservation starts.', variant: 'destructive' })
      return
    }
    const rentalStart = bookingMode === 'reserve' ? hireDate : localDateInput()
    if (!expectedReturnDate || expectedReturnDate < rentalStart) {
      toast({ title: 'Return date required', description: 'Choose an expected return date on or after the rental start date.', variant: 'destructive' })
      return
    }
    if (selectedItems.length === 0 && additionalCharges.length === 0) {
      toast({ title: 'Error', description: 'Add rental equipment or a service/venue charge.', variant: 'destructive' })
      return
    }
    if (additionalCharges.some(charge => !charge.label.trim())) {
      toast({ title: 'Charge description required', description: 'Add a description for each extra service or charge.', variant: 'destructive' })
      return
    }
    if (deliveryRequired && !deliveryAddress.trim()) {
      toast({ title: 'Delivery destination required', description: 'Enter where this rental booking should be delivered.', variant: 'destructive' })
      return
    }
    if (deliveryRequired && (!Number.isFinite(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
      toast({ title: 'Invalid delivery fee', description: 'Enter a valid non-negative delivery fee.', variant: 'destructive' })
      return
    }
    if ((amountPaid > 0 || depositAmount > 0) && !cashAccountId) {
      toast({ title: 'Payment account required', description: 'Select an account for the amount paid or deposit, or set both amounts to zero.', variant: 'destructive' })
      return
    }
    if (amountPaid > 0 || depositAmount > 0) {
      const missingPaymentDetails = paymentMethod === 'mobile_money'
        ? !mobileProvider || !phoneNumber.trim() || !transactionId.trim()
        : ['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim()
      if (missingPaymentDetails) {
        toast({ title: 'Payment details required', description: 'Complete the required payment provider, phone, and transaction reference details.', variant: 'destructive' })
        return
      }
    }
    if (bookingMode === 'reserve' && hireDate < localDateInput()) {
      toast({ title: 'Invalid reservation date', description: 'Reservation dates cannot start in the past.', variant: 'destructive' })
      return
    }
    if (branches.length > 0 && !branchId) {
      toast({ title: 'Branch required', description: 'Select the branch that will fulfil this reservation or check-out.', variant: 'destructive' })
      return
    }
    if (amountPaid > totalAmount) {
      toast({ title: 'Amount exceeds rental total', description: 'Reduce the amount paid to the rental total. Record any extra customer advance separately.', variant: 'destructive' })
      return
    }
    if (section === 'receivables' && totalAmount - amountPaid <= 0.01) {
      toast({ title: 'No credit balance', description: 'Enter a partial payment or zero paid so this rental creates an amount due in Rental Receivables.', variant: 'destructive' })
      return
    }

    setSavingRental(true)
    try {
      const created = await rentalsApi.create({
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: selectedItems,
        additionalCharges,
        deliveryAddress: deliveryRequired ? deliveryAddress.trim() : undefined,
        deliveryFee: deliveryRequired ? Number(deliveryFee) || 0 : 0,
        hireDate: bookingMode === 'checkout' ? new Date().toISOString() : hireDate,
        expectedReturnDate,
        depositAmount,
        amountPaid,
        idempotencyKey: crypto.randomUUID(),
        paymentMethod,
        cashAccountId: (amountPaid > 0 || depositAmount > 0) ? cashAccountId : undefined,
        mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined,
        phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined,
        transactionId: ['mobile_money', 'card', 'bank_transfer'].includes(paymentMethod) ? transactionId : undefined,
        discount,
        guarantorName: guarantorName || undefined,
        guarantorPhone: guarantorPhone || undefined,
        customerNin: customerNin || undefined,
        bookingMode,
        bookingPurpose: bookingPurpose || undefined,
        notes,
        branchId: branchId || undefined,
      })
      toast({ title: bookingMode === 'reserve' ? 'Reserved' : 'Checked out', description: bookingMode === 'reserve' ? 'The rental dates are reserved; stock remains on hand until check-out.' : 'Rental created and items checked out.' })
      setShowForm(false)
      setSelectedRental(created)
      loadRentals()
      if (canViewReport) loadSummary()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create rental', variant: 'destructive' })
    } finally { setSavingRental(false) }
  }

  const refreshSelectedRental = async () => {
    if (!selectedRental) return
    const updated = await rentalsApi.get(selectedRental.id)
    setSelectedRental(updated)
    setRentals(current => current.map(row => row.id === updated.id ? updated : row))
    if (canViewReport) loadSummary()
  }

  const handleRecordRentalPayment = async () => {
    if (!selectedRental || !cashAccountId) return
    setSavingRentalPayment(true)
    try {
      await rentalsApi.recordPayment(selectedRental.id, { amount: paymentAmount, paymentMethod, cashAccountId, idempotencyKey: crypto.randomUUID(), transactionRef: transactionId || undefined, mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined, phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined, notes: 'Rental balance collection' })
      setPaymentAmount(0)
      await refreshSelectedRental()
      toast({ title: 'Payment recorded', description: 'Cash movement and general-ledger entry posted. Receipt is ready to print.' })
    } catch (err: any) { toast({ title: 'Payment failed', description: err.message || 'Could not record payment.', variant: 'destructive' }) }
    finally { setSavingRentalPayment(false) }
  }

  const handleIssueRentalCreditNote = async () => {
    if (!selectedRental || creditNoteAmount <= 0 || !creditNoteNotes.trim()) return
    setSavingCreditNote(true)
    try {
      const result = await rentalsApi.issueCreditNote(selectedRental.id, { amount: creditNoteAmount, reason: creditNoteReason, notes: creditNoteNotes.trim(), idempotencyKey: crypto.randomUUID() })
      setCreditNoteAmount(0)
      setCreditNoteNotes('')
      setShowCreditNoteForm(false)
      await refreshSelectedRental()
      toast({ title: 'Rental credit note issued', description: `${result.note?.noteNo || 'Credit note'} posted to the rental ledger. Any refund due remains separate until paid.` })
    } catch (err: any) { toast({ title: 'Could not issue credit note', description: err.message || 'Review the amount and try again.', variant: 'destructive' }) }
    finally { setSavingCreditNote(false) }
  }

  const handleCancelRentalCreditNote = async (note: RentalCreditNote) => {
    if (!selectedRental || !(await appConfirm(`Cancel ${note.noteNo}? Its journal entry will be reversed.`))) return
    setSavingCreditNote(true)
    try {
      await rentalsApi.cancelCreditNote(selectedRental.id, note.id)
      await refreshSelectedRental()
      toast({ title: 'Credit note cancelled', description: 'The rental balance and journal entry were reversed.' })
    } catch (err: any) { toast({ title: 'Could not cancel credit note', description: err.message || 'Refresh and try again.', variant: 'destructive' }) }
    finally { setSavingCreditNote(false) }
  }

  const handleRefundRentalCreditNote = async () => {
    if (!selectedRental || !refundCreditNote || !cashAccountId || creditRefundAmount <= 0) return
    setSavingCreditNote(true)
    try {
      await rentalsApi.refundCreditNote(selectedRental.id, refundCreditNote.id, { amount: creditRefundAmount, paymentMethod, cashAccountId, idempotencyKey: crypto.randomUUID(), transactionRef: transactionId || undefined, mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined, phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined, notes: `Refund for ${refundCreditNote.noteNo}` })
      setRefundCreditNote(null)
      setCreditRefundAmount(0)
      await refreshSelectedRental()
      toast({ title: 'Rental credit refunded', description: 'Cash movement and general-ledger entry posted.' })
    } catch (err: any) { toast({ title: 'Refund failed', description: err.message || 'Review the refund details and try again.', variant: 'destructive' }) }
    finally { setSavingCreditNote(false) }
  }

  const handleRefundRentalDeposit = async () => {
    if (!selectedRental || !cashAccountId) return
    setSavingRentalPayment(true)
    try {
      await rentalsApi.refundDeposit(selectedRental.id, { amount: depositRefundAmount, paymentMethod, cashAccountId, idempotencyKey: crypto.randomUUID(), transactionRef: transactionId || undefined, mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined, phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined, notes: 'Security deposit refund' })
      setDepositRefundAmount(0)
      await refreshSelectedRental()
      toast({ title: 'Deposit refunded', description: 'Cash account, deposit liability, and receipt have been updated.' })
    } catch (err: any) { toast({ title: 'Refund failed', description: err.message || 'Could not refund deposit.', variant: 'destructive' }) }
    finally { setSavingRentalPayment(false) }
  }

  const handleRefundRentalAdvance = async () => {
    if (!selectedRental || !cashAccountId) return
    setSavingRentalPayment(true)
    try {
      await rentalsApi.refundAdvance(selectedRental.id, { amount: advanceRefundAmount, paymentMethod, cashAccountId, idempotencyKey: crypto.randomUUID(), transactionRef: transactionId || undefined, mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined, phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined, notes: 'Reservation advance refund' })
      setAdvanceRefundAmount(0)
      await refreshSelectedRental()
      toast({ title: 'Advance refunded', description: 'Refund, cash movement, ledger posting, and receipt are recorded.' })
    } catch (err: any) { toast({ title: 'Refund failed', description: err.message || 'Could not refund the reservation advance.', variant: 'destructive' }) }
    finally { setSavingRentalPayment(false) }
  }

  const handleForfeitRentalDeposit = async () => {
    if (!selectedRental || forfeitureReason.trim().length < 5) return
    if (!(await appConfirm('Forfeit the remaining rental deposit and recognize it as income? This posts an auditable journal entry.'))) return
    setSavingRentalPayment(true)
    try {
      await rentalsApi.forfeitDeposit(selectedRental.id, forfeitureReason.trim())
      setForfeitureReason('')
      await refreshSelectedRental()
      toast({ title: 'Deposit forfeiture recorded', description: 'The liability was released to rental income and the record is retained.' })
    } catch (err: any) { toast({ title: 'Could not forfeit deposit', description: err.message || 'Review the deposit balance.', variant: 'destructive' }) }
    finally { setSavingRentalPayment(false) }
  }

  const printRentalReceipt = async (paymentId: string) => {
    if (!selectedRental) return
    try {
      const { payment } = await rentalsApi.receipt(selectedRental.id, paymentId)
      const rental = payment.rental
      const business = payment.tenant
      const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character))
      const receiptLines = [
        ...(rental.items || []).map((item: any) => ({ label: item.product?.name || 'Hire item', type: 'Hire asset', quantity: item.quantity, amount: item.totalAmount })),
        ...(rental.chargeLines || []).map((line: any) => ({ label: line.label, type: line.lineType === 'consumable' ? 'Goods' : line.category || 'Service', quantity: line.quantity, amount: line.totalAmount })),
      ]
      const itemRows = receiptLines.map((line: any) => `<tr><td>${safe(line.label)}</td><td>${safe(line.type)}</td><td>${line.quantity}</td><td>${safe(formatCurrency(line.amount))}</td></tr>`).join('')
      const popup = window.open('', '_blank')
      if (!popup) return toast({ title: 'Print blocked', description: 'Allow pop-ups to print rental receipts.', variant: 'destructive' })
      popup.opener = null
      const historicalNotice = payment.status === 'historical' ? `<p style="padding:12px;border:1px solid #c58b20;background:#fff7df"><b>HISTORICAL RECEIPT COPY</b><br>Payment date supplied from prior records: ${safe(new Date(payment.paymentDate).toLocaleString())}. Entered in JibuSales: ${safe(payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'today')}. This is a historical record copy; no funds were processed and no cash or ledger movement was created in JibuSales.</p>` : ''
      popup.document.write(`<html><head><title>Rental receipt ${safe(payment.receiptNo)}</title><style>body{font:14px Arial,sans-serif;color:#111;margin:24px}header{text-align:center;border-bottom:1px solid #bbb;padding-bottom:14px}h1{font-size:20px;margin:4px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}.amount{text-align:right;font-size:18px;font-weight:bold}</style></head><body><header><h1>${safe(business?.name || 'Business')}</h1><div>${safe(business?.address || '')}</div><div>${safe(business?.phone || '')} ${safe(business?.email || '')}</div><h2>${payment.status === 'historical' ? 'Historical rental payment record' : 'Rental payment receipt'}</h2></header>${historicalNotice}<p><b>Receipt:</b> ${safe(payment.receiptNo)}<br><b>Date:</b> ${safe(new Date(payment.paymentDate).toLocaleString())}<br><b>Renter:</b> ${safe(rental.customer?.name || rental.customerName || 'Renter')}<br><b>Rental:</b> ${safe(rental.rentalNo)}<br>${rental.deliveryAddress ? `<b>Delivery destination:</b> ${safe(rental.deliveryAddress)}<br>` : ''}<b>Payment type:</b> ${safe(payment.kind.replaceAll('_', ' '))}<br><b>Method/account:</b> ${safe(payment.paymentMethod || 'Non-cash settlement')} / ${safe(payment.cashAccount?.name || (payment.status === 'historical' ? 'Not posted to a transaction account' : 'N/A'))}<br><b>Mobile provider:</b> ${safe(payment.mobileProvider || '—')}<br><b>Payment phone:</b> ${safe(payment.phoneNumber || '—')}</p><table><thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Value</th></tr></thead><tbody>${itemRows}</tbody></table><p class="amount">${safe(formatCurrency(payment.amount))}</p><p>Rental total: ${safe(formatCurrency(rental.totalAmount))}<br>Outstanding after record: ${safe(formatCurrency(payment.balanceAfter))}<br>Reference: ${safe(payment.transactionRef || '—')}<br>Note: ${safe(payment.notes || '—')}</p><footer>Powered by JibuSales</footer><script>window.onload=()=>window.print()</script></body></html>`)
      popup.document.close()
    } catch (err: any) { toast({ title: 'Receipt unavailable', description: err.message || 'Could not load receipt.', variant: 'destructive' }) }
  }

  const printRentalCreditNote = async (note: RentalCreditNote) => {
    if (!selectedRental) return
    try {
      const profile = await settingsApi.getBusinessProfile()
      const business = profile?.businessProfile || profile?.settings || profile || {}
      const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character))
      const popup = window.open('', '_blank')
      if (!popup) return toast({ title: 'Print blocked', description: 'Allow pop-ups to print rental credit notes.', variant: 'destructive' })
      popup.opener = null
      const customer = selectedRental.customer?.name || selectedRental.customerName || 'Customer'
      const refundDue = Math.max(0, Number(note.refundDue) - Number(note.refundedAmount))
      popup.document.write(`<html><head><title>Rental credit note ${safe(note.noteNo)}</title><style>body{font:14px Arial,sans-serif;color:#111;margin:28px}header{text-align:center;border-bottom:1px solid #aaa;padding-bottom:14px}h1{font-size:20px;margin:4px}.meta{line-height:1.8;margin:20px 0}.amount{font-size:20px;font-weight:bold;text-align:right;border-top:1px solid #aaa;padding-top:14px}.box{border:1px solid #bbb;padding:14px;margin-top:18px}footer{margin-top:32px;border-top:1px solid #ddd;padding-top:10px;text-align:center;color:#444}</style></head><body><header><h1>${safe(business.businessName || business.name || 'Business')}</h1><div>${safe(business.address || '')}</div><div>${safe(business.phone || '')} ${safe(business.email || '')}</div><h2>Rental Credit Note</h2></header><div class="meta"><b>Credit note:</b> ${safe(note.noteNo)}<br><b>Date:</b> ${safe(new Date(note.createdAt).toLocaleString())}<br><b>Customer:</b> ${safe(customer)}<br><b>Original booking:</b> ${safe(selectedRental.rentalNo)}<br><b>Reason:</b> ${safe(note.reason.replaceAll('_', ' '))}<br><b>Explanation:</b> ${safe(note.notes || '—')}</div><div class="amount">Adjustment: ${safe(formatCurrency(note.amount))}</div><div class="box"><b>Accounting allocation</b><br>Tax reversed proportionally: ${safe(formatCurrency(note.taxAmount))}<br>Applied to reduce booking receivable: ${safe(formatCurrency(note.appliedAmount))}<br>Refund payable: ${safe(formatCurrency(note.refundDue))}<br>Refund still outstanding: ${safe(formatCurrency(refundDue))}</div><footer>Powered by JibuSales</footer><script>window.onload=()=>window.print()</script></body></html>`)
      popup.document.close()
    } catch (err: any) { toast({ title: 'Credit note unavailable', description: err.message || 'Could not prepare the credit note for printing.', variant: 'destructive' }) }
  }

  const handleCheckout = async (rental: Rental) => {
    setCheckingOutRental(rental)
  }

  const confirmCheckout = async () => {
    if (!checkingOutRental || savingCheckout) return
    setSavingCheckout(true)
    try {
      const updated = await rentalsApi.checkout(checkingOutRental.id, checkingOutRental.branch?.id)
      setRentals(current => current.map(row => row.id === updated.id ? updated : row))
      toast({ title: 'Checked out', description: 'Availability was confirmed and stock has been issued.' })
      setCheckingOutRental(null)
      loadRentals()
    } catch (err: any) {
      toast({ title: 'Could not check out', description: err.message || 'Availability may have changed.', variant: 'destructive' })
    } finally {
      setSavingCheckout(false)
    }
  }

  const handleGenerateContract = async () => {
    if (!selectedRental) return
    setGeneratingContract(true)
    try {
      const result = await rentalsApi.generateContract(selectedRental.id)
      setContractDraftValue(result.contractDraft || '')
      setSelectedRental(current => current ? { ...current, contractDraft: result.contractDraft, contractGeneratedAt: result.contractGeneratedAt } : current)
      toast({ title: 'Draft ready', description: 'Review and complete every bracketed legal/business term before signing.' })
    } catch (err: any) {
      toast({ title: 'Could not generate draft', description: err.message || 'Try again later.', variant: 'destructive' })
    } finally {
      setGeneratingContract(false)
    }
  }

  const handleSaveContractDraft = async () => {
    if (!selectedRental) return
    setSavingContract(true)
    try {
      const result = await rentalsApi.saveContractDraft(selectedRental.id, contractDraftValue)
      setSelectedRental(current => current ? { ...current, contractDraft: result.contractDraft } : current)
      toast({ title: 'Draft saved', description: 'The contract draft is saved for review.' })
    } catch (err: any) {
      toast({ title: 'Could not save draft', description: err.message || 'Try again.', variant: 'destructive' })
    } finally {
      setSavingContract(false)
    }
  }

  const printContractDraft = () => {
    if (!selectedRental?.contractDraft) return
    const popup = window.open('', '_blank')
    if (!popup) return toast({ title: 'Print blocked', description: 'Allow pop-ups to print the contract draft.', variant: 'destructive' })
    popup.opener = null
    const formattedDraft = markdownToHtml(selectedRental.contractDraft)
    popup.document.write(`<html><head><title>Rental Agreement ${selectedRental.rentalNo}</title><style>body{font:14px/1.55 Arial,sans-serif;color:#111;margin:24mm}strong{font-weight:700}</style></head><body>${formattedDraft}</body></html>`)
    popup.document.close()
    popup.focus()
    popup.print()
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

  const handleCancel = async () => {
    if (!cancellingRental || cancellationReason.trim().length < 3) return
    setSavingCancellation(true)
    try {
      const result = await rentalsApi.cancel(cancellingRental.id, { chargePercent: cancellationChargePercent, reason: cancellationReason.trim() })
      setCancellingRental(null)
      setCancellationReason('')
      setCancellationChargePercent(0)
      toast({
        title: 'Booking cancelled',
        description: `Fee ${formatCurrency(result.cancellation?.feeAmount || 0)} · receivable ${formatCurrency(result.cancellation?.feeReceivable || 0)} · refund due ${formatCurrency(result.cancellation?.refundDue || 0)}.`,
      })
      loadRentals()
      if (canViewReport) loadSummary()
    } catch (err: any) {
      toast({ title: 'Cancellation failed', description: err.message || 'Refresh and try again.', variant: 'destructive' })
    } finally { setSavingCancellation(false) }
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

  const visibleRentals = rentals.filter(rental => {
    const isReturnable = rental.status === 'active' && (!rental.bookingState || rental.bookingState === 'checked_out')
    const isCollectible = rental.isHistoricalReceivable || (rental.status === 'cancelled' && Number(rental.cancellationChargeAmount) > 0) || (!rental.isHistoricalRecord && ['checked_out', 'returned'].includes(String(rental.bookingState)))
    if (section === 'returns' && !isReturnable) return false
    if (section === 'receivables' && (Number(rental.balance) <= 0 || (rental.status === 'cancelled' && Number(rental.cancellationChargeBalance || 0) <= 0) || !isCollectible)) return false
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    return [rental.rentalNo, rental.customer?.name, rental.customerName, rental.customerPhone, rental.branch?.name,
      ...rental.items.map(item => item.product?.name)]
      .some(value => String(value || '').toLowerCase().includes(query))
  })
  const checkoutCandidates = rentals.filter(rental =>
    rental.status === 'active' && ['reserved', 'confirmed'].includes(String(rental.bookingState)) && !rental.isHistoricalRecord
  )
  const { paginatedItems: paginatedRentals, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(visibleRentals, 10)
  const rentalReceivableTotal = visibleRentals.reduce((sum, rental) => sum + Math.max(0, Number(rental.balance) || 0), 0)
  const historicalReceivableCount = visibleRentals.filter(rental => rental.isHistoricalReceivable).length

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
            {selectedRental.isHistoricalRecord && <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><p><strong>Historical record.</strong> Past cash and stock movements were not recreated.{selectedRental.isHistoricalReceivable ? ' The unpaid balance is collectible and posted to customer receivables against rental opening equity.' : ' The remaining amount is not yet in customer receivables or the general ledger.'}</p>{selectedRental.historicalReference && <p>Original reference: <strong>{selectedRental.historicalReference}</strong></p>}{!selectedRental.isHistoricalReceivable && canCreateRental && Number(selectedRental.balance) > 0 && <div className="space-y-2"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input value={historicalReceivableReference} onChange={event => setHistoricalReceivableReference(event.target.value)} placeholder="Receipt-book / original reference (optional)" aria-label="Original historical booking reference" /><Button type="button" onClick={makeSelectedHistoricalReceivable} disabled={savingRental || !(historicalReceivableCustomerId || selectedRental.customerId)}>{savingRental ? 'Posting…' : 'Add unpaid balance to receivables'}</Button></div>{!selectedRental.customerId && <div className="space-y-2"><Label htmlFor="historical-receivable-customer">Link existing customer</Label><Input id="historical-receivable-customer" value={historicalReceivableCustomerSearch} onChange={event => setHistoricalReceivableCustomerSearch(event.target.value)} placeholder="Search customer name or phone" autoComplete="off" />{searchingHistoricalCustomers && <p className="text-xs">Searching…</p>}{historicalReceivableCustomerOptions.map(customer => <button key={customer.id} type="button" className="flex w-full justify-between rounded border bg-background p-2 text-left" onClick={() => { setHistoricalReceivableCustomerId(customer.id); setHistoricalReceivableCustomerSearch(customer.name || ''); setHistoricalReceivableCustomerOptions([]) }}><span>{customer.name}</span><span className="text-muted-foreground">{customer.phone || customer.maskedPhone || ''}</span></button>)}</div>}</div>}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Customer:</span> {selectedRental.customer?.name || selectedRental.customerName || 'Walk-in'}</div>
              <div><span className="font-medium">Phone:</span> {selectedRental.customer?.phone || selectedRental.customerPhone || '-'}</div>
              <div><span className="font-medium">Hire Date:</span> {new Date(selectedRental.hireDate).toLocaleDateString()}</div>
              <div><span className="font-medium">Expected Return:</span> {new Date(selectedRental.expectedReturnDate).toLocaleDateString()}</div>
              {selectedRental.actualReturnDate && (
                <div><span className="font-medium">Actual Return:</span> {new Date(selectedRental.actualReturnDate).toLocaleDateString()}</div>
              )}
              <div><span className="font-medium">Status:</span> <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusBadge(selectedRental.status))}>{selectedRental.status}</span></div>
              <div><span className="font-medium">Booking:</span> <span className="capitalize">{selectedRental.bookingState?.replace('_', ' ') || 'checked out'}</span></div>
              {selectedRental.bookingPurpose && <div><span className="font-medium">Purpose:</span> {selectedRental.bookingPurpose}</div>}
              <div><span className="font-medium">Total:</span> {formatCurrency(selectedRental.totalAmount)}</div>
              <div><span className="font-medium">Deposit:</span> {formatCurrency(selectedRental.depositAmount)} ({selectedRental.depositStatus})</div>
              <div><span className="font-medium">Paid:</span> {formatCurrency(selectedRental.amountPaid)}</div>
              <div><span className="font-medium">Balance:</span> {formatCurrency(selectedRental.balance)}</div>
              {selectedRental.status === 'cancelled' && Number(selectedRental.cancellationChargeAmount) > 0 && <>
                <div><span className="font-medium">Cancellation fee:</span> {formatCurrency(selectedRental.cancellationChargeAmount)} ({Number(selectedRental.cancellationChargePercent || 0)}%)</div>
                <div><span className="font-medium">Fee tax:</span> {formatCurrency(selectedRental.cancellationTaxAmount || 0)}</div>
                <div><span className="font-medium">Refund outstanding:</span> {formatCurrency(Math.max(0, Number(selectedRental.cancellationRefundDue || 0) - Number(selectedRental.cancellationRefundedAmount || 0)))}</div>
                {selectedRental.cancellationReason && <div className="sm:col-span-2"><span className="font-medium">Cancellation reason:</span> {selectedRental.cancellationReason}</div>}
              </>}
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
            {(canViewRentalCreditNotes || canCreateRentalCreditNote) && <section className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Rental credit notes</h3><p className="text-sm text-muted-foreground">Adjust this booking’s charge; any amount owed back is tracked separately from cash refunds.</p></div>{canCreateRentalCreditNote && Number(selectedRental.totalAmount) > 0 && <Button type="button" variant="outline" onClick={() => setShowCreditNoteForm(value => !value)}><Plus className="mr-2 h-4 w-4" />Issue credit note</Button>}</div>
              {showCreditNoteForm && canCreateRentalCreditNote && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="rental-credit-amount">Adjustment amount</Label><Input id="rental-credit-amount" type="number" min="0.01" max={selectedRental.totalAmount} step="0.01" value={creditNoteAmount || ''} onChange={event => setCreditNoteAmount(Number(event.target.value) || 0)} /></div>
                <div className="space-y-1"><Label htmlFor="rental-credit-reason">Reason</Label><select id="rental-credit-reason" value={creditNoteReason} onChange={event => setCreditNoteReason(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="price_adjustment">Price adjustment</option><option value="service_not_provided">Service not provided</option><option value="overcharge">Overcharge</option><option value="cancellation">Cancellation / charge reduction</option><option value="other">Other</option></select></div>
                <div className="space-y-1 sm:col-span-2"><Label htmlFor="rental-credit-notes">Explanation</Label><Textarea id="rental-credit-notes" value={creditNoteNotes} onChange={event => setCreditNoteNotes(event.target.value)} maxLength={2000} placeholder="Explain the booking adjustment for the audit trail" /><p className="text-xs text-muted-foreground">The saved booking tax is reversed proportionally to the adjustment amount.</p></div>
                <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setShowCreditNoteForm(false)}>Cancel</Button><Button type="button" onClick={handleIssueRentalCreditNote} disabled={savingCreditNote || creditNoteAmount <= 0 || creditNoteAmount > Number(selectedRental.totalAmount) || !creditNoteNotes.trim()}>{savingCreditNote ? 'Posting…' : 'Post credit note'}</Button></div>
              </div>}
              {canViewRentalCreditNotes && selectedRental.creditNotes?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left"><th className="py-2">Credit note</th><th>Date / reason</th><th className="text-right">Adjustment</th><th className="text-right">Refund due</th><th>Status</th><th></th></tr></thead><tbody>{selectedRental.creditNotes.map(note => { const refundDue = Math.max(0, Number(note.refundDue) - Number(note.refundedAmount)); return <tr key={note.id} className="border-b last:border-0"><td className="py-2 font-medium">{note.noteNo}<div className="max-w-64 truncate text-xs font-normal text-muted-foreground" title={note.notes || ''}>{note.notes || '—'}</div></td><td><span>{new Date(note.createdAt).toLocaleDateString()}</span><div className="capitalize text-xs text-muted-foreground">{note.reason.replaceAll('_', ' ')}</div></td><td className="text-right tabular-nums">{formatCurrency(note.amount)}</td><td className="text-right tabular-nums">{formatCurrency(refundDue)}</td><td className="capitalize">{refundDue <= 0 ? 'Applied' : Number(note.refundedAmount) > 0 ? 'Partially refunded' : 'Refund due'}</td><td className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => void printRentalCreditNote(note)}><Printer className="mr-1 h-4 w-4" />Print</Button>{canRefundRentalCreditNote && refundDue > 0 && <Button size="sm" variant="outline" onClick={() => { setRefundCreditNote(note); setCreditRefundAmount(refundDue) }}>Refund</Button>}{canEditRentalCreditNote && Number(note.refundedAmount) <= 0 && <Button size="sm" variant="ghost" disabled={savingCreditNote} onClick={() => void handleCancelRentalCreditNote(note)}>Cancel note</Button>}</div></td></tr> })}</tbody></table></div> : canViewRentalCreditNotes ? <p className="text-sm text-muted-foreground">No rental credit notes for this booking.</p> : <p className="text-sm text-muted-foreground">Issue a booking-linked adjustment when needed.</p>}
              {refundCreditNote && <div className="grid gap-3 rounded-md border border-primary/30 bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3"><div className="sm:col-span-2 lg:col-span-3"><p className="font-medium">Refund {refundCreditNote.noteNo}</p><p className="text-xs text-muted-foreground">Outstanding refund: {formatCurrency(Math.max(0, Number(refundCreditNote.refundDue) - Number(refundCreditNote.refundedAmount)))}</p></div><div className="space-y-1"><Label htmlFor="rental-credit-refund-amount">Refund amount</Label><Input id="rental-credit-refund-amount" type="number" min="0.01" max={Math.max(0, Number(refundCreditNote.refundDue) - Number(refundCreditNote.refundedAmount))} step="0.01" value={creditRefundAmount || ''} onChange={event => setCreditRefundAmount(Number(event.target.value) || 0)} /></div><div className="space-y-1"><Label htmlFor="rental-credit-refund-method">Method</Label><select id="rental-credit-refund-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select></div><div className="space-y-1"><Label htmlFor="rental-credit-refund-account">Refund account</Label><select id="rental-credit-refund-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select permitted account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></div>{paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label htmlFor="rental-credit-refund-provider">Provider</Label><Input id="rental-credit-refund-provider" value={mobileProvider} onChange={event => setMobileProvider(event.target.value)} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label htmlFor="rental-credit-refund-phone">Phone</Label><Input id="rental-credit-refund-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} type="tel" /></div></>}{!['cash', 'safe'].includes(paymentMethod) && <div className="space-y-1"><Label htmlFor="rental-credit-refund-reference">Transaction reference</Label><Input id="rental-credit-refund-reference" value={transactionId} onChange={event => setTransactionId(event.target.value)} /></div>}<div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3"><Button type="button" variant="outline" onClick={() => setRefundCreditNote(null)}>Close</Button><Button type="button" onClick={handleRefundRentalCreditNote} disabled={savingCreditNote || !cashAccountId || creditRefundAmount <= 0 || creditRefundAmount > Number(refundCreditNote.refundDue) - Number(refundCreditNote.refundedAmount) || (paymentMethod === 'mobile_money' && (!mobileProvider.trim() || !phoneNumber.trim() || !transactionId.trim())) || (['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim())}>{savingCreditNote ? 'Posting…' : 'Record refund'}</Button></div></div>}
            </section>}
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Payments and receipts</h3><p className="text-sm text-muted-foreground">{selectedRental.isHistoricalRecord ? 'Past payment records are saved as historical receipt copies only.' : 'Collections and deposit movements are linked to transaction accounts and the general ledger.'}</p></div></div>
              {selectedRental.payments?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Receipt</th><th>Date</th><th>Type</th><th>Account / Status</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>{selectedRental.payments.map(payment => <tr key={payment.id} className="border-b last:border-0"><td className="py-2 font-medium">{payment.receiptNo}</td><td>{new Date(payment.paymentDate).toLocaleDateString()}</td><td className="capitalize">{payment.kind.replaceAll('_', ' ')}</td><td>{payment.status === 'historical' ? 'Historical · no posting' : payment.cashAccount?.name || 'Non-cash settlement'}</td><td className="text-right">{formatCurrency(payment.amount)}</td><td className="text-right"><Button size="sm" variant="outline" onClick={() => printRentalReceipt(payment.id)}><Printer className="mr-2 h-4 w-4" />{payment.status === 'historical' ? 'Print copy' : 'Receipt'}</Button></td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No payment records yet.</p>}
              {canRecordRentalPayment && Number(selectedRental.balance) > 0 && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label htmlFor="rental-payment-amount">Receive rent payment</Label><Input id="rental-payment-amount" type="number" min="0.01" max={selectedRental.balance} step="any" value={paymentAmount || ''} onChange={event => setPaymentAmount(Number(event.target.value) || 0)} /></div>
                <div className="space-y-1"><Label htmlFor="rental-payment-method">Payment method</Label><select id="rental-payment-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select></div>
                <div className="space-y-1"><Label htmlFor="rental-payment-account">Receiving account</Label><select id="rental-payment-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select permitted account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></div>
                {paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label htmlFor="rental-payment-provider">Provider</Label><Input id="rental-payment-provider" value={mobileProvider} onChange={event => setMobileProvider(event.target.value)} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label htmlFor="rental-payment-phone">Phone</Label><Input id="rental-payment-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} type="tel" /></div></>}
                {!['cash', 'safe'].includes(paymentMethod) && <div className="space-y-1"><Label htmlFor="rental-payment-reference">Transaction reference</Label><Input id="rental-payment-reference" value={transactionId} onChange={event => setTransactionId(event.target.value)} /></div>}
                <div className="flex items-end"><Button className="w-full" onClick={handleRecordRentalPayment} disabled={savingRentalPayment || paymentAmount <= 0 || paymentAmount > Number(selectedRental.balance) || !cashAccountId || (paymentMethod === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) || (['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim())}>{savingRentalPayment ? 'Posting…' : 'Record payment'}</Button></div>
              </div>}
              {canRefundRentalAdvance && selectedRental.bookingState !== 'checked_out' && ((selectedRental.status === 'active' && Number(selectedRental.amountPaid) > 0) || (selectedRental.status === 'cancelled' && Number(selectedRental.cancellationRefundDue || 0) > Number(selectedRental.cancellationRefundedAmount || 0))) && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label htmlFor="rental-advance-refund">{selectedRental.status === 'cancelled' ? 'Refund cancellation balance' : 'Refund reservation advance'}</Label><Input id="rental-advance-refund" type="number" min="0.01" max={selectedRental.status === 'cancelled' ? Math.max(0, Number(selectedRental.cancellationRefundDue || 0) - Number(selectedRental.cancellationRefundedAmount || 0)) : selectedRental.amountPaid} step="any" value={advanceRefundAmount || ''} onChange={event => setAdvanceRefundAmount(Number(event.target.value) || 0)} /></div>
                <div className="space-y-1"><Label htmlFor="rental-advance-refund-method">Refund method</Label><select id="rental-advance-refund-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select></div>
                <div className="space-y-1"><Label htmlFor="rental-advance-refund-account">Refund account</Label><select id="rental-advance-refund-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select permitted account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></div>
                {paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label htmlFor="rental-advance-provider">Provider</Label><Input id="rental-advance-provider" value={mobileProvider} onChange={event => setMobileProvider(event.target.value)} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label htmlFor="rental-advance-phone">Phone</Label><Input id="rental-advance-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} type="tel" /></div></>}
                {!['cash', 'safe'].includes(paymentMethod) && <div className="space-y-1"><Label htmlFor="rental-advance-reference">Transaction reference</Label><Input id="rental-advance-reference" value={transactionId} onChange={event => setTransactionId(event.target.value)} /></div>}
                <div className="flex items-end"><Button variant="outline" className="w-full" onClick={handleRefundRentalAdvance} disabled={savingRentalPayment || advanceRefundAmount <= 0 || advanceRefundAmount > (selectedRental.status === 'cancelled' ? Math.max(0, Number(selectedRental.cancellationRefundDue || 0) - Number(selectedRental.cancellationRefundedAmount || 0)) : Number(selectedRental.amountPaid)) || !cashAccountId || (paymentMethod === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) || (['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim())}>{savingRentalPayment ? 'Posting…' : selectedRental.status === 'cancelled' ? 'Record refund' : 'Refund advance'}</Button></div>
              </div>}
              {canRefundRentalDeposit && (selectedRental.status === 'returned' || selectedRental.status === 'cancelled' || (selectedRental.status === 'active' && selectedRental.bookingState !== 'checked_out')) && heldDepositAmount(selectedRental) > 0 && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label htmlFor="rental-deposit-refund">Refund held deposit</Label><Input id="rental-deposit-refund" type="number" min="0.01" max={heldDepositAmount(selectedRental)} step="any" value={depositRefundAmount || ''} onChange={event => setDepositRefundAmount(Number(event.target.value) || 0)} /></div>
                <div className="space-y-1"><Label htmlFor="rental-refund-method">Refund from method</Label><select id="rental-refund-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select></div>
                <div className="space-y-1"><Label htmlFor="rental-refund-account">Refund account</Label><select id="rental-refund-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select permitted account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></div>
                {paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label htmlFor="rental-refund-provider">Provider</Label><Input id="rental-refund-provider" value={mobileProvider} onChange={event => setMobileProvider(event.target.value)} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label htmlFor="rental-refund-phone">Phone</Label><Input id="rental-refund-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} type="tel" /></div></>}
                {!['cash', 'safe'].includes(paymentMethod) && <div className="space-y-1"><Label htmlFor="rental-refund-reference">Transaction reference</Label><Input id="rental-refund-reference" value={transactionId} onChange={event => setTransactionId(event.target.value)} /></div>}
                <div className="flex items-end"><Button variant="outline" className="w-full" onClick={handleRefundRentalDeposit} disabled={savingRentalPayment || depositRefundAmount <= 0 || !cashAccountId || (paymentMethod === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) || (['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim())}>{savingRentalPayment ? 'Posting…' : 'Record refund'}</Button></div>
              </div>}
              {canForfeitRentalDeposit && selectedRental.status === 'returned' && heldDepositAmount(selectedRental) > 0 && <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input aria-label="Deposit forfeiture reason" placeholder="Reason for forfeiting deposit" value={forfeitureReason} onChange={event => setForfeitureReason(event.target.value)} maxLength={500} />
                <Button variant="destructive" onClick={handleForfeitRentalDeposit} disabled={savingRentalPayment || forfeitureReason.trim().length < 5}>Forfeit remaining deposit</Button>
              </div>}
            </section>
            <section className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Rental agreement</h3>
                  <p className="text-sm text-muted-foreground">AI-assisted draft, saved with this rental. Review and complete terms before signing.</p>
                </div>
                <div className="flex gap-2">
                  {canGenerateContract && <Button variant="outline" onClick={handleGenerateContract} disabled={generatingContract}>
                    <Sparkles className="mr-2 h-4 w-4" />{generatingContract ? 'Drafting…' : selectedRental.contractDraft ? 'Regenerate draft' : 'Draft contract'}
                  </Button>}
                  {selectedRental.contractDraft && <Button variant="outline" onClick={printContractDraft}><Printer className="mr-2 h-4 w-4" />Print</Button>}
                </div>
              </div>
              {selectedRental.contractDraft && <>
                {hasPermission('canEditRental')
                  ? <RichTextArea id="rental-contract-draft" placeholder="Review and edit the rental agreement…" value={contractDraftValue || selectedRental.contractDraft} onChange={setContractDraftValue} maxLength={20000} className="min-h-[420px]" />
                  : <RichTextDisplay value={selectedRental.contractDraft} className="min-h-[420px] rounded-md border border-input bg-background p-4 text-sm leading-6" />}
                {hasPermission('canEditRental') && <div className="flex justify-end"><Button variant="outline" onClick={handleSaveContractDraft} disabled={savingContract || contractDraftValue === selectedRental.contractDraft}>{savingContract ? 'Saving…' : 'Save edits'}</Button></div>}
              </>}
            </section>
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
            {!!selectedRental.chargeLines?.length && <div>
              <h4 className="mb-2 font-medium">Services and other charges</h4>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="pb-2">Description</th><th className="pb-2">Type</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Rate</th><th className="pb-2 text-right">Total</th></tr></thead><tbody>{selectedRental.chargeLines.map(line => <tr key={line.id} className="border-b last:border-0"><td className="py-2">{line.label}</td><td className="py-2 capitalize">{line.category}</td><td className="py-2 text-right">{line.quantity}</td><td className="py-2 text-right">{formatCurrency(line.unitPrice)}</td><td className="py-2 text-right">{formatCurrency(line.totalAmount)}</td></tr>)}</tbody></table></div>
            </div>}
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
          <h1 className="text-3xl font-bold tracking-tight">{section === 'returns' ? 'Rental Returns' : section === 'receivables' ? 'Rental Receivables' : 'Bookings & Check-out'}</h1>
          <p className="text-muted-foreground">{section === 'returns' ? 'Review checked-out assets due back and complete their return.' : section === 'receivables' ? 'Track unpaid new bookings and past rental balances, then collect through the linked customer account.' : 'Reserve hire assets, check them out, and follow each booking.'}</p>
        </div>
        {(section === 'bookings' || section === 'receivables') && canCreateRental && <div className="flex flex-wrap gap-2">
          {(section === 'bookings' || canSelectExistingCustomer) && <Button variant="outline" onClick={openHistoricalForm}><Clock className="mr-2 h-4 w-4" />{section === 'receivables' ? 'Record Past Rental' : 'Record Past Booking'}</Button>}
          {(section !== 'receivables' || canSelectExistingCustomer) && <Button onClick={openNewForm}><Plus className="mr-2 h-4 w-4" />{section === 'receivables' ? 'New Credit Rental' : 'New Hire'}</Button>}
        </div>}
      </div>
      {section === 'bookings' && canCreateRental && <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Use <span className="font-medium text-foreground">Record Past Booking</span> for completed hires from before JibuSales. Enter the original dates and any documented payments; this preserves history without recreating past cash or stock movements.</p>}
      {section === 'receivables' && !canSelectExistingCustomer && <p className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">Customer access is required to create collectible rental balances. Ask an administrator to grant customer viewing permission.</p>}
      {section === 'receivables' && canSelectExistingCustomer && <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">New credit rentals are checked out and posted to the selected customer. Past balances can be brought forward with their original reference. To collect, open the customer and use <span className="font-medium text-foreground">Record Payment</span>; receipts and allocations stay in the customer ledger.</p>}
      {section === 'receivables' && <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Open rental receivables</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(rentalReceivableTotal)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Bookings with balances</p><p className="mt-1 text-xl font-semibold tabular-nums">{visibleRentals.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Past balances</p><p className="mt-1 text-xl font-semibold tabular-nums">{historicalReceivableCount}</p></CardContent></Card>
      </div>}
      {section === 'bookings' && customerFilter && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span>Showing bookings for the selected renter.</span>
        <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>Clear renter filter</Button>
      </div>}

      {/* Summary Cards */}
      {section === 'bookings' && summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{summary.activeRentals}</div>
              <p className="text-xs text-muted-foreground">Active Rentals</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{summary.reservedRentals || 0}</div>
              <p className="text-xs text-muted-foreground">Reservations</p>
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
        {section === 'bookings' && <div className="flex flex-wrap gap-1">
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
        </div>}
      </div>

      {/* Rentals Table */}
      <Card>
        <CardHeader>
          <CardTitle>{section === 'returns' ? `Items currently out (${visibleRentals.length})` : section === 'receivables' ? `Unpaid rental bookings (${visibleRentals.length})` : `Bookings (${visibleRentals.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : visibleRentals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">{section === 'returns' ? 'No checked-out rentals are awaiting return.' : section === 'receivables' ? 'No open rental balances match this search.' : 'No bookings match this search.'}</p>
              {section === 'bookings' && canCreateRental && (
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
                    <th className="pb-3 font-medium">{section === 'receivables' ? 'Booking / Receipt Reference' : 'Rental No'}</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">{section === 'receivables' ? 'Rental Details' : 'Items'}</th>
                    <th className="pb-3 font-medium">{section === 'receivables' ? 'Booking Date' : 'Hire Date'}</th>
                    {section !== 'receivables' && <th className="pb-3 font-medium">Expected Return</th>}
                    <th className="pb-3 font-medium text-right">{section === 'receivables' ? 'Charge' : 'Total'}</th>
                    {section === 'receivables' ? <><th className="pb-3 font-medium text-right">Paid</th><th className="pb-3 font-medium text-right">Outstanding</th></> : <th className="pb-3 font-medium text-right">Deposit</th>}
                    {section !== 'receivables' && <th className="pb-3 font-medium">Status</th>}
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRentals.map((rental) => (
                    <tr key={rental.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-medium cursor-pointer" onClick={() => setSelectedRental(rental)}>
                        <span>{section === 'receivables' ? rental.historicalReference || rental.rentalNo : rental.rentalNo}</span>{rental.isHistoricalRecord && <span className="ml-2 inline-flex rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] font-medium text-amber-700">History</span>}
                      </td>
                      <td className="py-3">{hasPermission('canViewCustomer') ? rental.customer?.id ? <Link className="text-primary hover:underline" to={`/tenant/receivables/customers/${encodeURIComponent(rental.customer.id)}`}>{rental.customer.name}</Link> : rental.customer?.name || 'Walk-in' : 'Restricted'}</td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {section === 'receivables' ? [...(rental.items || []).map(item => item.product?.name || 'Rental item'), ...(rental.chargeLines || []).map(line => line.label)].slice(0, 2).join(', ') || 'Rental charge' : `${rental.items.length} item(s)`}
                      </td>
                      <td className="py-3 text-sm">{new Date(rental.hireDate).toLocaleDateString()}</td>
                      {section !== 'receivables' && <td className="py-3 text-sm">
                        {new Date(rental.expectedReturnDate).toLocaleDateString()}
                        {isOverdue(rental) && (
                          <span className="ml-1 inline-flex items-center text-xs text-red-600">
                            <AlertTriangle className="h-3 w-3" /> Overdue
                          </span>
                        )}
                      </td>}
                      <td className="py-3 text-right">{formatCurrency(section === 'receivables' && rental.status === 'cancelled' ? rental.cancellationChargeAmount : section === 'receivables' && rental.isHistoricalReceivable ? rental.historicalReceivableAmount : rental.totalAmount)}</td>
                      {section === 'receivables' ? <><td className="py-3 text-right">{formatCurrency(Math.max(0, Number(rental.status === 'cancelled' ? rental.cancellationChargeAmount : rental.isHistoricalReceivable ? rental.historicalReceivableAmount : rental.totalAmount) - Number(rental.balance)))}</td><td className="py-3 text-right font-semibold text-red-700">{formatCurrency(rental.balance)}</td></> : <td className="py-3 text-right">{formatCurrency(rental.depositAmount)}</td>}
                      {section !== 'receivables' && <td className="py-3">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusBadge(rental.status))}>
                          {rental.bookingState && rental.bookingState !== 'checked_out' ? rental.bookingState.replace('_', ' ') : rental.status}
                        </span>
                      </td>}
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {section === 'receivables' && rental.customerId && hasPermission('canViewCustomer') && <Link to={`/tenant/receivables/customers/${encodeURIComponent(rental.customerId)}`} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted">Open customer</Link>}
                          {section !== 'receivables' && rental.status === 'active' && ['reserved', 'confirmed'].includes(String(rental.bookingState)) && !rental.isHistoricalRecord && hasPermission('canEditRental') && (
                            <Button variant="outline" size="sm" onClick={() => handleCheckout(rental)}>
                              <CalendarCheck className="mr-1 h-3.5 w-3.5" />Check out
                            </Button>
                          )}
                          {section !== 'receivables' && canProcessReturn && rental.status === 'active' && (!rental.bookingState || rental.bookingState === 'checked_out') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReturnForm(rental)}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Return
                            </Button>
                          )}
                          {section !== 'receivables' && canCancelRental && rental.status === 'active' && rental.bookingState !== 'checked_out' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setCancellingRental(rental); setCancellationChargePercent(0); setCancellationReason('') }}
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
      <Dialog open={showForm} onOpenChange={open => { if (!open) setShowForm(false) }}>
        {showForm && <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>{historicalMode ? (section === 'receivables' ? 'Record Past Rental Receivable' : 'Record past booking') : section === 'receivables' ? 'New Credit Rental' : 'New rental booking'}</DialogTitle><DialogDescription>{historicalMode ? section === 'receivables' ? 'Record the original rental details and payments. Its remaining amount will be added to the selected customer’s receivables without recreating past cash or stock movements.' : 'Enter the original dates, booking details, and any documented payments. This creates a historical record only; it does not change current cash, stock, customer balances, or the general ledger.' : section === 'receivables' ? 'Record a rental checked out today. Any unpaid amount is posted to the selected customer’s receivables and can be collected from their customer profile.' : 'Choose a renter, add items, then reserve a future date or check them out immediately. Availability is checked before saving.'}</DialogDescription></DialogHeader>
        <Card className="border-0 p-0 shadow-none">
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {historicalMode && <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">{section === 'receivables' ? 'The documented unpaid amount will become collectible on the selected customer account. Past cash, inventory movements, and revenue will not be recreated.' : 'Past cash and stock are never recreated. You can optionally add the unpaid balance to the selected customer’s receivables, offset against rental opening equity without recognizing past revenue again.'}</div>}
              {!historicalMode && section !== 'receivables' && <div className="space-y-2">
                <Label>Booking action</Label>
                <div className="inline-flex rounded-md border p-1">
                  <button type="button" onClick={() => setBookingMode('reserve')} className={cn('rounded px-3 py-2 text-sm', bookingMode === 'reserve' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Reserve dates</button>
                  <button type="button" onClick={() => { setBookingMode('checkout'); setHireDate(localDateInput()) }} className={cn('rounded px-3 py-2 text-sm', bookingMode === 'checkout' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Check out now</button>
                </div>
              </div>}
              {/* Customer info */}
              {canSelectExistingCustomer && !manualRenter ? <div className="space-y-2">
                <Label htmlFor="rental-customer-search">{section === 'receivables' ? 'Customer *' : 'Renter *'}</Label>
                {customerId ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                  <div><p className="font-medium">{customerName}</p>{customerPhone && <p className="text-sm text-muted-foreground">{customerPhone}</p>}<p className="text-xs text-muted-foreground">Existing customer linked to this rental</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setCustomerId(''); setCustomerName(''); setCustomerPhone(''); setCustomerSearch('') }}>Change renter</Button>
                </div> : <>
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="rental-customer-search" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} placeholder={canSearchCustomerPhone ? 'Search customer name or phone' : 'Search customer name'} className="pl-9" autoComplete="off" /></div>
                  {searchingCustomers && <p className="text-xs text-muted-foreground">Searching customers…</p>}
                  {customerOptions.length > 0 && <div className="max-h-52 overflow-y-auto rounded-md border">
                    {customerOptions.map(customer => <button key={customer.id} type="button" onClick={() => { setCustomerId(customer.id); setCustomerName(customer.name || ''); setCustomerPhone(customer.phone || ''); setCustomerNin(''); setCustomerOptions([]) }} className="flex w-full items-center justify-between gap-3 border-b p-3 text-left last:border-0 hover:bg-muted/50"><span className="font-medium">{customer.name}</span><span className="text-sm text-muted-foreground">{customer.phone || customer.maskedPhone || ''}</span></button>)}
                  </div>}
                  {customerSearch.trim() && !searchingCustomers && customerOptions.length === 0 && <p className="text-sm text-muted-foreground">No matching customer found.</p>}
                  {section !== 'receivables' && <Button type="button" variant="link" className="h-auto px-0" onClick={() => { setManualRenter(true); setCustomerId(''); setCustomerName(customerSearch.trim()); setCustomerSearch(''); setCustomerOptions([]) }}>Enter a new renter instead</Button>}
                </>}
              </div> : <div className="space-y-2">
                {canSelectExistingCustomer && <div className="flex items-center justify-between gap-2"><Label>New renter details</Label><Button type="button" variant="link" className="h-auto px-0" onClick={() => { setManualRenter(false); setCustomerName(''); setCustomerPhone(''); setCustomerNin('') }}>Choose existing customer</Button></div>}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="customerName">Customer Name *</Label><Input id="customerName" value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Full name" required={!customerId} /></div>
                  <div className="space-y-2"><Label htmlFor="customerPhone">Phone {historicalMode ? '(optional)' : '*'}</Label><Input id="customerPhone" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="Phone number" required={!customerId && !historicalMode} /></div>
                  {!historicalMode && <div className="space-y-2"><Label htmlFor="customerNin">National ID No. (NIN) *</Label><Input id="customerNin" value={customerNin} onChange={event => setCustomerNin(event.target.value)} placeholder="e.g. CF9802001234567" maxLength={20} required={!customerId} /></div>}
                </div>
              </div>}

              <div className="grid gap-4 sm:grid-cols-3">
                {historicalMode ? <>
                  <div className="space-y-2"><Label htmlFor="hireDate">Original Hire Date *</Label><Input id="hireDate" type="date" value={hireDate} max={localDateInput()} onChange={event => setHireDate(event.target.value)} required /></div>
                  <div className="space-y-2"><Label htmlFor="expectedReturnDate">Expected Return Date *</Label><Input id="expectedReturnDate" type="date" value={expectedReturnDate} onChange={event => setExpectedReturnDate(event.target.value)} required /></div>
                  <div className="space-y-2"><Label htmlFor="actualReturnDate">Actual Return Date *</Label><Input id="actualReturnDate" type="date" value={actualReturnDate} max={localDateInput()} onChange={event => setActualReturnDate(event.target.value)} required /></div>
                </> : <>
                {bookingMode === 'reserve' ? <div className="space-y-2"><Label htmlFor="hireDate">Reservation Start Date *</Label><Input id="hireDate" type="date" value={hireDate} min={localDateInput()} onChange={event => setHireDate(event.target.value)} required /></div> : <div className="space-y-2"><Label>Check-out time</Label><div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm">Now · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</div><p className="text-xs text-muted-foreground">The system records the actual checkout time automatically.</p></div>}
                <div className="space-y-2"><Label htmlFor="expectedReturnDate">Expected Return Date *</Label><Input id="expectedReturnDate" type="date" value={expectedReturnDate} min={bookingMode === 'checkout' ? localDateInput() : hireDate || localDateInput()} onChange={event => setExpectedReturnDate(event.target.value)} required /></div>
                </>}
              </div>

              {historicalMode && <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-2"><Label htmlFor="historicalReference">Original booking / receipt-book reference</Label><Input id="historicalReference" value={historicalReference} onChange={event => setHistoricalReference(event.target.value)} maxLength={120} placeholder="e.g. Receipt book 00418; leave blank to use generated rental reference" /><p className="text-xs text-muted-foreground">This reference appears in the customer ledger and accounting narration. It can be a receipt-book number if there was no JibuSales reference.</p></div>
                {section === 'receivables' ? <div className="rounded-md border bg-muted/30 p-3 text-sm"><p className="font-medium">Customer receivable</p><p className="mt-1 text-muted-foreground">{customerId ? `The remaining ${formatCurrency(historicalOpenBalance)} will be added to this customer’s receivable balance.` : 'Select an existing customer above. The balance cannot be recorded without a customer link.'}</p></div> : <label className={cn('flex items-start gap-3 rounded-md border p-3', !customerId || historicalOpenBalance <= 0 ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}><input type="checkbox" className="mt-1 h-4 w-4" checked={collectUnpaidBalance} disabled={!customerId || historicalOpenBalance <= 0} onChange={event => setCollectUnpaidBalance(event.target.checked)} /><span><span className="font-medium">Add unpaid balance to customer receivables</span><span className="mt-1 block text-xs text-muted-foreground">{customerId ? `Remaining balance ${formatCurrency(historicalOpenBalance)} will appear on the customer ledger, dated to this booking. The opening receivable is posted against rental opening equity on today’s accounting date.` : 'Select an existing customer above to make the balance collectible.'}</span></span></label>}
              </div>}

              <div className="space-y-2">
                <Label htmlFor="bookingPurpose">Purpose or event</Label>
                <Input id="bookingPurpose" value={bookingPurpose} maxLength={500} onChange={event => setBookingPurpose(event.target.value)} placeholder="Optional: wedding, conference, production, site work…" />
              </div>

              <section className="space-y-3 rounded-md border p-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                  <input type="checkbox" className="h-4 w-4" checked={deliveryRequired} onChange={event => setDeliveryRequired(event.target.checked)} />
                  Deliver this booking
                </label>
                {deliveryRequired && <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="rentalDeliveryAddress">Delivery destination *</Label><Input id="rentalDeliveryAddress" value={deliveryAddress} maxLength={500} onChange={event => setDeliveryAddress(event.target.value)} placeholder="Address, venue, or delivery instructions" required /></div>
                  <div className="space-y-2"><Label htmlFor="rentalDeliveryFee">Delivery charge</Label><Input id="rentalDeliveryFee" type="number" min="0" step="any" value={deliveryFee} onChange={event => setDeliveryFee(Number(event.target.value) || 0)} /></div>
                </div>}
              </section>

              {/* Branch */}
              {branches.length > 0 && (
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
                              {historicalMode ? `${item.quantity} recorded on-hand now` : `${availabilityByProduct[item.id] ?? item.quantity} available for dates`}
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

              <section className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div><Label>Services, event charges, and goods</Label><p className="text-xs text-muted-foreground">Add services or fees, plus stocked food and supplies. Stock is issued only at check-out.</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAdditionalCharges(rows => [...rows, { lineType: 'service', category: 'service', quantity: 1, unitPrice: 0, unitCost: 0, label: '' }])}><Plus className="mr-1 h-4 w-4" />Add line</Button>
                </div>
                {additionalCharges.map((charge, index) => {
                  const selectedCatalogItem = chargeCatalog.find(item => item.id === charge.productId)
                  const catalogOptions = chargeCatalog.filter(item => item.itemType === (charge.lineType === 'consumable' ? 'product' : 'service'))
                  const categoryOptions = [
                    ...RENTAL_LINE_CATEGORIES,
                    ...rentalCategories.map(category => ({ name: category.name, value: category.name })),
                  ].filter((category, optionIndex, options) => options.findIndex(option => option.value.toLowerCase() === category.value.toLowerCase()) === optionIndex)
                  const categoryQuery = categorySearch.trim().toLowerCase()
                  const filteredCategoryOptions = categoryOptions.filter(category => !categoryQuery || `${category.name} ${category.value}`.toLowerCase().includes(categoryQuery))
                  const categoryExists = categoryOptions.some(category => category.name.toLowerCase() === categorySearch.trim().replace(/\s+/g, ' ').toLowerCase())
                  return <div key={index} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-12 sm:items-center sm:border-0 sm:p-0">
                    <select aria-label="Booking line type" className="h-10 rounded-md border bg-background px-2 text-sm sm:col-span-2" value={charge.lineType} onChange={event => { setCatalogSearch(''); setOpenCatalogLine(null); setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, lineType: event.target.value as RentalChargeDraft['lineType'], productId: undefined, label: '', unitPrice: 0, category: event.target.value === 'consumable' ? 'other' : 'service' } : row)) }}>
                      <option value="service">Service / fee</option><option value="consumable">Stocked item</option>
                    </select>
                    <Popover open={openCatalogLine === index} onOpenChange={open => { setOpenCatalogLine(open ? index : null); if (!open) setCatalogSearch('') }}>
                      <PopoverTrigger asChild><Button type="button" role="combobox" aria-label={charge.lineType === 'consumable' ? 'Search stocked items' : 'Search service catalog'} aria-expanded={openCatalogLine === index} variant="outline" className="h-10 min-w-0 justify-between gap-2 px-2 text-left text-sm font-normal sm:col-span-3"><span className="truncate">{selectedCatalogItem ? `${selectedCatalogItem.name}${charge.lineType === 'consumable' ? ` · ${selectedCatalogItem.quantity} ${selectedCatalogItem.baseUnit || 'units'} on hand` : ''}` : charge.lineType === 'consumable' ? 'Search stocked item *' : 'Search service (optional)'}</span><ChevronsUpDown className="size-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
                      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command><CommandInput value={catalogSearch} onValueChange={setCatalogSearch} placeholder={charge.lineType === 'consumable' ? 'Search items by name or SKU…' : 'Search services by name or SKU…'} /><CommandList><CommandEmpty>No matching {charge.lineType === 'consumable' ? 'stocked items' : 'services'}.</CommandEmpty><CommandGroup>{catalogOptions.map(item => <CommandItem key={item.id} value={`${item.name} ${item.sku || ''} ${item.id}`} onSelect={() => { setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, productId: item.id, label: item.name, unitPrice: Number(item.price || 0) } : row)); setCatalogSearch(''); setOpenCatalogLine(null) }}><span className="min-w-0 flex-1 truncate">{item.name}{item.sku ? ` · ${item.sku}` : ''}</span>{charge.lineType === 'consumable' && <span className="shrink-0 text-xs text-muted-foreground">{item.quantity} {item.baseUnit || 'units'}</span>}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
                    </Popover>
                    <Input className="sm:col-span-2" value={charge.label} maxLength={120} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, label: event.target.value } : row))} placeholder="Description" />
                    <Popover open={openCategoryLine === index} onOpenChange={open => { setOpenCategoryLine(open ? index : null); if (!open) setCategorySearch('') }}>
                      <PopoverTrigger asChild><Button type="button" role="combobox" aria-label="Search or select service category" aria-expanded={openCategoryLine === index} variant="outline" className="h-10 min-w-0 justify-between gap-2 px-2 text-left text-sm font-normal sm:col-span-2"><span className="truncate">{categoryOptions.find(category => category.value.toLowerCase() === charge.category.toLowerCase())?.name || charge.category || 'Select category'}</span><ChevronsUpDown className="size-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
                      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command shouldFilter={false}><CommandInput value={categorySearch} onValueChange={setCategorySearch} placeholder="Search categories…" /><CommandList>{filteredCategoryOptions.length ? <CommandGroup>{filteredCategoryOptions.map(category => <CommandItem key={category.value} value={category.value} onSelect={() => { setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, category: category.value } : row)); setCategorySearch(''); setOpenCategoryLine(null) }}><Check className={cn('mr-2 size-4', charge.category.toLowerCase() === category.value.toLowerCase() ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{category.name}</span></CommandItem>)}</CommandGroup> : <CommandEmpty>No matching category.</CommandEmpty>}</CommandList>{categorySearch.trim() && !categoryExists && canCreateRental && online && <div className="border-t p-2"><Button type="button" variant="outline" className="w-full justify-start" disabled={savingCategory} onClick={() => void createRentalCategory(index)}><Plus className="mr-2 size-4" />{savingCategory ? 'Saving…' : `Create category “${categorySearch.trim()}”`}</Button></div>}</Command></PopoverContent>
                    </Popover>
                    <Input className="sm:col-span-1" type="number" min={charge.lineType === 'consumable' ? '1' : '0.01'} step={charge.lineType === 'consumable' ? '1' : 'any'} value={charge.quantity} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) || 1 } : row))} aria-label="Quantity" placeholder="Qty" />
                    <Input className="sm:col-span-1" type="number" min="0" step="any" value={charge.unitPrice} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, unitPrice: Number(event.target.value) || 0 } : row))} aria-label="Unit charge" placeholder="Rate" />
                    <Button className="sm:col-span-1" type="button" variant="ghost" size="icon" aria-label="Remove charge" onClick={() => setAdditionalCharges(rows => rows.filter((_, i) => i !== index))}><X className="h-4 w-4 text-destructive" /></Button>
                    {charge.lineType === 'consumable' && historicalMode && <Input className="sm:col-span-3" type="number" min="0" step="0.01" value={charge.unitCost || 0} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, unitCost: Number(event.target.value) || 0 } : row))} aria-label="Historical unit cost" placeholder="Historical unit cost (optional)" />}
                    {charge.lineType === 'consumable' && !historicalMode && selectedCatalogItem && <p className="text-xs text-muted-foreground sm:col-span-12">Stock is deducted and costed when this booking is checked out. Available now: {selectedCatalogItem.quantity} {selectedCatalogItem.baseUnit || 'units'}.</p>}
                  </div>
                })}
              </section>

              {/* Discount & Payment */}
              <div className={cn('grid gap-4', historicalMode ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
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
                {historicalMode ? <div className="space-y-2">
                  <Label htmlFor="historicalTaxRate">Historical Tax Rate (%)</Label>
                  <Input id="historicalTaxRate" type="number" min="0" max="100" step="0.01" value={historicalTaxRate} onChange={event => setHistoricalTaxRate(Number(event.target.value) || 0)} />
                </div> : <div className="space-y-2">
                  <Label htmlFor="amountPaid">Amount Paid</Label>
                  <Input
                    id="amountPaid"
                    type="number"
                    min="0"
                    step="any"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                  />
                </div>}
              </div>

              {historicalMode ? <section className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><Label>Historical payment records</Label><p className="text-xs text-muted-foreground">Each row creates a dated historical receipt copy only. It does not change current transaction accounts.</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setHistoricalPayments(rows => [...rows, { kind: 'rental_payment', amount: 0, paymentDate: actualReturnDate || localDateInput(), paymentMethod: 'cash', mobileProvider: '', phoneNumber: '', transactionRef: '', notes: '' }])}><Plus className="mr-1 h-4 w-4" />Add payment record</Button>
                </div>
                {historicalPayments.map((payment, index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1"><Label>Record type</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={payment.kind} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, kind: event.target.value as typeof row.kind } : row))}><option value="rental_payment">Rental payment received</option><option value="deposit">Security deposit received</option><option value="deposit_refund">Security deposit refunded</option></select></div>
                  <div className="space-y-1"><Label>Original payment date</Label><Input type="date" max={localDateInput()} value={payment.paymentDate} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, paymentDate: event.target.value } : row))} /></div>
                  <div className="space-y-1"><Label>Amount</Label><Input type="number" min="0.01" step="0.01" value={payment.amount || ''} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, amount: Number(event.target.value) || 0 } : row))} /></div>
                  <div className="space-y-1"><Label>Method</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={payment.paymentMethod} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, paymentMethod: event.target.value } : row))}><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option></select></div>
                  {payment.paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label>Provider</Label><Input value={payment.mobileProvider} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, mobileProvider: event.target.value } : row))} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label>Phone</Label><Input type="tel" value={payment.phoneNumber} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, phoneNumber: event.target.value } : row))} /></div></>}
                  {!['cash', 'safe', 'other'].includes(payment.paymentMethod) && <div className="space-y-1"><Label>Transaction reference</Label><Input value={payment.transactionRef} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, transactionRef: event.target.value } : row))} /></div>}
                  <div className="space-y-1"><Label>Note</Label><Input value={payment.notes} maxLength={500} onChange={event => setHistoricalPayments(rows => rows.map((row, i) => i === index ? { ...row, notes: event.target.value } : row))} placeholder="Optional record note" /></div>
                  <div className="flex items-end justify-end"><Button type="button" variant="ghost" onClick={() => setHistoricalPayments(rows => rows.filter((_, i) => i !== index))}><X className="mr-2 h-4 w-4" />Remove</Button></div>
                </div>)}
                {historicalPayments.length > 0 && <div className="text-right text-sm">Rental payments recorded: <strong>{formatCurrency(historicalRentalPaid)}</strong> · Current rental balance: <strong>{formatCurrency(historicalOpenBalance)}</strong></div>}
              </section> : <>
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
                  <option value="safe">Safe</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              {(amountPaid > 0 || depositAmount > 0) && <div className="space-y-2">
                <Label htmlFor="rental-cash-account">Transaction Account *</Label>
                <select id="rental-cash-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select permitted account</option>
                  {paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.type}) · {formatCurrency(account.balance)}</option>)}
                </select>
                {!paymentAccounts.length && <p className="text-xs text-destructive">No permitted account is available for this method. Ask an administrator to grant access or configure an account.</p>}
              </div>}

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

              {paymentMethod === 'bank_transfer' && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank Transfer Details</p>
                  <div>
                    <Label className="text-sm font-medium">Transfer reference *</Label>
                    <Input value={transactionId} onChange={event => setTransactionId(event.target.value)} placeholder="Bank transaction reference" />
                  </div>
                </div>
              )}
              </>}

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
                <Textarea
                  id="notes"
                  aiWritingField="rental booking notes"
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
                <Button type="submit" disabled={savingRental}>
                  <Clock className="mr-2 h-4 w-4" />
                  {savingRental ? 'Saving booking…' : historicalMode ? 'Save historical booking' : bookingMode === 'reserve' ? 'Reserve items' : 'Check out items'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        </DialogContent>}
      </Dialog>

      <Dialog open={Boolean(checkingOutRental)} onOpenChange={open => { if (!open && !savingCheckout) setCheckingOutRental(null) }}>
        {checkingOutRental && <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Check out a reservation</DialogTitle>
            <DialogDescription>Select an existing reservation. Its saved customer, dates, items, charges, and advance are carried through; checkout time is recorded now.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkout-reservation">Reserved booking</Label>
              <select
                id="checkout-reservation"
                value={checkingOutRental.id}
                onChange={event => {
                  const next = checkoutCandidates.find(rental => rental.id === event.target.value)
                  if (next) setCheckingOutRental(next)
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {checkoutCandidates.map(rental => <option key={rental.id} value={rental.id}>
                  {rental.rentalNo} · {rental.customer?.name || rental.customerName || 'Walk-in'} · {new Date(rental.hireDate).toLocaleDateString()} to {new Date(rental.expectedReturnDate).toLocaleDateString()}
                </option>)}
              </select>
            </div>
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{checkingOutRental.customer?.name || checkingOutRental.customerName || 'Walk-in'}</p></div>
              <div><p className="text-xs text-muted-foreground">Branch</p><p className="font-medium">{checkingOutRental.branch?.name || 'Default branch'}</p></div>
              <div><p className="text-xs text-muted-foreground">Reserved start</p><p className="font-medium">{new Date(checkingOutRental.hireDate).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Expected return</p><p className="font-medium">{new Date(checkingOutRental.expectedReturnDate).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Booking total</p><p className="font-medium tabular-nums">{formatCurrency(checkingOutRental.totalAmount)}</p></div>
              <div><p className="text-xs text-muted-foreground">Paid / advance</p><p className="font-medium tabular-nums">{formatCurrency(checkingOutRental.amountPaid)}</p></div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Reserved items and services</h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/40 text-left"><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2">Condition reserved</th></tr></thead>
                  <tbody>
                    {checkingOutRental.items.map(item => <tr key={item.id} className="border-b last:border-0">
                      <td className="p-2">{item.product?.name || 'Rental item'}</td><td className="p-2 text-right tabular-nums">{item.quantity}</td><td className="p-2 capitalize">{item.conditionOut || 'good'}</td>
                    </tr>)}
                    {(checkingOutRental.chargeLines || []).map(line => <tr key={line.id} className="border-b last:border-0">
                      <td className="p-2">{line.label}</td><td className="p-2 text-right tabular-nums">{line.quantity}</td><td className="p-2 capitalize">{line.category}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">Confirming checkout issues the reserved stock, records the actual checkout time, and posts the rental accounting entries. The reserved return date remains attached to this booking.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={savingCheckout} onClick={() => setCheckingOutRental(null)}>Cancel</Button>
              <Button type="button" disabled={savingCheckout || !online || !checkoutCandidates.some(rental => rental.id === checkingOutRental.id)} onClick={() => void confirmCheckout()}>
                <CalendarCheck className="mr-2 h-4 w-4" />{savingCheckout ? 'Checking out…' : 'Confirm check-out'}
              </Button>
            </div>
          </div>
        </DialogContent>}
      </Dialog>

      {/* Return Form */}
      <Dialog open={showReturnForm && Boolean(returningRental)} onOpenChange={open => { if (!open) setShowReturnForm(false) }}>
        {showReturnForm && returningRental && <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Process return · {returningRental.rentalNo}</DialogTitle><DialogDescription>Inspect each item and record its returned condition.</DialogDescription></DialogHeader>
        <Card className="border-0 p-0 shadow-none">
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
                <option value="held">Keep held pending financial settlement</option>
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
        </DialogContent>}
      </Dialog>

      <Dialog open={Boolean(cancellingRental)} onOpenChange={open => { if (!open && !savingCancellation) setCancellingRental(null) }}>
        {cancellingRental && <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel booking · {cancellingRental.rentalNo}</DialogTitle>
            <DialogDescription>Reserved dates will be released. Checked-out rentals must be returned first. Any fee due remains collectible and any excess advance is tracked for refund.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="rental-cancellation-percent">Cancellation charge (%)</Label>
                <Input id="rental-cancellation-percent" type="number" min="0" max="100" step="0.1" value={cancellationChargePercent} onChange={event => setCancellationChargePercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} />
                <p className="text-xs text-muted-foreground">Optional. Zero means no cancellation charge.</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex justify-between gap-2"><span>Estimated fee</span><strong>{formatCurrency(Number(cancellingRental.totalAmount) * cancellationChargePercent / 100)}</strong></div>
                <div className="mt-1 flex justify-between gap-2"><span>Advance held</span><strong>{formatCurrency(cancellingRental.amountPaid || 0)}</strong></div>
                <div className="mt-1 flex justify-between gap-2"><span>Estimated refund</span><strong>{formatCurrency(Math.max(0, Number(cancellingRental.amountPaid || 0) - Number(cancellingRental.totalAmount) * cancellationChargePercent / 100))}</strong></div>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rental-cancellation-reason">Cancellation reason</Label>
              <Textarea id="rental-cancellation-reason" value={cancellationReason} onChange={event => setCancellationReason(event.target.value)} maxLength={500} placeholder="Record why this booking is being cancelled" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={savingCancellation} onClick={() => setCancellingRental(null)}>Keep booking</Button>
              <Button type="button" variant="destructive" disabled={savingCancellation || cancellationReason.trim().length < 3 || cancellationChargePercent < 0 || cancellationChargePercent > 100} onClick={() => void handleCancel()}>{savingCancellation ? 'Cancelling…' : 'Confirm cancellation'}</Button>
            </div>
          </div>
        </DialogContent>}
      </Dialog>
    </div>
  )
}
