import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, CreditCard, Loader2, ReceiptText, UserRound, Wallet } from 'lucide-react'
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
  description?: string | null
  debit?: number
  credit?: number
  amount?: number
  amountPaid?: number
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
    notes: boolean
    recordPayment: boolean
    printReceipts: boolean
    edit: boolean
    delete: boolean
    withdraw: boolean
  }
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

function transactionTone(row: CustomerHistoryTransaction) {
  if (Number(row.debit || 0) > 0) return 'text-red-700'
  if (Number(row.credit || 0) > 0) return 'text-green-700'
  return 'text-foreground'
}

export default function CustomerTransactionHistoryDialog({
  customer,
  open,
  onOpenChange,
  onRecordPayment,
  onWithdraw,
}: {
  customer: CustomerHistoryTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecordPayment?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  onWithdraw?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
}) {
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
        const response = await apiFetch(`/api/receivables/customers/${customer.id}/history?limit=500`, {
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
  }, [open, customer?.id])

  const customerInfo = data?.customer || customer
  const transactions = data?.transactions || []
  const lastDate = useMemo(() => data?.summary?.lastTransactionDate ? formatDisplayDate(data.summary.lastTransactionDate) : 'No activity yet', [data?.summary?.lastTransactionDate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-0.5rem)] max-w-[calc(100vw-0.5rem)] overflow-y-auto p-3 sm:w-[96vw] sm:max-w-[96vw] sm:p-5 lg:w-[95vw] lg:max-w-[95vw] xl:w-[94vw] xl:max-w-[94vw] 2xl:w-[92vw] 2xl:max-w-[1800px]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-lg">
            <UserRound className="h-5 w-5 text-primary" />
            <span className="min-w-0 break-words">{customerInfo?.name || 'Customer'}</span>
          </DialogTitle>
          <DialogDescription>Customer profile and the transaction history available to your role.</DialogDescription>
        </DialogHeader>

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

        {!loading && !error && data && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 sm:w-fit">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ledger">Transaction ledger ({Number(data.summary.transactionCount || 0).toLocaleString()})</TabsTrigger>
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
                {data.access.balance ? metric('Opening Balance', data.summary.openingBalance ?? data.customer.openingBalance) : maskedMetric('Opening Balance')}
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

            {(data.access.recordPayment || data.access.withdraw) && (
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
              </div>
            )}

            {data.access.balance && Number(data.summary.openingBalance ?? data.customer.openingBalance ?? 0) > 0 && (
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Opening Balance</p>
                <p className="mt-1 text-muted-foreground">
                  {formatCurrency(Number(data.summary.openingBalance ?? data.customer.openingBalance ?? 0))}
                  {' '}from {data.summary.openingBalanceDate || data.customer.openingBalanceDate ? formatDisplayDate(data.summary.openingBalanceDate || data.customer.openingBalanceDate || '') : 'the recorded opening date'}
                  {(data.summary.openingBalanceNote || (data.customer as any).openingBalanceNote) ? ` - ${data.summary.openingBalanceNote || (data.customer as any).openingBalanceNote}` : ''}
                </p>
              </div>
            )}
            </TabsContent>

            <TabsContent value="ledger" className="space-y-4">
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
                        {data.access.printReceipts && !/opening balance|system adjustment/i.test(`${row.type} ${row.source}`) && <TransactionReceiptButton data={{
                          title: `${row.type || 'Customer transaction'} receipt`, reference: row.reference || row.id,
                          date: row.date || new Date(), amount: Number(row.amount || row.debit || row.credit || 0),
                          partyLabel: 'Customer', partyName: data.customer.name,
                          fields: [{ label: 'Transaction type', value: row.type }, { label: 'Description', value: row.description }, { label: 'Payment method', value: row.paymentMethod }, { label: 'Staff', value: row.staff }, { label: 'Debit', value: row.debit ? formatCurrency(Number(row.debit)) : '' }, { label: 'Credit', value: row.credit ? formatCurrency(Number(row.credit)) : '' }, { label: 'Status', value: row.status }],
                        }} />}
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
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
