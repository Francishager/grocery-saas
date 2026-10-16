import { useCallback, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ArrowRight, Building2, CircleDollarSign, Clock3, Globe2, Handshake, LoaderCircle, Megaphone, Package, Plus, Printer, RefreshCw, Search, Send, ShieldCheck, Sparkles, Store, Tags, UserPlus, UserRoundCheck, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

type Tab = 'marketplace' | 'rfqs' | 'orders' | 'relationships' | 'profile'
type LineDraft = { productName: string; specification: string; quantity: string; unit: string; acceptableAlternatives: string }
type Business = { id: string; name: string; slug: string; businessType?: string | null; logo?: string | null }
type Listing = { id: string; name: string; description: string; category: string; unit: string; price: string; currency: string; minimumQty: string; availableQty?: string | null; leadTimeDays?: number | null; visibility: string; business?: Business }
type RFQ = { id: string; title: string; notes: string; visibility: string; status: string; currency: string; isMine: boolean; lines: Array<{ id: string; productName: string; specification: string; quantity: string; unit: string }>; buyer?: Business; quoteCount: number; myQuote?: { id: string; status: string; version: number } | null }
type Relationship = { id: string; status: string; direction: string; counterparty?: Business }
type Campaign = { id: string; campaignType: 'promotion' | 'ad'; title: string; message: string; startsAt: string; endsAt?: string | null; status: string; images?: string[]; listing?: { id: string; name: string; price: string; currency: string }; business?: Business }

const blankLine: LineDraft = { productName: '', specification: '', quantity: '1', unit: 'Piece', acceptableAlternatives: '' }
function uninvoicedQuantity(order: any, line: any) {
  const invoiced = (order.invoices || []).filter((invoice: any) => ['submitted', 'approved'].includes(invoice.status))
    .flatMap((invoice: any) => invoice.lines || [])
    .filter((invoiceLine: any) => invoiceLine.orderLineId === line.id)
    .reduce((sum: number, invoiceLine: any) => sum + Number(invoiceLine.quantity || 0), 0)
  return Math.max(0, Number(line.receivedQuantity || 0) - invoiced)
}
function uninvoicedTax(order: any) {
  const amount = order.lines.reduce((sum: number, line: any) => {
    const quantity = uninvoicedQuantity(order, line)
    return sum + Number((quantity * Number(line.unitPrice || 0) * Number(line.taxRate || 0) / 100).toFixed(2))
  }, 0)
  return Number(amount.toFixed(2))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/api/procurement${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || payload?.message || 'The procurement request failed.')
  return payload as T
}

async function requestCampaign<T>(path: string, body: FormData): Promise<T> {
  const response = await apiFetch(`/api/procurement${path}`, { method: 'POST', body })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || payload?.message || 'The campaign could not be published.')
  return payload as T
}

function CampaignImageShowcase({ images, title }: { images?: string[]; title: string }) {
  const [frame, setFrame] = useState(0)
  const [paused, setPaused] = useState(false)
  const frameCount = Math.ceil((images?.length || 0) / 2)
  useEffect(() => {
    if (frameCount < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setFrame((current) => (current + 1) % frameCount), 6000)
    return () => clearInterval(timer)
  }, [frameCount, paused])
  if (!images?.length) return null
  const visibleImages = images.slice(frame * 2, frame * 2 + 2)
  return <div className="mb-2 grid aspect-[2.8/1] grid-cols-2 gap-1 overflow-hidden bg-muted" aria-label={`Images for ${title}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    {visibleImages.map((image) => <img key={`${frame}-${image}`} src={image} alt={`${title} campaign image`} className={`size-full min-w-0 object-cover ${visibleImages.length === 1 ? 'col-span-2' : ''}`} loading="lazy" />)}
  </div>
}

function printPaymentReceipt(order: any, invoice: any, approval: any) {
  const popup = window.open('', '_blank', 'width=760,height=900')
  if (!popup) return
  const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
  const status = approval.status === 'approved' ? 'Confirmed receipt' : 'Payment submitted - awaiting seller confirmation'
  const method = approval.receivedPaymentMethod || approval.supplierPayment?.paymentMethod?.replace(/_/g, ' ') || 'Not specified'
  const amount = `${order.currency} ${Number(approval.amount).toLocaleString()}`
  popup.document.open()
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Marketplace payment receipt</title><style>body{font:15px Arial,sans-serif;color:#17212b;margin:0;padding:36px}.receipt{max-width:680px;margin:auto;border:1px solid #d6dde3;padding:32px}.brand{text-align:center;font-size:18px;font-weight:700;color:#12624a}.label{color:#61717e;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.amount{text-align:center;font-size:30px;font-weight:700;margin:18px 0}.status{text-align:center;padding:10px;background:#f1f5f3;margin-bottom:24px}.row{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e5e9ec;padding:12px 0}.row span:first-child{color:#61717e}.foot{margin-top:24px;color:#61717e;font-size:12px}@media print{body{padding:0}.receipt{border:0}}</style></head><body><main class="receipt"><header class="brand">JibuSales · Marketplace</header><p class="label" style="text-align:center;margin-top:8px">${approval.status === 'approved' ? 'Payment receipt' : 'Payment submission acknowledgment'}</p><div class="amount">${safe(amount)}</div><div class="status">${safe(status)}</div><div class="row"><span>Buyer</span><strong>${safe(order.buyer?.name || 'Buyer business')}</strong></div><div class="row"><span>Seller</span><strong>${safe(order.seller?.name || 'Seller business')}</strong></div><div class="row"><span>Supplier invoice</span><strong>${safe(invoice.invoiceNo)}</strong></div><div class="row"><span>Purchase order</span><strong>${safe(order.poNumber)}</strong></div><div class="row"><span>Payment method</span><strong>${safe(method)}</strong></div><div class="row"><span>Payment reference</span><strong>${safe(approval.supplierPayment?.reference || 'Not provided')}</strong></div><div class="row"><span>Recorded</span><strong>${safe(new Date(approval.createdAt).toLocaleString())}</strong></div><div class="row"><span>Receipt reference</span><strong>${safe(approval.id)}</strong></div><p class="foot">${approval.status === 'approved' ? 'This receipt confirms that the seller recorded the repayment and applied it to the linked invoice.' : 'This copy confirms submission only. It is not a receipt for funds received until the seller confirms the payment.'}</p></main><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`)
  popup.document.close()
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-1.5 text-sm font-medium text-foreground">{label}<input {...props} className={`h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring ${props.className || ''}`} /></label>
}

