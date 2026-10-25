import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Building2, Users, Home, Wallet, Search, Plus, RefreshCw, ReceiptText, FileText, Printer, X, AlertTriangle, CalendarDays } from 'lucide-react'
import { api } from '@/lib/api'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { appNotify, appConfirm } from '@/lib/appFeedback'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useFeatureAccess } from '@/services/featureAccessService'

type Owner = { id: string; name: string; phone?: string | null; email?: string | null; _count?: { properties: number } }
type Unit = { id: string; unitCode: string; unitType?: string; rentAmount: number | string; currency: string; status: string; currentBalance?: number; propertyId: string }
type Property = { id: string; name: string; address: string; city?: string | null; propertyType: string; owner?: Owner | null; units: Unit[] }
type Tenancy = { id: string; customerId?: string | null; tenantName: string; phone?: string | null; email?: string | null; nationalId?: string | null; agreementRef?: string | null; startDate: string; endDate?: string | null; dueDay: number; rentAmount: number | string; depositRequired?: number | string; depositHeld?: number | string; currency: string; status: string; balance: number; overdueBalance: number; unit: Unit & { property: Property } }
type Overview = { properties: number; managedProperties?: number; landlordClients?: number; units: number; occupied: number; vacant: number; activeTenancies: number; monthlyRentRoll: number; outstandingRent: number; arrears: number; collectedThisMonth: number | null; paymentCount: number | null; recentPayments?: any[] }
type Statement = { tenancy: Tenancy; entries: any[]; closingBalance: number }
type Report = { summary: Record<string, number>; arrears: any[]; collections: any[]; ownerPayouts?: any[] }
type PaymentAccount = { id: string; name: string; type: string; paymentMethod: string }

