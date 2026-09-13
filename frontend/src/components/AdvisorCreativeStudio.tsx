import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, Download, FileText, ImagePlus, Loader2, Plus, Save, Search, Square, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { copyText, downloadVisualPdf, downloadVisualPng, renderAdvisorVisual, visualValue, type AdvisorVisual, type CreativeCopy } from '@/lib/advisorVisuals'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const field = 'mt-1 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm'
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
const reportNames: Record<string, string> = { sales: 'Sales', inventory: 'Inventory', receivables: 'Customer balances', hr: 'HR' }
async function request(path: string, options: RequestInit = {}) {
  const response = await apiFetch(`/api/ai${path}`, options), data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Unable to load the visual studio.')
  return data
}
const initial = { kind: 'flyer', brief: '', reportType: 'sales', tone: 'professional', platform: 'facebook', format: 'portrait', palette: 'green', artwork: 'auto', productId: '', layout: 'auto' }

export default function AdvisorCreativeStudio({ conversationId, disabled, days, ensureConversation }: {
  conversationId?: string; disabled: boolean; days: number; ensureConversation: (title: string, signal: AbortSignal) => Promise<string>
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'library' | 'create' | 'preview'>('library')
  const [form, setForm] = useState(initial)
  const [products, setProducts] = useState<{ id: string; name: string; price: number }[]>([])
  const [reports, setReports] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AdvisorVisual[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AdvisorVisual | null>(null)
  const [copy, setCopy] = useState<CreativeCopy | null>(null)
  const [editing, setEditing] = useState(false)
  const [pages, setPages] = useState<HTMLCanvasElement[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const retryRef = useRef<{ signature: string; id: string } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const listVersion = useRef(0)
  const imageRef = useRef<{ id: string; url: string } | null>(null)
  const alive = useRef(true)

  useEffect(() => { alive.current = true; return () => { alive.current = false; listVersion.current++; controllerRef.current?.abort(); if (imageRef.current) URL.revokeObjectURL(imageRef.current.url) } }, [])
  async function list(next = 1, append = false) {
    const version = ++listVersion.current
    if (!conversationId) { setItems([]); setMore(false); setLoading(false); return }
    setLoading(true)
    try {
      const data = await request(`/conversations/${encodeURIComponent(conversationId)}/artifacts?page=${next}`)
      if (!alive.current || version !== listVersion.current) return
      setItems(previous => append ? [...previous, ...data.artifacts.filter((item: AdvisorVisual) => !previous.some(row => row.id === item.id))] : data.artifacts)
      setMore(data.hasMore); setPage(next)
    } catch (error: any) { if (alive.current && version === listVersion.current) setError(error.message) }
    finally { if (alive.current && version === listVersion.current) setLoading(false) }
  }
  useEffect(() => { if (open && view === 'library') { setError(''); void list() } return () => { listVersion.current++ } }, [open, view, conversationId])
  useEffect(() => {
    if (!open || view !== 'create') return
    const controller = new AbortController()
    const timer = window.setTimeout(() => request(`/creative-options?search=${encodeURIComponent(search)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      setProducts(data.products); setReports(data.reportTypes)
      setForm(previous => data.reportTypes.includes(previous.reportType) ? previous : { ...previous, reportType: data.reportTypes[0] || '' })
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) }), 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [open, view, search])
  useEffect(() => {
    if (!open || view !== 'preview' || !selected?.data) return
    const controller = new AbortController()
    setRendering(true); setPages([]); setPageIndex(0)
    void (async () => {
      try {
        let url: string | undefined
        if (selected.imageMime) {
          if (imageRef.current?.id === selected.id) url = imageRef.current.url
          else {
            const response = await apiFetch(`/api/ai/artifacts/${encodeURIComponent(selected.id)}/image`, { signal: controller.signal })
            if (!response.ok) throw new Error('Unable to load this artwork. Reopen the preview to retry.')
            const blob = await response.blob()
            if (controller.signal.aborted) return
            if (imageRef.current) URL.revokeObjectURL(imageRef.current.url)
            url = URL.createObjectURL(blob); imageRef.current = { id: selected.id, url }
          }
        }
        const rendered = await renderAdvisorVisual(selected, url)
        if (!controller.signal.aborted) setPages(rendered)
      } catch (error: any) { if (!controller.signal.aborted) setError(error.message) }
      finally { if (!controller.signal.aborted) setRendering(false) }
    })()
    return () => controller.abort()
  }, [selected, open, view])
  useEffect(() => {
    const canvas = pages[pageIndex], container = canvasRef.current
    if (!canvas || !container) return
    canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.display = 'block'
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${selected?.title || 'Visual'} preview, page ${pageIndex + 1}`)
    container.replaceChildren(canvas)
    return () => { if (canvas.parentNode === container) container.removeChild(canvas) }
  }, [pages, pageIndex, view, selected?.title])
  function preview(item: AdvisorVisual) { setSelected(item); setCopy(item.data?.copy || null); setEditing(false); setDeleting(false); setError(''); setView('preview') }
  function create() { setError(''); setView('create'); setDeleting(false) }
  async function generate(event: FormEvent) {
    event.preventDefault()
    if (controllerRef.current || disabled || !form.brief.trim()) return
    const controller = new AbortController(); controllerRef.current = controller
    const signature = JSON.stringify({ ...form, days })
    if (retryRef.current?.signature !== signature) retryRef.current = { signature, id: crypto.randomUUID() }
    setBusy(true); setError('')
    const timer = window.setTimeout(() => controller.abort(), 190000)
    try {
      const id = conversationId || await ensureConversation(form.brief.slice(0, 100), controller.signal)
      const data = await request(`/conversations/${encodeURIComponent(id)}/artifacts`, { method: 'POST', signal: controller.signal, body: JSON.stringify({ ...form, productId: form.kind === 'report' ? null : form.productId || null, days, requestId: retryRef.current.id }) })
      if (controller.signal.aborted || !alive.current) return
      retryRef.current = null; preview(data.artifact)
    } catch (error: any) { if (alive.current) setError(controller.signal.aborted ? 'Generation stopped or timed out. Check saved visuals before retrying.' : error.message) }
    finally { window.clearTimeout(timer); if (controllerRef.current === controller) { controllerRef.current = null; if (alive.current) setBusy(false) } }
  }
  async function save() {
    if (!selected || !copy || busy) return
    setBusy(true); setError('')
    try {
      const { headline, subheading, body, cta, caption, offer } = copy
      const data = await request(`/artifacts/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: JSON.stringify({ headline, subheading, body, cta, caption, offer }) })
      if (alive.current) preview(data.artifact)
    } catch (error: any) { if (alive.current) setError(error.message) }
    finally { if (alive.current) setBusy(false) }
  }
  async function remove() {
    if (!selected || busy) return
    setBusy(true); setError('')
    try { await request(`/artifacts/${encodeURIComponent(selected.id)}`, { method: 'DELETE' }); if (alive.current) { setSelected(null); setDeleting(false); setView('library') } }
    catch (error: any) { if (alive.current) setError(error.message) }
    finally { if (alive.current) setBusy(false) }
  }
  async function download(format: 'pdf' | 'png') {
    if (!selected || !pages.length || busy) return
    setBusy(true); setError('')
    try { if (format === 'pdf') await downloadVisualPdf(selected, pages); else await downloadVisualPng(selected, pages[pageIndex], pageIndex) }
    catch (error: any) { setError(error.message || 'The download could not be prepared.') }
    finally { setBusy(false) }
  }
  return <>
    <Button variant="outline" size="sm" disabled={disabled} onClick={() => { setView('library'); setOpen(true); setError('') }}><ImagePlus className="mr-1 h-4 w-4" />Create visual</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}><DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-[1440px] flex-col gap-3 overflow-hidden rounded-lg p-3 sm:max-w-[min(1440px,96vw)] sm:p-5" onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => { if (busy) event.preventDefault() }}>
      <DialogHeader className="shrink-0 pr-6 text-left"><DialogTitle className="break-words [overflow-wrap:anywhere]">{view === 'preview' ? selected?.title : 'Visual studio'}</DialogTitle><DialogDescription>{view === 'preview' ? `${selected?.kind === 'report' ? 'Private report' : 'Marketing draft'} | ${date(selected?.createdAt || new Date().toISOString())}` : 'Flyers, social posts and business reports'}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="shrink-0 break-words text-sm text-destructive">{error}</p>}
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {view === 'library' && <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Saved in this conversation</h3><Button size="sm" onClick={create}><Plus className="mr-1 h-4 w-4" />New visual</Button></div>
          {loading && <p role="status" className="text-sm">Loading visuals...</p>}
          {!items.length && !loading && <p className="py-8 text-center text-sm text-muted-foreground">No saved visuals</p>}
          <ul className="divide-y">{items.map(item => <li key={item.id} className="flex min-w-0 items-center gap-3 py-3"><button type="button" disabled={item.status !== 'complete'} onClick={() => preview(item)} className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:opacity-60">
            {item.kind === 'report' ? <FileText className="mt-1 h-5 w-5 shrink-0 text-emerald-700" /> : <ImagePlus className="mt-1 h-5 w-5 shrink-0 text-rose-700" />}<span className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">{item.title}<span className="mt-1 block text-xs text-muted-foreground">{item.kind} | {date(item.createdAt)} | {item.status}</span></span></button>
            {item.status !== 'complete' && <Button variant="ghost" size="icon" title="Delete visual" aria-label="Delete visual" onClick={() => { setSelected(item); setDeleting(true) }}><Trash2 className="h-4 w-4" /></Button>}</li>)}</ul>
          {more && <Button variant="outline" size="sm" disabled={loading} onClick={() => void list(page + 1, true)}>More visuals</Button>}
        </div>}
        {view === 'create' && <form onSubmit={generate} className="space-y-4">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setView('library')}><ArrowLeft className="mr-1 h-4 w-4" />Saved visuals</Button>
          <fieldset disabled={busy} className="space-y-4">
            <div role="group" aria-label="Visual type" className="flex flex-wrap gap-1 border-b pb-2">{[['flyer', 'Flyer'], ['social', 'Social post'], ['report', 'Report']].map(([value, label]) => <button key={value} type="button" aria-pressed={form.kind === value} onClick={() => setForm({ ...form, kind: value })} className={`border-b-2 px-4 py-2 text-sm ${form.kind === value ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground'}`}>{label}</button>)}</div>
            <label className="block text-sm">Creative brief<textarea required aria-label="Creative brief" value={form.brief} maxLength={3000} onChange={event => setForm({ ...form, brief: event.target.value })} rows={3} className={field} /></label>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {form.kind === 'report' ? <label className="block min-w-0 text-sm">Report<select aria-label="Report type" required value={form.reportType} onChange={event => setForm({ ...form, reportType: event.target.value })} className={field}><option value="" disabled>Choose report</option>{reports.map(type => <option key={type} value={type}>{reportNames[type]}</option>)}</select></label> : <>
                <label className="block min-w-0 text-sm">Channel<select aria-label="Channel" value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })} className={field}>{['facebook', 'instagram', 'whatsapp', 'linkedin'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
                <label className="block min-w-0 text-sm">Size<select aria-label="Visual size" value={form.format} onChange={event => setForm({ ...form, format: event.target.value })} className={field}><option value="portrait">Portrait (1080 x 1350)</option><option value="square">Square (1080 x 1080)</option><option value="story">Story (1080 x 1920)</option></select></label>
                <label className="block min-w-0 text-sm">Layout<select aria-label="Design layout" value={form.layout} onChange={event => setForm({ ...form, layout: event.target.value })} className={field}><option value="auto">Art-directed</option><option value="product">Product spotlight</option><option value="offer">Bold offer</option><option value="editorial">Editorial</option></select></label>
                <label className="block min-w-0 text-sm">Artwork<select aria-label="Artwork" value={form.artwork} onChange={event => setForm({ ...form, artwork: event.target.value })} className={field}><option value="auto">Automatic</option><option value="product">Product photo</option><option value="none">Text only</option></select></label>
              </>}
              <label className="block min-w-0 text-sm">Tone<select aria-label="Tone" value={form.tone} onChange={event => setForm({ ...form, tone: event.target.value })} className={field}><option value="friendly">Friendly</option><option value="professional">Professional</option><option value="energetic">Energetic</option></select></label>
              <fieldset className="min-w-0"><legend className="text-sm">Colors</legend><div className="mt-2 flex gap-3">{[['green', '#11634c'], ['blue', '#1f5aa6'], ['berry', '#992651']].map(([name, color]) => <button type="button" key={name} aria-label={`${name} palette`} title={`${name} palette`} aria-pressed={form.palette === name} onClick={() => setForm({ ...form, palette: name })} style={{ backgroundColor: color }} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${form.palette === name ? 'border-foreground ring-2 ring-offset-2 ring-muted-foreground' : 'border-transparent'}`}>{form.palette === name && <Check className="h-4 w-4 text-white" />}</button>)}</div></fieldset>
            </div>
            {form.kind !== 'report' && <div className="grid gap-3 sm:grid-cols-2"><label className="block min-w-0 text-sm">Find product or service<div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Find product or service" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} className={`${field} pl-9`} /></div></label>
              <label className="block min-w-0 text-sm">Product or service<select aria-label="Product or service" value={form.productId} onChange={event => setForm({ ...form, productId: event.target.value })} className={field}><option value="">Business promotion (no product)</option>{form.productId && !products.some(row => row.id === form.productId) && <option value={form.productId}>Selected product</option>}{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label></div>}
            {form.kind === 'report' && <p className="text-xs text-muted-foreground">{days}-day period. Includes only data available to your account. Customer reports are private business information.</p>}
          </fieldset>
          <div className="flex flex-wrap items-center justify-end gap-3">{busy && <><span role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Creating your visual...</span><Button type="button" variant="outline" size="icon" aria-label="Stop generation" title="Stop generation" onClick={() => controllerRef.current?.abort()}><Square className="h-4 w-4" /></Button></>}
            <Button type="submit" disabled={busy || disabled || !form.brief.trim() || (form.kind === 'report' && !form.reportType)}><ImagePlus className="mr-2 h-4 w-4" />Generate</Button></div>
        </form>}
        {view === 'preview' && selected?.data && <div className="space-y-3">
          {busy && !editing && !deleting && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Preparing download...</p>}
          <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setView('library')}><ArrowLeft className="mr-1 h-4 w-4" />Saved visuals</Button><div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy || rendering || !pages.length || editing} onClick={() => void download('png')}><Download className="mr-1 h-4 w-4" />PNG{pages.length > 1 ? ' page' : ''}</Button>
            <Button variant="outline" size="sm" disabled={busy || rendering || !pages.length || editing} onClick={() => void download('pdf')}><Download className="mr-1 h-4 w-4" />PDF</Button>
            <Button variant="ghost" size="icon" disabled={busy} aria-label="Delete visual" title="Delete visual" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" /></Button></div></div>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <div className="min-w-0"><div className="mx-auto max-w-[660px] border bg-muted p-2" aria-busy={rendering}>{rendering && <p role="status" className="p-6 text-sm">Preparing preview...</p>}<div ref={canvasRef} /></div>
              {pages.length > 1 && <div className="mt-2 flex items-center justify-center gap-3"><Button variant="outline" size="icon" disabled={!pageIndex} title="Previous page" aria-label="Previous page" onClick={() => setPageIndex(pageIndex - 1)}><ArrowLeft className="h-4 w-4" /></Button><span className="text-sm tabular-nums">{pageIndex + 1} / {pages.length}</span><Button variant="outline" size="icon" disabled={pageIndex >= pages.length - 1} title="Next page" aria-label="Next page" onClick={() => setPageIndex(pageIndex + 1)}><ArrowRight className="h-4 w-4" /></Button></div>}
            </div>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{selected.kind === 'report' ? 'Commentary' : 'Post caption'}</h3><Button variant="ghost" size="icon" aria-label="Copy caption" title={copied ? 'Copied' : 'Copy caption'} onClick={async () => { try { await copyText([selected.data!.copy.caption, selected.data!.copy.hashtags.join(' ')].filter(Boolean).join('\n\n')); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch (error: any) { setError(error.message) } }}>{copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}</Button></div>
              {editing && copy ? <form onSubmit={event => { event.preventDefault(); void save() }} className="space-y-3">
                {(selected.kind === 'report' ? [['body', 'Report commentary', 320], ['caption', 'Summary', 2400]] : [['headline', 'Headline', 100], ['offer', 'Offer', 70], ['subheading', 'Subheading', 180], ['body', 'Body', 320], ['cta', 'Call to action', 70], ['caption', 'Caption', 2400]]).map(([key, label, max]) => <label key={key} className="block text-sm">{label}<textarea aria-label={String(label)} required={key === 'headline'} maxLength={Number(max)} rows={key === 'caption' ? 5 : 2} value={copy[key as keyof Omit<CreativeCopy, 'hashtags'>] || ''} onChange={event => setCopy({ ...copy, [key]: event.target.value })} className={field} /></label>)}
                <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}><Save className="mr-1 h-4 w-4" />Save wording</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setCopy(selected.data!.copy); setEditing(false) }}>Cancel</Button></div>
              </form> : <><p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{selected.data.copy.caption}</p><p className="break-words text-sm text-primary [overflow-wrap:anywhere]">{selected.data.copy.hashtags.join(' ')}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>Edit wording</Button></>}
              {selected.kind === 'report' && <details className="text-sm"><summary className="cursor-pointer font-medium">Report figures and scope</summary><div className="mt-2 space-y-2 break-words">{selected.data.report?.metrics.map(metric => <p key={metric.label}>{metric.label}: <strong>{metric.format === 'currency' ? `${selected.data!.brand.currency} ` : ''}{metric.value.toLocaleString('en-GB')}</strong></p>)}{selected.data.report?.limitations.map((line, index) => <p key={index} className="text-xs text-muted-foreground">{line}</p>)}</div></details>}
              {selected.data.warnings.map((warning, index) => <p key={index} className="break-words text-xs text-amber-800 dark:text-amber-300">{warning}</p>)}
              <Button variant="ghost" size="sm" disabled={busy || editing} onClick={() => { retryRef.current = null; setForm({ ...initial, kind: selected.kind, brief: selected.data!.brief, layout: selected.data!.layout || 'auto', format: selected.data!.format, palette: selected.data!.palette, platform: selected.data!.platform, tone: selected.data!.tone || initial.tone, productId: selected.data!.productId || '', reportType: selected.data!.reportType || initial.reportType }); create() }}><Plus className="mr-1 h-4 w-4" />Another version</Button>
            </div>
          </div>
          {selected.kind === 'report' && <details className="min-w-0 border-t pt-3 text-sm"><summary className="cursor-pointer font-medium">Report data tables</summary>{selected.data.report?.tables.map(table => <div key={table.title} className="mt-4 min-w-0"><h4 className="mb-2 font-semibold">{table.title}</h4><div className="overflow-x-auto" tabIndex={0} role="region" aria-label={table.title}><table className="w-full min-w-[580px] border-collapse text-left"><thead><tr>{table.columns.map(column => <th key={column.key} scope="col" className="border-b p-2">{column.label}</th>)}</tr></thead><tbody>{table.rows.map((row, index) => <tr key={index}>{table.columns.map(column => <td key={column.key} className={`border-b p-2 ${column.format === 'currency' ? 'whitespace-nowrap tabular-nums' : 'break-words'}`}>{visualValue(row[column.key], column.format, selected.data!.brand.currency)}</td>)}</tr>)}</tbody></table></div></div>)}</details>}
        </div>}
        {deleting && <div role="alertdialog" aria-label="Delete saved visual" className="mt-4 space-y-3 border-t pt-4"><p className="break-words text-sm">Permanently delete {selected?.title} and its artwork?</p><div className="flex gap-2"><Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>Delete permanently</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => setDeleting(false)}>Cancel</Button></div></div>}
      </div>
    </DialogContent></Dialog>
  </>
}
