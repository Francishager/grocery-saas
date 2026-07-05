import React, { useState, useEffect } from 'react'
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

export default function CreateExpenseModal({ isOpen, onClose, onSuccess, initialData }: CreateExpenseModalProps) {
  const { isFeatureEnabled } = useFeatureAccess()
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
  const [paymentPerms, setPaymentPerms] = useState<PaymentMethodPermissions>({ canUseCash: true, canUseMobileMoney: false, canUseBank: false, canUseCard: false })

  useEffect(() => {
    if (isOpen) {
      loadCashAccounts()
      loadMyCashAccount()
    }
  }, [isOpen])

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
        // If user has an assigned account, set it as default
        if (data.cashAccountId && !initialData?.cashAccountId) {
          setFormData(prev => ({ ...prev, cashAccountId: data.cashAccountId }))
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
    if (!formData.cashAccountId) {
      toast({ variant: 'destructive', title: 'Select the cash account this expense was paid from' })
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
        paymentMethod: 'mobile_money',
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
              <Select value={formData.cashAccountId} onValueChange={(value) => handleInputChange('cashAccountId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account to pay from" />
                </SelectTrigger>
                <SelectContent>
                  {/* User's assigned CashAccount (default, always shown) */}
                  {myCashAccount && (
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
                  {cashAccounts
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
                const selected = myCashAccount && formData.cashAccountId === myCashAccount.id
                  ? myCashAccount
                  : cashAccounts.find(a => a.id === formData.cashAccountId)
                if (selected && parseFloat(formData.amount) > selected.balance) {
                  return <p className="text-xs text-red-600 font-medium">Insufficient funds: Balance is {selected.currency} {selected.balance.toFixed(2)} but amount is {parseFloat(formData.amount).toFixed(2)}</p>
                }
                if (selected) {
                  return <p className="text-xs text-muted-foreground">Available balance: {selected.currency} {selected.balance.toFixed(2)}</p>
                }
                return <p className="text-xs text-red-600">No account selected. Contact your administrator if you don't see your account.</p>
              })()}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={formData.paymentMethod} onValueChange={(value) => handleInputChange('paymentMethod', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentPerms.canUseMobileMoney && <SelectItem value="mobile_money">Mobile Money</SelectItem>}
                  {paymentPerms.canUseBank && <SelectItem value="bank_transfer">Bank Transfer</SelectItem>}
                  {paymentPerms.canUseCard && <SelectItem value="card">Card</SelectItem>}
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="credit">On Credit</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Cash is not available for spending — only for receiving customer payments</p>
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
