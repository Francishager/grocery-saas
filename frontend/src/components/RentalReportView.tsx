import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, CircleDollarSign, PackageCheck, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'

type ReportColumn = { key: string; label: string; format?: string }
type RentalReportViewProps = {
  reportId: string
  data: any
  columns?: ReportColumn[]
  summaryKeys?: Array<{ key: string; label: string; format?: string }>
}

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const formatDate = (value: unknown) => {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? '—' : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`
}
const formatCell = (value: unknown, format?: string) => {
  if (value === undefined || value === null || value === '') return '—'
  if (format === 'currency') return formatCurrency(numberValue(value))
  if (format === 'date') return formatDate(value)
  if (format === 'number') return new Intl.NumberFormat().format(numberValue(value))
  return String(value)
}

function RentalTransactionDetail({ row, onClose }: { row: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 print:hidden sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Rental report details">
      <div className="max-h-[90vh] w-full overflow-hidden rounded-t-lg bg-background shadow-xl sm:max-w-3xl sm:rounded-lg">
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
          <div className="min-w-0"><h2 className="font-semibold">{row.type || row.rentalNo || row.reference || 'Rental details'}</h2><p className="text-xs text-muted-foreground">{row.reference || row.rentalNo || 'Rental record'}</p></div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details"><X className="h-4 w-4" /></Button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-4 sm:p-6">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {Object.entries(row).filter(([key, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => (
              <div key={key} className="min-w-0 border-b pb-2">
                <dt className="text-xs capitalize text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="mt-1 whitespace-pre-line break-words text-sm font-medium">{typeof value === 'number' && /(amount|balance|deposit|revenue|paid|damage|charge)/i.test(key) ? formatCurrency(value) : key.toLowerCase().includes('date') ? formatDate(value) : String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

export default function RentalReportView({ reportId, data, columns = [], summaryKeys = [] }: RentalReportViewProps) {
  const [query, setQuery] = useState('')
  const [selectedRow, setSelectedRow] = useState<any>(null)
  const rows: any[] = reportId === 'rentalsDaily'
    ? (Array.isArray(data?.transactions) ? data.transactions : [])
    : (Array.isArray(data?.data) ? data.data : [])
  const summary = data?.summary || data || {}
  const normalizedQuery = query.trim().toLowerCase()
  const visibleRows = useMemo(() => !normalizedQuery ? rows : rows.filter((row) => Object.values(row || {}).some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))), [rows, normalizedQuery])

  const derivedSummary: Record<string, number> = {
    count: rows.reduce((sum, row) => sum + numberValue(row.count ?? 1), 0),
    totalBalance: rows.reduce((sum, row) => sum + numberValue(row.balance), 0),
    totalRevenue: rows.reduce((sum, row) => sum + numberValue(row.totalRevenue ?? row.revenue ?? row.totalAmount), 0),
    totalDeposit: rows.reduce((sum, row) => sum + numberValue(row.totalDeposit ?? row.deposit), 0),
    totalDamageFees: rows.reduce((sum, row) => sum + numberValue(row.damageFees), 0),
    balance: rows.reduce((sum, row) => sum + numberValue(row.balance), 0),
    overdue: rows.filter((row) => numberValue(row.daysOverdue) > 0).length,
    customerCount: rows.length,
    branchCount: rows.length,
    itemCount: rows.length,
    hireCount: rows.reduce((sum, row) => sum + numberValue(row.hireCount ?? row.count ?? 1), 0),
  }
  const metrics = summaryKeys.map((metric) => ({ ...metric, value: summary[metric.key] ?? data?.[metric.key] ?? derivedSummary[metric.key] ?? 0 }))
  const chartRows: any[] = reportId === 'rentalsDaily'
    ? (Array.isArray(data?.data) ? data.data : [])
    : [...rows].sort((a, b) => numberValue(b.totalRevenue ?? b.revenue ?? b.totalAmount ?? b.damageFees ?? b.hireCount ?? b.count) - numberValue(a.totalRevenue ?? a.revenue ?? a.totalAmount ?? a.damageFees ?? a.hireCount ?? a.count)).slice(0, 10)
  const chartNameKey = reportId === 'rentalsDaily' ? 'date'
    : reportId === 'rentalsByItem' ? 'item'
      : reportId === 'rentalsByCustomer' ? 'customer'
        : reportId === 'rentalsByBranch' ? 'branch'
          : reportId === 'rentalsMonthly' ? 'month' : 'rentalNo'
  const chartValueKey = reportId === 'rentalsDaily' ? 'rentalCharges'
    : reportId === 'rentalsByItem' || reportId === 'rentalsByCustomer' ? 'totalRevenue'
      : reportId === 'rentalsByBranch' ? 'revenue'
        : reportId === 'rentalsReturns' ? 'damageFees' : 'totalAmount'

  return (
    <div className="space-y-5">
      {metrics.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = index % 3 === 0 ? CalendarDays : index % 3 === 1 ? CircleDollarSign : PackageCheck
          return <Card key={metric.key} className="min-w-0">
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums">{metric.format === 'currency' ? formatCurrency(numberValue(metric.value)) : metric.format === 'number' ? new Intl.NumberFormat().format(numberValue(metric.value)) : String(metric.value)}</p></div>
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            </CardContent>
          </Card>
        })}
      </div>}

      {reportId === 'rentalsDaily' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payments Recorded</p><p className="mt-2 text-lg font-semibold">{formatCurrency(numberValue(summary.rentalPayments))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Deposits Received</p><p className="mt-2 text-lg font-semibold">{formatCurrency(numberValue(summary.depositsReceived))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Deposits Refunded</p><p className="mt-2 text-lg font-semibold">{formatCurrency(numberValue(summary.depositsRefunded))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding on New Rentals</p><p className="mt-2 text-lg font-semibold">{formatCurrency(numberValue(summary.outstandingBalance))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Damage Fees Recorded</p><p className="mt-2 text-lg font-semibold">{formatCurrency(numberValue(summary.damageFees))}</p></CardContent></Card>
      </div>}

      {chartRows.length > 0 && <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{reportId === 'rentalsDaily' ? 'Rental Activity by Day' : 'Rental Performance'}</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={chartNameKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(value: number) => formatCurrency(numberValue(value))} />
                {reportId === 'rentalsDaily' ? <>
                  <Legend />
                  <Bar dataKey="rentalCharges" name="Rental Charges" fill="#168b82" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="payments" name="Payments" fill="#3974c6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="deposits" name="Deposits" fill="#d19a27" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="refunds" name="Refunds" fill="#c65b58" radius={[3, 3, 0, 0]} />
                </> : <Bar dataKey={chartValueKey} name={reportId === 'rentalsDaily' ? 'Rental Charges' : 'Rental Value'} fill="#168b82" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>}

      {columns.length > 0 && <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">{reportId === 'rentalsDaily' ? 'Complete Rental Activity Ledger' : 'Rental Details'}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{visibleRows.length} of {rows.length} records</p></div>
          <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report rows" className="pl-9" /></div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[1120px] w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-left text-xs text-muted-foreground"><tr>{columns.map((column) => <th key={column.key} className={`whitespace-nowrap px-3 py-2 ${column.format === 'currency' || column.format === 'number' ? 'text-right' : ''}`}>{column.label}</th>)}</tr></thead>
              <tbody>{visibleRows.map((row, index) => <tr key={row.id || row.rentalNo || row.reference || index} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setSelectedRow(row)}>{columns.map((column) => <td key={column.key} className={`max-w-[280px] whitespace-pre-line break-words px-3 py-2 ${column.format === 'currency' || column.format === 'number' ? 'text-right tabular-nums' : ''}`}>{formatCell(row[column.key], column.format)}</td>)}</tr>)}
                {!visibleRows.length && <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{rows.length ? 'No records match your search.' : 'No rental activity in this period.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>}

      {selectedRow && <RentalTransactionDetail row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  )
}
