import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Package, ShoppingCart, Users, Receipt, CreditCard, ArrowUpRight, ArrowDownRight, Banknote, PiggyBank, LayoutDashboard, WifiOff, CalendarDays, Award, TrendingDown as TrendDown } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { RefreshCw } from 'lucide-react'
import { useDashboardData } from '@/hooks/useDashboardData'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts'
import { useOnlineStatus } from '@/db/hooks'
import { SupportContactLinks } from '@/components/SupportContactLinks'
import { Link } from 'react-router-dom'

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1', '#14b8a6']

function ModuleMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Card><CardContent className="p-4">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value ?? '—'}</p>
    {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
  </CardContent></Card>
}

export default function DashboardPage() {
  const { user, hasPermission } = useJWTAuth()
  const { hasFeature, hasAnyFeature } = useFeatureAccess()
  const hasLandlordWorkspace = hasFeature('property_management.landlord')
  const hasAgentWorkspace = hasFeature('property_management.agent')
  const [billingReminder, setBillingReminder] = useState<any>(null)
  const [showBillingPrompt, setShowBillingPrompt] = useState(false)
  const [billingForm, setBillingForm] = useState({ networkProvider: 'MTN', phoneNumber: user?.phone || '', email: user?.email || '', paymentMethod: 'mobile_money', gateway: 'pesapal' })
  const [billingPaymentState, setBillingPaymentState] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle')
  const [billingPollRef, setBillingPollRef] = useState<string | null>(null)
  const [dashboardView, setDashboardView] = useState<'daily' | 'trends' | 'mix'>('daily')
  const [moduleSnapshots, setModuleSnapshots] = useState<{ property: any; restaurant: any; hr: any }>({ property: null, restaurant: null, hr: null })
  const { toast } = useToast()
  const online = useOnlineStatus()
  const dashboardEnabled = Boolean(user?.tenantId) && hasFeature('dashboard')
  const canViewSalesDashboard = hasPermission('canViewSale') || hasPermission('canViewReportSalesSummary') || hasPermission('canViewReportSalesDaily')
  const canViewFinancialDashboard = hasPermission('canViewReportFinancialProfitLoss')
  const dashboardAccess = {
    sales: canViewSalesDashboard,
    finance: canViewFinancialDashboard,
    expenses: hasPermission('canViewExpense'),
    inventory: hasPermission('canViewProduct'),
    customers: hasPermission('canViewCustomer'),
    receivables: hasPermission('canViewReceivable'),
    tax: hasPermission('canViewTax'),
  }
  const hasDailyInsights = hasFeature('sales') && canViewSalesDashboard || hasFeature('accounting') && canViewFinancialDashboard
  const hasTrendInsights = hasFeature('sales') && (canViewSalesDashboard || dashboardAccess.expenses) || hasFeature('accounting') && canViewFinancialDashboard
  const hasMixInsights = hasFeature('inventory') && dashboardAccess.inventory && canViewSalesDashboard || hasFeature('sales') && hasPermission('canViewSale')
  const scopeKey = [user?.tenantId, user?.id, user?.branchId].join(':')
  const { kpis, salesChart, profitLoss, topProducts, paymentMethods, dailyPerf,
    loading, refreshing, isOfflineData, error: dashboardError, refresh } = useDashboardData(dashboardEnabled, online, scopeKey, dashboardAccess)

  const canViewProperty = hasAnyFeature(['property_management.landlord', 'property_management.agent']) && hasPermission('canViewPropertyPortfolio')
  const canViewRestaurant = hasFeature('restaurant') && hasPermission('canViewRestaurant')
  const canViewHR = hasFeature('hr') && hasPermission('canViewHR')
  const dashboardModules = [canViewProperty && (hasAgentWorkspace && !hasLandlordWorkspace ? 'Property Agent' : hasLandlordWorkspace && !hasAgentWorkspace ? 'Landlord' : 'Property Management'), canViewRestaurant && 'Restaurant & Bar', canViewHR && 'HR Management'].filter(Boolean) as string[]

  useEffect(() => {
    let active = true
    setModuleSnapshots({ property: null, restaurant: null, hr: null })
    const loadSnapshot = async (key: 'property' | 'restaurant' | 'hr', path: string, enabled: boolean) => {
      if (!enabled) return
      try {
        const response = await apiFetch(path)
        const snapshot = response.ok ? await response.json() : null
        if (active && snapshot) setModuleSnapshots(current => ({ ...current, [key]: snapshot }))
      } catch { /* Module summaries should not block the main dashboard. */ }
    }
    void Promise.all([
      loadSnapshot('property', '/api/property-management/overview', canViewProperty),
      loadSnapshot('restaurant', '/api/restaurant/dashboard', canViewRestaurant),
      loadSnapshot('hr', '/api/hr/dashboard', canViewHR),
    ])
    return () => { active = false }
  }, [canViewProperty, canViewRestaurant, canViewHR, scopeKey])

  useEffect(() => {
    if (!hasDailyInsights && !hasTrendInsights && !hasMixInsights) return
    if (dashboardView === 'daily' && !hasDailyInsights) setDashboardView(hasTrendInsights ? 'trends' : 'mix')
    else if (dashboardView === 'trends' && !hasTrendInsights) setDashboardView(hasDailyInsights ? 'daily' : 'mix')
    else if (dashboardView === 'mix' && !hasMixInsights) setDashboardView(hasDailyInsights ? 'daily' : 'trends')
  }, [dashboardView, hasDailyInsights, hasTrendInsights, hasMixInsights])

  useEffect(() => {
    setBillingForm(current => ({
      ...current,
      phoneNumber: user?.phone || current.phoneNumber,
      email: user?.email || current.email,
    }))
  }, [user?.phone, user?.email])

  useEffect(() => {
    if (dashboardEnabled && (user?.role === 'owner' || hasPermission('canPaySubscriptionInvoice'))) {
      loadBillingReminder()
    }
  }, [dashboardEnabled, user?.role, hasPermission])

  useEffect(() => {
    if (user?.role !== 'owner' && !hasPermission('canPaySubscriptionInvoice')) return
    const billingReference = new URLSearchParams(window.location.search).get('billingRef')
    if (billingReference) {
      setBillingPaymentState('pending')
      setBillingPollRef(billingReference)
      window.history.replaceState({}, document.title, window.location.pathname)
      void pollBillingStatus(billingReference)
    }
  }, [user?.role, hasPermission])

  const loadBillingReminder = async () => {
    try {
      const res = await apiFetch('/api/tenants/me/billing-reminder')
      if (!res.ok) return
      const data = await res.json()
      setBillingReminder(data)
      setShowBillingPrompt(Boolean(!data?.isTrial && !data?.isAnnualPartialPayment && data?.paymentStatus !== 'paid' && (data?.isDueSoon || data?.isGracePeriodActive || data?.isOverdue)))
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
        window.dispatchEvent(new Event('subscription-payment-updated'))
        await loadBillingReminder()
        toast({ title: 'Payment completed', description: 'Your subscription payment has been confirmed.' })
        return
      }

      if (status === 'FAILED' || status === 'REVERSED') {
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
    if (billingForm.gateway === 'pesapal' && (!billingForm.phoneNumber.trim() || !billingForm.email.trim())) {
      toast({ variant: 'destructive', title: 'Payer details required', description: 'Enter both a phone number and email address for Pesapal checkout.' })
      return
    }
    if (billingForm.gateway === 'relworx' && !billingForm.phoneNumber.trim()) {
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
          gateway: billingForm.gateway,
          email: billingForm.email,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Unable to confirm payment prompt')

      const checkoutUrl = data?.payment?.checkoutUrl || data?.checkoutUrl
      if (billingForm.gateway === 'pesapal') {
        if (!checkoutUrl || !/^https:\/\//i.test(checkoutUrl)) {
          throw new Error('Pesapal did not return a secure checkout link. No payment status polling was started; please retry or contact the JibuSales Support Team.')
        }
        window.location.replace(checkoutUrl)
        return
      }

      if (checkoutUrl) {
        window.location.replace(checkoutUrl)
        return
      }

      const paymentReference = data?.payment?.reference || data?.reference || null
      if (paymentReference) {
        setBillingPollRef(paymentReference)
      }

      const providerStatus = String(data?.payment?.status || data?.status || 'PENDING').toUpperCase()
      if (providerStatus === 'COMPLETED') {
        setBillingPaymentState('success')
        setShowBillingPrompt(false)
        setBillingPollRef(null)
        window.dispatchEvent(new Event('subscription-payment-updated'))
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
        <p role="alert" className="text-muted-foreground">{dashboardError || 'Could not load dashboard data'}</p>
        <button type="button" onClick={() => void refresh()} className="mt-3 inline-flex items-center gap-2 text-sm font-medium">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
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
          <h1 className="text-3xl font-bold tracking-tight">Business Dashboard</h1>
          <p className="text-muted-foreground">{dashboardModules.length > 1 ? `Mixed operations · ${dashboardModules.join(' · ')}` : 'Unified view of your enabled business features'}</p>
          {isOfflineData && (
            <p className="text-xs text-orange-600 flex items-center gap-1 mt-1"><WifiOff className="h-3 w-3" /> Showing offline data</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="hidden text-sm text-muted-foreground sm:block">{formatDisplayDate(new Date())}</p>
          <button type="button" onClick={() => void refresh()} aria-label="Refresh dashboard" title="Refresh dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {dashboardError && <p role="alert" className="text-sm text-amber-700">{dashboardError}</p>}
      {!Object.values(dashboardAccess).some(Boolean) && !hasPermission('canViewCustomer') && !hasPermission('canViewPayable') && !hasPermission('canViewPurchase') && !hasPermission('canViewTax') && !canViewProperty && !canViewRestaurant && !canViewHR && (
        <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">Your dashboard is ready. Ask your business admin to grant the module viewing permissions for the insights you need.</p>
      )}

      {billingReminder && !billingReminder.isTrial && billingReminder.paymentStatus !== 'paid' && (!billingReminder.isAnnualPartialPayment || billingReminder.isAnnualPartialReminderWindow) && (billingReminder.isPartiallyPaid || billingReminder.isDueSoon || billingReminder.isGracePeriodActive || billingReminder.isOverdue) && (
        <div className={`rounded-xl border p-4 ${billingReminder.isOverdue ? 'border-red-300 bg-red-50 text-red-900' : billingReminder.isTrialActive ? 'border-blue-200 bg-blue-50 text-blue-950' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{billingReminder.isTrialActive ? 'Business trial' : billingReminder.isPartiallyPaid ? 'Subscription partially paid' : billingReminder.isOverdue ? 'Subscription payment overdue' : 'Subscription payment reminder'}</p>
              <p className={`text-sm ${billingReminder.isOverdue ? 'text-red-800' : billingReminder.isTrialActive ? 'text-blue-800' : 'text-amber-800'}`}>
                {billingReminder.isTrialActive
                  ? `Your business trial ends in ${billingReminder.daysRemaining} day${billingReminder.daysRemaining === 1 ? '' : 's'} on ${formatDisplayDate(billingReminder.trialEndsAt)}.`
                  : billingReminder.isPartiallyPaid
                  ? `Received ${formatCurrency(billingReminder.paidToDate)} of ${formatCurrency(billingReminder.subscriptionAmount)}. ${formatCurrency(billingReminder.amountDue)} remains${billingReminder.dueDate ? ` by ${formatDisplayDate(billingReminder.dueDate)}` : ''}.`
                  : billingReminder.isOverdue
                  ? `Your subscription has expired. Payment of ${billingReminder.amountDue ? formatCurrency(billingReminder.amountDue) : 'your invoice'} is now overdue. Please settle immediately to continue using your account.`
                  : billingReminder.isGracePeriodActive
                  ? `Your grace period is active. Please settle ${billingReminder.amountDue ? formatCurrency(billingReminder.amountDue) : 'your invoice'} before ${formatDisplayDate(billingReminder.gracePeriodEndsAt)}.`
                  : `Your subscription renews in ${billingReminder.daysRemaining} day${billingReminder.daysRemaining === 1 ? '' : 's'}. Please pay ${billingReminder.amountDue ? formatCurrency(billingReminder.amountDue) : 'your due amount'} before the due date.`}
              </p>
            </div>
            {billingReminder.isTrial ? <div className="flex flex-wrap gap-2">
              <SupportContactLinks compact message="Hello JibuSales Support Team, I would like to discuss upgrading my business account." />
            </div> : <button onClick={() => setShowBillingPrompt(true)} className={`rounded-md px-3 py-2 text-sm font-medium text-white ${billingReminder.isOverdue ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}>Pay now</button>}
          </div>
        </div>
      )}

      {(moduleSnapshots.property || moduleSnapshots.restaurant || moduleSnapshots.hr) && <section className="space-y-4" aria-label="Module overview">
        {moduleSnapshots.property && <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-lg font-semibold">{hasAgentWorkspace && !hasLandlordWorkspace ? 'Property Agent Operations' : hasLandlordWorkspace && !hasAgentWorkspace ? 'Landlord Portfolio' : 'Property portfolio'}</h2><p className="text-sm text-muted-foreground">Rent roll, occupancy, landlord clients, and managed-unit health.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {hasAgentWorkspace && <ModuleMetric label="Landlord clients" value={moduleSnapshots.property.landlordClients ?? '—'} />}
            <ModuleMetric label={hasAgentWorkspace && !hasLandlordWorkspace ? 'Managed properties' : 'My properties'} value={hasAgentWorkspace && !hasLandlordWorkspace ? moduleSnapshots.property.managedProperties ?? '—' : moduleSnapshots.property.properties} />
            <ModuleMetric label="Occupied units" value={`${Number(moduleSnapshots.property.occupied || 0).toLocaleString()} / ${Number(moduleSnapshots.property.units || 0).toLocaleString()}`} />
            <ModuleMetric label="Active tenancies" value={moduleSnapshots.property.activeTenancies} />
            <ModuleMetric label="Outstanding rent" value={formatCurrency(moduleSnapshots.property.outstandingRent || 0)} detail={`${Number(moduleSnapshots.property.vacant || 0).toLocaleString()} vacant units`} />
            {(hasPermission('canViewPropertyCollections') || hasPermission('canViewPropertyReports')) && <ModuleMetric label="Collected this month" value={formatCurrency(moduleSnapshots.property.collectedThisMonth || 0)} detail={`${Number(moduleSnapshots.property.paymentCount || 0).toLocaleString()} payments`} />}
            {hasPermission('canViewPropertyReports') && <ModuleMetric label="Overdue rent" value={formatCurrency(moduleSnapshots.property.arrears || 0)} />}
          </div>
        </div>}

        {moduleSnapshots.restaurant && <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-lg font-semibold">Restaurant &amp; bar</h2><p className="text-sm text-muted-foreground">Today&apos;s service activity and live queues.</p></div>
            <Link to="/tenant/restaurant/orders" className="text-sm font-medium text-primary hover:underline">Open service operations</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ModuleMetric label="Orders today" value={moduleSnapshots.restaurant.ordersToday} />
            <ModuleMetric label="Open tables" value={moduleSnapshots.restaurant.occupiedTables} detail={`${Number(moduleSnapshots.restaurant.openTables || 0).toLocaleString()} available`} />
            <ModuleMetric label="Kitchen queue" value={moduleSnapshots.restaurant.kitchenOrders} />
            <ModuleMetric label="Bar queue" value={moduleSnapshots.restaurant.barOrders} />
            {moduleSnapshots.restaurant.todaySales != null && <ModuleMetric label="Sales today" value={formatCurrency(moduleSnapshots.restaurant.todaySales)} detail={`${Number(moduleSnapshots.restaurant.completedCount || 0).toLocaleString()} completed orders`} />}
          </div>
        </div>}

        {moduleSnapshots.hr && <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-lg font-semibold">People &amp; payroll</h2><p className="text-sm text-muted-foreground">Workforce, attendance, and payroll items needing attention.</p></div>
            <Link to="/tenant/hr/employees" className="text-sm font-medium text-primary hover:underline">Open HR Management</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ModuleMetric label="Active employees" value={moduleSnapshots.hr.stats?.activeEmployees} />
            <ModuleMetric label="Present today" value={moduleSnapshots.hr.stats?.employeesPresentToday} detail={`${Number(moduleSnapshots.hr.stats?.employeesAbsentToday || 0).toLocaleString()} absent`} />
            <ModuleMetric label="Salary payable" value={formatCurrency(moduleSnapshots.hr.stats?.salaryPayable || 0)} />
            <ModuleMetric label="Pending approvals" value={Number(moduleSnapshots.hr.stats?.payrollAwaitingApproval || 0) + Number(moduleSnapshots.hr.stats?.leaveRequestsAwaitingApproval || 0)} detail="Payroll and leave" />
          </div>
        </div>}
      </section>}

      {/* KPI Cards Row 1 — only show for enabled features */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {hasFeature('sales') && canViewSalesDashboard && (
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

        {hasFeature('accounting') && canViewFinancialDashboard && (
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

        {hasFeature('sales') && canViewSalesDashboard && (
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
        {hasFeature('accounting') && canViewFinancialDashboard && (
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

        {hasFeature('accounting') && canViewFinancialDashboard && (
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost of Sales (COGS)</CardTitle>
            <ShoppingCart className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(k.cogs)}</div>
            <p className="text-xs text-muted-foreground">Cost of inventory sold; separate from operating expenses</p>
          </CardContent>
        </Card>
        )}

        {hasFeature('expenses') && hasPermission('canViewExpense') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operating Expenses</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(k.expenses)}</div>
            <p className="text-xs text-muted-foreground">Running costs, excluding Cost of Sales (COGS)</p>
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
            <div className="text-xl font-bold">{k.receivablesOutstanding == null ? 'Unavailable offline' : formatCurrency(k.receivablesOutstanding)}</div>
            <p className="text-xs text-muted-foreground">{k.receivablesCount == null ? 'Connect to refresh' : `${k.receivablesCount} customers with outstanding balances`}</p>
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
            {hasFeature('inventory') && hasPermission('canViewProduct') && <p className="text-xs text-muted-foreground">{k.productCount} products</p>}
          </CardContent>
        </Card>
        )}
      </div>

      {(hasDailyInsights || hasTrendInsights || hasMixInsights) && <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Business insights</h2>
          <p className="text-sm text-muted-foreground">Choose a view to focus on the numbers you need.</p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border bg-muted/40 p-1" role="tablist" aria-label="Dashboard insights">
          {(hasFeature('sales') && canViewSalesDashboard || hasFeature('accounting') && canViewFinancialDashboard) && (
            <button type="button" role="tab" aria-selected={dashboardView === 'daily'} onClick={() => setDashboardView('daily')} className={`shrink-0 rounded px-3 py-2 text-sm font-medium ${dashboardView === 'daily' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Daily</button>
          )}
          {(hasFeature('sales') && (canViewSalesDashboard || hasPermission('canViewExpense')) || hasFeature('accounting') && canViewFinancialDashboard) && (
            <button type="button" role="tab" aria-selected={dashboardView === 'trends'} onClick={() => setDashboardView('trends')} className={`shrink-0 rounded px-3 py-2 text-sm font-medium ${dashboardView === 'trends' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Trends</button>
          )}
          {(hasFeature('inventory') && hasPermission('canViewProduct') && canViewSalesDashboard || hasFeature('sales') && hasPermission('canViewSale')) && (
            <button type="button" role="tab" aria-selected={dashboardView === 'mix'} onClick={() => setDashboardView('mix')} className={`shrink-0 rounded px-3 py-2 text-sm font-medium ${dashboardView === 'mix' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Products &amp; payments</button>
          )}
        </div>
      </div>}

      {/* Daily Performance Chart */}
      {dashboardView === 'daily' && (hasFeature('sales') && canViewSalesDashboard || hasFeature('accounting') && canViewFinancialDashboard) && dailyPerf && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-500" /> Daily Performance</CardTitle>
              <CardDescription>Daily business activity — {formatDisplayDate(new Date())}</CardDescription>
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
            {canViewSalesDashboard && <Bar dataKey="revenue" fill="url(#colorRevBar)" radius={[3, 3, 0, 0]} name="revenue" />}
              {canViewFinancialDashboard && <Bar dataKey="profit" fill="url(#colorProfitBar)" radius={[3, 3, 0, 0]} name="profit" />}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      )}

      {/* Charts Row — only show for enabled features */}
      {dashboardView === 'trends' && <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue vs Operating Expenses Chart */}
        {hasFeature('sales') && (canViewSalesDashboard || hasPermission('canViewExpense')) && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue vs Operating Expenses</CardTitle>
            <CardDescription>12-month trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                {canViewSalesDashboard && <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Revenue" />}
                {hasPermission('canViewExpense') && <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} strokeDasharray="7 7" name="Operating Expenses" />}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}

        {/* Profit & Loss Chart */}
        {hasFeature('accounting') && canViewFinancialDashboard && (
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
      </div>}

      {/* Bottom Row — only show for enabled features */}
      {dashboardView === 'mix' && <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Products */}
        {hasFeature('inventory') && hasPermission('canViewProduct') && canViewSalesDashboard && (
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
      </div>}

      {showBillingPrompt && billingReminder && !billingReminder.isTrial && (
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
                  <p className="text-lg font-semibold text-slate-900">{billingForm.gateway === 'pesapal' ? 'Opening Pesapal checkout' : 'Waiting for payment approval'}</p>
                  <p className="text-sm text-slate-600">{billingForm.gateway === 'pesapal' ? 'Connecting you to Pesapal to complete your payment.' : 'Waiting for the payment provider to confirm your subscription payment.'}</p>
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
                  <p className="text-sm text-slate-600">The checkout could not be opened or payment was not confirmed. Please retry or contact the JibuSales Support Team.</p>
                </div>
                <SupportContactLinks compact message="Hello JibuSales Support Team, I need help with my subscription payment." className="justify-center" />
                <button onClick={() => setBillingPaymentState('idle')} className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Try again</button>
              </div>
            ) : (
              <div className="space-y-4">
                {billingForm.gateway === 'pesapal' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Payment provider</label>
                      <select
                        value={billingForm.gateway}
                        onChange={(e) => setBillingForm({ ...billingForm, gateway: e.target.value, paymentMethod: 'mobile_money' })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="pesapal">Pesapal (Mobile Money or Card)</option>
                        <option value="relworx">Relworx Mobile Money</option>
                      </select>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">Amount due</p>
                      <p>{billingReminder.amountDue ? formatCurrency(billingReminder.amountDue) : 'Your subscription amount'}</p>
                      <p className="mt-1 text-xs">The amount is calculated from your subscription invoice and sent securely to Pesapal.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Payment method</label>
                      <select value={billingForm.paymentMethod} onChange={event => setBillingForm({ ...billingForm, paymentMethod: event.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="mobile_money">Mobile Money</option>
                        <option value="card">Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Payer phone number</label>
                      <input type="tel" required value={billingForm.phoneNumber} onChange={event => setBillingForm({ ...billingForm, phoneNumber: event.target.value })} placeholder="+256700000000" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Payer email</label>
                      <input type="email" required value={billingForm.email} onChange={event => setBillingForm({ ...billingForm, email: event.target.value })} placeholder="name@example.com" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    </div>
                    <button
                      onClick={confirmBillingPrompt}
                      disabled={!billingForm.phoneNumber.trim() || !billingForm.email.trim()}
                      className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Continue to Pesapal checkout
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Payment provider</label>
                      <select
                        value={billingForm.gateway}
                        onChange={(e) => setBillingForm({ ...billingForm, gateway: e.target.value, paymentMethod: 'mobile_money' })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="pesapal">Pesapal (Mobile Money or Card)</option>
                        <option value="relworx">Relworx Mobile Money</option>
                      </select>
                    </div>

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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
