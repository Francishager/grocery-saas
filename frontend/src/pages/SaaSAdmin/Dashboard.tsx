import React, { useState, useEffect } from 'react'
import { 
  Building, Users, DollarSign, TrendingUp, 
  Mail, Clock, AlertCircle, Loader2,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import InvitationsList from './InvitationsList'
import TenantsList from './TenantsList'

export interface PlatformStats {
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

export const SaaSAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tenants' | 'invitations'>('dashboard')

  const fetchStats = async () => {
    setLoading(true)
    try {
      const tokens = localStorage.getItem('auth_tokens')
      const headers: Record<string, string> = {}
      if (tokens) {
        const { accessToken } = JSON.parse(tokens)
        headers['Authorization'] = `Bearer ${accessToken}`
      }

      const response = await fetch('/api/platform/stats', { headers })
      if (!response.ok) throw new Error('Failed to fetch stats')
      const data = await response.json()
      setStats(data)
    } catch (err) {
      // Use mock data for now
      setStats({
        totalTenants: 24,
        activeTenants: 18,
        suspendedTenants: 2,
        trialTenants: 4,
        totalUsers: 156,
        monthlyRevenue: 4500000,
        revenueChange: 12.5,
        pendingInvitations: 8,
        expiringSubscriptions: 3,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'tenants':
        return <TenantsList />
      case 'invitations':
        return <InvitationsList />
      default:
        return (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Tenants */}
              <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Tenants</p>
                    <p className="text-2xl font-bold mt-1">{stats?.totalTenants || 0}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <span className="text-green-600">{stats?.activeTenants} active</span>
                  <span className="text-yellow-600">{stats?.trialTenants} trial</span>
                  <span className="text-red-600">{stats?.suspendedTenants} suspended</span>
                </div>
              </div>

              {/* Total Users */}
              <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Users</p>
                    <p className="text-2xl font-bold mt-1">{stats?.totalUsers || 0}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-gray-500">
                  Across all tenants
                </p>
              </div>

              {/* Monthly Revenue */}
              <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Monthly Revenue</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(stats?.monthlyRevenue || 0)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm">
                  {(stats?.revenueChange || 0) >= 0 ? (
                    <>
                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">+{stats?.revenueChange}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="w-4 h-4 text-red-600" />
                      <span className="text-red-600">{stats?.revenueChange}%</span>
                    </>
                  )}
                  <span className="text-gray-500 ml-1">vs last month</span>
                </div>
              </div>

              {/* Pending Invitations */}
              <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Pending Invitations</p>
                    <p className="text-2xl font-bold mt-1">{stats?.pendingInvitations || 0}</p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('invitations')}
                  className="mt-4 text-sm text-blue-600 hover:underline"
                >
                  View all invitations →
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setActiveTab('invitations')}
                  className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 text-left"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Invite Business Owner</p>
                    <p className="text-sm text-gray-500">Send invitation to new tenant</p>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('tenants')}
                  className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 text-left"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Building className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium">Manage Tenants</p>
                    <p className="text-sm text-gray-500">View and manage all tenants</p>
                  </div>
                </button>

                <button
                  className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 text-left"
                >
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">View Analytics</p>
                    <p className="text-sm text-gray-500">Platform-wide metrics</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Alerts */}
            {(stats?.expiringSubscriptions || 0) > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-800">
                      {stats?.expiringSubscriptions} subscriptions expiring soon
                    </p>
                    <p className="text-sm text-yellow-700">
                      Review and follow up with tenants before their subscription expires
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Important Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">
                    SaaS Admin Access Notice
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    As a SaaS Admin, you can manage tenants and send invitations, but you do not have 
                    access to individual business data such as sales, purchases, inventory, or reports. 
                    This ensures tenant data privacy and security.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="border-b">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'dashboard'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('tenants')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tenants'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Tenants
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'invitations'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Invitations
          </button>
        </nav>
      </div>

      {/* Content */}
      {renderContent()}
    </div>
  )
}

export default SaaSAdminDashboard
