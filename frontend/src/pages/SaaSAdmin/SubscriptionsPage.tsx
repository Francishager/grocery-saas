import { appNotify } from '@/lib/appFeedback'
﻿import { apiFetch } from '../../lib/api'
import React, { useState, useEffect, useMemo } from 'react'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'
import { CreditCard, Search, Loader2, RefreshCw, X, ArrowRightLeft, Calendar, Banknote, Receipt } from 'lucide-react'

interface Subscription {
  id: string; status: string; startDate: string; endDate: string | null; trialEndsAt: string | null
  tenant: { id: string; name: string; status: string }
  customPrice?: number | null
  customCurrency?: string | null
  customBillingCycle?: string | null
  monthlyServiceFee?: number | null
  annualServiceFee?: number | null
  staticIpFee?: number | null
  gracePeriodDays?: number | null
  reminderDaysBeforeDue?: number | null
  plan: { id: string; name: string; price: number; currency: string; billingCycle: string; maxUsers?: number; maxProducts?: number }
}

interface Plan { id: string; name: string; price: number; currency: string; billingCycle: string; maxUsers?: number; maxProducts?: number }
interface SubscriptionPayment {
  id: string; amount: string; currency: string; paymentMethod: string
  reference: string | null; notes: string | null; paidAt: string
  recordedByEmail: string | null
}

