import { apiFetch } from '../../lib/api'
import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Building, Users, Settings, Activity, Shield, Globe,
  Loader2, RefreshCw, Save, Ban, CheckCircle, Trash2, AlertTriangle,
  TrendingUp, DollarSign, Calendar, Mail, Phone, MapPin, Server, Package, Pencil,
} from 'lucide-react'

interface TenantUser {
  id: string; email: string; fname: string; lname: string; role: string
  isActive: boolean; lastLogin: string | null; phone: string | null; createdAt: string
  name: string; ips: { ip: string; lastSeen: string }[]
}

interface AuditLog {
  id: string; userId: string; userEmail: string; action: string; model: string
  recordId: string | null; ip: string | null; createdAt: string; tenantName?: string
}

interface UsageItem { count: number; limit: number; percentage: number }

interface TenantBranch {
  id: string; name: string; address: string | null; isActive: boolean
  createdAt: string; updatedAt: string; productCount: number; userCount: number
}

interface TenantDetail {
  id: string; name: string; slug: string; email: string; phone: string | null
  address: string | null; logo: string | null; status: string; businessType: string | null
  currency: string; timezone: string; taxRate: number; taxEnabled: boolean; taxId: string | null
  subscriptionStart: string | null; subscriptionEnd: string | null; trialEndsAt: string | null
  createdAt: string; updatedAt: string
  plan: { id: string; name: string; price: number; currency: string; billingCycle: string; maxUsers: number; maxProducts: number } | null
  owner: { id: string; email: string; fname: string; lname: string; role: string; isActive: boolean; lastLogin: string | null; phone: string | null; createdAt: string } | null
  usageLimit: { id: string; maxProducts: number; maxUsers: number; maxBranches: number; maxCustomers: number; maxSuppliers: number } | null
  users: TenantUser[]
  branches: TenantBranch[]
  auditLogs: AuditLog[]
  uniqueIPs: string[]
  usage: Record<string, UsageItem>
  enabledFeatures: { name: string; enabled: boolean; source: string; displayName: string; category: string }[]
  allFeatures: Record<string, { enabled: boolean; source: string; displayName: string; category: string }>
}

type Tab = 'overview' | 'features' | 'limits' | 'branches' | 'users' | 'activity'

