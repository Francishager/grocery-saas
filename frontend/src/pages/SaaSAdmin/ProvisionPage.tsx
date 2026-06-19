import React, { useEffect, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle, Copy, Eye, EyeOff, Loader2, RefreshCw, Share2, User } from 'lucide-react'
import { apiFetch } from '../../lib/api'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  billingCycle: string
}

interface ProvisionResult {
  message?: string
  tenantId?: string
  slug?: string
  ownerEmail?: string
  emailSent?: boolean
  emailError?: string | null
  tempPassword?: string
  otp?: string
}

function generatePassword(length = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
  const bytes = new Uint32Array(length)
  window.crypto?.getRandomValues(bytes)
  return Array.from(bytes, (value) => chars[value % chars.length]).join('')
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const createEmptyForm = () => ({
  businessName: '',
  businessSlug: '',
  businessEmail: '',
  businessPhone: '',
  planId: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: generatePassword(),
})

type ProvisionForm = ReturnType<typeof createEmptyForm>

export const ProvisionPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProvisionResult | null>(null)
  const [form, setForm] = useState<ProvisionForm>(() => createEmptyForm())
  const [showPassword, setShowPassword] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/platform/plans', {})
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setPlans(Array.isArray(data) ? data : data.plans || []))
      .catch(() => {})
  }, [])

  const handleChange = (field: keyof ProvisionForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'businessName' && (!prev.businessSlug || prev.businessSlug === slugify(prev.businessName))) {
        next.businessSlug = slugify(value)
      }
      return next
    })
    setError(null)
  }

  const credentialsText = () => {
    if (!result) return ''
    return [
      `Business: ${form.businessName || result.slug || 'Created business'}`,
      result.tenantId ? `Business ID: ${result.tenantId}` : null,
      result.slug ? `Slug: ${result.slug}` : null,
      result.ownerEmail ? `Owner email: ${result.ownerEmail}` : null,
      result.tempPassword ? `Temporary password: ${result.tempPassword}` : null,
      result.otp ? `OTP: ${result.otp}` : null,
      'Login: /login',
    ].filter(Boolean).join('\n')
  }

  const copyCredentials = async () => {
    const text = credentialsText()
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      setCopyMessage('Credentials copied')
    } catch {
      setCopyMessage('Copy failed')
    }
  }

  const shareCredentials = async () => {
    const text = credentialsText()
    if (!text) return

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Business owner credentials', text })
        setCopyMessage('Share sheet opened')
        return
      } catch {
        return
      }
    }

    await copyCredentials()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    setResult(null)

    try {
      const res = await apiFetch('/api/admin/provision-tenant', {
        method: 'POST',
        body: JSON.stringify({
          business: {
            name: form.businessName,
            slug: form.businessSlug,
            email: form.businessEmail || undefined,
            phone: form.businessPhone,
            planId: form.planId || undefined,
          },
          owner: {
            name: form.ownerName,
            email: form.ownerEmail,
            password: form.ownerPassword || undefined,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to provision business')

      setResult(data)
      setSuccess(true)
      setCopyMessage(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provisioning failed')
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Business Provisioned!</h2>
        <p className="text-gray-500 mt-2">The business and owner account have been created successfully.</p>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-left">
          <p className="text-sm font-medium text-slate-900">Owner credentials</p>
          <div className="mt-3 space-y-1 text-sm text-slate-700">
            {result?.tenantId && <p><span className="font-medium">Business ID:</span> {result.tenantId}</p>}
            {result?.ownerEmail && <p><span className="font-medium">Owner email:</span> {result.ownerEmail}</p>}
            {result?.tempPassword && <p><span className="font-medium">Temporary password:</span> {result.tempPassword}</p>}
            {result?.otp && <p><span className="font-medium">OTP:</span> {result.otp}</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={copyCredentials} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-white">
              <Copy className="h-4 w-4" />
              Copy
            </button>
            <button type="button" onClick={shareCredentials} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-white">
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
          {copyMessage && <p className="mt-2 text-xs text-slate-500">{copyMessage}</p>}
        </div>
        {result?.emailSent === false ? (
          <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-left">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-700" />
              <div>
                <p className="font-medium text-yellow-900">Owner email was not delivered.</p>
                <p className="mt-1 text-sm text-yellow-800">{result.emailError || result.message}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-green-700">
            Owner setup email sent to {result?.ownerEmail || 'the owner'}.
          </p>
        )}
        <button
          onClick={() => {
            setSuccess(false)
            setResult(null)
            setForm(createEmptyForm())
            setCopyMessage(null)
          }}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Provision Another
        </button>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Provision Business</h1>
        <p className="text-gray-500">Create a new business tenant and owner in one step</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md"><p className="text-sm text-red-600">{error}</p></div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="w-5 h-5" /> Business Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Business Name *</label><input required value={form.businessName} onChange={(e) => handleChange('businessName', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Fresh Mart" /></div>
            <div><label className="block text-sm font-medium mb-1">Slug</label><input value={form.businessSlug} onChange={(e) => handleChange('businessSlug', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="fresh-mart" /></div>
            <div><label className="block text-sm font-medium mb-1">Business Email</label><input type="email" value={form.businessEmail} onChange={(e) => handleChange('businessEmail', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="info@freshmart.com" /></div>
            <div><label className="block text-sm font-medium mb-1">Phone</label><input value={form.businessPhone} onChange={(e) => handleChange('businessPhone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="+256 700 123 456" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Subscription Plan</label>
            <select value={form.planId} onChange={(e) => handleChange('planId', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Select a plan</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} - {p.price} {p.currency}/{p.billingCycle}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><User className="w-5 h-5" /> Owner Account</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Owner Name *</label><input required value={form.ownerName} onChange={(e) => handleChange('ownerName', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="John Doe" /></div>
            <div><label className="block text-sm font-medium mb-1">Owner Email *</label><input required type="email" value={form.ownerEmail} onChange={(e) => handleChange('ownerEmail', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="john@freshmart.com" /></div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Temporary Password</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input type={showPassword ? 'text' : 'password'} minLength={6} value={form.ownerPassword} onChange={(e) => handleChange('ownerPassword', e.target.value)} className="w-full rounded-lg border px-3 py-2 pr-10" placeholder="Auto-generated if empty" />
                  <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button type="button" onClick={() => handleChange('ownerPassword', generatePassword())} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
                  <RefreshCw className="h-4 w-4" />
                  Generate
                </button>
                <button type="button" onClick={() => navigator.clipboard.writeText(form.ownerPassword)} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>
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
