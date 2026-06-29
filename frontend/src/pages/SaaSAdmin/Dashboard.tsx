import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building, Users, DollarSign, Mail, AlertCircle, Loader2, Activity, Server, Package, Ban, RefreshCw } from 'lucide-react'

interface DetailedStats {
  overview: {
    totalTenants: number
    activeTenants: number
    suspendedTenants: number
    trialTenants: number
    totalUsers: number
    activeUsers: number
    totalPlans: number
    totalFeatures: number
    totalSales: number
    totalRevenue: number
    pendingInvitations: number
    monthlyRevenue: number
    expiringSubscriptions: number
  }
  planDistribution: { planId: string; planName: string; count: number; price: number; currency: string }[]
  recentTenants: { id: string; name: string; slug: string; status: string; planName: string; userCount: number; createdAt: string }[]
  recentActivity: { id: string; tenantId: string; userEmail: string; action: string; model: string; ip: string | null; createdAt: string }[]
}

export const SaaSAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DetailedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/platform/stats/detailed', {})
      if (res.ok) setStats(await res.json())
    } catch {}
    setLoading(false)
  }

  const fmt = (n: number, c?: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'UGX', minimumFractionDigits: 0 }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>

  const o = stats?.overview

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Platform Dashboard</h1><p className="text-gray-500">Manage tenants, plans, and platform features</p></div>
        <button onClick={fetchStats} className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"><RefreshCw size={18} /> Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Total Tenants</p><p className="text-2xl font-bold mt-1">{o?.totalTenants || 0}</p></div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center"><Building className="w-6 h-6 text-blue-600" /></div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="text-green-600">{o?.activeTenants || 0} active</span>
            <span className="text-red-600">{o?.suspendedTenants || 0} suspended</span>
            <span className="text-blue-600">{o?.trialTenants || 0} trial</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Total Users</p><p className="text-2xl font-bold mt-1">{o?.totalUsers || 0}</p></div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center"><Users className="w-6 h-6 text-purple-600" /></div>
          </div>
          <p className="mt-4 text-sm text-gray-500">{o?.activeUsers || 0} active across all tenants</p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Monthly Revenue</p><p className="text-2xl font-bold mt-1">{fmt(o?.monthlyRevenue || 0)}</p></div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center"><DollarSign className="w-6 h-6 text-green-600" /></div>
          </div>
          <p className="mt-4 text-sm text-gray-500">From {o?.totalPlans || 0} plans & {o?.totalFeatures || 0} features</p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Pending Invitations</p><p className="text-2xl font-bold mt-1">{o?.pendingInvitations || 0}</p></div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center"><Mail className="w-6 h-6 text-yellow-600" /></div>
          </div>
          <a href="/saas/invitations" className="mt-4 text-sm text-blue-600 hover:underline block">View all invitations &rarr;</a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center"><Package className="w-5 h-5 text-indigo-600" /></div>
            <div><p className="text-xs text-gray-500">Total Sales</p><p className="text-lg font-bold">{o?.totalSales || 0}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-gray-500">Total Revenue</p><p className="text-lg font-bold">{fmt(o?.totalRevenue || 0)}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><AlertCircle className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xs text-gray-500">Expiring Subs</p><p className="text-lg font-bold">{o?.expiringSubscriptions || 0}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><Ban className="w-5 h-5 text-red-600" /></div>
            <div><p className="text-xs text-gray-500">Suspended</p><p className="text-lg font-bold">{o?.suspendedTenants || 0}</p></div>
          </div>
        </div>
      </div>

      {(o?.expiringSubscriptions || 0) > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">{o?.expiringSubscriptions} subscriptions expiring soon</p>
              <p className="text-sm text-yellow-700">Review and follow up with tenants before their subscription expires</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Plan Distribution</h2>
          {stats?.planDistribution.length === 0 ? (
            <p className="text-gray-500 text-sm">No active plan subscriptions</p>
          ) : (
            <div className="space-y-3">
              {stats?.planDistribution.map(p => {
                const maxCount = Math.max(...stats.planDistribution.map(p => p.count), 1)
                return (
                  <div key={p.planId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{p.planName}</span>
                      <span className="text-gray-500">{p.count} tenants &middot; {fmt(p.price, p.currency)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Tenants</h2>
            <button onClick={() => navigate('/saas/businesses')} className="text-sm text-blue-600 hover:underline">View all &rarr;</button>
          </div>
          <div className="space-y-3">
            {stats?.recentTenants.map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Building size={16} className="text-blue-600" /></div>
                  <div>
                    <button onClick={() => navigate(`/saas/businesses/${t.id}`)} className="font-medium hover:underline">{t.name}</button>
                    <div className="text-xs text-gray-500">{t.planName} &middot; {t.userCount} users &middot; {fmtDate(t.createdAt)}</div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${t.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Activity size={18} /> Recent Platform Activity</h2>
          <button onClick={() => navigate('/saas/audit')} className="text-sm text-blue-600 hover:underline">View all logs &rarr;</button>
        </div>
        {stats?.recentActivity.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {stats?.recentActivity.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{a.action}</span>
                  <span className="text-gray-600">{a.userEmail}</span>
                  <span className="text-gray-400">{a.model}</span>
                </div>
                <div className="flex items-center gap-3">
                  {a.ip && <span className="text-xs font-mono text-gray-400 flex items-center gap-1"><Server size={12} /> {a.ip}</span>}
                  <span className="text-xs text-gray-400">{fmtDateTime(a.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SaaSAdminDashboard
