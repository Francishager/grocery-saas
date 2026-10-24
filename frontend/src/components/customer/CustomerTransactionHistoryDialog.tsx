import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarClock, CreditCard, Loader2, ReceiptText, UserRound, Wallet, Edit, Trash2, Gauge, CircleDollarSign, Clock3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api'
import { cn, formatCurrency, formatDisplayDate } from '@/lib/utils'
import TransactionReceiptButton from '@/components/TransactionReceiptButton'

export type CustomerHistoryTarget = {
  id?: string | null
  name?: string | null
  phone?: string | null
  email?: string | null
  maskedPhone?: string
  maskedEmail?: string
}

type CustomerHistoryTransaction = {
  id: string
  source: string
  type: string
  date?: string | null
  dueDate?: string | null
  reference?: string | null
  originalReference?: string | null
  receiptStatus?: 'cancelled' | 'adjusted' | null
  description?: string | null
  reason?: string | null
  debit?: number
  credit?: number
  amount?: number
  amountPaid?: number
  refundAmount?: number
  remainingBalance?: number
  balance?: number
  affectsBalance?: boolean
  paymentMethod?: string | null
  status?: string | null
  branch?: string | null
  staff?: string | null
  items?: Array<{
    id?: string
    productName?: string
    sku?: string
    quantity?: number
    unitName?: string
    unitPrice?: number
    discount?: number
    total?: number
  }>
}

type CustomerCreditHistory = {
  asOf: string
  currentBalance: number
  receivableExposure: number
  customerFunds: number
  creditLimit: number
  availableLimit: number
  utilizationPercent: number | null
  aging: {
    notDue: number
    days1To30: number
    days31To60: number
    days61To90: number
    over90Days: number
    noDueDate: number
  }
  openSales: Array<{
    id: string
    reference: string
    date: string
    dueDate?: string | null
    total: number
    amountPaid: number
    balance: number
    status: string
    daysPastDue: number | null
  }>
}

type CustomerHistoryResponse = {
  customer: CustomerHistoryTarget & {
    address?: string | null
    maskedAddress?: string
    notes?: string | null
    maskedNotes?: string
    status?: string
    creditLimit?: number
    balance?: number
    openingBalance?: number
    openingBalanceDate?: string | null
    trustScore?: number
    availableForWithdrawal?: number
    canDelete?: boolean
  }
  summary: {
    currentBalance?: number
    availableCredit?: number
    receivableSales?: number
    cashSales?: number
    payments?: number
    withdrawals?: number
    creditNotes?: number
    returns?: number
    transactionCount?: number
    openingBalance?: number
    openingBalanceDate?: string | null
    openingBalanceNote?: string | null
    availableForWithdrawal?: number
    lastTransactionDate?: string | null
  }
  access: {
    phone: boolean
    email: boolean
    address: boolean
    balance: boolean
    sales: boolean
    payments: boolean
    returns: boolean
    creditNotes: boolean
    withdrawals: boolean
    businessActivity: boolean
    creditHistory: boolean
    notes: boolean
    recordPayment: boolean
    printReceipts: boolean
    edit: boolean
    delete: boolean
    withdraw: boolean
  }
  creditHistory?: CustomerCreditHistory
  transactions: CustomerHistoryTransaction[]
}

const normalizeText = (value?: string | null) => String(value || '').replace(/_/g, ' ')

function metric(label: string, value: number | undefined, tone?: string) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 break-words text-sm font-semibold sm:text-base', tone)}>{formatCurrency(Number(value || 0))}</p>
    </div>
  )
}

