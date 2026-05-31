import React, { useState, useEffect } from 'react'
import { Building, Users, DollarSign, TrendingUp, Mail, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface PlatformStats {
  totalTenants: number
  activeTenants: number
  suspendedTenants: number
  trialTenants: number
  totalUsers: number
  monthlyRevenue: number
  revenueChange: number
  pendingInvitations: number
  expiringSubscriptions: number
}

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const t = localStorage.getItem('auth_tokens')
  if (t) { try { h['Authorization'] = `Bearer ${JSON.parse(t).accessToken}` } catch {} }
  return h
}

export const SaaSAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/platform/stats', { headers: getAuthHeaders() })
      if (res.ok) setStats(await res.json())
    } catch {}
    setLoading(false)
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(n)

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Platform Dashboard</h1><p className="text-gray-500">Manage tenants, plans, and platform features</p></div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Total Tenants</p><p className="text-2xl font-bold mt-1">{stats?.totalTenants || 0}</p></div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center"><Building className="w-6 h-6 text-blue-600" /></div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="text-green-600">{stats?.activeTenants} active</span>
            <span className="text-yellow-600">{stats?.trialTenants} trial</span>
            <span className="text-red-600">{stats?.suspendedTenants} suspended</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Total Users</p><p className="text-2xl font-bold mt-1">{stats?.totalUsers || 0}</p></div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center"><Users className="w-6 h-6 text-purple-600" /></div>
          </div>
          <p className="mt-4 text-sm text-gray-500">Across all tenants</p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Monthly Revenue</p><p className="text-2xl font-bold mt-1">{fmt(stats?.monthlyRevenue || 0)}</p></div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center"><DollarSign className="w-6 h-6 text-green-600" /></div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-sm">
            {(stats?.revenueChange || 0) >= 0 ? (
              <><ArrowUpRight className="w-4 h-4 text-green-600" /><span className="text-green-600">+{stats?.revenueChange}%</span></>
            ) : (
              <><ArrowDownRight className="w-4 h-4 text-red-600" /><span className="text-red-600">{stats?.revenueChange}%</span></>
            )}
            <span className="text-gray-500 ml-1">vs last month</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Pending Invitations</p><p className="text-2xl font-bold mt-1">{stats?.pendingInvitations || 0}</p></div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center"><Mail className="w-6 h-6 text-yellow-600" /></div>
          </div>
          <a href="/saas/invitations" className="mt-4 text-sm text-blue-600 hover:underline">View all invitations →</a>
        </div>
      </div>

      {(stats?.expiringSubscriptions || 0) > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">{stats?.expiringSubscriptions} subscriptions expiring soon</p>
              <p className="text-sm text-yellow-700">Review and follow up with tenants before their subscription expires</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">SaaS Admin Access Notice</p>
            <p className="text-sm text-blue-700 mt-1">As a SaaS Admin, you manage tenants and send invitations. You do not have access to individual business data (sales, purchases, inventory, reports) to ensure tenant data privacy.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SaaSAdminDashboard
