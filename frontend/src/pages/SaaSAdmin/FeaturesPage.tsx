import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { ToggleLeft, ToggleRight, Loader2, RefreshCw, Plus, Trash2, DollarSign, Package, ShoppingCart, Briefcase, BarChart3, Save, X } from 'lucide-react'

interface Feature { id: string; name: string; displayName: string; slug: string; category: string; description: string; isActive: boolean }
interface PlanFeature { featureId: string; planId: string; enabled: boolean; feature: { id: string; name: string; slug: string } }
interface Plan { id: string; name: string }

const emptyFeatureForm = { name: '', displayName: '', category: 'core', description: '', isActive: true }

const MODULES = [
  { id: 'financial', name: 'Financial Management', icon: DollarSign, color: 'text-green-600 bg-green-100', features: [
    { name: 'bookkeeping', displayName: 'Bookkeeping' }, { name: 'income_tracking', displayName: 'Income Tracking' },
    { name: 'expense_management', displayName: 'Expense Management' }, { name: 'payables_management', displayName: 'Payables Management' },
    { name: 'receivables_management', displayName: 'Receivables Management' }, { name: 'cash_flow_monitoring', displayName: 'Cash Flow Monitoring' },
    { name: 'profitability_analysis', displayName: 'Profitability Analysis' },
  ]},
  { id: 'inventory', name: 'Inventory Management', icon: Package, color: 'text-orange-600 bg-orange-100', features: [
    { name: 'product_tracking', displayName: 'Product Tracking' }, { name: 'stock_movement', displayName: 'Stock Movement Monitoring' },
    { name: 'low_stock_alerts', displayName: 'Low-Stock Alerts' }, { name: 'purchase_management', displayName: 'Purchase Management' },
    { name: 'supplier_management', displayName: 'Supplier Management' }, { name: 'inventory_valuation', displayName: 'Inventory Valuation' },
  ]},
  { id: 'sales', name: 'Sales Management', icon: ShoppingCart, color: 'text-blue-600 bg-blue-100', features: [
    { name: 'pos_sales', displayName: 'POS Sales Processing' }, { name: 'invoice_generation', displayName: 'Invoice Generation' },
    { name: 'customer_transactions', displayName: 'Customer Transactions' }, { name: 'sales_tracking', displayName: 'Sales Tracking' },
    { name: 'payment_management', displayName: 'Payment Management' },
  ]},
  { id: 'operations', name: 'Business Operations', icon: Briefcase, color: 'text-purple-600 bg-purple-100', features: [
    { name: 'staff_management', displayName: 'Staff Management' }, { name: 'role_access_control', displayName: 'Role-Based Access Control' },
    { name: 'activity_logs', displayName: 'Activity Logs' }, { name: 'branch_management', displayName: 'Branch Management' },
    { name: 'workflow_organization', displayName: 'Workflow Organization' },
  ]},
  { id: 'reporting', name: 'Reporting & Insights', icon: BarChart3, color: 'text-cyan-600 bg-cyan-100', features: [
    { name: 'financial_reports', displayName: 'Financial Reports' }, { name: 'sales_reports', displayName: 'Sales Reports' },
    { name: 'inventory_reports', displayName: 'Inventory Reports' }, { name: 'performance_dashboards', displayName: 'Business Performance Dashboards' },
    { name: 'decision_analytics', displayName: 'Decision-Support Analytics' },
  ]},
]

export const FeaturesPage: React.FC = () => {
  const [features, setFeatures] = useState<Feature[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string>('')
  const [error, setError] = useState('')
  const [showFeatureForm, setShowFeatureForm] = useState(false)
  const [featureForm, setFeatureForm] = useState(emptyFeatureForm)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [fRes, pRes] = await Promise.all([apiFetch('/api/platform/features'), apiFetch('/api/platform/plans')])
      if (fRes.ok) setFeatures(await fRes.json())
      if (pRes.ok) { const p = await pRes.json(); setPlans(p); if (p.length && !selectedPlan) setSelectedPlan(p[0].id) }
    } catch {}
    setLoading(false)
  }

  const fetchPlanFeatures = async (planId: string) => {
    if (!planId) return
    try { const res = await apiFetch(`/api/platform/plans/${planId}/features`); if (res.ok) setPlanFeatures(await res.json()) } catch {}
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (selectedPlan) fetchPlanFeatures(selectedPlan) }, [selectedPlan])

  const isFeatureEnabled = (featureName: string) => planFeatures.some(pf => pf.feature?.name === featureName && pf.enabled)
  const toFeatureName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

  const handleToggle = async (mf: { name: string; displayName: string }, category: string, enabled: boolean) => {
    if (!selectedPlan) { setError('Select a plan first'); return }
    setSaving(true); setError('')
    try {
      // Auto-create the underlying system feature if it doesn't exist yet,
      // so toggling always works even before "Seed All Modules" is run.
      let feat = features.find(f => f.name === mf.name)
      if (!feat) {
        const cRes = await apiFetch('/api/platform/features', { method: 'POST', body: JSON.stringify({ name: mf.name, displayName: mf.displayName, category, description: mf.displayName, isActive: true }) })
        if (!cRes.ok) { const e = await cRes.json().catch(() => ({})); throw new Error(e.error || 'Failed to create feature') }
        const created = await cRes.json()
        feat = created.feature
        if (feat) setFeatures(prev => [...prev, feat as Feature])
      }
      if (!feat) throw new Error('Feature unavailable')
      const res = await apiFetch('/api/platform/plan-features', { method: 'POST', body: JSON.stringify({ planId: selectedPlan, featureId: feat.id, enabled }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to update toggle') }
      await fetchPlanFeatures(selectedPlan)
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
          await apiFetch('/api/platform/features', { method: 'POST', body: JSON.stringify({ name: f.name, displayName: f.displayName, category: mod.id, description: f.displayName, isActive: true, slug: f.name }) })
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Features</h1><p className="text-slate-400">Manage jibuSales modules and plan assignments</p></div>
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

      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-slate-300">Assign features for plan:</label>
          <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm">
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
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
                    const enabled = isFeatureEnabled(mf.name)
                    return (
                      <div key={mf.name} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                        <span className="text-sm text-slate-200">{mf.displayName}</span>
                        <button onClick={() => handleToggle(mf, mod.id, !enabled)} disabled={saving} className="flex items-center gap-1">
                          {enabled ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
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
                {features.filter(f => !MODULES.some(m => m.features.some(mf => mf.name === f.name))).map(f => (
                  <div key={f.id} className="flex items-center justify-between p-4">
                    <div><p className="font-medium text-sm text-slate-200">{f.displayName || f.name}</p><p className="text-xs text-slate-400">{f.category}</p></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggle({ name: f.name, displayName: f.displayName || f.name }, f.category, !isFeatureEnabled(f.name))} disabled={saving}>
                        {isFeatureEnabled(f.name) ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                      </button>
                      <button onClick={() => handleDeleteFeature(f.id)} className="p-1 hover:bg-red-900 text-red-400 rounded"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