type PropertyTab = 'Portfolio' | 'Clients' | 'Properties' | 'Units' | 'Tenancies' | 'Collections' | 'Reports'
const tabFromRoute = (route?: string): PropertyTab => {
  if (route === 'clients') return 'Clients'
  if (route === 'my-properties' || route === 'managed-properties') return 'Properties'
  if (route === 'rental-units') return 'Units'
  if (route === 'tenancies') return 'Tenancies'
  if (route === 'rent' || route === 'collections') return 'Collections'
  if (route === 'reports') return 'Reports'
  return 'Portfolio'
}
const money = (value: number | string | undefined, currency = 'UGX') => new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0))
const today = () => new Date().toISOString().slice(0, 10)
const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export default function PropertyManagementPage() {
  const { tab: routeTab } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const landlordWorkspace = hasFeature('property_management.landlord')
  const agentWorkspace = hasFeature('property_management.agent')
  const [tab, setTab] = useState<PropertyTab>(tabFromRoute(routeTab))
  const [overview, setOverview] = useState<Overview | null>(null)
  const [owners, setOwners] = useState<Owner[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [statement, setStatement] = useState<Statement | null>(null)
  const [paymentTarget, setPaymentTarget] = useState<Tenancy | null>(null)
  const [depositTarget, setDepositTarget] = useState<Tenancy | null>(null)
  const [depositRefundTarget, setDepositRefundTarget] = useState<Tenancy | null>(null)
  const [payoutTarget, setPayoutTarget] = useState<Owner | null>(null)
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [defaultCashAccountId, setDefaultCashAccountId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<any>(null)
  const [voidTarget, setVoidTarget] = useState<any>(null)
  const [voidReason, setVoidReason] = useState('')
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const [showPropertyForm, setShowPropertyForm] = useState(false)
  const [unitProperty, setUnitProperty] = useState<Property | null>(null)
  const [showTenancyForm, setShowTenancyForm] = useState(false)
  const [selectedRenterId, setSelectedRenterId] = useState('')

  const can = (permission: string) => hasPermission(permission)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const canViewPortfolio = can('canViewPropertyPortfolio') || can('canViewPropertyManagement')
      const canViewTenancies = canViewPortfolio || can('canViewPropertyStatements')
      const [stats, ownerRows, propertyRows, tenancyRows] = await Promise.all([
        canViewPortfolio ? api.get<Overview>('/api/property-management/overview') : Promise.resolve(null),
        canViewPortfolio ? api.get<Owner[]>('/api/property-management/owners') : Promise.resolve([]),
        canViewPortfolio ? api.get<Property[]>('/api/property-management/properties') : Promise.resolve([]),
        canViewTenancies ? api.get<Tenancy[]>('/api/property-management/tenancies') : Promise.resolve([]),
      ])
      setOverview(stats); setOwners(ownerRows); setProperties(propertyRows); setTenancies(tenancyRows)
      if (['canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canRecordOwnerPayout', 'canManageRentPayment'].some(can)) { const accountPayload = await api.get<{ accounts: PaymentAccount[]; defaultCashAccountId: string | null }>('/api/property-management/payment-accounts'); setPaymentAccounts(accountPayload.accounts); setDefaultCashAccountId(accountPayload.defaultCashAccountId) }
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not load property portfolio.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    setTab(tabFromRoute(routeTab))
  }, [routeTab])
  useEffect(() => {
    const state = location.state as any
    if (state?.recordOwnerPayout && can('canRecordOwnerPayout')) {
      const owner = owners.find(row => row.id === state.recordOwnerPayout)
      if (owner) { setTab('Clients'); setPayoutTarget(owner); navigate(location.pathname, { replace: true, state: null }) }
      return
    }
    if (state?.recordRentPayment && can('canRecordRentPayment')) {
      const tenancy = tenancies.find(row => row.id === state.recordRentPayment)
      if (tenancy) { setTab('Collections'); setPaymentTarget(tenancy); navigate(location.pathname, { replace: true, state: null }) }
    }
  }, [location.state, location.pathname, owners, tenancies, navigate])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!can('canViewPropertyReports')) return
    const params = { ...(ownerFilter ? { ownerId: ownerFilter } : {}), ...(reportFrom ? { from: reportFrom } : {}), ...(reportTo ? { to: reportTo } : {}) }
    void api.get<Report>('/api/property-management/reports', { params })
      .then(setReport)
      .catch(error => appNotify(error instanceof Error ? error.message : 'Could not load property reports.'))
  }, [ownerFilter, reportFrom, reportTo, hasPermission])
  useEffect(() => {
    if (!can('canViewPropertyCollections')) return
    const params = { limit: 100, ...(ownerFilter ? { ownerId: ownerFilter } : {}), ...(reportFrom ? { from: reportFrom } : {}), ...(reportTo ? { to: reportTo } : {}) }
    void api.get<any[]>('/api/property-management/payments', { params })
      .then(setPayments)
      .catch(error => appNotify(error instanceof Error ? error.message : 'Could not load property collections.'))
  }, [ownerFilter, reportFrom, reportTo, hasPermission])
  const filteredProperties = useMemo(() => properties.filter(row => `${row.name} ${row.address} ${row.owner?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [properties, search])
  const filteredTenancies = useMemo(() => tenancies.filter(row => `${row.tenantName} ${row.phone || ''} ${row.unit.unitCode} ${row.unit.property.name}`.toLowerCase().includes(search.toLowerCase())), [tenancies, search])
  const filteredArrears = useMemo(() => (report?.arrears || []).filter(row => `${row.tenantName || ''} ${row.propertyName || ''} ${row.unitCode || ''} ${row.ownerName || ''}`.toLowerCase().includes(search.toLowerCase())), [report, search])
  const filteredCollections = useMemo(() => (report?.collections || []).filter(row => `${row.tenantName || ''} ${row.property || ''} ${row.unit || ''} ${row.owner || ''}`.toLowerCase().includes(search.toLowerCase())), [report, search])
  const filteredPayments = useMemo(() => payments.filter(row => `${row.tenancy?.tenantName || ''} ${row.tenancy?.unit?.property?.name || ''} ${row.tenancy?.unit?.unitCode || ''} ${row.tenancy?.unit?.property?.owner?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [payments, search])
  const availableUnits = properties.flatMap(property => property.units.filter(unit => unit.status === 'vacant').map(unit => ({ ...unit, propertyName: property.name })))
  const existingRenters = useMemo(() => {
    const unique = new Map<string, Tenancy>()
    for (const tenancy of tenancies) {
      if (tenancy.customerId && !unique.has(tenancy.customerId)) unique.set(tenancy.customerId, tenancy)
    }
    return [...unique.values()].sort((a, b) => a.tenantName.localeCompare(b.tenantName))
  }, [tenancies])
  const selectedRenter = existingRenters.find(row => row.customerId === selectedRenterId)

  async function createRecord(path: string, body: unknown, close: () => void) {
    setBusy(true)
    try { await api.post(path, { body }); close(); await load(); appNotify('Saved successfully.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not save record.') }
    finally { setBusy(false) }
  }
  async function createTenancy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const response = await apiFetch('/api/property-management/tenancies', { method: 'POST', body: form })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Could not create tenancy.')
      setShowTenancyForm(false)
      await load()
      appNotify('Tenancy created and linked to the customer receivables profile.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not create tenancy.') }
    finally { setBusy(false) }
  }
  async function openStatement(row: Tenancy) {
    try { setStatement(await api.get<Statement>(`/api/property-management/tenancies/${row.id}/statement`)) }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not load statement.') }
  }
  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!paymentTarget) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const account = paymentAccounts.find(row => row.id === form.get('cashAccountId'))
      if (!account) throw new Error('Choose a permitted payment account.')
      const payment = await api.post<any>(`/api/property-management/tenancies/${paymentTarget.id}/payments`, { body: { amount: Number(form.get('amount')), paymentDate: form.get('paymentDate'), paymentMethod: account.paymentMethod, cashAccountId: account.id, idempotencyKey: crypto.randomUUID(), transactionRef: form.get('transactionRef'), notes: form.get('notes') } })
      setPaymentTarget(null); await load(); await openReceipt(payment.id); appNotify('Rent payment recorded.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record payment.') }
    finally { setBusy(false) }
  }
  async function recordDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!depositTarget) return
    const form = new FormData(event.currentTarget), account = paymentAccounts.find(row => row.id === form.get('cashAccountId'))
    if (!account) { appNotify('Choose a permitted payment account.'); return }
    setBusy(true)
    try { const payment = await api.post<any>(`/api/property-management/tenancies/${depositTarget.id}/deposits`, { body: { amount: Number(form.get('amount')), paymentDate: form.get('paymentDate'), cashAccountId: account.id, paymentMethod: account.paymentMethod, idempotencyKey: crypto.randomUUID(), transactionRef: form.get('transactionRef') } }); setDepositTarget(null); await load(); await openReceipt(payment.id); appNotify('Security deposit recorded as a tenant liability.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record deposit.') }
    finally { setBusy(false) }
  }
  async function recordPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!payoutTarget) return
    const form = new FormData(event.currentTarget), account = paymentAccounts.find(row => row.id === form.get('cashAccountId'))
    if (!account) { appNotify('Choose a permitted payment account.'); return }
    setBusy(true)
    try { await api.post(`/api/property-management/owners/${payoutTarget.id}/payouts`, { body: { amount: Number(form.get('amount')), payoutDate: form.get('payoutDate'), cashAccountId: account.id, paymentMethod: account.paymentMethod, idempotencyKey: crypto.randomUUID(), reference: form.get('reference'), notes: form.get('notes') } }); setPayoutTarget(null); await load(); appNotify('Landlord payout recorded and posted to the ledger.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record landlord payout.') }
    finally { setBusy(false) }
  }
  async function refundDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!depositRefundTarget) return
    const form = new FormData(event.currentTarget), account = paymentAccounts.find(row => row.id === form.get('cashAccountId'))
    if (!account) { appNotify('Choose a permitted payment account.'); return }
    setBusy(true)
    try { await api.post(`/api/property-management/tenancies/${depositRefundTarget.id}/deposits/refund`, { body: { amount: Number(form.get('amount')), reason: form.get('reason'), cashAccountId: account.id, paymentMethod: account.paymentMethod, idempotencyKey: crypto.randomUUID() } }); setDepositRefundTarget(null); await load(); appNotify('Security deposit refund recorded and posted.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not refund deposit.') }
    finally { setBusy(false) }
  }
  async function openReceipt(id: string) {
    try { setReceipt(await api.get<any>(`/api/property-management/payments/${id}/receipt`)) }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not load receipt.') }
  }
  async function voidPayment(row: any) {
    setVoidTarget(row); setVoidReason('')
  }
  async function confirmVoidPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!voidTarget || voidReason.trim().length < 5) return
    setBusy(true)
    try { await api.post(`/api/property-management/payments/${voidTarget.id}/void`, { body: { reason: voidReason.trim() } }); setVoidTarget(null); await load(); appNotify('Payment voided; the related rent or deposit balance was reversed.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not void payment.') }
    finally { setBusy(false) }
  }
  async function endTenancy(row: Tenancy) {
    if (!(await appConfirm(`End the tenancy for ${row.tenantName}? Outstanding rent remains collectible.`))) return
    try { await api.post(`/api/property-management/tenancies/${row.id}/end`, { body: { confirmOutstanding: true } }); await load(); appNotify('Tenancy ended; rent history and outstanding balance were retained.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not end tenancy.') }
  }
  function printView(title: string, html: string) {
    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
    if (!win) { appNotify('Allow pop-ups to print this document.'); return }
    win.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font:14px Arial,sans-serif;color:#17212b;margin:36px}h1,h2{margin:0 0 8px}header{border-bottom:2px solid #136f63;padding-bottom:16px;margin-bottom:20px}.meta{color:#52616b;margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:9px;border-bottom:1px solid #d5dddf;text-align:left}th{background:#edf4f2}.amount{text-align:right}.total{font-size:20px;font-weight:bold;text-align:right;margin-top:24px}@media print{button{display:none}}</style></head><body>${html}<script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }
  const openStatementPrint = () => {
    if (!statement) return
    const tenant = statement.tenancy
    const rows = statement.entries.map(entry => `<tr><td>${new Date(entry.date).toLocaleDateString('en-GB')}</td><td>${html(entry.description)}</td><td>${html(entry.reference || '')}</td><td class="amount">${entry.debit ? money(entry.debit, tenant.currency) : ''}</td><td class="amount">${entry.credit ? money(entry.credit, tenant.currency) : ''}</td><td class="amount">${money(entry.runningBalance, tenant.currency)}</td></tr>`).join('')
    printView('Rent statement', `<header><h1>${html(tenant.unit.property.name)}</h1><div class="meta">${html(tenant.unit.property.address)}</div><h2>Tenant Statement</h2><div>${html(tenant.tenantName)} · ${html(tenant.unit.unitCode)}</div></header><table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Rent due</th><th>Payment</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Closing balance: ${money(statement.closingBalance, tenant.currency)}</div>`)
  }

  const Stat = ({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) => <div className="rounded-lg border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div><div className={`rounded-md p-2 ${tone}`}><Icon className="h-5 w-5" /></div></div></div>

  return <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">{agentWorkspace && !landlordWorkspace ? 'Property Agent Workspace' : landlordWorkspace && !agentWorkspace ? 'Landlord Workspace' : 'Property Management'}</h1><p className="mt-1 text-sm text-muted-foreground">{agentWorkspace && !landlordWorkspace ? 'Manage landlord clients, assigned properties, rent collection and client reporting.' : 'Monitor properties, occupancy, tenancy agreements and rental performance.'}</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button></div>
    {overview && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"> <Stat label="Properties" value={String(overview.properties || 0)} icon={Building2} tone="bg-emerald-50 text-emerald-700"/><Stat label="Units occupied" value={`${overview.occupied || 0} / ${overview.units || 0}`} icon={Home} tone="bg-sky-50 text-sky-700"/><Stat label="Monthly rent roll" value={money(overview.monthlyRentRoll)} icon={CalendarDays} tone="bg-indigo-50 text-indigo-700"/><Stat label="Collected this month" value={money(overview.collectedThisMonth)} icon={Wallet} tone="bg-green-50 text-green-700"/><Stat label="Outstanding rent" value={money(overview.outstandingRent)} icon={ReceiptText} tone="bg-amber-50 text-amber-700"/><Stat label="Overdue arrears" value={money(overview.arrears)} icon={AlertTriangle} tone="bg-rose-50 text-rose-700"/><Stat label="Active tenancies" value={String(overview.activeTenancies || 0)} icon={Users} tone="bg-cyan-50 text-cyan-700"/><Stat label="Vacant units" value={String(overview.vacant || 0)} icon={Home} tone="bg-slate-100 text-slate-700"/></div>}
    <div className="flex flex-wrap items-center justify-end gap-2 border-b pb-3"><label className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search property or tenant" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"/></label>{(tab === 'Reports' && can('canViewPropertyReports') || tab === 'Collections' && can('canViewPropertyCollections')) && <>{agentWorkspace && <select aria-label="Filter by landlord" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All landlord clients</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}<input aria-label="From date" type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"/><input aria-label="To date" type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"/></>}</div>
    {loading ? <div className="py-20 text-center text-muted-foreground">Loading portfolio…</div> : ['Portfolio', 'Clients', 'Properties'].includes(tab) ? <div className="space-y-6">
      {(tab === 'Portfolio' || tab === 'Clients') && <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">{agentWorkspace && !landlordWorkspace ? 'Landlord clients' : 'Owner portfolios'}</h2><p className="text-sm text-muted-foreground">Keep property ownership separate from the business that manages the property.</p></div>{can('canManagePropertyOwners') && <button onClick={() => setShowOwnerForm(true)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Plus className="h-4 w-4"/> Add owner</button>}</div>
        {owners.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{owners.map(owner => <div key={owner.id} className="rounded-lg border p-4"><div className="font-medium">{owner.name}</div><div className="mt-1 text-sm text-muted-foreground">{owner.phone || owner.email || 'Owner contact not provided'}</div><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{owner._count?.properties || 0} properties</span>{can('canRecordOwnerPayout') && <button disabled={!paymentAccounts.length} onClick={() => setPayoutTarget(owner)} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">Pay owner</button>}</div></div>)}</div>}
      </section>}
      {(tab === 'Portfolio' || tab === 'Properties') && <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">{agentWorkspace && !landlordWorkspace ? 'Managed properties' : 'My properties'}</h2><p className="text-sm text-muted-foreground">Ownership and management are recorded separately; rental income owed to a landlord remains a payable.</p></div>{can('canManageProperties') && <button onClick={() => setShowPropertyForm(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4"/> Add property</button>}</div>
        <div className="space-y-3">{filteredProperties.map(property => <article key={property.id} className="rounded-lg border"><div className="flex flex-wrap items-start justify-between gap-3 border-b p-4"><div><h3 className="font-semibold">{property.name}</h3><p className="text-sm text-muted-foreground">{property.address}{property.city ? `, ${property.city}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{property.owner?.name || 'Landlord-owned portfolio'} · {property.propertyType}</p></div>{can('canManagePropertyUnits') && <button onClick={() => setUnitProperty(property)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Plus className="h-4 w-4"/> Add unit</button>}</div>
          {property.units.length ? <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{property.units.map(unit => <div key={unit.id} className="rounded-md bg-muted/40 p-3"><div className="flex justify-between gap-2"><strong>{unit.unitCode}</strong><span className={`text-xs font-medium ${unit.status === 'occupied' ? 'text-emerald-700' : 'text-slate-500'}`}>{unit.status}</span></div><div className="mt-1 text-sm">{money(unit.rentAmount, unit.currency)} / month</div><div className="mt-1 text-xs text-muted-foreground">{unit.unitType || 'Rental unit'}{unit.currentBalance ? ` · Balance ${money(unit.currentBalance, unit.currency)}` : ''}</div></div>)}</div> : <p className="p-4 text-sm text-muted-foreground">No units yet.</p>}</article>)}</div>
      </section>}
    </div> : tab === 'Units' ? <section className="space-y-3"><div><h2 className="font-semibold">Rental units</h2><p className="text-sm text-muted-foreground">Occupancy, rent terms and current tenant balance by unit.</p></div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Property / unit</th><th className="p-3">Landlord</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3 text-right">Monthly rent</th><th className="p-3 text-right">Tenant balance</th></tr></thead><tbody>{filteredProperties.flatMap(property => property.units.map(unit => <tr key={unit.id} className="border-t"><td className="p-3">{property.name}<div className="text-xs text-muted-foreground">{unit.unitCode}</div></td><td className="p-3">{property.owner?.name || 'Own portfolio'}</td><td className="p-3">{unit.unitType || 'Rental unit'}</td><td className="p-3">{unit.status}</td><td className="p-3 text-right">{money(unit.rentAmount, unit.currency)}</td><td className="p-3 text-right">{money(unit.currentBalance, unit.currency)}</td></tr>))}</tbody></table>{!filteredProperties.some(property => property.units.length) && <p className="p-6 text-center text-sm text-muted-foreground">No rental units found.</p>}</div></section> : tab === 'Tenancies' ? <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Tenancies & agreements</h2><p className="text-sm text-muted-foreground">Monthly rent is charged to the tenant ledger automatically.</p></div>{(can('canCreateTenancies') || can('canManageTenancies')) && <button disabled={!availableUnits.length} onClick={() => setShowTenancyForm(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4"/> New tenancy</button>}</div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Tenant</th><th className="p-3">Property / unit</th><th className="p-3">Rent / due</th><th className="p-3">Agreement</th><th className="p-3">Balance</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{filteredTenancies.map(row => <tr key={row.id} className="border-t"><td className="p-3"><div className="font-medium">{row.tenantName}</div><div className="text-xs text-muted-foreground">{row.phone || row.email || 'No contact details'}</div></td><td className="p-3">{row.unit.property.name}<div className="text-xs text-muted-foreground">{row.unit.unitCode}</div></td><td className="p-3">{money(row.rentAmount, row.currency)}<div className="text-xs text-muted-foreground">Due day {row.dueDay}</div></td><td className="p-3">{row.agreementRef || '—'}<div className="text-xs text-muted-foreground">From {new Date(row.startDate).toLocaleDateString('en-GB')}</div></td><td className="p-3"><div>{money(row.balance, row.currency)}</div>{row.overdueBalance > 0 && <div className="text-xs text-rose-700">Overdue {money(row.overdueBalance, row.currency)}</div>}<div className="text-xs text-muted-foreground">Deposit held {money(row.depositHeld || 0, row.currency)}</div></td><td className="p-3">{row.status}</td><td className="p-3"><div className="flex gap-2">{can('canViewPropertyStatements') && <button onClick={() => void openStatement(row)} title="Statement" className="rounded border p-2"><FileText className="h-4 w-4"/></button>}{can('canRecordRentPayment') && row.balance > 0 && <button onClick={() => setPaymentTarget(row)} title="Record rent payment" className="rounded border p-2"><Wallet className="h-4 w-4"/></button>}{can('canRecordTenantDeposit') && Number(row.depositRequired || 0) > Number(row.depositHeld || 0) && <button onClick={() => setDepositTarget(row)} title="Collect security deposit" className="rounded border px-2 text-xs">Deposit</button>}{(can('canRefundTenantDeposit') || can('canManageRentPayment')) && Number(row.depositHeld || 0) > 0 && <button onClick={() => setDepositRefundTarget(row)} title="Refund security deposit" className="rounded border px-2 text-xs">Refund</button>}{(can('canEndTenancies') || can('canManageTenancies')) && row.status === 'active' && <button onClick={() => void endTenancy(row)} title="End tenancy" className="rounded border px-2 text-xs">End</button>}</div></td></tr>)}</tbody></table>{!filteredTenancies.length && <p className="p-8 text-center text-sm text-muted-foreground">No tenancies found.</p>}</div>
    </section> : <section className="space-y-5">{tab === 'Reports' && can('canViewPropertyReports') && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Rent charged" value={money(report?.summary.rentCharged)} icon={FileText} tone="bg-sky-50 text-sky-700"/><Stat label="Collected in period" value={money(report?.summary.collected)} icon={Wallet} tone="bg-emerald-50 text-emerald-700"/><Stat label="Period outstanding" value={money(report?.summary.periodOutstanding)} icon={ReceiptText} tone="bg-amber-50 text-amber-700"/><Stat label="Persistent arrears" value={String(report?.summary.persistentArrearsCount || 0)} icon={AlertTriangle} tone="bg-rose-50 text-rose-700"/></div>}{tab === 'Reports' && <div className="space-y-3"><h2 className="font-semibold">Rent arrears</h2>{can('canViewPropertyReports') ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[600px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Tenant / unit</th><th className="p-3">Owner</th><th className="p-3">Overdue</th><th className="p-3">Periods</th></tr></thead><tbody>{filteredArrears.map(row => <tr key={row.tenancyId} className="border-t"><td className="p-3">{row.tenantName}<div className="text-xs text-muted-foreground">{row.propertyName} · {row.unitCode}</div></td><td className="p-3">{row.ownerName}</td><td className="p-3 text-rose-700">{money(row.overdueBalance)}</td><td className="p-3">{row.overduePeriods}{row.persistentArrears && <span className="ml-2 text-xs font-medium text-rose-700">Persistent</span>}</td></tr>)}</tbody></table>{!filteredArrears.length && <p className="p-5 text-sm text-muted-foreground">No rent arrears.</p>}</div> : <p className="text-sm text-muted-foreground">You need the Property Reports permission to view arrears.</p>}</div>}
      {tab === 'Collections' && can('canViewPropertyCollections') && <div className="space-y-3"><h2 className="font-semibold">Recent collections</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[650px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Date / receipt</th><th className="p-3">Tenant / property</th><th className="p-3">Method / status</th><th className="p-3 text-right">Amount</th><th className="p-3">Actions</th></tr></thead><tbody>{filteredPayments.map(row => <tr key={row.id} className="border-t"><td className="p-3">{new Date(row.paymentDate).toLocaleDateString('en-GB')}<div className="text-xs text-muted-foreground">{row.receiptNo}</div></td><td className="p-3">{row.tenancy?.tenantName}<div className="text-xs text-muted-foreground">{row.tenancy?.unit?.property?.name} · {row.tenancy?.unit?.unitCode}</div></td><td className="p-3">{row.paymentMethod}<div className={`text-xs ${row.status === 'void' ? 'text-rose-700' : 'text-emerald-700'}`}>{row.status === 'void' ? `Voided: ${row.voidReason || ''}` : 'Posted'}</div></td><td className="p-3 text-right">{money(row.amount, row.tenancy?.currency)}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => void openReceipt(row.id)} title="Print receipt" className="rounded border p-2"><Printer className="h-4 w-4"/></button>{(can('canVoidRentPayment') || can('canManageRentPayment')) && row.status === 'posted' && <button onClick={() => void voidPayment(row)} className="rounded border px-2 text-xs text-rose-700">Void</button>}</div></td></tr>)}</tbody></table>{!filteredPayments.length && <p className="p-5 text-sm text-muted-foreground">No payments recorded yet.</p>}</div></div>}
    </section>}

    {showOwnerForm && <Modal title="Add landlord / owner" onClose={() => setShowOwnerForm(false)}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void createRecord('/api/property-management/owners', { name: f.get('name'), phone: f.get('phone'), email: f.get('email'), address: f.get('address') }, () => setShowOwnerForm(false)) }}><Fields fields={['name','phone','email','address']}/><Submit busy={busy}/></form></Modal>}
    {showPropertyForm && <Modal title="Add property" onClose={() => setShowPropertyForm(false)}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void createRecord('/api/property-management/properties', { name: f.get('name'), address: f.get('address'), city: f.get('city'), propertyType: f.get('propertyType'), ownerId: f.get('ownerId') || null }, () => setShowPropertyForm(false)) }}><Fields fields={['name','address','city']}/><label className="mb-3 block text-sm">Type<select name="propertyType" className="mt-1 w-full rounded-md border bg-background p-2"><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="mixed_use">Mixed use</option><option value="industrial">Industrial</option><option value="other">Other</option></select></label><label className="mb-3 block text-sm">Owner portfolio<select name="ownerId" className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Landlord's own portfolio</option>{owners.map(owner => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label><Submit busy={busy}/></form></Modal>}
    {unitProperty && <Modal title={`Add unit · ${unitProperty.name}`} onClose={() => setUnitProperty(null)}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void createRecord(`/api/property-management/properties/${unitProperty.id}/units`, { unitCode: f.get('unitCode'), unitType: f.get('unitType'), rentAmount: f.get('rentAmount') }, () => setUnitProperty(null)) }}><Fields fields={['unitCode','unitType','rentAmount']}/><p className="mt-2 text-xs text-muted-foreground">Currency follows this business’s currency setting.</p><Submit busy={busy}/></form></Modal>}
    {showTenancyForm && <Modal title="Start tenancy agreement" onClose={() => { setShowTenancyForm(false); setSelectedRenterId('') }}><form onSubmit={createTenancy} encType="multipart/form-data"><label className="mb-3 block text-sm">Vacant unit<select name="unitId" required className="mt-1 w-full rounded-md border bg-background p-2">{availableUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.propertyName} · {unit.unitCode} ({money(unit.rentAmount, unit.currency)})</option>)}</select></label><label className="mb-3 block text-sm">Tenant profile<select value={selectedRenterId} onChange={event => setSelectedRenterId(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Create a new tenant</option>{existingRenters.map(renter => <option key={renter.customerId} value={renter.customerId!}>{renter.tenantName}{renter.phone ? ` · ${renter.phone}` : ''}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">Select an existing tenant to link another rental unit to the same customer profile.</span></label>{selectedRenter && <input type="hidden" name="customerId" value={selectedRenter.customerId!} />}<div key={selectedRenterId || 'new-renter'}><Fields fields={['tenantName','phone','email','nationalId','agreementRef','startDate','dueDay','rentAmount','depositRequired','depositHeld']} defaults={{ tenantName: selectedRenter?.tenantName || '', phone: selectedRenter?.phone || '', email: selectedRenter?.email || '', nationalId: selectedRenter?.nationalId || '', startDate: today(), dueDay: '1', depositRequired: '0', depositHeld: '0' }} readOnly={selectedRenter ? ['tenantName','phone','email','nationalId'] : []}/></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[['profilePhoto','Profile photo'],['nationalIdFront','National ID · front'],['nationalIdBack','National ID · back']].map(([name,label]) => <label key={name} className="block text-sm">{label}<input name={name} type="file" accept="image/*" className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1.5" /></label>)}</div><p className="mt-2 text-xs text-muted-foreground">Image files only, up to 5 MB each. ID images are visible only to staff with the identity-document permission.</p><Submit busy={busy}/></form></Modal>}
    {paymentTarget && <Modal title={`Record rent · ${paymentTarget.tenantName}`} onClose={() => setPaymentTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Outstanding: {money(paymentTarget.balance, paymentTarget.currency)}. Payments are allocated oldest due rent first; overpayments are rejected.</p><form onSubmit={recordPayment}><Fields fields={['amount','paymentDate','transactionRef','notes']} defaults={{ paymentDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record payment"/></form></Modal>}
    {depositTarget && <Modal title={`Collect security deposit · ${depositTarget.tenantName}`} onClose={() => setDepositTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Remaining deposit due: {money(Number(depositTarget.depositRequired || 0) - Number(depositTarget.depositHeld || 0), depositTarget.currency)}. Deposits are recorded as liabilities, not rent income.</p><form onSubmit={recordDeposit}><Fields fields={['amount','paymentDate','transactionRef']} defaults={{ amount: String(Math.max(0, Number(depositTarget.depositRequired || 0) - Number(depositTarget.depositHeld || 0))), paymentDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record deposit"/></form></Modal>}
    {depositRefundTarget && <Modal title={`Refund security deposit · ${depositRefundTarget.tenantName}`} onClose={() => setDepositRefundTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Deposit liability remaining: {money(depositRefundTarget.depositHeld || 0, depositRefundTarget.currency)}.</p><form onSubmit={refundDeposit}><Fields fields={['amount','reason']} defaults={{ amount: String(depositRefundTarget.depositHeld || 0) }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record refund"/></form></Modal>}
    {payoutTarget && <Modal title={`Pay landlord · ${payoutTarget.name}`} onClose={() => setPayoutTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Payouts are limited to collected rent not previously paid to this owner.</p><form onSubmit={recordPayout}><Fields fields={['amount','payoutDate','reference','notes']} defaults={{ payoutDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record owner payout"/></form></Modal>}
    {voidTarget && <Modal title={`Void receipt ${voidTarget.receiptNo}`} onClose={() => setVoidTarget(null)}><form onSubmit={confirmVoidPayment}><label className="block text-sm">Reason for reversal<textarea required minLength={5} value={voidReason} onChange={event => setVoidReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"/></label><Submit busy={busy} label="Confirm reversal"/></form></Modal>}
    {statement && <Modal title="Tenant statement" wide onClose={() => setStatement(null)}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">{statement.tenancy.tenantName} · {statement.tenancy.unit.property.name} / {statement.tenancy.unit.unitCode}</div><div className="text-sm text-muted-foreground">Agreement {statement.tenancy.agreementRef || 'not specified'}</div></div><button onClick={openStatementPrint} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Printer className="h-4 w-4"/> Print statement</button></div><div className="max-h-[55vh] overflow-auto rounded border"><table className="w-full min-w-[650px] text-sm"><thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2">Ref</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2 text-right">Balance</th></tr></thead><tbody>{statement.entries.map(entry => <tr key={entry.id} className="border-t"><td className="p-2">{new Date(entry.date).toLocaleDateString('en-GB')}</td><td className="p-2">{entry.description}</td><td className="p-2">{entry.reference}</td><td className="p-2 text-right">{entry.debit ? money(entry.debit, statement.tenancy.currency) : '—'}</td><td className="p-2 text-right">{entry.credit ? money(entry.credit, statement.tenancy.currency) : '—'}</td><td className="p-2 text-right">{money(entry.runningBalance, statement.tenancy.currency)}</td></tr>)}</tbody></table></div><div className="mt-3 text-right font-semibold">Closing balance {money(statement.closingBalance, statement.tenancy.currency)}</div></Modal>}
    {receipt && <Modal title={receiptTitle(receipt.receipt.paymentType)} onClose={() => setReceipt(null)}><ReceiptView receipt={receipt} onPrint={() => { const p = receipt.receipt; const t = p.tenancy; const title = receiptTitle(p.paymentType); const movement = p.paymentType === 'deposit_refund' ? 'Amount refunded' : 'Amount received'; printView(title, `<header><h1>${html(receipt.business?.name || t.unit.property.name)}</h1><div class="meta">${html(receipt.business?.address || '')} ${html(receipt.business?.phone || '')}</div><h2>${p.status === 'void' ? `VOIDED ${title.toUpperCase()}` : html(title)}</h2></header><p><b>Receipt:</b> ${html(p.receiptNo)}</p><p><b>Tenant:</b> ${html(t.tenantName)}</p><p><b>Property / unit:</b> ${html(t.unit.property.name)} · ${html(t.unit.unitCode)}</p><p><b>Date:</b> ${new Date(p.paymentDate).toLocaleDateString('en-GB')}</p><p><b>Method / account:</b> ${html(p.paymentMethod)}${p.cashAccount?.name ? ` · ${html(p.cashAccount.name)}` : ''}${p.transactionRef ? ` · ${html(p.transactionRef)}` : ''}</p>${p.status === 'void' ? `<p><b>Voided:</b> ${html(p.voidReason || '')}</p>` : ''}<div class="total">${movement}: ${money(p.amount, t.currency)}</div><p class="meta">${p.status === 'void' ? 'This receipt has been voided and is not proof of payment.' : 'Keep this receipt for your records.'}</p>`) }}/></Modal>}
  </div>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section className={`max-h-[92vh] w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} overflow-auto rounded-lg bg-background p-5 shadow-xl`}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="rounded p-1 text-muted-foreground" aria-label="Close"><X className="h-5 w-5"/></button></div>{children}</section></div> }
function Fields({ fields, defaults = {}, readOnly = [] }: { fields: string[]; defaults?: Record<string, string>; readOnly?: string[] }) { const labels: Record<string, string> = { name: 'Name', phone: 'Phone', email: 'Email', address: 'Address', city: 'City', unitCode: 'Unit code', unitType: 'Unit type', rentAmount: 'Monthly rent', currency: 'Currency', tenantName: 'Tenant name', nationalId: 'National ID', agreementRef: 'Agreement reference', startDate: 'Start date', dueDay: 'Rent due day (1–31)', depositRequired: 'Deposit required', depositHeld: 'Deposit already held before JibuSales', amount: 'Amount', payoutDate: 'Payout date', paymentDate: 'Payment date', reference: 'Reference', transactionRef: 'Transaction reference', reason: 'Reason', notes: 'Notes' }; return <div className="grid gap-3 sm:grid-cols-2">{fields.map(field => <label key={field} className={`block text-sm ${field === 'address' || field === 'notes' || field === 'reason' ? 'sm:col-span-2' : ''}`}>{labels[field] || field}<input name={field} type={field.toLowerCase().includes('date') ? 'date' : field === 'email' ? 'email' : ['rentAmount','dueDay','depositRequired','depositHeld','amount'].includes(field) ? 'number' : 'text'} step={['rentAmount','depositRequired','depositHeld','amount'].includes(field) ? '0.01' : undefined} min={['rentAmount','dueDay','depositRequired','depositHeld','amount'].includes(field) ? '0' : undefined} required={['name','unitCode','rentAmount','tenantName','startDate','amount','reason'].includes(field)} readOnly={readOnly.includes(field)} defaultValue={defaults[field] || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3 read-only:bg-muted"/></label>)}</div> }
function PaymentAccountSelect({ accounts, defaultAccountId }: { accounts: PaymentAccount[]; defaultAccountId: string | null }) { const defaultValue = accounts.some(account => account.id === defaultAccountId) ? defaultAccountId! : accounts[0]?.id || ''; return <label className="mt-3 block text-sm">Receive/pay through<select name="cashAccountId" required defaultValue={defaultValue} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.type}</option>)}</select>{!accounts.length && <span className="mt-1 block text-xs text-rose-700">No transaction account is available under your permissions.</span>}</label> }
function Submit({ busy, label = 'Save' }: { busy: boolean; label?: string }) { return <div className="mt-5 flex justify-end"><button disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : label}</button></div> }
function receiptTitle(type?: string) { return type === 'deposit' ? 'Security deposit receipt' : type === 'deposit_refund' ? 'Security deposit refund receipt' : 'Rent payment receipt' }
function ReceiptView({ receipt, onPrint }: { receipt: any; onPrint: () => void }) { const payment = receipt.receipt; const isRefund = payment.paymentType === 'deposit_refund'; return <div><div className="rounded-md border p-4"><h3 className="font-semibold">{receipt.business?.name || payment.tenancy.unit.property.name}</h3><p className="text-sm text-muted-foreground">{receiptTitle(payment.paymentType)} · {payment.receiptNo}</p>{payment.status === 'void' && <p className="mt-2 text-sm font-semibold text-rose-700">VOIDED · {payment.voidReason}</p>}<div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div>Tenant<strong className="block">{payment.tenancy.tenantName}</strong></div><div>Unit<strong className="block">{payment.tenancy.unit.property.name} · {payment.tenancy.unit.unitCode}</strong></div><div>Date<strong className="block">{new Date(payment.paymentDate).toLocaleDateString('en-GB')}</strong></div><div>Payment method / account<strong className="block">{payment.paymentMethod}{payment.cashAccount?.name ? ` · ${payment.cashAccount.name}` : ''}</strong></div></div><div className="mt-4 border-t pt-3 text-right text-lg font-semibold">{isRefund ? 'Refunded' : 'Received'} {money(payment.amount, payment.tenancy.currency)}</div></div><button onClick={onPrint} className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"><Printer className="h-4 w-4"/> Print receipt</button></div> }
