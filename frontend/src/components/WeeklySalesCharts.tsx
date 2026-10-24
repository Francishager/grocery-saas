import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const rows = Array.isArray(data?.weeklyTrend) ? data.weeklyTrend : [];
  const summary = data?.summary || {};
  const comparison = data?.comparison || {};
  const bestDay = rows.reduce((best: any, row: any) => !best || Number(row.revenue) > Number(best.revenue) ? row : best, null);
  const averageRevenue = rows.length ? Number(summary.totalRevenue || 0) / rows.length : 0;
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
                  <Tooltip formatter={(value, name) => [money(value), name]} contentStyle={{ borderRadius: 8, borderColor: 'hsl(var(--border))', background: 'hsl(var(--background))' }} />
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
