import { apiFetch } from '../../lib/api'
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Search, Loader2, RefreshCw, ChevronLeft, ChevronRight, Clock3, Eye, ShieldCheck } from 'lucide-react'

interface AuditLog {
  id: string
  tenantId: string | null
  tenantName: string
  actor: string
  ip: string | null
  action: string
  model: string
  statusCode: number
  severity: string
  createdAt: string
}

interface Pagination { page: number; limit: number; total: number; pages: number }
interface AuditInsights {
  totalEvents: number
  byFeature: Array<{ feature: string; count: number }>
  byHour: Array<{ hour: number; count: number }>
  featureRankingRule: string
  truncated?: boolean
  refreshedAt: string
}

const emptyPagination: Pagination = { page: 1, limit: 25, total: 0, pages: 0 }

export const PlatformAuditPage: React.FC = () => {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>(emptyPagination)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [insights, setInsights] = useState<AuditInsights | null>(null)
  const [refreshedAt, setRefreshedAt] = useState('')
  const [page, setPage] = useState(1)
  const [insightDays, setInsightDays] = useState(30)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [filters, setFilters] = useState({ search: '', tenantId: '', action: '', model: '' })
  const [appliedFilters, setAppliedFilters] = useState({ search: '', tenantId: '', action: '', model: '' })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (appliedFilters.search) params.set('search', appliedFilters.search)
      if (appliedFilters.tenantId) params.set('tenantId', appliedFilters.tenantId)
      if (appliedFilters.action) params.set('action', appliedFilters.action)
      if (appliedFilters.model) params.set('model', appliedFilters.model)

      const [response, insightsResponse] = await Promise.all([
        apiFetch(`/api/platform/audit?${params}`),
        apiFetch(`/api/platform/audit/insights?days=${insightDays}`),
      ])
      if (!response.ok) throw new Error('Unable to load platform activity')
      const data = await response.json()
      setLogs(Array.isArray(data?.logs) ? data.logs : [])
      setPagination(data?.pagination || emptyPagination)
      setRefreshedAt(data?.refreshedAt || '')
      if (insightsResponse.ok) setInsights(await insightsResponse.json())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load platform activity')
    } finally {
      setLoading(false)
    }
  }, [page, appliedFilters, insightDays])

  useEffect(() => { void fetchLogs() }, [fetchLogs])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchLogs()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [fetchLogs])

  const handleSearch = () => {
    setPage(1)
    setAppliedFilters(filters)
  }

  const handleClear = () => {
    const cleared = { search: '', tenantId: '', action: '', model: '' }
    setFilters(cleared)
    setAppliedFilters(cleared)
    setPage(1)
  }

  const fmtDateTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))
  const actionLabel = (action: string) => ({
    create: 'Created', update: 'Updated', delete: 'Deleted', view: 'Viewed',
    create_sensitive: 'Created (sensitive)', update_sensitive: 'Updated (sensitive)', delete_sensitive: 'Deleted (sensitive)',
    login: 'Signed in', login_failed: 'Sign-in failed', login_requires_reset: 'Password reset required', login_blocked_subscription: 'Sign-in blocked · subscription', login_blocked_schedule: 'Sign-in blocked · schedule',
  }[action] || action.replaceAll('_', ' '))
  const mostUsed = insights?.byFeature?.[0]
  const busiestHour = insights?.byHour?.reduce((best, item) => item.count > (best?.count || 0) ? item : best, { hour: 0, count: 0 })
  const selectedHourData = selectedHour == null ? null : insights?.byHour?.find(item => item.hour === selectedHour) || null
  const peakHourCount = busiestHour?.count || 0
  const peakHours = insights?.byHour?.filter(item => item.count === peakHourCount && peakHourCount > 0) || []
  const maxFeatureCount = Math.max(1, ...(insights?.byFeature || []).map(item => item.count))
  const maxHourCount = Math.max(1, ...(insights?.byHour || []).map(item => item.count))
  const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Activity size={24} /> Platform Audit</h1>
          <p className="mt-1 text-sm text-gray-500">Live operational activity and feature usage · Kampala time</p>
        </div>
        <div className="flex items-center gap-3">
          {refreshedAt && <span className="hidden text-xs text-gray-500 sm:inline">Updated {fmtDateTime(refreshedAt)}</span>}
          <button onClick={() => { void fetchLogs() }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50" title="Refresh activity">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-700">Usage window</p>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">Include last
          <select value={insightDays} onChange={event => { setInsightDays(Number(event.target.value)); setSelectedHour(null) }} className="h-9 rounded-md border bg-white px-2 text-sm text-gray-900">
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
        </label>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Platform usage overview">
        <div className="rounded-md border bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Activity size={15} /> Recorded events · {insightDays} days</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{insights?.totalEvents?.toLocaleString() ?? '—'}</div>
        </div>
        <div className="rounded-md border bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Eye size={15} /> Most-used feature · {insightDays} days</div>
          <div className="mt-2 text-lg font-semibold">{mostUsed?.feature || 'No usage yet'}</div>
          {mostUsed && <div className="text-xs text-gray-500">{mostUsed.count.toLocaleString()} qualified user-days · Dashboard excluded</div>}
        </div>
        <button type="button" disabled={!peakHourCount} onClick={() => { if (!busiestHour || !peakHourCount) return; setSelectedHour(busiestHour.hour); document.getElementById('platform-usage-by-hour')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} className="rounded-md border bg-white p-4 text-left transition-colors hover:bg-teal-50 disabled:cursor-default disabled:hover:bg-white">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Clock3 size={15} /> Busiest hour · Kampala · {insightDays} days</div>
          <div className="mt-2 text-lg font-semibold">{peakHours.length > 1 ? `${peakHours.length} tied peak hours` : peakHourCount ? hourLabel(busiestHour!.hour) : 'No usage yet'}</div>
          {peakHourCount > 0 && <div className="text-xs text-gray-500">{peakHourCount.toLocaleString()} recorded events{peakHours.length > 1 ? ` in each peak hour (${peakHours.map(item => hourLabel(item.hour).slice(0, 5)).join(', ')})` : ''}</div>}
          {peakHourCount > 0 && <div className="mt-1 text-[11px] text-teal-800">Open this hour in the chart</div>}
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Feature usage analysis">
        <div id="platform-usage-by-hour" className="rounded-md border bg-white p-4">
          <h2 className="text-sm font-semibold">Most-used features</h2>
          <p className="mb-3 mt-1 text-xs text-gray-500">{insights?.featureRankingRule || 'Dashboard is excluded; repeat views by the same user count once per business-day.'}</p>
          {!insights?.byFeature?.length ? <p className="text-sm text-gray-500">No activity recorded yet.</p> : <div className="space-y-3">
            {insights.byFeature.slice(0, 8).map(item => <div key={item.feature}>
              <div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{item.feature}</span><span className="tabular-nums text-gray-500">{item.count.toLocaleString()}</span></div>
              <div className="h-2 overflow-hidden rounded bg-gray-100"><div className="h-full bg-teal-600" style={{ width: `${Math.max(3, item.count / maxFeatureCount * 100)}%` }} /></div>
            </div>)}
          </div>}
        </div>
        <div className="rounded-md border bg-white p-4">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">Usage by hour · Kampala</h2><p className="mt-1 text-xs text-gray-500">Select a column to inspect that hour · {insightDays}-day window</p></div>{insights?.truncated && <span className="text-xs text-amber-700">Showing a capped sample</span>}</div>
          <div className="flex h-32 items-end gap-1" aria-label="Interactive activity counts by hour in Kampala time">
            {(insights?.byHour || Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))).map(item => <button key={item.hour} type="button" aria-label={`${hourLabel(item.hour)}: ${item.count} events`} aria-pressed={selectedHour === item.hour} className="flex h-full min-w-0 flex-1 items-end rounded-t-sm px-px outline-none hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700" title={`${hourLabel(item.hour)} · ${item.count.toLocaleString()} events`} onClick={() => setSelectedHour(selectedHour === item.hour ? null : item.hour)}>
              <span className={`w-full rounded-t-sm transition-colors ${selectedHour === item.hour ? 'bg-amber-500' : item.count === peakHourCount && peakHourCount > 0 ? 'bg-teal-800' : 'bg-teal-600/80'}`} style={{ height: `${item.count ? Math.max(5, item.count / maxHourCount * 100) : 2}%` }} />
            </button>)}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
          <div aria-live="polite" className="mt-3 border-t pt-3 text-sm">{selectedHourData ? <><span className="font-semibold">{hourLabel(selectedHourData.hour)}</span><span className="ml-2 tabular-nums text-gray-600">{selectedHourData.count.toLocaleString()} recorded events</span>{selectedHourData.count === peakHourCount && peakHourCount > 0 && <span className="ml-2 text-xs font-medium text-teal-800">Peak for this window</span>}</> : <span className="text-xs text-gray-500">{peakHourCount ? `Peak: ${hourLabel(busiestHour!.hour)} · Select another hour to compare.` : 'No activity in this period.'}</span>}</div>
        </div>
      </section>

      <section className="rounded-md border bg-white p-4" aria-label="Activity filters">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="text-xs font-medium text-gray-500">Search
            <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Business, email, IP, feature, action" className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="text-xs font-medium text-gray-500">Tenant ID
            <input value={filters.tenantId} onChange={e => setFilters(p => ({ ...p, tenantId: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Filter by tenant ID" className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="text-xs font-medium text-gray-500">Action
            <select value={filters.action} onChange={e => setFilters(p => ({ ...p, action: e.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-gray-900">
              <option value="">All actions</option><option value="create">Create</option><option value="update">Update</option><option value="delete">Delete</option><option value="view">Feature view</option><option value="login">Sign-in events</option>
            </select>
          </label>
          <label className="text-xs font-medium text-gray-500">Model / feature
            <input value={filters.model} onChange={e => setFilters(p => ({ ...p, model: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Sales, Inventory, HR..." className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={handleSearch} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"><Search size={15} /> Search</button>
          <button onClick={handleClear} className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">Clear</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border bg-white" aria-label="Live activity feed">
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div> : error ? <div className="p-8 text-center text-sm text-red-700">{error}</div> : <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px]">
              <thead className="border-b bg-gray-50 text-left">
                <tr><th className="px-4 py-3 text-xs font-medium text-gray-500">Business</th><th className="px-4 py-3 text-xs font-medium text-gray-500">Action</th><th className="px-4 py-3 text-xs font-medium text-gray-500">Model / feature</th><th className="px-4 py-3 text-xs font-medium text-gray-500">User email</th><th className="px-4 py-3 text-xs font-medium text-gray-500">IP address</th><th className="px-4 py-3 text-xs font-medium text-gray-500">Outcome</th><th className="px-4 py-3 text-xs font-medium text-gray-500">Date & time</th></tr>
              </thead>
              <tbody className="divide-y">
                {!logs.length ? <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-500">No activity found for these filters</td></tr> : logs.map(log => <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{log.tenantId ? <button onClick={() => navigate(`/saas/businesses/${log.tenantId}`)} className="text-left text-sm text-blue-700 hover:underline">{log.tenantName}</button> : <span className="text-sm">{log.tenantName}</span>}</td>
                  <td className="px-4 py-3"><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">{actionLabel(log.action)}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-700">{log.model || 'Other'}</td>
                  <td className="max-w-[220px] break-all px-4 py-3 text-sm text-gray-700">{log.actor || 'Email not captured'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700">{log.ip || 'IP not captured'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-xs ${log.statusCode >= 400 ? 'text-red-700' : 'text-emerald-700'}`}><ShieldCheck size={13} />{log.statusCode >= 400 ? `Failed (${log.statusCode})` : 'Success'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-gray-500">{fmtDateTime(log.createdAt)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {pagination.pages > 1 && <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-gray-500">Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-md border p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span className="text-xs text-gray-500">Page {pagination.page} of {pagination.pages}</span>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="rounded-md border p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
          </div>}
        </>}
      </section>
    </div>
  )
}

export default PlatformAuditPage
