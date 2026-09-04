import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useFeatureAccess } from '@/services/featureAccessService'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

interface CashAccount {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  isActive: boolean
  accountNumber?: string | null
  bankName?: string | null
  accountHolder?: string | null
  branchName?: string | null
}

interface PaymentMethodPermissions {
  canUseCash: boolean
  canUseMobileMoney: boolean
  canUseBank: boolean
  canUseCard: boolean
}

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  paymentMethod: string
  cashAccountId?: string | null
  cashAccount?: { id: string; name: string; type: string } | null
  reference?: string
  notes?: string
  date: string
}

interface CreateExpenseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (expense: Expense) => void
  initialData?: Partial<Expense>
}

const EXPENSE_CATEGORIES = [
  // Operating Expenses
  { value: 'rent', label: 'Rent', icon: '🏢', group: 'Operating' },
  { value: 'utilities', label: 'Utilities (Electricity, Water, Gas)', icon: '💡', group: 'Operating' },
  { value: 'maintenance', label: 'Maintenance & Repairs', icon: '🔧', group: 'Operating' },
  { value: 'cleaning', label: 'Cleaning & Sanitation', icon: '🧹', group: 'Operating' },
  { value: 'security', label: 'Security Services', icon: '👮', group: 'Operating' },
  { value: 'waste_disposal', label: 'Waste Disposal', icon: '🗑️', group: 'Operating' },
  { value: 'supplies', label: 'Office Supplies', icon: '📎', group: 'Operating' },
  // Cost of Goods Sold
  { value: 'purchases', label: 'Inventory Purchases', icon: '📦', group: 'COGS' },
  { value: 'raw_materials', label: 'Raw Materials', icon: '🏭', group: 'COGS' },
  { value: 'packaging', label: 'Packaging Materials', icon: '🎁', group: 'COGS' },
  { value: 'freight_in', label: 'Freight & Inward Transport', icon: '🚛', group: 'COGS' },
  // Staff & Personnel
  { value: 'salaries', label: 'Salaries & Wages', icon: '💰', group: 'Personnel' },
  { value: 'staff_meals', label: 'Staff Meals & Welfare', icon: '🍽️', group: 'Personnel' },
  { value: 'staff_training', label: 'Staff Training', icon: '🎓', group: 'Personnel' },
  { value: 'medical', label: 'Medical & Health', icon: '🏥', group: 'Personnel' },
  { value: 'pensions', label: 'Pensions & NSSF', icon: '🏦', group: 'Personnel' },
  // Transport & Travel
  { value: 'transport', label: 'Transport (Local)', icon: '🚗', group: 'Travel' },
  { value: 'travel', label: 'Travel (Upcountry/International)', icon: '✈️', group: 'Travel' },
  { value: 'accommodation', label: 'Accommodation', icon: '🏨', group: 'Travel' },
  { value: 'meals', label: 'Meals & Entertainment', icon: '🍴', group: 'Travel' },
  { value: 'fuel', label: 'Fuel & Vehicle Expenses', icon: '⛽', group: 'Travel' },
  // Marketing & Sales
  { value: 'marketing', label: 'Marketing & Advertising', icon: '📢', group: 'Marketing' },
  { value: 'promotions', label: 'Promotions & Discounts', icon: '🏷️', group: 'Marketing' },
  { value: 'samples', label: 'Samples & Giveaways', icon: '🎁', group: 'Marketing' },
  // Professional Services
  { value: 'legal', label: 'Legal Fees', icon: '⚖️', group: 'Professional' },
  { value: 'accounting', label: 'Accounting & Audit', icon: '📊', group: 'Professional' },
  { value: 'consulting', label: 'Consulting Fees', icon: '🧠', group: 'Professional' },
  // IT & Technology
  { value: 'software_licenses', label: 'Software & Subscriptions', icon: '💻', group: 'IT' },
  { value: 'internet', label: 'Internet & Data', icon: '🌐', group: 'IT' },
  { value: 'airtime', label: 'Airtime & Communications', icon: '📱', group: 'IT' },
  { value: 'hosting', label: 'Hosting & Cloud Services', icon: '☁️', group: 'IT' },
  // Banking & Finance
  { value: 'bank_charges', label: 'Bank Charges & Fees', icon: '🏦', group: 'Finance' },
  { value: 'loan_interest', label: 'Loan Interest', icon: '📉', group: 'Finance' },
  { value: 'fx_losses', label: 'Foreign Exchange Losses', icon: '💱', group: 'Finance' },
  { value: 'fines', label: 'Fines & Penalties', icon: '⚠️', group: 'Finance' },
  // Compliance & Regulatory
  { value: 'taxes', label: 'Taxes (VAT, PAYE, Income Tax)', icon: '📋', group: 'Compliance' },
  { value: 'licenses', label: 'Business Licenses & Permits', icon: '📜', group: 'Compliance' },
  { value: 'inspection_fees', label: 'Inspection & Certification Fees', icon: '🔍', group: 'Compliance' },
  { value: 'insurance', label: 'Insurance Premiums', icon: '🛡️', group: 'Compliance' },
  // Equipment & Assets
  { value: 'equipment_purchase', label: 'Equipment Purchase', icon: '🛠️', group: 'Assets' },
  { value: 'equipment_rental', label: 'Equipment Rental/Lease', icon: '🔁', group: 'Assets' },
  { value: 'depreciation', label: 'Depreciation', icon: '📉', group: 'Assets' },
  // Other
  { value: 'donations', label: 'Donations & Sponsorships', icon: '🤝', group: 'Other' },
  { value: 'refunds', label: 'Customer Refunds', icon: '↩️', group: 'Other' },
  { value: 'write_offs', label: 'Bad Debts & Write-offs', icon: '❌', group: 'Other' },
  { value: 'miscellaneous', label: 'Miscellaneous', icon: '📝', group: 'Other' },
  { value: 'other', label: 'Other (Specify in Description)', icon: '📝', group: 'Other' }
]

