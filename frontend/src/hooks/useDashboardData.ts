import { useCallback, useEffect, useRef, useState } from 'react'
import { dashboardApi, type DashboardKpis, type SalesChartData, type ProfitLossData, type TopProduct, type PaymentMethodData, type DailyPerformanceData } from '@/lib/api'
import { getLocalDashboardKpis, getLocalDashboardCharts } from '@/db/hybrid'
import { getSyncStatus, onSyncStatusChange } from '@/db/sync'

export function useDashboardData(enabled: boolean, online: boolean, scopeKey: string) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [salesChart, setSalesChart] = useState<SalesChartData | null>(null)
  const [profitLoss, setProfitLoss] = useState<ProfitLossData | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([])
  const [dailyPerf, setDailyPerf] = useState<DailyPerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isOfflineData, setIsOfflineData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const lastStarted = useRef(0)

  const refresh = useCallback(async () => {
    if (!enabled) return
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    lastStarted.current = Date.now()
    const current = () => activeRequest.current === controller && !controller.signal.aborted
    setRefreshing(true)
    setError(null)

    if (!online) {
      try {
        const [localKpis, charts] = await Promise.all([getLocalDashboardKpis(), getLocalDashboardCharts()])
        if (!current()) return
        setKpis(localKpis)
        setSalesChart(charts.salesChart)
        setProfitLoss(charts.profitLoss)
        setTopProducts(charts.topProducts)
        setPaymentMethods(charts.paymentMethods)
        setDailyPerf(null)
        setIsOfflineData(true)
      } catch {
        if (current()) setError('Could not load offline dashboard data.')
      } finally {
        if (current()) { setLoading(false); setRefreshing(false) }
      }
      return
    }

    // Each response updates only its own section. A failed chart must not replace verified balances.
    const kpiRequest = dashboardApi.getKpis(controller.signal).then((value) => {
      if (!current()) return
      setKpis(value)
      setIsOfflineData(false)
    }).catch(() => {
      if (current()) setError('Could not refresh dashboard totals. Please retry.')
    }).finally(() => {
      if (current()) setLoading(false)
    })
    const section = <T,>(request: Promise<T>, update: (value: T) => void) => request.then((value) => {
      if (current()) update(value)
    }).catch(() => {
      if (current()) setError((previous) => previous || 'Some charts could not be refreshed. Please retry.')
    })
    await Promise.allSettled([
      kpiRequest,
      section(dashboardApi.getSalesChart(controller.signal), setSalesChart),
      section(dashboardApi.getProfitLoss(controller.signal), setProfitLoss),
      section(dashboardApi.getTopProducts(controller.signal), setTopProducts),
      section(dashboardApi.getPaymentMethods(controller.signal), setPaymentMethods),
      section(dashboardApi.getDailyPerformance(controller.signal), setDailyPerf),
    ])
    if (current()) setRefreshing(false)
  }, [enabled, online, scopeKey])

  useEffect(() => {
    setKpis(null)
    setSalesChart(null)
    setProfitLoss(null)
    setTopProducts([])
    setPaymentMethods([])
    setDailyPerf(null)
    setLoading(enabled)
    setError(null)
    setIsOfflineData(false)
    return () => activeRequest.current?.abort()
  }, [scopeKey, enabled])

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    void refresh()
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - lastStarted.current > 1000) void refresh()
    }
    let previousSyncStatus = getSyncStatus()
    const unsubscribe = onSyncStatusChange((status) => {
      if (status === 'idle' && previousSyncStatus === 'syncing') void refresh()
      previousSyncStatus = status
    })
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      activeRequest.current?.abort()
      unsubscribe()
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [enabled, refresh])

  return { kpis, salesChart, profitLoss, topProducts, paymentMethods, dailyPerf,
    loading, refreshing, isOfflineData, error, refresh }
}
