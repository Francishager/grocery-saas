import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { CreditCard, Plus, Edit, Trash2, Loader2, RefreshCw, Save, X, LayoutDashboard, ShoppingCart, Package, Users, Building2, DollarSign, FileText, Briefcase, BarChart3, Clock, Wrench, GitBranch, MessageSquare, Settings, ClipboardList, UtensilsCrossed } from 'lucide-react'

interface PlanFeatureRow {
  featureId: string
  planId: string
  enabled: boolean
  feature: { id: string; name: string; displayName?: string }
}

interface Plan {
  id: string; name: string; slug: string; price: number; currency: string; billingCycle: string
  features: string[]; maxUsers: number; maxProducts: number
  isDefault: boolean; _count?: { tenants: number }
  planFeatures?: PlanFeatureRow[]
}

interface Feature {
  id: string; name: string; displayName?: string; category?: string; module?: string; isActive?: boolean
}

const MODULES = [
  {
    id: 'dashboard', name: 'Dashboard', features: [
      { name: 'dashboard', displayName: 'Dashboard' },
      { name: 'dashboard.analytics', displayName: 'Analytics Widgets' },
    ]
  },
  {
    id: 'sales', name: 'Sales Management', features: [
      { name: 'sales', displayName: 'Sales / POS' },
      { name: 'sales.pos', displayName: 'POS' },
      { name: 'sales.quotes', displayName: 'Quotes' },
      { name: 'sales.returns', displayName: 'Returns & Refunds' },
      { name: 'sales.discounts', displayName: 'Discounts' },
      { name: 'sales.suspended', displayName: 'Suspended Sales' },
    ]
  },
  {
    id: 'inventory', name: 'Inventory Management', features: [
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
    id: 'customers', name: 'Customer Management', features: [
      { name: 'customers', displayName: 'Customer Management' },
      { name: 'customers.groups', displayName: 'Customer Groups' },
      { name: 'customers.loyalty', displayName: 'Loyalty Program' },
      { name: 'customers.wallet', displayName: 'Customer Wallet' },
      { name: 'customers.statements', displayName: 'Customer Statements' },
    ]
  },
  {
    id: 'suppliers', name: 'Supplier Management', features: [
      { name: 'suppliers', displayName: 'Supplier Management' },
      { name: 'suppliers.purchase_orders', displayName: 'Purchase Orders' },
      { name: 'suppliers.grn', displayName: 'Goods Received Notes' },
      { name: 'suppliers.statements', displayName: 'Supplier Statements' },
    ]
  },
  {
    id: 'financial', name: 'Financial Management', features: [
      { name: 'expenses', displayName: 'Expense Tracking' },
      { name: 'financial.income', displayName: 'Income Tracking' },
      { name: 'financial.cashbook', displayName: 'Cashbook' },
      { name: 'financial.bank_accounts', displayName: 'Bank Accounts' },
      { name: 'financial.petty_cash', displayName: 'Petty Cash' },
    ]
  },
  {
    id: 'receivables', name: 'Receivables', features: [
      { name: 'receivables', displayName: 'Receivables' },
      { name: 'receivables.payments', displayName: 'Customer Payments' },
      { name: 'receivables.aging', displayName: 'Aging Report' },
    ]
  },
  {
    id: 'payables', name: 'Payables', features: [
      { name: 'payables', displayName: 'Payables' },
      { name: 'payables.payments', displayName: 'Supplier Payments' },
      { name: 'payables.aging', displayName: 'Payables Aging' },
    ]
  },
  {
    id: 'accounting', name: 'Accounting', features: [
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
    id: 'reports', name: 'Reports & Insights', features: [
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
    id: 'hr', name: 'HR Management', features: [
      { name: 'hr', displayName: 'HR Management' },
      { name: 'hr.employees', displayName: 'Employees' },
      { name: 'hr.attendance', displayName: 'Attendance' },
      { name: 'hr.payroll', displayName: 'Payroll' },
      { name: 'hr.leave', displayName: 'Leave Management' },
    ]
  },
  {
    id: 'service', name: 'Service Business', features: [
      { name: 'service', displayName: 'Service Business' },
      { name: 'service.appointments', displayName: 'Appointments' },
      { name: 'service.work_orders', displayName: 'Work Orders' },
      { name: 'service.job_cards', displayName: 'Job Cards' },
      { name: 'service.technicians', displayName: 'Technician Assignment' },
      { name: 'service.contracts', displayName: 'Service Contracts' },
    ]
  },
  {
    id: 'multi_branch', name: 'Multi-Branch', features: [
      { name: 'multi_branch', displayName: 'Multi-Branch' },
      { name: 'multi_branch.transfers', displayName: 'Branch Transfers' },
      { name: 'multi_branch.reports', displayName: 'Branch Reports' },
    ]
  },
  {
    id: 'rentals', name: 'Rental Bookings', features: [
      { name: 'rentals', displayName: 'Rental Bookings' },
    ]
  },
  {
    id: 'restaurant', name: 'Restaurant & Bar', features: [
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
    id: 'communication', name: 'Communication', features: [
      { name: 'communication', displayName: 'Communication' },
      { name: 'communication.sms', displayName: 'SMS Notifications' },
      { name: 'communication.email', displayName: 'Email Notifications' },
      { name: 'communication.whatsapp', displayName: 'WhatsApp Integration' },
      { name: 'communication.notifications', displayName: 'In-App Notifications' },
    ]
  },
  {
    id: 'integrations', name: 'Integrations', features: [
      { name: 'integrations', displayName: 'Integrations' },
      { name: 'integrations.mobile_money', displayName: 'Mobile Money' },
      { name: 'integrations.stripe', displayName: 'Stripe' },
      { name: 'integrations.flutterwave', displayName: 'Flutterwave' },
      { name: 'integrations.qr_payments', displayName: 'QR Payments' },
      { name: 'integrations.api_access', displayName: 'API Access' },
    ]
  },
  {
    id: 'settings', name: 'Settings', features: [
      { name: 'settings', displayName: 'Business Settings' },
      { name: 'settings.taxes', displayName: 'Taxes' },
      { name: 'settings.currencies', displayName: 'Currencies' },
      { name: 'settings.units', displayName: 'Units' },
      { name: 'settings.roles', displayName: 'Roles & Permissions' },
      { name: 'settings.users', displayName: 'Users' },
    ]
  },
  {
    id: 'audit', name: 'Audit & Security', features: [
      { name: 'audit', displayName: 'Audit Log' },
    ]
  },
]

const emptyForm = { name: '', slug: '', price: 0, currency: 'UGX', billingCycle: 'monthly', features: '', maxUsers: 5, maxProducts: 100, isDefault: false }

export const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [features, setFeatures] = useState<Feature[]>([])
  const [featuresLoading, setFeaturesLoading] = useState(false)

  const fetchPlans = async () => {
    setLoading(true)
    try { const r = await apiFetch('/api/platform/plans'); if (r.ok) setPlans(await r.json()) } catch {}
    setLoading(false)
  }

  const fetchFeatures = async () => {
    setFeaturesLoading(true)
    try {
      const r = await apiFetch('/api/platform/features')
      if (r.ok) {
        const data = await r.json()
        const list = Array.isArray(data) ? data : data.features || []
        setFeatures(list)
      }
    } catch {}
    setFeaturesLoading(false)
  }

  useEffect(() => { fetchPlans(); fetchFeatures() }, [])

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowForm(true) }
  const openEdit = (p: Plan) => {
    setEditingId(p.id)
    // Load checked features from planFeatures relation (enabled ones), fall back to JSON features field
    const enabledFeatureNames = p.planFeatures
      ? p.planFeatures.filter(pf => pf.enabled).map(pf => pf.feature?.name).filter(Boolean)
      : (Array.isArray(p.features) ? p.features : [])
    setForm({ name: p.name, slug: p.slug, price: p.price, currency: p.currency, billingCycle: p.billingCycle, features: enabledFeatureNames.join(', '), maxUsers: p.maxUsers, maxProducts: p.maxProducts, isDefault: p.isDefault })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = { ...form, features: form.features.split(',').map((f: string) => f.trim()).filter(Boolean) }
      const url = editingId ? `/api/platform/plans/${editingId}` : '/api/platform/plans'
      const method = editingId ? 'PUT' : 'POST'
      const res = await apiFetch(url, { method, body: JSON.stringify(payload) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || d.message || 'Failed') }
      setShowForm(false); fetchPlans()
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan? Tenants on this plan will need reassignment.')) return
    try {
      const res = await apiFetch(`/api/platform/plans/${id}`, { method: 'DELETE' })
      if (res.ok) fetchPlans(); else alert('Failed to delete')
    } catch { alert('Request failed') }
  }

  const fmt = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'UGX', minimumFractionDigits: 0 }).format(n)

  // Build display name lookup from MODULES (for nicer labels)
  const moduleDisplayNames: Record<string, string> = {}
  const moduleGroupLabels: Record<string, string> = {}
  for (const mod of MODULES) {
    moduleGroupLabels[mod.id] = mod.name
    for (const f of mod.features) {
      moduleDisplayNames[f.name] = f.displayName
    }
  }

  // Use API features as primary source; fall back to catalog if API hasn't loaded
  const apiFeatures: Feature[] = features.map(f => ({
    id: f.id,
    name: f.name,
    displayName: moduleDisplayNames[f.name] || f.displayName || f.name,
    category: f.module || f.category || f.name.split('.')[0] || 'other',
    module: f.module || f.category || f.name.split('.')[0] || 'other',
    isActive: f.isActive !== false,
  }))
  const catalogFeatures: Feature[] = MODULES.flatMap(mod => mod.features.map(feature => ({
    id: feature.name,
    name: feature.name,
    displayName: feature.displayName,
    category: mod.id,
    module: mod.id,
    isActive: true,
  })))
  // Merge: API features first, then catalog features not in API
  const featureOptions = [
    ...apiFeatures,
    ...catalogFeatures.filter(cf => !apiFeatures.some(af => af.name === cf.name)),
  ]
  const selectedFeatureNames = form.features.split(',').map((f: string) => f.trim()).filter(Boolean)
  const featureLabel = (name: string) => featureOptions.find(f => f.name === name)?.displayName || name
  const featureGroups = featureOptions.reduce<Record<string, Feature[]>>((groups, feature) => {
    const category = feature.module || feature.category || 'other'
    groups[category] = groups[category] || []
    groups[category].push(feature)
    return groups
  }, {})
  const toggleFeature = (name: string, checked: boolean) => {
    setForm(p => {
      const current = new Set(p.features.split(',').map((f: string) => f.trim()).filter(Boolean))
      if (checked) current.add(name)
      else current.delete(name)
      return { ...p, features: Array.from(current).join(', ') }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Plans & Pricing</h1><p className="text-gray-500">Manage subscription plans and limits</p></div>
        <div className="flex gap-2">
          <button onClick={fetchPlans} className="px-3 py-2 border rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"><Plus size={18} /> New Plan</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : plans.length === 0 ? (
        <div className="text-center py-12"><CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No plans yet. Create your first plan.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(p => (
            <div key={p.id} className="bg-white rounded-lg border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div><h3 className="text-lg font-semibold">{p.name}</h3><p className="text-sm text-gray-500">{p.slug}</p></div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="p-1 hover:bg-gray-100 rounded"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(p.id)} className="p-1 hover:bg-red-50 text-red-600 rounded"><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="text-3xl font-bold">{fmt(p.price, p.currency)}<span className="text-sm font-normal text-gray-500">/{p.billingCycle}</span></div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">{p.maxUsers} users</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">{p.maxProducts} products</span>
              </div>
              {(() => {
                const enabledNames = p.planFeatures
                  ? p.planFeatures.filter(pf => pf.enabled).map(pf => pf.feature?.name).filter(Boolean)
                  : (Array.isArray(p.features) ? p.features : [])
                return enabledNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1">{enabledNames.slice(0, 8).map((f: string, i: number) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{featureLabel(f)}</span>)}{enabledNames.length > 8 && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">+{enabledNames.length - 8} more</span>}</div>
                ) : null
              })()}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{p._count?.tenants || 0} tenants</span>
                <span className={`px-2 py-1 rounded text-xs ${p.isDefault ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{p.isDefault ? 'Default' : 'Custom'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{editingId ? 'Edit Plan' : 'New Plan'}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button></div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Name *</label><input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Slug *</label><input required value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Price *</label><input required type="number" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Currency</label><select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2 border rounded-lg"><option value="UGX">UGX</option><option value="USD">USD</option><option value="KES">KES</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Billing Cycle</label><select value={form.billingCycle} onChange={e => setForm(p => ({ ...p, billingCycle: e.target.value }))} className="w-full px-3 py-2 border rounded-lg"><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Max Users</label><input type="number" value={form.maxUsers} onChange={e => setForm(p => ({ ...p, maxUsers: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Max Products</label><input type="number" value={form.maxProducts} onChange={e => setForm(p => ({ ...p, maxProducts: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Features</label>
                  <div className="max-h-60 space-y-3 overflow-y-auto rounded-lg border p-3">
                    {featuresLoading && (
                      <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Loading custom features...</div>
                    )}
                    {Object.entries(featureGroups).map(([category, group]) => (
                      <div key={category} className="space-y-2">
                        <p className="text-xs font-semibold uppercase text-gray-500">{(moduleGroupLabels[category] || category).replace(/_/g, ' ')}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.map(feature => (
                            <label key={feature.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedFeatureNames.includes(feature.name)}
                                onChange={e => toggleFeature(feature.name, e.target.checked)}
                              />
                              <span>{feature.displayName || feature.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.isDefault} onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))} /> Default plan</label>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />} {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PlansPage