const CATEGORY_GROUPS = ['Operating', 'COGS', 'Personnel', 'Travel', 'Marketing', 'Professional', 'IT', 'Finance', 'Compliance', 'Assets', 'Other']

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash', permission: 'canUseCash' },
  { value: 'mobile_money', label: 'Mobile Money', permission: 'canUseMobileMoney' },
  { value: 'bank_transfer', label: 'Bank Transfer', permission: 'canUseBank' },
  { value: 'cheque', label: 'Cheque', permission: 'canUseBank' },
  { value: 'card', label: 'Card', permission: 'canUseCard' },
]

const accountMatchesPaymentMethod = (account: CashAccount, paymentMethod: string) => {
  if (paymentMethod === 'cash') return account.type === 'cash' || account.type === 'safe'
  if (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque') return account.type === 'bank'
  if (paymentMethod === 'mobile_money') return account.type === 'mobile_money'
  if (paymentMethod === 'card') return account.type === 'card'
  return false
}

const hasPaymentMethodPermission = (paymentPerms: PaymentMethodPermissions, paymentMethod: string) => {
  const option = PAYMENT_METHOD_OPTIONS.find(method => method.value === paymentMethod)
  return option ? Boolean(paymentPerms[option.permission as keyof PaymentMethodPermissions]) : false
}

export default function CreateExpenseModal({ isOpen, onClose, onSuccess, initialData }: CreateExpenseModalProps) {
  const { isFeatureEnabled } = useFeatureAccess()
  const { user, hasPermission } = useJWTAuth()
  const { toast } = useToast()
  
  const [formData, setFormData] = useState<{
    category: string
    description: string
    amount: string
    paymentMethod: string
    cashAccountId: string
    reference: string
    notes: string
    date: string
    mobileProvider: string
    phoneNumber: string
    transactionId: string
  }>({
    category: initialData?.category || 'other',
    description: initialData?.description || '',
    amount: initialData?.amount !== undefined ? String(initialData.amount) : '',
    paymentMethod: initialData?.paymentMethod || 'mobile_money',
    cashAccountId: initialData?.cashAccountId || '',
    reference: initialData?.reference || '',
    notes: initialData?.notes || '',
    date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    mobileProvider: '',
    phoneNumber: '',
    transactionId: ''
  })
  
  const [loading, setLoading] = useState(false)
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [myCashAccount, setMyCashAccount] = useState<CashAccount | null>(null)
  const [paymentPerms, setPaymentPerms] = useState<PaymentMethodPermissions>({ canUseCash: false, canUseMobileMoney: false, canUseBank: false, canUseCard: false })
  const assignedCashAccountId = user?.cashAccountId || user?.cashAccount?.id || myCashAccount?.id || ''
  const canUseOtherCashAccount = hasPermission('canUseOtherCashAccount')
  const canUseAnyTransactionAccount = (
    hasPermission('canUseAnyTransactionAccount') ||
    hasPermission('canEditTransactionAccount') ||
    hasPermission('canDeleteTransactionAccount')
  )

  useEffect(() => {
    if (isOpen) {
      loadCashAccounts()
      loadMyCashAccount()
    }
  }, [isOpen])

  const permittedPaymentMethods = useMemo(() => (
    PAYMENT_METHOD_OPTIONS.filter(method => Boolean(paymentPerms[method.permission as keyof PaymentMethodPermissions]))
  ), [paymentPerms])

  const selectableCashAccounts = useMemo(() => {
    if (!formData.paymentMethod || !hasPaymentMethodPermission(paymentPerms, formData.paymentMethod)) return []

    const byId = new Map<string, CashAccount>()
    if (myCashAccount?.isActive !== false && accountMatchesPaymentMethod(myCashAccount, formData.paymentMethod)) {
      byId.set(myCashAccount.id, myCashAccount)
    }
    for (const account of cashAccounts) {
      if (!account.isActive) continue
      if (!accountMatchesPaymentMethod(account, formData.paymentMethod)) continue
      if (formData.paymentMethod === 'cash') {
        const isAssignedCashAccount = assignedCashAccountId && String(account.id) === String(assignedCashAccountId)
        if (!isAssignedCashAccount && !canUseOtherCashAccount && !canUseAnyTransactionAccount) continue
      }
      byId.set(account.id, account)
    }

    return [...byId.values()]
  }, [assignedCashAccountId, cashAccounts, canUseAnyTransactionAccount, canUseOtherCashAccount, formData.paymentMethod, myCashAccount, paymentPerms])

  useEffect(() => {
    if (!isOpen) return
    if (!permittedPaymentMethods.length) {
      if (formData.paymentMethod || formData.cashAccountId) {
        setFormData(prev => ({ ...prev, paymentMethod: '', cashAccountId: '' }))
      }
      return
    }
    if (!permittedPaymentMethods.some(method => method.value === formData.paymentMethod)) {
      setFormData(prev => ({ ...prev, paymentMethod: permittedPaymentMethods[0].value, cashAccountId: '' }))
    }
  }, [formData.cashAccountId, formData.paymentMethod, isOpen, permittedPaymentMethods])

  useEffect(() => {
    if (!isOpen || !formData.paymentMethod) return
    const selectedAccountIsValid = selectableCashAccounts.some(account => account.id === formData.cashAccountId)
    if (selectedAccountIsValid) return

    const preferredAccount = selectableCashAccounts.find(account => account.id === myCashAccount?.id) || selectableCashAccounts[0]
    setFormData(prev => ({ ...prev, cashAccountId: preferredAccount?.id || '' }))
  }, [formData.cashAccountId, formData.paymentMethod, isOpen, myCashAccount?.id, selectableCashAccounts])

  const loadCashAccounts = async () => {
    try {
      const response = await apiFetch('/api/expenses/cash-accounts')
      if (response.ok) {
        const data = await response.json()
        setCashAccounts(data)
      }
    } catch {
      // silently fail — account selector will be empty
    }
  }

  const loadMyCashAccount = async () => {
    try {
      const response = await apiFetch('/api/expenses/my-cash-account')
      if (response.ok) {
        const data = await response.json()
        setMyCashAccount(data.cashAccount)
        if (data.paymentMethodPermissions) {
          setPaymentPerms(data.paymentMethodPermissions)
        }
      }
    } catch {
      // silently fail
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isFeatureEnabled('expenses')) {
      toast({
        title: 'Feature Not Available',
        description: 'Expense tracking is not available in your current plan',
        variant: 'destructive'
      })
      return
    }

    if (!formData.description.trim()) {
      toast({ variant: 'destructive', title: 'Description is required' })
      return
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({ variant: 'destructive', title: 'Amount must be greater than 0' })
      return
    }
    if (!formData.paymentMethod || !hasPaymentMethodPermission(paymentPerms, formData.paymentMethod)) {
      toast({ variant: 'destructive', title: 'You do not have permission to use this payment method' })
      return
    }
    if (!formData.cashAccountId) {
      toast({ variant: 'destructive', title: 'Select the account this expense was paid from' })
      return
    }
    if (!selectableCashAccounts.some(account => account.id === formData.cashAccountId)) {
      toast({ variant: 'destructive', title: 'Select an account that matches the payment method' })
      return
    }
    if (!formData.date) {
      toast({ variant: 'destructive', title: 'Date is required' })
      return
    }

    setLoading(true)
    
    try {
      const url = initialData?.id 
        ? `/api/expenses/expenses/${initialData.id}`
        : '/api/expenses/expenses'
      
      const response = await apiFetch(url, {
        method: initialData?.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...formData,
          cashAccountId: formData.cashAccountId || undefined,
          amount: parseFloat(formData.amount),
          date: new Date(formData.date).toISOString()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save expense')
      }

      const expense = await response.json()
      onSuccess(expense)
      onClose()
      
      toast({
        title: 'Success',
        description: `Expense ${initialData?.id ? 'updated' : 'created'} successfully`
      })
      
      // Reset form
      setFormData({
        category: 'other',
        description: '',
        amount: '',
        paymentMethod: permittedPaymentMethods[0]?.value || '',
        cashAccountId: '',
        reference: '',
        notes: '',
        date: new Date().toISOString().split('T')[0],
        mobileProvider: '',
        phoneNumber: '',
        transactionId: ''
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save expense',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    if (field === 'paymentMethod') {
      setFormData(prev => ({
        ...prev,
        paymentMethod: value,
        cashAccountId: '',
        mobileProvider: value === 'mobile_money' ? prev.mobileProvider : '',
        phoneNumber: value === 'mobile_money' ? prev.phoneNumber : '',
        transactionId: ['mobile_money', 'card'].includes(value) ? prev.transactionId : ''
      }))
      return
    }

    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (!isFeatureEnabled('expenses')) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upgrade Required</DialogTitle>
            <DialogDescription>
              Expense tracking is not available in your current plan. Upgrade to access this feature.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
          <DialogDescription>
            {initialData?.id ? 'Update expense information' : 'Record a new business expense'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(100vh-12rem)]">
          <div className="space-y-4 overflow-y-auto px-1 py-1 flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {CATEGORY_GROUPS.map(group => (
                    <div key={group}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-popover z-10">{group}</div>
                      {EXPENSE_CATEGORIES.filter(c => c.group === group).map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <div className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter expense description"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cashAccountId">Pay From Account *</Label>
              <Select
                value={formData.cashAccountId}
                onValueChange={(value) => handleInputChange('cashAccountId', value)}
                disabled={!selectableCashAccounts.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account to pay from" />
                </SelectTrigger>
                <SelectContent>
                  {selectableCashAccounts.length > 0 ? selectableCashAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex flex-col">
                          <span>{acc.name} {acc.id === myCashAccount?.id && <span className="text-xs text-blue-600">(My Account)</span>}</span>
                          <span className="text-xs text-muted-foreground">{acc.type.replace(/_/g, ' ')}{acc.accountNumber ? ` - ${acc.accountNumber}` : ''}{acc.bankName ? ` - ${acc.bankName}` : ''}</span>
                        </div>
                        <span className={`text-xs font-semibold ${parseFloat(formData.amount) > acc.balance ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {acc.currency} {acc.balance.toFixed(2)}
                        </span>
                      </div>
                    </SelectItem>
                  )) : (
                    <SelectItem value="no-accounts" disabled>No matching accounts</SelectItem>
                  )}
                  {/* User's assigned CashAccount (default, always shown) */}
                  {false && myCashAccount && (
                    <SelectItem value={myCashAccount.id}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex flex-col">
                          <span>{myCashAccount.name} <span className="text-xs text-blue-600">(My Account)</span></span>
                          <span className="text-xs text-muted-foreground">{myCashAccount.type.replace(/_/g, ' ')}{myCashAccount.accountNumber ? ` • ${myCashAccount.accountNumber}` : ''}</span>
                        </div>
                        <span className={`text-xs font-semibold ${parseFloat(formData.amount) > myCashAccount.balance ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {myCashAccount.currency} {myCashAccount.balance.toFixed(2)}
                        </span>
                      </div>
                    </SelectItem>
                  )}
                  {/* Other accounts the user can access based on permissions */}
                  {false && cashAccounts
                    .filter(acc => acc.id !== myCashAccount?.id)
                    .filter(acc => {
                      if (acc.type === 'cash') return false // cash accounts only for customer payments
                      if (acc.type === 'mobile_money') return paymentPerms.canUseMobileMoney
                      if (acc.type === 'bank') return paymentPerms.canUseBank
                      if (acc.type === 'card') return paymentPerms.canUseCard
                      return false
                    })
                    .map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <div className="flex flex-col">
                            <span>{acc.name}</span>
                            <span className="text-xs text-muted-foreground">{acc.type.replace(/_/g, ' ')}{acc.accountNumber ? ` • ${acc.accountNumber}` : ''}{acc.bankName ? ` • ${acc.bankName}` : ''}</span>
                          </div>
                          <span className={`text-xs font-semibold ${parseFloat(formData.amount) > acc.balance ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {acc.currency} {acc.balance.toFixed(2)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {/* Show selected account balance warning */}
              {(() => {
                const selected = selectableCashAccounts.find(a => a.id === formData.cashAccountId)
                if (selected && parseFloat(formData.amount) > selected.balance) {
                  return <p className="text-xs text-red-600 font-medium">Insufficient funds: Balance is {selected.currency} {selected.balance.toFixed(2)} but amount is {parseFloat(formData.amount).toFixed(2)}</p>
                }
                if (selected) {
                  return <p className="text-xs text-muted-foreground">Available balance: {selected.currency} {selected.balance.toFixed(2)}</p>
                }
                return <p className="text-xs text-red-600">No matching account available for this payment method.</p>
              })()}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => handleInputChange('paymentMethod', value)}
                disabled={!permittedPaymentMethods.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {permittedPaymentMethods.length > 0 ? permittedPaymentMethods.map(method => (
                    <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                  )) : (
                    <SelectItem value="no-methods" disabled>No permitted payment methods</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date *</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => handleInputChange('date', e.target.value)}
              required
            />
          </div>

          {formData.paymentMethod === 'mobile_money' && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mobile Money Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Network Provider *</Label>
                  <select
                    value={formData.mobileProvider}
                    onChange={(e) => handleInputChange('mobileProvider', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <Input
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                    placeholder="e.g. 0977123456"
                    type="tel"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Transaction ID *</Label>
                <Input
                  value={formData.transactionId}
                  onChange={(e) => handleInputChange('transactionId', e.target.value)}
                  placeholder="e.g. TXN123456789"
                />
              </div>
            </div>
          )}

          {formData.paymentMethod === 'card' && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Card Payment Details</p>
              <div className="space-y-2">
                <Label>Transaction ID *</Label>
                <Input
                  value={formData.transactionId}
                  onChange={(e) => handleInputChange('transactionId', e.target.value)}
                  placeholder="e.g. TXN123456789"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) => handleInputChange('reference', e.target.value)}
                placeholder="Invoice number, receipt, etc."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes"
              />
            </div>
          </div>

          </div>

          <DialogFooter className="mt-4 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading ||
              (formData.paymentMethod === 'mobile_money' ? (!formData.mobileProvider || !formData.phoneNumber?.trim() || !formData.transactionId?.trim()) : false) ||
              (formData.paymentMethod === 'card' ? !formData.transactionId?.trim() : false)
            }>
              {loading ? 'Saving...' : initialData?.id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
