import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Calculator, Plus, BookOpen, FileText, TrendingUp, Scale, Search, Filter, Trash2, DollarSign, Wallet, Landmark, Smartphone, Shield } from 'lucide-react'
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
  description?: string
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

const PAYMENT_METHODS = ['cash', 'bank', 'mobile_money', 'cheque', 'card']
const CURRENCIES = ['USD', 'KES', 'UGX', 'TZS', 'RWF', 'NGN', 'GHS', 'ZAR']
const ACTIONS = ['create', 'update', 'reverse', 'adjust', 'transfer']

const accountTypeColor: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800',
  liability: 'bg-red-100 text-red-800',
  equity: 'bg-purple-100 text-purple-800',
  income: 'bg-green-100 text-green-800',
  revenue: 'bg-green-100 text-green-800',
  expenses: 'bg-orange-100 text-orange-800',
  expense: 'bg-orange-100 text-orange-800',
}

export default function AccountingPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('chart-of-accounts')

  // Account modal
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [accCode, setAccCode] = useState('')
  const [accName, setAccName] = useState('')
  const [accType, setAccType] = useState('asset')
  const [accSubType, setAccSubType] = useState('')
  const [accDescription, setAccDescription] = useState('')

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
  const [jeComment, setJeComment] = useState('')

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
        if (res.ok) setBranches(await res.json())
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

  useEffect(() => {
    fetchAccounts()
    fetchEntries()
    fetchBranches()
  }, [])

  useEffect(() => {
    if (activeTab === 'tax-management') fetchTaxPayments()
  }, [activeTab])

  const handleCreateAccount = async () => {
    if (!accCode || !accName) return toast({ variant: 'destructive', title: 'Code and name required' })
    try {
      const res = await apiFetch('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accCode, name: accName, type: accType, subType: accSubType || undefined, description: accDescription || undefined }),
      })
      if (res.ok) {
        toast({ title: 'Account created' })
        setShowAccountModal(false)
        setAccCode(''); setAccName(''); setAccSubType(''); setAccDescription('')
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
        setJeDescription(''); setJeAmount(''); setJeVoucher(''); setJeComment('')
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
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="chart-of-accounts"><Calculator className="h-4 w-4 mr-1" /> Chart of Accounts</TabsTrigger>
          <TabsTrigger value="account-categories"><FileText className="h-4 w-4 mr-1" /> Account Categories</TabsTrigger>
          <TabsTrigger value="journal-entry"><BookOpen className="h-4 w-4 mr-1" /> Register Entries</TabsTrigger>
          <TabsTrigger value="journal-ledger"><Scale className="h-4 w-4 mr-1" /> Journal Ledger</TabsTrigger>
          <TabsTrigger value="tax-management"><DollarSign className="h-4 w-4 mr-1" /> Tax Management</TabsTrigger>
        </TabsList>

        {/* ─── Chart of Accounts Tab ─── */}
        <TabsContent value="chart-of-accounts" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Account</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Account</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Code</Label><Input value={accCode} onChange={(e) => setAccCode(e.target.value)} placeholder="e.g. 1000" /></div>
                    <div><Label>Name</Label><Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. Cash" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Type</Label>
                      <Select value={accType} onValueChange={setAccType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Sub-type (optional)</Label><Input value={accSubType} onChange={(e) => setAccSubType(e.target.value)} placeholder="e.g. current_asset" /></div>
                  </div>
                  <div><Label>Description (optional)</Label><Input value={accDescription} onChange={(e) => setAccDescription(e.target.value)} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAccountModal(false)}>Cancel</Button>
                  <Button onClick={handleCreateAccount}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Account type groups */}
          {ACCOUNT_TYPES.map(typeDef => {
            const typeAccounts = accounts.filter(a => a.type === typeDef.value || (typeDef.value === 'income' && a.type === 'revenue') || (typeDef.value === 'expenses' && a.type === 'expense'))
            if (!typeAccounts.length) return null
            return (
              <Card key={typeDef.value}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge className={accountTypeColor[typeDef.value] || 'bg-gray-100'}>{typeDef.label}</Badge>
                    <span className="text-sm font-normal text-muted-foreground">{typeAccounts.length} accounts</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {typeAccounts.map(acc => (
                      <div key={acc.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm">{acc.code}</span>
                          <span className="font-medium">{acc.name}</span>
                          {acc.subType && <Badge variant="outline">{acc.subType}</Badge>}
                          {!acc.isActive && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">{formatCurrency(acc.balance)}</span>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteAccount(acc.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {accounts.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">No accounts yet. Create your first account.</div>
          )}
        </TabsContent>

        {/* ─── Account Categories Tab ─── */}
        <TabsContent value="account-categories" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Account Categories</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Name</th>
                    <th className="text-left py-3 px-2 font-medium">Code</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <Badge className={accountTypeColor[acc.type] || 'bg-gray-100'}>{acc.type}</Badge>
                          <span className="font-medium">{acc.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono">{acc.code}</td>
                    </tr>
                  ))}
                  {accounts.length === 0 && !loading && (
                    <tr><td colSpan={2} className="text-center py-8 text-muted-foreground">No accounts found</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Register Journal Ledger Entries Tab ─── */}
        <TabsContent value="journal-entry" className="space-y-6">
          {/* Single Journal Ledger Entry Form */}
          <Card>
            <CardHeader><CardTitle>Journal Ledger Entry</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Record Date</Label>
                  <Input type="date" value={jeDate} onChange={(e) => setJeDate(e.target.value)} />
                </div>
                <div>
                  <Label>Journal Account</Label>
                  <Select value={jeAccount} onValueChange={setJeAccount}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Entry Description</Label>
                  <Input value={jeDescription} onChange={(e) => setJeDescription(e.target.value)} placeholder="Description" />
                </div>
                <div>
                  <Label>Entry Amount</Label>
                  <Input type="number" value={jeAmount} onChange={(e) => setJeAmount(e.target.value)} placeholder="0.00" />
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
                  <Label>Voucher Number</Label>
                  <Input value={jeVoucher} onChange={(e) => setJeVoucher(e.target.value)} placeholder="Voucher #" />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={jePaymentMethod} onValueChange={setJePaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Comment</Label>
                <Input value={jeComment} onChange={(e) => setJeComment(e.target.value)} placeholder="Additional comments" />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSingleJournalSubmit}>Submit Entry</Button>
              </div>
            </CardContent>
          </Card>

          {/* Multiple General Journal Form */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Multiple General Journal</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setMjLines([...mjLines, { debitAccount: '', creditAccount: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' }])}>
                  <Plus className="h-3 w-3 mr-1" /> Add Line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {mjLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end rounded-lg border p-3">
                  <div>
                    <Label>Debit Account (DR)</Label>
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
                    <Label>Credit Account (CR)</Label>
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
                    <Label>Amount</Label>
                    <Input type="number" value={line.amount} onChange={(e) => {
                      const updated = [...mjLines]; updated[idx].amount = e.target.value; setMjLines(updated)
                    }} placeholder="0.00" />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={line.date} onChange={(e) => {
                      const updated = [...mjLines]; updated[idx].date = e.target.value; setMjLines(updated)
                    }} />
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label>Description</Label>
                      <Input value={line.description} onChange={(e) => {
                        const updated = [...mjLines]; updated[idx].description = e.target.value; setMjLines(updated)
                      }} placeholder="Description" />
                    </div>
                    {mjLines.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => setMjLines(mjLines.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <Button onClick={handleMultipleJournalSubmit}>Submit All Entries</Button>
              </div>
            </CardContent>
          </Card>
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
                <DialogHeader><DialogTitle>Tax Payment</DialogTitle></DialogHeader>
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
