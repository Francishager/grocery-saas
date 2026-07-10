import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Calculator, Plus, BookOpen, TrendingUp, Scale, Search, Filter, Trash2, DollarSign, Wallet, Landmark, Smartphone, Shield, ChevronDown } from 'lucide-react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalAccounts, getLocalJournalEntries, getLocalBranches } from '@/db/hybrid'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'

interface Account {
  id: string
  code: string
  name: string
  type: string
  subType?: string
  balance: number
  isActive: boolean
  parentId?: string
  children?: Account[]
  description?: string
  branchId?: string
  branch?: { id: string; name: string } | null
}

interface JournalLine {
  id: string
  accountId: string
  account?: { code: string; name: string; type: string }
  debit: number
  credit: number
  description?: string
}

interface JournalEntry {
  id: string
  entryNo: string
  date: string
  description?: string
  reference?: string
  status: string
  branchId?: string
  branch?: { id: string; name: string }
  user?: { fname: string; lname: string }
  lines: JournalLine[]
  paymentMethod?: string
  voucherNo?: string
  currency?: string
  action?: string
  createdAt?: string
}

interface Branch {
  id: string
  name: string
}

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Assets' },
  { value: 'equity', label: 'Equity' },
  { value: 'liability', label: 'Liability' },
  { value: 'income', label: 'Income' },
  { value: 'expenses', label: 'Expenses' },
]

const PAYMENT_METHODS = ['cash', 'mobile_money', 'cheque']
const CURRENCIES = ['USD', 'KES', 'UGX', 'TZS', 'RWF', 'NGN', 'GHS', 'ZAR']
const JOURNAL_ACTIONS = [
  { value: 'register_income', label: 'Register Income' },
  { value: 'register_expense', label: 'Register Expense' },
  { value: 'register_capital', label: 'Register Capital' },
  { value: 'register_liability', label: 'Register Liability' },
  { value: 'register_asset', label: 'Register Asset' },
  { value: 'clear_payable', label: 'Clear Payable' },
  { value: 'collect_receivable', label: 'Collect Receivable' },
]
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash Account',
  mobile_money: 'Mobile Money Account',
  cheque: 'Bank Account (Cheque)',
}

const ACCOUNT_CATEGORIES: Record<string, { code: string; name: string }[]> = {
  asset: [
    { code: '1100', name: 'Current Assets' },
    { code: '1200', name: 'Fixed Assets' },
    { code: '1300', name: 'Other Assets' },
  ],
  liability: [
    { code: '2100', name: 'Current Liabilities' },
    { code: '2200', name: 'Long-term Liabilities' },
  ],
  equity: [
    { code: '3100', name: "Owner's Equity" },
    { code: '3200', name: 'Retained Earnings' },
  ],
  income: [
    { code: '4100', name: 'Sales Revenue' },
    { code: '4200', name: 'Other Income' },
  ],
  expenses: [
    { code: '5100', name: 'Cost of Goods Sold' },
    { code: '5200', name: 'Operating Expenses' },
    { code: '5300', name: 'Administrative Expenses' },
  ],
}

const accountTypeColor: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800',
  liability: 'bg-red-100 text-red-800',
  equity: 'bg-purple-100 text-purple-800',
  income: 'bg-green-100 text-green-800',
  revenue: 'bg-green-100 text-green-800',
  expenses: 'bg-orange-100 text-orange-800',
  expense: 'bg-orange-100 text-orange-800',
}

const buildAccountOptions = (accounts: Account[], typeFilter?: string) => {
  const matchesType = (account: Account) => {
    if (!typeFilter) return true
    if (typeFilter === 'income') return account.type === 'income' || account.type === 'revenue'
    if (typeFilter === 'expenses') return account.type === 'expenses' || account.type === 'expense'
    return account.type === typeFilter
  }

  const flatten = (account: Account, depth = 0): Array<{ value: string; label: string }> => {
    if (!matchesType(account)) return []

    const items = [{ value: account.id, label: `${'— '.repeat(depth)}${account.code} - ${account.name}` }]
    for (const child of account.children || []) {
      items.push(...flatten(child, depth + 1))
    }
    return items
  }

  return accounts.flatMap((account) => flatten(account))
}