export const SubscriptionsPage: React.FC = () => {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [search, setSearch] = useState('')
  const filteredSubs = useMemo(() => subs.filter(s => !search || (s.tenant?.name || '').toLowerCase().includes(search.toLowerCase())), [subs, search])
  const { paginatedItems: paginatedSubs, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(filteredSubs, 10)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Subscription | null>(null)
  const [changing, setChanging] = useState<string | null>(null)
  const [editDates, setEditDates] = useState(false)
  const [subStart, setSubStart] = useState('')
  const [subEnd, setSubEnd] = useState('')
  const [trialEnd, setTrialEnd] = useState('')
  const [autoEnd, setAutoEnd] = useState(true)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [tenantStatus, setTenantStatus] = useState('active')
  const [planPrice, setPlanPrice] = useState('')
  const [customCurrency, setCustomCurrency] = useState('UGX')
  const [customBillingCycle, setCustomBillingCycle] = useState('monthly')
  const [monthlyServiceFee, setMonthlyServiceFee] = useState('0')
  const [annualServiceFee, setAnnualServiceFee] = useState('0')
  const [staticIpFee, setStaticIpFee] = useState('0')
  const [gracePeriodDays, setGracePeriodDays] = useState('0')
  const [reminderDaysBeforeDue, setReminderDaysBeforeDue] = useState('10')
  const [planMaxUsers, setPlanMaxUsers] = useState('')
  const [planMaxProducts, setPlanMaxProducts] = useState('')
  const [payments, setPayments] = useState<SubscriptionPayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => {
    const now = new Date()
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [sRes, pRes] = await Promise.all([
        apiFetch('/api/admin/subscriptions', {}),
        apiFetch('/api/platform/plans', {}),
      ])
      if (sRes.ok) { const d = await sRes.json(); setSubs(Array.isArray(d?.subscriptions) ? d.subscriptions : Array.isArray(d) ? d : []) }
      if (pRes.ok) setPlans(await pRes.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const fetchPayments = async (subscriptionId: string) => {
    setPaymentsLoading(true)
    try {
      const res = await apiFetch('/api/admin/subscriptions/' + subscriptionId + '/payments', {})
      if (res.ok) {
        const data = await res.json()
        setPayments(Array.isArray(data?.payments) ? data.payments : [])
      } else appNotify('Unable to load payment history')
    } catch {
      appNotify('Unable to load payment history')
    } finally {
      setPaymentsLoading(false)
    }
  }

  const openModal = (sub: Subscription) => {
    setSelected(sub)
    setPayments([])
    setPaymentAmount('')
    setPaymentMethod('cash')
    setPaymentReference('')
    setPaymentNotes('')
    const now = new Date()
    setPaymentDate(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10))
    void fetchPayments(sub.id)
    setEditDates(false)
    setSubStart(sub.startDate ? sub.startDate.split('T')[0] : new Date().toISOString().split('T')[0])
    setSubEnd(sub.endDate ? sub.endDate.split('T')[0] : '')
    setTrialEnd(sub.trialEndsAt ? sub.trialEndsAt.split('T')[0] : '')
    setAutoEnd(!sub.endDate)
    setSelectedPlanId(sub.plan?.id || '')
    setTenantStatus(sub.tenant?.status || sub.status || 'active')
    setPlanPrice(String(sub.customPrice ?? sub.plan?.price ?? ''))
    setCustomCurrency(sub.customCurrency || sub.plan?.currency || 'UGX')
    setCustomBillingCycle(sub.customBillingCycle || sub.plan?.billingCycle || 'monthly')
    setMonthlyServiceFee(String(sub.monthlyServiceFee ?? 0))
    setAnnualServiceFee(String(sub.annualServiceFee ?? 0))
    setStaticIpFee(String(sub.staticIpFee ?? 0))
    setGracePeriodDays(String(sub.gracePeriodDays ?? 0))
    setReminderDaysBeforeDue(String(sub.reminderDaysBeforeDue ?? 10))
    setPlanMaxUsers(String(sub.plan?.maxUsers || ''))
    setPlanMaxProducts(String(sub.plan?.maxProducts || ''))
  }

  const handleRecordPayment = async () => {
    if (!selected) return
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      appNotify('Enter an amount greater than zero')
      return
    }
    setPaymentSaving(true)
    try {
      const res = await apiFetch('/api/admin/subscriptions/' + selected.id + '/payments', {
        method: 'POST',
        body: JSON.stringify({ amount: paymentAmount, paymentMethod, reference: paymentReference, notes: paymentNotes, paidAt: paymentDate }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        appNotify(data.error || 'Failed to record subscription payment')
        return
      }
      setPaymentAmount('')
      setPaymentReference('')
      setPaymentNotes('')
      await fetchPayments(selected.id)
      await fetchData()
      appNotify('Subscription payment recorded')
    } catch {
      appNotify('Unable to record subscription payment')
    } finally {
      setPaymentSaving(false)
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setChanging(selected.id)
    try {
      const body: Record<string, string | boolean> = {}
      if (selectedPlanId) body.planId = selectedPlanId
      if (tenantStatus) body.status = tenantStatus
      if (subStart) body.subscriptionStart = subStart
      if (!autoEnd && subEnd) body.subscriptionEnd = subEnd
      if (trialEnd) body.trialEndsAt = trialEnd
      if (planPrice !== '') body.customPrice = planPrice
      if (customCurrency) body.customCurrency = customCurrency
      if (customBillingCycle) body.customBillingCycle = customBillingCycle
      if (monthlyServiceFee !== '') body.monthlyServiceFee = monthlyServiceFee
      if (annualServiceFee !== '') body.annualServiceFee = annualServiceFee
      if (staticIpFee !== '') body.staticIpFee = staticIpFee
      if (gracePeriodDays !== '') body.gracePeriodDays = gracePeriodDays
      if (reminderDaysBeforeDue !== '') body.reminderDaysBeforeDue = reminderDaysBeforeDue
      if (planMaxUsers) body.maxUsers = planMaxUsers
      if (planMaxProducts) body.maxProducts = planMaxProducts
      if (autoEnd) body.autoEnd = true
      const res = await apiFetch(`/api/admin/subscriptions/${selected.id}`, { method: 'PUT', body: JSON.stringify(body) })
      if (res.ok) { fetchData(); setSelected(null) }
      else { const d = await res.json().catch(() => ({})); appNotify(d.error || 'Failed to update subscription') }
    } catch { appNotify('Request failed') }
    setChanging(null)
  }

  const handlePlanSelect = (planId: string) => {
    const plan = plans.find((item) => item.id === planId)
    setSelectedPlanId(planId)
    if (plan) {
      setPlanPrice(String(plan.price || ''))
      setPlanMaxUsers(String(plan.maxUsers || ''))
      setPlanMaxProducts(String(plan.maxProducts || ''))
    }
  }

  const isExpired = (endDate: string | null) => endDate && new Date(endDate) < new Date()
  const isTrialActive = (trialEndsAt: string | null) => trialEndsAt && new Date(trialEndsAt) > new Date()

  const effectiveStatus = (s: Subscription) => {
    const savedStatus = s.tenant?.status || s.status
    if (savedStatus === 'suspended' || savedStatus === 'cancelled') return savedStatus
    if (isExpired(s.endDate)) return 'expired'
    if (isTrialActive(s.trialEndsAt)) return 'trial'
    return savedStatus
  }

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = { active: 'bg-green-100 text-green-800', trial: 'bg-blue-100 text-blue-800', past_due: 'bg-yellow-100 text-yellow-800', cancelled: 'bg-red-100 text-red-800', expired: 'bg-gray-100 text-gray-800', suspended: 'bg-red-100 text-red-800' }
    const label = (s || 'unknown').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
    return <span className={`px-2 py-1 rounded text-xs font-medium ${cls[s] || 'bg-gray-100 text-gray-800'}`}>{label}</span>
  }

  const fmt = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'UGX', minimumFractionDigits: 0 }).format(n)
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Subscriptions</h1><p className="text-gray-500">View and manage tenant subscriptions</p></div>
        <button onClick={fetchData} className="px-3 py-2 border rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by business name..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : subs.length === 0 ? (
          <div className="text-center py-12"><CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No subscriptions found</p></div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Business</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plan</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Start</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">End</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Trial Ends</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedSubs.map(s => {
                const effStatus = effectiveStatus(s)
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><div className="text-sm font-medium">{s.tenant?.name || '-'}</div>{statusBadge(s.tenant?.status || s.status || '-')}</td>
                    <td className="px-4 py-3"><div className="text-sm font-medium">{s.plan?.name || 'No Plan'}</div><div className="text-xs text-gray-500">{fmt(s.plan?.price || 0, s.plan?.currency || 'UGX')}/{s.plan?.billingCycle || '-'}</div></td>
                    <td className="px-4 py-3">{statusBadge(effStatus)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.startDate)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {fmtDate(s.endDate)}
                      {isExpired(s.endDate) && <span className="ml-1 text-xs text-red-600">expired</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.trialEndsAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openModal(s)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Manage Subscription"><ArrowRightLeft size={16} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={goToPage}
        />
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Manage Subscription - {selected.tenant?.name}</h2><button onClick={() => setSelected(null)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button></div>
            <div className="space-y-3 text-sm mb-4">
              <div className="flex justify-between"><span className="text-gray-500">Current Plan</span><span className="font-medium">{selected.plan?.name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span>{statusBadge(effectiveStatus(selected))}</div>
              <div className="flex justify-between"><span className="text-gray-500">Start</span><span>{fmtDate(selected.startDate)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">End</span><span>{fmtDate(selected.endDate)}</span></div>
              {selected.trialEndsAt && <div className="flex justify-between"><span className="text-gray-500">Trial Ends</span><span>{fmtDate(selected.trialEndsAt)}</span></div>}
            </div>

            <section className="mb-4 border-t pt-4" aria-labelledby="subscription-payment-heading">
              <div className="mb-3 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-emerald-700" />
                <h3 id="subscription-payment-heading" className="text-sm font-semibold">Record payment received</h3>
              </div>
              <p className="mb-3 text-xs text-gray-500">For a payment already received from this business. This tenant-specific receipt does not change the plan price.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Amount received ({selected.customCurrency || selected.plan?.currency || 'UGX'})</label>
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" required value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Payment method</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile money</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Date received</label>
                  <input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Receipt / reference</label>
                  <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} maxLength={200} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
                  <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} maxLength={2000} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
              </div>
              <button type="button" onClick={handleRecordPayment} disabled={paymentSaving || !paymentAmount || Number(paymentAmount) <= 0} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                {paymentSaving ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
                Record payment received
              </button>
              <div className="mt-4 border-t pt-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment history</h4>
                {paymentsLoading ? <div className="py-3 text-center text-xs text-gray-500">Loading payments...</div> : payments.length === 0 ? <div className="py-3 text-center text-xs text-gray-500">No payments recorded</div> : (
                  <div className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                    {payments.map(payment => (
                      <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium">{payment.paymentMethod.replace('_', ' ')}{payment.reference ? ' · ' + payment.reference : ''}</div>
                          <div className="mt-0.5 text-gray-500">{fmtDate(payment.paidAt)}{payment.recordedByEmail ? ' · recorded by ' + payment.recordedByEmail : ''}</div>
                          {payment.notes && <div className="mt-1 break-words text-gray-500">{payment.notes}</div>}
                        </div>
                        <strong className="whitespace-nowrap">{fmt(Number(payment.amount), payment.currency)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="border-t pt-4 mb-4">
              <label className="block text-sm font-medium mb-2">Tenant Status</label>
              <select value={tenantStatus} onChange={(e) => setTenantStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="trial">Trial</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="border-t pt-4 mb-4">
              <button onClick={() => setEditDates(!editDates)} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
                <Calendar size={16} />
                {editDates ? 'Hide Date Editor' : 'Edit Subscription Period'}
              </button>
              {editDates && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                      <input type="date" value={subStart} onChange={e => setSubStart(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                      <input type="date" value={subEnd} onChange={e => setSubEnd(e.target.value)} disabled={autoEnd} className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Trial End Date (optional)</label>
                    <input type="date" value={trialEnd} onChange={e => setTrialEnd(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={autoEnd} onChange={e => { setAutoEnd(e.target.checked); if (e.target.checked) setSubEnd('') }} />
                    Auto-calculate end date from plan billing cycle
                  </label>
                  <button onClick={handleSave} disabled={changing === selected.id} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {changing === selected.id ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                    Save Subscription Period
                  </button>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium mb-2">Plan Details</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Plan</label>
                  <select value={selectedPlanId} onChange={(e) => handlePlanSelect(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tenant-specific price override</label>
                    <input type="number" min="0" step="0.01" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                    <p className="mt-1 text-xs text-gray-500">Applies to this business only. The plan catalog price stays unchanged.</p>
                  </div>
                  <div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                    <select value={customCurrency} onChange={(e) => setCustomCurrency(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="UGX">UGX</option>
                      <option value="USD">USD</option>
                      <option value="KES">KES</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Custom Billing Cycle</label>
                    <select value={customBillingCycle} onChange={(e) => setCustomBillingCycle(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Monthly Fee</label>
                    <input type="number" min="0" step="0.01" value={monthlyServiceFee} onChange={(e) => setMonthlyServiceFee(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Annual Fee</label>
                    <input type="number" min="0" step="0.01" value={annualServiceFee} onChange={(e) => setAnnualServiceFee(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Static IP</label>
                    <input type="number" min="0" step="0.01" value={staticIpFee} onChange={(e) => setStaticIpFee(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Grace Period (days)</label>
                    <input type="number" min="0" value={gracePeriodDays} onChange={(e) => setGracePeriodDays(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Reminder Window (days)</label>
                    <input type="number" min="0" value={reminderDaysBeforeDue} onChange={(e) => setReminderDaysBeforeDue(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Max Users</label>
                    <input type="number" min="1" value={planMaxUsers} onChange={(e) => setPlanMaxUsers(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Max Products</label>
                    <input type="number" min="1" value={planMaxProducts} onChange={(e) => setPlanMaxProducts(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <button onClick={handleSave} disabled={changing === selected.id} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {changing === selected.id ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  Save Subscription Plan
                </button>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="mt-4 w-full px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SubscriptionsPage
