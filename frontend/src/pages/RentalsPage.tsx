import { appConfirm } from '@/lib/appFeedback'
import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Clock, ArrowLeft, Package, Check, AlertTriangle, X, Sparkles, CalendarCheck, Printer } from 'lucide-react'
import { rentalsApi, inventoryApi, branchesApi, settingsApi, type BranchOption, type InventoryItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  customerName?: string | null
  customerPhone?: string | null
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
  depositPaid?: number
  depositRefunded?: number
  payments?: { id: string; receiptNo: string; kind: string; amount: number; balanceAfter: number; paymentMethod?: string | null; paymentDate: string; transactionRef?: string | null; notes?: string | null; cashAccount?: { name: string; type: string } | null }[]
  status: string
  bookingState?: string
  bookingPurpose?: string | null
  contractDraft?: string | null
  contractGeneratedAt?: string | null
  notes?: string | null
  items: RentalItem[]
  chargeLines?: { id: string; label: string; category: string; quantity: number; unitPrice: number; totalAmount: number }[]
}

interface RentalChargeDraft { label: string; category: string; quantity: number; unitPrice: number }

export default function RentalsPage({ section = 'bookings' }: { section?: 'bookings' | 'returns' }) {
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [bookingMode, setBookingMode] = useState<'reserve' | 'checkout'>('checkout')
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
  const [paymentAccounts, setPaymentAccounts] = useState<{ id: string; name: string; type: string; balance: number; currency: string }[]>([])
  const [cashAccountId, setCashAccountId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [depositRefundAmount, setDepositRefundAmount] = useState(0)
  const [advanceRefundAmount, setAdvanceRefundAmount] = useState(0)
  const [forfeitureReason, setForfeitureReason] = useState('')
  const [savingRentalPayment, setSavingRentalPayment] = useState(false)
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
  const [availabilityByProduct, setAvailabilityByProduct] = useState<Record<string, number>>({})
  const [generatingContract, setGeneratingContract] = useState(false)
  const [contractDraftValue, setContractDraftValue] = useState('')
  const [savingContract, setSavingContract] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

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
  const canViewReport = hasPermission('canViewReportRentalsSummary')
  const canGenerateContract = hasPermission('canGenerateRentalContract')

  useEffect(() => {
    setStatusFilter(section === 'returns' ? 'active' : 'all')
    setSelectedRental(null)
    setShowForm(false)
    setShowReturnForm(false)
  }, [section])

  useEffect(() => {
    loadRentals()
    loadBranches()
    loadTaxConfig()
    if (canViewReport) loadSummary()
  }, [statusFilter])

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
    setBookingPurpose('')
    loadRentalItems()
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  useEffect(() => {
    if (!showForm || !selectedItems.length || !hireDate || !expectedReturnDate) {
      setAvailabilityByProduct({})
      return
    }
    let cancelled = false
    rentalsApi.availability(selectedItems.map(item => item.productId), hireDate, expectedReturnDate, branchId || undefined)
      .then(result => {
        if (!cancelled) setAvailabilityByProduct(Object.fromEntries((result.availability || []).map((row: any) => [row.productId, Number(row.available)])))
      })
      .catch(() => { if (!cancelled) setAvailabilityByProduct({}) })
    return () => { cancelled = true }
  }, [showForm, selectedItems, hireDate, expectedReturnDate, branchId])

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
  const subtotal = hireSubtotal + chargesSubtotal
  const taxableAmount = Math.max(0, subtotal - discount)
  const taxAmount = (taxConfig?.taxEnabled && taxConfig?.taxRate) ? Math.round(taxableAmount * taxConfig.taxRate / 100 * 100) / 100 : 0
  const totalAmount = Math.max(0, taxableAmount + taxAmount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedItems.length === 0 && additionalCharges.length === 0) {
      toast({ title: 'Error', description: 'Add rental equipment or a service/venue charge.', variant: 'destructive' })
      return
    }
    if (!expectedReturnDate) {
      toast({ title: 'Error', description: 'Expected return date is required', variant: 'destructive' })
      return
    }

    try {
      const created = await rentalsApi.create({
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: selectedItems,
        additionalCharges,
        hireDate,
        expectedReturnDate,
        depositAmount,
        amountPaid,
        idempotencyKey: crypto.randomUUID(),
        paymentMethod,
        cashAccountId: (amountPaid > 0 || depositAmount > 0) ? cashAccountId : undefined,
        mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined,
        phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined,
        transactionId: ['mobile_money', 'card'].includes(paymentMethod) ? transactionId : undefined,
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
    }
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
      const itemRows = (rental.items || []).map((item: any) => `<tr><td>${safe(item.product?.name)}</td><td>${item.quantity}</td><td>${safe(formatCurrency(item.totalAmount))}</td></tr>`).join('')
      const popup = window.open('', '_blank')
      if (!popup) return toast({ title: 'Print blocked', description: 'Allow pop-ups to print rental receipts.', variant: 'destructive' })
      popup.opener = null
      popup.document.write(`<html><head><title>Rental receipt ${safe(payment.receiptNo)}</title><style>body{font:14px Arial,sans-serif;color:#111;margin:24px}header{text-align:center;border-bottom:1px solid #bbb;padding-bottom:14px}h1{font-size:20px;margin:4px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}.amount{text-align:right;font-size:18px;font-weight:bold}</style></head><body><header><h1>${safe(business?.name || 'Business')}</h1><div>${safe(business?.address || '')}</div><div>${safe(business?.phone || '')} ${safe(business?.email || '')}</div><h2>Rental payment receipt</h2></header><p><b>Receipt:</b> ${safe(payment.receiptNo)}<br><b>Date:</b> ${safe(new Date(payment.paymentDate).toLocaleString())}<br><b>Renter:</b> ${safe(rental.customer?.name || rental.customerName || 'Renter')}<br><b>Rental:</b> ${safe(rental.rentalNo)}<br><b>Payment type:</b> ${safe(payment.kind.replaceAll('_', ' '))}<br><b>Method/account:</b> ${safe(payment.paymentMethod || 'Non-cash settlement')} / ${safe(payment.cashAccount?.name || 'N/A')}<br><b>Mobile provider:</b> ${safe(payment.mobileProvider || '—')}<br><b>Payment phone:</b> ${safe(payment.phoneNumber || '—')}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Rental value</th></tr></thead><tbody>${itemRows}</tbody></table><p class="amount">${safe(formatCurrency(payment.amount))}</p><p>Rental total: ${safe(formatCurrency(rental.totalAmount))}<br>Outstanding after receipt: ${safe(formatCurrency(payment.balanceAfter))}<br>Reference: ${safe(payment.transactionRef || '—')}<br>Note: ${safe(payment.notes || '—')}</p><footer>Printed from JibuSales</footer><script>window.onload=()=>window.print()</script></body></html>`)
      popup.document.close()
    } catch (err: any) { toast({ title: 'Receipt unavailable', description: err.message || 'Could not load receipt.', variant: 'destructive' }) }
  }

  const handleCheckout = async (rental: Rental) => {
    try {
      const updated = await rentalsApi.checkout(rental.id, branchId || undefined)
      setRentals(current => current.map(row => row.id === updated.id ? updated : row))
      toast({ title: 'Checked out', description: 'Availability was confirmed and stock has been issued.' })
      loadRentals()
    } catch (err: any) {
      toast({ title: 'Could not check out', description: err.message || 'Availability may have changed.', variant: 'destructive' })
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
    const escaped = selectedRental.contractDraft.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] || character))
    popup.document.write(`<html><head><title>Rental Agreement ${selectedRental.rentalNo}</title><style>body{font:14px/1.55 Arial,sans-serif;color:#111;margin:24mm;white-space:pre-wrap}h1{font-size:20px}</style></head><body>${escaped}</body></html>`)
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

  const handleCancel = async (id: string) => {
    if (!(await appConfirm('Cancel this reservation? Reserved dates will be released; checked-out rentals must be returned instead.'))) return
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

  const visibleRentals = rentals.filter(rental => {
    const isReturnable = rental.status === 'active' && (!rental.bookingState || rental.bookingState === 'checked_out')
    if (section === 'returns' && !isReturnable) return false
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    return [rental.rentalNo, rental.customer?.name, rental.customerName, rental.customerPhone, rental.branch?.name,
      ...rental.items.map(item => item.product?.name)]
      .some(value => String(value || '').toLowerCase().includes(query))
  })
  const { paginatedItems: paginatedRentals, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(visibleRentals, 10)

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
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Payments and receipts</h3><p className="text-sm text-muted-foreground">Collections and deposit movements are linked to cash accounts and the general ledger.</p></div></div>
              {selectedRental.payments?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Receipt</th><th>Date</th><th>Type</th><th>Account</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>{selectedRental.payments.map(payment => <tr key={payment.id} className="border-b last:border-0"><td className="py-2 font-medium">{payment.receiptNo}</td><td>{new Date(payment.paymentDate).toLocaleDateString()}</td><td className="capitalize">{payment.kind.replaceAll('_', ' ')}</td><td>{payment.cashAccount?.name || 'Non-cash settlement'}</td><td className="text-right">{formatCurrency(payment.amount)}</td><td className="text-right"><Button size="sm" variant="outline" onClick={() => printRentalReceipt(payment.id)}><Printer className="mr-2 h-4 w-4" />Receipt</Button></td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No posted payment records yet. Existing legacy totals remain visible until a new payment is recorded.</p>}
              {canCreateRental && Number(selectedRental.balance) > 0 && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label htmlFor="rental-payment-amount">Receive rent payment</Label><Input id="rental-payment-amount" type="number" min="0.01" max={selectedRental.balance} step="any" value={paymentAmount || ''} onChange={event => setPaymentAmount(Number(event.target.value) || 0)} /></div>
                <div className="space-y-1"><Label htmlFor="rental-payment-method">Payment method</Label><select id="rental-payment-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select></div>
                <div className="space-y-1"><Label htmlFor="rental-payment-account">Receiving account</Label><select id="rental-payment-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select permitted account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></div>
                {paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label htmlFor="rental-payment-provider">Provider</Label><Input id="rental-payment-provider" value={mobileProvider} onChange={event => setMobileProvider(event.target.value)} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label htmlFor="rental-payment-phone">Phone</Label><Input id="rental-payment-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} type="tel" /></div></>}
                {!['cash', 'safe'].includes(paymentMethod) && <div className="space-y-1"><Label htmlFor="rental-payment-reference">Transaction reference</Label><Input id="rental-payment-reference" value={transactionId} onChange={event => setTransactionId(event.target.value)} /></div>}
                <div className="flex items-end"><Button className="w-full" onClick={handleRecordRentalPayment} disabled={savingRentalPayment || paymentAmount <= 0 || paymentAmount > Number(selectedRental.balance) || !cashAccountId || (paymentMethod === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) || (['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim())}>{savingRentalPayment ? 'Posting…' : 'Record payment'}</Button></div>
              </div>}
              {canDeleteRental && selectedRental.bookingState !== 'checked_out' && selectedRental.status === 'active' && Number(selectedRental.amountPaid) > 0 && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label htmlFor="rental-advance-refund">Refund reservation advance</Label><Input id="rental-advance-refund" type="number" min="0.01" max={selectedRental.amountPaid} step="any" value={advanceRefundAmount || ''} onChange={event => setAdvanceRefundAmount(Number(event.target.value) || 0)} /></div>
                <div className="space-y-1"><Label htmlFor="rental-advance-refund-method">Refund method</Label><select id="rental-advance-refund-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select></div>
                <div className="space-y-1"><Label htmlFor="rental-advance-refund-account">Refund account</Label><select id="rental-advance-refund-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select permitted account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></div>
                {paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label htmlFor="rental-advance-provider">Provider</Label><Input id="rental-advance-provider" value={mobileProvider} onChange={event => setMobileProvider(event.target.value)} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label htmlFor="rental-advance-phone">Phone</Label><Input id="rental-advance-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} type="tel" /></div></>}
                {!['cash', 'safe'].includes(paymentMethod) && <div className="space-y-1"><Label htmlFor="rental-advance-reference">Transaction reference</Label><Input id="rental-advance-reference" value={transactionId} onChange={event => setTransactionId(event.target.value)} /></div>}
                <div className="flex items-end"><Button variant="outline" className="w-full" onClick={handleRefundRentalAdvance} disabled={savingRentalPayment || advanceRefundAmount <= 0 || advanceRefundAmount > Number(selectedRental.amountPaid) || !cashAccountId || (paymentMethod === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) || (['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim())}>{savingRentalPayment ? 'Posting…' : 'Refund advance'}</Button></div>
              </div>}
              {canProcessReturn && (selectedRental.status === 'returned' || (selectedRental.status === 'active' && selectedRental.bookingState !== 'checked_out')) && Number(selectedRental.depositPaid || selectedRental.depositAmount) - Number(selectedRental.depositRefunded || 0) > 0 && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label htmlFor="rental-deposit-refund">Refund held deposit</Label><Input id="rental-deposit-refund" type="number" min="0.01" max={Math.max(0, Number(selectedRental.depositPaid || selectedRental.depositAmount) - Number(selectedRental.depositRefunded || 0))} step="any" value={depositRefundAmount || ''} onChange={event => setDepositRefundAmount(Number(event.target.value) || 0)} /></div>
                <div className="space-y-1"><Label htmlFor="rental-refund-method">Refund from method</Label><select id="rental-refund-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="cash">Cash</option><option value="safe">Safe</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select></div>
                <div className="space-y-1"><Label htmlFor="rental-refund-account">Refund account</Label><select id="rental-refund-account" value={cashAccountId} onChange={event => setCashAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select permitted account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></div>
                {paymentMethod === 'mobile_money' && <><div className="space-y-1"><Label htmlFor="rental-refund-provider">Provider</Label><Input id="rental-refund-provider" value={mobileProvider} onChange={event => setMobileProvider(event.target.value)} placeholder="MTN / Airtel" /></div><div className="space-y-1"><Label htmlFor="rental-refund-phone">Phone</Label><Input id="rental-refund-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} type="tel" /></div></>}
                {!['cash', 'safe'].includes(paymentMethod) && <div className="space-y-1"><Label htmlFor="rental-refund-reference">Transaction reference</Label><Input id="rental-refund-reference" value={transactionId} onChange={event => setTransactionId(event.target.value)} /></div>}
                <div className="flex items-end"><Button variant="outline" className="w-full" onClick={handleRefundRentalDeposit} disabled={savingRentalPayment || depositRefundAmount <= 0 || !cashAccountId || (paymentMethod === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) || (['card', 'bank_transfer'].includes(paymentMethod) && !transactionId.trim())}>{savingRentalPayment ? 'Posting…' : 'Record refund'}</Button></div>
              </div>}
              {canProcessReturn && selectedRental.status === 'returned' && Number(selectedRental.depositPaid || selectedRental.depositAmount) - Number(selectedRental.depositRefunded || 0) > 0 && <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
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
                <textarea aria-label="Rental contract draft" readOnly={!hasPermission('canEditRental')} value={contractDraftValue || selectedRental.contractDraft} onChange={event => setContractDraftValue(event.target.value)} className="min-h-[420px] w-full rounded-md border border-input bg-background p-4 font-mono text-sm leading-6" />
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
          <h1 className="text-3xl font-bold tracking-tight">{section === 'returns' ? 'Rental Returns' : 'Bookings & Check-out'}</h1>
          <p className="text-muted-foreground">{section === 'returns' ? 'Review checked-out assets due back and complete their return.' : 'Reserve hire assets, check them out, and follow each booking.'}</p>
        </div>
        {section === 'bookings' && canCreateRental && (
          <Button onClick={openNewForm}>
            <Plus className="mr-2 h-4 w-4" />
            New Hire
          </Button>
        )}
      </div>

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
          <CardTitle>{section === 'returns' ? `Items currently out (${visibleRentals.length})` : `Bookings (${visibleRentals.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : visibleRentals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">{section === 'returns' ? 'No checked-out rentals are awaiting return.' : 'No bookings match this search.'}</p>
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
                          {rental.bookingState && rental.bookingState !== 'checked_out' ? rental.bookingState.replace('_', ' ') : rental.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {rental.status === 'active' && rental.bookingState && rental.bookingState !== 'checked_out' && hasPermission('canEditRental') && (
                            <Button variant="outline" size="sm" onClick={() => handleCheckout(rental)}>
                              <CalendarCheck className="mr-1 h-3.5 w-3.5" />Check out
                            </Button>
                          )}
                          {canProcessReturn && rental.status === 'active' && (!rental.bookingState || rental.bookingState === 'checked_out') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReturnForm(rental)}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Return
                            </Button>
                          )}
                          {canDeleteRental && rental.status === 'active' && rental.bookingState !== 'checked_out' && (
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
            <CardTitle>New rental booking</CardTitle>
            <p className="text-sm text-muted-foreground">Reserve equipment for a date range or check it out immediately. Availability is checked before saving.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Booking action</Label>
                <div className="inline-flex rounded-md border p-1">
                  <button type="button" onClick={() => setBookingMode('reserve')} className={cn('rounded px-3 py-2 text-sm', bookingMode === 'reserve' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Reserve dates</button>
                  <button type="button" onClick={() => setBookingMode('checkout')} className={cn('rounded px-3 py-2 text-sm', bookingMode === 'checkout' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Check out now</button>
                </div>
              </div>
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

              <div className="space-y-2">
                <Label htmlFor="bookingPurpose">Purpose or event</Label>
                <Input id="bookingPurpose" value={bookingPurpose} maxLength={500} onChange={event => setBookingPurpose(event.target.value)} placeholder="Optional: wedding, conference, production, site work…" />
              </div>

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
                              {availabilityByProduct[item.id] ?? item.quantity} available for dates
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
                  <div><Label>Services and event charges</Label><p className="text-xs text-muted-foreground">Optional, non-stock lines such as delivery, setup, staff, venue or cleaning.</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAdditionalCharges(rows => [...rows, { label: '', category: 'service', quantity: 1, unitPrice: 0 }])}><Plus className="mr-1 h-4 w-4" />Add line</Button>
                </div>
                {additionalCharges.map((charge, index) => <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-12 sm:col-span-4" value={charge.label} maxLength={120} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, label: event.target.value } : row))} placeholder="Description" />
                  <select aria-label="Charge type" className="col-span-6 sm:col-span-3 h-10 rounded-md border bg-background px-2 text-sm" value={charge.category} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, category: event.target.value } : row))}><option value="service">Service</option><option value="delivery">Delivery</option><option value="setup">Setup</option><option value="staffing">Staffing</option><option value="venue">Venue</option><option value="cleaning">Cleaning</option><option value="other">Other</option></select>
                  <Input className="col-span-2 sm:col-span-1" type="number" min="0.01" step="any" value={charge.quantity} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) || 1 } : row))} aria-label="Quantity" />
                  <Input className="col-span-3 sm:col-span-3" type="number" min="0" step="any" value={charge.unitPrice} onChange={event => setAdditionalCharges(rows => rows.map((row, i) => i === index ? { ...row, unitPrice: Number(event.target.value) || 0 } : row))} aria-label="Unit charge" placeholder="Rate" />
                  <Button className="col-span-1" type="button" variant="ghost" size="icon" aria-label="Remove charge" onClick={() => setAdditionalCharges(rows => rows.filter((_, i) => i !== index))}><X className="h-4 w-4 text-destructive" /></Button>
                </div>)}
              </section>

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
                    (selectedItems.length === 0 && additionalCharges.length === 0) ||
                    additionalCharges.some(charge => !charge.label.trim()) ||
                    ((amountPaid > 0 || depositAmount > 0) && !cashAccountId) ||
                    (paymentMethod === 'mobile_money' ? (!mobileProvider || !phoneNumber.trim() || !transactionId.trim()) :
                     paymentMethod === 'card' ? !transactionId.trim() :
                     false)
                  }
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {bookingMode === 'reserve' ? 'Reserve items' : 'Check out items'}
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
      )}
    </div>
  )
}
