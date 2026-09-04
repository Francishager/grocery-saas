import React, { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useParams, useNavigate } from 'react-router-dom'
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
import { formatCurrency, cn, formatDisplayDate } from '@/lib/utils'
import CreateCustomerModal from '@/components/modals/CreateCustomerModal'
import CustomerTransactionHistoryDialog, { type CustomerHistoryTarget } from '@/components/customer/CustomerTransactionHistoryDialog'
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
  ArrowDownRight,
  ArrowDownCircle,
  Printer
} from 'lucide-react'

interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  creditLimit: number
  balance: number
  openingBalance?: number
  openingBalanceDate?: string | null
  openingBalanceNote?: string
  status: 'active' | 'inactive' | 'blocked'
  trustScore: number
  notes?: string
}

interface FuelCard {
  id: string
  cardNumber: string
  holderName: string
  customerId?: string | null
  customer?: { id: string; name: string; phone?: string } | null
  cardType: 'prepaid' | 'credit' | 'fleet'
  balance: number
  creditLimit: number
  status: 'active' | 'suspended' | 'expired' | 'cancelled'
  expiresAt?: string | null
  notes?: string
  createdAt: string
}

interface Supplier {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  balance: number
  openingBalance?: number
  openingBalanceDate?: string | null
  openingBalanceNote?: string
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
  const { user, hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const online = useOnlineStatus()
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([])
  const [products, setProducts] = useState<InventoryItem[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [businessProfile, setBusinessProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const { tab: urlTab } = useParams()
  const navigate = useNavigate()
  const activeTab = (urlTab === 'sales' || urlTab === 'payments' || urlTab === 'fuel-cards' || urlTab === 'credit-accounts') ? urlTab : 'customers'
  const [summary, setSummary] = useState<any>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [showSaleModal, setShowSaleModal] = useState(false)
  const [savingSale, setSavingSale] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedSale, setSelectedSale] = useState<any | null>(null)
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<Customer | null>(null)
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<CustomerHistoryTarget | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [mobileProvider, setMobileProvider] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [cashAccounts, setCashAccounts] = useState<any[]>([])
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<string | null>(null)
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
  const canCreateWithdrawal = hasPermission('canCreateWithdrawal')
  const assignedCashAccountId = user?.cashAccountId || user?.cashAccount?.id || ''
  const canUseOtherCashAccount = hasPermission('canUseOtherCashAccount')
  const canUseAnyTransactionAccount = (
    hasPermission('canUseAnyTransactionAccount') ||
    hasPermission('canEditTransactionAccount') ||
    hasPermission('canDeleteTransactionAccount')
  )

  // Fuel Cards state
  const [fuelCards, setFuelCards] = useState<FuelCard[]>([])
  const [showFuelCardModal, setShowFuelCardModal] = useState(false)
  const [editingFuelCard, setEditingFuelCard] = useState<FuelCard | null>(null)
  const [fuelCardForm, setFuelCardForm] = useState({
    cardNumber: '', holderName: '', customerId: '', cardType: 'prepaid' as 'prepaid' | 'credit' | 'fleet',
    balance: '0', creditLimit: '0', expiresAt: '', notes: ''
  })

  // Credit Accounts state
  const [creditAccounts, setCreditAccounts] = useState<Customer[]>([])
  const [editingCreditAccount, setEditingCreditAccount] = useState<Customer | null>(null)
  const [creditAccountForm, setCreditAccountForm] = useState({
    creditLimit: '0', status: 'active' as 'active' | 'inactive' | 'blocked', trustScore: '0', notes: ''
  })

  useEffect(() => {
    loadBusinessProfile()
  }, [])

  useEffect(() => {
    if (showPaymentModal || showWithdrawalModal) {
      loadCashAccounts()
    } else {
      setCashAccounts([])
      setSelectedCashAccountId(null)
    }
  }, [showPaymentModal, showWithdrawalModal])

  useEffect(() => {
    if (!creditEnabled) {
      setLoading(false)
      return
    }

    if (activeTab === 'customers') {
      loadCustomers()
    }
    if (activeTab === 'sales') { loadSales(); setLoading(false) }
    if (activeTab === 'payments') { loadPayments(); setLoading(false) }
    if (activeTab === 'fuel-cards') loadFuelCards()
    if (activeTab === 'credit-accounts') loadCreditAccounts()
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
          setSales(data.sales || [])
        } else {
          try { setSales(await getLocalReceivableSales()) } catch { setSales([]) }
        }
      } else {
        const local = await getLocalReceivableSales()
        setSales(local)
      }
    } catch (error) {
      try { setSales(await getLocalReceivableSales()) } catch { setSales([]) }
    }
  }

  const loadBusinessProfile = async () => {
    try {
      const response = await apiFetch('/api/settings/business-profile')
      if (response.ok) {
        setBusinessProfile(await response.json())
      }
    } catch (error) {
      console.error('Failed to load business profile for invoice printing:', error)
    }
  }