export const TenantDetailPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [detail, setDetail] = useState<TenantDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [savingLimits, setSavingLimits] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [editInfo, setEditInfo] = useState(searchParams.get('edit') === '1')
  const [infoForm, setInfoForm] = useState({ name: '', email: '', phone: '', address: '', businessType: '', status: '', currency: 'UGX', timezone: 'Africa/Kampala', taxRate: 0, taxEnabled: false, taxId: '' })
  const [limitsForm, setLimitsForm] = useState({ maxProducts: 100, maxUsers: 5, maxBranches: 1, maxCustomers: 100, maxSuppliers: 50 })
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, boolean>>({})
  const [savingFeatures, setSavingFeatures] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setFetchError(null)
    try {
      const res = await apiFetch(`/api/platform/tenants/${tenantId}/detail`)
      if (res.ok) {
        const data = await res.json()
        const tenant = data?.tenant || {}
        const normalizedTenant = {
          ...tenant,
          users: Array.isArray(tenant.users) ? tenant.users : [],
          branches: Array.isArray(tenant.branches) ? tenant.branches : [],
          auditLogs: Array.isArray(tenant.auditLogs) ? tenant.auditLogs : [],
          uniqueIPs: Array.isArray(tenant.uniqueIPs) ? tenant.uniqueIPs : [],
          enabledFeatures: Array.isArray(tenant.enabledFeatures) ? tenant.enabledFeatures : [],
          allFeatures: tenant.allFeatures && typeof tenant.allFeatures === 'object' ? tenant.allFeatures : {},
          usage: tenant.usage && typeof tenant.usage === 'object' ? tenant.usage : {},
          usageLimit: tenant.usageLimit || null,
          plan: tenant.plan || null,
          owner: tenant.owner || null,
        }
        setDetail(normalizedTenant)
        setLimitsForm({
          maxProducts: normalizedTenant.usageLimit?.maxProducts || normalizedTenant.plan?.maxProducts || 100,
          maxUsers: normalizedTenant.usageLimit?.maxUsers || normalizedTenant.plan?.maxUsers || 5,
          maxBranches: normalizedTenant.usageLimit?.maxBranches || 1,
          maxCustomers: normalizedTenant.usageLimit?.maxCustomers || 100,
          maxSuppliers: normalizedTenant.usageLimit?.maxSuppliers || 50,
        })
        setInfoForm({
          name: normalizedTenant.name || '',
          email: normalizedTenant.email || '',
          phone: normalizedTenant.phone || '',
          address: normalizedTenant.address || '',
          businessType: normalizedTenant.businessType || '',
          status: normalizedTenant.status || 'active',
          currency: normalizedTenant.currency || 'UGX',
          timezone: normalizedTenant.timezone || 'Africa/Kampala',
          taxRate: normalizedTenant.taxRate || 0,
          taxEnabled: normalizedTenant.taxEnabled || false,
          taxId: normalizedTenant.taxId || '',
        })
        const overrides: Record<string, boolean> = {}
        Object.entries(normalizedTenant.allFeatures).forEach(([name, info]: [string, any]) => {
          if (info?.source === 'override') overrides[name] = Boolean(info?.enabled)
        })
        setFeatureOverrides(overrides)
      } else {
        const errData = await res.json().catch(() => ({}))
        setFetchError(errData.message || errData.error || `Failed to load tenant (${res.status})`)
      }
    } catch (err) {
      setFetchError('Network error — please check your connection and try again')
    }
    setLoading(false)
  }, [tenantId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleSaveLimits = async () => {
    if (!tenantId) return
    setSavingLimits(true)
    try {
      const res = await apiFetch(`/api/platform/tenants/${tenantId}/limits`, {
        method: 'PUT', body: JSON.stringify(limitsForm)
      })
      if (res.ok) { fetchDetail() }
      else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to save limits') }
    } catch { alert('Request failed') }
    setSavingLimits(false)
  }

  const handleSaveInfo = async () => {
    if (!tenantId) return
    if (!infoForm.name.trim()) { alert('Business name is required'); return }
    if (!infoForm.email.trim()) { alert('Business email is required'); return }
    if (!infoForm.currency.trim()) { alert('Currency is required'); return }
    if (!infoForm.timezone.trim()) { alert('Timezone is required'); return }
    setSavingInfo(true)
    try {
      const res = await apiFetch(`/api/platform/tenants/${tenantId}`, {
        method: 'PUT', body: JSON.stringify(infoForm)
      })
      if (res.ok) { setEditInfo(false); fetchDetail() }
      else {
        const d = await res.json().catch(() => ({}))
        console.error('Save tenant info failed:', res.status, d)
        alert(d.error || d.message || `Failed to save (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error('Save tenant info request error:', err)
      alert('Request failed — please check your connection')
    }
    setSavingInfo(false)
  }

  const handleToggleFeature = async (featureName: string, enabled: boolean) => {
    if (!tenantId) return
    setSavingFeatures(true)
    try {
      const res = await apiFetch(`/api/platform/tenant/${tenantId}/features/${featureName}`, {
        method: 'POST', body: JSON.stringify({ enabled })
      })
      if (res.ok) {
        setFeatureOverrides(prev => ({ ...prev, [featureName]: enabled }))
        fetchDetail()
      } else { alert('Failed to update feature') }
    } catch { alert('Request failed') }
    setSavingFeatures(false)
  }

  const handleAction = async (action: 'activate' | 'suspend' | 'delete') => {
    if (!tenantId || !detail) return
    if (action === 'delete') {
      if (!confirm(`Are you sure you want to DELETE "${detail.name}"? This will permanently delete all data including users, products, sales, etc. This action cannot be undone.`)) return
    } else {
      if (!confirm(`Are you sure you want to ${action} this tenant?`)) return
    }
    setActionLoading(action)
    try {
      if (action === 'delete') {
        const res = await apiFetch(`/api/platform/tenants/${tenantId}`, { method: 'DELETE' })
        if (res.ok) { navigate('/saas/businesses'); return }
        else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to delete') }
      } else {
        const res = await apiFetch(`/api/platform/tenants/${tenantId}/status`, {
          method: 'PUT', body: JSON.stringify({ status: action === 'activate' ? 'active' : 'suspended' })
        })
        if (res.ok) fetchDetail()
        else alert(`Failed to ${action}`)
      }
    } catch { alert('Request failed') }
    setActionLoading(null)
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'
  const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'
  const fmtMoney = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'UGX', minimumFractionDigits: 0 }).format(n)

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = { active: 'bg-green-100 text-green-800', suspended: 'bg-red-100 text-red-800', trial: 'bg-blue-100 text-blue-800', cancelled: 'bg-gray-100 text-gray-800' }
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls[s] || 'bg-gray-100 text-gray-800'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
  }

  const usageColor = (pct: number) => pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'

  const tabs: { id: Tab; label: string; icon: typeof Building }[] = [
    { id: 'overview', label: 'Overview', icon: Building },
    { id: 'features', label: 'Features', icon: Settings },
    { id: 'limits', label: 'Usage Limits', icon: TrendingUp },
    { id: 'branches', label: 'Branches', icon: Package },
    { id: 'users', label: 'Users & IPs', icon: Users },
    { id: 'activity', label: 'Activity Log', icon: Activity },
  ]

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  )

  if (!detail && !loading) return (
    <div className="text-center py-12">
      <AlertTriangle className="w-12 h-12 text-yellow-300 mx-auto mb-4" />
      <p className="text-gray-500">{fetchError || 'Tenant not found'}</p>
      <div className="flex items-center justify-center gap-3 mt-4">
        {fetchError && <button onClick={fetchDetail} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>}
        <button onClick={() => navigate('/saas/businesses')} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">Back to Businesses</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/saas/businesses')} className="p-2 border rounded-lg hover:bg-gray-50">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building size={24} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{detail.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">{detail.slug}</span>
                {statusBadge(detail.status)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setTab('overview'); setEditInfo(!editInfo) }} className={`px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 ${editInfo ? 'bg-blue-50 border-blue-300 text-blue-700' : ''}`}>
            <Pencil size={16} />
            {editInfo ? 'Editing' : 'Edit'}
          </button>
          <button onClick={fetchDetail} className="px-3 py-2 border rounded-lg hover:bg-gray-50">
            <RefreshCw size={18} />
          </button>
          {detail.status === 'suspended' ? (
            <button onClick={() => handleAction('activate')} disabled={actionLoading === 'activate'} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
              {actionLoading === 'activate' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Activate
            </button>
          ) : (
            <button onClick={() => handleAction('suspend')} disabled={actionLoading === 'suspend'} className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 flex items-center gap-2">
              {actionLoading === 'suspend' ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
              Suspend
            </button>
          )}
          <button onClick={() => handleAction('delete')} disabled={actionLoading === 'delete'} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
            {actionLoading === 'delete' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1">
          {tabs.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Info Card */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Business Information</h2>
              <button onClick={() => setEditInfo(!editInfo)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                {editInfo ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {!editInfo ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2"><Mail size={16} className="text-gray-400" /><div><span className="text-gray-500">Email: </span><span>{detail.email || '-'}</span></div></div>
                <div className="flex items-center gap-2"><Phone size={16} className="text-gray-400" /><div><span className="text-gray-500">Phone: </span><span>{detail.phone || '-'}</span></div></div>
                <div className="flex items-center gap-2"><MapPin size={16} className="text-gray-400" /><div><span className="text-gray-500">Address: </span><span>{detail.address || '-'}</span></div></div>
                <div className="flex items-center gap-2"><Building size={16} className="text-gray-400" /><div><span className="text-gray-500">Type: </span><span>{(() => { const types: Record<string,string> = { retail:'Retail Store', pharmacy:'Pharmacy', hardware:'Hardware Store', supermarket:'Supermarket', wholesale:'Wholesale', restaurant:'Restaurant', bar:'Bar', restaurant_bar:'Restaurant & Bar', cafe:'Cafe', coffee_shop:'Coffee Shop', fast_food:'Fast Food', hotel_restaurant:'Hotel Restaurant', bakery:'Bakery', service:'Service Business', salon_spa:'Salon & Spa', repair_shop:'Repair Shop', manufacturing:'Manufacturing', other:'Other' }; return types[detail.businessType || ''] || detail.businessType || '-'; })()}</span></div></div>
                <div className="flex items-center gap-2"><DollarSign size={16} className="text-gray-400" /><div><span className="text-gray-500">Currency: </span><span>{detail.currency}</span></div></div>
                <div className="flex items-center gap-2"><Globe size={16} className="text-gray-400" /><div><span className="text-gray-500">Timezone: </span><span>{detail.timezone}</span></div></div>
                <div className="flex items-center gap-2"><Calendar size={16} className="text-gray-400" /><div><span className="text-gray-500">Created: </span><span>{fmtDate(detail.createdAt)}</span></div></div>
                <div className="flex items-center gap-2"><Calendar size={16} className="text-gray-400" /><div><span className="text-gray-500">Sub Start: </span><span>{fmtDate(detail.subscriptionStart)}</span></div></div>
                <div className="flex items-center gap-2"><Calendar size={16} className="text-gray-400" /><div><span className="text-gray-500">Sub End: </span><span>{fmtDate(detail.subscriptionEnd)}</span></div></div>
                <div className="flex items-center gap-2"><Shield size={16} className="text-gray-400" /><div><span className="text-gray-500">Tax Rate: </span><span>{detail.taxEnabled ? `${detail.taxRate}%` : 'Disabled'}</span></div></div>
                {detail.taxId && <div className="flex items-center gap-2"><Shield size={16} className="text-gray-400" /><div><span className="text-gray-500">Tax ID: </span><span>{detail.taxId}</span></div></div>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input value={infoForm.name} onChange={e => setInfoForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label><input value={infoForm.email} onChange={e => setInfoForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Phone</label><input value={infoForm.phone} onChange={e => setInfoForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Address</label><input value={infoForm.address} onChange={e => setInfoForm(p => ({ ...p, address: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Business Type</label><select value={infoForm.businessType} onChange={e => setInfoForm(p => ({ ...p, businessType: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select type...</option><option value="retail">Retail Store</option><option value="pharmacy">Pharmacy</option><option value="hardware">Hardware Store</option><option value="supermarket">Supermarket</option><option value="wholesale">Wholesale</option><option value="restaurant">Restaurant</option><option value="bar">Bar</option><option value="restaurant_bar">Restaurant & Bar</option><option value="cafe">Cafe</option><option value="coffee_shop">Coffee Shop</option><option value="fast_food">Fast Food</option><option value="hotel_restaurant">Hotel Restaurant</option><option value="bakery">Bakery</option><option value="service">Service Business</option><option value="salon_spa">Salon & Spa</option><option value="repair_shop">Repair Shop</option><option value="manufacturing">Manufacturing</option><option value="other">Other</option></select></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label><select value={infoForm.status} onChange={e => setInfoForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="active">Active</option><option value="suspended">Suspended</option><option value="trial">Trial</option><option value="cancelled">Cancelled</option></select></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Currency</label><input value={infoForm.currency} onChange={e => setInfoForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Timezone</label><input value={infoForm.timezone} onChange={e => setInfoForm(p => ({ ...p, timezone: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Tax Rate (%)</label><input type="number" value={infoForm.taxRate} onChange={e => setInfoForm(p => ({ ...p, taxRate: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Tax ID</label><input value={infoForm.taxId} onChange={e => setInfoForm(p => ({ ...p, taxId: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div className="flex items-center gap-2 pt-6"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={infoForm.taxEnabled} onChange={e => setInfoForm(p => ({ ...p, taxEnabled: e.target.checked }))} /> Tax Enabled</label></div>
                <div className="flex items-end"><button onClick={handleSaveInfo} disabled={savingInfo} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">{savingInfo ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save</button></div>
              </div>
            )}
          </div>

          {/* Plan & Owner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Subscription Plan</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Plan</span><span className="font-medium">{detail.plan?.name || 'No Plan'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Price</span><span>{detail.plan ? fmtMoney(detail.plan.price, detail.plan.currency) : '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Billing Cycle</span><span>{detail.plan?.billingCycle || '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Max Users (plan)</span><span>{detail.plan?.maxUsers || '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Max Products (plan)</span><span>{detail.plan?.maxProducts || '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Subscription Start</span><span>{fmtDate(detail.subscriptionStart)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Subscription End</span><span>{fmtDate(detail.subscriptionEnd)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Trial Ends</span><span>{fmtDate(detail.trialEndsAt)}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Owner</h2>
              {detail.owner ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{detail.owner.fname} {detail.owner.lname}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{detail.owner.email}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{detail.owner.phone || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={detail.owner.isActive ? 'text-green-600' : 'text-red-600'}>{detail.owner.isActive ? 'Active' : 'Inactive'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Last Login</span><span>{fmtDateTime(detail.owner.lastLogin)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{fmtDate(detail.owner.createdAt)}</span></div>
                </div>
              ) : <p className="text-gray-500">No owner assigned</p>}
            </div>
          </div>

          {/* Usage Summary */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Usage Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {Object.entries(detail.usage || {}).map(([key, u]) => (
                <div key={key} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">{key}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${u.percentage >= 90 ? 'bg-red-100 text-red-800' : u.percentage >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{u.percentage}%</span>
                  </div>
                  <div className="text-2xl font-bold">{u.count}<span className="text-sm font-normal text-gray-400"> / {u.limit}</span></div>
                  <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${usageColor(u.percentage)}`} style={{ width: `${u.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Unique IPs */}
          {(detail.uniqueIPs || []).length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Server size={18} className="text-gray-400" /> Unique IPs Accessing This Business</h2>
              <div className="flex flex-wrap gap-2">
                {(detail.uniqueIPs || []).map(ip => (
                  <span key={ip} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-mono">{ip}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'features' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Feature Access</h2>
                <p className="text-sm text-gray-500">Features enabled via plan or manual override</p>
              </div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">{(detail.enabledFeatures || []).length} enabled</span>
            </div>

            {/* Enabled features summary */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Enabled Features ({(detail.enabledFeatures || []).length})</h3>
              <div className="flex flex-wrap gap-1.5">
                {(detail.enabledFeatures || []).map(f => (
                  <span key={f.name} className={`px-2 py-1 rounded text-xs ${f.source === 'override' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {f.displayName || f.name}
                    {f.source === 'override' && ' (override)'}
                  </span>
                ))}
              </div>
            </div>

            {/* All features with toggle */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">All Features (Toggle to override plan defaults)</h3>
              <div className="max-h-96 overflow-y-auto space-y-4">
                {Object.entries(
                  Object.entries(detail.allFeatures || {}).reduce<Record<string, Array<[string, { enabled: boolean; source: string; displayName: string; category: string }]>>>((groups, [name, info]) => {
                    const cat = info.category || 'other'
                    groups[cat] = groups[cat] || []
                    groups[cat].push([name, info])
                    return groups
                  }, {})
                ).map(([category, features]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-2">{category.replace(/_/g, ' ')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {features.map(([name, info]) => {
                        const isOverride = info.source === 'override'
                        const isPlanEnabled = info.source === 'plan'
                        const isChecked = isOverride ? featureOverrides[name] ?? info.enabled : info.enabled
                        return (
                          <label key={name} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${isOverride ? 'border-purple-300 bg-purple-50' : isPlanEnabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={savingFeatures}
                              onChange={e => handleToggleFeature(name, e.target.checked)}
                            />
                            <span className="flex-1">{info.displayName || name}</span>
                            {isOverride && <span className="text-xs text-purple-600">override</span>}
                            {isPlanEnabled && !isOverride && <span className="text-xs text-blue-600">plan</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'limits' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Usage Limits</h2>
            <p className="text-sm text-gray-500 mb-6">Set custom usage limits for this tenant. These override plan defaults.</p>

            {/* Current usage vs limits */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {Object.entries(detail.usage || {}).map(([key, u]) => (
                <div key={key} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">{key}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${u.percentage >= 90 ? 'bg-red-100 text-red-800' : u.percentage >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{u.percentage}%</span>
                  </div>
                  <div className="text-2xl font-bold">{u.count}<span className="text-sm font-normal text-gray-400"> / {u.limit}</span></div>
                  <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${usageColor(u.percentage)}`} style={{ width: `${u.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Edit Limits</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Max Products</label><input type="number" value={limitsForm.maxProducts} onChange={e => setLimitsForm(p => ({ ...p, maxProducts: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Max Users</label><input type="number" value={limitsForm.maxUsers} onChange={e => setLimitsForm(p => ({ ...p, maxUsers: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Max Branches</label><input type="number" value={limitsForm.maxBranches} onChange={e => setLimitsForm(p => ({ ...p, maxBranches: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Max Customers</label><input type="number" value={limitsForm.maxCustomers} onChange={e => setLimitsForm(p => ({ ...p, maxCustomers: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Max Suppliers</label><input type="number" value={limitsForm.maxSuppliers} onChange={e => setLimitsForm(p => ({ ...p, maxSuppliers: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div className="mt-4">
                <button onClick={handleSaveLimits} disabled={savingLimits} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  {savingLimits ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Limits
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'branches' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2"><Package size={18} className="text-gray-400" /> Branches</h2>
                <p className="text-sm text-gray-500">{(detail.branches || []).length} branch(es) &middot; Limit: {detail.usageLimit?.maxBranches || 1}</p>
              </div>
              <div className="flex items-center gap-2">
                {detail.usage && (
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${detail.usage.branches?.percentage >= 90 ? 'bg-red-100 text-red-800' : detail.usage.branches?.percentage >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                    {detail.usage.branches?.count || 0} / {detail.usage.branches?.limit || 1} ({detail.usage.branches?.percentage || 0}%)
                  </span>
                )}
              </div>
            </div>
            {(detail.branches || []).length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No branches created yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Branch Name</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Address</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Products</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Users</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(detail.branches || []).map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center"><Building size={16} className="text-indigo-600" /></div>
                          <span className="text-sm font-medium">{b.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{b.address || '-'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${b.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{b.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-500">{b.productCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{b.userCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Users & IP Addresses</h2>
              <p className="text-sm text-gray-500">All users in this tenant and their IP addresses from audit logs</p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">User</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Role</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Last Login</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">IP Addresses</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Array.isArray(detail.users) && detail.users.length > 0 ? detail.users.map(u => {
                  const safeIps = Array.isArray(u?.ips) ? u.ips : []
                  const userName = u?.name || `${u?.fname || ''} ${u?.lname || ''}`.trim() || u?.email || 'Unknown user'
                  return (
                    <tr key={u?.id || userName} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{userName}</div>
                        <div className="text-xs text-gray-500">{u?.email || '-'}</div>
                        {u?.phone && <div className="text-xs text-gray-400">{u.phone}</div>}
                      </td>
                      <td className="px-4 py-3"><span className="px-2 py-1 bg-gray-100 rounded text-xs capitalize">{(u?.role || 'user').replace('_', ' ')}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${u?.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{u?.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDateTime(u?.lastLogin || null)}</td>
                      <td className="px-4 py-3">
                        {safeIps.length > 0 ? (
                          <div className="space-y-1">
                            {safeIps.map((ipInfo, i) => (
                              <div key={`${u?.id || userName}-${i}`} className="flex items-center gap-2">
                                <span className="text-xs font-mono px-2 py-0.5 bg-gray-100 rounded">{ipInfo?.ip || 'Unknown IP'}</span>
                                <span className="text-xs text-gray-400">{fmtDateTime(ipInfo?.lastSeen || null)}</span>
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-xs text-gray-400">No IP data</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(u?.createdAt || null)}</td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-500">No users found</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Recent Activity (Audit Logs)</h2>
              <p className="text-sm text-gray-500">Last 50 actions from this tenant with IP addresses</p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">User</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Action</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Model</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">IP Address</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(detail.auditLogs || []).length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-500">No activity recorded</td></tr>
                ) : (detail.auditLogs || []).map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
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
          </div>
        </div>
      )}
    </div>
  )
}

export default TenantDetailPage
