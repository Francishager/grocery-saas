import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { Building, Search, Eye, Ban, CheckCircle, Loader2, RefreshCw, X } from 'lucide-react'

interface Tenant {
  id: string; name: string; slug: string; status: string; planId: string
  ownerName: string; ownerEmail: string; createdAt: string
  _count?: { users: number; customers: number; suppliers: number }
  plan?: { name: string; price: number; currency: string; billingCycle: string }
}


  const t = localStorage.getItem('auth_tokens')
  if (t) { try { h['Authorization'] = `Bearer ${JSON.parse(t).accessToken}` } catch {} }
  return h
}

export const BusinessesPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selected, setSelected] = useState<Tenant | null>(null)

  const fetchTenants = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (search) params.append('search', search)
      const res = await apiFetch(`/api/tenants?${params}`, {})
      if (res.ok) { const d = await res.json(); setTenants(d.tenants || d) }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchTenants() }, [statusFilter])

  const handleAction = async (id: string, action: 'activate' | 'suspend') => {
    if (!confirm(`Are you sure you want to ${action} this tenant?`)) return
    setActionLoading(id)
    try {
      const res = await apiFetch(`/api/tenants/${id}/${action}`, { method: 'POST' })
      if (res.ok) fetchTenants()
      else alert(`Failed to ${action} tenant`)
    } catch { alert('Request failed') }
    setActionLoading(null)
  }

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = { active: 'bg-green-100 text-green-800', suspended: 'bg-red-100 text-red-800', trial: 'bg-blue-100 text-blue-800', expired: 'bg-gray-100 text-gray-800' }
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls[s] || 'bg-gray-100 text-gray-800'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Businesses</h1><p className="text-gray-500">Manage all business tenants on the platform</p></div>
        <button onClick={fetchTenants} className="px-3 py-2 border rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchTenants()} placeholder="Search by name or email..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2 border rounded-lg">
          <option value="all">All Status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="trial">Trial</option><option value="expired">Expired</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12"><Building className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No tenants found</p></div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Business</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Owner</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plan</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Users</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Created</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Building size={20} className="text-blue-600" /></div><div><div className="text-sm font-medium">{t.name}</div><div className="text-xs text-gray-500">{t.slug}</div></div></div></td>
                  <td className="px-4 py-3"><div className="text-sm font-medium">{t.ownerName || '-'}</div><div className="text-xs text-gray-500">{t.ownerEmail || '-'}</div></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{t.plan?.name || '-'}</td>
                  <td className="px-4 py-3">{statusBadge(t.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{t._count?.users || 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelected(t)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="View"><Eye size={16} /></button>
                      <button onClick={() => handleAction(t.id, t.status === 'suspended' ? 'activate' : 'suspend')} disabled={actionLoading === t.id} className={`p-1 rounded ${t.status === 'suspended' ? 'text-green-600 hover:bg-green-50' : 'text-red-600 hover:bg-red-50'}`} title={t.status === 'suspended' ? 'Activate' : 'Suspend'}>
                        {actionLoading === t.id ? <Loader2 size={16} className="animate-spin" /> : t.status === 'suspended' ? <CheckCircle size={16} /> : <Ban size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{selected.name}</h2><button onClick={() => setSelected(null)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button></div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Slug</span><span>{selected.slug}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span>{statusBadge(selected.status)}</div>
              <div className="flex justify-between"><span className="text-gray-500">Plan</span><span>{selected.plan?.name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Owner</span><span>{selected.ownerName || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{selected.ownerEmail || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Users</span><span>{selected._count?.users || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Customers</span><span>{selected._count?.customers || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{fmtDate(selected.createdAt)}</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => handleAction(selected.id, selected.status === 'suspended' ? 'activate' : 'suspend')} className={`flex-1 px-4 py-2 rounded-lg text-white ${selected.status === 'suspended' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {selected.status === 'suspended' ? 'Activate' : 'Suspend'}
              </button>
              <button onClick={() => setSelected(null)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BusinessesPage
