import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Building2, Users, Home, Wallet, Search, Plus, RefreshCw, ReceiptText, FileText, Printer, X, AlertTriangle, CalendarDays, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { appNotify, appConfirm } from '@/lib/appFeedback'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useFeatureAccess } from '@/services/featureAccessService'

type Owner = { id: string; name: string; phone?: string | null; email?: string | null; _count?: { properties: number } }
type Unit = { id: string; unitCode: string; unitType?: string; areaSize?: number | string | null; areaUnit?: string | null; frontage?: number | string | null; depth?: number | string | null; dimensionUnit?: string | null; plotNumber?: string | null; blockNumber?: string | null; titleReference?: string | null; landTenure?: string | null; rentAmount: number | string; acquisitionCost?: number | string; currency: string; status: string; currentBalance?: number; propertyId: string }
type Property = { id: string; name: string; address: string; city?: string | null; propertyType: string; owner?: Owner | null; units: Unit[] }
type Tenancy = { id: string; customerId?: string | null; tenantName: string; phone?: string | null; email?: string | null; nationalId?: string | null; maritalStatus?: string | null; spouseNames?: string | null; childrenCount?: number | null; householdSize?: number | null; placeOfOrigin?: string | null; agreementRef?: string | null; agreementNotes?: string | null; startDate: string; endDate?: string | null; dueDay: number; rentAmount: number | string; depositRequired?: number | string; depositHeld?: number | string; currency: string; status: string; balance: number; overdueBalance: number; arrearsAging?: RentAging; unit: Unit & { property: Property } }
type RentAging = { notDue: number; days1To30: number; days31To60: number; days61To90: number; over90Days: number; overdueTotal: number }
type Overview = { properties: number; managedProperties?: number; landlordClients?: number; units: number; occupied: number; vacant: number; activeTenancies: number; monthlyRentRoll: number; outstandingRent: number; arrears: number; collectedThisMonth: number | null; paymentCount: number | null; recentPayments?: any[] }
type Statement = { tenancy: Tenancy; entries: any[]; closingBalance: number }
type Report = { summary: Record<string, number>; arrears: any[]; collections: any[]; ownerPayouts?: any[] }
type PaymentAccount = { id: string; name: string; type: string; paymentMethod: string }

