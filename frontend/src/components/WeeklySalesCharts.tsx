import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { chartTooltip } from '@/lib/chartTheme'
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

const money = (value: unknown) => formatCurrency(Number(value || 0))
const percent = (value: number | null) => value == null ? 'New this period' : `${Math.abs(value).toFixed(1)}%`;

function Change({ change }: { change?: { percent: number | null; direction: string } }) {
  if (!change || change.direction === 'unchanged') return <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" />No change vs prior period</span>;
  const up = change.direction === 'up' || change.direction === 'new';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={`mt-1 flex items-center gap-1 text-xs font-medium ${up ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}><Icon className="h-3.5 w-3.5" />{percent(change.percent)} vs prior period</span>;
}

export default function WeeklySalesCharts({ data }: { data: any }) {
  const [selectedDate, setSelectedDate] = useState('all');
  const [selectedProductId, setSelectedProductId] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const rows = Array.isArray(data?.weeklyTrend) ? data.weeklyTrend : [];
  const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
  const summary = data?.summary || {};
  const comparison = data?.comparison || {};
  const bestDay = rows.reduce((best: any, row: any) => !best || Number(row.revenue) > Number(best.revenue) ? row : best, null);
  const averageRevenue = rows.length ? Number(summary.totalRevenue || 0) / rows.length : 0;
  const products = useMemo(() => {
    const unique = new Map<string, string>();
    transactions.forEach((transaction: any) => (transaction.items || []).forEach((item: any) => {
      if (item.productId && item.itemType !== 'service') unique.set(String(item.productId), String(item.product || 'Product'));
    }));
    return [...unique].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions]);
  const filteredProducts = products.filter((product) => product.name.toLowerCase().includes(productSearch.trim().toLowerCase()));
  const selectedDay = rows.find((row: any) => row.date === selectedDate);
  const detailRows = transactions.flatMap((transaction: any) => (transaction.items || [])
    .filter((item: any) => selectedDate === 'all' || transaction.businessDate === selectedDate)
    .filter((item: any) => selectedProductId === 'all' || item.productId === selectedProductId)
    .map((item: any, index: number) => ({ ...item, transaction, key: `${transaction.id}-${item.productId}-${index}` })));
  const detailSummary = detailRows.reduce((totals: any, item: any) => ({
    quantity: totals.quantity + Number(item.quantity || 0),
    gross: totals.gross + Number(item.grossAmount || 0),
    revenue: totals.revenue + Number(item.revenue || 0),
    tax: totals.tax + Number(item.tax || 0),
  }), { quantity: 0, gross: 0, revenue: 0, tax: 0 });
  const selectedProductName = products.find((product) => product.id === selectedProductId)?.name;
  const metrics = [
    { label: 'Gross sales', value: money(summary.grossSales), change: comparison.grossSalesChange },
    { label: 'Net revenue', value: money(summary.totalRevenue), change: comparison.revenueChange },
    { label: 'Completed sales', value: Number(summary.totalSales || 0).toLocaleString(), change: comparison.salesCountChange },
    { label: 'Average per day', value: money(averageRevenue), note: bestDay ? `Best day: ${bestDay.label}` : 'No sales in this period' },
  ];

  return (
    <div className="space-y-4 print:break-inside-avoid">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="min-w-0">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">{metric.label}</p>
              <p className="mt-2 break-words text-lg font-bold tabular-nums sm:text-xl">{metric.value}</p>
              {metric.change ? <Change change={metric.change} /> : <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="min-w-0">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-emerald-600" />Sales and Revenue Trend</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          {rows.length ? (
            <div className="h-[300px] w-full min-w-0 sm:h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="money" tickLine={false} axisLine={false} width={78} tickFormatter={(value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip formatter={(value, name) => [money(value), name]} {...chartTooltip} />
                  <Bar yAxisId="money" dataKey="grossSales" name="Gross sales" fill="#0f9f6e" radius={[4, 4, 0, 0]} maxBarSize={42} />
                  <Line yAxisId="money" type="monotone" dataKey="revenue" name="Net revenue" stroke="#3987d7" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No sales for this period.</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span>Gross sales include tax.</span><span>Net revenue excludes sales tax.</span>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><CardTitle className="text-base">Explore daily sales</CardTitle><p className="mt-1 text-sm text-muted-foreground">Choose a day or product to inspect the underlying sale lines.</p></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(170px,240px)_minmax(170px,240px)]">
            <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products" aria-label="Search weekly sales products" />
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger aria-label="Filter weekly sales by product"><SelectValue placeholder="All products" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {filteredProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}
                {filteredProducts.length === 0 && <SelectItem value="_no_products" disabled>No matching products</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Select a week day">
            <button type="button" aria-pressed={selectedDate === 'all'} onClick={() => setSelectedDate('all')} className={`min-w-24 rounded-md border px-3 py-2 text-left text-sm ${selectedDate === 'all' ? 'border-primary bg-primary/10 text-foreground' : 'hover:bg-muted'}`}>
              <span className="block font-medium">All days</span><span className="mt-1 block text-xs text-muted-foreground">{rows.reduce((sum: number, row: any) => sum + Number(row.salesCount || 0), 0)} sales</span>
            </button>
            {rows.map((row: any) => (
              <button key={row.date} type="button" aria-pressed={selectedDate === row.date} onClick={() => setSelectedDate(row.date)} className={`min-w-24 rounded-md border px-3 py-2 text-left text-sm ${selectedDate === row.date ? 'border-primary bg-primary/10 text-foreground' : 'hover:bg-muted'}`}>
                <span className="block whitespace-nowrap font-medium">{row.label}</span><span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">{row.salesCount} sales · {money(row.revenue)}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Sale lines', detailRows.length.toLocaleString()],
              ['Quantity', Number(detailSummary.quantity.toFixed(3)).toLocaleString()],
              ['Sales incl. tax', money(detailSummary.gross)],
              ['Net revenue', money(detailSummary.revenue)],
            ].map(([label, value]) => <div key={label} className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>)}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{selectedDate === 'all' ? 'Weekly transaction details' : `Transactions for ${selectedDay?.label || selectedDate}`}{selectedProductName ? ` · ${selectedProductName}` : ''}</h3>
              <span className="text-xs text-muted-foreground">Tax {money(detailSummary.tax)}</span>
            </div>
            {detailRows.length ? <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>
                  {['Date', 'Receipt', 'Product', 'Qty', 'Unit', 'Unit price', 'Sales incl. tax', 'Revenue', 'Tax', 'Discount', 'Customer', 'Staff', 'Branch'].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-2 font-medium">{heading}</th>)}
                </tr></thead>
                <tbody>{detailRows.map((item: any) => <tr key={item.key} className="border-t">
                  <td className="whitespace-nowrap px-3 py-2">{item.transaction.businessDate || item.transaction.date}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{item.transaction.reference || item.transaction.receiptNo || '—'}</td>
                  <td className="px-3 py-2">{item.product}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(item.quantity || 0).toLocaleString()}</td>
                  <td className="px-3 py-2">{item.unitName || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.unitPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.grossAmount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.revenue)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.tax)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.discount)}</td>
                  <td className="px-3 py-2">{item.transaction.customer || '—'}</td>
                  <td className="px-3 py-2">{item.transaction.staff || '—'}</td>
                  <td className="px-3 py-2">{item.transaction.branch || '—'}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No sale lines for this selection.</p>}
          </div>
        </CardContent>
      </Card>

      {data?.breakdowns && (
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            ['Leading branches', data.breakdowns.branches],
            ['Leading staff', data.breakdowns.staff],
          ].map(([title, entries]: any) => (
            <Card key={title} className="min-w-0">
              <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {entries?.length ? entries.slice(0, 5).map((entry: any, index: number) => (
                  <div key={entry.name} className="flex min-w-0 items-center justify-between gap-3 border-b pb-2 last:border-0">
                    <span className="min-w-0 break-words text-sm"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{entry.name}</span>
                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{money(entry.revenue)}<span className="ml-2 text-xs font-normal text-muted-foreground">{entry.salesCount} sales</span></span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No activity to rank.</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
