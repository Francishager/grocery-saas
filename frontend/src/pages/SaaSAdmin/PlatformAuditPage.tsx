import { apiFetch } from '../../lib/api'
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Search, Loader2, RefreshCw, Server, ChevronLeft, ChevronRight } from 'lucide-react'

interface AuditLog {
  id: string; tenantId: string; tenantName: string; userId: string; userEmail: string
  action: string; model: string; recordId: string | null; ip: string | null; createdAt: string
}

interface Pagination { page: number; limit: number; total: number; pages: number }

export const PlatformAuditPage: React.FC = () => {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ search: '', tenantId: '', action: '', model: '' })
  const [appliedFilters, setAppliedFilters] = useState({ search: '', tenantId: '', action: '', model: '' })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '10')
      if (appliedFilters.search) params.set('search', appliedFilters.search)
      if (appliedFilters.tenantId) params.set('tenantId', appliedFilters.tenantId)
      if (appliedFilters.action) params.set('action', appliedFilters.action)
      if (appliedFilters.model) params.set('model', appliedFilters.model)

      const res = await apiFetch(`/api/platform/audit?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setPagination(data.pagination)
      }
    } catch {}
    setLoading(false)
  }, [page, appliedFilters])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleSearch = () => {
    setPage(1)
    setAppliedFilters(filters)
  }

  const handleClear = () => {
    setFilters({ search: '', tenantId: '', action: '', model: '' })
    setAppliedFilters({ search: '', tenantId: '', action: '', model: '' })
    setPage(1)
  }

  const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Get unique IPs for summary
  const uniqueIPs = [...new Set(logs.map(l => l.ip).filter(Boolean))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity size={24} /> Platform Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">All activity across all tenants with IP tracking</p>
        </div>
        <button onClick={fetchLogs} className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input
              value={filters.search}
              onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Email, action, model, IP..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tenant ID</label>
            <input
              value={filters.tenantId}
              onChange={e => setFilters(p => ({ ...p, tenantId: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Filter by tenant ID"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
            <select
              value={filters.action}
              onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
            <input
              value={filters.model}
              onChange={e => setFilters(p => ({ ...p, model: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Product, Sale, User..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
            <Search size={16} /> Search
          </button>
          <button onClick={handleClear} className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
            Clear
          </button>
        </div>
      </div>

      {/* IP Summary */}
      {uniqueIPs.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Server size={16} className="text-gray-400" /> Unique IPs in Current Results ({uniqueIPs.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {uniqueIPs.map(ip => (
              <span key={ip} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">{ip}</span>
            ))}
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Tenant</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">User</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Action</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Model</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">IP Address</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-500">No audit logs found</td></tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/saas/businesses/${log.tenantId}`)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {log.tenantName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">{log.userEmail || '-'}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">{log.action}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{log.model || '-'}</td>
                    <td className="px-4 py-3"><span className="text-xs font-mono px-2 py-0.5 bg-gray-100 rounded">{log.ip || '-'}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 border rounded-lg disabled:opacity-50 hover:bg-gray-50 flex items-center gap-1 text-sm"
                  >
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page === pagination.pages}
                    className="px-3 py-1.5 border rounded-lg disabled:opacity-50 hover:bg-gray-50 flex items-center gap-1 text-sm"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default PlatformAuditPage
