import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, BadgeCheck, Loader2, Package, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Row = Record<string, any>
const tabs = ['Overview', 'Medicine catalogue', 'Batches & expiry', 'Prescriptions', 'Dispensing history'] as const
type Tab = typeof tabs[number]
const inputClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data as T
}

export default function PharmacyManagementPage() {
  const { hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const clinicPharmacyLinkEnabled = hasFeature('clinic_management')
  const canAccessPrescriptionQueue = hasPermission('canViewPharmacyPrescriptions') || hasPermission('canDispensePharmacyPrescriptions')
  const visibleTabs = clinicPharmacyLinkEnabled && canAccessPrescriptionQueue ? tabs : tabs.filter(item => item !== 'Prescriptions' && item !== 'Dispensing history')
  const [tab, setTab] = useState<Tab>('Overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [summary, setSummary] = useState({ batches: 0, batchUnits: 0, expiringWithin90Days: 0, prescriptionsToDispense: 0, dispensedToday: 0 })
  const [medicines, setMedicines] = useState<Row[]>([])
  const [inventoryProducts, setInventoryProducts] = useState<Row[]>([])
  const [batches, setBatches] = useState<Row[]>([])
  const [prescriptions, setPrescriptions] = useState<Row[]>([])
  const [dispenses, setDispenses] = useState<Row[]>([])
  const [saleOptions, setSaleOptions] = useState<Record<string, Row[]>>({})
  const [fulfillmentDrafts, setFulfillmentDrafts] = useState<Record<string, Record<string, { quantity: string; outcome: string; reason: string }>>>({})
  const [batchForm, setBatchForm] = useState({ productId: '', batchNumber: '', expiryDate: '', quantity: '', unitCost: '' })
  const [catalogueForm, setCatalogueForm] = useState({ productId: '', activeIngredient: '', strength: '', dosageForm: '', manufacturer: '', controlledClass: '', prescriptionRequired: true })
  const [saleForPrescription, setSaleForPrescription] = useState<Record<string, string>>({})
  const pendingPrescriptionCount = prescriptions.filter(row => ['open', 'partially_dispensed'].includes(row.status)).length

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const jobs: Array<Promise<void>> = []
    if (hasPermission('canViewPharmacy')) jobs.push(request<any>('/api/pharmacy/dashboard').then(data => setSummary(data)))
    if (hasPermission('canViewPharmacyCatalogue') || hasPermission('canManagePharmacyBatches')) jobs.push(request<any>('/api/pharmacy/catalogue').then(data => setMedicines(data.medicines || [])))
    if (hasPermission('canManagePharmacyCatalogue')) jobs.push(request<any>('/api/pharmacy/inventory-products').then(data => setInventoryProducts(data.products || [])))
    if (hasPermission('canViewPharmacyBatches')) jobs.push(request<any>('/api/pharmacy/batches').then(data => setBatches(data.batches || [])))
    if (clinicPharmacyLinkEnabled && canAccessPrescriptionQueue) jobs.push(request<any>('/api/pharmacy/prescriptions').then(async data => {
      const rows: Row[] = data.prescriptions || []
      setPrescriptions(rows)
      setFulfillmentDrafts(previous => {
        const next = { ...previous }
        rows.filter(row => ['open', 'partially_dispensed'].includes(row.status)).forEach(row => {
          const lines = { ...(next[row.id] || {}) }
          row.items?.forEach((line: Row) => {
            if (!lines[line.id]) lines[line.id] = { quantity: String(line.remainingQuantity || 0), outcome: 'dispensed', reason: '' }
          })
          next[row.id] = lines
        })
        return next
      })
      if (hasPermission('canDispensePharmacyPrescriptions')) {
        const patientIds = [...new Set(rows.filter(row => ['open', 'partially_dispensed'].includes(row.status)).map(row => row.customerId))]
        const pairs = await Promise.all(patientIds.map(async patientId => {
          try { const result = await request<any>(`/api/pharmacy/sale-options?patientId=${encodeURIComponent(patientId)}`); return [patientId, result.sales || []] as const }
          catch { return [patientId, []] as const }
        }))
        setSaleOptions(Object.fromEntries(pairs))
      }
    }))
    if (clinicPharmacyLinkEnabled && hasPermission('canViewPharmacyDispenses')) jobs.push(request<any>('/api/pharmacy/dispenses').then(data => setDispenses(data.dispenses || [])))
    const results = await Promise.allSettled(jobs)
    if (results.some(result => result.status === 'rejected')) setError('Some pharmacy data could not be refreshed. Check permissions and retry.')
    setLoading(false)
  }, [hasPermission, clinicPharmacyLinkEnabled, canAccessPrescriptionQueue])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!clinicPharmacyLinkEnabled || !canAccessPrescriptionQueue) return
    let active = true
    const refreshQueue = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const data = await request<any>('/api/pharmacy/prescriptions')
        if (!active) return
        const rows: Row[] = data.prescriptions || []
        setPrescriptions(rows)
        setFulfillmentDrafts(previous => {
          const next = { ...previous }
          rows.filter(row => ['open', 'partially_dispensed'].includes(row.status)).forEach(row => {
            const lines = { ...(next[row.id] || {}) }
            row.items?.forEach((line: Row) => { if (!lines[line.id]) lines[line.id] = { quantity: String(line.remainingQuantity || 0), outcome: 'dispensed', reason: '' } })
            next[row.id] = lines
          })
          return next
        })
        if (hasPermission('canDispensePharmacyPrescriptions')) {
          const patientIds = [...new Set(rows.filter(row => ['open', 'partially_dispensed'].includes(row.status)).map(row => row.customerId))]
          const pairs = await Promise.all(patientIds.map(async patientId => {
            try { const result = await request<any>(`/api/pharmacy/sale-options?patientId=${encodeURIComponent(patientId)}`); return [patientId, result.sales || []] as const }
            catch { return [patientId, []] as const }
          }))
          if (active) setSaleOptions(Object.fromEntries(pairs))
        }
      } catch { /* Keep the last loaded queue visible through brief network interruptions. */ }
    }
    const interval = window.setInterval(() => { void refreshQueue() }, 30_000)
    window.addEventListener('focus', refreshQueue)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', refreshQueue) }
  }, [clinicPharmacyLinkEnabled, canAccessPrescriptionQueue, hasPermission])
  const addBatch = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const result = await request<any>('/api/pharmacy/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batchForm) })
      setNotice(result.message || 'Batch registered.'); setBatchForm({ productId: '', batchNumber: '', expiryDate: '', quantity: '', unitCost: '' }); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not register this batch.') }
    finally { setSaving(false) }
  }
  const addCatalogueItem = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const result = await request<any>('/api/pharmacy/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catalogueForm) })
      setNotice(result.message || 'Medicine linked.'); setCatalogueForm({ productId: '', activeIngredient: '', strength: '', dosageForm: '', manufacturer: '', controlledClass: '', prescriptionRequired: true }); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add medicine.') }
    finally { setSaving(false) }
  }
  const dispense = async (prescription: Row) => {
    const items = (prescription.items || []).map((line: Row) => {
      const draft = fulfillmentDrafts[prescription.id]?.[line.id] || { quantity: String(line.remainingQuantity || 0), outcome: 'dispensed', reason: '' }
      return { prescriptionItemId: line.id, quantityDispensed: Number(draft.quantity || 0), outcome: Number(draft.quantity || 0) > 0 ? 'dispensed' : draft.outcome, reason: draft.reason }
    }).filter((line: Row) => line.quantityDispensed > 0 || line.outcome !== 'dispensed')
    if (!items.length) { setError('Enter a supplied quantity or record why a medicine was not supplied.'); return }
    const needsSale = items.some((item: Row) => item.quantityDispensed > 0)
    const selectedSale = saleForPrescription[prescription.id]
    if (needsSale && !selectedSale) { setError('Select a completed receipt for the medicines being supplied.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const [sourceType, sourceId] = selectedSale ? selectedSale.split(':') : ['', '']
      const saleLink = !needsSale ? {} : sourceType === 'credit_sale' ? { saleRecordId: sourceId } : { saleId: sourceId }
      const result = await request<any>(`/api/pharmacy/prescriptions/${prescription.id}/fulfillments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...saleLink, items }) })
      setNotice(`${result.message} ${result.receiptNo ? `Receipt ${result.receiptNo}.` : ''}`); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record dispense.') }
    finally { setSaving(false) }
  }
  const expiresLabel = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'No expiry recorded'
  const expired = (value: string | null) => Boolean(value && new Date(value) < new Date(new Date().setHours(0, 0, 0, 0)))

  return <main className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-semibold uppercase text-cyan-700">Medicines & dispensing</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Pharmacy Management</h1><p className="mt-1 text-sm text-muted-foreground">Inventory-linked medicines, batch traceability, expiry monitoring, and prescription dispensing.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></header>
    <nav className="flex max-w-full gap-1 overflow-x-auto border-b border-border" aria-label="Pharmacy sections">{visibleTabs.map(item => <button key={item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-3 py-2.5 text-sm ${tab === item ? 'border-cyan-700 font-semibold text-cyan-800' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</nav>
    {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}{notice && <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading pharmacy data</div> : <>
      {tab === 'Overview' && <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
        ['Active batches', summary.batches], ['Batch units', Number(summary.batchUnits).toLocaleString()], ['Expiring within 90 days', summary.expiringWithin90Days], ['Prescriptions to dispense', pendingPrescriptionCount], ['Dispensed today', summary.dispensedToday],
      ].map(([label, value]: any) => <div key={label} className="rounded-md border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold text-foreground">{value}</p></div>)}</section>{clinicPharmacyLinkEnabled && canAccessPrescriptionQueue && <button type="button" onClick={() => setTab('Prescriptions')} className="flex w-full items-center justify-between gap-4 rounded-md border border-cyan-300 bg-cyan-50 p-4 text-left text-cyan-950 hover:bg-cyan-100"><span><span className="block font-semibold">Clinic prescription queue</span><span className="mt-1 block text-sm">Open and partially supplied prescriptions from Clinic Management</span></span><span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold">{pendingPrescriptionCount} pending</span></button>}<section className="grid gap-4 xl:grid-cols-2"><div className="rounded-md border border-border p-4"><div className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-cyan-700" />Reorder watch</div><p className="mt-2 text-sm text-muted-foreground">Medicine quantities and purchases remain in the shared inventory and supplier workflows. Use stock-in/purchase first; batch registration allocates that stock for expiry and traceability without changing the ledger.</p></div><div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Clinical safety</div><p className="mt-2">Prescriptions are not medical advice. Confirm patient identity, prescription, medicine, dose, batch, expiry, and quantity before dispensing. Sales in POS create the official receipt and accounting entry; dispensing records the clinical fulfillment only.</p></div></section></>}
      {tab === 'Medicine catalogue' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">{hasPermission('canManagePharmacyCatalogue') && <form onSubmit={addCatalogueItem} className="order-1 space-y-3 rounded-md border border-border p-4 xl:order-2"><h2 className="font-semibold">Add medicine</h2><p className="text-sm text-muted-foreground">Link an existing inventory product. Stock and prices remain in shared inventory.</p><select required className={inputClass + ' w-full'} value={catalogueForm.productId} onChange={e => setCatalogueForm({ ...catalogueForm, productId: e.target.value })}><option value="">Choose inventory product</option>{inventoryProducts.filter(p => !medicines.some(m => m.productId === p.id)).map(p => <option key={p.id} value={p.id}>{p.name} · {Number(p.quantity)} {p.baseUnit}</option>)}</select><Input placeholder="Active ingredient" value={catalogueForm.activeIngredient} onChange={e => setCatalogueForm({ ...catalogueForm, activeIngredient: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Strength" value={catalogueForm.strength} onChange={e => setCatalogueForm({ ...catalogueForm, strength: e.target.value })} /><Input placeholder="Dosage form" value={catalogueForm.dosageForm} onChange={e => setCatalogueForm({ ...catalogueForm, dosageForm: e.target.value })} /></div><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Manufacturer" value={catalogueForm.manufacturer} onChange={e => setCatalogueForm({ ...catalogueForm, manufacturer: e.target.value })} /><Input placeholder="Controlled classification" value={catalogueForm.controlledClass} onChange={e => setCatalogueForm({ ...catalogueForm, controlledClass: e.target.value })} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalogueForm.prescriptionRequired} onChange={e => setCatalogueForm({ ...catalogueForm, prescriptionRequired: e.target.checked })} />Prescription required</label><Button className="w-full" disabled={saving}>Add to medicine catalogue</Button></form>}
        <div className="overflow-hidden rounded-md border border-border"><div className="border-b border-border px-4 py-3 font-semibold">Medicine catalogue</div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3">Medicine</th><th className="p-3">Ingredient / strength</th><th className="p-3">Form</th><th className="p-3">On hand</th><th className="p-3">Price</th><th className="p-3">Rx</th></tr></thead><tbody>{medicines.map(m => <tr key={m.productId} className="border-t border-border"><td className="p-3 font-medium">{m.name}<span className="block text-xs text-muted-foreground">{m.sku || m.barcode || 'No SKU'}</span></td><td className="p-3">{[m.activeIngredient, m.strength].filter(Boolean).join(' · ') || '—'}</td><td className="p-3">{m.dosageForm || '—'}</td><td className="p-3">{Number(m.quantity)} {m.baseUnit}</td><td className="p-3">{Number(m.price).toLocaleString()}</td><td className="p-3">{m.prescriptionRequired ? 'Required' : 'No'}</td></tr>)}{!medicines.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No medicines have been linked to inventory yet.</td></tr>}</tbody></table></div></div></div>}
      {tab === 'Batches & expiry' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">{hasPermission('canManagePharmacyBatches') && <form onSubmit={addBatch} className="order-1 space-y-3 rounded-md border border-border p-4 xl:order-2"><h2 className="font-semibold">Allocate received stock to batch</h2><p className="text-sm text-muted-foreground">This assigns existing inventory only. It does not increase stock or post a second purchase.</p><select required className={inputClass + ' w-full'} value={batchForm.productId} onChange={e => setBatchForm({ ...batchForm, productId: e.target.value })}><option value="">Choose medicine</option>{medicines.map(m => <option key={m.productId} value={m.productId}>{m.name} · available {Number(m.quantity)} {m.baseUnit}</option>)}</select><Input required placeholder="Batch / lot number" value={batchForm.batchNumber} onChange={e => setBatchForm({ ...batchForm, batchNumber: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Input required type="number" min="0.000001" step="any" placeholder="Quantity to allocate" value={batchForm.quantity} onChange={e => setBatchForm({ ...batchForm, quantity: e.target.value })} /><Input type="date" aria-label="Expiry date" value={batchForm.expiryDate} onChange={e => setBatchForm({ ...batchForm, expiryDate: e.target.value })} /></div><Input type="number" min="0" step="any" placeholder="Unit cost (optional)" value={batchForm.unitCost} onChange={e => setBatchForm({ ...batchForm, unitCost: e.target.value })} /><Button className="w-full" disabled={saving}>Register batch</Button></form>}
        <div className="overflow-hidden rounded-md border border-border"><div className="border-b border-border px-4 py-3 font-semibold">Batch register</div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3">Medicine</th><th className="p-3">Batch</th><th className="p-3">Expiry</th><th className="p-3">Remaining</th><th className="p-3">Status</th></tr></thead><tbody>{batches.map(b => <tr key={b.id} className="border-t border-border"><td className="p-3 font-medium">{b.productName}</td><td className="p-3">{b.batchNumber}</td><td className={`p-3 ${expired(b.expiryDate) ? 'font-semibold text-red-700' : ''}`}>{expiresLabel(b.expiryDate)}</td><td className="p-3">{Number(b.quantityRemaining)}</td><td className="p-3">{expired(b.expiryDate) ? 'Expired · blocked' : b.status}</td></tr>)}{!batches.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No batches allocated yet.</td></tr>}</tbody></table></div></div></div>}
      {tab === 'Prescriptions' && <div className="space-y-3">{prescriptions.map(p => <article key={p.id} className="rounded-md border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{p.reference} · {p.patientName}</p><p className="mt-1 text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleString()} · {p.status.replaceAll('_', ' ')}</p></div>{['open', 'partially_dispensed'].includes(p.status) && <BadgeCheck className="h-5 w-5 text-cyan-700" />}</div><div className="my-3 divide-y divide-border">{p.items?.map((line: Row) => { const draft = fulfillmentDrafts[p.id]?.[line.id] || { quantity: String(line.remainingQuantity || 0), outcome: 'dispensed', reason: '' }; return <div key={line.id} className="grid gap-2 py-3 text-sm md:grid-cols-[minmax(0,1fr)_130px_170px] md:items-center"><div><strong>{line.productName}</strong> · prescribed {line.quantity} {line.baseUnit || ''}<span className="block text-xs text-muted-foreground">{line.dosage || 'Dose not specified'} · {line.frequency || 'Frequency not specified'} {line.durationDays ? `· ${line.durationDays} days` : ''} · supplied {line.dispensedQuantity || 0} · remaining {line.remainingQuantity}</span>{line.fulfillmentHistory?.map((event: Row) => <span key={event.id} className="block text-xs text-muted-foreground">{event.outcome === 'dispensed' ? `Supplied ${event.quantityDispensed}` : `Not supplied (${event.outcome.replaceAll('_', ' ')})`}{event.reason ? `: ${event.reason}` : ''}</span>)}</div>{['open', 'partially_dispensed'].includes(p.status) && hasPermission('canDispensePharmacyPrescriptions') && <><Input aria-label={`Quantity supplied for ${line.productName}`} type="number" min="0" max={line.remainingQuantity} step="any" value={draft.quantity} onChange={e => setFulfillmentDrafts({ ...fulfillmentDrafts, [p.id]: { ...(fulfillmentDrafts[p.id] || {}), [line.id]: { ...draft, quantity: e.target.value } } })} /><select aria-label={`Supply status for ${line.productName}`} className={inputClass} value={draft.outcome} onChange={e => setFulfillmentDrafts({ ...fulfillmentDrafts, [p.id]: { ...(fulfillmentDrafts[p.id] || {}), [line.id]: { ...draft, outcome: e.target.value, quantity: e.target.value === 'dispensed' ? draft.quantity : '0' } } })}><option value="dispensed">Supply quantity</option><option value="not_available">Unavailable</option><option value="patient_declined">Patient declined</option><option value="other">Other reason</option></select>{draft.outcome !== 'dispensed' && <Input className="md:col-span-3" required placeholder="Reason not supplied" value={draft.reason} onChange={e => setFulfillmentDrafts({ ...fulfillmentDrafts, [p.id]: { ...(fulfillmentDrafts[p.id] || {}), [line.id]: { ...draft, reason: e.target.value } } })} />}</>}</div>})}</div>{p.notes && <p className="mb-3 text-sm text-muted-foreground">Clinical note: {p.notes}</p>}{['open', 'partially_dispensed'].includes(p.status) && hasPermission('canDispensePharmacyPrescriptions') && <div className="flex flex-col gap-2 sm:flex-row"><select className={inputClass + ' min-w-0 flex-1'} value={saleForPrescription[p.id] || ''} onChange={e => setSaleForPrescription({ ...saleForPrescription, [p.id]: e.target.value })}><option value="">Select completed sale (required when supplying medicine)</option>{(saleOptions[p.customerId] || []).map(s => <option key={`${s.sourceType}:${s.id}`} value={`${s.sourceType}:${s.id}`}>{s.receiptNo} · {s.sourceType === 'credit_sale' ? 'Credit sale' : 'POS'} · {new Date(s.createdAt).toLocaleString()}</option>)}</select><Button onClick={() => void dispense(p)} disabled={saving}>Save fulfillment</Button></div>}</article>)}{!prescriptions.length && <div className="rounded-md border border-border p-8 text-center text-muted-foreground">No prescriptions shared from the clinic.</div>}</div>}
      {tab === 'Dispensing history' && <div className="overflow-hidden rounded-md border border-border"><div className="border-b border-border px-4 py-3 font-semibold">Dispensing and non-supply history</div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3">Date</th><th className="p-3">Patient</th><th className="p-3">Prescription</th><th className="p-3">Medicine / quantity</th><th className="p-3">Outcome</th><th className="p-3">Receipt / reason</th><th className="p-3">Pharmacist</th></tr></thead><tbody>{dispenses.map(d => <tr key={d.id} className="border-t border-border"><td className="p-3">{new Date(d.dispensedAt).toLocaleString()}</td><td className="p-3">{d.patientName}</td><td className="p-3">{d.prescriptionReference}</td><td className="p-3">{d.productName} · {Number(d.quantity)}</td><td className="p-3">{d.outcome?.replaceAll('_', ' ')}</td><td className="p-3">{d.receiptNo || d.reason || '—'}</td><td className="p-3">{d.pharmacistName || '—'}</td></tr>)}{!dispenses.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No dispensing activity recorded yet.</td></tr>}</tbody></table></div></div>}
    </>}
  </main>
}
