import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { ToggleLeft, ToggleRight, Loader2, RefreshCw, Plus, Trash2, DollarSign, Package, ShoppingCart, Briefcase, BarChart3, Save, X, Users, Building2, CreditCard, FileText, ClipboardList, Clock, Wrench, GitBranch, MessageSquare, Settings, LayoutDashboard, UtensilsCrossed } from 'lucide-react'

interface Feature { id: string; name: string; displayName: string; slug: string; category: string; module: string; description: string; isActive: boolean }

const emptyFeatureForm = { name: '', displayName: '', category: 'core', module: '', description: '', isActive: true }

const MODULES = [
  {
    id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, color: 'text-indigo-600 bg-indigo-100', features: [
      { name: 'dashboard', displayName: 'Dashboard' },
      { name: 'dashboard.analytics', displayName: 'Analytics Widgets' },
    ]
  },
  {
    id: 'sales', name: 'Sales Management', icon: ShoppingCart, color: 'text-blue-600 bg-blue-100', features: [
      { name: 'sales', displayName: 'Sales / POS' },
      { name: 'sales.pos', displayName: 'POS' },
      { name: 'sales.quotes', displayName: 'Quotes' },
      { name: 'sales.returns', displayName: 'Returns & Refunds' },
      { name: 'sales.discounts', displayName: 'Discounts' },
      { name: 'sales.suspended', displayName: 'Suspended Sales' },
    ]
  },
  {
    id: 'inventory', name: 'Inventory Management', icon: Package, color: 'text-orange-600 bg-orange-100', features: [
      { name: 'inventory', displayName: 'Inventory Management' },
      { name: 'inventory.products', displayName: 'Products' },
      { name: 'inventory.services', displayName: 'Services' },
      { name: 'inventory.rentals', displayName: 'Rental Items' },
      { name: 'inventory.categories', displayName: 'Categories' },
      { name: 'inventory.brands', displayName: 'Brands' },
      { name: 'inventory.adjustments', displayName: 'Stock Adjustments' },
      { name: 'inventory.transfers', displayName: 'Stock Transfers' },
      { name: 'inventory.counts', displayName: 'Stock Counts' },
      { name: 'inventory.multi_unit', displayName: 'Multi Units of Measure' },
      { name: 'inventory.batch_numbers', displayName: 'Batch Numbers' },
      { name: 'inventory.expiry_tracking', displayName: 'Expiry Tracking' },
      { name: 'inventory.barcode_printing', displayName: 'Barcode Printing' },
    ]
  },
  {
    id: 'customers', name: 'Customer Management', icon: Users, color: 'text-teal-600 bg-teal-100', features: [
      { name: 'customers', displayName: 'Customer Management' },
      { name: 'customers.groups', displayName: 'Customer Groups' },
      { name: 'customers.loyalty', displayName: 'Loyalty Program' },
      { name: 'customers.wallet', displayName: 'Customer Wallet' },
      { name: 'customers.statements', displayName: 'Customer Statements' },
    ]
  },
  {
    id: 'suppliers', name: 'Supplier Management', icon: Building2, color: 'text-amber-600 bg-amber-100', features: [
      { name: 'suppliers', displayName: 'Supplier Management' },
      { name: 'suppliers.purchase_orders', displayName: 'Purchase Orders' },
      { name: 'suppliers.grn', displayName: 'Goods Received Notes' },
      { name: 'suppliers.statements', displayName: 'Supplier Statements' },
    ]
  },
  {
    id: 'financial', name: 'Financial Management', icon: DollarSign, color: 'text-green-600 bg-green-100', features: [
      { name: 'expenses', displayName: 'Expense Tracking' },
      { name: 'financial.income', displayName: 'Income Tracking' },
      { name: 'financial.cashbook', displayName: 'Cashbook' },
      { name: 'financial.bank_accounts', displayName: 'Bank Accounts' },
      { name: 'financial.petty_cash', displayName: 'Petty Cash' },
    ]
  },
  {
    id: 'receivables', name: 'Receivables', icon: CreditCard, color: 'text-cyan-600 bg-cyan-100', features: [
      { name: 'receivables', displayName: 'Receivables' },
      { name: 'receivables.payments', displayName: 'Customer Payments' },
      { name: 'receivables.aging', displayName: 'Aging Report' },
    ]
  },
  {
    id: 'payables', name: 'Payables', icon: FileText, color: 'text-rose-600 bg-rose-100', features: [
      { name: 'payables', displayName: 'Payables' },
      { name: 'payables.payments', displayName: 'Supplier Payments' },
      { name: 'payables.aging', displayName: 'Payables Aging' },
    ]
  },
  {
    id: 'accounting', name: 'Accounting', icon: Briefcase, color: 'text-purple-600 bg-purple-100', features: [
      { name: 'accounting', displayName: 'Accounting' },
      { name: 'accounting.chart_of_accounts', displayName: 'Chart of Accounts' },
      { name: 'accounting.journal_entries', displayName: 'Journal Entries' },
      { name: 'accounting.general_ledger', displayName: 'General Ledger' },
      { name: 'accounting.trial_balance', displayName: 'Trial Balance' },
      { name: 'accounting.profit_loss', displayName: 'Profit & Loss' },
      { name: 'accounting.balance_sheet', displayName: 'Balance Sheet' },
    ]
  },
  {
    id: 'reports', name: 'Reports & Insights', icon: BarChart3, color: 'text-sky-600 bg-sky-100', features: [
      { name: 'reports', displayName: 'Reports' },
      { name: 'reports.sales', displayName: 'Sales Reports' },
      { name: 'reports.inventory', displayName: 'Inventory Reports' },
      { name: 'reports.customers', displayName: 'Customer Reports' },
      { name: 'reports.suppliers', displayName: 'Supplier Reports' },
      { name: 'reports.financial', displayName: 'Financial Reports' },
      { name: 'reports.audit', displayName: 'Audit Reports' },
      { name: 'reports.services', displayName: 'Service Reports' },
      { name: 'reports.rentals', displayName: 'Rental Reports' },
      { name: 'reports.performance', displayName: 'Performance Reports' },
    ]
  },
  {
    id: 'hr', name: 'HR Management', icon: Users, color: 'text-pink-600 bg-pink-100', features: [
      { name: 'hr', displayName: 'HR Management' },
      { name: 'hr.employees', displayName: 'Employees' },
      { name: 'hr.attendance', displayName: 'Attendance' },
      { name: 'hr.payroll', displayName: 'Payroll' },
      { name: 'hr.leave', displayName: 'Leave Management' },
    ]
  },
  {
    id: 'service', name: 'Service Business', icon: Wrench, color: 'text-yellow-600 bg-yellow-100', features: [
      { name: 'service', displayName: 'Service Business' },
      { name: 'service.appointments', displayName: 'Appointments' },
      { name: 'service.work_orders', displayName: 'Work Orders' },
      { name: 'service.job_cards', displayName: 'Job Cards' },
      { name: 'service.technicians', displayName: 'Technician Assignment' },
      { name: 'service.contracts', displayName: 'Service Contracts' },
    ]
  },
  {
    id: 'multi_branch', name: 'Multi-Branch', icon: GitBranch, color: 'text-lime-600 bg-lime-100', features: [
      { name: 'multi_branch', displayName: 'Multi-Branch' },
      { name: 'multi_branch.transfers', displayName: 'Branch Transfers' },
      { name: 'multi_branch.reports', displayName: 'Branch Reports' },
    ]
  },
  {
    id: 'rentals', name: 'Rental Bookings', icon: Clock, color: 'text-violet-600 bg-violet-100', features: [
      { name: 'rentals', displayName: 'Rental Bookings' },
    ]
  },
  {
    id: 'restaurant', name: 'Restaurant & Bar', icon: UtensilsCrossed, color: 'text-orange-600 bg-orange-100', features: [
      { name: 'restaurant', displayName: 'Restaurant Module' },
      { name: 'restaurant.tables', displayName: 'Table Management' },
      { name: 'restaurant.orders', displayName: 'Orders' },
      { name: 'restaurant.kitchen', displayName: 'Kitchen Display' },
      { name: 'restaurant.bar', displayName: 'Bar Display' },
      { name: 'restaurant.waiters', displayName: 'Waiters' },
      { name: 'restaurant.reservations', displayName: 'Reservations' },
      { name: 'restaurant.recipes', displayName: 'Recipes / Bill of Materials' },
      { name: 'restaurant.happy_hour', displayName: 'Happy Hour Pricing' },
      { name: 'restaurant.combos', displayName: 'Combo Meals' },
      { name: 'restaurant.split_bills', displayName: 'Split Bills' },
      { name: 'restaurant.merge_tables', displayName: 'Merge Tables' },
      { name: 'restaurant.delivery', displayName: 'Delivery' },
      { name: 'restaurant.tips', displayName: 'Tips' },
      { name: 'restaurant.reports', displayName: 'Restaurant Reports' },
    ]
  },
  {
    id: 'communication', name: 'Communication', icon: MessageSquare, color: 'text-blue-400 bg-blue-50', features: [
      { name: 'communication', displayName: 'Communication' },
      { name: 'communication.sms', displayName: 'SMS Notifications' },
      { name: 'communication.email', displayName: 'Email Notifications' },
      { name: 'communication.whatsapp', displayName: 'WhatsApp Integration' },
      { name: 'communication.notifications', displayName: 'In-App Notifications' },
    ]
  },
  {
    id: 'integrations', name: 'Integrations', icon: CreditCard, color: 'text-emerald-600 bg-emerald-100', features: [
      { name: 'integrations', displayName: 'Integrations' },
      { name: 'integrations.mobile_money', displayName: 'Mobile Money' },
      { name: 'integrations.stripe', displayName: 'Stripe' },
      { name: 'integrations.flutterwave', displayName: 'Flutterwave' },
      { name: 'integrations.qr_payments', displayName: 'QR Payments' },
      { name: 'integrations.api_access', displayName: 'API Access' },
    ]
  },
  {
    id: 'settings', name: 'Settings', icon: Settings, color: 'text-slate-600 bg-slate-200', features: [
      { name: 'settings', displayName: 'Business Settings' },
      { name: 'settings.taxes', displayName: 'Taxes' },
      { name: 'settings.currencies', displayName: 'Currencies' },
      { name: 'settings.units', displayName: 'Units' },
      { name: 'settings.roles', displayName: 'Roles & Permissions' },
      { name: 'settings.users', displayName: 'Users' },
    ]
  },
  {
    id: 'audit', name: 'Audit & Security', icon: ClipboardList, color: 'text-red-600 bg-red-100', features: [
      { name: 'audit', displayName: 'Audit Log' },
    ]
  },
]