  const loadPayments = async () => {
    try {
      if (online) {
        const response = await apiFetch('/api/receivables/payments')
        if (response.ok) {
          const data = await response.json()
          setPayments(data.payments || [])
        } else {
          try { setPayments(await getLocalReceivablePayments()) } catch { setPayments([]) }
        }
      } else {
        const local = await getLocalReceivablePayments()
        setPayments(local)
      }
    } catch (error) {
      try { setPayments(await getLocalReceivablePayments()) } catch { setPayments([]) }
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

  const loadFuelCards = async () => {
    try {
      setLoading(true)
      const response = await apiFetch(`/api/receivables/fuel-cards?search=${encodeURIComponent(searchTerm)}`)
      if (response.ok) {
        const data = await response.json()
        setFuelCards(data.cards || [])
      }
    } catch (error) {
      console.error('Failed to load fuel cards:', error)
      toast({ variant: 'destructive', title: 'Failed to load fuel cards' })
    } finally {
      setLoading(false)
    }
  }

  const saveFuelCard = async () => {
    if (!fuelCardForm.cardNumber.trim() || !fuelCardForm.holderName.trim()) {
      toast({ variant: 'destructive', title: 'Card number and holder name are required' })
      return
    }
    try {
      const payload = {
        cardNumber: fuelCardForm.cardNumber.trim(),
        holderName: fuelCardForm.holderName.trim(),
        customerId: fuelCardForm.customerId || null,
        cardType: fuelCardForm.cardType,
        balance: Number(fuelCardForm.balance) || 0,
        creditLimit: Number(fuelCardForm.creditLimit) || 0,
        expiresAt: fuelCardForm.expiresAt || null,
        notes: fuelCardForm.notes || null,
      }
      const url = editingFuelCard
        ? `/api/receivables/fuel-cards/${editingFuelCard.id}`
        : '/api/receivables/fuel-cards'
      const method = editingFuelCard ? 'PUT' : 'POST'
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        toast({ title: editingFuelCard ? 'Fuel card updated' : 'Fuel card created' })
        setShowFuelCardModal(false)
        setEditingFuelCard(null)
        setFuelCardForm({ cardNumber: '', holderName: '', customerId: '', cardType: 'prepaid', balance: '0', creditLimit: '0', expiresAt: '', notes: '' })
        loadFuelCards()
      } else {
        const err = await response.json().catch(() => ({}))
        toast({ variant: 'destructive', title: err.error || 'Failed to save fuel card' })
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to save fuel card' })
    }
  }

  const deleteFuelCard = async (id: string) => {
    try {
      const response = await apiFetch(`/api/receivables/fuel-cards/${id}`, { method: 'DELETE' })
      if (response.ok) {
        toast({ title: 'Fuel card deleted' })
        loadFuelCards()
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to delete fuel card' })
    }
  }

  const reloadFuelCard = async (id: string) => {
    const amount = window.prompt('Enter reload amount:')
    if (!amount || Number(amount) <= 0) return
    try {
      const response = await apiFetch(`/api/receivables/fuel-cards/${id}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount) }),
      })
      if (response.ok) {
        toast({ title: 'Fuel card reloaded' })
        loadFuelCards()
      } else {
        const err = await response.json().catch(() => ({}))
        toast({ variant: 'destructive', title: err.error || 'Failed to reload card' })
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to reload fuel card' })
    }
  }

  const loadCreditAccounts = async () => {
    try {
      setLoading(true)
      const response = await apiFetch(`/api/receivables/credit-accounts?search=${encodeURIComponent(searchTerm)}`)
      if (response.ok) {
        const data = await response.json()
        setCreditAccounts(data.accounts || [])
      }
    } catch (error) {
      console.error('Failed to load credit accounts:', error)
      toast({ variant: 'destructive', title: 'Failed to load credit accounts' })
    } finally {
      setLoading(false)
    }
  }

  const saveCreditAccount = async () => {
    if (!editingCreditAccount) return
    if (Number(creditAccountForm.creditLimit || 0) <= 0) {
      toast({
        variant: 'destructive',
        title: 'Credit limit required',
        description: 'Set a customer credit limit greater than zero before saving credit terms.'
      })
      return
    }
    try {
      const response = await apiFetch(`/api/receivables/credit-accounts/${editingCreditAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditLimit: Number(creditAccountForm.creditLimit) || 0,
          status: creditAccountForm.status,
          notes: creditAccountForm.notes || null,
        }),
      })
      if (response.ok) {
        toast({ title: 'Credit terms updated' })
        setEditingCreditAccount(null)
        loadCreditAccounts()
      } else {
        const err = await response.json().catch(() => ({}))
        toast({ variant: 'destructive', title: err.error || 'Failed to update credit account' })
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to update credit account' })
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

  const getAccountTypesForPaymentMethod = (method: string): string[] => {
    const methodToTypes: { [key: string]: string[] } = {
      cash: ['cash', 'safe'],
      mobile_money: ['mobile_money'],
      bank_transfer: ['bank'],
      card: ['card']
    }
    return methodToTypes[method] || ['cash']
  }

  const getAccountTypeForPaymentMethod = (method: string): string => getAccountTypesForPaymentMethod(method).join(' / ')

  const loadCashAccounts = async (forPaymentMethod: string = paymentMethod) => {
    try {
      const response = await apiFetch('/api/expenses/cash-accounts')
      if (response.ok) {
        const data = await response.json()
        const accountTypes = getAccountTypesForPaymentMethod(forPaymentMethod)
        
        const filteredAccounts = (data || []).filter((acc: any) => {
          if (!accountTypes.includes(acc.type)) return false
          if (forPaymentMethod !== 'cash') return true
          const isAssignedAccount = assignedCashAccountId && String(acc.id) === String(assignedCashAccountId)
          return Boolean(isAssignedAccount || canUseOtherCashAccount || canUseAnyTransactionAccount)
        })
        
        setCashAccounts(filteredAccounts)
        
        // Auto-select first account if only one matches the payment method
        if (filteredAccounts?.length === 1) {
          setSelectedCashAccountId(filteredAccounts[0].id)
        } else if (filteredAccounts?.length === 0) {
          setSelectedCashAccountId(null)
        }
      }
    } catch (error) {
      console.error('Failed to load cash accounts:', error)
      toast({
        title: 'Warning',
        description: 'Could not load cash accounts. Please select one manually.',
        variant: 'destructive'
      })
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

    const paidAmount = Math.min(parseAmount(saleForm.amountPaid), saleTotal)
    const balanceAfterPayment = Math.max(0, saleTotal - paidAmount)
    if (balanceAfterPayment > 0) {
      const customerCreditLimit = Number(selectedSaleCustomer?.creditLimit || 0)
      if (customerCreditLimit <= 0) {
        toast({
          title: 'Credit limit required',
          description: `Set a credit limit for ${selectedSaleCustomer?.name || 'this customer'} before making a credit sale.`,
          variant: 'destructive'
        })
        return
      }
      const currentCustomerBalance = Number(selectedSaleCustomer?.balance || 0)
      if (currentCustomerBalance + balanceAfterPayment > customerCreditLimit) {
        toast({
          title: 'Credit limit exceeded',
          description: `Available credit is ${formatCurrency(Math.max(0, customerCreditLimit - currentCustomerBalance))}.`,
          variant: 'destructive'
        })
        return
      }
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
          amountPaid: paidAmount,
          notes: saleForm.notes || undefined,
        })
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to create sale'))
      }

      const createdSale = await response.json()
      toast({
        title: 'Success',
        description: 'Sale recorded successfully. Print or download the invoice from the details window.'
      })
      setShowSaleModal(false)
      setSelectedSaleDetail(createdSale)
      if (createdSale?.id) {
        setSales((prev) => [createdSale, ...prev.filter((sale) => sale.id !== createdSale.id)])
      }
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
    if (!targetCustomer) {
      toast({ variant: 'destructive', title: 'Select a customer first' })
      return
    }
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast({ variant: 'destructive', title: 'Enter a valid payment amount' })
      return
    }
    if (!selectedCashAccountId) {
      toast({ variant: 'destructive', title: 'Select a cash account to record the payment' })
      return
    }

    try {
      const response = await apiFetch('/api/receivables/payments', {
        method: 'POST',
        body: JSON.stringify({
          customerId: targetCustomer.id,
          saleId: selectedSale?.id,
          amount: parseFloat(paymentAmount),
          paymentMethod,
          cashAccountId: selectedCashAccountId || undefined,
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

  const recordWithdrawal = async () => {
    if (!canCreateWithdrawal) {
      toast({
        variant: 'destructive',
        title: 'You do not have permission to record customer withdrawals',
        description: 'Required permission: canCreateWithdrawal',
      })
      return
    }
    const targetCustomer = selectedCustomer
    if (!targetCustomer) {
      toast({ variant: 'destructive', title: 'Select a customer first' })
      return
    }
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast({ variant: 'destructive', title: 'Enter a valid withdrawal amount' })
      return
    }
    if (!selectedCashAccountId) {
      toast({ variant: 'destructive', title: 'Select a cash account to record the withdrawal' })
      return
    }

    try {
      const response = await apiFetch('/api/receivables/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          customerId: targetCustomer.id,
          amount: parseFloat(withdrawalAmount),
          paymentMethod,
          cashAccountId: selectedCashAccountId || undefined,
          mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : undefined,
          phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined,
          transactionId: ['mobile_money', 'card'].includes(paymentMethod) ? transactionId : undefined,
          notes: 'Customer withdrawal recorded via dashboard'
        })
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to record withdrawal'))
      }

      toast({
        title: 'Success',
        description: 'Withdrawal recorded successfully'
      })
      setShowWithdrawalModal(false)
      setSelectedCustomer(null)
      setWithdrawalAmount('')
      setPaymentMethod('cash')
      setMobileProvider('')
      setPhoneNumber('')
      setTransactionId('')
      setSelectedCashAccountId(null)
      if (activeTab === 'customers') loadCustomers()
      loadCustomerOptions()
      loadSales()
      loadPayments()
      loadReceivablesSummary()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to record withdrawal',
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
      <Badge variant={variants[status as keyof typeof variants] as 'default' | 'destructive' | 'outline' | 'secondary'}>
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

  const openCustomerHistory = (customer?: CustomerHistoryTarget | null) => {
    if (!customer?.id) return
    setHistoryCustomer(customer)
  }

  const renderCustomerNameButton = (customer?: CustomerHistoryTarget | null, fallback = 'Walk-in customer') => {
    if (!customer?.id) return <span>{customer?.name || fallback}</span>
    return (
      <button
        type="button"
        className="break-words text-left font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => openCustomerHistory(customer)}
      >
        {customer.name || fallback}
      </button>
    )
  }

  const buildInvoiceData = (sale: any, customerOverride?: any) => {
    const business = businessProfile || {}
    const saleItems = Array.isArray(sale?.items) ? sale.items : []
    const customer = customerOverride || sale?.customer || { name: 'Walk-in customer' }
    const items = saleItems.map((item: any) => ({
      name: item?.product?.name || item?.name || 'Item',
      quantity: Number(item?.quantity || 0),
      price: Number(item?.price || item?.unitPrice || 0),
      total: Number(item?.total || (Number(item?.quantity || 0) * Number(item?.price || item?.unitPrice || 0)))
    }))

    return {
      business,
      customer,
      sale,
      items,
      invoiceNo: sale?.receiptNo || sale?.invoiceNo || 'N/A',
      subtotal: Number(sale?.subtotal || 0),
      tax: Number(sale?.tax || 0),
      discount: Number(sale?.discount || 0),
      total: Number(sale?.total || 0),
      amountPaid: Number(sale?.amountPaid || 0),
      balance: Number(sale?.balance || 0),
      createdAt: sale?.createdAt || new Date().toISOString(),
    }
  }

  const exportSaleInvoicePdf = (sale: any, customerOverride?: any) => {
    const invoice = buildInvoiceData(sale, customerOverride)
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 40

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text(invoice.business?.name || 'Business Name', pageWidth / 2, 56, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const businessLines = [
      invoice.business?.address,
      invoice.business?.phone ? `Tel: ${invoice.business.phone}` : '',
      invoice.business?.email,
    ].filter(Boolean)
    businessLines.forEach((line, index) => doc.text(line, pageWidth / 2, 78 + index * 12, { align: 'center' }))

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Invoice', margin, 140)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`No: ${invoice.invoiceNo}`, margin, 160)
    doc.text(`Date: ${new Date(invoice.createdAt).toLocaleString()}`, margin, 176)

    doc.setFont('helvetica', 'bold')
    doc.text('Customer', pageWidth - 180, 140)
    doc.setFont('helvetica', 'normal')
    const customerName = invoice.customer?.name || 'Walk-in customer'
    doc.text(customerName, pageWidth - 180, 160)
    if (invoice.customer?.phone) doc.text(`Phone: ${invoice.customer.phone}`, pageWidth - 180, 176)
    if (invoice.customer?.email) doc.text(`Email: ${invoice.customer.email}`, pageWidth - 180, 192)

    const rows = invoice.items.map((item: any) => [
      item.name,
      String(item.quantity),
      formatCurrency(Number(item.price)),
      formatCurrency(Number(item.total)),
    ])

    autoTable(doc, {
      startY: 220,
      head: [['Item', 'Qty', 'Price', 'Total']],
      body: rows.length ? rows : [['No items recorded', '', '', '']],
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    })

    const tableEndY = (doc as any).lastAutoTable?.finalY ?? 220
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const totalsX = pageWidth - margin - 120
    doc.text('Subtotal', totalsX, tableEndY + 24)
    doc.text(formatCurrency(invoice.subtotal), pageWidth - margin, tableEndY + 24, { align: 'right' })
    doc.text('Tax', totalsX, tableEndY + 40)
    doc.text(formatCurrency(invoice.tax), pageWidth - margin, tableEndY + 40, { align: 'right' })
    doc.text('Discount', totalsX, tableEndY + 56)
    doc.text(formatCurrency(invoice.discount), pageWidth - margin, tableEndY + 56, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text('Total', totalsX, tableEndY + 76)
    doc.text(formatCurrency(invoice.total), pageWidth - margin, tableEndY + 76, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.text('Amount Paid', totalsX, tableEndY + 92)
    doc.text(formatCurrency(invoice.amountPaid), pageWidth - margin, tableEndY + 92, { align: 'right' })
    doc.text('Balance', totalsX, tableEndY + 108)
    doc.text(formatCurrency(invoice.balance), pageWidth - margin, tableEndY + 108, { align: 'right' })

    if (invoice.business?.receiptHeader) {
      doc.setFont('helvetica', 'italic')
      doc.text(invoice.business.receiptHeader, pageWidth / 2, pageHeight - 70, { align: 'center' })
    }
    doc.setFont('helvetica', 'normal')
    doc.text('Thank you for your business.', pageWidth / 2, pageHeight - 52, { align: 'center' })
    if (invoice.business?.receiptFooter) {
      doc.text(invoice.business.receiptFooter, pageWidth / 2, pageHeight - 36, { align: 'center' })
    }

    doc.save(`invoice-${String(invoice.invoiceNo).replace(/\s+/g, '-')}.pdf`)
  }

  const printSaleInvoice = (sale: any, customerOverride?: any) => {
    const business = businessProfile || {}
    const customer = customerOverride || sale?.customer || {}
    const customerName = customer?.name || 'Walk-in customer'
    const customerPhone = customer?.phone || ''
    const customerEmail = customer?.email || ''
    const items = Array.isArray(sale?.items) ? sale.items : []
    const printWindow = window.open('', '_blank', 'width=900,height=700')

    if (!printWindow) {
      toast({ title: 'Pop-up blocked', description: 'Enable pop-ups to print the invoice.', variant: 'destructive' })
      return
    }

    const escapeHtml = (value: any) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    const invoiceItemsHtml = items.length
      ? items.map((item: any) => {
          const productName = item?.product?.name || item?.name || 'Item'
          const qty = Number(item?.quantity || 0)
          const price = Number(item?.price || 0)
          const total = Number(item?.total || qty * price)
          return `
            <tr>
              <td>${escapeHtml(productName)}</td>
              <td>${qty}</td>
              <td>${formatCurrency(price)}</td>
              <td>${formatCurrency(total)}</td>
            </tr>
          `
        }).join('')
      : '<tr><td colspan="4">No items recorded</td></tr>'

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${escapeHtml(sale?.receiptNo || 'Sale')}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
            .header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 16px; }
            .company-name { font-size: 26px; font-weight: 700; }
            .meta { font-size: 12px; color: #4b5563; margin-top: 4px; }
            .top-row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
            .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
            .label { font-size: 12px; color: #6b7280; }
            .value { font-size: 14px; font-weight: 600; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; }
            th { background: #f3f4f6; }
            .totals { margin-left: auto; width: 320px; margin-top: 18px; }
            .amount-row { display: flex; justify-content: space-between; margin-top: 8px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #374151; }
            @media print { body { padding: 12px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${escapeHtml(business?.name || 'Business Name')}</div>
            ${business?.address ? `<div class="meta">${escapeHtml(business.address)}</div>` : ''}
            ${business?.phone ? `<div class="meta">Tel: ${escapeHtml(business.phone)}</div>` : ''}
            ${business?.email ? `<div class="meta">${escapeHtml(business.email)}</div>` : ''}
          </div>

          <div class="top-row">
            <div class="card" style="flex: 1;">
              <div class="label">Invoice</div>
              <div class="value">${escapeHtml(sale?.receiptNo || 'N/A')}</div>
            </div>
            <div class="card" style="flex: 1;">
              <div class="label">Date</div>
              <div class="value">${new Date(sale?.createdAt || Date.now()).toLocaleString()}</div>
            </div>
          </div>

          <div class="card" style="margin-bottom: 12px;">
            <div class="label">Customer</div>
            <div class="value">${escapeHtml(customerName)}</div>
            ${customerPhone ? `<div class="meta">Phone: ${escapeHtml(customerPhone)}</div>` : ''}
            ${customerEmail ? `<div class="meta">Email: ${escapeHtml(customerEmail)}</div>` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceItemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <div class="amount-row"><span>Subtotal</span><strong>${formatCurrency(Number(sale?.subtotal || 0))}</strong></div>
            <div class="amount-row"><span>Tax</span><strong>${formatCurrency(Number(sale?.tax || 0))}</strong></div>
            <div class="amount-row"><span>Discount</span><strong>${formatCurrency(Number(sale?.discount || 0))}</strong></div>
            <div class="amount-row" style="font-size: 18px; margin-top: 12px;"><span>Total</span><strong>${formatCurrency(Number(sale?.total || 0))}</strong></div>
            <div class="amount-row"><span>Amount Paid</span><strong>${formatCurrency(Number(sale?.amountPaid || 0))}</strong></div>
            <div class="amount-row"><span>Balance</span><strong>${formatCurrency(Number(sale?.balance || 0))}</strong></div>
          </div>

          <div class="footer">
            ${business?.receiptHeader ? `<div>${escapeHtml(business.receiptHeader)}</div>` : ''}
            <div>Thank you for your business.</div>
            ${business?.receiptFooter ? `<div>${escapeHtml(business.receiptFooter)}</div>` : ''}
          </div>
        </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  const exportPaymentInvoicePdf = (payment: any) => {
    const linkedSale = sales.find((sale) => sale.id === payment.saleId || sale.id === payment.sale?.id) || payment.sale || null
    const invoiceSale = linkedSale || {
      id: payment?.saleId || payment?.id,
      receiptNo: payment?.sale?.receiptNo || `PAY-${payment?.id || 'receipt'}`,
      customer: payment?.customer || null,
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: Number(payment?.amount || 0),
      amountPaid: Number(payment?.amount || 0),
      balance: 0,
      createdAt: payment?.createdAt || new Date().toISOString(),
      items: [],
    }
    exportSaleInvoicePdf(invoiceSale, payment?.customer || invoiceSale?.customer)
  }

  const printPaymentInvoice = (payment: any) => {
    const business = businessProfile || {}
    const linkedSale = sales.find((sale) => sale.id === payment.saleId || sale.id === payment.sale?.id) || payment.sale || null
    const customerName = payment.customer?.name || linkedSale?.customer?.name || 'Walk-in customer'
    const customerPhone = payment.customer?.phone || linkedSale?.customer?.phone || ''
    const customerEmail = payment.customer?.email || linkedSale?.customer?.email || ''
    const items = Array.isArray(linkedSale?.items) ? linkedSale.items : []
    const invoiceTotal = Number(linkedSale?.total ?? payment.amount ?? 0)
    const amountPaid = Number(linkedSale?.amountPaid ?? payment.amount ?? 0)
    const balance = Number(linkedSale?.balance ?? Math.max(0, invoiceTotal - amountPaid))

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      toast({ title: 'Pop-up blocked', description: 'Enable pop-ups to print the invoice.', variant: 'destructive' })
      return
    }

    const escapeHtml = (value: any) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    const invoiceItemsHtml = items.length
      ? items.map((item: any) => {
          const productName = item?.product?.name || item?.name || 'Item'
          const qty = Number(item?.quantity || 0)
          const price = Number(item?.price || 0)
          const total = Number(item?.total || qty * price)
          return `
            <tr>
              <td>${escapeHtml(productName)}</td>
              <td>${qty}</td>
              <td>${formatCurrency(price)}</td>
              <td>${formatCurrency(total)}</td>
            </tr>
          `
        }).join('')
      : '<tr><td colspan="4">No items recorded</td></tr>'

    printWindow.document.write(`
      <html>
        <head>
          <title>Payment Invoice ${escapeHtml(linkedSale?.receiptNo || payment.sale?.receiptNo || 'Receipt')}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
            .header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 16px; }
            .company-name { font-size: 26px; font-weight: 700; }
            .meta { font-size: 12px; color: #4b5563; margin-top: 4px; }
            .top-row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
            .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
            .label { font-size: 12px; color: #6b7280; }
            .value { font-size: 14px; font-weight: 600; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; }
            th { background: #f3f4f6; }
            .totals { margin-left: auto; width: 320px; margin-top: 18px; }
            .amount-row { display: flex; justify-content: space-between; margin-top: 8px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #374151; }
            @media print { body { padding: 12px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${escapeHtml(business?.name || 'Business Name')}</div>
            ${business?.address ? `<div class="meta">${escapeHtml(business.address)}</div>` : ''}
            ${business?.phone ? `<div class="meta">Tel: ${escapeHtml(business.phone)}</div>` : ''}
            ${business?.email ? `<div class="meta">${escapeHtml(business.email)}</div>` : ''}
          </div>

          <div class="top-row">
            <div class="card" style="flex: 1;">
              <div class="label">Invoice</div>
              <div class="value">${escapeHtml(linkedSale?.receiptNo || payment.sale?.receiptNo || 'N/A')}</div>
            </div>
            <div class="card" style="flex: 1;">
              <div class="label">Payment Date</div>
              <div class="value">${new Date(payment?.createdAt || Date.now()).toLocaleString()}</div>
            </div>
          </div>

          <div class="card" style="margin-bottom: 12px;">
            <div class="label">Customer</div>
            <div class="value">${escapeHtml(customerName)}</div>
            ${customerPhone ? `<div class="meta">Phone: ${escapeHtml(customerPhone)}</div>` : ''}
            ${customerEmail ? `<div class="meta">Email: ${escapeHtml(customerEmail)}</div>` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceItemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <div class="amount-row"><span>Invoice Total</span><strong>${formatCurrency(invoiceTotal)}</strong></div>
            <div class="amount-row"><span>Payment Amount</span><strong>${formatCurrency(Number(payment.amount || 0))}</strong></div>
            <div class="amount-row"><span>Amount Paid To Date</span><strong>${formatCurrency(amountPaid)}</strong></div>
            <div class="amount-row"><span>Balance</span><strong>${formatCurrency(balance)}</strong></div>
          </div>

          <div class="footer">
            ${business?.receiptHeader ? `<div>${escapeHtml(business.receiptHeader)}</div>` : ''}
            <div>Thank you for your business.</div>
            ${business?.receiptFooter ? `<div>${escapeHtml(business.receiptFooter)}</div>` : ''}
          </div>
        </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
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

  const tab = activeTab

  const pageTitle =
    tab === 'customers' ? 'Customers' :
    tab === 'sales' ? 'Credit Sales' :
    tab === 'payments' ? 'Payments' :
    tab === 'fuel-cards' ? 'Fuel Cards' :
    tab === 'credit-accounts' ? 'Credit Accounts' :
    'Receivables'

  const pageSubtitle =
    tab === 'customers' ? 'Manage customer credit accounts and balances' :
    tab === 'sales' ? 'Track credit sales and outstanding balances' :
    tab === 'payments' ? 'Record and review customer payments' :
    tab === 'fuel-cards' ? 'Manage fuel card accounts and transactions' :
    tab === 'credit-accounts' ? 'Manage customer credit account terms' :
    'Manage customer credit and outstanding payments'
  const saleCustomerList = customerOptions.length ? customerOptions : customers
  const selectedSaleCustomer = saleCustomerList.find((customer) => customer.id === saleForm.customerId)
  const saleAmountPaid = Math.min(parseAmount(saleForm.amountPaid), saleTotal)
  const saleBalanceAfterPayment = Math.max(0, saleTotal - saleAmountPaid)
  const selectedWithdrawalAccount = cashAccounts.find((account) => String(account.id) === String(selectedCashAccountId))
  const withdrawalValue = parseAmount(withdrawalAmount)
  const withdrawalAccountBalance = Number(selectedWithdrawalAccount?.balance || 0)
  const withdrawalAccountBalanceAfter = selectedWithdrawalAccount ? withdrawalAccountBalance - withdrawalValue : null
  const withdrawalCustomerBalanceAfter = Number(selectedCustomer?.balance || 0) + withdrawalValue

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
          <p className="text-muted-foreground">{pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'customers' && (
            <Button variant="outline" onClick={() => {
              setEditingCustomer(null)
              setShowCustomerModal(true)
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          )}
          {tab === 'sales' && (
            <Button onClick={openSaleModal}>
              <FileText className="h-4 w-4 mr-2" />
              New Sale
            </Button>
          )}
          {tab === 'fuel-cards' && (
            <Button onClick={() => {
              setEditingFuelCard(null)
              setFuelCardForm({ cardNumber: '', holderName: '', customerId: '', cardType: 'prepaid', balance: '0', creditLimit: '0', expiresAt: '', notes: '' })
              setShowFuelCardModal(true)
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Fuel Card
            </Button>
          )}
        </div>
      </div>

      <UsageLimitBanner resource="customers" label="Customers" currentCount={customers.length} />

      {/* Filters — only for customers, sales, payments */}
      <div className={cn('flex flex-wrap items-center gap-4 py-4', tab !== 'customers' && tab !== 'sales' && tab !== 'payments' && 'hidden')}>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
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
                        <h3>{renderCustomerNameButton(customer, customer.name)}</h3>
                        <p className="text-sm text-muted-foreground">{customer.phone}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(customer.status || 'active')}
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">Trust Score</p>
                        <p className={`font-bold ${getTrustScoreColor(customer.trustScore || 0)}`}>
                          {customer.trustScore || 0}/100
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Credit Limit</p>
                      <p className="font-semibold">{formatCurrency(customer.creditLimit || 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Opening Balance</p>
                      <p className="font-semibold">{formatCurrency(customer.openingBalance || 0)}</p>
                      {customer.openingBalanceDate && (
                        <p className="text-xs text-muted-foreground">{formatDisplayDate(customer.openingBalanceDate)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Balance</p>
                      <p className="font-semibold text-red-600">{formatCurrency(customer.balance || 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Available</p>
                      <p className="font-semibold text-green-600">
                        {formatCurrency(Number(customer.creditLimit || 0) - Number(customer.balance || 0))}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
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
                    {canCreateWithdrawal && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedCustomer(customer)
                          setSelectedSale(null)
                          setWithdrawalAmount('')
                          setPaymentMethod('cash')
                          setMobileProvider('')
                          setPhoneNumber('')
                          setTransactionId('')
                          setSelectedCashAccountId(null)
                          setShowWithdrawalModal(true)
                        }}
                      >
                        <ArrowDownCircle className="h-4 w-4 mr-1" />
                        Withdrawal
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSelectedCustomerDetail(customer)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingCustomer(customer)
                      setShowCustomerModal(true)
                    }}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
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
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Credit notes and debit notes are adjustments, not credit sales. They stay on the Credit & Debit Notes page and do not appear in this list.
          </div>
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
                          {renderCustomerNameButton(sale.customer, 'Walk-in customer')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDisplayDate(sale.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getPaymentStatusBadge(sale.paymentStatus)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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

                  <div className="mt-4 flex flex-wrap gap-2">
                    {sale.customer && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(sale.customer)
                          setSelectedSale(sale)
                          setPaymentAmount(String(sale.balance || ''))
                          setShowPaymentModal(true)
                        }}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Record Payment
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => printSaleInvoice(sale)}>
                      <Printer className="h-4 w-4 mr-1" />
                      Print Invoice
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => exportSaleInvoicePdf(sale)}>
                      <Download className="h-4 w-4 mr-1" />
                      Download PDF
                    </Button>
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
                          From {renderCustomerNameButton(payment.customer, 'Customer')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDisplayDate(payment.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{payment.paymentMethod}</Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    {payment.sale?.receiptNo && (
                      <p className="text-sm text-muted-foreground">Sale: {payment.sale.receiptNo}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => printPaymentInvoice(payment)}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print Invoice
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => exportPaymentInvoicePdf(payment)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'fuel-cards' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div></div>
          ) : fuelCards.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">No fuel cards registered yet. Click "Add Fuel Card" to create one.</CardContent></Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Card Number</th>
                    <th className="p-2 text-left">Holder</th>
                    <th className="p-2 text-left">Customer</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-right">Balance</th>
                    <th className="p-2 text-right">Credit Limit</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Expires</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fuelCards.map(card => (
                    <tr key={card.id} className="border-t">
                      <td className="p-2 font-medium">{card.cardNumber}</td>
                      <td className="p-2">{card.holderName}</td>
                      <td className="p-2">{card.customer ? renderCustomerNameButton(card.customer, card.customer.name) : '—'}</td>
                      <td className="p-2 capitalize">{card.cardType}</td>
                      <td className="p-2 text-right font-semibold">{Number(card.balance).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(card.creditLimit).toFixed(2)}</td>
                      <td className="p-2">
                        <Badge variant={card.status === 'active' ? 'default' : card.status === 'suspended' ? 'destructive' : 'secondary'}>
                          {card.status}
                        </Badge>
                      </td>
                      <td className="p-2">{card.expiresAt ? formatDisplayDate(card.expiresAt) : '—'}</td>
                      <td className="p-2 space-x-1 whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => reloadFuelCard(card.id)}>Reload</Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingFuelCard(card)
                          setFuelCardForm({
                            cardNumber: card.cardNumber, holderName: card.holderName,
                            customerId: card.customerId || '', cardType: card.cardType,
                            balance: String(card.balance), creditLimit: String(card.creditLimit),
                            expiresAt: card.expiresAt ? card.expiresAt.split('T')[0] : '', notes: card.notes || ''
                          })
                          setShowFuelCardModal(true)
                        }}><Edit className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteFuelCard(card.id)}><Trash2 className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'credit-accounts' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div></div>
          ) : creditAccounts.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">No credit accounts found. Set a credit limit on a customer to create a credit account.</CardContent></Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Customer</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-right">Credit Limit</th>
                    <th className="p-2 text-right">Opening Balance</th>
                    <th className="p-2 text-right">Balance</th>
                    <th className="p-2 text-right">Available</th>
                    <th className="p-2 text-left">Trust Score</th>
                    <th className="p-2 text-left">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {creditAccounts.map(acct => (
                    <tr key={acct.id} className="border-t">
                      <td className="p-2">{renderCustomerNameButton(acct, acct.name)}</td>
                      <td className="p-2">{acct.phone || '—'}</td>
                      <td className="p-2 text-right">{Number(acct.creditLimit).toFixed(2)}</td>
                      <td className="p-2 text-right">{formatCurrency(acct.openingBalance || 0)}</td>
                      <td className="p-2 text-right text-red-600 font-semibold">{Number(acct.balance).toFixed(2)}</td>
                      <td className="p-2 text-right text-green-600">{(Number(acct.creditLimit) - Number(acct.balance)).toFixed(2)}</td>
                      <td className="p-2">{acct.trustScore}/100</td>
                      <td className="p-2">
                        <Badge variant={acct.status === 'active' ? 'default' : acct.status === 'blocked' ? 'destructive' : 'secondary'}>
                          {acct.status}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingCreditAccount(acct)
                          setCreditAccountForm({
                            creditLimit: String(acct.creditLimit),
                            status: acct.status,
                            trustScore: String(acct.trustScore),
                            notes: acct.notes || ''
                          })
                        }}><Edit className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CustomerTransactionHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onOpenChange={(open) => {
          if (!open) setHistoryCustomer(null)
        }}
      />

      <CreateCustomerModal
        isOpen={showCustomerModal}
        initialData={editingCustomer || undefined}
        onClose={() => {
          setShowCustomerModal(false)
          setEditingCustomer(null)
        }}
        onSuccess={(customer) => {
          setCustomers((prev) => [customer, ...prev.filter((item) => item.id !== customer.id)])
          setCustomerOptions((prev) => [customer, ...prev.filter((item) => item.id !== customer.id)])
          setEditingCustomer(null)
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
                      {saleCustomerList.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} {customer.phone ? `(${customer.phone})` : ''} - Balance {formatCurrency(customer.balance || 0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSaleCustomer && (
                    <div className="mt-2 rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block">{renderCustomerNameButton(selectedSaleCustomer, selectedSaleCustomer.name)}</span>
                          {selectedSaleCustomer.phone && <span className="text-xs text-muted-foreground">{selectedSaleCustomer.phone}</span>}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold text-red-600">{formatCurrency(selectedSaleCustomer.balance || 0)}</span>
                          <span className="text-xs text-muted-foreground">Current balance</span>
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Credit limit: {formatCurrency(selectedSaleCustomer.creditLimit || 0)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Opening balance: {formatCurrency(selectedSaleCustomer.openingBalance || 0)}</p>
                      {saleBalanceAfterPayment > 0 && Number(selectedSaleCustomer.creditLimit || 0) <= 0 && (
                        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                          Set a credit limit for this customer before recording a credit sale.
                        </p>
                      )}
                    </div>
                  )}
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
                  <span>{formatCurrency(saleBalanceAfterPayment)}</span>
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
                  Balance: {Number(selectedSale?.balance ?? selectedCustomer.balance ?? 0).toFixed(2)}
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
                />
              </div>
              
              <div>
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select 
                  value={paymentMethod} 
                  onValueChange={(method) => {
                    setPaymentMethod(method)
                    setSelectedCashAccountId(null)
                    // Reload cash accounts filtered by new payment method
                    setTimeout(() => loadCashAccounts(method), 50)
                  }}
                >
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

              <div>
                <Label htmlFor="cashAccount">Staff Till / Account</Label>
                <Select value={selectedCashAccountId || ''} onValueChange={(v) => setSelectedCashAccountId(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder={cashAccounts.length === 0 ? 'No accounts available for this payment method' : 'Select till or account'} />
                  </SelectTrigger>
                  <SelectContent>
                    {cashAccounts.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">No {getAccountTypeForPaymentMethod(paymentMethod)} accounts available</div>
                    ) : (
                      cashAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} (Balance: {acc.balance?.toFixed?.(2) ?? acc.balance})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Select your staff till or tenant account. Transaction will be recorded under your name.
                </p>
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentModal(false)
                  setSelectedSale(null)
                  setSelectedCustomer(null)
                  setPaymentAmount('')
                  setSelectedCashAccountId(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={recordPayment} disabled={
                !paymentAmount || parseFloat(paymentAmount) <= 0 ||
                !selectedCashAccountId ||
                (paymentMethod === 'mobile_money' ? (!mobileProvider || !phoneNumber.trim() || !transactionId.trim()) : false) ||
                (paymentMethod === 'card' ? !transactionId.trim() : false)
              }>
                Record Payment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Modal */}
      {showWithdrawalModal && selectedCustomer && canCreateWithdrawal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold mb-4">Record Withdrawal</h3>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                recordWithdrawal()
              }}
            >
              <div>
                <Label>Customer</Label>
                <p className="font-medium">{selectedCustomer.name}</p>
                <p className="text-sm text-muted-foreground">
                  Current Balance: {formatCurrency(Number(selectedCustomer.balance || 0))}
                </p>
              </div>

              <div>
                <Label htmlFor="withdrawalAmount">Withdrawal Amount</Label>
                <Input
                  id="withdrawalAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  max={selectedWithdrawalAccount ? withdrawalAccountBalance : undefined}
                  value={withdrawalAmount}
                  onChange={(event) => setWithdrawalAmount(event.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label htmlFor="withdrawalPaymentMethod">Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(method) => {
                    setPaymentMethod(method)
                    setSelectedCashAccountId(null)
                    setMobileProvider('')
                    setPhoneNumber('')
                    setTransactionId('')
                    setTimeout(() => loadCashAccounts(method), 50)
                  }}
                >
                  <SelectTrigger id="withdrawalPaymentMethod">
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
                      onChange={(event) => setMobileProvider(event.target.value)}
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
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="e.g. 0977123456"
                      type="tel"
                    />
                  </div>
                  <div>
                    <Label>Transaction ID *</Label>
                    <Input
                      value={transactionId}
                      onChange={(event) => setTransactionId(event.target.value)}
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
                      onChange={(event) => setTransactionId(event.target.value)}
                      placeholder="e.g. TXN123456789"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="withdrawalCashAccount">Staff Till / Account</Label>
                <Select value={selectedCashAccountId || ''} onValueChange={(value) => setSelectedCashAccountId(value || null)}>
                  <SelectTrigger id="withdrawalCashAccount">
                    <SelectValue placeholder={cashAccounts.length === 0 ? 'No accounts available for this payment method' : 'Select till or account'} />
                  </SelectTrigger>
                  <SelectContent>
                    {cashAccounts.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">No {getAccountTypeForPaymentMethod(paymentMethod)} accounts available</div>
                    ) : (
                      cashAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} (Balance: {formatCurrency(Number(account.balance || 0))})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span>Customer Balance After</span>
                  <span className="font-semibold text-red-600">{formatCurrency(withdrawalCustomerBalanceAfter)}</span>
                </div>
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <span>Account Balance After</span>
                  <span className={withdrawalAccountBalanceAfter !== null && withdrawalAccountBalanceAfter < 0 ? 'font-semibold text-red-600' : ''}>
                    {withdrawalAccountBalanceAfter === null ? 'Select account' : formatCurrency(withdrawalAccountBalanceAfter)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowWithdrawalModal(false)
                    setSelectedCustomer(null)
                    setWithdrawalAmount('')
                    setPaymentMethod('cash')
                    setMobileProvider('')
                    setPhoneNumber('')
                    setTransactionId('')
                    setSelectedCashAccountId(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !withdrawalAmount || parseFloat(withdrawalAmount) <= 0 ||
                    !selectedCashAccountId ||
                    (withdrawalAccountBalanceAfter !== null && withdrawalAccountBalanceAfter < 0) ||
                    (paymentMethod === 'mobile_money' ? (!mobileProvider || !phoneNumber.trim() || !transactionId.trim()) : false) ||
                    (paymentMethod === 'card' ? !transactionId.trim() : false)
                  }
                >
                  Record Withdrawal
                </Button>
              </div>
            </form>
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
                <DetailRow label="Status" value={getStatusBadge(selectedCustomerDetail.status || 'active')} />
                <DetailRow label="Phone" value={selectedCustomerDetail.phone} />
                <DetailRow label="Email" value={selectedCustomerDetail.email} />
                <DetailRow label="Address" value={selectedCustomerDetail.address} />
                <DetailRow label="Credit Limit" value={formatCurrency(selectedCustomerDetail.creditLimit || 0)} />
                <DetailRow label="Balance" value={formatCurrency(selectedCustomerDetail.balance || 0)} />
                <DetailRow label="Opening Balance" value={formatCurrency(selectedCustomerDetail.openingBalance || 0)} />
                <DetailRow
                  label="Opening Balance Date"
                  value={selectedCustomerDetail.openingBalanceDate ? formatDisplayDate(selectedCustomerDetail.openingBalanceDate) : 'Not set'}
                />
                <DetailRow label="Opening Balance Note" value={selectedCustomerDetail.openingBalanceNote} />
                <DetailRow
                  label="Available Credit"
                  value={formatCurrency(Number(selectedCustomerDetail.creditLimit || 0) - Number(selectedCustomerDetail.balance || 0))}
                />
                <DetailRow label="Trust Score" value={`${selectedCustomerDetail.trustScore || 0}/100`} />
                <DetailRow label="Notes" value={selectedCustomerDetail.notes} />
              </div>
            )}

            {selectedSaleDetail && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2 pb-2">
                  <Button size="sm" variant="outline" onClick={() => printSaleInvoice(selectedSaleDetail)}>
                    <Printer className="h-4 w-4 mr-1" />
                    Print Invoice
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportSaleInvoicePdf(selectedSaleDetail)}>
                    <Download className="h-4 w-4 mr-1" />
                    Download PDF
                  </Button>
                </div>
                <div>
                  <DetailRow label="Customer" value={renderCustomerNameButton(selectedSaleDetail.customer, 'Walk-in customer')} />
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
                    value={selectedSaleDetail.dueDate ? formatDisplayDate(selectedSaleDetail.dueDate) : 'Not set'}
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

      {/* Fuel Card Modal */}
      {showFuelCardModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold mb-4">{editingFuelCard ? 'Edit Fuel Card' : 'New Fuel Card'}</h3>
            <div className="space-y-3">
              <div><Label>Card Number</Label><Input value={fuelCardForm.cardNumber} onChange={e => setFuelCardForm({ ...fuelCardForm, cardNumber: e.target.value })} placeholder="FC-00001" /></div>
              <div><Label>Holder Name</Label><Input value={fuelCardForm.holderName} onChange={e => setFuelCardForm({ ...fuelCardForm, holderName: e.target.value })} placeholder="John Doe" /></div>
              <div>
                <Label>Link to Customer (optional)</Label>
                <Select value={fuelCardForm.customerId} onValueChange={v => setFuelCardForm({ ...fuelCardForm, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {(customerOptions.length ? customerOptions : customers).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Card Type</Label>
                <Select value={fuelCardForm.cardType} onValueChange={v => setFuelCardForm({ ...fuelCardForm, cardType: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prepaid">Prepaid</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="fleet">Fleet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Initial Balance</Label><Input type="number" value={fuelCardForm.balance} onChange={e => setFuelCardForm({ ...fuelCardForm, balance: e.target.value })} /></div>
                <div><Label>Credit Limit</Label><Input type="number" value={fuelCardForm.creditLimit} onChange={e => setFuelCardForm({ ...fuelCardForm, creditLimit: e.target.value })} /></div>
              </div>
              <div><Label>Expiry Date (optional)</Label><Input type="date" value={fuelCardForm.expiresAt} onChange={e => setFuelCardForm({ ...fuelCardForm, expiresAt: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={fuelCardForm.notes} onChange={e => setFuelCardForm({ ...fuelCardForm, notes: e.target.value })} rows={2} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setShowFuelCardModal(false); setEditingFuelCard(null) }}>Cancel</Button>
              <Button onClick={saveFuelCard}>{editingFuelCard ? 'Update Card' : 'Create Card'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Account Edit Modal */}
      {editingCreditAccount && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-1">Edit Credit Terms</h3>
            <p className="text-sm text-muted-foreground mb-4">{editingCreditAccount.name}</p>
            <div className="space-y-3">
              <div><Label>Credit Limit *</Label><Input type="number" min="0.01" step="0.01" value={creditAccountForm.creditLimit} onChange={e => setCreditAccountForm({ ...creditAccountForm, creditLimit: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={creditAccountForm.status} onValueChange={v => setCreditAccountForm({ ...creditAccountForm, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trust Score</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-semibold">
                  {editingCreditAccount.trustScore || 0}/100
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Calculated from repayment history.</p>
              </div>
              <div><Label>Notes</Label><Textarea value={creditAccountForm.notes} onChange={e => setCreditAccountForm({ ...creditAccountForm, notes: e.target.value })} rows={2} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditingCreditAccount(null)}>Cancel</Button>
              <Button onClick={saveCreditAccount}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
