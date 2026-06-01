import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { CreditCard, Plus, Edit, Trash2, Loader2, RefreshCw, Save, X } from 'lucide-react'

interface Plan {
  id: string; name: string; slug: string; price: number; currency: string; billingCycle: string
  maxUsers: number; maxProducts: number; maxBranches: number; maxCustomers: number; maxSuppliers: number
  isDefault: boolean; isActive: boolean
  _count?: { tenants: number }


const emptyForm = { name: '', slug: '', price: 0, currency: 'UGX', billingCycle: 'monthly', maxUsers: 5, maxProducts: 100, maxBranches: 1, maxCustomers: 50, maxSuppliers: 20, isDefault: false, isActive: true }

export const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const fetchPlans = async () => {
    setLoading(true)
    try { const r = await apiFetch('/api/platform/plans', {}); if (r.ok) setPlans(await r.json()) } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchPlans() }, [])

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowForm(true) }
  const openEdit = (p: Plan) => {
    setEditingId(p.id)
    setForm({ name: p.name, slug: p.slug, price: p.price, currency: p.currency, billingCycle: p.billingCycle, maxUsers: p.maxUsers, maxProducts: p.maxProducts, maxBranches: p.maxBranches, maxCustomers: p.maxCustomers, maxSuppliers: p.maxSuppliers, isDefault: p.isDefault, isActive: p.isActive })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const url = editingId ? `/api/platform/plans/${editingId}` : '/api/platform/plans'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, { method, body: JSON.stringify(form) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || d.message || 'Failed') }
      setShowForm(false); fetchPlans()
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan? Tenants on this plan will need reassignment.')) return
    try {
      const res = await fetch(`/api/platform/plans/${id}`, { method: 'DELETE' })
      if (res.ok) fetchPlans(); else alert('Failed to delete')
    } catch { alert('Request failed') }
  }

  const fmt = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'UGX', minimumFractionDigits: 0 }).format(n)

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
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">{p.maxBranches} branches</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">{p.maxCustomers} customers</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">{p.maxSuppliers} suppliers</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{p._count?.tenants || 0} tenants</span>
                <span className={`px-2 py-1 rounded text-xs ${p.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{p.isActive ? 'Active' : 'Inactive'}</span>
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
                <div><label className="block text-sm font-medium mb-1">Price *</label><input required type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Currency</label><select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2 border rounded-lg"><option value="UGX">UGX</option><option value="USD">USD</option><option value="KES">KES</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Billing Cycle</label><select value={form.billingCycle} onChange={e => setForm(p => ({ ...p, billingCycle: e.target.value }))} className="w-full px-3 py-2 border rounded-lg"><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Max Users</label><input type="number" value={form.maxUsers} onChange={e => setForm(p => ({ ...p, maxUsers: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Max Products</label><input type="number" value={form.maxProducts} onChange={e => setForm(p => ({ ...p, maxProducts: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Max Branches</label><input type="number" value={form.maxBranches} onChange={e => setForm(p => ({ ...p, maxBranches: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Max Customers</label><input type="number" value={form.maxCustomers} onChange={e => setForm(p => ({ ...p, maxCustomers: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Max Suppliers</label><input type="number" value={form.maxSuppliers} onChange={e => setForm(p => ({ ...p, maxSuppliers: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" /></div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.isDefault} onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))} /> Default plan</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label>
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

export default PlansPage