export default function AccountingPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const { user, hasPermission } = useJWTAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('chart-of-accounts')

  // Account modal
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const dropdownBtnRef = useRef<HTMLButtonElement>(null)
  const [accCode, setAccCode] = useState('')
  const [accName, setAccName] = useState('')
  const [accType, setAccType] = useState('asset')
  const [accSubType, setAccSubType] = useState('')
  const [accDescription, setAccDescription] = useState('')
  const [accCategory, setAccCategory] = useState('')
  const [accParentId, setAccParentId] = useState('')
  const [accBranch, setAccBranch] = useState('')
  const [accCurrency, setAccCurrency] = useState('USD')
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [branchSearch, setBranchSearch] = useState('')

  // Journal entry form
  const [jeBranch, setJeBranch] = useState('')
  const [jeAction, setJeAction] = useState('create')
  const [jeDate, setJeDate] = useState(new Date().toISOString().split('T')[0])
  const [jeAccount, setJeAccount] = useState('')
  const [jeDescription, setJeDescription] = useState('')
  const [jeAmount, setJeAmount] = useState('')
  const [jeCurrency, setJeCurrency] = useState('USD')
  const [jeVoucher, setJeVoucher] = useState('')
  const [jePaymentMethod, setJePaymentMethod] = useState('cash')
  const [jePaymentAccount, setJePaymentAccount] = useState('')
  const [jeComment, setJeComment] = useState('')
  const [jeSubForm, setJeSubForm] = useState<'single' | 'multiple'>('single')

  // Multiple General Journal form
  const [mjLines, setMjLines] = useState<{ debitAccount: string; creditAccount: string; amount: string; date: string; description: string }[]>([
    { debitAccount: '', creditAccount: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' },
  ])

  // Journal Ledger
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    branch: '',
    account: '',
    startDate: '',
    endDate: '',
    category: '',
    currency: '',
  })
  const { paginatedItems: paginatedEntries, currentPage, totalPages, totalItems, goToPage } = usePagination(entries, pageSize)

  // Tax Management
  const [taxPayments, setTaxPayments] = useState<any[]>([])
  const [showTaxModal, setShowTaxModal] = useState(false)
  const [taxForm, setTaxForm] = useState({
    branch: '',
    amount: '',
    currency: 'USD',
    from: '',
    to: '',
    prn: '',
    paymentMethod: 'cash',
    dateOfPayment: new Date().toISOString().split('T')[0],
  })

  const fetchAccounts = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/accounting/accounts')
        if (res.ok) setAccounts(await res.json())
      } else {
        setAccounts(await getLocalAccounts())
      }
    } catch {
      try { setAccounts(await getLocalAccounts()) } catch {}
    }
  }

  const fetchEntries = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/accounting/journal')
        if (res.ok) setEntries(await res.json())
      } else {
        setEntries(await getLocalJournalEntries() as any)
      }
    } catch {
      try { setEntries(await getLocalJournalEntries() as any) } catch {}
    } finally {
      setLoading(false)
    }
  }

  const fetchBranches = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/branches')
        if (res.ok) {
          const data = await res.json()
          setBranches(data.branches || data || [])
        }
      } else {
        setBranches(await getLocalBranches())
      }
    } catch {
      try { setBranches(await getLocalBranches()) } catch {}
    }
  }

  const fetchTaxPayments = async () => {
    try {
      const res = await apiFetch('/api/accounting/tax-payments')
      if (res.ok) setTaxPayments(await res.json())
    } catch {
      setTaxPayments([])
    }
  }

  const accountOptions = useMemo(() => buildAccountOptions(accounts), [accounts])
  const parentAccountOptions = useMemo(() => buildAccountOptions(accounts, accType), [accounts, accType])

  useEffect(() => {
    if (user?.branchId && !hasPermission('canViewBranch')) {
      setAccBranch(user.branchId)
    }
    apiFetch('/api/settings/tax-config').then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        if (data.currency) setAccCurrency(data.currency)
      }
    }).catch(() => {})
  }, [user, hasPermission])

  useEffect(() => {
    fetchAccounts()
    fetchEntries()
    fetchBranches()
  }, [])

  useEffect(() => {
    if (activeTab === 'tax-management') fetchTaxPayments()
  }, [activeTab])

  const handleCreateAccount = async () => {
    if (!accName) return toast({ variant: 'destructive', title: 'Account name required' })
    if (!accCategory) return toast({ variant: 'destructive', title: 'Account category required' })

    const categories = ACCOUNT_CATEGORIES[accType] || []
    const selectedCategory = categories.find(c => c.code === accCategory)
    const baseCode = selectedCategory ? parseInt(selectedCategory.code) : 1100
    const parentAccount = accounts.find(a => a.id === accParentId)
    const parentBaseCode = parentAccount ? Number.parseInt(parentAccount.code, 10) || baseCode : baseCode
    let generatedCode = String(parentBaseCode + 1)
    while (accounts.some(account => account.code === generatedCode)) {
      generatedCode = String(Number(generatedCode) + 1)
    }

    try {
      const res = await apiFetch('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: generatedCode,
          name: accName,
          type: accType,
          subType: accSubType || undefined,
          description: accDescription || undefined,
          parentId: accParentId || undefined,
          parentCode: accParentId ? undefined : accCategory || undefined,
          parentName: accParentId ? undefined : selectedCategory?.name || undefined,
          branchId: accBranch || undefined,
          currency: accCurrency,
        }),
      })
      if (res.ok) {
        toast({ title: 'Account created' })
        setShowAccountModal(false)
        setAccCode('')
        setAccName('')
        setAccSubType('')
        setAccDescription('')
        setAccCategory('')
        setAccParentId('')
        setAccBranch('')
        fetchAccounts()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch {
      toast({ variant: 'destructive', title: 'Failed to create account' })
    }
  }

  const handleDeleteAccount = async (id: string) => {
    try {
      const res = await apiFetch(`/api/accounting/accounts/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Account deleted' })
        fetchAccounts()
      }
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete account' })
    }
  }

  // Filtered entries for Journal Ledger
  const filteredEntries = useMemo(() => {
    let result = entries
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      result = result.filter(e =>
        e.entryNo?.toLowerCase().includes(lower) ||
        e.description?.toLowerCase().includes(lower) ||
        e.reference?.toLowerCase().includes(lower) ||
        e.lines?.some(l => l.account?.name?.toLowerCase().includes(lower))
      )
    }
    if (filters.branch) result = result.filter(e => e.branchId === filters.branch)
    if (filters.account) result = result.filter(e => e.lines?.some(l => l.accountId === filters.account))
    if (filters.startDate) result = result.filter(e => new Date(e.date) >= new Date(filters.startDate))
    if (filters.endDate) result = result.filter(e => new Date(e.date) <= new Date(filters.endDate))
    if (filters.category) result = result.filter(e => e.lines?.some(l => l.account?.type === filters.category))
    if (filters.currency) result = result.filter(e => e.currency === filters.currency)
    return result
  }, [entries, searchTerm, filters])

  const paginatedFiltered = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredEntries.slice(start, start + pageSize)
  }, [filteredEntries, currentPage, pageSize])

  const resetFilters = () => {
    setFilters({ branch: '', account: '', startDate: '', endDate: '', category: '', currency: '' })
  }

  // Submit single journal entry
  const handleSingleJournalSubmit = async () => {
    if (!jeAccount || !jeAmount) return toast({ variant: 'destructive', title: 'Account and amount required' })
    try {
      const amount = Number(jeAmount)
      const res = await apiFetch('/api/accounting/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: jeDate,
          description: jeDescription,
          reference: jeVoucher,
          branchId: jeBranch || undefined,
          paymentMethod: jePaymentMethod,
          paymentAccountId: jePaymentAccount || undefined,
          currency: jeCurrency,
          action: jeAction,
          voucherNo: jeVoucher,
          comment: jeComment,
          lines: [
            { accountId: jeAccount, debit: amount, credit: 0, description: jeDescription },
          ],
        }),
      })
      if (res.ok) {
        toast({ title: 'Journal entry posted' })
        setJeDescription(''); setJeAmount(''); setJeVoucher(''); setJeComment(''); setJePaymentAccount('')
        fetchEntries(); fetchAccounts()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch {
      toast({ variant: 'destructive', title: 'Failed to post journal entry' })
    }
  }

  // Submit multiple general journal
  const handleMultipleJournalSubmit = async () => {
    const validLines = mjLines.filter(l => l.debitAccount && l.creditAccount && l.amount)
    if (!validLines.length) return toast({ variant: 'destructive', title: 'Add at least one valid line' })

    try {
      for (const line of validLines) {
        const amount = Number(line.amount)
        await apiFetch('/api/accounting/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: line.date,
            description: line.description,
            lines: [
              { accountId: line.debitAccount, debit: amount, credit: 0 },
              { accountId: line.creditAccount, debit: 0, credit: amount },
            ],
          }),
        })
      }
      toast({ title: `${validLines.length} journal entries posted` })
      setMjLines([{ debitAccount: '', creditAccount: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' }])
      fetchEntries(); fetchAccounts()
    } catch {
      toast({ variant: 'destructive', title: 'Failed to post journal entries' })
    }
  }

  // Tax payment
  const handleSaveTaxPayment = async () => {
    if (!taxForm.amount) return toast({ variant: 'destructive', title: 'Amount required' })
    try {
      const res = await apiFetch('/api/accounting/tax-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxForm),
      })
      if (res.ok) {
        toast({ title: 'Tax payment saved' })
        setShowTaxModal(false)
        setTaxForm({ branch: '', amount: '', currency: 'USD', from: '', to: '', prn: '', paymentMethod: 'cash', dateOfPayment: new Date().toISOString().split('T')[0] })
        fetchTaxPayments()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to save' })
      }
    } catch {
      toast({ variant: 'destructive', title: 'Failed to save tax payment' })
    }
  }

  const formatCurrency = (val: number) => Number(val || 0).toFixed(2)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">Chart of accounts, journal entries, ledger, and tax management</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 sm:grid-cols-5 h-auto w-full">
          <TabsTrigger value="chart-of-accounts" className="text-xs sm:text-base font-medium"><Calculator className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Chart of Accounts</span><span className="sm:hidden">Accounts</span></TabsTrigger>
          <TabsTrigger value="account-categories" className="text-xs sm:text-base font-medium"><BookOpen className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Categories</span><span className="sm:hidden">Cats</span></TabsTrigger>
          <TabsTrigger value="journal-entry" className="text-xs sm:text-base font-medium"><BookOpen className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Register Entries</span><span className="sm:hidden">Entry</span></TabsTrigger>
          <TabsTrigger value="journal-ledger" className="text-xs sm:text-base font-medium"><Scale className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Journal Ledger</span><span className="sm:hidden">Ledger</span></TabsTrigger>
          <TabsTrigger value="tax-management" className="text-xs sm:text-base font-medium"><DollarSign className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Tax Management</span><span className="sm:hidden">Tax</span></TabsTrigger>
        </TabsList>

        {/* ─── Chart of Accounts Tab ─── */}
        <TabsContent value="chart-of-accounts" className="space-y-4">
          <div className="flex justify-end">
            <span ref={dropdownBtnRef} className="inline-block">
              <Button onClick={() => setShowAccountDropdown(!showAccountDropdown)}>
                <Plus className="h-4 w-4 mr-2" /> Add New Account
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} />
              </Button>
            </span>
          </div>

          {showAccountDropdown && dropdownBtnRef.current && createPortal(
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setShowAccountDropdown(false)} />
              <div
                className="fixed z-[101] w-48 rounded-md border bg-popover p-1 shadow-lg"
                style={{
                  top: dropdownBtnRef.current.getBoundingClientRect().bottom + 8,
                  right: window.innerWidth - dropdownBtnRef.current.getBoundingClientRect().right
                }}
              >
                {ACCOUNT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setAccType(t.value)
                      setAccCode(''); setAccName(''); setAccSubType(''); setAccDescription(''); setAccParentId(''); setBranchSearch('')
                      setShowAccountDropdown(false)
                      setShowAccountModal(true)
                    }}
                    className="flex items-center w-full px-3 py-2.5 text-sm rounded-md hover:bg-muted transition-colors text-left"
                  >
                    <Badge className={`${accountTypeColor[t.value] || 'bg-gray-100'} mr-2`}>{t.label}</Badge>
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}

          <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create SubAccount {ACCOUNT_TYPES.find(t => t.value === accType)?.label || ''}</DialogTitle>
                <DialogDescription>Create a new sub-account under {ACCOUNT_TYPES.find(t => t.value === accType)?.label.toLowerCase() || 'the selected type'}.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Account Name</Label>
                    <Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. Office Supplies" />
                  </div>
                  <div>
                    <Label>Branch</Label>
                    {hasPermission('canViewBranch') ? (
                      <Select value={accBranch} onValueChange={setAccBranch}>
                        <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                        <SelectContent>
                          <div className="p-2">
                            <Input
                              value={branchSearch}
                              onChange={(e) => setBranchSearch(e.target.value)}
                              placeholder="Search branch..."
                              className="h-8"
                            />
                          </div>
                          {branches.filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase())).map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center h-9 rounded-md border border-input bg-muted/50 px-3 text-sm font-medium">
                        {branches.find(b => b.id === accBranch)?.name || 'Default branch'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Parent Account</Label>
                    <Select value={accParentId} onValueChange={setAccParentId}>
                      <SelectTrigger><SelectValue placeholder="Top-level account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Top-level account</SelectItem>
                        {parentAccountOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Account Category</Label>
                    <Select value={accCategory} onValueChange={setAccCategory}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {(ACCOUNT_CATEGORIES[accType] || []).map(cat => (
                          <SelectItem key={cat.code} value={cat.code}>{cat.code} - {cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Currency</Label>
                    <Select value={accCurrency} onValueChange={setAccCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <textarea
                    value={accDescription}
                    onChange={(e) => setAccDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAccountModal(false)}>Close</Button>
                <Button onClick={handleCreateAccount}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Account type groups with sub-accounts nested under parents */}
          {ACCOUNT_TYPES.map(typeDef => {
            const typeAccounts = accounts.filter(a => a.type === typeDef.value || (typeDef.value === 'income' && a.type === 'revenue') || (typeDef.value === 'expenses' && a.type === 'expense'))
            if (!typeAccounts.length) return null
            const rootAccounts = typeAccounts.filter(a => !a.parentId)
            return (
              <div key={typeDef.value} className="space-y-2">
                <div className="flex items-center gap-2 py-2">
                  <Badge className={accountTypeColor[typeDef.value] || 'bg-gray-100'}>{typeDef.label}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">{rootAccounts.length} parent accounts</span>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 px-3 font-semibold">Name</th>
                        <th className="text-left py-2 px-3 font-semibold">Code</th>
                        <th className="text-left py-2 px-3 font-semibold">Branch</th>
                        <th className="text-right py-2 px-3 font-semibold">Balance</th>
                        <th className="text-left py-2 px-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rootAccounts
                        .sort((a, b) => parseInt(a.code) - parseInt(b.code))
                        .map(acc => {
                          const childAccounts = (acc.children || []).sort((a, b) => parseInt(a.code) - parseInt(b.code))
                          const isExpanded = expandedAccounts.has(acc.id)
                          return (
                            <React.Fragment key={acc.id}>
                              <tr className="border-b hover:bg-muted/50">
                                <td className="py-2 px-3 font-medium">
                                  {childAccounts.length > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedAccounts(prev => {
                                          const next = new Set(prev)
                                          if (next.has(acc.id)) next.delete(acc.id)
                                          else next.add(acc.id)
                                          return next
                                        })
                                      }}
                                      className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-muted/70 text-muted-foreground transition hover:bg-muted"
                                    >
                                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                  ) : <span className="inline-block h-6 w-6" />}
                                  {acc.name}
                                  {acc.subType && <Badge variant="outline" className="ml-2">{acc.subType}</Badge>}
                                  {!acc.isActive && <Badge variant="secondary" className="ml-2">Inactive</Badge>}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold">{acc.code}</td>
                                <td className="py-2 px-3">{acc.branch?.name || '—'}</td>
                                <td className="py-2 px-3 text-right font-mono">{formatCurrency(acc.balance)}</td>
                                <td className="py-2 px-3">
                                  <Button size="sm" variant="ghost" onClick={() => handleDeleteAccount(acc.id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </td>
                              </tr>
                              {isExpanded && childAccounts.map(child => (
                                <tr key={child.id} className="border-b bg-muted/20">
                                  <td className="py-2 px-3 pl-12 font-medium text-muted-foreground">
                                    └ {child.name}
                                    {child.subType && <Badge variant="outline" className="ml-2">{child.subType}</Badge>}
                                    {!child.isActive && <Badge variant="secondary" className="ml-2">Inactive</Badge>}
                                  </td>
                                  <td className="py-2 px-3 font-mono font-bold">{child.code}</td>
                                  <td className="py-2 px-3">{child.branch?.name || '—'}</td>
                                  <td className="py-2 px-3 text-right font-mono">{formatCurrency(child.balance)}</td>
                                  <td className="py-2 px-3">
                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteAccount(child.id)}>
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {accounts.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">No accounts yet. Create your first account.</div>
          )}
        </TabsContent>

        {/* ─── Account Categories Tab ─── */}
        <TabsContent value="account-categories" className="space-y-4">
          {ACCOUNT_TYPES.map(typeDef => {
            const categories = ACCOUNT_CATEGORIES[typeDef.value] || []
            if (!categories.length) return null
            return (
              <div key={typeDef.value} className="space-y-2">
                <div className="flex items-center gap-2 py-2">
                  <Badge className={accountTypeColor[typeDef.value] || 'bg-gray-100'}>{typeDef.label}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">{categories.length} categories</span>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 px-3 font-semibold">Name</th>
                        <th className="text-left py-2 px-3 font-semibold">Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map(cat => (
                        <tr key={cat.code} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">{cat.name}</td>
                          <td className="py-2 px-3 font-mono font-bold">{cat.code}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </TabsContent>

        {/* ─── Register Journal Ledger Entries Tab ─── */}
        <TabsContent value="journal-entry" className="space-y-4">
          {/* Sub-tabs to toggle between single and multiple journal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-b pb-2">
            <button
              onClick={() => setJeSubForm('single')}
              className={`px-4 py-3 text-sm sm:text-base font-medium rounded-md transition-colors ${jeSubForm === 'single' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              Journal Ledger Entry
            </button>
            <button
              onClick={() => setJeSubForm('multiple')}
              className={`px-4 py-3 text-sm sm:text-base font-medium rounded-md transition-colors ${jeSubForm === 'multiple' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              Multiple General Journal
            </button>
          </div>

          {/* Single Journal Ledger Entry Form */}
          {jeSubForm === 'single' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Branch</Label>
                  <Select value={jeBranch} onValueChange={setJeBranch}>
                    <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Action</Label>
                  <Select value={jeAction} onValueChange={setJeAction}>
                    <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
                    <SelectContent>
                      {JOURNAL_ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Record Date</Label>
                  <Input type="date" value={jeDate} onChange={(e) => setJeDate(e.target.value)} />
                </div>
                <div>
                  <Label>Entry Description</Label>
                  <Input value={jeDescription} onChange={(e) => setJeDescription(e.target.value)} placeholder="Description" />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={jeCurrency} onValueChange={setJeCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Account</Label>
                  <Select value={jeAccount} onValueChange={setJeAccount}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accountOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Entry Amount</Label>
                  <Input type="number" value={jeAmount} onChange={(e) => setJeAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label>Voucher Number</Label>
                  <Input value={jeVoucher} onChange={(e) => setJeVoucher(e.target.value)} placeholder="Voucher #" />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={jePaymentMethod} onValueChange={(v) => { setJePaymentMethod(v); setJePaymentAccount('') }}>
                    <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {jePaymentMethod && (
                <div>
                  <Label>{PAYMENT_METHOD_LABELS[jePaymentMethod] || 'Select Account'}</Label>
                  <Select value={jePaymentAccount} onValueChange={setJePaymentAccount}>
                    <SelectTrigger><SelectValue placeholder={`Select ${PAYMENT_METHOD_LABELS[jePaymentMethod] || 'account'}`} /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter(a => {
                        if (jePaymentMethod === 'cash') return a.type === 'asset' && (a.subType?.toLowerCase().includes('cash') || a.name?.toLowerCase().includes('cash'))
                        if (jePaymentMethod === 'cheque') return a.type === 'asset' && (a.subType?.toLowerCase().includes('bank') || a.name?.toLowerCase().includes('bank'))
                        if (jePaymentMethod === 'mobile_money') return a.type === 'asset' && (a.subType?.toLowerCase().includes('mobile') || a.name?.toLowerCase().includes('mobile'))
                        return true
                      }).map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Comment</Label>
                <textarea
                  value={jeComment}
                  onChange={(e) => setJeComment(e.target.value)}
                  placeholder="Additional comments"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSingleJournalSubmit}>Save</Button>
              </div>
            </div>
          )}

          {/* Multiple General Journal Form */}
          {jeSubForm === 'multiple' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setMjLines([...mjLines, { debitAccount: '', creditAccount: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' }])}>
                  <Plus className="h-3 w-3 mr-1" /> Add Line
                </Button>
              </div>
              {/* Heading row */}
              <div className="hidden md:grid grid-cols-1 md:grid-cols-5 gap-3 px-3 pb-2 border-b font-semibold text-sm">
                <div>Debit Account (DR)</div>
                <div>Credit Account (CR)</div>
                <div>Amount</div>
                <div>Date</div>
                <div>Description</div>
              </div>
              {/* Field rows */}
              {mjLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center rounded-lg border p-3">
                  <div>
                    <Select value={line.debitAccount} onValueChange={(v) => {
                      const updated = [...mjLines]; updated[idx].debitAccount = v; setMjLines(updated)
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select DR account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Select value={line.creditAccount} onValueChange={(v) => {
                      const updated = [...mjLines]; updated[idx].creditAccount = v; setMjLines(updated)
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select CR account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Input type="number" value={line.amount} onChange={(e) => {
                      const updated = [...mjLines]; updated[idx].amount = e.target.value; setMjLines(updated)
                    }} placeholder="0.00" />
                  </div>
                  <div>
                    <Input type="date" value={line.date} onChange={(e) => {
                      const updated = [...mjLines]; updated[idx].date = e.target.value; setMjLines(updated)
                    }} />
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input className="flex-1" value={line.description} onChange={(e) => {
                      const updated = [...mjLines]; updated[idx].description = e.target.value; setMjLines(updated)
                    }} placeholder="Description" />
                    {mjLines.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => setMjLines(mjLines.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <Button onClick={handleMultipleJournalSubmit}>Submit</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Journal Ledger Tab ─── */}
        <TabsContent value="journal-ledger" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              {/* Toolbar: search left, page size, filters button */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search entries..."
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
                    <Filter className="h-4 w-4 mr-2" /> Filters
                  </Button>
                </div>
              </div>

              {/* Filters panel */}
              {showFilters && (
                <div className="rounded-lg border p-4 mb-4 space-y-4 bg-muted/30">
                  <h3 className="font-medium">Filters</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Branch</Label>
                      <Select value={filters.branch} onValueChange={(v) => setFilters({ ...filters, branch: v })}>
                        <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                        <SelectContent>
                          {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Affected Account</Label>
                      <Select value={filters.account} onValueChange={(v) => setFilters({ ...filters, account: v })}>
                        <SelectTrigger><SelectValue placeholder="All accounts" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Start Date</Label>
                      <Input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
                    </div>
                    <div>
                      <Label>Category</Label>
                      <Select value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}>
                        <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                        <SelectContent>
                          {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Currency</Label>
                      <Select value={filters.currency} onValueChange={(v) => setFilters({ ...filters, currency: v })}>
                        <SelectTrigger><SelectValue placeholder="All currencies" /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={resetFilters}>Reset All</Button>
                    <Button onClick={() => setShowFilters(false)}>Apply</Button>
                  </div>
                </div>
              )}

              {/* Journal Ledger Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">Date</th>
                      <th className="text-left py-2 px-2 font-medium">Description</th>
                      <th className="text-left py-2 px-2 font-medium">Branch</th>
                      <th className="text-left py-2 px-2 font-medium">Affected Account</th>
                      <th className="text-left py-2 px-2 font-medium">Reference</th>
                      <th className="text-left py-2 px-2 font-medium">Payment Method</th>
                      <th className="text-right py-2 px-2 font-medium">Debit</th>
                      <th className="text-right py-2 px-2 font-medium">Credit</th>
                      <th className="text-left py-2 px-2 font-medium">Authorised By</th>
                      <th className="text-left py-2 px-2 font-medium">System Date</th>
                      <th className="text-left py-2 px-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFiltered.map((entry) => (
                      entry.lines?.map((line, lineIdx) => (
                        <tr key={`${entry.id}-${lineIdx}`} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</td>
                          <td className="py-2 px-2">{line.description || entry.description || '—'}</td>
                          <td className="py-2 px-2">{entry.branch?.name || '—'}</td>
                          <td className="py-2 px-2">{line.account ? `${line.account.code} - ${line.account.name}` : '—'}</td>
                          <td className="py-2 px-2">{entry.reference || entry.voucherNo || '—'}</td>
                          <td className="py-2 px-2">{entry.paymentMethod || '—'}</td>
                          <td className="py-2 px-2 text-right font-mono">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                          <td className="py-2 px-2 text-right font-mono">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                          <td className="py-2 px-2">{entry.user ? `${entry.user.fname} ${entry.user.lname}` : '—'}</td>
                          <td className="py-2 px-2 whitespace-nowrap">{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '—'}</td>
                          <td className="py-2 px-2">
                            <Button size="sm" variant="ghost" onClick={() => toast({ title: `Entry ${entry.entryNo}`, description: entry.description })}>
                              View
                            </Button>
                          </td>
                        </tr>
                      ))
                    ))}
                    {filteredEntries.length === 0 && !loading && (
                      <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No journal entries found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredEntries.length / pageSize) || 1}
                totalItems={filteredEntries.length}
                pageSize={pageSize}
                onPageChange={goToPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tax Management Tab ─── */}
        <TabsContent value="tax-management" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showTaxModal} onOpenChange={setShowTaxModal}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add New Tax Payment</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Tax Payment</DialogTitle><DialogDescription>Record a new tax payment for this branch.</DialogDescription></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Branch</Label>
                      <Select value={taxForm.branch} onValueChange={(v) => setTaxForm({ ...taxForm, branch: v })}>
                        <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                        <SelectContent>
                          {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Amount</Label>
                      <Input type="number" value={taxForm.amount} onChange={(e) => setTaxForm({ ...taxForm, amount: e.target.value })} placeholder="0.00" />
                    </div>
                    <div>
                      <Label>Currency</Label>
                      <Select value={taxForm.currency} onValueChange={(v) => setTaxForm({ ...taxForm, currency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>From</Label>
                      <Input type="date" value={taxForm.from} onChange={(e) => setTaxForm({ ...taxForm, from: e.target.value })} />
                    </div>
                    <div>
                      <Label>To</Label>
                      <Input type="date" value={taxForm.to} onChange={(e) => setTaxForm({ ...taxForm, to: e.target.value })} />
                    </div>
                    <div>
                      <Label>PRN</Label>
                      <Input value={taxForm.prn} onChange={(e) => setTaxForm({ ...taxForm, prn: e.target.value })} placeholder="PRN number" />
                    </div>
                    <div>
                      <Label>Payment Method</Label>
                      <Select value={taxForm.paymentMethod} onValueChange={(v) => setTaxForm({ ...taxForm, paymentMethod: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Date of Payment</Label>
                      <Input type="date" value={taxForm.dateOfPayment} onChange={(e) => setTaxForm({ ...taxForm, dateOfPayment: e.target.value })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowTaxModal(false)}>Close</Button>
                  <Button onClick={handleSaveTaxPayment}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader><CardTitle>Tax Payments</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">Date</th>
                      <th className="text-left py-2 px-2 font-medium">Branch</th>
                      <th className="text-right py-2 px-2 font-medium">Amount</th>
                      <th className="text-left py-2 px-2 font-medium">Currency</th>
                      <th className="text-left py-2 px-2 font-medium">Period</th>
                      <th className="text-left py-2 px-2 font-medium">PRN</th>
                      <th className="text-left py-2 px-2 font-medium">Payment Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxPayments.map((tp, i) => (
                      <tr key={tp.id || i} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2">{new Date(tp.dateOfPayment || tp.date).toLocaleDateString()}</td>
                        <td className="py-2 px-2">{tp.branch?.name || '—'}</td>
                        <td className="py-2 px-2 text-right font-mono">{formatCurrency(tp.amount)}</td>
                        <td className="py-2 px-2">{tp.currency || '—'}</td>
                        <td className="py-2 px-2">{tp.from ? new Date(tp.from).toLocaleDateString() : '—'} - {tp.to ? new Date(tp.to).toLocaleDateString() : '—'}</td>
                        <td className="py-2 px-2">{tp.prn || '—'}</td>
                        <td className="py-2 px-2">{tp.paymentMethod || '—'}</td>
                      </tr>
                    ))}
                    {taxPayments.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No tax payments recorded</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
