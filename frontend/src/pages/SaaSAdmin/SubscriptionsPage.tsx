import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { CreditCard, Search, Loader2, RefreshCw, X, ArrowRightLeft } from 'lucide-react'

interface Subscription {
  id: string; status: string; startDate: string; endDate: string | null
  tenant: { id: string; name: string; status: string }
  plan: { id: string; name: string; price: number; currency: string; billingCycle: string }
}

interface Plan { id: string; name: string; price: number; currency: string }

export const SubscriptionsPage: React.FC = () => {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Subscription | null>(null)
  const [changing, setChanging] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [sRes, pRes] = await Promise.all([
        apiFetch('/api/admin/subscriptions', {}),
        apiFetch('/api/platform/plans', {}),
      ])
      if (sRes.ok) { const d = await sRes.json(); setSubs(d.subscriptions || d) }
      if (pRes.ok) setPlans(await pRes.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleChangePlan = async (subId: string, planId: string) => {
    setChanging(subId)
    try {
      const res = await apiFetch(`/api/admin/subscriptions/${subId}`, { method: 'PUT', body: JSON.stringify({ planId }) })
      if (res.ok) { fetchData(); setSelected(null) } else alert('Failed to change plan')
    } catch { alert('Request failed') }
    setChanging(null)
  }

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = { active: 'bg-green-100 text-green-800', trial: 'bg-blue-100 text-blue-800', past_due: 'bg-yellow-100 text-yellow-800', cancelled: 'bg-red-100 text-red-800', expired: 'bg-gray-100 text-gray-800' }
    const label = (s || 'unknown').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
    return <span className={`px-2 py-1 rounded text-xs font-medium ${cls[s] || 'bg-gray-100 text-gray-800'}`}>{label}</span>
  }

  const fmt = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'UGX', minimumFractionDigits: 0 }).format(n)
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Subscriptions</h1><p className="text-gray-500">View and manage tenant subscriptions</p></div>
        <button onClick={fetchData} className="px-3 py-2 border rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by business name..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : subs.length === 0 ? (
          <div className="text-center py-12"><CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No subscriptions found</p></div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Business</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plan</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Start</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">End</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {subs.filter(s => !search || (s.tenant?.name || '').toLowerCase().includes(search.toLowerCase())).map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><div className="text-sm font-medium">{s.tenant?.name || '-'}</div><span className={`text-xs px-2 py-0.5 rounded ${s.tenant?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{s.tenant?.status || '-'}</span></td>
                  <td className="px-4 py-3"><div className="text-sm font-medium">{s.plan?.name || 'No Plan'}</div><div className="text-xs text-gray-500">{fmt(s.plan?.price || 0, s.plan?.currency || 'UGX')}/{s.plan?.billingCycle || '-'}</div></td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.startDate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.endDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelected(s)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Change Plan"><ArrowRightLeft size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Change Plan - {selected.tenant?.name}</h2><button onClick={() => setSelected(null)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button></div>
            <div className="space-y-3 text-sm mb-4">
              <div className="flex justify-between"><span className="text-gray-500">Current Plan</span><span className="font-medium">{selected.plan?.name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span>{statusBadge(selected.status)}</div>
            </div>
            <div><label className="block text-sm font-medium mb-2">Select New Plan</label>
              <div className="space-y-2">
                {plans.map(p => (
                  <button key={p.id} onClick={() => handleChangePlan(selected.id, p.id)} disabled={changing === selected.id} className={`w-full flex items-center justify-between p-3 border rounded-lg hover:bg-blue-50 ${p.id === selected.plan?.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-sm text-gray-500">{fmt(p.price, p.currency)}</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="mt-4 w-full px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SubscriptionsPage
