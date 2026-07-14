import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { apiFetch } from '@/lib/api'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalBranches } from '@/db/hybrid'
import { useToast } from '@/hooks/use-toast'
import { Users, Search, Wallet, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Info, Receipt } from 'lucide-react'

interface CashTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  reference?: string
  description?: string
  account: { id: string; name: string; type: string }
  createdAt: string
}

interface StaffTill {
  staffId: string
  staff: { id: string; fname: string; lname: string; email: string; role: string }
  branch?: { id: string; name: string } | null
  cashAccount?: { id: string; name: string; type: string; balance: number; currency: string; accountNumber?: string | null } | null
  currentBalance: number
  totalCredited: number
  totalDebited: number
  netMovement: number
  transactionCount: number
  transactions: CashTransaction[]
  breakdown: Record<string, { count: number; total: number }>
}

interface Branch {
  id: string
  name: string
}

export default function StaffTillSheetPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [tillSheets, setTillSheets] = useState<StaffTill[]>([])
  const [summary, setSummary] = useState({ totalStaff: 0, totalCredited: 0, totalDebited: 0, totalBalance: 0 })
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterStaff, setFilterStaff] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)
  const [expandedRef, setExpandedRef] = useState<string | null>(null)
  const [refDetails, setRefDetails] = useState<Record<string, any>>({})
  const [loadingRef, setLoadingRef] = useState<string | null>(null)

  const fetchTillSheets = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filterStaff) params.set('staffId', filterStaff)
      if (filterBranch) params.set('branchId', filterBranch)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await apiFetch(`/api/expenses/staff-till-sheets?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTillSheets(data.tillSheets || [])
        setSummary(data.summary || { totalStaff: 0, totalCredited: 0, totalDebited: 0, totalBalance: 0 })
      }
    } catch {
      setTillSheets([])
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
    fetchBranches()
  }, [])

  useEffect(() => {
    fetchTillSheets()
  }, [filterStaff, filterBranch, startDate, endDate])

  const filteredTills = tillSheets.filter(t => {
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      const staffName = `${t.staff.fname} ${t.staff.lname}`.toLowerCase()
      if (!staffName.includes(lower)) return false
    }
    return true
  })

  const fmt = (val: number) => Number(val || 0).toFixed(2)

  const txnTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sale: 'Sale', receipt: 'Customer Payment', income: 'Income',
      expense: 'Expense', payment: 'Supplier Payment', transfer: 'Transfer'
    }
    return labels[type] || type
  }

  const txnTypeColor = (type: string) => {
    if (['sale', 'receipt', 'income'].includes(type)) return 'text-green-600'
    if (['expense', 'payment', 'transfer'].includes(type)) return 'text-red-600'
    return ''
  }

  const fetchRefDetails = async (txn: CashTransaction) => {
    if (refDetails[txn.id]) {
      setExpandedRef(expandedRef === txn.id ? null : txn.id)
      return
    }
    setLoadingRef(txn.id)
    try {
      let endpoint = ''
      if (txn.type === 'sale' && txn.reference) {
        endpoint = `/api/sales?search=${encodeURIComponent(txn.reference)}`
      } else if (txn.type === 'expense') {
        endpoint = `/api/expenses?search=${encodeURIComponent(txn.reference || txn.description || '')}`
      } else if (txn.type === 'receipt') {
        endpoint = `/api/customer-payments?reference=${encodeURIComponent(txn.reference || '')}`
      } else if (txn.type === 'payment') {
        endpoint = `/api/supplier-payments?reference=${encodeURIComponent(txn.reference || '')}`
      }
      if (endpoint) {
        const res = await apiFetch(endpoint)
        if (res.ok) {
          const data = await res.json()
          setRefDetails(prev => ({ ...prev, [txn.id]: data }))
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingRef(null)
      setExpandedRef(expandedRef === txn.id ? null : txn.id)
    }
  }

  const renderRefDetails = (txn: CashTransaction) => {
    if (expandedRef !== txn.id) return null
    const details = refDetails[txn.id]
    if (loadingRef === txn.id) {
      return (
        <tr><td colSpan={7} className="py-2 px-3 bg-muted/20 text-xs text-muted-foreground italic">Loading details...</td></tr>
      )
    }
    if (!details) {
      return (
        <tr><td colSpan={7} className="py-2 px-3 bg-muted/20 text-xs text-muted-foreground italic">No additional details available for this reference.</td></tr>
      )
    }
    // Sale details
    if (txn.type === 'sale' && details.sales) {
      const sale = details.sales.find((s: any) => s.receiptNo === txn.reference || s.id === txn.reference)
      if (sale) {
        return (
          <tr><td colSpan={7} className="py-3 px-3 bg-muted/20">
            <div className="flex flex-wrap gap-4 text-xs">
              <div><span className="text-muted-foreground">Receipt:</span> <span className="font-mono font-semibold">{sale.receiptNo}</span></div>
              <div><span className="text-muted-foreground">Date:</span> {new Date(sale.createdAt).toLocaleString()}</div>
              <div><span className="text-muted-foreground">Payment:</span> {sale.paymentMethod}</div>
              <div><span className="text-muted-foreground">Subtotal:</span> {fmt(sale.subtotal)}</div>
              <div><span className="text-muted-foreground">Discount:</span> {fmt(sale.discount)}</div>
              <div><span className="text-muted-foreground">Tax:</span> {fmt(sale.tax)}</div>
              <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{fmt(sale.total)}</span></div>
              {sale.branch?.name && <div><span className="text-muted-foreground">Branch:</span> {sale.branch.name}</div>}
              {sale.items && sale.items.length > 0 && (
                <div className="w-full mt-1">
                  <span className="text-muted-foreground">Items:</span>
                  <div className="mt-1 space-y-0.5">
                    {sale.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex gap-2">
                        <span className="font-medium">{item.product?.name || item.productName || 'Unknown'}</span>
                        <span className="text-muted-foreground">×{item.quantity}</span>
                        <span className="font-mono">@{fmt(item.price)}</span>
                        <span className="font-mono font-semibold">= {fmt(item.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td></tr>
        )
      }
    }
    // Expense details
    if (txn.type === 'expense' && details.expenses) {
      const expense = details.expenses.find((e: any) => e.id === txn.reference || e.description === txn.description)
      if (expense) {
        return (
          <tr><td colSpan={7} className="py-3 px-3 bg-muted/20">
            <div className="flex flex-wrap gap-4 text-xs">
              <div><span className="text-muted-foreground">Category:</span> <span className="font-semibold">{expense.category}</span></div>
              <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{fmt(expense.amount)}</span></div>
              <div><span className="text-muted-foreground">Date:</span> {new Date(expense.date).toLocaleDateString()}</div>
              <div><span className="text-muted-foreground">Payment:</span> {expense.paymentMethod || 'cash'}</div>
              {expense.notes && <div><span className="text-muted-foreground">Notes:</span> {expense.notes}</div>}
              {expense.branch?.name && <div><span className="text-muted-foreground">Branch:</span> {expense.branch.name}</div>}
            </div>
          </td></tr>
        )
      }
    }
    // Generic fallback
    return (
      <tr><td colSpan={7} className="py-2 px-3 bg-muted/20 text-xs text-muted-foreground italic">No additional details available for this reference.</td></tr>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff Till Sheet</h1>
        <p className="text-muted-foreground">Track each staff's cash account: sales credited, expenses debited, payments in/out</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by staff name..."
                className="pl-9"
              />
            </div>
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-40" placeholder="From" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-40" placeholder="To" />
            <Button variant="outline" onClick={() => { setSearchTerm(''); setFilterBranch(''); setFilterStaff(''); setStartDate(''); setEndDate('') }}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      {/* Till Sheet Cards */}
      <div className="space-y-4">
        {filteredTills.map(till => {
          const isExpanded = expandedStaff === till.staffId
          return (
            <Card key={till.staffId}>
              <CardContent className="p-4">
                {/* Staff header row */}
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedStaff(isExpanded ? null : till.staffId)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{till.staff.fname} {till.staff.lname}</p>
                      <p className="text-xs text-muted-foreground">
                        {till.staff.role} • {till.branch?.name || 'No branch'}
                        {till.cashAccount && ` • ${till.cashAccount.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6">
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="text-right cursor-help">
                          <div className="flex items-center justify-end gap-1">
                            <p className="text-xs text-muted-foreground">Credited</p>
                            <Info className="h-3 w-3 text-muted-foreground/60" />
                          </div>
                          <p className="text-sm font-semibold text-green-600">{fmt(till.totalCredited)}</p>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-green-600">Credited (Money In)</p>
                          <p className="text-xs text-muted-foreground">Transactions that added money to this account</p>
                          <div className="space-y-1 pt-1">
                            {Object.entries(till.breakdown)
                              .filter(([type]) => ['sale', 'receipt', 'income'].includes(type))
                              .map(([type, data]) => (
                                <div key={type} className="flex items-center justify-between text-xs">
                                  <span>{txnTypeLabel(type)}</span>
                                  <span className="font-mono font-semibold text-green-600">{fmt(data.total)}</span>
                                </div>
                              ))}
                            {Object.entries(till.breakdown).filter(([type]) => ['sale', 'receipt', 'income'].includes(type)).length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No credited transactions</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="text-right cursor-help">
                          <div className="flex items-center justify-end gap-1">
                            <p className="text-xs text-muted-foreground">Debited</p>
                            <Info className="h-3 w-3 text-muted-foreground/60" />
                          </div>
                          <p className="text-sm font-semibold text-red-600">{fmt(till.totalDebited)}</p>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-red-600">Debited (Money Out)</p>
                          <p className="text-xs text-muted-foreground">Transactions that removed money from this account</p>
                          <div className="space-y-1 pt-1">
                            {Object.entries(till.breakdown)
                              .filter(([type]) => ['expense', 'payment', 'transfer'].includes(type))
                              .map(([type, data]) => (
                                <div key={type} className="flex items-center justify-between text-xs">
                                  <span>{txnTypeLabel(type)}</span>
                                  <span className="font-mono font-semibold text-red-600">{fmt(data.total)}</span>
                                </div>
                              ))}
                            {Object.entries(till.breakdown).filter(([type]) => ['expense', 'payment', 'transfer'].includes(type)).length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No debited transactions</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="text-sm font-bold text-blue-600">{fmt(till.currentBalance)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Txns</p>
                      <p className="text-sm font-semibold">{till.transactionCount}</p>
                    </div>
                  </div>
                </div>

                {/* Expanded transaction details */}
                {isExpanded && (
                  <div className="mt-4 space-y-3">
                    {/* Breakdown by type */}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(till.breakdown).map(([type, data]) => (
                        <Badge key={type} variant="outline" className="text-xs">
                          {txnTypeLabel(type)}: {data.count} txn{data.count !== 1 ? 's' : ''} • {fmt(data.total)}
                        </Badge>
                      ))}
                    </div>

                    {/* Transaction list */}
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left py-2 px-3 font-medium">Date</th>
                            <th className="text-left py-2 px-3 font-medium">Type</th>
                            <th className="text-left py-2 px-3 font-medium">Description</th>
                            <th className="text-left py-2 px-3 font-medium">Account</th>
                            <th className="text-left py-2 px-3 font-medium">Reference</th>
                            <th className="text-right py-2 px-3 font-medium">Amount</th>
                            <th className="text-right py-2 px-3 font-medium">Balance After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {till.transactions.map(txn => (
                            <React.Fragment key={txn.id}>
                            <tr className="border-b hover:bg-muted/30">
                              <td className="py-2 px-3 whitespace-nowrap">{new Date(txn.createdAt).toLocaleString()}</td>
                              <td className="py-2 px-3">
                                <Badge variant="secondary" className="text-xs">{txnTypeLabel(txn.type)}</Badge>
                              </td>
                              <td className="py-2 px-3">{txn.description || '—'}</td>
                              <td className="py-2 px-3">{txn.account?.name || '—'}</td>
                              <td className="py-2 px-3 font-mono">
                                {txn.reference ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); fetchRefDetails(txn) }}
                                    className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-mono"
                                  >
                                    <Receipt className="h-3 w-3" />
                                    {txn.reference}
                                    {expandedRef === txn.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  </button>
                                ) : '—'}
                              </td>
                              <td className={`py-2 px-3 text-right font-mono font-semibold ${txnTypeColor(txn.type)}`}>
                                {['sale', 'receipt', 'income'].includes(txn.type) ? '+' : '-'}{fmt(txn.amount)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">{fmt(txn.balanceAfter)}</td>
                            </tr>
                            {renderRefDetails(txn)}
                            </React.Fragment>
                          ))}
                          {till.transactions.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-4 text-muted-foreground">No transactions in this period</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
        {filteredTills.length === 0 && !loading && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No staff till sheets found. Assign cash accounts to staff to see their activity here.
            </CardContent>
          </Card>
        )}
        {loading && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
