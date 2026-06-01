import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { Settings, ToggleLeft, ToggleRight, Loader2, RefreshCw, Save, X, Plus, Trash2 } from 'lucide-react'

interface Feature {
  id: string; name: string; slug: string; category: string; description: string; isActive: boolean
}

interface PlanFeature {
  featureId: string; planId: string; enabled: boolean
  feature: { id: string; name: string; slug: string }
  plan: { id: string; name: string }
}

interface Plan { id: string; name: string }

function {}: Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('auth_tokens')
  if (t) { try { h['Authorization'] = `Bearer ${JSON.parse(t).accessToken}` } catch {} }
  return h
}

export const FeaturesPage: React.FC = () => {
  const [features, setFeatures] = useState<Feature[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', category: 'core', description: '', isActive: true })
  const [selectedPlan, setSelectedPlan] = useState<string>('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [fRes, pRes] = await Promise.all([
        apiFetch('/api/platform/features', {}),
        apiFetch('/api/platform/plans', {}),
      ])
      if (fRes.ok) setFeatures(await fRes.json())
      if (pRes.ok) { const p = await pRes.json(); setPlans(p); if (p.length && !selectedPlan) setSelectedPlan(p[0].id) }
    } catch {}
    setLoading(false)
  }

  const fetchPlanFeatures = async (planId: string) => {
    if (!planId) return
    try {
      const res = await fetch(`/api/platform/plans/${planId}/features`, {})
      if (res.ok) setPlanFeatures(await res.json())
    } catch {}
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (selectedPlan) fetchPlanFeatures(selectedPlan) }, [selectedPlan])

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const res = await apiFetch('/api/platform/features', { method: 'POST', body: JSON.stringify(form) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || d.message || 'Failed') }
      setShowForm(false); setForm({ name: '', slug: '', category: 'core', description: '', isActive: true }); fetchData()
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
    setSaving(false)
  }

  const handleTogglePlanFeature = async (featureId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/platform/plans/${selectedPlan}/features/${featureId}`, {
        method: 'POST', body: JSON.stringify({ enabled }),
      })
      if (res.ok) fetchPlanFeatures(selectedPlan)
    } catch {}
  }

  const handleDeleteFeature = async (id: string) => {
    if (!confirm('Delete this feature?')) return
    try {
      const res = await fetch(`/api/platform/features/${id}`, { method: 'DELETE' })
      if (res.ok) fetchData()
    } catch {}
  }

  const categoryBadge = (c: string) => {
    const cls: Record<string, string> = { core: 'bg-blue-100 text-blue-800', advanced: 'bg-purple-100 text-purple-800', integration: 'bg-green-100 text-green-800' }
    return <span className={`px-2 py-1 rounded text-xs font-medium ${cls[c] || 'bg-gray-100 text-gray-800'}`}>{c}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Features</h1><p className="text-gray-500">Manage platform features and plan assignments</p></div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="px-3 py-2 border rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"><Plus size={18} /> New Feature</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Feature Registry */}
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b"><h2 className="font-semibold">Feature Registry</h2></div>
            <div className="divide-y">
              {features.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No features defined</div>
              ) : features.map(f => (
                <div key={f.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-sm">{f.name}</p>
                      <p className="text-xs text-gray-500">{f.slug} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ {categoryBadge(f.category)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${f.isActive ? 'text-green-600' : 'text-gray-400'}`}>{f.isActive ? 'Active' : 'Inactive'}</span>
                    <button onClick={() => handleDeleteFeature(f.id)} className="p-1 hover:bg-red-50 text-red-600 rounded"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Plan Feature Assignment */}
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Plan Feature Assignment</h2>
              <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} className="px-3 py-1 border rounded-lg text-sm">
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="divide-y">
              {features.map(f => {
                const pf = planFeatures.find(p => p.featureId === f.id)
                const enabled = pf?.enabled ?? false
                return (
                  <div key={f.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium text-sm">{f.name}</p>
                      <p className="text-xs text-gray-500">{f.slug}</p>
                    </div>
                    <button onClick={() => handleTogglePlanFeature(f.id, !enabled)} className="flex items-center gap-2">
                      {enabled ? <ToggleRight className="w-6 h-6 text-green-600" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                      <span className={`text-xs ${enabled ? 'text-green-600' : 'text-gray-400'}`}>{enabled ? 'On' : 'Off'}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">New Feature</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button></div>
            <form onSubmit={handleCreateFeature} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Name *</label><input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium mb-1">Slug *</label><input required value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g. pos, inventory, reports" /></div>
              <div><label className="block text-sm font-medium mb-1">Category</label><select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg"><option value="core">Core</option><option value="advanced">Advanced</option><option value="integration">Integration</option></select></div>
              <div><label className="block text-sm font-medium mb-1">Description</label><textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" rows={2} /></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />} Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FeaturesPage