function maskedMetric(label: string) {
  return (
    <div className="rounded-md border bg-muted/20 p-3" aria-label={`${label} hidden by permissions`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tracking-[0.18em] text-muted-foreground sm:text-base">******</p>
    </div>
  )
}

function CreditUtilizationGauge({ percent, availableLimit, trustScore }: { percent: number | null; availableLimit: number; trustScore: number }) {
  const gradientId = `credit-utilization-${useId().replace(/:/g, '')}`
  const value = percent == null ? 0 : Math.max(0, percent)
  const needlePercent = Math.min(100, value)
  const angle = Math.PI - (needlePercent / 100) * Math.PI
  const centerX = 120
  const centerY = 120
  const needleX = centerX + 76 * Math.cos(angle)
  const needleY = centerY - 76 * Math.sin(angle)
  const normalizedTrustScore = Math.min(100, Math.max(0, Number(trustScore) || 0))
  const status = percent == null ? 'No limit set' : value > 100 ? 'Over limit' : value >= 80 ? 'Near limit' : 'Within limit'
  const statusTone = percent == null ? 'text-muted-foreground' : value > 100 ? 'text-red-700' : value >= 80 ? 'text-amber-700' : 'text-emerald-700'

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Limit utilization</p>
        <Gauge className="h-4 w-4 text-muted-foreground" />
      </div>
      <svg viewBox="0 0 240 158" className="mx-auto mt-1 h-36 w-full max-w-[290px]" role="img" aria-label={percent == null ? 'No customer credit limit is set' : `Credit limit utilization ${value.toLocaleString()} percent, ${status}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#15803d" />
            <stop offset="72%" stopColor="#65a30d" />
            <stop offset="86%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="15" strokeLinecap="round" />
        <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke={`url(#${gradientId})`} strokeWidth="15" strokeLinecap="round" pathLength="100" strokeDasharray={`${percent == null ? 0 : needlePercent} 100`} />
        {[0, 25, 50, 75, 100].map((mark) => {
          const markAngle = Math.PI - (mark / 100) * Math.PI
          const x1 = centerX + 82 * Math.cos(markAngle)
          const y1 = centerY - 82 * Math.sin(markAngle)
          const x2 = centerX + 91 * Math.cos(markAngle)
          const y2 = centerY - 91 * Math.sin(markAngle)
          return <line key={mark} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.58" strokeWidth="2" />
        })}
        <line x1={centerX} y1={centerY} x2={needleX} y2={needleY} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx={centerX} cy={centerY} r="7" fill="currentColor" />
        <text x="20" y="146" textAnchor="start" className="fill-muted-foreground" fontSize="11">0%</text>
        <text x="120" y="24" textAnchor="middle" className="fill-muted-foreground" fontSize="11">50%</text>
        <text x="220" y="146" textAnchor="end" className="fill-muted-foreground" fontSize="11">100%</text>
      </svg>
      <div className="-mt-2 text-center">
        <p className="text-xl font-semibold tabular-nums">{percent == null ? '—' : `${value.toLocaleString()}%`}</p>
        <p className={cn('text-xs font-medium', statusTone)}>{status}</p>
        {percent != null && <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(availableLimit)} limit remaining</p>}
      </div>
      <div className="mt-4 border-t pt-3" aria-label={`Repayment trust score ${normalizedTrustScore} out of 100`}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">Repayment trust</span>
          <span className="font-semibold tabular-nums">{normalizedTrustScore}/100</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Repayment trust score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalizedTrustScore}>
          <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${normalizedTrustScore}%` }} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Limit use shows current exposure; trust reflects repayment history. Consider both together.</p>
      </div>
    </div>
  )
}

function transactionTone(row: CustomerHistoryTransaction) {
  if (Number(row.debit || 0) > 0) return 'text-red-700'
  if (Number(row.credit || 0) > 0) return 'text-green-700'
  return 'text-foreground'
}

function customerActivityReceipt(row: CustomerHistoryTransaction, customerName?: string | null) {
  const isCreditNote = row.source === 'credit_note'
  const isReturn = row.source === 'sale_return'
  const amount = Number(row.amount || row.debit || row.credit || 0)
  const title = isCreditNote
    ? 'Customer Credit Note'
    : isReturn
      ? row.paymentMethod === 'credit' ? 'Sales Return Credit Receipt' : 'Sales Return Refund Receipt'
      : `${row.type || 'Customer transaction'} receipt`
  const fields = [
    { label: 'Transaction type', value: row.type },
    ...(row.originalReference ? [{ label: 'Original sale', value: row.originalReference }] : []),
    ...(row.reason ? [{ label: 'Reason', value: row.reason }] : []),
    ...(isCreditNote ? [
      { label: 'Credit note value', value: formatCurrency(amount) },
      { label: 'Refund recorded', value: formatCurrency(Number(row.refundAmount || 0)) },
      { label: 'Returned items', value: row.items?.length ? 'Listed below' : 'No item quantities recorded on this note' },
    ] : []),
    ...(isReturn ? row.paymentMethod === 'credit'
      ? [{ label: 'Customer balance credit', value: formatCurrency(amount) }]
      : [{ label: 'Refund method', value: row.paymentMethod }, { label: 'Refund amount', value: formatCurrency(amount) }]
      : []),
    ...(!isCreditNote && !isReturn ? [{ label: 'Payment method', value: row.paymentMethod }] : []),
    { label: 'Staff', value: row.staff },
    ...(!isCreditNote && !isReturn ? [
      { label: 'Debit', value: row.debit ? formatCurrency(Number(row.debit)) : '' },
      { label: 'Credit', value: row.credit ? formatCurrency(Number(row.credit)) : '' },
    ] : []),
    { label: 'Status', value: row.status },
  ]

  return {
    title,
    reference: row.reference || row.id,
    date: row.date || new Date(),
    amount,
    partyLabel: 'Customer',
    partyName: customerName || undefined,
    items: row.items?.map((item) => ({
      name: item.productName || 'Item',
      quantity: Number(item.quantity || 0),
      unitName: item.unitName || '',
      unitPrice: Number(item.unitPrice || 0),
      discount: Number(item.discount || 0),
      total: Number(item.total || 0),
    })),
    fields,
  }
}

export default function CustomerTransactionHistoryDialog({
  customer,
  open,
  onOpenChange,
  onRecordPayment,
  onWithdraw,
  onEditCustomer,
  onDeleteCustomer,
  viewMode = 'profile',
  presentation = 'dialog',
}: {
  customer: CustomerHistoryTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecordPayment?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  onWithdraw?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  onEditCustomer?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  onDeleteCustomer?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  viewMode?: 'profile' | 'details'
  presentation?: 'dialog' | 'page'
}) {
  const navigate = useNavigate()
  const [data, setData] = useState<CustomerHistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !customer?.id) {
      setData(null)
      setError('')
      return
    }

    const controller = new AbortController()
    const loadHistory = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await apiFetch(`/api/receivables/customers/${customer.id}/history?limit=${viewMode === 'details' ? 1 : 500}`, {
          signal: controller.signal,
        } as RequestInit)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'Failed to load customer history')
        setData(payload)
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError(err?.message || 'Failed to load customer history')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadHistory()
    return () => controller.abort()
  }, [open, customer?.id, viewMode])

  const customerInfo = data?.customer || customer
  const transactions = data?.transactions || []
  const canViewLedger = Boolean(data && (
    data.access.sales || data.access.payments || data.access.returns || data.access.creditNotes ||
    data.access.withdrawals || data.access.businessActivity || data.access.balance
  ))
  const canViewSalesAndPayments = Boolean(data && (data.access.sales || data.access.payments))
  const canViewCreditHistory = Boolean(data?.access.creditHistory && data.creditHistory)
  const creditActivity = transactions.filter((row) => [
    'opening_balance', 'receivable_sale', 'sale_payment_adjustment', 'customer_payment',
    'customer_credit_application', 'credit_note', 'sale_return', 'customer_withdrawal',
  ].includes(row.source))
  const lastDate = useMemo(() => data?.summary?.lastTransactionDate ? formatDisplayDate(data.summary.lastTransactionDate) : 'No activity yet', [data?.summary?.lastTransactionDate])

  const content = (
    <div className="space-y-4">
        {presentation === 'page' ? (
          <div className="flex flex-wrap items-start gap-3 border-b pb-4">
            <Button variant="outline" onClick={() => navigate('/tenant/receivables/customers')}>Back to customers</Button>
            <div>
              <h1 className="text-xl font-semibold">{customerInfo?.name || 'Customer'}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Customer profile and transaction ledger available to your role.</p>
            </div>
          </div>
        ) : <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-lg">
            <UserRound className="h-5 w-5 text-primary" />
            <span className="min-w-0 break-words">{customerInfo?.name || 'Customer'}</span>
          </DialogTitle>
          <DialogDescription>{viewMode === 'details' ? 'Customer details available to your role.' : 'Customer profile and the transaction history available to your role.'}</DialogDescription>
        </DialogHeader>}

        {loading && (
          <div className="flex min-h-48 items-center justify-center rounded-md border">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && data && viewMode === 'details' && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-md border p-4">
              <h3 className="font-semibold">Contact details</h3>
              <dl className="mt-3 divide-y">
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{data.customer.name}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{data.access.phone ? data.customer.phone || 'Not provided' : data.customer.maskedPhone || '07xxxxxx'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Email</dt><dd className="break-all text-right font-medium">{data.access.email ? data.customer.email || 'Not provided' : data.customer.maskedEmail || 'x******@*****'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Address</dt><dd className="max-w-[70%] text-right font-medium">{data.access.address ? data.customer.address || 'Not provided' : data.customer.maskedAddress || '******'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline">{data.customer.status || 'active'}</Badge></dd></div>
              </dl>
              {data.access.notes && data.customer.notes && <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm"><span className="font-medium">Notes: </span>{data.customer.notes}</p>}
              {!data.access.notes && data.customer.maskedNotes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Customer notes: {data.customer.maskedNotes}</p>}
            </section>
            <section className="rounded-md border p-4">
              <h3 className="font-semibold">Account summary</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {data.access.balance ? metric('Current Balance', data.summary.currentBalance) : maskedMetric('Current Balance')}
                {data.access.balance ? metric('Credit Limit', data.customer.creditLimit) : maskedMetric('Credit Limit')}
                {data.access.balance ? metric('Opening Balance', data.summary.openingBalance ?? data.customer.openingBalance) : maskedMetric('Opening Balance')}
              </div>
              {data.access.balance && (data.summary.openingBalanceDate || data.customer.openingBalanceDate) && <p className="mt-3 text-xs text-muted-foreground">Opening balance date: {formatDisplayDate(data.summary.openingBalanceDate || data.customer.openingBalanceDate || '')}</p>}
            </section>
          </div>
        )}

        {!loading && !error && data && viewMode === 'profile' && (
          <Tabs key={`${customer?.id || ''}-${open}`} defaultValue="overview" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 sm:w-fit sm:grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {canViewLedger && <TabsTrigger value="ledger">Transaction ledger ({Number(data.summary.transactionCount || 0).toLocaleString()})</TabsTrigger>}
              {canViewSalesAndPayments && <TabsTrigger value="sales-payments">Sales &amp; Payments</TabsTrigger>}
              {canViewCreditHistory && <TabsTrigger value="credit-history">Credit History</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[1.2fr_2fr]">
              <div className="rounded-md border p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Customer</p>
                <h3 className="mt-2 break-words text-lg font-semibold">{data.customer.name}</h3>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p>{data.access.phone ? data.customer.phone || 'No phone on file' : data.customer.maskedPhone || '07xxxxxx'}</p>
                  <p className="break-words">{data.access.email ? data.customer.email || 'No email on file' : data.customer.maskedEmail || 'x******@*****'}</p>
                  <p className="break-words">{data.access.address ? data.customer.address || 'No address on file' : data.customer.maskedAddress || '******'}</p>
                </div>
                {data.access.notes && data.customer.notes && <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm">{data.customer.notes}</p>}
                {!data.access.notes && data.customer.maskedNotes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Customer notes: {data.customer.maskedNotes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.customer.status && <Badge variant="outline">{data.customer.status}</Badge>}
                  <Badge variant="secondary">{data.access.balance ? `Trust ${Number(data.customer.trustScore || 0)}/100` : 'Trust ****'}</Badge>
                  <Badge variant="outline" className="gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Last {lastDate}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.access.balance ? metric('Current Balance', data.summary.currentBalance, Number(data.summary.currentBalance || 0) > 0 ? 'text-red-700' : 'text-green-700') : maskedMetric('Current Balance')}
                {data.access.balance ? metric('Available Credit', data.summary.availableCredit, Number(data.summary.availableCredit || 0) >= 0 ? 'text-green-700' : 'text-red-700') : maskedMetric('Available Credit')}
                {data.access.sales && metric('Credit / Customer Sales', data.summary.receivableSales)}
                {data.access.sales && metric('Cash POS Sales', data.summary.cashSales)}
                {data.access.payments ? metric('Payments', data.summary.payments, 'text-green-700') : maskedMetric('Payments')}
                {data.access.withdrawals ? metric('Withdrawals', data.summary.withdrawals) : maskedMetric('Withdrawals')}
                {data.access.creditNotes ? metric('Credit Notes', data.summary.creditNotes, 'text-green-700') : maskedMetric('Credit Notes')}
                {data.access.returns ? metric('Returns', data.summary.returns) : maskedMetric('Returns')}
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="mt-1 text-sm font-semibold sm:text-base">{Number(data.summary.transactionCount || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {(data.access.recordPayment || data.access.withdraw || data.access.edit || data.access.delete) && (
              <div className="flex flex-wrap gap-2 border-b pb-4">
                {data.access.recordPayment && onRecordPayment && (
                  <Button size="sm" onClick={() => onRecordPayment({ ...data.customer, ...data.summary })}>
                    Record Payment
                  </Button>
                )}
                {data.access.withdraw && onWithdraw && (
                  <Button size="sm" variant="outline" disabled={Number(data.summary.availableForWithdrawal ?? data.customer.availableForWithdrawal ?? 0) <= 0} onClick={() => onWithdraw({ ...data.customer, ...data.summary })}>
                    Withdraw Customer Funds
                  </Button>
                )}
                {data.access.edit && onEditCustomer && (
                  <Button size="sm" variant="outline" onClick={() => onEditCustomer({ ...data.customer, ...data.summary })}>
                    <Edit className="mr-1 h-4 w-4" />
                    Edit Customer
                  </Button>
                )}
                {data.access.delete && onDeleteCustomer && Number(data.summary.currentBalance || 0) === 0 && Number(data.summary.transactionCount || 0) === 0 && (
                  <Button size="sm" variant="destructive" onClick={() => onDeleteCustomer({ ...data.customer, ...data.summary, canDelete: true })}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete Customer
                  </Button>
                )}
              </div>
            )}

            </TabsContent>

            {canViewLedger && <TabsContent value="ledger" className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[1320px] w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length ? transactions.map((row) => (
                    <tr key={row.id} className="border-t align-top hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">{row.date ? formatDisplayDate(row.date) : '-'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.affectsBalance ? 'default' : 'outline'}>{row.type}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.reference || row.id}</td>
                      <td className="px-3 py-2">
                        <p className="break-words">{row.description || '-'}</p>
                        {row.branch && <p className="mt-1 text-xs text-muted-foreground">{row.branch}</p>}
                        {row.items?.length ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-primary">View goods/services ({row.items.length})</summary>
                            <div className="mt-2 overflow-x-auto rounded border">
                              <table className="min-w-[620px] w-full text-xs">
                                <thead className="bg-muted/40 text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Item</th>
                                    <th className="px-2 py-1 text-right">Qty</th>
                                    <th className="px-2 py-1 text-right">Price</th>
                                    <th className="px-2 py-1 text-right">Discount</th>
                                    <th className="px-2 py-1 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.items.map((item, index) => (
                                    <tr key={item.id || index} className="border-t">
                                      <td className="px-2 py-1">
                                        <span className="block break-words font-medium">{item.productName || 'Item'}</span>
                                        {item.sku && <span className="text-muted-foreground">{item.sku}</span>}
                                      </td>
                                      <td className="px-2 py-1 text-right">{item.quantity || 0} {item.unitName || ''}</td>
                                      <td className="px-2 py-1 text-right">{formatCurrency(Number(item.unitPrice || 0))}</td>
                                      <td className="px-2 py-1 text-right">{formatCurrency(Number(item.discount || 0))}</td>
                                      <td className="px-2 py-1 text-right font-medium">{formatCurrency(Number(item.total || 0))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 capitalize">{normalizeText(row.paymentMethod) || '-'}</td>
                      <td className="px-3 py-2">{row.staff || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(row.amount || 0))}</td>
                      <td className="px-3 py-2 text-right">{Number(row.debit || 0) > 0 ? formatCurrency(Number(row.debit)) : '-'}</td>
                      <td className="px-3 py-2 text-right">{Number(row.credit || 0) > 0 ? formatCurrency(Number(row.credit)) : '-'}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold', data.access.balance ? transactionTone(row) : 'text-muted-foreground')}>{data.access.balance ? formatCurrency(Number(row.balance || 0)) : '******'}</td>
                      <td className="px-3 py-2">
                        {data.access.printReceipts && (row.receiptStatus ? <Badge variant={row.receiptStatus === 'cancelled' ? 'destructive' : 'outline'}>{row.receiptStatus === 'cancelled' ? 'Cancelled' : 'Adjusted'}</Badge> : !['credit_note', 'sale_return'].includes(row.source) && !/opening balance|system adjustment/i.test(`${row.type} ${row.source}`) && <TransactionReceiptButton data={customerActivityReceipt(row, data.customer.name)} />)}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                        {Object.values(data.access).some(Boolean) ? 'No transactions are available for this customer and your assigned permissions.' : 'No customer profile details or history are assigned to your role.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {data.access.balance && <><ReceiptText className="h-4 w-4" /><span>Debit increases the customer balance. Credit reduces the customer balance.</span></>}
              {data.access.sales && <><Wallet className="ml-2 h-4 w-4" /><span>Cash POS sales are shown as activity but do not change receivables.</span></>}
              {data.access.balance && <><CreditCard className="ml-2 h-4 w-4" /><span>Current balance comes from the customer account.</span></>}
            </div>
            </TabsContent>}

            {canViewSalesAndPayments && <TabsContent value="sales-payments" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.access.sales && metric('Credit / Customer Sales', data.summary.receivableSales)}
                {data.access.sales && metric('Cash POS Sales', data.summary.cashSales)}
                {data.access.payments ? metric('Payments Received', data.summary.payments, 'text-green-700') : maskedMetric('Payments Received')}
                {data.access.balance ? metric('Current Balance', data.summary.currentBalance, Number(data.summary.currentBalance || 0) > 0 ? 'text-red-700' : 'text-green-700') : maskedMetric('Current Balance')}
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Amount</th>{data.access.printReceipts && <th className="px-3 py-2 text-right">Reprint</th>}</tr>
                  </thead>
                  <tbody>
                    {transactions.filter((row) => ['receivable_sale', 'pos_sale', 'customer_invoice', 'customer_payment', 'sale_payment_adjustment'].includes(row.source)).map((row) => (
                      <tr key={row.id} className="border-t align-top hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2">{row.date ? formatDisplayDate(row.date) : '-'}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{row.type}</Badge></td>
                        <td className="px-3 py-2 font-mono text-xs">{row.reference || row.id}</td>
                        <td className="px-3 py-2">{row.description || '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(row.amount || row.debit || row.credit || 0))}</td>
                        {data.access.printReceipts && <td className="px-3 py-2 text-right">{row.receiptStatus ? <Badge variant={row.receiptStatus === 'cancelled' ? 'destructive' : 'outline'}>{row.receiptStatus === 'cancelled' ? 'Cancelled' : 'Adjusted'}</Badge> : ['receivable_sale', 'pos_sale', 'customer_invoice', 'customer_payment'].includes(row.source) && <TransactionReceiptButton
                          label={row.source === 'customer_payment' ? 'Reprint receipt' : row.source === 'pos_sale' ? 'Reprint receipt' : 'Reprint invoice'}
                          data={{
                            title: row.source === 'customer_payment' ? 'Customer Payment Receipt' : row.source === 'pos_sale' ? 'Sales Receipt' : 'Sales Invoice',
                            reference: row.reference || row.id,
                            date: row.date || new Date(),
                            amount: Number(row.amount || row.debit || row.credit || 0),
                            partyLabel: 'Customer',
                            partyName: data.customer.name,
                            items: row.source === 'customer_payment' ? undefined : row.items?.map((item) => ({
                              name: item.productName || 'Item', quantity: Number(item.quantity || 0), unitName: item.unitName || '',
                              unitPrice: Number(item.unitPrice || 0), discount: Number(item.discount || 0), total: Number(item.total || 0),
                            })),
                            fields: row.source === 'customer_payment'
                              ? [{ label: 'Payment method', value: row.paymentMethod }, { label: 'Description', value: row.description }, { label: 'Status', value: row.status }]
                              : [
                                { label: 'Payment status', value: row.status },
                                ...(row.source === 'receivable_sale' || row.source === 'customer_invoice' ? [{ label: 'Paid to date', value: formatCurrency(Number(row.amountPaid || 0)) }, { label: 'Balance due', value: formatCurrency(Number(row.remainingBalance || 0)) }] : []),
                                { label: 'Payment method', value: row.paymentMethod }, { label: 'Served by', value: row.staff },
                              ],
                          }}
                        />}</td>}
                      </tr>
                    ))}
                    {!transactions.some((row) => ['receivable_sale', 'pos_sale', 'customer_invoice', 'customer_payment', 'sale_payment_adjustment'].includes(row.source)) && (
                      <tr><td colSpan={data.access.printReceipts ? 6 : 5} className="px-3 py-8 text-center text-muted-foreground">
                        {data.access.sales || data.access.payments ? 'No sales or payment activity is available.' : 'Sales and payment activity is not assigned to your role.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>}

            {canViewCreditHistory && <TabsContent value="credit-history" className="space-y-5">
              <section aria-label="Customer credit position" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
                <div className="grid content-start gap-3 sm:grid-cols-2">
                  {metric('Receivable exposure', data.creditHistory!.receivableExposure, 'text-red-700')}
                  {metric('Customer funds on account', data.creditHistory!.customerFunds, 'text-emerald-700')}
                  {metric('Credit limit', data.creditHistory!.creditLimit)}
                  {metric('Limit remaining', data.creditHistory!.availableLimit, 'text-emerald-700')}
                  <div className="rounded-md border bg-muted/20 p-4 sm:col-span-2">
                    <h3 className="text-sm font-semibold">Credit position at a glance</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant={data.creditHistory!.utilizationPercent != null && data.creditHistory!.utilizationPercent > 100 ? 'destructive' : 'outline'}>
                        {data.creditHistory!.utilizationPercent == null ? 'No limit set' : data.creditHistory!.utilizationPercent > 100 ? 'Over limit' : data.creditHistory!.utilizationPercent >= 80 ? 'Near limit' : 'Within limit'}
                      </Badge>
                      {data.access.sales && (() => {
                        const overdue = data.creditHistory!.aging.days1To30 + data.creditHistory!.aging.days31To60 + data.creditHistory!.aging.days61To90 + data.creditHistory!.aging.over90Days
                        return <Badge variant={overdue > 0 ? 'destructive' : 'outline'}>{overdue > 0 ? `${formatCurrency(overdue)} overdue` : 'No recorded overdue balance'}</Badge>
                      })()}
                      <Badge variant="secondary">Repayment trust {Number(data.customer.trustScore || 0)}/100</Badge>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Limit use measures exposure, ageing shows what is past due, and trust summarizes repayment behavior. Read these signals together; high utilization alone does not mean late payment.</p>
                  </div>
                </div>
                <CreditUtilizationGauge percent={data.creditHistory!.utilizationPercent} availableLimit={data.creditHistory!.availableLimit} trustScore={Number(data.customer.trustScore || 0)} />
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold">Receivables ageing</h3>
                    <p className="text-xs text-muted-foreground">Outstanding credit sales grouped by recorded due date, as of {formatDisplayDate(data.creditHistory!.asOf)}.</p>
                  </div>
                </div>
                {data.access.sales ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {[
                    ['Not due', data.creditHistory!.aging.notDue],
                    ['1–30 days overdue', data.creditHistory!.aging.days1To30],
                    ['31–60 days overdue', data.creditHistory!.aging.days31To60],
                    ['61–90 days overdue', data.creditHistory!.aging.days61To90],
                    ['Over 90 days', data.creditHistory!.aging.over90Days],
                    ['No due date recorded', data.creditHistory!.aging.noDueDate],
                  ].map(([label, amount]) => <div key={String(label)} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-sm font-semibold">{formatCurrency(Number(amount))}</p>
                  </div>)}
                </div> : <p className="rounded-md border p-4 text-sm text-muted-foreground">Credit sale details are restricted by your role.</p>}
              </section>

              {data.access.sales && <section>
                <div className="mb-3 flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Open credit sales ({data.creditHistory!.openSales.length})</h3>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="px-3 py-2">Sale</th><th className="px-3 py-2">Sale date</th><th className="px-3 py-2">Due date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Original amount</th><th className="px-3 py-2 text-right">Outstanding</th></tr>
                    </thead>
                    <tbody>
                      {data.creditHistory!.openSales.map((sale) => <tr key={sale.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{sale.reference}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatDisplayDate(sale.date)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{sale.dueDate ? formatDisplayDate(sale.dueDate) : 'Not recorded'}</td>
                        <td className="px-3 py-2"><Badge variant={sale.daysPastDue && sale.daysPastDue > 0 ? 'destructive' : 'outline'}>{sale.daysPastDue == null ? 'No due date' : sale.daysPastDue > 0 ? `${sale.daysPastDue} days overdue` : 'Not due'}</Badge></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(sale.total)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-red-700">{formatCurrency(sale.balance)}</td>
                      </tr>)}
                      {!data.creditHistory!.openSales.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No open credit sales.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>}

              <section>
                <h3 className="mb-3 text-sm font-semibold">Credit account activity</h3>
                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr>
                    </thead>
                    <tbody>
                      {creditActivity.map((row) => <tr key={row.id} className="border-t align-top">
                        <td className="whitespace-nowrap px-3 py-2">{row.date ? formatDisplayDate(row.date) : '—'}</td>
                        <td className="px-3 py-2"><div className="font-medium">{row.type}</div><div className="text-xs text-muted-foreground">{row.description || ''}</div></td>
                        <td className="px-3 py-2 font-mono text-xs">{row.reference || '—'}</td>
                        <td className="px-3 py-2 capitalize">{normalizeText(row.paymentMethod) || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{Number(row.debit || 0) ? formatCurrency(Number(row.debit)) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{Number(row.credit || 0) ? formatCurrency(Number(row.credit)) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{data.access.balance ? formatCurrency(Number(row.balance || 0)) : '******'}</td>
                      </tr>)}
                      {!creditActivity.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No credit activity is available for this customer.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </TabsContent>}
          </Tabs>
        )}

        {presentation === 'dialog' && <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>}
    </div>
  )

  if (presentation === 'page') {
    return <main className="mx-auto w-full max-w-[1800px] p-3 sm:p-5 lg:p-6">{content}</main>
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-0.5rem)] max-w-[calc(100vw-0.5rem)] overflow-y-auto p-3 sm:w-[96vw] sm:max-w-[96vw] sm:p-5 lg:w-[95vw] lg:max-w-[95vw] xl:w-[94vw] xl:max-w-[94vw] 2xl:w-[92vw] 2xl:max-w-[1800px]">
        {content}
      </DialogContent>
    </Dialog>
  )
}