function TextareaField({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return <label className="grid gap-1.5 text-sm font-medium text-foreground">{label}<textarea {...props} className={`min-h-20 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring ${props.className || ''}`} /></label>
}

export default function ProcurementNetworkPage() {
  const { user, hasPermission } = useJWTAuth()
  const can = (permission: string) => user?.role === 'owner' || hasPermission(permission)
  const [tab, setTab] = useState<Tab>('marketplace')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [myListings, setMyListings] = useState<Listing[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignImages, setCampaignImages] = useState<File[]>([])
  const [followedSellerIds, setFollowedSellerIds] = useState<Set<string>>(new Set())
  const [showAllCampaigns, setShowAllCampaigns] = useState(false)
  const [marketInsight, setMarketInsight] = useState<{ title: string; message: string; listingId: string | null } | null>(null)
  const [marketInsightVisible, setMarketInsightVisible] = useState(false)
  const marketInsightAttempted = useRef(false)
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([])
  const [suppliers, setSuppliers] = useState<Array<{ tenantId: string; sellerType?: string; category: string; description: string; business?: Business }>>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [rfqs, setRfqs] = useState<RFQ[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([])
  const [localSuppliers, setLocalSuppliers] = useState<Array<{ id: string; name: string }>>([])
  const [inventoryProducts, setInventoryProducts] = useState<Array<{ id: string; name: string; sku?: string | null; branchId?: string | null }>>([])
  const [sellerProducts, setSellerProducts] = useState<Array<{ id: string; name: string; sku?: string | null; itemType: string }>>([])
  const [receiveDraft, setReceiveDraft] = useState<Record<string, string>>({})
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [productMappings, setProductMappings] = useState<Record<string, string>>({})
  const [sellerProductMappings, setSellerProductMappings] = useState<Record<string, string>>({})
  const [sellerPaymentOpen, setSellerPaymentOpen] = useState<Record<string, boolean>>({})
  const [sellerPaymentAccounts, setSellerPaymentAccounts] = useState<Record<string, Array<{ id: string; name: string; type: string; currency: string; paymentMethod: string }>>>({})
  const [sellerPaymentDraft, setSellerPaymentDraft] = useState<Record<string, { amount: string; accountId: string; reference: string }>>({})
  const [profile, setProfile] = useState({ sellerType: 'supplier', category: '', description: '', website: '', discoverable: false })
  const [listingForm, setListingForm] = useState({ name: '', category: '', description: '', unit: 'Piece', price: '', currency: 'UGX', minimumQty: '1', availableQty: '', leadTimeDays: '', visibility: 'public' })
  const [campaignForm, setCampaignForm] = useState({ campaignType: (can('canCreateMarketplacePromotion') ? 'promotion' : 'ad') as 'promotion' | 'ad', listingId: '', title: '', message: '', startsAt: '', endsAt: '' })
  const campaignImagePreviews = useMemo(() => campaignImages.map((file) => ({ file, url: URL.createObjectURL(file) })), [campaignImages])
  useEffect(() => () => campaignImagePreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [campaignImagePreviews])
  const [rfqForm, setRfqForm] = useState({ title: '', notes: '', visibility: 'open', currency: 'UGX', deliveryAddress: '', sellerTenantIds: [] as string[], lines: [{ ...blankLine }] })
  const [activeRFQ, setActiveRFQ] = useState<RFQ | null>(null)
  const [quotes, setQuotes] = useState<any[]>([])
  const [quoteDraft, setQuoteDraft] = useState<Record<string, string>>({})
  const [discussion, setDiscussion] = useState<{ quoteId: string; messages: any[] } | null>(null)
  const [messageDraft, setMessageDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [profileData, listingData, ownData, directoryData, relationshipData, rfqData, orderData, branchData, supplierData, productData, sellerProductData, campaignData, ownCampaignData, followData] = await Promise.all([
        request<{ profile: typeof profile | null }>('/profile'),
        request<{ listings: Listing[] }>(`/listings?search=${encodeURIComponent(search)}`),
        request<{ listings: Listing[] }>('/listings/mine').catch(() => ({ listings: [] })),
        request<{ suppliers: typeof suppliers }>(`/directory?search=${encodeURIComponent(search)}`),
        request<{ relationships: Relationship[] }>('/relationships'),
        request<{ rfqs: RFQ[] }>('/rfqs'),
        request<{ orders: any[] }>('/orders'),
        request<{ branches: Array<{ id: string; name: string }> }>('/branches'),
        request<{ suppliers: Array<{ id: string; name: string }> }>('/local-suppliers').catch(() => ({ suppliers: [] })),
        request<{ products: typeof inventoryProducts }>('/inventory-products').catch(() => ({ products: [] })),
        request<{ products: typeof sellerProducts }>('/seller-products').catch(() => ({ products: [] })),
        request<{ campaigns: Campaign[] }>('/promotions'),
        request<{ campaigns: Campaign[] }>('/promotions/mine').catch(() => ({ campaigns: [] })),
        request<{ sellerTenantIds: string[] }>('/follows').catch(() => ({ sellerTenantIds: [] })),
      ])
      if (profileData.profile) setProfile({ sellerType: profileData.profile.sellerType || 'supplier', category: profileData.profile.category || '', description: profileData.profile.description || '', website: profileData.profile.website || '', discoverable: profileData.profile.discoverable })
      setListings(listingData.listings); setMyListings(ownData.listings); setSuppliers(directoryData.suppliers); setRelationships(relationshipData.relationships); setRfqs(rfqData.rfqs)
      setOrders(orderData.orders); setBranches(branchData.branches); setLocalSuppliers(supplierData.suppliers)
      setInventoryProducts(productData.products)
      setSellerProducts(sellerProductData.products)
      setCampaigns(campaignData.campaigns)
      setMyCampaigns(ownCampaignData.campaigns)
      setFollowedSellerIds(new Set(followData.sellerTenantIds))
      if (!selectedBranch && branchData.branches.length === 1) setSelectedBranch(branchData.branches[0].id)
      if (!selectedSupplier && supplierData.suppliers.length === 1) setSelectedSupplier(supplierData.suppliers[0].id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the procurement network.') }
    finally { setLoading(false) }
  }, [search, selectedBranch, selectedSupplier])

  useEffect(() => { void load() }, [load])

  const activeRelationships = useMemo(() => relationships.filter((row) => row.status === 'active'), [relationships])
  const incomingRequests = relationships.filter((row) => row.direction === 'incoming' && row.status === 'pending')
  const canUseAI = user?.role === 'owner' || hasPermission('canUseBusinessAI')
  const canFollowSellers = user?.role === 'owner' || hasPermission('canFollowMarketplaceSellers')

  useEffect(() => {
    if (tab !== 'marketplace' || !canUseAI || !user?.id || !user?.tenantId || marketInsightAttempted.current) return
    marketInsightAttempted.current = true
    const today = new Date().toISOString().slice(0, 10)
    const storageKey = `marketplace-insight:${user.tenantId}:${user.id}`
    try { if (localStorage.getItem(storageKey) === today) return } catch { /* Storage may be unavailable in private browsing. */ }
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    let dismissTimer: ReturnType<typeof setTimeout> | undefined
    let active = true
    void request<{ insight: { title: string; message: string; listingId: string | null } | null }>('/market-insight')
      .then(({ insight }) => {
        if (!active || !insight) return
        setMarketInsight(insight)
        setMarketInsightVisible(true)
        try { localStorage.setItem(storageKey, today) } catch { /* The daily limit still applies to this page session. */ }
        fadeTimer = setTimeout(() => {
          setMarketInsightVisible(false)
          dismissTimer = setTimeout(() => setMarketInsight(null), 350)
        }, 9500)
      })
      .catch(() => {})
    return () => { active = false; if (fadeTimer) clearTimeout(fadeTimer); if (dismissTimer) clearTimeout(dismissTimer) }
  }, [tab, canUseAI, user?.id, user?.tenantId])

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(success); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The action could not be completed.') }
    finally { setBusy(false) }
  }

  async function toggleSellerFollow(sellerTenantId: string) {
    const following = followedSellerIds.has(sellerTenantId)
    setBusy(true); setError(''); setNotice('')
    try {
      await request(`/sellers/${sellerTenantId}/follow`, { method: following ? 'DELETE' : 'POST' })
      setFollowedSellerIds((current) => {
        const next = new Set(current)
        if (following) next.delete(sellerTenantId)
        else next.add(sellerTenantId)
        return next
      })
      setNotice(following ? 'Seller updates turned off.' : 'Seller followed. You will be notified about new visible marketplace posts.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Seller follow could not be updated.') }
    finally { setBusy(false) }
  }

  function selectCampaignImages(files: FileList | null) {
    const selected = Array.from(files || [])
    if (selected.length > 4) { setError('Choose up to four campaign images.'); return }
    if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Use JPEG, PNG, or WebP images up to 5 MB each.'); return
    }
    setError('')
    setCampaignImages(selected)
  }

  async function openRFQ(rfq: RFQ) {
    setError(''); setActiveRFQ(rfq); setQuotes([]); setDiscussion(null)
    try {
      const data = await request<{ quotes: any[] }>(`/rfqs/${rfq.id}/quotes`)
      setQuotes(data.quotes)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load quotes.') }
  }

  async function openDiscussion(quoteId: string) {
    if (!activeRFQ) return
    try {
      const data = await request<{ messages: any[] }>(`/rfqs/${activeRFQ.id}/quotes/${quoteId}/messages`)
      setDiscussion({ quoteId, messages: data.messages })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the private quote discussion.') }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Store }> = [
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'rfqs', label: 'Requests for quote', icon: Tags },
    { id: 'orders', label: 'Orders & invoices', icon: Package },
    { id: 'relationships', label: 'Supplier relationships', icon: Handshake },
    { id: 'profile', label: 'Business profile', icon: Building2 },
  ]

  return <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md bg-emerald-100 text-emerald-800"><Store className="size-5" /></div>
        <div><h1 className="text-xl font-semibold">Procurement Network</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Discover opted-in suppliers, publish offers and price updates, and request private or marketplace-wide quotes.</p></div>
      </div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
    </header>

    <div className="mb-5 flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Procurement workspace">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setError(''); setNotice('') }} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${tab === id ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="size-4" />{label}</button>)}
    </div>
    {error && <div role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}
    {loading && <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading procurement data</div>}

    {tab === 'orders' && <section className="space-y-4">
      <div><h2 className="text-lg font-semibold">Purchase orders, receipts and invoices</h2><p className="mt-1 text-sm text-muted-foreground">Approve and send orders, record partial receipts, and match invoices before creating a payable.</p></div>
      {orders.length ? orders.map((order) => <article key={order.id} className="rounded-md border p-4">
        <div className="flex flex-wrap justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{order.poNumber}</h3><span className="rounded-sm bg-muted px-2 py-0.5 text-xs capitalize">{order.status.replace(/_/g, ' ')}</span></div><p className="mt-1 text-sm text-muted-foreground">{order.side === 'buyer' ? `Supplier: ${order.seller?.name || 'Business'}` : `Buyer: ${order.buyer?.name || 'Business'}`} · {order.currency}</p></div></div>
        <div className="my-3 divide-y rounded-md border">{order.lines.map((line: any) => <div key={line.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_150px]"><div><div className="font-medium">{line.itemName}</div><p className="text-xs text-muted-foreground">Ordered {Number(line.orderedQuantity)} {line.unit} · Received {Number(line.receivedQuantity)} · {order.currency} {Number(line.unitPrice).toLocaleString()}</p>{order.side === 'buyer' && !line.productId && ['acknowledged', 'partially_received'].includes(order.status) && <label className="mt-2 grid max-w-lg gap-1 text-xs">Map to your inventory product<select className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="" onChange={(e) => { if (e.target.value) void run(() => request(`/orders/${order.id}/lines/${line.id}/product`, { method: 'PATCH', body: JSON.stringify({ productId: e.target.value }) }), 'Inventory mapping saved.') }}><option value="">Choose product</option>{inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}</select></label>}</div>{order.side === 'buyer' && ['acknowledged', 'partially_received'].includes(order.status) && <Field label="Receive now" type="number" min="0" max={Math.max(0, Number(line.orderedQuantity) - Number(line.receivedQuantity))} step="1" value={receiveDraft[line.id] || ''} onChange={(e) => setReceiveDraft({ ...receiveDraft, [line.id]: e.target.value })} />}</div>)}</div>
        {order.receipts?.length > 0 && <p className="mb-2 text-xs text-muted-foreground">Receipts: {order.receipts.map((receipt: any) => receipt.receiptNo).join(', ')}</p>}
        {order.invoices?.length > 0 && <div className="mb-3 space-y-2">{order.invoices.map((invoice: any) => <div key={invoice.id} className="rounded-md bg-muted/40 p-3 text-xs"><p className="font-medium text-foreground">Invoice {invoice.invoiceNo} · {invoice.status} · {order.currency} {Number(invoice.total).toLocaleString()}{invoice.payment ? ` · Paid ${Number(invoice.payment.amountPaid).toLocaleString()} · Balance ${Number(invoice.payment.balance).toLocaleString()} (${invoice.payment.paymentStatus})` : ''}</p><p className="mt-1 text-muted-foreground">Tax {Number(invoice.taxAmount || 0).toLocaleString()} · Freight {Number(invoice.deliveryFee || 0).toLocaleString()}{invoice.status === 'approved' ? ` · Allocated to inventory ${Number(invoice.freightInventoryAmount || 0).toLocaleString()} · Allocated to service expense ${Number(invoice.freightExpenseAmount || 0).toLocaleString()}` : ''}</p>{invoice.lines.map((invoiceLine: any) => { const ordered = order.lines.find((line: any) => line.id === invoiceLine.orderLineId); return <p key={invoiceLine.id} className="mt-1 text-muted-foreground">{ordered?.itemName || 'Item'}: invoiced {Number(invoiceLine.quantity)} at {order.currency} {Number(invoiceLine.unitPrice).toLocaleString()} · received {Number(ordered?.receivedQuantity || 0)} at agreed {order.currency} {Number(ordered?.unitPrice || 0).toLocaleString()}</p> })}</div>)}</div>}
        {order.invoices?.map((invoice: any) => invoice.paymentApprovals?.map((approval: any) => (
          <div key={approval.id} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-xs">
            <div>
              <p className="font-medium">Repayment · {order.currency} {Number(approval.amount).toLocaleString()} · {approval.receivedPaymentMethod || approval.supplierPayment?.paymentMethod?.replaceAll('_' , ' ') || 'payment'} · {approval.initiatedBySide === 'seller' ? 'Seller recorded' : 'Buyer submitted'} · {approval.status === 'pending' ? 'Awaiting seller confirmation' : approval.status === 'approved' ? 'Confirmed and applied' : 'Not approved'}</p>
              <p className="mt-1 text-muted-foreground">Invoice {invoice.invoiceNo}{approval.supplierPayment?.reference ? ` · Reference ${approval.supplierPayment.reference}` : ''} · {new Date(approval.createdAt).toLocaleString()}</p>
              {order.side === 'buyer' && approval.initiatedBySide === 'seller' && <p className="mt-1 text-amber-800">Your payable was reduced through Marketplace Settlement Clearing. Reconcile it to the actual cash or bank account used.</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => printPaymentReceipt(order, invoice, approval)}><Printer className="mr-2 size-4" />{approval.status === 'approved' ? 'Print receipt' : 'Print submission'}</Button>
            {order.side === 'seller' && approval.status === 'pending' && can('canApproveProcurementPayment') && <Button size="sm" disabled={busy} onClick={() => void run(() => request(`/payment-approvals/${approval.id}/approve`, { method: 'PATCH' }), 'Repayment confirmed and applied to the seller receivable.')}>Confirm received</Button>}
          </div>
        )))}
    {order.side === 'seller' && can('canRecordProcurementPayment') && order.invoices?.filter((invoice: any) => invoice.status === 'approved' && Number(invoice.sellerReceivable?.balance || 0) > 0).map((invoice: any) => <div key={`seller-payment-${invoice.id}`} className="mb-3 rounded-md border border-dashed p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">Record payment received · {invoice.invoiceNo}</p><p className="text-xs text-muted-foreground">Outstanding seller balance: {order.currency} {Number(invoice.sellerReceivable.balance).toLocaleString()}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={async () => { const open = !sellerPaymentOpen[invoice.id]; setSellerPaymentOpen({ ...sellerPaymentOpen, [invoice.id]: open }); if (open && !sellerPaymentAccounts[invoice.id]) { try { const result = await request<{ accounts: Array<{ id: string; name: string; type: string; currency: string; paymentMethod: string }> }>(`/invoices/${invoice.id}/payment-accounts`); setSellerPaymentAccounts({ ...sellerPaymentAccounts, [invoice.id]: result.accounts }); setSellerPaymentDraft({ ...sellerPaymentDraft, [invoice.id]: { amount: String(invoice.sellerReceivable.balance), accountId: result.accounts[0]?.id || '', reference: '' } }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load permitted receiving accounts.') } } }}>{sellerPaymentOpen[invoice.id] ? 'Close' : 'Enter receipt'}</Button></div>{sellerPaymentOpen[invoice.id] && <form className="mt-3 grid gap-2 sm:grid-cols-[150px_minmax(180px,1fr)_minmax(160px,1fr)_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); const draft = sellerPaymentDraft[invoice.id]; if (!draft?.accountId) { setError('Choose a permitted receiving account.'); return } void run(() => request(`/invoices/${invoice.id}/repayments`, { method: 'POST', body: JSON.stringify({ amount: draft.amount, cashAccountId: draft.accountId, reference: draft.reference, idempotencyKey: crypto.randomUUID() }) }), 'Receipt recorded. Buyer payable was updated through Marketplace Settlement Clearing.') }}><label className="grid gap-1 text-xs font-medium">Amount<input required type="number" min="0.01" max={Number(invoice.sellerReceivable.balance)} step="0.01" value={sellerPaymentDraft[invoice.id]?.amount ?? String(invoice.sellerReceivable.balance)} onChange={(event) => setSellerPaymentDraft({ ...sellerPaymentDraft, [invoice.id]: { ...(sellerPaymentDraft[invoice.id] || { amount: '', accountId: '', reference: '' }), amount: event.target.value } })} className="h-9 rounded-md border bg-background px-2 text-sm" /></label><label className="grid gap-1 text-xs font-medium">Received into<select required value={sellerPaymentDraft[invoice.id]?.accountId || ''} onChange={(event) => setSellerPaymentDraft({ ...sellerPaymentDraft, [invoice.id]: { ...(sellerPaymentDraft[invoice.id] || { amount: '', reference: '' }), accountId: event.target.value } })} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">Select receiving account</option>{(sellerPaymentAccounts[invoice.id] || []).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.type.replace(/_/g, ' ')}</option>)}</select></label><label className="grid gap-1 text-xs font-medium">Reference<input value={sellerPaymentDraft[invoice.id]?.reference || ''} onChange={(event) => setSellerPaymentDraft({ ...sellerPaymentDraft, [invoice.id]: { ...(sellerPaymentDraft[invoice.id] || { amount: '', accountId: '' }), reference: event.target.value } })} className="h-9 rounded-md border bg-background px-2 text-sm" /></label><Button size="sm" type="submit" disabled={busy || !sellerPaymentAccounts[invoice.id]?.length}>Record and post</Button><p className="text-xs text-muted-foreground sm:col-span-full">The seller receipt posts to the selected receiving account. The buyer payable is automatically reduced against Marketplace Settlement Clearing; the buyer can reconcile that clearing entry to its actual payment account.</p></form>}</div>)}
        {order.side === 'buyer' && order.status === 'pending_approval' && can('canApproveProcurementOrder') && <Button size="sm" disabled={busy} onClick={() => void run(() => request(`/orders/${order.id}/approve`, { method: 'PATCH' }), 'Purchase order approved. Send it when ready.')}>Approve order</Button>}
        {order.side === 'buyer' && order.status === 'approved' && can('canApproveProcurementOrder') && <Button size="sm" disabled={busy} onClick={() => void run(() => request(`/orders/${order.id}/send`, { method: 'PATCH' }), 'Purchase order sent to supplier.')}>Send to supplier</Button>}
        {order.side === 'seller' && order.status === 'sent' && can('canAcknowledgeProcurementOrder') && <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void run(() => request(`/orders/${order.id}/acknowledge`, { method: 'PATCH', body: JSON.stringify({ decision: 'accept' }) }), 'Purchase order acknowledged.')}>Accept order</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => request(`/orders/${order.id}/acknowledge`, { method: 'PATCH', body: JSON.stringify({ decision: 'reject', reason: 'Unable to fulfil' }) }), 'Purchase order rejected.')}>Reject</Button></div>}
        {order.side === 'buyer' && can('canReceiveProcurementGoods') && ['acknowledged', 'partially_received'].includes(order.status) && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-medium">Receiving branch<select disabled className="h-9 rounded-md border bg-background px-2 text-sm" value={order.branchId || ''}><option value="">{branches.find((branch) => branch.id === order.branchId)?.name || 'Branch not set'}</option></select></label><Button size="sm" disabled={busy || !order.branchId || !order.lines.some((line: any) => Number(receiveDraft[line.id] || 0) > 0)} onClick={() => void run(async () => { await request(`/orders/${order.id}/receipts`, { method: 'POST', body: JSON.stringify({ branchId: order.branchId, lines: order.lines.filter((line: any) => Number(receiveDraft[line.id] || 0) > 0).map((line: any) => ({ orderLineId: line.id, quantity: receiveDraft[line.id] })) }) }); setReceiveDraft({}) }, 'Goods receipt recorded and accepted quantities added to stock.')}>Record goods received</Button></div>}
        {can('canSubmitProcurementInvoice') && order.side === 'seller' && ['acknowledged', 'partially_received', 'received'].includes(order.status) && <form className="mt-3 grid gap-3 rounded-md border bg-muted/20 p-3" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const lines = order.lines.map((line: any) => ({ line, quantity: uninvoicedQuantity(order, line) })).filter((row: any) => row.quantity > 0); void run(() => request(`/orders/${order.id}/invoices`, { method: 'POST', body: JSON.stringify({ invoiceNo: form.get('invoiceNo'), taxAmount: uninvoicedTax(order), deliveryFee: form.get('deliveryFee') || 0, lines: lines.map((row: any) => ({ orderLineId: row.line.id, quantity: row.quantity, unitPrice: row.line.unitPrice, sellerProductId: sellerProductMappings[row.line.id] })) }) }), 'Invoice submitted for matching.') }}><div><h4 className="text-sm font-medium">Invoice received goods</h4><p className="mt-1 text-xs text-muted-foreground">Map each line to your own product or service so approval can post your receivable, sales, tax and inventory/COGS correctly.</p></div>{order.lines.filter((line: any) => uninvoicedQuantity(order, line) > 0).map((line: any) => <label key={line.id} className="grid max-w-2xl gap-1 text-xs font-medium">Seller item for {line.itemName}<select required value={sellerProductMappings[line.id] || ''} onChange={(e) => setSellerProductMappings({ ...sellerProductMappings, [line.id]: e.target.value })} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"><option value="">Choose your product/service</option>{sellerProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}{product.itemType === 'service' ? ' · Service' : ''}</option>)}</select></label>)}<div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-medium">Supplier invoice number<input name="invoiceNo" required className="h-9 rounded-md border bg-background px-2 text-sm" /></label><label className="grid gap-1 text-xs font-medium">Output tax (accepted rate)<input aria-label="Output tax from accepted quote" type="text" value={uninvoicedTax(order).toLocaleString()} readOnly className="h-9 w-36 rounded-md border bg-muted px-2 text-sm" /></label><input type="hidden" name="taxAmount" value={uninvoicedTax(order)} /><label className="grid gap-1 text-xs font-medium">Freight / delivery<input name="deliveryFee" type="number" min="0" step="0.01" defaultValue="0" className="h-9 w-36 rounded-md border bg-background px-2 text-sm" /></label><Button size="sm" type="submit" disabled={busy || !order.lines.some((line: any) => uninvoicedQuantity(order, line) > 0) || order.lines.some((line: any) => uninvoicedQuantity(order, line) > 0 && !sellerProductMappings[line.id])}>Submit invoice for received goods</Button></div></form>}
        {order.side === 'buyer' && can('canReviewProcurementInvoice') && order.invoices?.some((invoice: any) => invoice.status === 'submitted') && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-medium">Supplier record<select className="h-9 rounded-md border bg-background px-2 text-sm" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}><option value="">Select supplier</option>{localSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><Button size="sm" disabled={busy || !selectedSupplier} onClick={() => { const invoice = order.invoices.find((row: any) => row.status === 'submitted'); void run(() => request(`/invoices/${invoice.id}/approve`, { method: 'PATCH', body: JSON.stringify({ supplierId: selectedSupplier, branchId: order.branchId || selectedBranch }) }), 'Invoice approved and posted to supplier payables.') }}>Approve matched invoice</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { const invoice = order.invoices.find((row: any) => row.status === 'submitted'); void run(() => request(`/invoices/${invoice.id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason: 'Invoice requires correction' }) }), 'Invoice rejected for correction.') }}>Reject invoice</Button></div>}
      </article>) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No purchase orders yet. Select a supplier quote in Requests for quote.</p>}
    </section>}

    {tab === 'marketplace' && <section className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Supplier offers</h2><p className="text-sm text-muted-foreground">Prices shown are current supplier listings; accepted quotes retain their own terms.</p></div><label className="relative w-full max-w-sm"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search offers and suppliers" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" /></label></div>
        {campaigns.length > 0 && <section aria-label="Featured marketplace offers" className="mb-5 border-y py-3"><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Featured offers</h3>{campaigns.length > 2 && <button type="button" className="text-xs font-medium text-emerald-800 underline underline-offset-2" onClick={() => setShowAllCampaigns((visible) => !visible)}>{showAllCampaigns ? 'Show fewer' : `See all ${campaigns.length}`}</button>}</div><div className="grid gap-2 md:grid-cols-2">{(showAllCampaigns ? campaigns : campaigns.slice(0, 2)).map((campaign) => <article key={campaign.id} className="min-w-0 border bg-card px-3 py-2.5"><CampaignImageShowcase images={campaign.images} title={campaign.title} /><div className="flex items-start gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-sm bg-emerald-50 text-emerald-800"><Megaphone className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[11px] font-semibold uppercase text-emerald-800">{campaign.campaignType === 'ad' ? 'Sponsored' : 'Seller offer'}</span><span className="text-xs text-muted-foreground">{campaign.business?.name}</span></div><h4 className="mt-0.5 break-words text-sm font-semibold">{campaign.title}</h4><p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{campaign.message}</p>{campaign.listing && <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"><span className="min-w-0 truncate font-medium">{campaign.listing.name}</span><span className="shrink-0 tabular-nums">{campaign.listing.currency} {Number(campaign.listing.price).toLocaleString()}</span></div>}<div className="mt-1 flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">{campaign.endsAt ? `Offer ends ${new Date(campaign.endsAt).toLocaleDateString()}` : 'Available while active'}</p>{campaign.listing && <button type="button" className="shrink-0 text-xs font-medium text-emerald-800 underline underline-offset-2" onClick={() => document.getElementById(`market-listing-${campaign.listing!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>View listing</button>}</div></div></div></article>)}</div></section>}
        {listings.length ? <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{listings.map((item) => <article id={`market-listing-${item.id}`} key={item.id} className="min-w-0 rounded-md border bg-card p-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.category} · {item.unit}</p></div><Package className="size-5 shrink-0 text-emerald-700" /></div>
          <p className="min-h-10 break-words text-sm text-muted-foreground">{item.description || 'No additional description provided.'}</p>
          <div className="mt-4 flex items-end justify-between gap-3"><div><div className="text-lg font-semibold tabular-nums">{item.currency} {Number(item.price).toLocaleString()}</div><div className="text-xs text-muted-foreground">Minimum {Number(item.minimumQty).toLocaleString()} {item.unit}</div></div><span className="text-right text-xs text-muted-foreground">{item.business?.name}</span></div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">{item.availableQty && <span>Available: {Number(item.availableQty).toLocaleString()}</span>}{item.leadTimeDays != null && <span>{item.leadTimeDays} day lead time</span>}<button className="text-emerald-800 underline underline-offset-2" onClick={async () => { try { const d = await request<{history: any[]}>(`/listings/${item.id}/price-history`); setNotice(d.history.length ? d.history.map((x) => `${new Date(x.effectiveAt).toLocaleDateString()}: ${x.currency} ${x.oldPrice} → ${x.newPrice}${x.reason ? ` (${x.reason})` : ''}`).join(' · ') : 'No recorded price changes yet.') } catch (e) { setError(e instanceof Error ? e.message : 'Could not load price history.') } }}>Price history</button></div>
        </article>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No supplier offers match this search. Discover an opted-in supplier or publish your own catalogue from the panel.</div>}
        <h2 className="mb-3 mt-8 text-lg font-semibold">Discover suppliers</h2>
        {suppliers.length ? <div className="max-h-[32rem] divide-y overflow-y-auto rounded-md border">{suppliers.map((supplier) => { const existing = relationships.find((r) => r.counterparty?.id === supplier.tenantId); const following = followedSellerIds.has(supplier.tenantId); return <div key={supplier.tenantId} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-100"><Building2 className="size-4" /></div><div className="min-w-0"><div className="truncate font-medium">{supplier.business?.name || 'Business'}</div><div className="text-xs capitalize text-muted-foreground">{supplier.sellerType || 'supplier'} · {supplier.category}{supplier.business?.businessType ? ` · ${supplier.business.businessType}` : ''}</div></div></div><div className="flex flex-wrap items-center gap-2">{canFollowSellers && <Button size="sm" variant={following ? 'secondary' : 'outline'} disabled={busy} onClick={() => void toggleSellerFollow(supplier.tenantId)}>{following ? <><UserRoundCheck className="mr-1.5 size-4" />Following</> : <><UserPlus className="mr-1.5 size-4" />Follow seller</>}</Button>}{existing ? <span className="text-xs capitalize text-muted-foreground">{existing.direction === 'incoming' && existing.status === 'pending' ? 'Request awaiting your review' : existing.status}</span> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => request('/relationships', { method: 'POST', body: JSON.stringify({ sellerTenantId: supplier.tenantId }) }), 'Supplier relationship request sent.')}>Connect</Button>}</div></div>})}</div> : <p className="text-sm text-muted-foreground">No other supplier profiles are discoverable yet.</p>}
      </div>
      <aside className="border-t pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        <h2 className="mb-4 text-lg font-semibold">Publish a supplier offer</h2>
        {can('canCreateMarketplaceListing') && <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => request('/listings', { method: 'POST', body: JSON.stringify(listingForm) }), 'Offer published.'); setListingForm((form) => ({ ...form, name: '', description: '', price: '', availableQty: '' })) }}>
          <Field label="Product or offer name" value={listingForm.name} onChange={(e) => setListingForm({ ...listingForm, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3"><Field label="Category" value={listingForm.category} onChange={(e) => setListingForm({ ...listingForm, category: e.target.value })} required /><Field label="Unit" value={listingForm.unit} onChange={(e) => setListingForm({ ...listingForm, unit: e.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Price" type="number" min="0" step="0.01" value={listingForm.price} onChange={(e) => setListingForm({ ...listingForm, price: e.target.value })} required /><Field label="Currency" value={listingForm.currency} onChange={(e) => setListingForm({ ...listingForm, currency: e.target.value.toUpperCase() })} required /></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Minimum order" type="number" min="0.001" step="0.001" value={listingForm.minimumQty} onChange={(e) => setListingForm({ ...listingForm, minimumQty: e.target.value })} required /><Field label="Available quantity" type="number" min="0" step="0.001" value={listingForm.availableQty} onChange={(e) => setListingForm({ ...listingForm, availableQty: e.target.value })} /></div>
          <TextareaField label="Description" value={listingForm.description} onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })} />
          <label className="grid gap-1.5 text-sm font-medium">Visibility<select value={listingForm.visibility} onChange={(e) => setListingForm({ ...listingForm, visibility: e.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm font-normal"><option value="public">Public marketplace</option><option value="private">Approved relationships only</option></select></label>
          <Button type="submit" disabled={busy}><Plus className="mr-2 size-4" />Publish offer</Button>
        </form>}
        {can('canChangeMarketplacePrice') && myListings.length > 0 && <div className="mt-6 border-t pt-4"><h3 className="mb-2 text-sm font-semibold">Your offers ({myListings.length})</h3><div className="max-h-64 space-y-2 overflow-y-auto">{myListings.map((item) => <form key={item.id} className="rounded-md border p-3" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); void run(() => request(`/listings/${item.id}/price`, { method: 'PATCH', body: JSON.stringify({ price: form.get('price'), reason: form.get('reason') }) }), 'Price updated and change history recorded.') }}><div className="mb-2 truncate text-sm font-medium">{item.name} <span className="font-normal text-muted-foreground">· {item.currency} {Number(item.price).toLocaleString()}</span></div><div className="grid grid-cols-[1fr_1fr_auto] gap-2"><input aria-label="New price" name="price" type="number" min="0" step="0.01" required placeholder="New price" className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" /><input aria-label="Price change reason" name="reason" placeholder="Change reason" className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" /><Button variant="outline" size="sm" type="submit" disabled={busy}>Update</Button></div></form>)}</div></div>}
        {(can('canCreateMarketplacePromotion') || can('canRunMarketplaceAds')) && <div className="mt-6 border-t pt-4">
          <h3 className="mb-2 text-sm font-semibold">Create a marketplace campaign</h3>
          <form className="grid gap-3" onSubmit={(event) => {
            event.preventDefault()
            const endpoint = campaignForm.campaignType === 'ad' ? '/ads' : '/promotions'
            const body = new FormData()
            body.append('payload', JSON.stringify(campaignForm))
            campaignImages.forEach((image) => body.append('images', image))
            void run(async () => {
              const result = await requestCampaign(endpoint, body)
              setCampaignImages([])
              return result
            }, campaignForm.campaignType === 'ad' ? 'Sponsored marketplace offer is live.' : 'Marketplace promotion is live.')
            setCampaignForm((form) => ({ ...form, title: '', message: '' }))
          }}>
            <label className="grid gap-1.5 text-sm font-medium">Campaign type<select value={campaignForm.campaignType} onChange={(event) => setCampaignForm({ ...campaignForm, campaignType: event.target.value as 'promotion' | 'ad' })} className="h-10 rounded-md border bg-background px-3 text-sm font-normal">{can('canCreateMarketplacePromotion') && <option value="promotion">Promotion</option>}{can('canRunMarketplaceAds') && <option value="ad">Sponsored offer</option>}</select></label>
            <label className="grid gap-1.5 text-sm font-medium">Marketplace listing<select required value={campaignForm.listingId} onChange={(event) => setCampaignForm({ ...campaignForm, listingId: event.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm font-normal"><option value="">Choose your offer</option>{myListings.map((listing) => <option key={listing.id} value={listing.id}>{listing.name}</option>)}</select></label>
            <Field label="Campaign headline" maxLength={160} value={campaignForm.title} onChange={(event) => setCampaignForm({ ...campaignForm, title: event.target.value })} required />
            <TextareaField label="Campaign message" maxLength={1200} value={campaignForm.message} onChange={(event) => setCampaignForm({ ...campaignForm, message: event.target.value })} required />
            <Field label="Starts" type="datetime-local" value={campaignForm.startsAt} onChange={(event) => setCampaignForm({ ...campaignForm, startsAt: event.target.value })} required />
            <Field label="Ends (optional)" type="datetime-local" value={campaignForm.endsAt} onChange={(event) => setCampaignForm({ ...campaignForm, endsAt: event.target.value })} />
            <label className="grid gap-1.5 text-sm font-medium">Campaign images (up to 4)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { selectCampaignImages(event.target.files); event.currentTarget.value = '' }} className="min-w-0 rounded-md border bg-background px-3 py-2 text-sm font-normal file:mr-3 file:rounded-sm file:border-0 file:bg-muted file:px-3 file:py-1.5" /><span className="text-xs font-normal text-muted-foreground">JPEG, PNG, or WebP · up to 5 MB each. Buyers see two images at a time; image controls and counters are hidden.</span></label>
            {campaignImagePreviews.length > 0 && <div className="grid grid-cols-2 gap-2">{campaignImagePreviews.map(({ file, url }) => <div key={`${file.name}-${file.lastModified}`} className="overflow-hidden border"><img src={url} alt={file.name} className="aspect-[4/3] w-full object-cover" /><p className="truncate px-2 py-1 text-xs text-muted-foreground">{file.name}</p></div>)}</div>}
            {campaignImages.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => setCampaignImages([])}>Clear selected images</Button>}
            <p className="text-xs text-muted-foreground">This creates an in-app marketplace placement. It does not buy external ads or charge an advertising fee.</p>
            <Button type="submit" disabled={busy || !myListings.length || (campaignForm.campaignType === 'ad' ? !can('canRunMarketplaceAds') : !can('canCreateMarketplacePromotion'))}><Plus className="mr-2 size-4" />Publish campaign</Button>
          </form>
          {myCampaigns.length > 0 && <div className="mt-4 space-y-2"><h4 className="text-xs font-semibold">Your campaigns</h4>{myCampaigns.map((campaign) => <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"><span className="min-w-0 truncate">{campaign.title} · {campaign.status}</span>{can('canManageMarketplacePromotions') && campaign.status !== 'cancelled' && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => request(`/promotions/${campaign.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: campaign.status === 'active' ? 'paused' : 'active' }) }), campaign.status === 'active' ? 'Campaign paused.' : 'Campaign resumed.')}>{campaign.status === 'active' ? 'Pause' : 'Resume'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => request(`/promotions/${campaign.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }), 'Campaign cancelled.')}>Cancel</Button></div>}</div>)}</div>}
        </div>}
      </aside>
    </section>}

    {tab === 'rfqs' && <section className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0"><div className="mb-4"><h2 className="text-lg font-semibold">RFQ marketplace</h2><p className="text-sm text-muted-foreground">Open requests are visible to opted-in sellers. Private requests and all offers stay limited to their participants.</p></div>
        {rfqs.length ? <div className="space-y-3">{rfqs.map((rfq) => <article key={rfq.id} className="rounded-md border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold">{rfq.title}</h3><span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs">{rfq.visibility === 'open' ? 'Open marketplace' : 'Private'}</span><span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs">{rfq.status}</span></div><p className="mt-1 text-sm text-muted-foreground">{rfq.buyer?.name || 'Your business'} · {rfq.lines.length} items{rfq.quoteCount ? ` · ${rfq.quoteCount} offers` : ''}{rfq.myQuote ? ` · Your offer v${rfq.myQuote.version} (${rfq.myQuote.status})` : ''}</p></div><Button size="sm" variant="outline" onClick={() => void openRFQ(rfq)}>Open <ArrowRight className="ml-2 size-4" /></Button></div><div className="mt-3 flex flex-wrap gap-2">{rfq.lines.slice(0, 4).map((line) => <span key={line.id} className="rounded-sm border px-2 py-1 text-xs">{line.productName} · {Number(line.quantity).toLocaleString()} {line.unit}</span>)}</div></article>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No requests yet. Publish an open request for marketplace-wide offers, or create a private request for connected suppliers.</div>}
        {activeRFQ && <div className="mt-5 rounded-md border-2 border-emerald-700/40 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{activeRFQ.title}</h3><p className="mt-1 text-xs text-muted-foreground">From {activeRFQ.buyer?.name || 'your business'} · {activeRFQ.visibility} RFQ</p></div><button aria-label="Close RFQ details" onClick={() => setActiveRFQ(null)} className="text-sm text-muted-foreground">Close</button></div><div className="my-4 divide-y rounded-md border">{activeRFQ.lines.map((line) => <div key={line.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><div><div className="font-medium">{line.productName}</div><div className="text-xs text-muted-foreground">{line.specification}</div></div><span className="tabular-nums">{Number(line.quantity).toLocaleString()} {line.unit}</span></div>)}</div>
          {activeRFQ.isMine && <div className="mb-4">{quotes.length > 0 ? <div className="space-y-3"><h4 className="font-medium">Private offers to this buyer</h4>{quotes.map((quote) => <div key={quote.id} className="rounded-md border p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{quote.seller?.name || 'Supplier'}</strong><span className="text-xs text-muted-foreground">Version {quote.version} · {quote.status}</span></div><div className="mt-2 space-y-1">{quote.lines.map((line: any) => <div key={line.id} className="flex justify-between gap-2 text-sm"><span>{activeRFQ.lines.find((x) => x.id === line.rfqLineId)?.productName} · {line.quantity}</span><span className="tabular-nums">{activeRFQ.currency} {Number(line.unitPrice).toLocaleString()}</span></div>)}</div><div className="mt-2 text-xs text-muted-foreground">Delivery {quote.deliveryDays ?? 'not specified'} days · fee {activeRFQ.currency} {Number(quote.deliveryFee).toLocaleString()} · {quote.paymentTerms || 'payment terms not stated'}</div>{activeRFQ.status === 'open' && quote.status === 'submitted' && <Button className="mt-3" size="sm" onClick={() => void run(() => request(`/rfqs/${activeRFQ.id}/quotes/${quote.id}/select`, { method: 'POST' }), 'Offer selected. No stock or accounting entries were created.')}>Select offer</Button>}</div>)}</div> : <p className="text-sm text-muted-foreground">Offers submitted to this RFQ are visible only to you and the supplier who sent them.</p>}
          </div>}
          {activeRFQ.isMine && quotes.find((quote) => quote.status === 'selected') && <div className="mb-4 grid gap-3 rounded-md border border-emerald-700/30 bg-emerald-50/40 p-3"><h4 className="font-medium">Issue purchase order</h4><label className="grid gap-1.5 text-sm font-medium">Receiving branch<select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm font-normal"><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{quotes.find((quote) => quote.status === 'selected')?.lines.map((line: any) => <label key={line.id} className="grid gap-1 text-sm">Inventory item for {activeRFQ.lines.find((x) => x.id === line.rfqLineId)?.productName}<select value={productMappings[line.id] || ''} onChange={(e) => setProductMappings({ ...productMappings, [line.id]: e.target.value })} className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm"><option value="">Map to inventory item before receiving</option>{inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}</select></label>)}<Button disabled={busy || !selectedBranch} onClick={() => { const quote = quotes.find((row) => row.status === 'selected'); if (!quote) return; void run(() => request(`/rfqs/${activeRFQ.id}/quotes/${quote.id}/order`, { method: 'POST', body: JSON.stringify({ branchId: selectedBranch, productMappings }) }), 'Draft purchase order created and waiting for approval.') }}>{busy ? 'Creating…' : 'Create purchase order'}</Button></div>}
          {!activeRFQ.isMine && quotes[0] && <div className="mb-4 rounded-md border p-3"><div className="text-sm font-medium">Your offer, version {quotes[0].version}: {quotes[0].status}</div><Button className="mt-2" size="sm" variant="outline" onClick={() => void openDiscussion(quotes[0].id)}>Open private discussion</Button></div>}
          {activeRFQ.isMine && quotes.map((quote) => <Button key={`discussion-${quote.id}`} className="mb-3 mr-2" size="sm" variant="outline" onClick={() => void openDiscussion(quote.id)}>Discuss with {quote.seller?.name || 'supplier'}</Button>)}
          {discussion && <section className="mb-4 rounded-md border bg-muted/20 p-3"><h4 className="mb-2 text-sm font-semibold">Private negotiation</h4><div className="mb-3 max-h-52 space-y-2 overflow-y-auto">{discussion.messages.length ? discussion.messages.map((message) => <div key={message.id} className="rounded-md bg-background p-2 text-sm"><p className="whitespace-pre-wrap break-words">{message.body}</p><time className="mt-1 block text-right text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</time></div>) : <p className="text-sm text-muted-foreground">No messages yet.</p>}</div><form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await request(`/rfqs/${activeRFQ.id}/quotes/${discussion.quoteId}/messages`, { method: 'POST', body: JSON.stringify({ body: messageDraft }) }); const data = await request<{ messages: any[] }>(`/rfqs/${activeRFQ.id}/quotes/${discussion.quoteId}/messages`); setDiscussion({ quoteId: discussion.quoteId, messages: data.messages }); setMessageDraft('') }, 'Message sent privately.') }}><input value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} aria-label="Negotiation message" maxLength={4000} placeholder="Discuss this offer privately" className="h-10 min-w-[200px] flex-1 rounded-md border bg-background px-3 text-sm" required /><Button size="sm" type="submit" disabled={busy}><Send className="mr-2 size-4" />Send</Button></form></section>}
          {!activeRFQ.isMine && activeRFQ.status === 'open' && <form className="grid gap-3 border-t pt-4" onSubmit={(e) => { e.preventDefault(); void run(() => request(`/rfqs/${activeRFQ.id}/quotes`, { method: 'POST', body: JSON.stringify({ notes: quoteDraft.notes, paymentTerms: quoteDraft.paymentTerms, deliveryDays: quoteDraft.deliveryDays || undefined, lines: activeRFQ.lines.map((line) => ({ rfqLineId: line.id, quantity: quoteDraft[`qty-${line.id}`] || line.quantity, unitPrice: quoteDraft[`price-${line.id}`], taxRate: quoteDraft[`tax-${line.id}`] || 0 })) }) }), 'Quote submitted privately to the buyer.') }}><h4 className="font-medium">Submit your private offer</h4>{activeRFQ.lines.map((line) => <div key={line.id} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_90px_110px_100px]"><div className="self-center text-sm">{line.productName}<div className="text-xs text-muted-foreground">Requested {line.quantity} {line.unit}</div></div><input aria-label={`${line.productName} quantity`} type="number" min="0.001" max={Number(line.quantity)} step="0.001" placeholder="Qty" className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" value={quoteDraft[`qty-${line.id}`] ?? line.quantity} onChange={(e) => setQuoteDraft({ ...quoteDraft, [`qty-${line.id}`]: e.target.value })} required /><input aria-label={`${line.productName} unit price`} type="number" min="0" step="0.01" placeholder="Unit price" className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" value={quoteDraft[`price-${line.id}`] || ''} onChange={(e) => setQuoteDraft({ ...quoteDraft, [`price-${line.id}`]: e.target.value })} required /><input aria-label={`${line.productName} tax rate percent`} type="number" min="0" max="100" step="0.01" placeholder="Tax %" className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" value={quoteDraft[`tax-${line.id}`] ?? '0'} onChange={(e) => setQuoteDraft({ ...quoteDraft, [`tax-${line.id}`]: e.target.value })} /></div>)}<div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Field label="Delivery days" type="number" min="0" value={quoteDraft.deliveryDays || ''} onChange={(e) => setQuoteDraft({ ...quoteDraft, deliveryDays: e.target.value })} /><Field label="Payment terms" value={quoteDraft.paymentTerms || ''} onChange={(e) => setQuoteDraft({ ...quoteDraft, paymentTerms: e.target.value })} /></div><TextareaField label="Offer notes" value={quoteDraft.notes || ''} onChange={(e) => setQuoteDraft({ ...quoteDraft, notes: e.target.value })} /><Button type="submit" disabled={busy}><Send className="mr-2 size-4" />Submit quote</Button></form>}
        </div>}
      </div>
      <aside className="border-t pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">{can('canCreateProcurementRFQ') && <><h2 className="mb-4 text-lg font-semibold">Create a request</h2><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => request('/rfqs', { method: 'POST', body: JSON.stringify(rfqForm) }), 'Request published to the selected audience.'); setRfqForm({ ...rfqForm, title: '', notes: '', lines: [{ ...blankLine }] }) }}>
        <Field label="Request title" value={rfqForm.title} onChange={(e) => setRfqForm({ ...rfqForm, title: e.target.value })} required />
        <label className="grid gap-1.5 text-sm font-medium">Audience<select value={rfqForm.visibility} onChange={(e) => setRfqForm({ ...rfqForm, visibility: e.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm font-normal"><option value="open">Open to all opted-in sellers</option><option value="private">Specific connected suppliers</option></select></label>
        {rfqForm.visibility === 'private' && <fieldset className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3"><legend className="px-1 text-xs text-muted-foreground">Connected suppliers</legend>{activeRelationships.filter((r) => r.direction === 'outgoing').map((r) => <label key={r.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rfqForm.sellerTenantIds.includes(r.counterparty?.id || '')} onChange={(e) => setRfqForm((form) => ({ ...form, sellerTenantIds: e.target.checked ? [...form.sellerTenantIds, r.counterparty?.id || ''] : form.sellerTenantIds.filter((id) => id !== r.counterparty?.id) }))} />{r.counterparty?.name}</label>)}{!activeRelationships.some((r) => r.direction === 'outgoing') && <span className="text-xs text-muted-foreground">No approved suppliers. Connect and get approval first.</span>}</fieldset>}
        {rfqForm.lines.map((line, index) => <div key={index} className="grid gap-2 rounded-md border p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">ITEM {index + 1}</span>{rfqForm.lines.length > 1 && <button type="button" className="text-xs text-red-700" onClick={() => setRfqForm((form) => ({ ...form, lines: form.lines.filter((_, i) => i !== index) }))}>Remove</button>}</div><Field label="Product/specification" value={line.productName} onChange={(e) => setRfqForm((form) => ({ ...form, lines: form.lines.map((x, i) => i === index ? { ...x, productName: e.target.value } : x) }))} required /><div className="grid grid-cols-2 gap-2"><Field label="Quantity" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setRfqForm((form) => ({ ...form, lines: form.lines.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x) }))} required /><Field label="Unit" value={line.unit} onChange={(e) => setRfqForm((form) => ({ ...form, lines: form.lines.map((x, i) => i === index ? { ...x, unit: e.target.value } : x) }))} required /></div></div>)}
        <Button type="button" variant="outline" onClick={() => setRfqForm((form) => ({ ...form, lines: [...form.lines, { ...blankLine }] }))}><Plus className="mr-2 size-4" />Add item</Button>
        <Field label="Delivery location" value={rfqForm.deliveryAddress} onChange={(e) => setRfqForm({ ...rfqForm, deliveryAddress: e.target.value })} />
        <TextareaField label="Notes and requirements" value={rfqForm.notes} onChange={(e) => setRfqForm({ ...rfqForm, notes: e.target.value })} />
        <Button type="submit" disabled={busy}><Send className="mr-2 size-4" />Publish RFQ</Button>
      </form></>}</aside>
    </section>}

    {tab === 'relationships' && <section className="grid gap-8 lg:grid-cols-2"><div><h2 className="mb-1 text-lg font-semibold">Connected suppliers</h2><p className="mb-4 text-sm text-muted-foreground">Private RFQs can only be shared with relationships the supplier has approved.</p>{relationships.length ? <div className="divide-y rounded-md border">{relationships.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="font-medium">{row.counterparty?.name || 'Business'}</div><div className="mt-1 text-xs capitalize text-muted-foreground">{row.direction} · {row.status}</div></div>{row.direction === 'incoming' && row.status === 'pending' && <div className="flex gap-2"><Button size="sm" onClick={() => void run(() => request(`/relationships/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }), 'Supplier relationship approved.')}>Approve</Button><Button size="sm" variant="outline" onClick={() => void run(() => request(`/relationships/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }), 'Supplier request declined.')}>Decline</Button></div>}{row.status === 'active' && <Button size="sm" variant="outline" onClick={() => void run(() => request(`/relationships/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'suspended' }) }), 'Relationship suspended.')}>Suspend</Button>}</div>)}</div> : <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No supplier relationships yet. Find opted-in suppliers in Marketplace and request a connection.</p>}</div><div><h2 className="mb-1 text-lg font-semibold">Pending inbound requests</h2><p className="mb-4 text-sm text-muted-foreground">Approve only businesses you are ready to share private procurement with.</p>{incomingRequests.length ? <div className="space-y-2">{incomingRequests.map((row) => <div key={row.id} className="rounded-md border p-4"><strong>{row.counterparty?.name}</strong><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void run(() => request(`/relationships/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }), 'Supplier relationship approved.')}>Approve</Button><Button size="sm" variant="outline" onClick={() => void run(() => request(`/relationships/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }), 'Supplier request declined.')}>Decline</Button></div></div>)}</div> : <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No businesses are waiting for approval.</p>}</div></section>}

    {tab === 'profile' && <section className="max-w-3xl"><div className="mb-5"><h2 className="text-lg font-semibold">Supplier onboarding profile</h2><p className="mt-1 text-sm text-muted-foreground">Your existing business account is your network identity. Opting into discovery publishes only this profile and the offers you choose to list.</p></div><form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void run(() => request('/profile', { method: 'PUT', body: JSON.stringify(profile) }), 'Supplier profile saved.') }}><label className="grid gap-1.5 text-sm font-medium text-foreground">Seller type<select value={profile.sellerType} onChange={(e) => setProfile({ ...profile, sellerType: e.target.value })} className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal"><option value="supplier">Supplier / reseller</option><option value="manufacturer">Manufacturer</option><option value="both">Supplier and manufacturer</option></select></label><Field label="Business category" value={profile.category} onChange={(e) => setProfile({ ...profile, category: e.target.value })} placeholder="Food wholesaler, building materials..." required /><Field label="Website (optional)" type="url" value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="https://" /><div className="sm:col-span-2"><TextareaField label="Business description" value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} placeholder="What do you supply, manufacture, or distribute?" /></div><label className="flex items-start gap-3 rounded-md border p-4 sm:col-span-2"><input type="checkbox" className="mt-1" checked={profile.discoverable} onChange={(e) => setProfile({ ...profile, discoverable: e.target.checked })} /><span><span className="block font-medium">Show my seller profile in discovery</span><span className="mt-1 block text-sm text-muted-foreground">Your public business name, seller type, category, description, logo, and public listings can be found by other opted-in businesses. Private prices, customers, financials, and purchase history are never listed.</span></span></label><Button type="submit" disabled={busy} className="sm:col-span-2"><ShieldCheck className="mr-2 size-4" />Save seller profile</Button></form><div className="mt-6 grid gap-3 border-t pt-5 text-sm text-muted-foreground sm:grid-cols-3"><div className="flex gap-2"><Globe2 className="size-4 shrink-0 text-emerald-700" />Opt-in discovery is controlled by your business.</div><div className="flex gap-2"><CircleDollarSign className="size-4 shrink-0 text-emerald-700" />Published price updates retain a timestamped history.</div><div className="flex gap-2"><Clock3 className="size-4 shrink-0 text-emerald-700" />A quote is not an order, payment, or stock receipt.</div></div></section>}
    {tab === 'marketplace' && marketInsight && <aside role="status" aria-live="polite" className={`fixed bottom-20 right-3 z-40 w-[min(24rem,calc(100vw-1.5rem))] border border-emerald-900/15 bg-background p-4 shadow-lg transition duration-300 sm:bottom-4 sm:right-4 ${marketInsightVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'}`}><div className="flex items-start gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-sm bg-emerald-50 text-emerald-800"><Sparkles className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase text-emerald-800">AI marketplace note</p><h2 className="mt-0.5 break-words text-sm font-semibold">{marketInsight.title}</h2><p className="mt-1 break-words text-sm leading-5 text-muted-foreground">{marketInsight.message}</p>{marketInsight.listingId && <button type="button" className="mt-2 text-xs font-medium text-emerald-800 underline underline-offset-2" onClick={() => { document.getElementById(`market-listing-${marketInsight.listingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setMarketInsightVisible(false); setTimeout(() => setMarketInsight(null), 350) }}>View offer</button>}</div><button type="button" aria-label="Dismiss marketplace insight" className="-mr-1 -mt-1 rounded-sm p-1 text-muted-foreground hover:bg-muted" onClick={() => { setMarketInsightVisible(false); setTimeout(() => setMarketInsight(null), 350) }}><X className="size-4" /></button></div></aside>}
  </main>
}

