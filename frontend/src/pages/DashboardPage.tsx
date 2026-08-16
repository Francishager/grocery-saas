import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Package, ShoppingCart, Users, Receipt, CreditCard, ArrowUpRight, ArrowDownRight, Banknote, PiggyBank, LayoutDashboard, WifiOff, CalendarDays, Award, TrendingDown as TrendDown } from 'lucide-react'
import { apiFetch, dashboardApi, type DashboardKpis, type SalesChartData, type ProfitLossData, type TopProduct, type PaymentMethodData, type DailyPerformanceData } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalDashboardKpis, getLocalDashboardCharts } from '@/db/hybrid'

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1', '#14b8a6']

export default function DashboardPage() {
  const { hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [salesChart, setSalesChart] = useState<SalesChartData | null>(null)
  const [profitLoss, setProfitLoss] = useState<ProfitLossData | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([])
  const [dailyPerf, setDailyPerf] = useState<DailyPerformanceData | null>(null)
  const [billingReminder, setBillingReminder] = useState<any>(null)
  const [showBillingPrompt, setShowBillingPrompt] = useState(false)
  const [billingForm, setBillingForm] = useState({ networkProvider: 'MTN', phoneNumber: '', paymentMethod: 'mobile_money' })
  const [billingPaymentState, setBillingPaymentState] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle')
  const [billingPollRef, setBillingPollRef] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOfflineData, setIsOfflineData] = useState(false)
  const { toast } = useToast()
  const online = useOnlineStatus()

  useEffect(() => {
    if (hasPermission('canViewDashboard') && hasFeature('dashboard')) {
      loadDashboard()
      loadBillingReminder()
    } else {
      setLoading(false)
    }
  }, [hasPermission, hasFeature])

  const loadBillingReminder = async () => {
    try {
      const res = await apiFetch('/api/tenants/me/billing-reminder')
      if (!res.ok) return
      const data = await res.json()
      setBillingReminder(data)
      setShowBillingPrompt(Boolean(data?.isDueSoon || data?.isGracePeriodActive))
    } catch {
      setBillingReminder(null)
    }
  }

  const pollBillingStatus = async (reference?: string, attemptsLeft = 24) => {
    if (!reference && !billingPollRef) return

    const activeReference = reference || billingPollRef
    try {
      const res = await apiFetch(`/api/tenants/me/billing-reminder/status?reference=${encodeURIComponent(activeReference || '')}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Unable to check payment status')

      const status = String(data?.payment?.status || data?.status || 'PENDING').toUpperCase()
      if (status === 'COMPLETED') {
        setBillingPaymentState('success')
        setShowBillingPrompt(false)
        setBillingPollRef(null)
        await loadBillingReminder()
        toast({ title: 'Payment completed', description: 'Your subscription payment has been confirmed.' })
        return
      }

      if (status === 'FAILED') {
        setBillingPaymentState('failed')
        setBillingPollRef(null)
        toast({ variant: 'destructive', title: 'Payment failed', description: 'The mobile money payment was not completed. Please try again.' })
        return
      }

      if (attemptsLeft > 0) {
        setBillingPaymentState('pending')
        setTimeout(() => pollBillingStatus(activeReference, attemptsLeft - 1), 5000)
        return
      }

      setBillingPaymentState('failed')
      setBillingPollRef(null)
      toast({ variant: 'destructive', title: 'Payment timed out', description: 'The payment request did not complete in time. Please try again.' })
    } catch (error: any) {
      setBillingPaymentState('failed')
      setBillingPollRef(null)
      toast({ variant: 'destructive', title: 'Payment status check failed', description: error.message })
    }
  }

  const confirmBillingPrompt = async () => {
    if (!billingForm.phoneNumber.trim()) {
      toast({ variant: 'destructive', title: 'Phone number required', description: 'Enter the mobile money number with country code.' })
      return
    }

    try {
      setBillingPaymentState('pending')
      const res = await apiFetch('/api/tenants/me/billing-reminder', {
        method: 'POST',
        body: JSON.stringify({
          networkProvider: billingForm.networkProvider,
          phoneNumber: billingForm.phoneNumber,
          paymentMethod: billingForm.paymentMethod,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Unable to confirm payment prompt')

      const paymentReference = data?.payment?.reference || data?.reference || null
      if (paymentReference) {
        setBillingPollRef(paymentReference)
      }

      const providerStatus = String(data?.payment?.status || data?.status || 'PENDING').toUpperCase()
      if (providerStatus === 'COMPLETED') {
        setBillingPaymentState('success')
        setShowBillingPrompt(false)
        setBillingPollRef(null)
        await loadBillingReminder()
        toast({ title: 'Payment completed', description: `${billingForm.networkProvider} payment confirmed successfully.` })
        return
      }

      setShowBillingPrompt(false)
      if (paymentReference) {
        setTimeout(() => pollBillingStatus(paymentReference, 24), 500)
      }
      toast({ title: 'Payment prompt sent', description: `${billingForm.networkProvider} payment request is ready on ${billingForm.phoneNumber}.` })
    } catch (error: any) {
      setBillingPaymentState('failed')
      toast({ variant: 'destructive', title: 'Payment prompt failed', description: error.message })
    }
  }

  const loadDashboard = async () => {
    if (!online) {
      // Offline — load from IndexedDB
      setIsOfflineData(true)
      try {
        const [localKpis, localCharts] = await Promise.all([
          getLocalDashboardKpis(),
          getLocalDashboardCharts(),
        ])
        setKpis(localKpis)
        setSalesChart(localCharts.salesChart)
        setProfitLoss(localCharts.profitLoss)
        setTopProducts(localCharts.topProducts)
        setPaymentMethods(localCharts.paymentMethods)
      } catch (e) {
        toast({ variant: 'destructive', title: 'Failed to load offline data' })
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const [k, sc, pl, tp, pm, dp] = await Promise.all([
        dashboardApi.getKpis(),
        dashboardApi.getSalesChart(),
        dashboardApi.getProfitLoss(),
        dashboardApi.getTopProducts(),
        dashboardApi.getPaymentMethods(),
        dashboardApi.getDailyPerformance(),
      ])
      setKpis(k)
      setSalesChart(sc)
      setProfitLoss(pl)
      setTopProducts(tp as any || [])
      setPaymentMethods(pm as any || [])
      setDailyPerf(dp as any || null)
      setIsOfflineData(false)
    } catch (error: any) {
      // API failed — fall back to local data
      setIsOfflineData(true)
      try {
        const [localKpis, localCharts] = await Promise.all([
          getLocalDashboardKpis(),
          getLocalDashboardCharts(),
        ])
        setKpis(localKpis)
        setSalesChart(localCharts.salesChart)
        setProfitLoss(localCharts.profitLoss)
        setTopProducts(localCharts.topProducts)
        setPaymentMethods(localCharts.paymentMethods)
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load dashboard', description: error.message })
      }
    } finally {
      setLoading(false)
    }
  }

  if (!hasPermission('canViewDashboard')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access the dashboard.</p>
        </div>
      </div>
    )
  }

  // If dashboard feature itself is not enabled, show upgrade
  if (!hasFeature('dashboard')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Feature Not Available</h2>
          <p className="text-muted-foreground">The Dashboard feature is not enabled for your business.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!kpis) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Could not load dashboard data</p>
      </div>
    )
  }

  const k = kpis

  const salesChartData = (salesChart?.labels || []).map((label, i) => ({
    name: label,
    revenue: salesChart?.revenue?.[i] || 0,
    expenses: salesChart?.expenses?.[i] || 0,
  }))

  const profitLossData = (profitLoss?.labels || []).map((label, i) => ({
    name: label,
    gross: profitLoss?.grossProfit?.[i] || 0,
    net: profitLoss?.netProfit?.[i] || 0,
  }))

  const formatMethodName = (method: string) => {
    const labels: Record<string, string> = {
      mobile_money: 'MoMo',
      cash: 'Cash',
      card: 'Card',
      bank_transfer: 'Bank',
      cheque: 'Cheque',
      credit: 'Credit',
    }
    if (labels[method]) return labels[method]
    return method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  const paymentPieData = paymentMethods.map((m) => ({
    name: formatMethodName(m.method),
    value: m.total,
    count: m.count,
  }))

  const profitMargin = k.revenue > 0 ? ((k.netProfit / k.revenue) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Business performance overview</p>
          {isOfflineData && (
            <p className="text-xs text-orange-600 flex items-center gap-1 mt-1"><WifiOff className="h-3 w-3" /> Showing offline data</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDisplayDate(new Date())}
        </p>
      </div>

      {billingReminder && (billingReminder.isDueSoon || billingReminder.isGracePeriodActive) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Subscription payment reminder</p>
              <p className="text-sm text-amber-800">
                {billingReminder.isGracePeriodActive
                  ? `Your grace period is active. Please settle ${billingReminder.amountDue ? formatCurrency(billingReminder.amountDue) : 'your invoice'} before ${formatDisplayDate(billingReminder.gracePeriodEndsAt)}.`
                  : `Your subscription renews in ${billingReminder.daysRemaining} day${billingReminder.daysRemaining === 1 ? '' : 's'}. Please pay ${billingReminder.amountDue ? formatCurrency(billingReminder.amountDue) : 'your due amount'} before the due date.`}
              </p>
            </div>
            <button onClick={() => setShowBillingPrompt(true)} className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700">Pay now</button>
          </div>
        </div>
      )}

      {/* KPI Cards Row 1 — only show for enabled features */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {hasFeature('sales') && hasPermission('canViewSale') && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(k.revenue)}</div>
            {k.revenueChange != null && (
              <p className={`text-xs flex items-center gap-1 ${k.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {k.revenueChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(k.revenueChange)}% vs last month
              </p>
            )}
          </CardContent>
        </Card>
        )}

        {hasFeature('accounting') && hasPermission('canViewFinancialReport') && (
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <PiggyBank className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${k.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(k.netProfit)}</div>
            <p className="text-xs text-muted-foreground">{profitMargin}% margin</p>
          </CardContent>
        </Card>
        )}

        {hasFeature('sales') && hasPermission('canViewSale') && (
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <ShoppingCart className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{k.salesCount}</div>
            <p className="text-xs text-muted-foreground">transactions this month</p>
          </CardContent>
        </Card>
        )}

        {hasFeature('settings.taxes') && hasPermission('canViewTax') && (
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tax Collected</CardTitle>
            <Receipt className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(k.taxCollected)}</div>
            <p className="text-xs text-muted-foreground">VAT/tax this period</p>
          </CardContent>
        </Card>
        )}
      </div>

      {/* KPI Cards Row 2 — only show for enabled features */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {hasFeature('accounting') && hasPermission('canViewFinancialReport') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(k.grossProfit)}</div>
            <p className="text-xs text-muted-foreground">Revenue - COGS</p>
          </CardContent>
        </Card>
        )}

        {hasFeature('expenses') && hasPermission('canViewExpense') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(k.expenses)}</div>
            <p className="text-xs text-muted-foreground">Operating costs</p>
          </CardContent>
        </Card>
        )}

        {hasFeature('receivables') && hasPermission('canViewReceivable') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receivables</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(k.receivablesOutstanding)}</div>
            <p className="text-xs text-muted-foreground">{k.receivablesCount} outstanding</p>
          </CardContent>
        </Card>
        )}

        {hasFeature('customers') && hasPermission('canViewCustomer') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{k.customerCount}</div>
            <p className="text-xs text-muted-foreground">{hasFeature('inventory') ? `${k.productCount} products` : ''}</p>
          </CardContent>
        </Card>
        )}
      </div>

      {/* Daily Performance Chart */}
      {hasFeature('sales') && hasPermission('canViewSale') && dailyPerf && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-500" /> Daily Performance</CardTitle>
              <CardDescription>Revenue & profit per day — {formatDisplayDate(new Date())}</CardDescription>
            </div>
            {dailyPerf.summary.bestDay && (
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1 text-green-600">
                  <Award className="h-3 w-3" />
                  Best: Day {dailyPerf.summary.bestDay.day} ({formatCurrency(dailyPerf.summary.bestDay.revenue)})
                </div>
                {dailyPerf.summary.worstDay && (
                  <div className="flex items-center gap-1 text-red-500">
                    <TrendDown className="h-3 w-3" />
                    Low: Day {dailyPerf.summary.worstDay.day} ({formatCurrency(dailyPerf.summary.worstDay.revenue)})
                  </div>
                )}
                <div className="text-muted-foreground">Avg: {formatCurrency(dailyPerf.summary.avgDailyRevenue)}</div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dailyPerf.data}>
              <defs>
                <linearGradient id="colorRevBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="colorProfitBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Revenue' : name === 'profit' ? 'Net Profit' : name]}
                labelFormatter={(label) => `Day ${label}`}
                contentStyle={{ borderRadius: 8, fontSize: 13 }}
              />
              <Bar dataKey="revenue" fill="url(#colorRevBar)" radius={[3, 3, 0, 0]} name="revenue" />
              <Bar dataKey="profit" fill="url(#colorProfitBar)" radius={[3, 3, 0, 0]} name="profit" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      )}

      {/* Charts Row — only show for enabled features */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue vs Expenses Chart */}
        {hasFeature('sales') && hasPermission('canViewSale') && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
            <CardDescription>12-month trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Revenue" />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} strokeDasharray="7 7" name="Expenses" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}

        {/* Profit & Loss Chart */}
        {hasFeature('accounting') && hasPermission('canViewFinancialReport') && (
        <Card>
          <CardHeader>
            <CardTitle>Profit & Loss</CardTitle>
            <CardDescription>Gross vs Net profit (6 months)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={profitLossData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="gross" stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Gross Profit" />
                <Line type="monotone" dataKey="net" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} strokeDasharray="8 8" name="Net Profit" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}
      </div>

      {/* Bottom Row — only show for enabled features */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Products */}
        {hasFeature('inventory') && hasPermission('canViewProduct') && (
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Products</CardTitle>
            <CardDescription>By revenue this month</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No sales data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[0, 4, 4, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        )}

        {/* Payment Methods Pie */}
        {hasFeature('sales') && hasPermission('canViewSale') && (
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>This month's breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentPieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No payment data</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={paymentPieData} cx="50%" cy="45%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#6b7280', strokeWidth: 1 }}>
                    {paymentPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                  <Legend verticalAlign="bottom" height={36} formatter={(value: string, entry: any) => <span style={{ color: entry.color, fontSize: 13, fontWeight: 600 }}>{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {showBillingPrompt && billingReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pay subscription</h2>
              <button onClick={() => setShowBillingPrompt(false)} className="rounded-md p-1 text-gray-500 hover:bg-gray-100">✕</button>
            </div>

            {billingPaymentState === 'pending' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                <div>
                  <p className="text-lg font-semibold text-slate-900">Waiting for payment approval</p>
                  <p className="text-sm text-slate-600">The provider is checking the payment prompt on your phone.</p>
                </div>
              </div>
            ) : billingPaymentState === 'success' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-xl text-green-600">✓</div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">Payment completed</p>
                  <p className="text-sm text-slate-600">Your subscription has been confirmed and your account is up to date.</p>
                </div>
                <button onClick={() => setBillingPaymentState('idle')} className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">Close</button>
              </div>
            ) : billingPaymentState === 'failed' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl text-red-600">!</div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">Payment failed</p>
                  <p className="text-sm text-slate-600">The request was not approved or timed out. Please try again.</p>
                </div>
                <button onClick={() => setBillingPaymentState('idle')} className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Try again</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Network provider</label>
                  <select
                    value={billingForm.networkProvider}
                    onChange={(e) => setBillingForm({ ...billingForm, networkProvider: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="MTN">MTN</option>
                    <option value="Airtel">Airtel</option>
                    <option value="MPS">MPS</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Phone number with country code</label>
                  <input
                    type="tel"
                    value={billingForm.phoneNumber}
                    onChange={(e) => setBillingForm({ ...billingForm, phoneNumber: e.target.value })}
                    placeholder="+256700000000"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Payment method</label>
                  <select
                    value={billingForm.paymentMethod}
                    onChange={(e) => setBillingForm({ ...billingForm, paymentMethod: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="mobile_money">Mobile Money</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                  </select>
                </div>

                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Amount due</p>
                  <p>{billingReminder.amountDue ? formatCurrency(billingReminder.amountDue) : 'Your subscription amount'}</p>
                </div>

                <button onClick={confirmBillingPrompt} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Send payment prompt</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