type PropertyTab = 'Portfolio' | 'Clients' | 'Properties' | 'Units' | 'Tenancies' | 'Collections' | 'Reports' | 'Sales' | 'Purchases'
const tabFromRoute = (route?: string): PropertyTab => {
  if (route === 'clients') return 'Clients'
  if (route === 'my-properties' || route === 'managed-properties') return 'Properties'
  if (route === 'rental-units') return 'Units'
  if (route === 'tenancies') return 'Tenancies'
  if (route === 'rent' || route === 'collections') return 'Collections'
  if (route === 'reports') return 'Reports'
  if (route === 'sales' || route === 'plot-sales') return 'Sales'
  if (route === 'purchases' || route === 'plot-purchases') return 'Purchases'
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
  const [plotSales, setPlotSales] = useState<any[]>([])
  const [plotPurchases, setPlotPurchases] = useState<any[]>([])
  const [purchaseSuppliers, setPurchaseSuppliers] = useState<any[]>([])
  const [saleBuyers, setSaleBuyers] = useState<any[]>([])
  const [saleOwnerBalances, setSaleOwnerBalances] = useState<any[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [statement, setStatement] = useState<Statement | null>(null)
  const [paymentTarget, setPaymentTarget] = useState<Tenancy | null>(null)
  const [depositTarget, setDepositTarget] = useState<Tenancy | null>(null)
  const [depositRefundTarget, setDepositRefundTarget] = useState<Tenancy | null>(null)
  const [payoutTarget, setPayoutTarget] = useState<Owner | null>(null)
  const [payoutKind, setPayoutKind] = useState<'rent' | 'plot_sale'>('rent')
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
  const [editingPlot, setEditingPlot] = useState<Unit | null>(null)
  const [showTenancyForm, setShowTenancyForm] = useState(false)
  const [editingTenancy, setEditingTenancy] = useState<Tenancy | null>(null)
  const [selectedRenterId, setSelectedRenterId] = useState('')
  const [showSaleForm, setShowSaleForm] = useState(false)
  const [salePaymentTarget, setSalePaymentTarget] = useState<any>(null)
  const [salePaymentPlan, setSalePaymentPlan] = useState<'full' | 'installments'>('installments')
  const [saleCancelTarget, setSaleCancelTarget] = useState<any>(null)
  const [saleCancelReason, setSaleCancelReason] = useState('')
  const [acquisitionTarget, setAcquisitionTarget] = useState<Unit | null>(null)
  const [showPlotPurchaseForm, setShowPlotPurchaseForm] = useState(false)
  const [plotPurchasePaymentTarget, setPlotPurchasePaymentTarget] = useState<any>(null)
  const [plotPurchaseRequestKey, setPlotPurchaseRequestKey] = useState('')
  const [plotPaymentRequestKey, setPlotPaymentRequestKey] = useState('')
  const [plotSupplierId, setPlotSupplierId] = useState('')

  const can = (permission: string) => hasPermission(permission)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const canViewPortfolio = can('canViewPropertyPortfolio') || can('canViewPropertyManagement')
      const canViewPurchases = can('canViewPropertyLandPurchases')
      const canCreatePurchase = can('canCreatePropertyLandPurchase')
      const canViewProperties = canViewPortfolio || can('canViewPropertySales') || canViewPurchases || canCreatePurchase
      const canViewTenancies = canViewPortfolio || can('canViewPropertyStatements') || can('canManageTenancies')
      const results = await Promise.allSettled([
        canViewPortfolio ? api.get<Overview>('/api/property-management/overview') : Promise.resolve(null),
        canViewPortfolio ? api.get<Owner[]>('/api/property-management/owners') : Promise.resolve([]),
        canViewProperties ? api.get<Property[]>('/api/property-management/properties') : Promise.resolve([]),
        canViewTenancies ? api.get<Tenancy[]>('/api/property-management/tenancies') : Promise.resolve([]),
        can('canViewPropertySales') ? api.get<any[]>('/api/property-management/sales') : Promise.resolve([]),
        canViewPurchases ? api.get<any[]>('/api/property-management/land-purchases') : Promise.resolve([]),
        canCreatePurchase ? api.get<{ suppliers: any[] }>('/api/property-management/land-purchase-options') : Promise.resolve({ suppliers: [] }),
        can('canViewPropertySales') ? api.get<any[]>('/api/property-management/sale-buyers') : Promise.resolve([]),
        can('canRecordOwnerPayout') || can('canViewPropertySales') ? api.get<any[]>('/api/property-management/sale-payables/owners') : Promise.resolve([]),
      ])
      let hasFailedDataset = false
      const fallback = <T,>(index: number, empty: T): T => {
        const result = results[index]
        if (result.status === 'fulfilled') return result.value as T
        console.error('Property management dataset failed to load:', index, result.reason)
        hasFailedDataset = true
        return empty
      }
      setOverview(fallback(0, null)); setOwners(fallback(1, [])); setProperties(fallback(2, [])); setTenancies(fallback(3, [])); setPlotSales(fallback(4, [])); setPlotPurchases(fallback(5, [])); setPurchaseSuppliers(fallback(6, { suppliers: [] }).suppliers); setSaleBuyers(fallback(7, [])); setSaleOwnerBalances(fallback(8, []))
      if (hasFailedDataset) appNotify('Some property data could not be loaded. Other available sections are still shown; refresh after the connection is restored.')
      if (['canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canRecordOwnerPayout', 'canManageRentPayment', 'canRecordPropertySalePayment', 'canCreatePropertyLandPurchase', 'canRecordPropertyLandPurchasePayment'].some(can)) {
        try { const accountPayload = await api.get<{ accounts: PaymentAccount[]; defaultCashAccountId: string | null }>('/api/property-management/payment-accounts'); setPaymentAccounts(accountPayload.accounts); setDefaultCashAccountId(accountPayload.defaultCashAccountId) }
        catch (error) { console.error('Property payment accounts failed to load:', error); setPaymentAccounts([]); appNotify('Permitted payment accounts could not be loaded.') }
      }
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not load property portfolio.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    setTab(tabFromRoute(routeTab))
  }, [routeTab])
  useEffect(() => {
    setPlotPaymentRequestKey(plotPurchasePaymentTarget ? crypto.randomUUID() : '')
  }, [plotPurchasePaymentTarget])
  useEffect(() => {
    const state = location.state as any
    if (state?.editTenancy && can('canManageTenancies')) {
      const tenancy = tenancies.find(row => row.id === state.editTenancy)
      if (tenancy) {
        setTab('Tenancies')
        setEditingTenancy(tenancy)
        navigate(location.pathname, { replace: true, state: null })
      }
      return
    }
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
  const filteredPlotSales = useMemo(() => plotSales.filter(row => `${row.saleNo} ${row.buyer?.name || ''} ${row.property?.name || ''} ${row.unit?.unitCode || ''} ${row.owner?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [plotSales, search])
  const filteredPlotPurchases = useMemo(() => plotPurchases.filter(row => `${row.purchaseNo} ${row.supplierRef || ''} ${row.supplier?.name || ''} ${row.property?.name || ''} ${row.unit?.unitCode || ''}`.toLowerCase().includes(search.toLowerCase())), [plotPurchases, search])
  const availablePlots = properties.filter(property => property.propertyType.toLowerCase() === 'land').flatMap(property => property.units.filter(unit => ['vacant', 'available'].includes(unit.status.toLowerCase())).map(unit => ({ ...unit, propertyName: property.name, owner: property.owner })))
  const unacquiredOwnedPlots = properties.filter(property => property.propertyType.toLowerCase() === 'land' && !property.owner).flatMap(property => property.units.filter(unit => ['vacant', 'available'].includes(unit.status.toLowerCase()) && !(Number(unit.acquisitionCost) > 0)).map(unit => ({ ...unit, propertyName: property.name })))
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
  async function updateTenancy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingTenancy) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await api.put(`/api/property-management/tenancies/${editingTenancy.id}`, { body: {
        tenantName: form.get('tenantName'), phone: form.get('phone'), email: form.get('email'),
        agreementRef: form.get('agreementRef'), agreementNotes: form.get('agreementNotes'),
        dueDay: Number(form.get('dueDay')), rentAmount: Number(form.get('rentAmount')),
        depositRequired: Number(form.get('depositRequired')),
        ...(hasPermission('canManageTenantPersonalDetails') ? {
          maritalStatus: form.get('maritalStatus'), spouseNames: form.get('spouseNames'),
          childrenCount: form.get('childrenCount'), householdSize: form.get('householdSize'), placeOfOrigin: form.get('placeOfOrigin'),
        } : {}),
      } })
      setEditingTenancy(null)
      await load()
      appNotify('Tenant and tenancy details updated. Previously posted rent charges and payments were not changed.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not update tenancy details.') }
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
    try { await api.post(`/api/property-management/owners/${payoutTarget.id}/${payoutKind === 'plot_sale' ? 'sale-payouts' : 'payouts'}`, { body: { amount: Number(form.get('amount')), payoutDate: form.get('payoutDate'), cashAccountId: account.id, paymentMethod: account.paymentMethod, idempotencyKey: crypto.randomUUID(), reference: form.get('reference'), notes: form.get('notes') } }); setPayoutTarget(null); await load(); appNotify(payoutKind === 'plot_sale' ? 'Landlord sale proceeds paid and posted to the ledger.' : 'Landlord rent payout recorded and posted to the ledger.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record landlord payout.') }
    finally { setBusy(false) }
  }
  async function createPlotSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget), unit = availablePlots.find(row => row.id === form.get('unitId'))
    if (!unit) { appNotify('Choose an available land plot.'); return }
    setBusy(true)
    try {
      const result = await api.post<any>('/api/property-management/sales', { body: {
        buyerId: form.get('buyerId'), unitId: unit.id, salePrice: Number(form.get('salePrice')),
        commissionAmount: unit.owner ? Number(form.get('commissionAmount')) : 0,
        paymentPlan: form.get('paymentPlan'), installmentCount: Number(form.get('installmentCount')),
        installmentFrequency: form.get('installmentFrequency'), saleDate: form.get('saleDate'), notes: form.get('notes'),
        ...(form.get('paymentPlan') === 'full' ? { cashAccountId: form.get('cashAccountId'), paymentMethod: paymentAccounts.find(row => row.id === form.get('cashAccountId'))?.paymentMethod } : {}),
      } })
      setShowSaleForm(false); setSalePaymentPlan('installments'); await load()
      if (result.initialPaymentId) await printPlotReceipt(result.initialPaymentId)
      appNotify('Plot sale contract recorded and posted to the customer and general ledgers.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record plot sale.') }
    finally { setBusy(false) }
  }
  async function recordPlotPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!salePaymentTarget) return
    const form = new FormData(event.currentTarget), account = paymentAccounts.find(row => row.id === form.get('cashAccountId'))
    if (!account) { appNotify('Choose a permitted transaction account.'); return }
    setBusy(true)
    try {
      const payment = await api.post<any>(`/api/property-management/sales/${salePaymentTarget.id}/payments`, { body: { amount: Number(form.get('amount')), paymentDate: form.get('paymentDate'), paymentMethod: account.paymentMethod, cashAccountId: account.id, idempotencyKey: crypto.randomUUID(), transactionRef: form.get('transactionRef'), notes: form.get('notes') } })
      setSalePaymentTarget(null); await load(); await printPlotReceipt(payment.id); appNotify('Plot sale payment recorded and receipt printed.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record plot payment.') }
    finally { setBusy(false) }
  }
  async function printPlotReceipt(paymentId: string) {
    try {
      const payload = await api.get<any>(`/api/property-management/sales/${paymentId}/receipt`), payment = payload.receipt, sale = payment.sale
      printView('Plot sale payment receipt', `<header><h1>${html(payload.business?.name || 'Business')}</h1><div class="meta">${html(payload.business?.address || '')} ${html(payload.business?.phone || '')}</div><h2>Plot sale payment receipt</h2></header><p><b>Receipt:</b> ${html(payment.receiptNo)}</p><p><b>Buyer:</b> ${html(sale.buyer.name)}</p><p><b>Plot:</b> ${html(sale.property.name)} · ${html(sale.unit.unitCode)}</p><p><b>Sale reference:</b> ${html(sale.saleNo)}</p><p><b>Date:</b> ${new Date(payment.paymentDate).toLocaleDateString('en-GB')}</p><p><b>Method / account:</b> ${html(payment.paymentMethod)} · ${html(payment.cashAccount.name)}</p><div class="total">Received: ${money(payment.amount, sale.unit.currency)}</div>`)
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not print plot receipt.') }
  }
  function printPlotInvoice(sale: any) {
    const paid = Number(sale.amountPaid || 0), balance = Math.max(0, Number(sale.salePrice) - paid)
    const installments = (sale.installments || []).map((row: any) => `<tr><td>${row.sequence}</td><td>${new Date(row.dueDate).toLocaleDateString('en-GB')}</td><td>${money(row.amount, sale.unit.currency)}</td><td>${money(row.amountPaid, sale.unit.currency)}</td><td>${html(row.status)}</td></tr>`).join('')
    const parcel = [sale.unit.areaSize ? `Area ${sale.unit.areaSize} ${sale.unit.areaUnit || ''}` : '', sale.unit.frontage && sale.unit.depth ? `Dimensions ${sale.unit.frontage} × ${sale.unit.depth} ${sale.unit.dimensionUnit || ''}` : '', sale.unit.blockNumber ? `Block ${sale.unit.blockNumber}` : '', sale.unit.plotNumber ? `Plot ${sale.unit.plotNumber}` : '', sale.unit.titleReference ? `Title / parcel ${sale.unit.titleReference}` : '', sale.unit.landTenure ? `Tenure ${sale.unit.landTenure}` : ''].filter(Boolean).map(html).join(' · ')
    printView('Plot sale agreement', `<header><h1>Plot Sale Agreement / Invoice</h1><div class="meta">${html(sale.property.name)} · ${html(sale.unit.unitCode)}</div></header><p><b>Reference:</b> ${html(sale.saleNo)}</p><p><b>Buyer:</b> ${html(sale.buyer.name)}${sale.buyer.phone ? ` · ${html(sale.buyer.phone)}` : ''}</p>${parcel ? `<p><b>Parcel details:</b> ${parcel}</p>` : ''}<p><b>Ownership:</b> ${sale.saleMode === 'brokered' ? `Brokered for ${html(sale.owner?.name || '')}` : 'Business-owned land inventory'}</p><p><b>Sale date:</b> ${new Date(sale.saleDate).toLocaleDateString('en-GB')}</p><p><b>Agreed price:</b> ${money(sale.salePrice, sale.unit.currency)}${sale.saleMode === 'brokered' ? ` · Commission ${money(sale.commissionAmount, sale.unit.currency)}` : ` · Recorded cost basis ${money(sale.costBasis, sale.unit.currency)}`}</p><table><thead><tr><th>#</th><th>Due date</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead><tbody>${installments}</tbody></table><div class="total">Paid ${money(paid, sale.unit.currency)} · Balance ${money(balance, sale.unit.currency)}</div>${sale.notes ? `<p>${html(sale.notes)}</p>` : ''}`)
  }
  async function cancelPlotSale(sale: any) {
    if (!(await appConfirm(`Cancel plot sale ${sale.saleNo}? Any posted receipts will be refunded to their original transaction accounts, journals reversed, and plot availability restored.`))) return
    setSaleCancelReason(''); setSaleCancelTarget(sale)
  }
  async function confirmCancelPlotSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!saleCancelTarget || saleCancelReason.trim().length < 5) return
    setBusy(true)
    try { await api.post(`/api/property-management/sales/${saleCancelTarget.id}/cancel`, { body: { reason: saleCancelReason.trim() } }); setSaleCancelTarget(null); await load(); appNotify('Plot sale cancelled; refunds, customer balance and plot inventory were reversed.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not cancel plot sale.') }
    finally { setBusy(false) }
  }
  async function recordExistingPlotCost(unit: Unit) {
    setAcquisitionTarget(unit)
  }
  async function saveExistingPlotCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!acquisitionTarget) return
    const acquisitionCost = Number(new FormData(event.currentTarget).get('acquisitionCost'))
    if (!(acquisitionCost > 0) || !Number.isFinite(acquisitionCost)) { appNotify('Enter a cost greater than zero.'); return }
    setBusy(true)
    try { await api.put(`/api/property-management/units/${acquisitionTarget.id}/acquisition-cost`, { body: { acquisitionCost } }); setAcquisitionTarget(null); await load(); appNotify('Plot cost basis recorded in the accounting ledger.') }
    catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record plot cost.') }
    finally { setBusy(false) }
  }
  async function savePlotDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingPlot) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await api.put(`/api/property-management/units/${editingPlot.id}`, { body: {
        unitCode: form.get('unitCode'), unitType: form.get('unitType'), areaSize: Number(form.get('areaSize')), areaUnit: form.get('areaUnit'),
        frontage: form.get('frontage') || null, depth: form.get('depth') || null, dimensionUnit: form.get('dimensionUnit'),
        plotNumber: form.get('plotNumber'), blockNumber: form.get('blockNumber'), titleReference: form.get('titleReference'), landTenure: form.get('landTenure'),
      } })
      setEditingPlot(null); await load(); appNotify('Plot parcel details updated.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not update plot details.') }
    finally { setBusy(false) }
  }
  async function createPlotPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget), unit = unacquiredOwnedPlots.find(row => row.id === form.get('unitId'))
    if (!unit) { appNotify('Choose an available owned plot without an existing acquisition cost.'); return }
    const account = paymentAccounts.find(row => row.id === form.get('cashAccountId'))
    const purchasePrice = Number(form.get('purchasePrice') || 0)
    const capitalizedCosts = Number(form.get('capitalizedCosts') || 0)
    const recoverableTax = Number(form.get('recoverableTax') || 0)
    const amountPaid = Number(form.get('amountPaid') || 0)
    if (amountPaid > 0 && !account) { appNotify('Choose a permitted transaction account for the amount paid.'); return }
    setBusy(true)
    try {
      const purchase = await api.post<any>('/api/property-management/land-purchases', { body: {
        unitId: unit.id, supplierId: form.get('supplierId'), sellerName: form.get('sellerName'), sellerPhone: form.get('sellerPhone'), sellerEmail: form.get('sellerEmail'), sellerAddress: form.get('sellerAddress'), purchasePrice, capitalizedCosts, recoverableTax, amountPaid,
        purchaseDate: form.get('purchaseDate'), dueDate: form.get('dueDate') || null,
        supplierRef: form.get('supplierRef'), notes: form.get('notes'),
        idempotencyKey: plotPurchaseRequestKey || crypto.randomUUID(),
        ...(account && amountPaid > 0 ? { cashAccountId: account.id, paymentMethod: account.paymentMethod, transactionRef: form.get('transactionRef') } : {}),
      } })
      setShowPlotPurchaseForm(false); setPlotPurchaseRequestKey(''); await load()
      if (purchase.paymentId && can('canViewPropertyLandPurchases')) await printPlotPurchaseReceipt(purchase.paymentId)
      appNotify(`Plot purchase ${purchase.purchaseNo} recorded; inventory, supplier payable, cash, and general ledger updated.`)
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record plot purchase.') }
    finally { setBusy(false) }
  }
  async function recordPlotPurchasePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!plotPurchasePaymentTarget) return
    const form = new FormData(event.currentTarget), account = paymentAccounts.find(row => row.id === form.get('cashAccountId'))
    if (!account) { appNotify('Choose a permitted transaction account.'); return }
    setBusy(true)
    try {
      const payment = await api.post<any>(`/api/property-management/land-purchases/${plotPurchasePaymentTarget.id}/payments`, { body: {
        amount: Number(form.get('amount')), paymentDate: form.get('paymentDate'), paymentMethod: account.paymentMethod,
        cashAccountId: account.id, idempotencyKey: plotPaymentRequestKey || crypto.randomUUID(), transactionRef: form.get('transactionRef'), notes: form.get('notes'),
      } })
      setPlotPurchasePaymentTarget(null); setPlotPaymentRequestKey(''); await load()
      if (can('canViewPropertyLandPurchases')) await printPlotPurchaseReceipt(payment.id)
      appNotify(`Supplier payment ${payment.receiptNo} recorded against the plot invoice.`)
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not record supplier payment.') }
    finally { setBusy(false) }
  }
  async function printPlotPurchaseReceipt(paymentId: string) {
    try {
      const payload = await api.get<any>(`/api/property-management/land-purchases/payments/${paymentId}/receipt`), payment = payload.receipt, purchase = payment.purchase
    const parcel = [purchase.unit.areaSize ? `Area ${purchase.unit.areaSize} ${purchase.unit.areaUnit || ''}` : '', purchase.unit.frontage && purchase.unit.depth ? `Dimensions ${purchase.unit.frontage} × ${purchase.unit.depth} ${purchase.unit.dimensionUnit || ''}` : '', purchase.unit.blockNumber ? `Block ${purchase.unit.blockNumber}` : '', purchase.unit.plotNumber ? `Plot ${purchase.unit.plotNumber}` : '', purchase.unit.titleReference ? `Title / parcel ${purchase.unit.titleReference}` : '', purchase.unit.landTenure ? `Tenure ${purchase.unit.landTenure}` : ''].filter(Boolean).map(html).join(' · ')
    printView('Plot supplier payment receipt', `<header><h1>${html(payload.business?.name || 'Business')}</h1><div class="meta">${html(payload.business?.address || '')} ${html(payload.business?.phone || '')}</div><h2>Plot supplier payment receipt</h2></header><p><b>Receipt:</b> ${html(payment.receiptNo)}</p><p><b>Supplier:</b> ${html(payment.supplier.name)}</p><p><b>Plot:</b> ${html(purchase.property.name)} · ${html(purchase.unit.unitCode)}</p>${parcel ? `<p><b>Parcel details:</b> ${parcel}</p>` : ''}<p><b>Purchase:</b> ${html(purchase.purchaseNo)}${purchase.supplierRef ? ` · Supplier invoice ${html(purchase.supplierRef)}` : ''}</p><p><b>Date:</b> ${new Date(payment.paymentDate).toLocaleDateString('en-GB')}</p><p><b>Method / account:</b> ${html(payment.paymentMethod)} · ${html(payment.cashAccount.name)}</p><div class="total">Paid: ${money(payment.amount, purchase.unit.currency)} · Balance after payment: ${money(payment.balanceAfter, purchase.unit.currency)}</div>`)
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not print plot purchase receipt.') }
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

  if (tab === 'Purchases') return <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Plot Purchases & Supplier Payments</h1><p className="mt-1 text-sm text-muted-foreground">Record supplier invoices, acquisition costs, cash paid, outstanding balances and supplier settlements.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Refresh</button></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><label className="relative w-full sm:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search supplier, invoice, or plot" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"/></label>{can('canCreatePropertyLandPurchase') && unacquiredOwnedPlots.length > 0 && <button onClick={() => { setPlotPurchaseRequestKey(crypto.randomUUID()); setPlotSupplierId(''); setShowPlotPurchaseForm(true) }} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4"/>Record plot purchase</button>}{can('canCreatePropertyLandPurchase') && !unacquiredOwnedPlots.length && can('canManageProperties') && can('canManagePropertyUnits') && <button onClick={() => navigate('/tenant/property-management/properties')} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4"/>Add owned plot</button>}</div>
    {!unacquiredOwnedPlots.length && can('canCreatePropertyLandPurchase') && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">To record a new supplier purchase, first add an owned Land property and an available plot. The Add owned plot action opens Properties; it requires Manage Properties and Manage Property Units permissions.</p>}
    {!purchaseSuppliers.length && can('canCreatePropertyLandPurchase') && <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">No existing supplier is required. Enter the plot seller in the purchase form and JibuSales will create the Payables supplier profile automatically.</p>}
    {can('canRecordPropertyLandPurchasePayment') && !can('canViewPropertyLandPurchases') && <p className="rounded-md border p-3 text-sm text-muted-foreground">To settle an existing supplier invoice and access its receipt, this role also needs View Plot Purchases.</p>}
     {loading ? <div className="py-20 text-center text-muted-foreground">Loading plot purchases…</div> : can('canViewPropertyLandPurchases') ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Purchase / date</th><th className="p-3">Supplier / invoice</th><th className="p-3">Plot</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3">Due / status</th><th className="p-3">Actions</th></tr></thead><tbody>{filteredPlotPurchases.map(row => <tr key={row.id} className="border-t"><td className="p-3 font-medium">{row.purchaseNo}<div className="text-xs text-muted-foreground">{new Date(row.purchaseDate).toLocaleDateString('en-GB')}</div></td><td className="p-3">{row.supplier.name}<div className="text-xs text-muted-foreground">{row.supplierRef || 'No supplier invoice reference'}</div></td><td className="p-3">{row.property.name}<div className="text-xs text-muted-foreground">{row.unit.unitCode}{row.unit.areaSize ? ` · ${row.unit.areaSize} ${row.unit.areaUnit || ''}` : ''}{row.unit.plotNumber ? ` · Plot ${row.unit.plotNumber}` : ''}{row.unit.blockNumber ? ` · Block ${row.unit.blockNumber}` : ''}</div></td><td className="p-3 text-right">{money(row.total, row.unit.currency)}</td><td className="p-3 text-right">{money(row.amountPaid, row.unit.currency)}</td><td className="p-3 text-right font-semibold">{money(row.balance, row.unit.currency)}</td><td className="p-3"><span className="capitalize">{row.paymentStatus}</span><div className="text-xs text-muted-foreground">{row.dueDate ? `Due ${new Date(row.dueDate).toLocaleDateString('en-GB')}` : 'No balance due'}</div></td><td className="p-3"><div className="flex gap-2">{can('canRecordPropertyLandPurchasePayment') && row.balance > 0 && <button onClick={() => setPlotPurchasePaymentTarget(row)} className="rounded border px-2 py-1.5 text-xs">Pay supplier</button>}{row.payments?.map((payment: any) => <button key={payment.id} onClick={() => void printPlotPurchaseReceipt(payment.id)} title={`Print receipt ${payment.receiptNo}`} className="rounded border p-2"><Printer className="h-4 w-4"/></button>)}</div></td></tr>)}</tbody></table>{!filteredPlotPurchases.length && <p className="p-8 text-center text-sm text-muted-foreground">No plot purchases recorded yet.</p>}</div> : <p className="rounded-md border p-4 text-sm text-muted-foreground">You have purchase permissions, but need View Plot Purchases permission to see invoice records.</p>}
    {showPlotPurchaseForm && <Modal title="Record owned plot purchase" wide onClose={() => setShowPlotPurchaseForm(false)}>
      <form onSubmit={createPlotPurchase}>
        <label className="mb-3 block text-sm">Available owned plot<select name="unitId" required className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Select plot</option>{unacquiredOwnedPlots.map(unit => <option key={unit.id} value={unit.id}>{unit.propertyName} · {unit.unitCode}</option>)}</select></label>
        <label className="mb-3 block text-sm">Existing Payables supplier (optional)<select name="supplierId" value={plotSupplierId} onChange={event => setPlotSupplierId(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Enter seller details below; supplier profile is created/reactivated automatically</option>{purchaseSuppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.phone ? ` · ${supplier.phone}` : ''}{supplier.status === 'inactive' ? ' · inactive, will reactivate' : ''}</option>)}</select></label>
        {!plotSupplierId && <div className="mb-3 grid gap-3 rounded-md border p-3 sm:grid-cols-2"><p className="text-xs text-muted-foreground sm:col-span-2">The seller will be matched or created in Payables and activated when this purchase is saved. Blocked suppliers require administrator review.</p><label className="block text-sm">Plot seller name<input name="sellerName" required maxLength={160} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Phone<input name="sellerPhone" maxLength={40} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Email<input name="sellerEmail" type="email" maxLength={160} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Address<input name="sellerAddress" maxLength={500} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Land purchase price<input name="purchasePrice" type="number" min="0.01" step="0.01" required className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
          <label className="block text-sm">Capitalized acquisition costs<input name="capitalizedCosts" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
          <label className="block text-sm">Recoverable input tax<input name="recoverableTax" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
          <label className="block text-sm">Supplier invoice / reference<input name="supplierRef" maxLength={120} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
          <label className="block text-sm">Purchase date<input name="purchaseDate" type="date" required defaultValue={today()} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
          <label className="block text-sm">Due date (required for unpaid balance)<input name="dueDate" type="date" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
        </div>
        {can('canRecordPropertyLandPurchasePayment') && <>
          <label className="mt-3 block text-sm">Paid at purchase<input name="amountPaid" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
          <label className="mt-3 block text-sm">Payment account (required only when paying now)<select name="cashAccountId" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">No initial payment</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.type}</option>)}</select></label>
          <label className="mt-3 block text-sm">Transaction reference<input name="transactionRef" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>
        </>}
        <label className="mt-3 block text-sm">Notes<textarea name="notes" rows={3} className="mt-1 w-full rounded-md border bg-background p-3"/></label>
        <p className="mt-3 text-xs text-muted-foreground">Land price and directly attributable costs become land inventory. Recoverable tax is recorded separately. Credit purchases require active Payables accounting mappings; the supplier balance and general ledger are updated together.</p>
        <Submit busy={busy} label="Record purchase & post"/>
      </form>
    </Modal>}
    {plotPurchasePaymentTarget && <Modal title={`Pay plot supplier · ${plotPurchasePaymentTarget.purchaseNo}`} onClose={() => setPlotPurchasePaymentTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Supplier: {plotPurchasePaymentTarget.supplier.name}. Outstanding: {money(plotPurchasePaymentTarget.balance, plotPurchasePaymentTarget.unit.currency)}. Overpayment is blocked.</p><form onSubmit={recordPlotPurchasePayment}><Fields fields={['amount','paymentDate','transactionRef','notes']} defaults={{ paymentDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record payment & print receipt"/></form></Modal>}
  </div>

  return <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">{tab === 'Sales' ? 'Plot Sales & Installments' : tab === 'Purchases' ? 'Plot Purchases & Supplier Payments' : agentWorkspace && !landlordWorkspace ? 'Property Agent Workspace' : landlordWorkspace && !agentWorkspace ? 'Landlord Workspace' : 'Property Management'}</h1><p className="mt-1 text-sm text-muted-foreground">{tab === 'Sales' ? 'Sell owned land or broker landlord plots with installment schedules, buyer balances and posted receipts.' : tab === 'Purchases' ? 'Record supplier invoices, acquisition costs, cash paid, outstanding balances and supplier settlements.' : agentWorkspace && !landlordWorkspace ? 'Manage landlord clients, assigned properties, rent collection and client reporting.' : 'Monitor properties, occupancy, tenancy agreements and rental performance.'}</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button></div>
    {overview && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"> <Stat label="Properties" value={String(overview.properties || 0)} icon={Building2} tone="bg-emerald-50 text-emerald-700"/><Stat label="Units occupied" value={`${overview.occupied || 0} / ${overview.units || 0}`} icon={Home} tone="bg-sky-50 text-sky-700"/><Stat label="Monthly rent roll" value={money(overview.monthlyRentRoll)} icon={CalendarDays} tone="bg-indigo-50 text-indigo-700"/><Stat label="Collected this month" value={money(overview.collectedThisMonth)} icon={Wallet} tone="bg-green-50 text-green-700"/><Stat label="Outstanding rent" value={money(overview.outstandingRent)} icon={ReceiptText} tone="bg-amber-50 text-amber-700"/><Stat label="Overdue arrears" value={money(overview.arrears)} icon={AlertTriangle} tone="bg-rose-50 text-rose-700"/><Stat label="Active tenancies" value={String(overview.activeTenancies || 0)} icon={Users} tone="bg-cyan-50 text-cyan-700"/><Stat label="Vacant units" value={String(overview.vacant || 0)} icon={Home} tone="bg-slate-100 text-slate-700"/></div>}
    <div className="flex flex-wrap items-center justify-end gap-2 border-b pb-3"><label className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search property or tenant" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"/></label>{(tab === 'Reports' && can('canViewPropertyReports') || tab === 'Collections' && can('canViewPropertyCollections')) && <>{agentWorkspace && <select aria-label="Filter by landlord" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All landlord clients</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}<input aria-label="From date" type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"/><input aria-label="To date" type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"/></>}</div>
    {loading ? <div className="py-20 text-center text-muted-foreground">Loading portfolio…</div> : ['Portfolio', 'Clients', 'Properties'].includes(tab) ? <div className="space-y-6">
      {(tab === 'Portfolio' || tab === 'Clients') && <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">{agentWorkspace && !landlordWorkspace ? 'Landlord clients' : 'Owner portfolios'}</h2><p className="text-sm text-muted-foreground">Keep property ownership separate from the business that manages the property.</p></div>{can('canManagePropertyOwners') && <button onClick={() => setShowOwnerForm(true)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Plus className="h-4 w-4"/> Add owner</button>}</div>
        {owners.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{owners.map(owner => { const saleBalance = saleOwnerBalances.find(row => row.id === owner.id)?.balance || 0; return <div key={owner.id} className="rounded-lg border p-4"><div className="font-medium">{owner.name}</div><div className="mt-1 text-sm text-muted-foreground">{owner.phone || owner.email || 'Owner contact not provided'}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{owner._count?.properties || 0} properties{saleBalance > 0 ? ` · Sale proceeds due ${money(saleBalance)}` : ''}</span><div className="flex gap-2">{can('canRecordOwnerPayout') && <button disabled={!paymentAccounts.length} onClick={() => { setPayoutKind('rent'); setPayoutTarget(owner) }} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">Pay rent</button>}{can('canRecordOwnerPayout') && saleBalance > 0 && <button disabled={!paymentAccounts.length} onClick={() => { setPayoutKind('plot_sale'); setPayoutTarget(owner) }} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">Pay sale proceeds</button>}</div></div></div>})}</div>}
      </section>}
      {(tab === 'Portfolio' || tab === 'Properties') && <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">{agentWorkspace && !landlordWorkspace ? 'Managed properties' : 'My properties'}</h2><p className="text-sm text-muted-foreground">Ownership and management are recorded separately; rental income owed to a landlord remains a payable.</p></div>{can('canManageProperties') && <button onClick={() => setShowPropertyForm(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4"/> Add property</button>}</div>
        <div className="space-y-3">{filteredProperties.map(property => <article key={property.id} className="rounded-lg border"><div className="flex flex-wrap items-start justify-between gap-3 border-b p-4"><div><h3 className="font-semibold">{property.name}</h3><p className="text-sm text-muted-foreground">{property.address}{property.city ? `, ${property.city}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{property.owner?.name || 'Business-owned portfolio'} · {property.propertyType}</p></div>{can('canManagePropertyUnits') && <button onClick={() => setUnitProperty(property)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Plus className="h-4 w-4"/> {property.propertyType === 'land' ? 'Add plot' : 'Add unit'}</button>}</div>
          {property.units.length ? <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{property.units.map(unit => { const parcel = [unit.areaSize ? `${unit.areaSize} ${unit.areaUnit || ''}` : '', unit.frontage && unit.depth ? `${unit.frontage} × ${unit.depth} ${unit.dimensionUnit || ''}` : '', unit.blockNumber ? `Block ${unit.blockNumber}` : '', unit.plotNumber ? `Plot ${unit.plotNumber}` : '', unit.titleReference ? `Title ${unit.titleReference}` : '', unit.landTenure || ''].filter(Boolean).join(' · '); return <div key={unit.id} className="rounded-md bg-muted/40 p-3"><div className="flex justify-between gap-2"><strong>{unit.unitCode}</strong><span className={`text-xs font-medium ${unit.status === 'occupied' ? 'text-emerald-700' : 'text-slate-500'}`}>{unit.status}</span></div>{property.propertyType === 'land' ? <div className="mt-1 text-sm">{property.owner ? `Brokered for ${property.owner.name}` : `Recorded cost ${money(unit.acquisitionCost || 0, unit.currency)}`}</div> : <div className="mt-1 text-sm">{money(unit.rentAmount, unit.currency)} / month</div>}<div className="mt-1 text-xs text-muted-foreground">{unit.unitType || (property.propertyType === 'land' ? 'Plot' : 'Rental unit')}{parcel ? ` · ${parcel}` : property.propertyType === 'land' ? ' · Plot area not recorded' : ''}{unit.currentBalance ? ` · Balance ${money(unit.currentBalance, unit.currency)}` : ''}</div>{property.propertyType === 'land' && can('canManagePropertyUnits') && <button onClick={() => setEditingPlot(unit)} className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><Pencil className="h-3 w-3"/>Edit parcel details</button>}{property.propertyType === 'land' && !property.owner && !Number(unit.acquisitionCost || 0) && can('canManagePropertyLandInventory') && <button onClick={() => void recordExistingPlotCost(unit)} className="ml-2 mt-2 rounded border px-2 py-1 text-xs">Record opening cost</button>}</div>})}</div> : <p className="p-4 text-sm text-muted-foreground">No units yet.</p>}</article>)}</div>
      </section>}
    </div> : tab === 'Units' ? <section className="space-y-3"><div><h2 className="font-semibold">Rental units</h2><p className="text-sm text-muted-foreground">Occupancy, rent terms and current tenant balance by unit.</p></div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Property / unit</th><th className="p-3">Landlord</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3 text-right">Monthly rent</th><th className="p-3 text-right">Tenant balance</th></tr></thead><tbody>{filteredProperties.flatMap(property => property.units.map(unit => <tr key={unit.id} className="border-t"><td className="p-3">{property.name}<div className="text-xs text-muted-foreground">{unit.unitCode}</div></td><td className="p-3">{property.owner?.name || 'Own portfolio'}</td><td className="p-3">{unit.unitType || 'Rental unit'}</td><td className="p-3">{unit.status}</td><td className="p-3 text-right">{money(unit.rentAmount, unit.currency)}</td><td className="p-3 text-right">{money(unit.currentBalance, unit.currency)}</td></tr>))}</tbody></table>{!filteredProperties.some(property => property.units.length) && <p className="p-6 text-center text-sm text-muted-foreground">No rental units found.</p>}</div></section> : tab === 'Tenancies' ? <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Tenancies & agreements</h2><p className="text-sm text-muted-foreground">Monthly rent is charged to the tenant ledger automatically.</p></div>{(can('canCreateTenancies') || can('canManageTenancies')) && <button disabled={!availableUnits.length} onClick={() => setShowTenancyForm(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4"/> New tenancy</button>}</div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Tenant</th><th className="p-3">Property / unit</th><th className="p-3">Rent / due</th><th className="p-3">Agreement</th><th className="p-3">Balance</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{filteredTenancies.map(row => <tr key={row.id} className="border-t"><td className="p-3"><div className="font-medium">{row.tenantName}</div><div className="text-xs text-muted-foreground">{row.phone || row.email || 'No contact details'}</div></td><td className="p-3">{row.unit.property.name}<div className="text-xs text-muted-foreground">{row.unit.unitCode}</div></td><td className="p-3">{money(row.rentAmount, row.currency)}<div className="text-xs text-muted-foreground">Due day {row.dueDay}</div></td><td className="p-3">{row.agreementRef || '—'}<div className="text-xs text-muted-foreground">From {new Date(row.startDate).toLocaleDateString('en-GB')}</div></td><td className="p-3"><div>{money(row.balance, row.currency)}</div>{row.overdueBalance > 0 && <div className="text-xs text-rose-700">Overdue {money(row.overdueBalance, row.currency)}</div>}<div className="text-xs text-muted-foreground">Deposit held {money(row.depositHeld || 0, row.currency)}</div></td><td className="p-3">{row.status}</td><td className="p-3"><div className="flex gap-2">{can('canManageTenancies') && <button onClick={() => setEditingTenancy(row)} title="Edit tenant and tenancy details" aria-label="Edit tenant and tenancy details" className="rounded border p-2"><Pencil className="h-4 w-4"/></button>}{can('canViewPropertyStatements') && <button onClick={() => void openStatement(row)} title="Statement" className="rounded border p-2"><FileText className="h-4 w-4"/></button>}{can('canRecordRentPayment') && row.balance > 0 && <button onClick={() => setPaymentTarget(row)} title="Record rent payment" className="rounded border p-2"><Wallet className="h-4 w-4"/></button>}{can('canRecordTenantDeposit') && Number(row.depositRequired || 0) > Number(row.depositHeld || 0) && <button onClick={() => setDepositTarget(row)} title="Collect security deposit" className="rounded border px-2 text-xs">Deposit</button>}{(can('canRefundTenantDeposit') || can('canManageRentPayment')) && Number(row.depositHeld || 0) > 0 && <button onClick={() => setDepositRefundTarget(row)} title="Refund security deposit" className="rounded border px-2 text-xs">Refund</button>}{(can('canEndTenancies') || can('canManageTenancies')) && row.status === 'active' && <button onClick={() => void endTenancy(row)} title="End tenancy" className="rounded border px-2 text-xs">End</button>}</div></td></tr>)}</tbody></table>{!filteredTenancies.length && <p className="p-8 text-center text-sm text-muted-foreground">No tenancies found.</p>}</div>
    </section> : <section className="space-y-5">{tab === 'Sales' && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Land & plot contracts</h2><p className="text-sm text-muted-foreground">Sale contracts post to the customer ledger and accounting journal. Payments are allocated oldest installment first.</p></div>{can('canCreatePropertySale') && <button disabled={!availablePlots.length || !saleBuyers.length} onClick={() => setShowSaleForm(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4"/> New plot sale</button>}</div>{!availablePlots.length && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No available plots. Add a Land property and at least one available plot first.</p>}<div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Contract / date</th><th className="p-3">Buyer</th><th className="p-3">Plot / ownership</th><th className="p-3 text-right">Agreed</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3">Plan / status</th><th className="p-3">Actions</th></tr></thead><tbody>{filteredPlotSales.map(sale => <tr key={sale.id} className="border-t"><td className="p-3 font-medium">{sale.saleNo}<div className="text-xs text-muted-foreground">{new Date(sale.saleDate).toLocaleDateString('en-GB')}</div></td><td className="p-3">{sale.buyer.name}<div className="text-xs text-muted-foreground">{sale.buyer.phone || sale.buyer.email || 'Customer account'}</div></td><td className="p-3">{sale.property.name} · {sale.unit.unitCode}<div className="text-xs text-muted-foreground">{sale.saleMode === 'brokered' ? `Owner: ${sale.owner?.name || '—'}` : `Owned · cost ${money(sale.costBasis, sale.unit.currency)}`}</div></td><td className="p-3 text-right">{money(sale.salePrice, sale.unit.currency)}</td><td className="p-3 text-right">{money(sale.amountPaid, sale.unit.currency)}</td><td className="p-3 text-right font-semibold">{money(sale.balance, sale.unit.currency)}</td><td className="p-3">{sale.paymentPlan === 'full' ? 'Full payment' : `${sale.installmentCount} ${sale.installmentFrequency} installments`}<div className="text-xs capitalize text-muted-foreground">{sale.status}</div></td><td className="p-3"><div className="flex gap-2"><button onClick={() => printPlotInvoice(sale)} title="Print agreement / invoice" aria-label="Print agreement / invoice" className="rounded border p-2"><Printer className="h-4 w-4"/></button>{can('canRecordPropertySalePayment') && sale.status === 'active' && sale.balance > 0.01 && <button onClick={() => setSalePaymentTarget(sale)} className="rounded border px-2 py-1.5 text-xs">Record payment</button>}{sale.payments?.map((payment: any) => <button key={payment.id} onClick={() => void printPlotReceipt(payment.id)} title={`Reprint ${payment.receiptNo}`} className="rounded border p-2"><ReceiptText className="h-4 w-4"/></button>)}{can('canCancelPropertySale') && sale.status === 'active' && <button onClick={() => void cancelPlotSale(sale)} title="Cancel sale" className="rounded border px-2 py-1.5 text-xs text-rose-700">Cancel</button>}</div></td></tr>)}</tbody></table>{!filteredPlotSales.length && <p className="p-8 text-center text-sm text-muted-foreground">No plot sales have been recorded.</p>}</div></div>}{tab === 'Reports' && can('canViewPropertyReports') && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Rent charged" value={money(report?.summary.rentCharged)} icon={FileText} tone="bg-sky-50 text-sky-700"/><Stat label="Collected in period" value={money(report?.summary.collected)} icon={Wallet} tone="bg-emerald-50 text-emerald-700"/><Stat label="Period outstanding" value={money(report?.summary.periodOutstanding)} icon={ReceiptText} tone="bg-amber-50 text-amber-700"/><Stat label="Persistent arrears" value={String(report?.summary.persistentArrearsCount || 0)} icon={AlertTriangle} tone="bg-rose-50 text-rose-700"/></div>}{tab === 'Reports' && <div className="space-y-3"><h2 className="font-semibold">Rent arrears</h2>{can('canViewPropertyReports') ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[600px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Tenant / unit</th><th className="p-3">Owner</th><th className="p-3">Overdue</th><th className="p-3">Periods</th></tr></thead><tbody>{filteredArrears.map(row => <tr key={row.tenancyId} className="border-t"><td className="p-3">{row.tenantName}<div className="text-xs text-muted-foreground">{row.propertyName} · {row.unitCode}</div></td><td className="p-3">{row.ownerName}</td><td className="p-3 text-rose-700">{money(row.overdueBalance)}</td><td className="p-3">{row.overduePeriods}{row.persistentArrears && <span className="ml-2 text-xs font-medium text-rose-700">Persistent</span>}</td></tr>)}</tbody></table>{!filteredArrears.length && <p className="p-5 text-sm text-muted-foreground">No rent arrears.</p>}</div> : <p className="text-sm text-muted-foreground">You need the Property Reports permission to view arrears.</p>}</div>}
      {tab === 'Collections' && can('canViewPropertyCollections') && <div className="space-y-3"><h2 className="font-semibold">Recent collections</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[650px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Date / receipt</th><th className="p-3">Tenant / property</th><th className="p-3">Method / status</th><th className="p-3 text-right">Amount</th><th className="p-3">Actions</th></tr></thead><tbody>{filteredPayments.map(row => <tr key={row.id} className="border-t"><td className="p-3">{new Date(row.paymentDate).toLocaleDateString('en-GB')}<div className="text-xs text-muted-foreground">{row.receiptNo}</div></td><td className="p-3">{row.tenancy?.tenantName}<div className="text-xs text-muted-foreground">{row.tenancy?.unit?.property?.name} · {row.tenancy?.unit?.unitCode}</div></td><td className="p-3">{row.paymentMethod}<div className={`text-xs ${row.status === 'void' ? 'text-rose-700' : 'text-emerald-700'}`}>{row.status === 'void' ? `Voided: ${row.voidReason || ''}` : 'Posted'}</div></td><td className="p-3 text-right">{money(row.amount, row.tenancy?.currency)}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => void openReceipt(row.id)} title="Print receipt" className="rounded border p-2"><Printer className="h-4 w-4"/></button>{(can('canVoidRentPayment') || can('canManageRentPayment')) && row.status === 'posted' && <button onClick={() => void voidPayment(row)} className="rounded border px-2 text-xs text-rose-700">Void</button>}</div></td></tr>)}</tbody></table>{!filteredPayments.length && <p className="p-5 text-sm text-muted-foreground">No payments recorded yet.</p>}</div></div>}
    </section>}

    {showOwnerForm && <Modal title="Add landlord / owner" onClose={() => setShowOwnerForm(false)}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void createRecord('/api/property-management/owners', { name: f.get('name'), phone: f.get('phone'), email: f.get('email'), address: f.get('address') }, () => setShowOwnerForm(false)) }}><Fields fields={['name','phone','email','address']}/><Submit busy={busy}/></form></Modal>}
    {showPropertyForm && <Modal title="Add property" onClose={() => setShowPropertyForm(false)}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void createRecord('/api/property-management/properties', { name: f.get('name'), address: f.get('address'), city: f.get('city'), propertyType: f.get('propertyType'), ownerId: f.get('ownerId') || null }, () => setShowPropertyForm(false)) }}><Fields fields={['name','address','city']}/><label className="mb-3 block text-sm">Type<select name="propertyType" className="mt-1 w-full rounded-md border bg-background p-2"><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="mixed_use">Mixed use</option><option value="industrial">Industrial</option><option value="land">Land / plots</option><option value="other">Other</option></select></label><label className="mb-3 block text-sm">Owner portfolio<select name="ownerId" className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Business-owned portfolio</option>{owners.map(owner => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">Choose an owner for brokered listings. Leave blank for land owned by this business.</span></label><Submit busy={busy}/></form></Modal>}
    {unitProperty && <Modal title={`${unitProperty.propertyType === 'land' ? 'Add plot' : 'Add unit'} · ${unitProperty.name}`} onClose={() => setUnitProperty(null)}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const body: Record<string, FormDataEntryValue | number> = { unitCode: f.get('unitCode') || '', unitType: f.get('unitType') || '', rentAmount: unitProperty.propertyType === 'land' ? 0 : Number(f.get('rentAmount') || 0) }; if (unitProperty.propertyType === 'land') Object.assign(body, { areaSize: f.get('areaSize'), areaUnit: f.get('areaUnit'), frontage: f.get('frontage'), depth: f.get('depth'), dimensionUnit: f.get('dimensionUnit'), plotNumber: f.get('plotNumber'), blockNumber: f.get('blockNumber'), titleReference: f.get('titleReference'), landTenure: f.get('landTenure') }); void createRecord(`/api/property-management/properties/${unitProperty.id}/units`, body, () => setUnitProperty(null)) }}>
      {unitProperty.propertyType === 'land' ? <><Fields fields={['unitCode','unitType']}/><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-sm">Plot area<input name="areaSize" type="number" min="0.0001" step="any" required className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Area unit<select name="areaUnit" required defaultValue="acre" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="acre">Acres</option><option value="hectare">Hectares</option><option value="sqm">Square metres</option><option value="sqft">Square feet</option></select></label><label className="block text-sm">Frontage (optional)<input name="frontage" type="number" min="0.0001" step="any" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Depth (optional)<input name="depth" type="number" min="0.0001" step="any" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Dimension unit<select name="dimensionUnit" defaultValue="ft" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="ft">Feet</option><option value="m">Metres</option></select></label><label className="block text-sm">Block number<input name="blockNumber" maxLength={80} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Plot number<input name="plotNumber" maxLength={80} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Title / parcel reference<input name="titleReference" maxLength={120} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Land tenure<select name="landTenure" defaultValue="" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Not specified</option><option value="freehold">Freehold</option><option value="leasehold">Leasehold</option><option value="mailo">Mailo</option><option value="customary">Customary</option><option value="other">Other</option></select></label></div></> : <Fields fields={['unitCode','unitType','rentAmount']}/>}
      {unitProperty.propertyType === 'land' && unitProperty.owner && <p className="mt-2 text-sm text-muted-foreground">Brokered plots are listed for the owner; they do not add to this business’s land inventory.</p>}<p className="mt-2 text-xs text-muted-foreground">For a newly acquired business-owned plot, add its parcel details here, then record the supplier invoice under Plot Purchases. Opening cost is only for land already held when migrating into JibuSales.</p><Submit busy={busy}/></form></Modal>}
    {editingPlot && <Modal title={`Edit plot details · ${editingPlot.unitCode}`} onClose={() => setEditingPlot(null)}><form onSubmit={savePlotDetails}><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Plot / unit code<input name="unitCode" required defaultValue={editingPlot.unitCode} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Plot description<input name="unitType" defaultValue={editingPlot.unitType || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Plot area<input name="areaSize" type="number" min="0.0001" step="any" required defaultValue={editingPlot.areaSize || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Area unit<select name="areaUnit" required defaultValue={editingPlot.areaUnit || 'acre'} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="acre">Acres</option><option value="hectare">Hectares</option><option value="sqm">Square metres</option><option value="sqft">Square feet</option></select></label><label className="block text-sm">Frontage<input name="frontage" type="number" min="0.0001" step="any" defaultValue={editingPlot.frontage || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Depth<input name="depth" type="number" min="0.0001" step="any" defaultValue={editingPlot.depth || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Dimension unit<select name="dimensionUnit" defaultValue={editingPlot.dimensionUnit || 'ft'} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="ft">Feet</option><option value="m">Metres</option></select></label><label className="block text-sm">Block number<input name="blockNumber" defaultValue={editingPlot.blockNumber || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Plot number<input name="plotNumber" defaultValue={editingPlot.plotNumber || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Title / parcel reference<input name="titleReference" defaultValue={editingPlot.titleReference || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="block text-sm">Land tenure<select name="landTenure" defaultValue={editingPlot.landTenure || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Not specified</option><option value="freehold">Freehold</option><option value="leasehold">Leasehold</option><option value="mailo">Mailo</option><option value="customary">Customary</option><option value="other">Other</option></select></label></div><Submit busy={busy} label="Save plot details"/></form></Modal>}
    {showSaleForm && <Modal title="Create plot sale" wide onClose={() => { setShowSaleForm(false); setSalePaymentPlan('installments') }}><form onSubmit={createPlotSale}><label className="mb-3 block text-sm">Buyer / customer<select name="buyerId" required className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Select customer</option>{saleBuyers.map(buyer => <option key={buyer.id} value={buyer.id}>{buyer.name}{buyer.phone ? ` · ${buyer.phone}` : ''} · available credit {money(Math.max(0, Number(buyer.creditLimit || 0) - Number(buyer.balance || 0)))}</option>)}</select></label><label className="mb-3 block text-sm">Available plot<select name="unitId" required className="mt-1 h-10 w-full rounded-md border bg-background px-3">{availablePlots.map(unit => <option key={unit.id} value={unit.id}>{unit.propertyName} · {unit.unitCode}{unit.areaSize ? ` · ${unit.areaSize} ${unit.areaUnit || ''}` : ''}{unit.plotNumber ? ` · Plot ${unit.plotNumber}` : ''}{unit.owner ? ` · Brokered for ${unit.owner.name}` : ` · Owned · cost ${money(unit.acquisitionCost || 0, unit.currency)}`}</option>)}</select></label><Fields fields={['salePrice','saleDate']} defaults={{ saleDate: today() }}/><label className="mt-3 block text-sm">Broker commission (used only for a landlord-owned plot)<input name="commissionAmount" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="block text-sm">Payment plan<select name="paymentPlan" value={salePaymentPlan} onChange={event => setSalePaymentPlan(event.target.value as 'full' | 'installments')} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="installments">Installments</option>{can('canRecordPropertySalePayment') && <option value="full">Full payment now</option>}</select></label><label className="block text-sm">Number of installments<input name="installmentCount" type="number" min="1" max="120" defaultValue="1" disabled={salePaymentPlan === 'full'} className="mt-1 h-10 w-full rounded-md border bg-background px-3 disabled:bg-muted"/></label><label className="block text-sm">Frequency<select name="installmentFrequency" disabled={salePaymentPlan === 'full'} className="mt-1 h-10 w-full rounded-md border bg-background px-3 disabled:bg-muted"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option></select></label></div>{salePaymentPlan === 'full' && <PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/>}<label className="mt-3 block text-sm">Contract notes<textarea name="notes" rows={3} className="mt-1 w-full rounded-md border bg-background p-3"/></label><p className="mt-3 text-xs text-muted-foreground">Installment sales require sufficient customer credit. Full payment posts the cash receipt in the same transaction as the sale.</p><Submit busy={busy} label={salePaymentPlan === 'full' ? 'Record fully paid sale' : 'Record installment sale'}/></form></Modal>}
    {salePaymentTarget && <Modal title={`Plot installment · ${salePaymentTarget.saleNo}`} onClose={() => setSalePaymentTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Buyer: {salePaymentTarget.buyer.name}. Remaining balance: {money(salePaymentTarget.balance, salePaymentTarget.unit.currency)}. Overpayments are rejected.</p><form onSubmit={recordPlotPayment}><Fields fields={['amount','paymentDate','transactionRef','notes']} defaults={{ paymentDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record payment & print receipt"/></form></Modal>}
    {saleCancelTarget && <Modal title={`Cancel plot sale · ${saleCancelTarget.saleNo}`} onClose={() => setSaleCancelTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Any posted payments will be refunded from the original transaction accounts. The reversal will fail atomically if an account lacks funds or you lack access.</p><form onSubmit={confirmCancelPlotSale}><label className="block text-sm">Cancellation reason<textarea required minLength={5} value={saleCancelReason} onChange={event => setSaleCancelReason(event.target.value)} rows={4} className="mt-1 w-full rounded-md border bg-background p-3"/></label><Submit busy={busy} label="Refund & cancel sale"/></form></Modal>}
    {acquisitionTarget && <Modal title={`Record opening cost · ${acquisitionTarget.unitCode}`} onClose={() => setAcquisitionTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Use only for an owned plot held before JibuSales migration when supplier purchase history is not being entered. It posts debit Land Inventory and credit Land Inventory Opening Equity. For a new purchase, use Plot Purchases instead.</p><form onSubmit={saveExistingPlotCost}><label className="block text-sm">Opening cost basis<input name="acquisitionCost" type="number" min="0.01" step="0.01" required className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><Submit busy={busy} label="Post opening cost basis"/></form></Modal>}
    {editingTenancy && <Modal title={`Edit tenant · ${editingTenancy.unit.property.name} / ${editingTenancy.unit.unitCode}`} onClose={() => setEditingTenancy(null)}><form onSubmit={updateTenancy}><Fields fields={['tenantName','phone','email','agreementRef','dueDay','rentAmount','depositRequired']} defaults={{ tenantName: editingTenancy.tenantName, phone: editingTenancy.phone || '', email: editingTenancy.email || '', agreementRef: editingTenancy.agreementRef || '', dueDay: String(editingTenancy.dueDay), rentAmount: String(editingTenancy.rentAmount), depositRequired: String(editingTenancy.depositRequired || 0) }}/>{hasPermission('canManageTenantPersonalDetails') && <HouseholdDetailsFields defaults={editingTenancy}/>}<label className="mt-3 block text-sm">Agreement notes<textarea name="agreementNotes" defaultValue={editingTenancy.agreementNotes || ''} rows={3} className="mt-1 w-full rounded-md border bg-background p-3"/></label><p className="mt-3 text-xs text-muted-foreground">Changing monthly rent affects future charges only. Existing rent charges, receipts and deposit transactions remain unchanged.</p><Submit busy={busy} label="Save tenancy details"/></form></Modal>}
    {showTenancyForm && <Modal title="Start tenancy agreement" onClose={() => { setShowTenancyForm(false); setSelectedRenterId('') }}><form onSubmit={createTenancy} encType="multipart/form-data"><label className="mb-3 block text-sm">Vacant unit<select name="unitId" required className="mt-1 w-full rounded-md border bg-background p-2">{availableUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.propertyName} · {unit.unitCode} ({money(unit.rentAmount, unit.currency)})</option>)}</select></label><label className="mb-3 block text-sm">Tenant profile<select value={selectedRenterId} onChange={event => setSelectedRenterId(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Create a new tenant</option>{existingRenters.map(renter => <option key={renter.customerId} value={renter.customerId!}>{renter.tenantName}{renter.phone ? ` · ${renter.phone}` : ''}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">Select an existing tenant to link another rental unit to the same customer profile.</span></label>{selectedRenter && <input type="hidden" name="customerId" value={selectedRenter.customerId!} />}<div key={selectedRenterId || 'new-renter'}><Fields fields={['tenantName','phone','email','nationalId','agreementRef','startDate','dueDay','rentAmount','depositRequired','depositHeld']} defaults={{ tenantName: selectedRenter?.tenantName || '', phone: selectedRenter?.phone || '', email: selectedRenter?.email || '', nationalId: selectedRenter?.nationalId || '', startDate: today(), dueDay: '1', depositRequired: '0', depositHeld: '0' }} readOnly={selectedRenter ? ['tenantName','phone','email','nationalId'] : []}/>{hasPermission('canManageTenantPersonalDetails') && <HouseholdDetailsFields defaults={selectedRenter}/>}</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[['profilePhoto','Profile photo'],['nationalIdFront','National ID · front'],['nationalIdBack','National ID · back']].map(([name,label]) => <label key={name} className="block text-sm">{label}<input name={name} type="file" accept="image/*" className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1.5" /></label>)}</div><p className="mt-2 text-xs text-muted-foreground">Image files only, up to 5 MB each. ID images are visible only to staff with the identity-document permission.</p><Submit busy={busy}/></form></Modal>}
    {paymentTarget && <Modal title={`Record rent · ${paymentTarget.tenantName}`} onClose={() => setPaymentTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Outstanding: {money(paymentTarget.balance, paymentTarget.currency)}. Payments are allocated oldest due rent first; overpayments are rejected.</p><form onSubmit={recordPayment}><Fields fields={['amount','paymentDate','transactionRef','notes']} defaults={{ paymentDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record payment"/></form></Modal>}
    {depositTarget && <Modal title={`Collect security deposit · ${depositTarget.tenantName}`} onClose={() => setDepositTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Remaining deposit due: {money(Number(depositTarget.depositRequired || 0) - Number(depositTarget.depositHeld || 0), depositTarget.currency)}. Deposits are recorded as liabilities, not rent income.</p><form onSubmit={recordDeposit}><Fields fields={['amount','paymentDate','transactionRef']} defaults={{ amount: String(Math.max(0, Number(depositTarget.depositRequired || 0) - Number(depositTarget.depositHeld || 0))), paymentDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record deposit"/></form></Modal>}
    {depositRefundTarget && <Modal title={`Refund security deposit · ${depositRefundTarget.tenantName}`} onClose={() => setDepositRefundTarget(null)}><p className="mb-3 text-sm text-muted-foreground">Deposit liability remaining: {money(depositRefundTarget.depositHeld || 0, depositRefundTarget.currency)}.</p><form onSubmit={refundDeposit}><Fields fields={['amount','reason']} defaults={{ amount: String(depositRefundTarget.depositHeld || 0) }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label="Record refund"/></form></Modal>}
    {payoutTarget && <Modal title={`${payoutKind === 'plot_sale' ? 'Pay plot sale proceeds' : 'Pay landlord rent'} · ${payoutTarget.name}`} onClose={() => setPayoutTarget(null)}><p className="mb-3 text-sm text-muted-foreground">{payoutKind === 'plot_sale' ? 'This settles net proceeds owed from active brokered plot contracts and posts against the separate sale-proceeds payable.' : 'Payouts are limited to collected rent not previously paid to this owner.'}</p><form onSubmit={recordPayout}><Fields fields={['amount','payoutDate','reference','notes']} defaults={{ payoutDate: today() }}/><PaymentAccountSelect accounts={paymentAccounts} defaultAccountId={defaultCashAccountId}/><Submit busy={busy} label={payoutKind === 'plot_sale' ? 'Record sale proceeds payout' : 'Record owner payout'}/></form></Modal>}
    {voidTarget && <Modal title={`Void receipt ${voidTarget.receiptNo}`} onClose={() => setVoidTarget(null)}><form onSubmit={confirmVoidPayment}><label className="block text-sm">Reason for reversal<textarea required minLength={5} value={voidReason} onChange={event => setVoidReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"/></label><Submit busy={busy} label="Confirm reversal"/></form></Modal>}
    {statement && <Modal title="Tenant statement" wide onClose={() => setStatement(null)}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">{statement.tenancy.tenantName} · {statement.tenancy.unit.property.name} / {statement.tenancy.unit.unitCode}</div><div className="text-sm text-muted-foreground">Agreement {statement.tenancy.agreementRef || 'not specified'}</div></div><button onClick={openStatementPrint} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Printer className="h-4 w-4"/> Print statement</button></div><div className="max-h-[55vh] overflow-auto rounded border"><table className="w-full min-w-[650px] text-sm"><thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2">Ref</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2 text-right">Balance</th></tr></thead><tbody>{statement.entries.map(entry => <tr key={entry.id} className="border-t"><td className="p-2">{new Date(entry.date).toLocaleDateString('en-GB')}</td><td className="p-2">{entry.description}</td><td className="p-2">{entry.reference}</td><td className="p-2 text-right">{entry.debit ? money(entry.debit, statement.tenancy.currency) : '—'}</td><td className="p-2 text-right">{entry.credit ? money(entry.credit, statement.tenancy.currency) : '—'}</td><td className="p-2 text-right">{money(entry.runningBalance, statement.tenancy.currency)}</td></tr>)}</tbody></table></div><div className="mt-3 text-right font-semibold">Closing balance {money(statement.closingBalance, statement.tenancy.currency)}</div></Modal>}
    {receipt && <Modal title={receiptTitle(receipt.receipt.paymentType)} onClose={() => setReceipt(null)}><ReceiptView receipt={receipt} onPrint={() => { const p = receipt.receipt; const t = p.tenancy; const title = receiptTitle(p.paymentType); const movement = p.paymentType === 'deposit_refund' ? 'Amount refunded' : 'Amount received'; printView(title, `<header><h1>${html(receipt.business?.name || t.unit.property.name)}</h1><div class="meta">${html(receipt.business?.address || '')} ${html(receipt.business?.phone || '')}</div><h2>${p.status === 'void' ? `VOIDED ${title.toUpperCase()}` : html(title)}</h2></header><p><b>Receipt:</b> ${html(p.receiptNo)}</p><p><b>Tenant:</b> ${html(t.tenantName)}</p><p><b>Property / unit:</b> ${html(t.unit.property.name)} · ${html(t.unit.unitCode)}</p><p><b>Date:</b> ${new Date(p.paymentDate).toLocaleDateString('en-GB')}</p><p><b>Method / account:</b> ${html(p.paymentMethod)}${p.cashAccount?.name ? ` · ${html(p.cashAccount.name)}` : ''}${p.transactionRef ? ` · ${html(p.transactionRef)}` : ''}</p>${p.status === 'void' ? `<p><b>Voided:</b> ${html(p.voidReason || '')}</p>` : ''}<div class="total">${movement}: ${money(p.amount, t.currency)}</div><p class="meta">${p.status === 'void' ? 'This receipt has been voided and is not proof of payment.' : 'Keep this receipt for your records.'}</p>`) }}/></Modal>}
  </div>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section className={`max-h-[92vh] w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} overflow-auto rounded-lg bg-background p-5 shadow-xl`}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="rounded p-1 text-muted-foreground" aria-label="Close"><X className="h-5 w-5"/></button></div>{children}</section></div> }
function Fields({ fields, defaults = {}, readOnly = [] }: { fields: string[]; defaults?: Record<string, string>; readOnly?: string[] }) { const labels: Record<string, string> = { name: 'Name', phone: 'Phone', email: 'Email', address: 'Address', city: 'City', unitCode: 'Plot / unit code', unitType: 'Unit type / land reference', rentAmount: 'Monthly rent', acquisitionCost: 'Plot acquisition cost', salePrice: 'Agreed sale price', saleDate: 'Sale date', currency: 'Currency', tenantName: 'Tenant name', nationalId: 'National ID', agreementRef: 'Agreement reference', startDate: 'Start date', dueDay: 'Rent due day (1–31)', depositRequired: 'Deposit required', depositHeld: 'Deposit already held before JibuSales', amount: 'Amount', payoutDate: 'Payout date', paymentDate: 'Payment date', reference: 'Reference', transactionRef: 'Transaction reference', reason: 'Reason', notes: 'Notes' }; return <div className="grid gap-3 sm:grid-cols-2">{fields.map(field => <label key={field} className={`block text-sm ${['address','notes','reason'].includes(field) ? 'sm:col-span-2' : ''}`}>{labels[field] || field}<input name={field} type={field.toLowerCase().includes('date') ? 'date' : field === 'email' ? 'email' : ['rentAmount','acquisitionCost','salePrice','dueDay','depositRequired','depositHeld','amount'].includes(field) ? 'number' : 'text'} step={['rentAmount','acquisitionCost','salePrice','depositRequired','depositHeld','amount'].includes(field) ? '0.01' : undefined} min={['rentAmount','acquisitionCost','salePrice','dueDay','depositRequired','depositHeld','amount'].includes(field) ? '0' : undefined} required={['name','unitCode','rentAmount','acquisitionCost','salePrice','saleDate','tenantName','startDate','amount','reason'].includes(field)} readOnly={readOnly.includes(field)} defaultValue={defaults[field] || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3 read-only:bg-muted"/></label>)}</div> }
function HouseholdDetailsFields({ defaults = {} }: { defaults?: Partial<Tenancy> }) { return <section className="mt-4 space-y-3 rounded-md border p-4"><div><h3 className="text-sm font-semibold">Household details</h3><p className="mt-1 text-xs text-muted-foreground">Optional and restricted to staff with renter household-detail access.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Marital status<select name="maritalStatus" defaultValue={defaults.maritalStatus || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Not provided</option><option value="single">Single</option><option value="married">Married</option><option value="separated">Separated</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label className="block text-sm">Spouse name(s)<input name="spouseNames" defaultValue={defaults.spouseNames || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label><label className="block text-sm">Number of children<input name="childrenCount" type="number" min="0" max="100" step="1" defaultValue={defaults.childrenCount ?? ''} placeholder="Not provided" className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label><label className="block text-sm">Household / family size<input name="householdSize" type="number" min="1" max="100" step="1" defaultValue={defaults.householdSize ?? ''} placeholder="Not provided" className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label><label className="block text-sm sm:col-span-2">Place of origin<input name="placeOfOrigin" defaultValue={defaults.placeOfOrigin || ''} placeholder="Town, district, region or country" className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label></div></section> }
function PaymentAccountSelect({ accounts, defaultAccountId }: { accounts: PaymentAccount[]; defaultAccountId: string | null }) { const defaultValue = accounts.some(account => account.id === defaultAccountId) ? defaultAccountId! : accounts[0]?.id || ''; return <label className="mt-3 block text-sm">Receive/pay through<select name="cashAccountId" required defaultValue={defaultValue} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.type}</option>)}</select>{!accounts.length && <span className="mt-1 block text-xs text-rose-700">No transaction account is available under your permissions.</span>}</label> }
function Submit({ busy, label = 'Save' }: { busy: boolean; label?: string }) { return <div className="mt-5 flex justify-end"><button disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : label}</button></div> }
function receiptTitle(type?: string) { return type === 'deposit' ? 'Security deposit receipt' : type === 'deposit_refund' ? 'Security deposit refund receipt' : 'Rent payment receipt' }
function ReceiptView({ receipt, onPrint }: { receipt: any; onPrint: () => void }) { const payment = receipt.receipt; const isRefund = payment.paymentType === 'deposit_refund'; return <div><div className="rounded-md border p-4"><h3 className="font-semibold">{receipt.business?.name || payment.tenancy.unit.property.name}</h3><p className="text-sm text-muted-foreground">{receiptTitle(payment.paymentType)} · {payment.receiptNo}</p>{payment.status === 'void' && <p className="mt-2 text-sm font-semibold text-rose-700">VOIDED · {payment.voidReason}</p>}<div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div>Tenant<strong className="block">{payment.tenancy.tenantName}</strong></div><div>Unit<strong className="block">{payment.tenancy.unit.property.name} · {payment.tenancy.unit.unitCode}</strong></div><div>Date<strong className="block">{new Date(payment.paymentDate).toLocaleDateString('en-GB')}</strong></div><div>Payment method / account<strong className="block">{payment.paymentMethod}{payment.cashAccount?.name ? ` · ${payment.cashAccount.name}` : ''}</strong></div></div><div className="mt-4 border-t pt-3 text-right text-lg font-semibold">{isRefund ? 'Refunded' : 'Received'} {money(payment.amount, payment.tenancy.currency)}</div></div><button onClick={onPrint} className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"><Printer className="h-4 w-4"/> Print receipt</button></div> }
