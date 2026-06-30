import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalCashAccounts, getLocalBranches } from '@/db/hybrid'
import { Wallet, Landmark, Shield, Smartphone, Plus, Edit, AlertCircle } from 'lucide-react'

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
  overdraftLimit?: number
  interestRate?: number
}

interface Branch {
  id: string
  name: string
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank Account',
  cash: 'Cash Account',
  safe: 'Safe Account',
  mobile_money: 'Mobile Money Account',
}

const CURRENCIES = ['USD', 'KES', 'UGX', 'TZS', 'RWF', 'NGN', 'GHS', 'ZAR']

export default function TransactionAccountsPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
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
    balance: '0',
    currency: 'USD',
    branchId: '',
    overdraftLimit: '0',
    interestRate: '0',
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

  useEffect(() => {
    fetchAccounts()
    fetchBranches()
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

  const handleSave = async () => {
    if (!form.name) return toast({ variant: 'destructive', title: 'Account name required' })
    try {
      const payload: any = {
        name: form.name,
        type: form.type,
        balance: Number(form.balance) || 0,
        currency: form.currency,
        branchId: form.branchId || undefined,
      }
      if (form.type === 'bank') { payload.accountNumber = form.accountNumber; payload.bankName = form.bankName }
      if (form.type === 'mobile_money') { payload.phoneNumber = form.phoneNumber }
      if (form.type === 'bank') { payload.overdraftLimit = Number(form.overdraftLimit) || 0; payload.interestRate = Number(form.interestRate) || 0 }

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
        setForm({ name: '', type: 'bank', accountNumber: '', bankName: '', phoneNumber: '', balance: '0', currency: 'USD', branchId: '', overdraftLimit: '0', interestRate: '0' })
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
      balance: String(account.balance || 0),
      currency: account.currency || 'USD',
      branchId: account.branchId || '',
      overdraftLimit: String(account.overdraftLimit || 0),
      interestRate: String(account.interestRate || 0),
    })
    setShowModal(true)
  }

  const openCreate = (type: string) => {
    setEditingAccount(null)
    setForm({ name: '', type, accountNumber: '', bankName: '', phoneNumber: '', balance: '0', currency: 'USD', branchId: '', overdraftLimit: '0', interestRate: '0' })
    setShowModal(true)
  }

  const summaryCards = [
    { label: 'Total Balance', value: totalBalance, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Cash Accounts', value: totalCash, icon: Wallet, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Total Bank Accounts', value: totalBank, icon: Landmark, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Total Safe Accounts', value: totalSafe, icon: Shield, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Total Mobile Money', value: totalMobileMoney, icon: Smartphone, color: 'text-pink-600', bg: 'bg-pink-50' },
  ]

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
              {type === 'bank' && <th className="text-left py-2 px-2 font-medium">Bank / Account #</th>}
              {type === 'mobile_money' && <th className="text-left py-2 px-2 font-medium">Phone Number</th>}
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
                {type === 'bank' && <td className="py-2 px-2">{acc.bankName ? `${acc.bankName} / ${acc.accountNumber || '—'}` : acc.accountNumber || '—'}</td>}
                {type === 'mobile_money' && <td className="py-2 px-2">{acc.phoneNumber || '—'}</td>}
                <td className="py-2 px-2">{acc.currency || '—'}</td>
                <td className="py-2 px-2 text-right font-mono">{fmt(acc.balance)}</td>
                <td className="py-2 px-2"><Badge variant={acc.isActive ? 'default' : 'secondary'}>{acc.isActive ? 'Active' : 'Inactive'}</Badge></td>
                <td className="py-2 px-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(acc)}><Edit className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {list.length === 0 && !loading && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No {ACCOUNT_TYPE_LABELS[type].toLowerCase()}s found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transaction Accounts</h1>
        <p className="text-muted-foreground">Manage bank, cash, safe, and mobile money accounts</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map(card => {
          const Icon = card.icon
          return (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className={`text-lg font-bold ${card.color}`}>{fmt(card.value)}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="bank"><Landmark className="h-4 w-4 mr-1" /> Bank Accounts</TabsTrigger>
          <TabsTrigger value="cash"><Wallet className="h-4 w-4 mr-1" /> Cash Accounts</TabsTrigger>
          <TabsTrigger value="safe"><Shield className="h-4 w-4 mr-1" /> Safe Accounts</TabsTrigger>
          <TabsTrigger value="mobile_money"><Smartphone className="h-4 w-4 mr-1" /> Mobile Money</TabsTrigger>
          <TabsTrigger value="overdraft"><AlertCircle className="h-4 w-4 mr-1" /> Overdraft Configuration</TabsTrigger>
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
        <TabsContent value="overdraft" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Overdraft Configuration</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">Account Name</th>
                      <th className="text-left py-2 px-2 font-medium">Bank</th>
                      <th className="text-right py-2 px-2 font-medium">Current Balance</th>
                      <th className="text-right py-2 px-2 font-medium">Overdraft Limit</th>
                      <th className="text-right py-2 px-2 font-medium">Interest Rate (%)</th>
                      <th className="text-left py-2 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankAccounts.map(acc => (
                      <tr key={acc.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2 font-medium">{acc.name}</td>
                        <td className="py-2 px-2">{acc.bankName || '—'}</td>
                        <td className="py-2 px-2 text-right font-mono">{fmt(acc.balance)}</td>
                        <td className="py-2 px-2 text-right font-mono">{fmt(acc.overdraftLimit || 0)}</td>
                        <td className="py-2 px-2 text-right font-mono">{acc.interestRate || 0}%</td>
                        <td className="py-2 px-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(acc)}><Edit className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    ))}
                    {bankAccounts.length === 0 && !loading && (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No bank accounts configured</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account' : 'New Account'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Account Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Account Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Account</SelectItem>
                    <SelectItem value="cash">Cash Account</SelectItem>
                    <SelectItem value="safe">Safe Account</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'bank' && (
                <>
                  <div><Label>Bank Name</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
                  <div><Label>Account Number</Label><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></div>
                  <div><Label>Overdraft Limit</Label><Input type="number" value={form.overdraftLimit} onChange={(e) => setForm({ ...form, overdraftLimit: e.target.value })} /></div>
                  <div><Label>Interest Rate (%)</Label><Input type="number" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} /></div>
                </>
              )}
              {form.type === 'mobile_money' && (
                <div><Label>Phone Number</Label><Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+256..." /></div>
              )}
              <div><Label>Opening Balance</Label><Input type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} /></div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Branch</Label>
                <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingAccount ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
