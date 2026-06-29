import React, { useState, useEffect } from 'react'
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
import { Calculator, Plus, BookOpen, FileText, TrendingUp, Scale } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalAccounts, getLocalJournalEntries } from '@/db/hybrid'
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
}

interface JournalEntry {
  id: string
  entryNo: string
  date: string
  description?: string
  reference?: string
  status: string
  user?: { fname: string; lname: string }
  lines: { id: string; accountId: string; account: { code: string; name: string; type: string }; debit: number; credit: number; description?: string }[]
}

export default function AccountingPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const { paginatedItems: paginatedEntries, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(entries, 10)
  const [loading, setLoading] = useState(true)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [activeTab, setActiveTab] = useState('accounts')

  // Account form
  const [accCode, setAccCode] = useState('')
  const [accName, setAccName] = useState('')
  const [accType, setAccType] = useState('asset')
  const [accSubType, setAccSubType] = useState('')

  // Journal form
  const [jeDescription, setJeDescription] = useState('')
  const [jeReference, setJeReference] = useState('')
  const [jeLines, setJeLines] = useState<{ accountId: string; debit: number; credit: number; description?: string }[]>([])

  // Reports
  const [trialBalance, setTrialBalance] = useState<any>(null)
  const [profitLoss, setProfitLoss] = useState<any>(null)
  const [balanceSheet, setBalanceSheet] = useState<any>(null)

  const fetchAccounts = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/accounting/accounts')
        if (res.ok) setAccounts(await res.json())
      } else {
        setAccounts(await getLocalAccounts())
      }
    } catch (err) {
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
    } catch (err) {
      try { setEntries(await getLocalJournalEntries() as any) } catch {}
    }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchAccounts()
    fetchEntries()
  }, [])

  const handleCreateAccount = async () => {
    if (!accCode || !accName) return toast({ variant: 'destructive', title: 'Code and name required' })
    try {
      const res = await apiFetch('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accCode, name: accName, type: accType, subType: accSubType || undefined }),
      })
      if (res.ok) {
        toast({ title: 'Account created' })
        setShowAccountModal(false)
        setAccCode(''); setAccName(''); setAccSubType('')
        fetchAccounts()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to create account' })
    }
  }

  const addJournalLine = () => {
    setJeLines([...jeLines, { accountId: '', debit: 0, credit: 0, description: '' }])
  }

  const updateJournalLine = (idx: number, field: string, value: any) => {
    const updated = [...jeLines]
    updated[idx] = { ...updated[idx], [field]: field === 'debit' || field === 'credit' ? Number(value) : value }
    setJeLines(updated)
  }

  const totalDebit = jeLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = jeLines.reduce((s, l) => s + l.credit, 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  const handleCreateJournal = async () => {
    if (!jeLines.length) return toast({ variant: 'destructive', title: 'Add at least one line' })
    if (!isBalanced) return toast({ variant: 'destructive', title: 'Debits and credits must balance' })
    if (jeLines.some((l) => !l.accountId)) return toast({ variant: 'destructive', title: 'Select account for all lines' })

    try {
      const res = await apiFetch('/api/accounting/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: jeDescription, reference: jeReference, lines: jeLines }),
      })
      if (res.ok) {
        toast({ title: 'Journal entry posted' })
        setShowJournalModal(false)
        setJeDescription(''); setJeReference(''); setJeLines([])
        fetchEntries()
        fetchAccounts()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to create journal entry' })
    }
  }

  const fetchReport = async (type: string) => {
    try {
      const res = await apiFetch(`/api/accounting/reports/${type}`)
      if (res.ok) {
        const data = await res.json()
        if (type === 'trial-balance') setTrialBalance(data)
        if (type === 'profit-loss') setProfitLoss(data)
        if (type === 'balance-sheet') setBalanceSheet(data)
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to load report' })
    }
  }

  useEffect(() => {
    if (activeTab === 'trial-balance' && !trialBalance) fetchReport('trial-balance')
    if (activeTab === 'profit-loss' && !profitLoss) fetchReport('profit-loss')
    if (activeTab === 'balance-sheet' && !balanceSheet) fetchReport('balance-sheet')
  }, [activeTab])

  const accountTypeColor: Record<string, string> = {
    asset: 'bg-blue-100 text-blue-800',
    liability: 'bg-red-100 text-red-800',
    equity: 'bg-purple-100 text-purple-800',
    revenue: 'bg-green-100 text-green-800',
    expense: 'bg-orange-100 text-orange-800',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">Chart of accounts, journal entries, and financial reports</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="accounts"><Calculator className="h-4 w-4 mr-1" /> Accounts</TabsTrigger>
          <TabsTrigger value="journal"><BookOpen className="h-4 w-4 mr-1" /> Journal</TabsTrigger>
          <TabsTrigger value="trial-balance"><Scale className="h-4 w-4 mr-1" /> Trial Balance</TabsTrigger>
          <TabsTrigger value="profit-loss"><TrendingUp className="h-4 w-4 mr-1" /> P&L</TabsTrigger>
          <TabsTrigger value="balance-sheet"><FileText className="h-4 w-4 mr-1" /> Balance Sheet</TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Account</Button></DialogTrigger>
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
                          <SelectItem value="asset">Asset</SelectItem>
                          <SelectItem value="liability">Liability</SelectItem>
                          <SelectItem value="equity">Equity</SelectItem>
                          <SelectItem value="revenue">Revenue</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Sub-type (optional)</Label><Input value={accSubType} onChange={(e) => setAccSubType(e.target.value)} placeholder="e.g. current_asset" /></div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAccountModal(false)}>Cancel</Button>
                  <Button onClick={handleCreateAccount}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Badge className={accountTypeColor[acc.type] || 'bg-gray-100'}>{acc.type}</Badge>
                  <span className="font-mono text-sm">{acc.code}</span>
                  <span className="font-medium">{acc.name}</span>
                  {acc.subType && <Badge variant="outline">{acc.subType}</Badge>}
                </div>
                <div className="text-right">
                  <span className="font-bold">{acc.balance.toFixed(2)}</span>
                </div>
              </div>
            ))}
            {accounts.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">No accounts yet. Create your first account.</div>
            )}
          </div>
        </TabsContent>

        {/* Journal Tab */}
        <TabsContent value="journal" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showJournalModal} onOpenChange={setShowJournalModal}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Entry</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Create Journal Entry</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Description</Label><Input value={jeDescription} onChange={(e) => setJeDescription(e.target.value)} /></div>
                    <div><Label>Reference</Label><Input value={jeReference} onChange={(e) => setJeReference(e.target.value)} placeholder="Optional" /></div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Lines</Label>
                      <Button size="sm" variant="outline" onClick={addJournalLine}><Plus className="h-3 w-3 mr-1" /> Add Line</Button>
                    </div>
                    {jeLines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <Select value={line.accountId} onValueChange={(v) => updateJournalLine(idx, 'accountId', v)}>
                            <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                            <SelectContent>
                              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3"><Input type="number" value={line.debit} onChange={(e) => updateJournalLine(idx, 'debit', e.target.value)} placeholder="Debit" /></div>
                        <div className="col-span-3"><Input type="number" value={line.credit} onChange={(e) => updateJournalLine(idx, 'credit', e.target.value)} placeholder="Credit" /></div>
                        <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => setJeLines(jeLines.filter((_, i) => i !== idx))}>✕</Button></div>
                      </div>
                    ))}
                    {jeLines.length > 0 && (
                      <div className={`text-right text-sm font-medium ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                        Debit: {totalDebit.toFixed(2)} | Credit: {totalCredit.toFixed(2)} {isBalanced ? '✓ Balanced' : '✗ Not balanced'}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowJournalModal(false)}>Cancel</Button>
                  <Button onClick={handleCreateJournal} disabled={!isBalanced || !jeLines.length}>Post Entry</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {paginatedEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{entry.entryNo}</span>
                    <Badge variant="outline">{entry.status}</Badge>
                    {entry.reference && <Badge variant="secondary">{entry.reference}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</span>
                </div>
                {entry.description && <p className="text-sm text-muted-foreground mb-2">{entry.description}</p>}
                <div className="space-y-1">
                  {entry.lines.map((line) => (
                    <div key={line.id} className="flex justify-between text-sm py-1 border-b border-dashed">
                      <span>{line.account.code} - {line.account.name}</span>
                      <span className="font-mono">
                        {line.debit > 0 ? `Dr ${line.debit.toFixed(2)}` : `Cr ${line.credit.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {entries.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">No journal entries yet</div>
            )}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={goToPage}
          />
        </TabsContent>

        {/* Trial Balance */}
        <TabsContent value="trial-balance">
          {trialBalance ? (
            <Card>
              <CardHeader><CardTitle>Trial Balance</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-2">Code</th><th className="text-left">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
                  <tbody>
                    {trialBalance.accounts.map((a: any) => (
                      <tr key={a.code} className="border-b">
                        <td className="py-2 font-mono">{a.code}</td><td>{a.name}</td>
                        <td className="text-right font-mono">{a.debit > 0 ? a.debit.toFixed(2) : ''}</td>
                        <td className="text-right font-mono">{a.credit > 0 ? a.credit.toFixed(2) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="font-bold border-t-2"><td colSpan={2} className="py-2">Total</td><td className="text-right font-mono">{trialBalance.totalDebit.toFixed(2)}</td><td className="text-right font-mono">{trialBalance.totalCredit.toFixed(2)}</td></tr></tfoot>
                </table>
              </CardContent>
            </Card>
          ) : <div className="text-center py-8 text-muted-foreground">Loading...</div>}
        </TabsContent>

        {/* P&L */}
        <TabsContent value="profit-loss">
          {profitLoss ? (
            <Card>
              <CardHeader><CardTitle>Profit & Loss Statement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Revenue</h3>
                  {profitLoss.revenues.map((r: any) => (
                    <div key={r.code} className="flex justify-between text-sm py-1"><span>{r.code} - {r.name}</span><span className="font-mono">{r.balance.toFixed(2)}</span></div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-2"><span>Total Revenue</span><span>{profitLoss.totalRevenue.toFixed(2)}</span></div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Expenses</h3>
                  {profitLoss.expenses.map((e: any) => (
                    <div key={e.code} className="flex justify-between text-sm py-1"><span>{e.code} - {e.name}</span><span className="font-mono">{e.balance.toFixed(2)}</span></div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-2"><span>Total Expenses</span><span>{profitLoss.totalExpenses.toFixed(2)}</span></div>
                </div>
                <div className={`flex justify-between font-bold text-lg border-t-2 pt-4 ${profitLoss.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>Net {profitLoss.netProfit >= 0 ? 'Profit' : 'Loss'}</span><span>{Math.abs(profitLoss.netProfit).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          ) : <div className="text-center py-8 text-muted-foreground">Loading...</div>}
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance-sheet">
          {balanceSheet ? (
            <Card>
              <CardHeader><CardTitle>Balance Sheet</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Assets</h3>
                  {balanceSheet.assets.map((a: any) => (
                    <div key={a.code} className="flex justify-between text-sm py-1"><span>{a.code} - {a.name}</span><span className="font-mono">{a.balance.toFixed(2)}</span></div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-2"><span>Total Assets</span><span>{balanceSheet.totalAssets.toFixed(2)}</span></div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Liabilities</h3>
                  {balanceSheet.liabilities.map((l: any) => (
                    <div key={l.code} className="flex justify-between text-sm py-1"><span>{l.code} - {l.name}</span><span className="font-mono">{l.balance.toFixed(2)}</span></div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-2"><span>Total Liabilities</span><span>{balanceSheet.totalLiabilities.toFixed(2)}</span></div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Equity</h3>
                  {balanceSheet.equity.map((e: any) => (
                    <div key={e.code} className="flex justify-between text-sm py-1"><span>{e.code} - {e.name}</span><span className="font-mono">{e.balance.toFixed(2)}</span></div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-2"><span>Total Equity</span><span>{balanceSheet.totalEquity.toFixed(2)}</span></div>
                </div>
              </CardContent>
            </Card>
          ) : <div className="text-center py-8 text-muted-foreground">Loading...</div>}
        </TabsContent>
      </Tabs>
    </div>
  )
}
