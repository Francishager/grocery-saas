import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Banknote, BarChart3, BriefcaseBusiness, CreditCard, Package, ReceiptText, Smartphone, UserRound, UsersRound, WalletCards, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'

export interface DailyBusinessData {
  header: {
    date: string
    businessName?: string
    businessPhone?: string
    businessAddress?: string
    branch: string
    status: string
    generatedBy?: string
  }
  summary: Record<string, number>
  cashMovement: Record<string, number>
  profitability: Record<string, number>
  customerActivity: any[]
  staffActivity: any[]
  productActivity: any[]
  transactions: any[]
  staffTills: any[]
  generatedAt: string
}

type Drilldown = { title: string; rows: any[] } | null
type SummaryCard = { label: string; value: number; kinds: string[]; methods?: string[]; icon: typeof BarChart3 }

const money = (value: unknown) => formatCurrency(Number(value || 0))
const text = (value: unknown) => String(value || '-').replace(/_/g, ' ')
const customerIdOf = (row: any) => row?.customerId || (row?.registered ? row?.id : '')

function DetailModal({ drilldown, onClose, onTransaction }: { drilldown: Drilldown; onClose: () => void; onTransaction: (row: any) => void }) {
  if (!drilldown) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 print:hidden sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full overflow-hidden rounded-t-xl bg-background shadow-xl sm:max-w-6xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold sm:text-lg">{drilldown.title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details"><X className="h-5 w-5" /></Button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-4 sm:p-6">
          {drilldown.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No transactions match this figure.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Cash</th>
                    <th className="px-3 py-2 text-right">Sale Credit</th>
                    <th className="px-3 py-2 text-right">Customer Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldown.rows.map((row, index) => (
                    <tr key={row.id || index} className="border-t hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">{row.date ? new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="px-3 py-2"><button className="font-mono text-primary underline-offset-2 hover:underline" onClick={() => onTransaction(row)}>{row.reference || row.id}</button></td>
                      <td className="px-3 py-2">{row.customer || '-'}</td>
                      <td className="px-3 py-2">{row.staff || '-'}</td>
                      <td className="px-3 py-2 capitalize">{text(row.paymentMethod)}</td>
                      <td className="px-3 py-2 text-right">{money(row.debit)}</td>
                      <td className="px-3 py-2 text-right">{money(row.credit)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{money(row.amount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.cashAmount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.creditAmount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.customerBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TransactionModal({ row, onClose }: { row: any; onClose: () => void }) {
  if (!row) return null
  const fields = [
    ['Reference', row.reference || row.id],
    ['Date / Time', row.date ? new Date(row.date).toLocaleString() : '-'],
    ['Type', row.kind === 'credit-sale' ? 'Credit Sale' : row.kind === 'collection' ? 'Customer Payment' : row.kind === 'expense' ? 'Expense' : row.kind === 'transfer' ? 'Cash Transfer' : 'Sale'],
    ['Customer', row.customer || 'Walk-in'],
    ['Customer Balance', money(row.customerBalance)],
    ['Staff', row.staff || '-'],
    ['Branch', row.branch || '-'],
    ['Payment Method', text(row.paymentMethod)],
    ['Amount', money(row.amount)],
    ['Debit', money(row.debit)],
    ['Credit', money(row.credit)],
    ['Cash Portion', money(row.cashAmount)],
    ['Credit Portion', money(row.creditAmount)],
    ['Status', row.status || 'Completed'],
  ]
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 print:hidden sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full overflow-auto rounded-t-xl bg-background p-5 shadow-xl sm:max-w-3xl sm:rounded-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transaction Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close transaction details"><X className="h-5 w-5" /></Button>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>
        {Array.isArray(row.items) && row.items.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 font-semibold">Items Sold</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="bg-muted/50">
                  <tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">COGS</th><th className="px-3 py-2 text-right">Gross Profit</th></tr>
                </thead>
                <tbody>
                  {row.items.map((item: any, index: number) => (
                    <tr className="border-t" key={item.productId || index}>
                      <td className="px-3 py-2">{item.product}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{money(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{money(item.total)}</td>
                      <td className="px-3 py-2 text-right">{money(item.cost)}</td>
                      <td className="px-3 py-2 text-right">{money(item.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DailyBusinessReport({ data }: { data: DailyBusinessData }) {
  const [drilldown, setDrilldown] = useState<Drilldown>(null)
  const [transaction, setTransaction] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const transactions = data.transactions || []
  const summary = data.summary || {}
  const cash = data.cashMovement || {}
  const profitability = data.profitability || {}

  const openKind = (title: string, kinds: string[], methods?: string[]) => {
    setDrilldown({ title, rows: transactions.filter((row) => kinds.includes(row.kind) && (!methods?.length || methods.includes(row.paymentMethod))) })
  }
  const openRows = (title: string, rows: any[]) => setDrilldown({ title, rows })
  const customerTransactions = useMemo(() => customer ? (customer.transactions || transactions.filter((row) => row.customerId === customerIdOf(customer) || row.customer === customer.name)) : [], [customer, transactions])
  const selectedCustomerId = customerIdOf(customer)

  const cards: SummaryCard[] = [
    { label: 'Total Sales', value: Number(summary.totalSales || 0), kinds: ['sale', 'credit-sale'], icon: BarChart3 },
    { label: 'Cash Sales', value: Number(summary.cashSales || 0), kinds: ['sale', 'credit-sale'], methods: ['cash'], icon: Banknote },
    { label: 'Credit Sales', value: Number(summary.creditSales || 0), kinds: ['credit-sale'], icon: CreditCard },
    { label: 'Mobile Money Sales', value: Number(summary.mobileMoneySales || 0), kinds: ['sale', 'credit-sale'], methods: ['mobile_money'], icon: Smartphone },
    { label: 'Bank / Card Sales', value: Number(summary.bankSales || 0) + Number(summary.cardSales || 0), kinds: ['sale', 'credit-sale'], methods: ['bank', 'card'], icon: ArrowUpFromLine },
    { label: 'Debt Collections', value: Number(summary.debtCollections || 0), kinds: ['collection'], icon: ReceiptText },
    { label: 'Expenses', value: Number(summary.expenses || 0), kinds: ['expense'], icon: ArrowDownToLine },
  ]

  const cashRows = [
    ['Cash at Hand', cash.cashAtHand],
    ['Opening Physical Cash', cash.openingCash],
    ['Cash Sales', cash.cashSales],
    ['Cash Debt Collections', cash.cashCollections],
    ['Other Cash In', cash.otherCashIn],
    ['Cash Transfers In', cash.cashTransfersIn],
    ['Cash Expenses', cash.cashExpenses],
    ['Other Cash Out', cash.otherCashOut],
    ['Cash Transfers Out', cash.cashTransfersOut],
    ['Moved to Safe', cash.cashToSafe],
    ['Moved to Bank', cash.cashToBank],
    ['Moved to Mobile Money', cash.cashToMobileMoney],
    ['Net Cash Movement', cash.netCashMovement],
    ['Cash Retained / Float', cash.cashRetained],
  ]
  const balancingTotals = [
    { label: 'Cash at Hand', value: cash.cashAtHand, note: 'Physical cash after credit, expenses, safe and bank movements', kinds: ['sale', 'collection', 'cash-movement', 'transfer'] },
    { label: 'Cash Sales', value: summary.cashSales, note: 'Sales paid by cash', kinds: ['sale', 'credit-sale'], methods: ['cash'] },
    { label: 'Credit Sales', value: summary.creditSales, note: 'Customer balances created', kinds: ['credit-sale'] },
    { label: 'Debt Collections', value: summary.debtCollections, note: 'Payments on old credit', kinds: ['collection'] },
    { label: 'Expenses', value: summary.expenses, note: 'Money spent today', kinds: ['expense'] },
    { label: 'Net Cash Movement', value: cash.netCashMovement, note: 'Cash in minus expenses, safe and bank movements', kinds: ['sale', 'collection', 'expense', 'cash-movement', 'transfer'] },
    { label: 'Gross Profit', value: profitability.grossProfit, note: 'Sales minus COGS', kinds: ['sale', 'credit-sale'] },
    { label: 'Net Profit', value: profitability.netProfit, note: 'Gross profit minus expenses', kinds: ['sale', 'credit-sale', 'expense'] },
  ]

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Daily Business Report</p>
          <h1 className="hidden break-words text-2xl font-bold print:block">{data.header.businessName || 'Business'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDisplayDate(data.header.date)} - {data.header.branch}</p>
          {(data.header.businessPhone || data.header.businessAddress) && <p className="mt-1 hidden text-xs text-muted-foreground print:block">{[data.header.businessPhone, data.header.businessAddress].filter(Boolean).join(' - ')}</p>}
        </div>
        <div className="text-left text-sm sm:text-right">
          <Badge variant={data.header.status === 'Closed' ? 'secondary' : 'default'}>{data.header.status}</Badge>
          <p className="mt-2 text-xs text-muted-foreground">Generated {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}</p>
          {data.header.generatedBy && <p className="text-xs text-muted-foreground">By {data.header.generatedBy}</p>}
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Day Balancing Totals</h2>
            <p className="text-xs text-muted-foreground">Use these totals to close and balance the business day.</p>
          </div>
          <Badge variant="outline" className="w-fit">{formatDisplayDate(data.header.date)}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balancingTotals.map((item) => (
            <button key={item.label} className="min-w-0 text-left print:pointer-events-none" onClick={() => openKind(item.label, item.kinds, item.methods)}>
              <Card className={item.label === 'Cash at Hand' ? 'h-full border-primary/60 bg-primary/5' : 'h-full transition hover:border-primary hover:shadow-sm'}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
                  <p className="mt-2 break-words text-xl font-bold leading-tight">{money(item.value)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sales and Collections</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {cards.map(({ label, value, kinds, methods, icon: Icon }) => (
            <button key={label} className="min-w-0 text-left print:pointer-events-none" onClick={() => openKind(label, kinds, methods)}>
              <Card className="h-full transition hover:border-primary hover:shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-xs font-semibold uppercase text-muted-foreground">{label}</p><Icon className="h-4 w-4 shrink-0 text-primary" /></div>
                  <p className="mt-3 break-words text-lg font-bold leading-tight sm:text-xl">{money(value)}</p>
                  <p className="mt-1 text-xs text-primary print:hidden">View transactions</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4" />Cash Status Report</CardTitle></CardHeader>
          <CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cashRows.map(([label, value]) => <div key={label} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-semibold">{money(value)}</p></div>)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BriefcaseBusiness className="h-4 w-4" />Profitability</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              ['Revenue', profitability.revenue],
              ['COGS', profitability.cogs],
              ['Gross Profit', profitability.grossProfit],
              ['Net Profit', profitability.netProfit],
            ].map(([label, value]) => <button key={label} className="rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => openKind(`${label} Support`, ['sale', 'credit-sale'])}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-semibold">{money(value)}</p></button>)}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4" />Customer Activity</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {data.customerActivity?.length ? data.customerActivity.map((row: any) => <button key={row.id} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => setCustomer(row)}><span className="min-w-0"><span className="block break-words font-medium text-primary">{row.name}</span><span className="text-xs text-muted-foreground">Cash {money(row.cashSales)} - Credit {money(row.creditSales)} - Paid {money(row.payments)}</span></span><span className="shrink-0 text-right text-sm"><span className="block font-semibold">{money(row.currentBalance)}</span><span className="text-xs text-muted-foreground">Balance</span></span></button>) : <p className="text-sm text-muted-foreground">No customer activity.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4" />Staff Activity</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {data.staffActivity?.length ? data.staffActivity.map((row: any) => <button key={row.id} className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => openRows(`${row.name} Activity`, transactions.filter((tx) => tx.staffId === row.id))}><span className="min-w-0 font-medium">{row.name}</span><span className="shrink-0 text-right text-sm"><span className="block font-semibold">{money(row.sales)}</span><span className="text-xs text-muted-foreground">Collections {money(row.collections)}</span></span></button>) : <p className="text-sm text-muted-foreground">No staff activity.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" />Product Activity</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {data.productActivity?.length ? data.productActivity.slice(0, 20).map((row: any) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="min-w-0"><span className="block break-words font-medium">{row.name}</span><span className="text-xs text-muted-foreground">Qty {row.quantitySold} - Stock {row.currentStock} - Profit {money(row.grossProfit)}</span></span><span className="shrink-0 font-semibold">{money(row.salesValue)}</span></div>) : <p className="text-sm text-muted-foreground">No product activity.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" />Staff Tills and Cash Accounts</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Staff</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Cash In</th><th className="px-3 py-2 text-right">Cash Out</th><th className="px-3 py-2 text-right">Transfers In</th><th className="px-3 py-2 text-right">Transfers Out</th><th className="px-3 py-2 text-right">Expected Closing</th></tr></thead>
              <tbody>
                {data.staffTills?.length ? data.staffTills.map((row: any) => <tr key={row.id} className="border-t"><td className="px-3 py-2 font-medium">{row.name}</td><td className="px-3 py-2 capitalize">{text(row.type)}</td><td className="px-3 py-2">{row.staff || 'Unassigned'}</td><td className="px-3 py-2 text-right">{money(row.openingCash)}</td><td className="px-3 py-2 text-right">{money(row.debit)}</td><td className="px-3 py-2 text-right">{money(row.credit)}</td><td className="px-3 py-2 text-right">{money(row.cashIn)}</td><td className="px-3 py-2 text-right">{money(row.cashOut)}</td><td className="px-3 py-2 text-right">{money(row.cashTransfersIn)}</td><td className="px-3 py-2 text-right">{money(row.cashTransfersOut)}</td><td className="px-3 py-2 text-right font-semibold">{money(row.expectedClosing ?? row.balance)}</td></tr>) : <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={11}>No cash accounts found.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-4 w-4" />Daily Transaction Ledger</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Customer / Account</th>
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Sale Credit</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length ? transactions.map((row: any, index: number) => (
                  <tr key={row.id || index} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">{row.date ? new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="px-3 py-2"><button className="font-mono text-primary underline-offset-2 hover:underline" onClick={() => setTransaction(row)}>{row.reference || row.id}</button></td>
                    <td className="px-3 py-2 capitalize">{text(row.kind)}</td>
                    <td className="px-3 py-2">{row.customer || row.account || '-'}</td>
                    <td className="px-3 py-2">{row.staff || '-'}</td>
                    <td className="px-3 py-2 capitalize">{text(row.paymentMethod || row.direction)}</td>
                    <td className="px-3 py-2 text-right">{money(row.debit)}</td>
                    <td className="px-3 py-2 text-right">{money(row.credit)}</td>
                    <td className="px-3 py-2 text-right">{money(row.creditAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(row.amount)}</td>
                  </tr>
                )) : <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={10}>No transactions for this day.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {customer && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 print:hidden sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full overflow-auto rounded-t-xl bg-background p-5 shadow-xl sm:max-w-3xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-bold">{customer.name}</h2>
                <p className="text-sm text-muted-foreground">{customer.phone || 'No phone recorded'}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Current Credit Balance</p><p className="font-semibold">{money(customer.currentBalance)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Cash Sales Today</p><p className="font-semibold">{money(customer.cashSales)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Credit Sales Today</p><p className="font-semibold">{money(customer.creditSales)}</p></div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCustomer(null)} aria-label="Close customer quick view"><X className="h-5 w-5" /></Button>
            </div>
            <h3 className="mt-6 font-semibold">Transactions Today</h3>
            <div className="mt-2 space-y-2">
              {customerTransactions.length ? customerTransactions.map((row: any) => <button key={row.id} className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => setTransaction(row)}><span className="min-w-0"><span className="block break-words text-sm font-medium">{row.type || row.kind} - {row.reference}</span><span className="text-xs text-muted-foreground">{text(row.paymentMethod)} - Cash {money(row.cashAmount)} - Credit {money(row.creditAmount)}</span></span><span className="shrink-0 font-semibold">{money(row.amount)}</span></button>) : <p className="rounded-md border p-4 text-sm text-muted-foreground">No transactions for this customer on this date.</p>}
            </div>
            {selectedCustomerId && <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.location.assign('/tenant/receivables/customers')}>View Customer</Button><Button variant="outline" onClick={() => window.location.assign(`/tenant/reports?report=customersStatement&customerId=${selectedCustomerId}`)}>Print Statement</Button></div>}
          </div>
        </div>
      )}

      <DetailModal drilldown={drilldown} onClose={() => setDrilldown(null)} onTransaction={(row) => { setDrilldown(null); setTransaction(row) }} />
      <TransactionModal row={transaction} onClose={() => setTransaction(null)} />
    </div>
  )
}
