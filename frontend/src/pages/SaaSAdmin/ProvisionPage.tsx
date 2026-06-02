import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { Building2, User, Mail, Phone, CreditCard, Loader2, CheckCircle } from 'lucide-react'

interface Plan { id: string; name: string; price: number; currency: string; billingCycle: string }


export const ProvisionPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    businessName: '', businessSlug: '', businessEmail: '', businessPhone: '', planId: '',
    ownerName: '', ownerEmail: '', ownerPassword: '',
  })

  useEffect(() => {
    apiFetch('/api/platform/plans', {})
      .then(r => r.ok ? r.json() : [])
      .then(setPlans)
      .catch(() => {})
  }, [])

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null); setSuccess(false)
    try {
      // 1. Create business
      const bizRes = await apiFetch('/api/admin/businesses', {
        method: 'POST',
        body: JSON.stringify({ name: form.businessName, slug: form.businessSlug, email: form.businessEmail, phone: form.businessPhone, planId: form.planId || undefined }),
      })
      if (!bizRes.ok) { const d = await bizRes.json().catch(() => ({})); throw new Error(d.error || d.message || 'Failed to create business') }
      const biz = await bizRes.json()

      // 2. Create owner
      const ownRes = await apiFetch('/api/admin/owners', {
        method: 'POST',
        body: JSON.stringify({ name: form.ownerName, email: form.ownerEmail, password: form.ownerPassword, tenantId: biz.id, role: 'owner' }),
      })
      if (!ownRes.ok) { const d = await ownRes.json().catch(() => ({})); throw new Error(d.error || d.message || 'Failed to create owner') }

      setSuccess(true)
      setForm({ businessName: '', businessSlug: '', businessEmail: '', businessPhone: '', planId: '', ownerName: '', ownerEmail: '', ownerPassword: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provisioning failed')
    } finally { setLoading(false) }
  }

  if (success) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-green-600" /></div>
        <h2 className="text-xl font-semibold">Business Provisioned!</h2>
        <p className="text-gray-500 mt-2">The business and owner account have been created successfully.</p>
        <button onClick={() => setSuccess(false)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Provision Another</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold">Provision Business</h1><p className="text-gray-500">Create a new business tenant and owner in one step</p></div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md"><p className="text-sm text-red-600">{error}</p></div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="w-5 h-5" /> Business Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Business Name *</label><input required value={form.businessName} onChange={e => handleChange('businessName', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Fresh Mart" /></div>
            <div><label className="block text-sm font-medium mb-1">Slug *</label><input required value={form.businessSlug} onChange={e => handleChange('businessSlug', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="fresh-mart" /></div>
            <div><label className="block text-sm font-medium mb-1">Business Email *</label><input required type="email" value={form.businessEmail} onChange={e => handleChange('businessEmail', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="info@freshmart.com" /></div>
            <div><label className="block text-sm font-medium mb-1">Phone</label><input value={form.businessPhone} onChange={e => handleChange('businessPhone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="+256 700 123 456" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Subscription Plan</label>
            <select value={form.planId} onChange={e => handleChange('planId', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Select a plan</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name} - {p.price} {p.currency}/{p.billingCycle}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><User className="w-5 h-5" /> Owner Account</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Owner Name *</label><input required value={form.ownerName} onChange={e => handleChange('ownerName', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="John Doe" /></div>
            <div><label className="block text-sm font-medium mb-1">Owner Email *</label><input required type="email" value={form.ownerEmail} onChange={e => handleChange('ownerEmail', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="john@freshmart.com" /></div>
            <div><label className="block text-sm font-medium mb-1">Password *</label><input required type="password" minLength={6} value={form.ownerPassword} onChange={e => handleChange('ownerPassword', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Min 6 characters" /></div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Provisioning...</> : <><Building2 className="w-5 h-5" /> Provision Business</>}
        </button>
      </form>
    </div>
  )
}

export default ProvisionPage
