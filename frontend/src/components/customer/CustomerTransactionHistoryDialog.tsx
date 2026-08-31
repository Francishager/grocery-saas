import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, CreditCard, Loader2, ReceiptText, UserRound, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'
import { cn, formatCurrency, formatDisplayDate } from '@/lib/utils'

export type CustomerHistoryTarget = {
  id?: string | null
  name?: string | null
  phone?: string | null
  email?: string | null
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
    status?: string
    creditLimit?: number
    balance?: number
    openingBalance?: number
    openingBalanceDate?: string | null
    trustScore?: number
  }
  summary: {
    currentBalance?: number
    availableCredit?: number
    receivableSales?: number
    cashSales?: number
    payments?: number
    creditNotes?: number
    returns?: number
    transactionCount?: number
    openingBalance?: number
    openingBalanceDate?: string | null
    openingBalanceNote?: string | null
    lastTransactionDate?: string | null
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

function transactionTone(row: CustomerHistoryTransaction) {
  if (Number(row.debit || 0) > 0) return 'text-red-700'
  if (Number(row.credit || 0) > 0) return 'text-green-700'
  return 'text-foreground'
}

export default function CustomerTransactionHistoryDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: CustomerHistoryTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
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
          <DialogDescription>
            Balances, payments, credit notes, sold goods, and customer activity.
          </DialogDescription>
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
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[1.2fr_2fr]">
              <div className="rounded-md border p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Customer</p>
                <h3 className="mt-2 break-words text-lg font-semibold">{data.customer.name}</h3>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {data.customer.phone && <p>{data.customer.phone}</p>}
                  {data.customer.email && <p className="break-words">{data.customer.email}</p>}
                  {data.customer.address && <p className="break-words">{data.customer.address}</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.customer.status && <Badge variant="outline">{data.customer.status}</Badge>}
                  <Badge variant="secondary">Trust {Number(data.customer.trustScore || 0)}/100</Badge>
                  <Badge variant="outline" className="gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Last {lastDate}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metric('Current Balance', data.summary.currentBalance, Number(data.summary.currentBalance || 0) > 0 ? 'text-red-700' : 'text-green-700')}
                {metric('Opening Balance', data.summary.openingBalance ?? data.customer.openingBalance)}
                {metric('Available Credit', data.summary.availableCredit, Number(data.summary.availableCredit || 0) >= 0 ? 'text-green-700' : 'text-red-700')}
                {metric('Credit / Customer Sales', data.summary.receivableSales)}
                {metric('Cash POS Sales', data.summary.cashSales)}
                {metric('Payments', data.summary.payments, 'text-green-700')}
                {metric('Credit Notes', data.summary.creditNotes, 'text-green-700')}
                {metric('Returns', data.summary.returns)}
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="mt-1 text-sm font-semibold sm:text-base">{Number(data.summary.transactionCount || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {Number(data.summary.openingBalance ?? data.customer.openingBalance ?? 0) > 0 && (
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Opening Balance</p>
                <p className="mt-1 text-muted-foreground">
                  {formatCurrency(Number(data.summary.openingBalance ?? data.customer.openingBalance ?? 0))}
                  {' '}from {data.summary.openingBalanceDate || data.customer.openingBalanceDate ? formatDisplayDate(data.summary.openingBalanceDate || data.customer.openingBalanceDate || '') : 'the recorded opening date'}
                  {(data.summary.openingBalanceNote || (data.customer as any).openingBalanceNote) ? ` - ${data.summary.openingBalanceNote || (data.customer as any).openingBalanceNote}` : ''}
                </p>
              </div>
            )}

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
                      <td className={cn('px-3 py-2 text-right font-semibold', transactionTone(row))}>{formatCurrency(Number(row.balance || 0))}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                        No transactions found for this customer.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ReceiptText className="h-4 w-4" />
              <span>Debit increases the customer balance. Credit reduces the customer balance.</span>
              <Wallet className="ml-2 h-4 w-4" />
              <span>Cash POS sales are shown as activity but do not change receivables.</span>
              <CreditCard className="ml-2 h-4 w-4" />
              <span>Current balance comes from the customer account.</span>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
