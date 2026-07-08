import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalCashAccounts, getLocalBranches } from '@/db/hybrid'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Wallet, Landmark, Shield, Smartphone, Plus, Edit } from 'lucide-react'

interface CashAccount {
  id: string
  name: string
  type: string
  balance: number
  currency?: string
  branchId?: string
  branch?: { id: string; name: string }
  accountNumber?: string
  bankName?: string
  phoneNumber?: string
  isActive: boolean
  assignedStaffId?: string | null
  assignedStaff?: { id: string; name: string } | null
  depletionAlertThreshold?: number | null
  network?: string
  mobileMoneyName?: string
}

interface Branch {
  id: string
  name: string
}

interface StaffMember {
  id: string
  name: string
  fname?: string
  lname?: string
  role: string
  isActive: boolean
  branchId?: string | null
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank Account',
  cash: 'Cash Account',
  safe: 'Safe Account',
  mobile_money: 'Mobile Money Account',
}

const CURRENCIES = ['USD', 'KES', 'UGX', 'TZS', 'RWF', 'NGN', 'GHS', 'ZAR']

const MOBILE_NETWORKS = ['MTN', 'Airtel', 'MPS', 'Halopesa', 'Tigo Pesa', 'Zamtel']

export default function TransactionAccountsPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const { user, hasPermission } = useJWTAuth()
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('bank')
  const [showModal, setShowModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<CashAccount | null>(null)

  const [form, setForm] = useState({
    name: '',
    type: 'bank',
    accountNumber: '',
    bankName: '',
    phoneNumber: '',
    mobileMoneyName: '',
    network: '',
    balance: '0',
    currency: 'USD',
    branchId: '',
    assignedStaffId: '',
    depletionAlertThreshold: '',
  })

  const fetchAccounts = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/cash-accounts')
        if (res.ok) setAccounts(await res.json())
      } else {
        setAccounts(await getLocalCashAccounts())
      }
    } catch {
      try { setAccounts(await getLocalCashAccounts()) } catch {}
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

  const fetchStaff = async () => {
    try {
      const res = await apiFetch('/api/staff')
      if (res.ok) {
        const data = await res.json()
        setStaff(data.staff || data || [])
      }
    } catch {}
  }

  useEffect(() => {
    fetchAccounts()
    fetchBranches()
    fetchStaff()
    apiFetch('/api/settings').then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        if (data.currency) setForm(f => ({ ...f, currency: data.currency }))
      }
    }).catch(() => {})
    if (user?.branchId && !hasPermission('canViewBranch')) {
      setForm(f => ({ ...f, branchId: user.branchId! }))
    }
  }, [])

  const bankAccounts = accounts.filter(a => a.type === 'bank')
  const cashAccounts = accounts.filter(a => a.type === 'cash')
  const safeAccounts = accounts.filter(a => a.type === 'safe')
  const mobileMoneyAccounts = accounts.filter(a => a.type === 'mobile_money')

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const totalBank = bankAccounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const totalCash = cashAccounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const totalSafe = safeAccounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const totalMobileMoney = mobileMoneyAccounts.reduce((s, a) => s + Number(a.balance || 0), 0)

  const fmt = (val: number) => Number(val || 0).toFixed(2)

  const fmtCompact = (val: number, currency = 'UGX') => {
    const num = Number(val || 0)
    const abs = Math.abs(num)
    let compact: string
    if (abs >= 1e9) compact = (num / 1e9).toFixed(2) + 'B'
    else if (abs >= 1e6) compact = (num / 1e6).toFixed(2) + 'M'
    else if (abs >= 1e3) compact = (num / 1e3).toFixed(2) + 'K'
    else compact = num.toFixed(2)
    return `${currency} ${compact}`
  }

  const fmtFull = (val: number, currency = 'UGX') => {
    return `${currency} ${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handleSave = async () => {
    if (!form.currency) return toast({ variant: 'destructive', title: 'Currency required' })
    if (!form.branchId) return toast({ variant: 'destructive', title: 'Branch required' })
    if (form.type === 'bank') {
      if (!form.bankName) return toast({ variant: 'destructive', title: 'Bank name required' })
      if (!form.name) return toast({ variant: 'destructive', title: 'Account name required' })
      if (!form.accountNumber) return toast({ variant: 'destructive', title: 'Account number required' })
    }
    if (form.type === 'safe' || form.type === 'cash') {
      if (!form.name) return toast({ variant: 'destructive', title: 'Account name required' })
    }
    if (form.type === 'mobile_money') {
      if (!form.name) return toast({ variant: 'destructive', title: 'Account name required' })
      if (!form.mobileMoneyName) return toast({ variant: 'destructive', title: 'Mobile money name required' })
      if (!form.phoneNumber) return toast({ variant: 'destructive', title: 'Mobile money number required' })
      if (!form.network) return toast({ variant: 'destructive', title: 'Network required' })
    }
    try {
      const payload: any = {
        name: form.name,
        type: form.type,
        balance: Number(form.balance) || 0,
        currency: form.currency,
        branchId: form.branchId || undefined,
      }
      if (form.type === 'bank') {
        payload.bankName = form.bankName
        payload.accountNumber = form.accountNumber
      }
      if (form.type === 'mobile_money') {
        payload.mobileMoneyName = form.mobileMoneyName
        payload.phoneNumber = form.phoneNumber
        payload.network = form.network
      }
      if (form.type === 'cash') {
        payload.assignedStaffId = form.assignedStaffId || undefined
        payload.depletionAlertThreshold = form.depletionAlertThreshold ? Number(form.depletionAlertThreshold) : undefined
      }

      const url = editingAccount ? `/api/cash-accounts/${editingAccount.id}` : '/api/cash-accounts'
      const method = editingAccount ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast({ title: editingAccount ? 'Account updated' : 'Account created' })
        setShowModal(false)
        setEditingAccount(null)
        setForm({ name: '', type: form.type, accountNumber: '', bankName: '', phoneNumber: '', mobileMoneyName: '', network: '', balance: '0', currency: form.currency, branchId: user?.branchId && !hasPermission('canViewBranch') ? user.branchId : '', assignedStaffId: '', depletionAlertThreshold: '' })
        fetchAccounts()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to save' })
      }
    } catch {
      toast({ variant: 'destructive', title: 'Failed to save account' })
    }
  }

  const openEdit = (account: CashAccount) => {
    setEditingAccount(account)
    setForm({
      name: account.name,
      type: account.type,
      accountNumber: account.accountNumber || '',
      bankName: account.bankName || '',
      phoneNumber: account.phoneNumber || '',
      mobileMoneyName: account.mobileMoneyName || '',
      network: account.network || '',
      balance: String(account.balance || 0),
      currency: account.currency || 'USD',
      branchId: account.branchId || '',
      assignedStaffId: account.assignedStaffId || '',
      depletionAlertThreshold: account.depletionAlertThreshold != null ? String(account.depletionAlertThreshold) : '',
    })
    setShowModal(true)
  }

  const openCreate = (type: string) => {
    setEditingAccount(null)
    setForm({ name: '', type, accountNumber: '', bankName: '', phoneNumber: '', mobileMoneyName: '', network: '', balance: '0', currency: form.currency, branchId: user?.branchId && !hasPermission('canViewBranch') ? user.branchId : '', assignedStaffId: '', depletionAlertThreshold: '' })
    setShowModal(true)
  }

  const renderAccountTable = (list: CashAccount[], type: string) => (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => openCreate(type)}><Plus className="h-4 w-4 mr-2" /> Add {ACCOUNT_TYPE_LABELS[type]}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-2 font-medium">Name</th>
              <th className="text-left py-2 px-2 font-medium">Branch</th>
              <th className="text-left py-2 px-2 font-medium">Staff</th>
              {type === 'bank' && <th className="text-left py-2 px-2 font-medium">Bank / Account #</th>}
              {type === 'mobile_money' && <th className="text-left py-2 px-2 font-medium">Network / Phone</th>}
              <th className="text-left py-2 px-2 font-medium">Currency</th>
              <th className="text-right py-2 px-2 font-medium">Balance</th>
              <th className="text-left py-2 px-2 font-medium">Status</th>
              <th className="text-left py-2 px-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(acc => (
              <tr key={acc.id} className="border-b hover:bg-muted/50">
                <td className="py-2 px-2 font-medium">{acc.name}</td>
                <td className="py-2 px-2">{acc.branch?.name || '—'}</td>
                <td className="py-2 px-2">{acc.assignedStaff?.name || '—'}</td>
                {type === 'bank' && <td className="py-2 px-2">{acc.bankName ? `${acc.bankName} / ${acc.accountNumber || '—'}` : acc.accountNumber || '—'}</td>}
                {type === 'mobile_money' && <td className="py-2 px-2">{acc.network ? `${acc.network} / ` : ''}{acc.phoneNumber || '—'}</td>}
                <td className="py-2 px-2">{acc.currency || '—'}</td>
                <td className="py-2 px-2 text-right font-mono">{fmt(acc.balance)}</td>
                <td className="py-2 px-2"><Badge variant={acc.isActive ? 'default' : 'secondary'}>{acc.isActive ? 'Active' : 'Inactive'}</Badge></td>
                <td className="py-2 px-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(acc)}><Edit className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {list.length === 0 && !loading && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No {ACCOUNT_TYPE_LABELS[type].toLowerCase()}s found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const businessCurrency = form.currency || 'UGX'

  const summaryItems = [
    { label: 'Total Balance', value: totalBalance, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Cash Accounts Balance', value: totalCash, icon: Wallet, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Total Bank Accounts Balance', value: totalBank, icon: Landmark, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Total Safe Accounts Balance', value: totalSafe, icon: Shield, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Total Mobile Money Accounts Balance', value: totalMobileMoney, icon: Smartphone, color: 'text-pink-600', bg: 'bg-pink-50' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transaction Accounts</h1>
        <p className="text-muted-foreground">Manage bank, cash, safe, and mobile money accounts</p>
      </div>

      {/* Summary section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Summary</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                {summaryItems.map((item, idx) => (
                  <td
                    key={item.label}
                    className={`py-4 px-4 ${idx < summaryItems.length - 1 ? 'border-r' : ''} ${item.bg}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                      <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                    </div>
                    <div
                      className={`text-lg font-bold ${item.color} cursor-help`}
                      title={`${item.label} : ${fmtFull(item.value, businessCurrency)}`}
                    >
                      {fmtCompact(item.value, businessCurrency)}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Account type tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto w-full">
          <TabsTrigger value="bank" className="text-xs sm:text-base font-medium"><Landmark className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Bank Accounts</span><span className="sm:hidden">Bank</span></TabsTrigger>
          <TabsTrigger value="cash" className="text-xs sm:text-base font-medium"><Wallet className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Cash Accounts</span><span className="sm:hidden">Cash</span></TabsTrigger>
          <TabsTrigger value="safe" className="text-xs sm:text-base font-medium"><Shield className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Safe Accounts</span><span className="sm:hidden">Safe</span></TabsTrigger>
          <TabsTrigger value="mobile_money" className="text-xs sm:text-base font-medium"><Smartphone className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" /><span className="hidden sm:inline">Mobile Money</span><span className="sm:hidden">Mobile</span></TabsTrigger>
        </TabsList>

        <TabsContent value="bank" className="space-y-4">
          <Card><CardContent className="p-4">{renderAccountTable(bankAccounts, 'bank')}</CardContent></Card>
        </TabsContent>
        <TabsContent value="cash" className="space-y-4">
          <Card><CardContent className="p-4">{renderAccountTable(cashAccounts, 'cash')}</CardContent></Card>
        </TabsContent>
        <TabsContent value="safe" className="space-y-4">
          <Card><CardContent className="p-4">{renderAccountTable(safeAccounts, 'safe')}</CardContent></Card>
        </TabsContent>
        <TabsContent value="mobile_money" className="space-y-4">
          <Card><CardContent className="p-4">{renderAccountTable(mobileMoneyAccounts, 'mobile_money')}</CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Account Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAccount ? `Edit ${ACCOUNT_TYPE_LABELS[form.type] || 'Account'}` : `Create ${ACCOUNT_TYPE_LABELS[form.type] || 'Account'}`}</DialogTitle>
            <DialogDescription>{editingAccount ? 'Update account details.' : `Create a new ${ACCOUNT_TYPE_LABELS[form.type]?.toLowerCase() || 'transaction account'}.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Bank Account Form */}
            {form.type === 'bank' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Bank Name <span className="text-red-500">*</span></Label>
                  <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name" />
                </div>
                <div>
                  <Label>Account Name <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Account name" />
                </div>
                <div>
                  <Label>Account Number <span className="text-red-500">*</span></Label>
                  <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="Account number" />
                </div>
                <div>
                  <Label>Branch <span className="text-red-500">*</span></Label>
                  {hasPermission('canViewBranch') ? (
                    <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center h-9 rounded-md border border-input bg-muted/50 px-3 text-sm font-medium">
                      {branches.find(b => b.id === form.branchId)?.name || 'Default branch'}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Currency <span className="text-red-500">*</span></Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Safe Account Form */}
            {form.type === 'safe' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Name <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Safe account name" />
                </div>
                <div>
                  <Label>Branch <span className="text-red-500">*</span></Label>
                  {hasPermission('canViewBranch') ? (
                    <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center h-9 rounded-md border border-input bg-muted/50 px-3 text-sm font-medium">
                      {branches.find(b => b.id === form.branchId)?.name || 'Default branch'}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Currency <span className="text-red-500">*</span></Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Cash Account Form */}
            {form.type === 'cash' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Account Name <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cash account name" />
                </div>
                <div>
                  <Label>Assign Account to Staff <span className="text-red-500">*</span></Label>
                  <Select value={form.assignedStaffId} onValueChange={(v) => setForm({ ...form, assignedStaffId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {staff.filter(s => s.isActive).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Set Depletion Alert Threshold (optional)</Label>
                  <Input type="number" value={form.depletionAlertThreshold} onChange={(e) => setForm({ ...form, depletionAlertThreshold: e.target.value })} placeholder="e.g. 1000" />
                </div>
                <div>
                  <Label>Branch <span className="text-red-500">*</span></Label>
                  {hasPermission('canViewBranch') ? (
                    <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center h-9 rounded-md border border-input bg-muted/50 px-3 text-sm font-medium">
                      {branches.find(b => b.id === form.branchId)?.name || 'Default branch'}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Currency <span className="text-red-500">*</span></Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Mobile Money Account Form */}
            {form.type === 'mobile_money' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Account Name <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Account name" />
                </div>
                <div>
                  <Label>Mobile Money Name <span className="text-red-500">*</span></Label>
                  <Input value={form.mobileMoneyName} onChange={(e) => setForm({ ...form, mobileMoneyName: e.target.value })} placeholder="Mobile money name" />
                </div>
                <div>
                  <Label>Mobile Money Number <span className="text-red-500">*</span></Label>
                  <Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+256..." />
                </div>
                <div>
                  <Label>Network <span className="text-red-500">*</span></Label>
                  <Select value={form.network} onValueChange={(v) => setForm({ ...form, network: v })}>
                    <SelectTrigger><SelectValue placeholder="Select network" /></SelectTrigger>
                    <SelectContent>
                      {MOBILE_NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Branch <span className="text-red-500">*</span></Label>
                  {hasPermission('canViewBranch') ? (
                    <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center h-9 rounded-md border border-input bg-muted/50 px-3 text-sm font-medium">
                      {branches.find(b => b.id === form.branchId)?.name || 'Default branch'}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Currency <span className="text-red-500">*</span></Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Close</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