interface TenantListItem { id: string; name: string; planId: string; plan: { name: string } }
interface TenantFeatureAccess { [key: string]: { enabled: boolean; source: string } }

export const FeaturesPage: React.FC = () => {
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showFeatureForm, setShowFeatureForm] = useState(false)
  const [featureForm, setFeatureForm] = useState(emptyFeatureForm)

  // Tenant override state
  const [tenants, setTenants] = useState<TenantListItem[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>('')
  const [tenantFeatureAccess, setTenantFeatureAccess] = useState<TenantFeatureAccess>({})
  const [tenantLoading, setTenantLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const fRes = await apiFetch('/api/platform/features')
      if (fRes.ok) setFeatures(await fRes.json())
    } catch {}
    setLoading(false)
  }

  const fetchTenants = async () => {
    try {
      const res = await apiFetch('/api/platform/tenants/list')
      if (res.ok) {
        const data = await res.json()
        setTenants(data)
        if (data.length && !selectedTenant) setSelectedTenant(data[0].id)
      }
    } catch {}
  }

  const fetchTenantFeatures = async (tenantId: string) => {
    if (!tenantId) return
    setTenantLoading(true)
    try {
      const res = await apiFetch(`/api/platform/tenant/${tenantId}/features`)
      if (res.ok) {
        const data = await res.json()
        setTenantFeatureAccess(data.features || {})
      }
    } catch {}
    setTenantLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { fetchTenants() }, [])
  useEffect(() => { if (selectedTenant) fetchTenantFeatures(selectedTenant) }, [selectedTenant])

  const toFeatureName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

  const handleTenantToggle = async (mf: { name: string; displayName: string }, enabled: boolean) => {
    if (!selectedTenant) { setError('Select a tenant first'); return }
    setSaving(true); setError('')
    try {
      const res = await apiFetch(`/api/platform/tenant/${selectedTenant}/features/${mf.name}`, {
        method: 'POST',
        body: JSON.stringify({ enabled })
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to update tenant feature') }
      await fetchTenantFeatures(selectedTenant)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setSaving(false)
  }

  const handleSeedFeatures = async () => {
    if (!confirm('Create all jibuSales module features?')) return
    setSaving(true)
    for (const mod of MODULES) {
      for (const f of mod.features) {
        if (!features.find(ef => ef.name === f.name)) {
          await apiFetch('/api/platform/features', { method: 'POST', body: JSON.stringify({ name: f.name, displayName: f.displayName, category: mod.id, module: mod.id, description: f.displayName, isActive: true, slug: f.name }) })
        }
      }
    }
    await fetchData(); setSaving(false)
  }

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const displayName = featureForm.displayName.trim()
      const name = toFeatureName(featureForm.name || displayName)
      if (!name || !displayName) throw new Error('Feature name and display name are required')
      const res = await apiFetch('/api/platform/features', {
        method: 'POST',
        body: JSON.stringify({
          name,
          displayName,
          category: featureForm.category.trim() || 'core',
          module: featureForm.module.trim() || name.split('.')[0] || 'core',
          description: featureForm.description.trim() || displayName,
          isActive: featureForm.isActive,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || e.message || 'Failed to create feature') }
      setFeatureForm(emptyFeatureForm)
      setShowFeatureForm(false)
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setSaving(false)
  }

  const handleDeleteFeature = async (id: string) => {
    if (!confirm('Delete this feature?')) return
    try { const res = await apiFetch(`/api/platform/features/${id}`, { method: 'DELETE' }); if (res.ok) fetchData() } catch {}
  }

  const getTenantFeatureState = (featureName: string): 'enabled' | 'disabled' | 'default' => {
    const access = tenantFeatureAccess[featureName]
    if (!access) return 'default'
    if (access.source === 'override') return access.enabled ? 'enabled' : 'disabled'
    return access.enabled ? 'enabled' : 'default'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Features</h1><p className="text-slate-400">Manage feature catalog & tenant overrides — plan features are assigned in Plans & Pricing</p></div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="px-3 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800"><RefreshCw size={18} /></button>
          <button onClick={() => setShowFeatureForm(true)} disabled={saving} className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 flex items-center gap-2 disabled:opacity-50">
            <Plus size={18} /> New Feature
          </button>
          <button onClick={handleSeedFeatures} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={18} />} Seed All Modules
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 rounded-lg px-4 py-2 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">×</button>
        </div>
      )}

      {/* === TENANT OVERRIDES === */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-slate-300">Customize features for tenant:</label>
          <select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm min-w-[200px]">
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.plan?.name || 'No Plan'})</option>)}
          </select>
          {selectedTenant && (
            <span className="text-xs text-slate-400">
              Green = enabled (override or plan), Red = explicitly disabled (override), Gray = not in plan
            </span>
          )}
        </div>
      </div>

      {tenantLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : selectedTenant ? (
        <div className="space-y-4">
          {MODULES.map(mod => {
            const ModIcon = mod.icon
            return (
              <div key={mod.id} className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${mod.color}`}><ModIcon className="w-5 h-5" /></div>
                  <div><h2 className="font-semibold text-white">{mod.name}</h2><p className="text-xs text-slate-400">{mod.features.length} features</p></div>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {mod.features.map(mf => {
                    const state = getTenantFeatureState(mf.name)
                    const isOn = state === 'enabled'
                    const isOverride = state === 'enabled' || state === 'disabled'
                    return (
                      <div key={mf.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${isOverride ? 'bg-slate-700 ring-1 ring-blue-500/30' : 'bg-slate-800'}`}>
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-200">{mf.displayName}</span>
                          {isOverride && <span className="text-[10px] text-blue-400">custom override</span>}
                        </div>
                        <button
                          onClick={() => handleTenantToggle(mf, !isOn)}
                          disabled={saving}
                          className="flex items-center gap-1"
                          title={isOverride ? 'Click to remove override' : 'Click to override plan setting'}
                        >
                          {isOn ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className={`w-5 h-5 ${state === 'disabled' ? 'text-red-500' : 'text-slate-500'}`} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {features.filter(f => !MODULES.some(m => m.features.some(mf => mf.name === f.name))).length > 0 && (
            <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800"><h2 className="font-semibold text-white">Other Features</h2></div>
              <div className="divide-y divide-slate-800">
                {features.filter(f => !MODULES.some(m => m.features.some(mf => mf.name === f.name))).map(f => {
                  const state = getTenantFeatureState(f.name)
                  const isOn = state === 'enabled'
                  const isOverride = state === 'enabled' || state === 'disabled'
                  return (
                    <div key={f.id} className={`flex items-center justify-between p-4 ${isOverride ? 'bg-slate-800/50' : ''}`}>
                      <div>
                        <p className="font-medium text-sm text-slate-200">{f.displayName || f.name}</p>
                        <p className="text-xs text-slate-400">{f.category}{isOverride && ' · custom override'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleTenantToggle({ name: f.name, displayName: f.displayName || f.name }, !isOn)} disabled={saving}>
                          {isOn ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className={`w-5 h-5 ${state === 'disabled' ? 'text-red-500' : 'text-slate-500'}`} />}
                        </button>
                        <button onClick={() => handleDeleteFeature(f.id)} className="p-1 hover:bg-red-900 text-red-400 rounded"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400">Select a tenant to customize features</div>
      )}

      {showFeatureForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-lg border border-slate-800 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">New Feature</h2>
              <button onClick={() => setShowFeatureForm(false)} className="p-1 hover:bg-slate-800 rounded text-slate-300"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateFeature} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Display Name *</label>
                <input required value={featureForm.displayName} onChange={e => setFeatureForm(p => ({ ...p, displayName: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg" placeholder="Customer Credit" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Feature Key</label>
                <input value={featureForm.name} onChange={e => setFeatureForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg" placeholder="customer_credit" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Category</label>
                <input value={featureForm.category} onChange={e => setFeatureForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg" placeholder="core" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Module</label>
                <input value={featureForm.module} onChange={e => setFeatureForm(p => ({ ...p, module: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg" placeholder="sales, inventory, customers..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Description</label>
                <textarea value={featureForm.description} onChange={e => setFeatureForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={featureForm.isActive} onChange={e => setFeatureForm(p => ({ ...p, isActive: e.target.checked }))} />
                Active
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowFeatureForm(false)} className="flex-1 px-4 py-2 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />} Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FeaturesPage
