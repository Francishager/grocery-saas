import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer, Search } from 'lucide-react'
import { rentalsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'

type PaymentRow = { payment: any; rental: any }

export default function RentalPaymentsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await rentalsApi.list({ limit: 500 })
      setRows((data?.rentals || []).flatMap((rental: any) => (rental.payments || []).map((payment: any) => ({ payment, rental }))))
    } catch (error: any) {
      toast({ title: 'Could not load rental receipts', description: error?.message || 'Please retry.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const sorted = [...rows].sort((a, b) => new Date(b.payment.paymentDate).getTime() - new Date(a.payment.paymentDate).getTime())
    if (!query) return sorted
    return sorted.filter(({ payment, rental }) => [payment.receiptNo, payment.kind, payment.transactionRef, payment.cashAccount?.name, rental.rentalNo, rental.customer?.name, rental.customerName].some(value => String(value || '').toLowerCase().includes(query)))
  }, [rows, search])
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(filtered, 15)

  const printReceipt = async ({ rental, payment }: PaymentRow) => {
    try {
      const data = await rentalsApi.receipt(rental.id, payment.id)
      const receipt = data.payment
      const escaped = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
      const lines = (receipt.rental?.items || []).map((item: any) => `<tr><td>${escaped(item.product?.name)}</td><td>${Number(item.quantity || 0)}</td><td>${escaped(formatCurrency(item.totalAmount))}</td></tr>`).join('')
      const popup = window.open('', '_blank')
      if (!popup) { toast({ title: 'Print blocked', description: 'Allow pop-ups to print this receipt.', variant: 'destructive' }); return }
      popup.opener = null
      popup.document.write(`<html><head><title>Rental receipt ${escaped(receipt.receiptNo)}</title><style>body{font:14px Arial,sans-serif;color:#111;margin:28px}header{text-align:center;border-bottom:1px solid #bbb;padding-bottom:12px}h1{font-size:20px;margin:4px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}.right{text-align:right}.total{text-align:right;font-size:18px;font-weight:bold}</style></head><body><header><h1>${escaped(receipt.tenant?.name || 'Business')}</h1><div>${escaped(receipt.tenant?.address || '')}</div><div>${escaped(receipt.tenant?.phone || '')} ${escaped(receipt.tenant?.email || '')}</div><h2>Rental payment receipt</h2></header><p><b>Receipt:</b> ${escaped(receipt.receiptNo)}<br><b>Rental:</b> ${escaped(receipt.rental?.rentalNo)}<br><b>Customer:</b> ${escaped(receipt.rental?.customer?.name || receipt.rental?.customerName || 'Renter')}<br><b>Date:</b> ${escaped(new Date(receipt.paymentDate).toLocaleString())}<br><b>Type:</b> ${escaped(String(receipt.kind || '').replaceAll('_', ' '))}<br><b>Method:</b> ${escaped(receipt.paymentMethod || '—')} / ${escaped(receipt.cashAccount?.name || '—')}</p><table><thead><tr><th>Rental item</th><th>Qty</th><th>Value</th></tr></thead><tbody>${lines}</tbody></table><p class="total">${escaped(formatCurrency(receipt.amount))}</p><p>Balance after receipt: ${escaped(formatCurrency(receipt.balanceAfter))}<br>Reference: ${escaped(receipt.transactionRef || '—')}</p><footer>JibuSales</footer><script>window.onload=()=>window.print()</script></body></html>`)
      popup.document.close()
    } catch (error: any) {
      toast({ title: 'Receipt unavailable', description: error?.message || 'Could not load this receipt.', variant: 'destructive' })
    }
  }

  return <div className="min-w-0 space-y-5 p-4 md:p-6">
    <header><p className="text-sm font-medium text-primary">Rentals</p><h1 className="text-2xl font-semibold">Payments &amp; Receipts</h1><p className="mt-1 text-sm text-muted-foreground">Rental collections, advances, deposits, refunds, and printable receipt history.</p></header>
    <Card><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Posted rental transactions</CardTitle><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search rental payments" value={search} onChange={event => setSearch(event.target.value)} placeholder="Receipt, renter, rental…" className="pl-9" /></div></CardHeader><CardContent>
      {loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading payments…</div> : !filtered.length ? <div className="py-12 text-center text-sm text-muted-foreground">No posted rental payments match this search.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-3 pr-3">Receipt</th><th className="py-3 pr-3">Rental</th><th className="py-3 pr-3">Customer</th><th className="py-3 pr-3">Date</th><th className="py-3 pr-3">Type</th><th className="py-3 pr-3">Account</th><th className="py-3 pr-3 text-right">Amount</th><th className="py-3 text-right">Print</th></tr></thead><tbody>{paginatedItems.map(({ payment, rental }) => <tr key={payment.id} className="border-b last:border-0"><td className="py-3 pr-3 font-medium">{payment.receiptNo}</td><td className="py-3 pr-3">{rental.rentalNo}</td><td className="py-3 pr-3">{rental.customer?.name || rental.customerName || 'Renter'}</td><td className="py-3 pr-3 whitespace-nowrap">{new Date(payment.paymentDate).toLocaleString()}</td><td className="py-3 pr-3 capitalize">{String(payment.kind || '').replaceAll('_', ' ')}</td><td className="py-3 pr-3">{payment.cashAccount?.name || 'Non-cash settlement'}</td><td className="py-3 pr-3 text-right tabular-nums">{formatCurrency(payment.amount)}</td><td className="py-3 text-right"><Button size="sm" variant="outline" onClick={() => void printReceipt({ payment, rental })}><Printer className="mr-2 h-4 w-4" />Reprint</Button></td></tr>)}</tbody></table></div>}
      <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={goToPage} />
    </CardContent></Card>
  </div>
}
