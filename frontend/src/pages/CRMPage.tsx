import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Megaphone, Plus, Search, Ticket, Users, X } from 'lucide-react'
import { rentalsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pagination } from '@/components/Pagination'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { appConfirm } from '@/lib/appFeedback'

type Customer = { id: string; name: string; phone?: string | null; email?: string | null; rentalCount: number; activeRentalCount: number; overdueRentalCount: number; lifetimeRentalValue: number; outstandingBalance: number; lastHireDate?: string | null; nextReturnDate?: string | null }
type CrmRecord = Record<string, any> & { id: string; color?: string }
type Workspace = { leads: CrmRecord[]; activities: CrmRecord[]; cases: CrmRecord[]; campaigns: CrmRecord[] }
type Collection = keyof Workspace
const emptyWorkspace: Workspace = { leads: [], activities: [], cases: [], campaigns: [] }
const colors: Record<string, string> = { yellow: 'bg-yellow-400', pink: 'bg-pink-500', blue: 'bg-sky-500', green: 'bg-emerald-500', orange: 'bg-orange-500', purple: 'bg-violet-500' }
const colorNames = Object.keys(colors)
const stages = ['new', 'qualified', 'proposal', 'won', 'lost']
const kinds = ['call', 'email', 'meeting', 'note', 'follow_up']
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined }).format(new Date(value)) : '—'
const inputDate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export default function CRMPage() {
  const { toast } = useToast()
  const { hasPermission } = useJWTAuth()
  const canCreate = hasPermission('canCreateRental')
  const canEdit = hasPermission('canEditRental')
  const canDelete = hasPermission('canDeleteRental')
  const canViewPhone = hasPermission('canViewCustomerPhone')
  const canViewEmail = hasPermission('canViewCustomerEmail')
  const canViewFinancial = hasPermission('canViewCustomerBalance')
  const canViewCustomer = hasPermission('canViewCustomer')
  const canConvertProspect = hasPermission('canCreateCustomer') || hasPermission('canCreateReceivable')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'pipeline' | 'contacts' | 'activities' | 'support' | 'marketing'>('overview')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 })
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({})
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()))
  const [formOpen, setFormOpen] = useState(false)
  const [formType, setFormType] = useState<Collection>('activities')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<{ collection: Collection; record: CrmRecord } | null>(null)
  const [conversionLead, setConversionLead] = useState<CrmRecord | null>(null)
  const [conversionOpen, setConversionOpen] = useState(false)
  const [conversionMode, setConversionMode] = useState<'create' | 'link'>('create')
  const [conversionCreditLimit, setConversionCreditLimit] = useState('')
  const [conversionCustomerName, setConversionCustomerName] = useState('')
  const [conversionSearch, setConversionSearch] = useState('')
  const [conversionCustomers, setConversionCustomers] = useState<Customer[]>([])
  const [conversionCustomerId, setConversionCustomerId] = useState('')
  const [conversionLoading, setConversionLoading] = useState(false)
  const [conversionSaving, setConversionSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = new Date(month.getFullYear(), month.getMonth(), 1)
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999)
      const [crm, saved] = await Promise.all([
        rentalsApi.crmOverview({ from: from.toISOString(), to: to.toISOString(), page, limit: 25, search: search.trim() || undefined }),
        rentalsApi.crmWorkspace(),
      ])
      setCustomers(crm?.customers || [])
      setPagination(crm?.customerPagination || { page: 1, limit: 25, total: 0, pages: 0 })
      setSegmentCounts(crm?.segmentCounts || {})
      setWorkspace({ ...emptyWorkspace, ...(saved?.workspace || {}) })
    } catch (error: any) {
      toast({ title: 'CRM could not load', description: error?.message || 'Check your connection and retry.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [month, page, search, toast])

  useEffect(() => { const timer = window.setTimeout(() => void load(), search ? 250 : 0); return () => window.clearTimeout(timer) }, [load, search])
  useEffect(() => { const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer) }, [load])

  useEffect(() => {
    if (!conversionOpen || conversionMode !== 'link' || !canViewCustomer || conversionSearch.trim().length < 2) { setConversionCustomers([]); return }
    let active = true
    const timer = window.setTimeout(async () => {
      setConversionLoading(true)
      try {
        const result = await rentalsApi.crmFindCustomers({ page: 1, limit: 25, search: conversionSearch.trim() })
        if (active) setConversionCustomers(result?.customers || [])
      } catch { if (active) setConversionCustomers([]) }
      finally { if (active) setConversionLoading(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [conversionOpen, conversionMode, conversionSearch, canViewCustomer])

  const allCalendarItems = useMemo(() => [
    ...workspace.activities.map(record => ({ id: record.id, title: record.subject, date: record.nextFollowUpAt || record.occurredAt, color: record.color || 'blue', label: record.kind || 'Activity', collection: 'activities' as Collection, record })),
    ...workspace.cases.filter(record => record.dueAt && !['resolved', 'closed'].includes(record.status)).map(record => ({ id: record.id, title: record.subject, date: record.dueAt, color: record.color || 'orange', label: 'Support due', collection: 'cases' as Collection, record })),
    ...workspace.leads.filter(record => record.nextActionAt && !['won', 'lost'].includes(record.stage)).map(record => ({ id: record.id, title: record.nextAction || record.title, date: record.nextActionAt, color: 'purple', label: 'Lead follow-up', collection: 'leads' as Collection, record })),
  ].filter(item => item.date), [workspace])
  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [month])
  const selectedItems = allCalendarItems.filter(item => dateKey(new Date(item.date)) === selectedDay)
  const leadValue = workspace.leads.filter(item => !['won', 'lost'].includes(item.stage)).reduce((total, item) => total + Number(item.estimatedValue || 0), 0)
  const closedLeads = workspace.leads.filter(item => ['won', 'lost'].includes(item.stage))
  const winRate = closedLeads.length ? `${Math.round(workspace.leads.filter(item => item.stage === 'won').length / closedLeads.length * 100)}%` : '—'
  const openCases = workspace.cases.filter(item => !['resolved', 'closed'].includes(item.status))
  const upcoming = allCalendarItems.filter(item => new Date(item.date) >= new Date()).sort((a, b) => +new Date(a.date) - +new Date(b.date)).slice(0, 5)

  const openForm = (collection: Collection, record?: CrmRecord) => {
    setFormType(collection)
    setEditing(record ? { collection, record } : null)
    setForm(record ? {
      title: record.title || record.subject || record.name || '', prospectName: record.prospectName || '', contactName: record.contactName || '', contactPhone: record.contactPhone || '', contactEmail: record.contactEmail || '', customerId: record.customerId || '', stage: record.stage || 'new', source: record.source || '', estimatedValue: String(record.estimatedValue || ''), notes: record.notes || '', nextAction: record.nextAction || '', nextActionAt: record.nextActionAt ? inputDate(new Date(record.nextActionAt)) : '', kind: record.kind || 'call', details: record.details || '', occurredAt: inputDate(new Date(record.occurredAt || Date.now())), nextFollowUpAt: record.nextFollowUpAt ? inputDate(new Date(record.nextFollowUpAt)) : '', color: record.color || 'blue', priority: record.priority || 'normal', status: record.status || 'open', dueAt: record.dueAt ? inputDate(new Date(record.dueAt)) : '', segment: record.segment || 'all', subject: record.subject || '', content: record.content || '',
    } : { title: '', prospectName: '', contactName: '', contactPhone: '', contactEmail: '', customerId: '', stage: 'new', source: '', estimatedValue: '', notes: '', nextAction: '', nextActionAt: '', kind: 'call', details: '', occurredAt: inputDate(), nextFollowUpAt: '', color: 'blue', priority: 'normal', status: 'open', dueAt: '', segment: 'all', subject: '', content: '' })
    setFormOpen(true)
  }
  const updateField = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }))
  const saveForm = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true)
    const body: Record<string, any> = { customerId: form.customerId || null }
    if (formType === 'leads') Object.assign(body, { title: form.title, prospectName: form.prospectName, contactName: form.contactName, ...(canViewPhone ? { contactPhone: form.contactPhone } : {}), ...(canViewEmail ? { contactEmail: form.contactEmail } : {}), stage: form.stage, source: form.source, estimatedValue: Number(form.estimatedValue || 0), notes: form.notes, nextAction: form.nextAction, nextActionAt: form.nextActionAt || null })
    if (formType === 'activities') Object.assign(body, { title: form.title, kind: form.kind, details: form.details, occurredAt: form.occurredAt, nextFollowUpAt: form.nextFollowUpAt || null, color: form.color })
    if (formType === 'cases') Object.assign(body, { title: form.title, details: form.details, status: form.status || 'open', priority: form.priority, dueAt: form.dueAt || null, color: form.color })
    if (formType === 'campaigns') Object.assign(body, { name: form.title, segment: form.segment, subject: form.subject, content: form.content })
    try {
      if (editing) await rentalsApi.crmUpdate(formType, editing.record.id, body)
      else await rentalsApi.crmCreate(formType, body)
      setFormOpen(false); toast({ title: editing ? 'CRM record updated' : 'CRM record saved' }); await load()
    } catch (error: any) { toast({ title: 'Could not save', description: error?.message || 'Retry the change.', variant: 'destructive' }) }
    finally { setSaving(false) }
  }
  const removeRecord = async (collection: Collection, id: string) => {
    const confirmed = await appConfirm('Delete this CRM record? This will permanently remove it from the CRM workspace.')
    if (!confirmed) return
    try { await rentalsApi.crmDelete(collection, id); await load(); toast({ title: 'CRM record deleted' }) }
    catch (error: any) { toast({ title: 'Could not delete record', description: error?.message, variant: 'destructive' }) }
  }
  const updateStage = async (record: CrmRecord, stage: string) => {
    try { await rentalsApi.crmUpdate('leads', record.id, { stage }); await load() }
    catch (error: any) { toast({ title: 'Stage not updated', description: error?.message, variant: 'destructive' }) }
  }
  const startConversion = (lead: CrmRecord) => {
    setConversionLead(lead)
    setConversionMode('create')
    setConversionCreditLimit('')
    setConversionCustomerName(lead.prospectName || lead.contactName || lead.title || '')
    setConversionSearch(lead.prospectName || lead.contactName || lead.contactEmail || lead.contactPhone || '')
    setConversionCustomerId('')
    setConversionOpen(true)
  }
  const convertProspect = async (event: FormEvent) => {
    event.preventDefault()
    if (!conversionLead) return
    if (conversionMode === 'link' && !conversionCustomerId) {
      toast({ title: 'Select an existing customer', description: 'Search and choose the customer to link this prospect to.', variant: 'destructive' })
      return
    }
    setConversionSaving(true)
    try {
      const result = await rentalsApi.crmConvert(conversionLead.id, conversionMode === 'link'
        ? { customerId: conversionCustomerId }
        : { customerName: conversionCustomerName.trim(), creditLimit: Number(conversionCreditLimit) })
      setConversionOpen(false)
      toast({ title: 'Prospect converted', description: `${result.customer?.name || conversionCustomerName} is now a customer and can be selected in bookings.` })
      await load()
    } catch (error: any) {
      if (error?.data?.code === 'CRM_CUSTOMER_DUPLICATE') {
        if (canViewCustomer) {
          setConversionMode('link')
          const field = error?.data?.duplicateField
          setConversionSearch(field === 'phone' ? conversionLead.contactPhone || '' : field === 'email' ? conversionLead.contactEmail || '' : conversionLead.prospectName || conversionLead.contactName || conversionLead.title || '')
          toast({ title: 'Possible duplicate customer', description: 'Search for the existing customer and link the prospect instead of creating a duplicate.', variant: 'destructive' })
        } else toast({ title: 'Possible duplicate customer', description: 'An existing customer matches this prospect. Ask a user with View Customers permission to link it.', variant: 'destructive' })
      } else toast({ title: 'Could not convert prospect', description: error?.message || 'Check the credit limit and try again.', variant: 'destructive' })
    } finally { setConversionSaving(false) }
  }
  const changeMonth = (direction: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + direction, 1))
  const nav = [ ['overview', 'Overview'], ['pipeline', 'Sales pipeline'], ['contacts', 'Contacts'], ['activities', 'Activities'], ['support', 'Support'], ['marketing', 'Marketing'] ] as const

  return <main className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm text-muted-foreground">Customer relationships</p><h1 className="text-2xl font-semibold">CRM</h1><p className="mt-1 text-sm text-muted-foreground">Contacts, pipeline, interactions, support, and customer growth in one workspace.</p></div>
      <Button variant="outline" onClick={() => setCalendarOpen(true)}><CalendarDays className="mr-2 h-4 w-4" />Calendar <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{allCalendarItems.length}</span></Button>
    </header>
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="CRM sections">{nav.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</nav>

    {tab === 'overview' && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={Users} label="Contacts" value={pagination.total} /><Metric icon={Activity} label="Open pipeline" value={formatCurrency(leadValue)} /><Metric icon={Activity} label="Closed lead win rate" value={winRate} /><Metric icon={Ticket} label="Open support cases" value={openCases.length} /><Metric icon={CalendarDays} label="Follow-ups scheduled" value={allCalendarItems.length} /></div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Upcoming work</h2><p className="text-sm text-muted-foreground">Follow-ups, lead actions, and support due dates</p></div><Button variant="ghost" size="sm" onClick={() => setCalendarOpen(true)}>Open calendar</Button></div><CardContent className="divide-y p-0">{upcoming.length ? upcoming.map(item => <button key={`${item.collection}-${item.id}`} onClick={() => openForm(item.collection, item.record)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors[item.color] || colors.blue}`} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.label} · {dateLabel(item.date)}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>) : <p className="p-6 text-sm text-muted-foreground">No upcoming CRM activities. Add a follow-up to keep the team moving.</p>}</CardContent></Card>
        <Card><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Pipeline snapshot</h2><p className="text-sm text-muted-foreground">Opportunity value by stage</p></div><Button variant="ghost" size="sm" onClick={() => setTab('pipeline')}>View pipeline</Button></div><CardContent className="space-y-3 p-4">{stages.map(stage => { const records = workspace.leads.filter(lead => lead.stage === stage); const value = records.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0); return <div key={stage} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-sm"><span className="capitalize text-muted-foreground">{stage}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${leadValue ? Math.min(100, value / leadValue * 100) : 0}%` }} /></div><span className="tabular-nums">{records.length} · {formatCurrency(value)}</span></div> })}</CardContent></Card>
      </div>
    </div>}

    {tab === 'pipeline' && <RecordSection canCreate={canCreate} title="Sales pipeline" description="Track prospects and opportunities without duplicating customer records." action="Add lead" onAdd={() => openForm('leads')}>
      {workspace.leads.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workspace.leads.map(lead => <Card key={lead.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{lead.title}</p><p className="text-sm text-muted-foreground">{lead.prospectName || lead.contactName || customers.find(customer => customer.id === lead.customerId)?.name || 'Unlinked prospect'} · {lead.source || 'Manual'}</p>{lead.contactName && <p className="text-xs text-muted-foreground">Contact: {lead.contactName}</p>}{canViewPhone && lead.contactPhone && <p className="text-xs text-muted-foreground">{lead.contactPhone}</p>}{canViewEmail && lead.contactEmail && <p className="text-xs text-muted-foreground">{lead.contactEmail}</p>}</div><span className="text-sm font-semibold tabular-nums">{formatCurrency(lead.estimatedValue || 0)}</span></div><div className="flex flex-wrap items-center justify-between gap-2"><select aria-label="Pipeline stage" className="h-9 rounded-md border bg-background px-2 text-sm capitalize" value={lead.stage} disabled={!canEdit || lead.stage === 'won'} onChange={e => void updateStage(lead, e.target.value)}>{stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select><span className="text-xs text-muted-foreground">{lead.nextAction ? `${lead.nextAction} · ${dateLabel(lead.nextActionAt)}` : 'No next action'}</span></div>{canConvertProspect && lead.stage !== 'won' && <Button size="sm" variant="outline" onClick={() => startConversion(lead)}>Convert to customer</Button>}{lead.customerId && <Link className="text-sm text-primary hover:underline" to={`/tenant/receivables/customers/${encodeURIComponent(lead.customerId)}`}>Open customer</Link>}<RecordActions canEdit={canEdit} canDelete={canDelete} onEdit={() => openForm('leads', lead)} onDelete={() => void removeRecord('leads', lead.id)} /></CardContent></Card>)}</div> : <Empty text="No opportunities in the pipeline yet." />}
    </RecordSection>}

    {tab === 'contacts' && <section className="overflow-hidden rounded-lg border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Customer directory</h2><p className="text-sm text-muted-foreground">Unified customer records shared with receivables and rental history.</p></div><div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search contacts" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Customer</th>{canViewPhone && <th className="px-4 py-3">Phone</th>}{canViewEmail && <th className="px-4 py-3">Email</th>}<th className="px-4 py-3">Rental activity</th>{canViewFinancial && <><th className="px-4 py-3">Lifetime rental value</th><th className="px-4 py-3">Outstanding</th></>}<th className="px-4 py-3">Next due</th></tr></thead><tbody className="divide-y">{customers.map(customer => <tr key={customer.id} className="hover:bg-muted/30"><td className="px-4 py-3">{canViewCustomer ? <Link className="font-medium text-primary hover:underline" to={`/tenant/receivables/customers/${encodeURIComponent(customer.id)}`}>{customer.name}</Link> : <span className="font-medium">{customer.name}</span>}</td>{canViewPhone && <td className="px-4 py-3">{customer.phone || '—'}</td>}{canViewEmail && <td className="px-4 py-3">{customer.email || '—'}</td>}<td className="px-4 py-3">{customer.rentalCount} bookings · {customer.activeRentalCount} active</td>{canViewFinancial && <><td className="px-4 py-3 tabular-nums">{formatCurrency(customer.lifetimeRentalValue)}</td><td className="px-4 py-3 tabular-nums">{formatCurrency(customer.outstandingBalance)}</td></>}<td className="px-4 py-3">{dateLabel(customer.nextReturnDate)}</td></tr>)}{!loading && !customers.length && <tr><td colSpan={4 + Number(canViewPhone) + Number(canViewEmail) + 2 * Number(canViewFinancial)} className="p-8 text-center text-muted-foreground">No matching contacts.</td></tr>}</tbody></table>{pagination.total > pagination.limit && <Pagination currentPage={pagination.page} totalPages={pagination.pages} totalItems={pagination.total} pageSize={pagination.limit} onPageChange={setPage} />}</div></section>}

    {tab === 'activities' && <RecordSection canCreate={canCreate} title="Interactions & follow-ups" description="Log calls, emails, meetings, notes, and next steps against existing customers." action="Log interaction" onAdd={() => openForm('activities')}>
      <RecordList records={workspace.activities} customers={customers} canEdit={canEdit} canDelete={canDelete} onEdit={record => openForm('activities', record)} onDelete={record => void removeRecord('activities', record.id)} labelKey="kind" dateKeyName="occurredAt" empty="No interactions logged yet." />
    </RecordSection>}

    {tab === 'support' && <RecordSection canCreate={canCreate} title="Customer support" description="Keep issues, ownership, priority, and due dates visible to the team." action="Create case" onAdd={() => openForm('cases')}>
      <RecordList records={workspace.cases} customers={customers} canEdit={canEdit} canDelete={canDelete} onEdit={record => openForm('cases', record)} onDelete={record => void removeRecord('cases', record.id)} labelKey="status" dateKeyName="dueAt" empty="No support cases yet." />
    </RecordSection>}

    {tab === 'marketing' && <RecordSection canCreate={canCreate} title="Marketing campaigns" description="Build customer segments and campaign drafts from your existing CRM contacts." action="Create campaign" onAdd={() => openForm('campaigns')}>
      <div className="mb-4 flex gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /><p>Campaigns are saved as drafts. Email delivery requires customer consent and a configured delivery provider; CRM will not send messages without those safeguards.</p></div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{['all', 'active', 'overdue', 'loyal', 'inactive'].map(segment => <div key={segment} className="rounded-md border p-3"><p className="text-xs capitalize text-muted-foreground">{segment}</p><p className="mt-1 font-semibold tabular-nums">{segmentCounts[segment] ?? '—'}</p></div>)}</div>
      {workspace.campaigns.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workspace.campaigns.map(campaign => <Card key={campaign.id}><CardContent className="space-y-3 p-4"><div className="flex items-start gap-3"><span className="rounded-md bg-primary/10 p-2 text-primary"><Megaphone className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="font-medium">{campaign.name}</p><p className="text-sm text-muted-foreground">{campaign.segment} segment · Draft</p></div></div><p className="text-sm font-medium">{campaign.subject || 'No subject'}</p><p className="line-clamp-3 text-sm text-muted-foreground">{campaign.content || 'No campaign content yet.'}</p><RecordActions canEdit={canEdit} canDelete={canDelete} onEdit={() => openForm('campaigns', campaign)} onDelete={() => void removeRecord('campaigns', campaign.id)} /></CardContent></Card>)}</div> : <Empty text="No campaign drafts created yet." />}
    </RecordSection>}

    {loading && <p className="text-xs text-muted-foreground">Refreshing CRM data…</p>}

    <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>CRM calendar</DialogTitle><DialogDescription>Color-coded follow-ups, lead actions, and support due dates. Event colors are saved with each record.</DialogDescription></DialogHeader><div className="flex items-center justify-between gap-2"><Button variant="outline" size="icon" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button><span className="font-medium">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</span><Button variant="outline" size="icon" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight className="h-4 w-4" /></Button></div><div className="grid grid-cols-7 border-l border-t text-center text-xs">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="border-b border-r py-2 font-medium text-muted-foreground">{day}</div>)}{calendarDays.map(day => { const key = dateKey(day); const items = allCalendarItems.filter(item => dateKey(new Date(item.date)) === key); return <button key={key} onClick={() => setSelectedDay(key)} className={`min-h-12 border-b border-r p-1 text-sm ${day.getMonth() !== month.getMonth() ? 'text-muted-foreground/50' : ''} ${key === selectedDay ? 'bg-primary/10 outline outline-1 outline-primary' : 'hover:bg-muted/50'}`}><span>{day.getDate()}</span><span className="mt-1 flex justify-center gap-1">{items.slice(0, 4).map(item => <i key={item.id} className={`h-1.5 w-1.5 rounded-full ${colors[item.color] || colors.blue}`} />)}</span></button> })}</div><div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{colorNames.map(color => <span key={color} className="flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${colors[color]}`} />{color}</span>)}</div><div className="max-h-48 space-y-2 overflow-y-auto border-t pt-3">{selectedItems.length ? selectedItems.map(item => <button key={item.id} onClick={() => { setCalendarOpen(false); openForm(item.collection, item.record) }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted"><i className={`h-2.5 w-2.5 rounded-full ${colors[item.color] || colors.blue}`} /><span className="min-w-0 flex-1 truncate">{item.title}</span><span className="text-xs text-muted-foreground">{item.label}</span></button>) : <p className="py-3 text-sm text-muted-foreground">Nothing scheduled for {dateLabel(selectedDay)}.</p>}</div></DialogContent></Dialog>

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editing ? 'Update' : 'New'} {formType === 'leads' ? 'opportunity' : formType === 'activities' ? 'interaction' : formType === 'cases' ? 'support case' : 'campaign draft'}</DialogTitle><DialogDescription>CRM records are saved to this business workspace and linked to existing customers.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={saveForm}>
      <Field label={formType === 'campaigns' ? 'Campaign name' : formType === 'leads' ? 'Opportunity' : formType === 'cases' ? 'Issue summary' : 'Subject'}><Input required maxLength={180} value={form.title} onChange={e => updateField('title', e.target.value)} /></Field>
      {formType === 'leads' && <><Field label="Prospect or business name"><Input required maxLength={180} value={form.prospectName} onChange={e => updateField('prospectName', e.target.value)} placeholder="Name to use when converting to customer" /></Field><Field label="Contact person"><Input maxLength={180} value={form.contactName} onChange={e => updateField('contactName', e.target.value)} /></Field>{canViewPhone && <Field label="Phone"><Input type="tel" maxLength={80} value={form.contactPhone} onChange={e => updateField('contactPhone', e.target.value)} /></Field>}{canViewEmail && <Field label="Email"><Input type="email" maxLength={180} value={form.contactEmail} onChange={e => updateField('contactEmail', e.target.value)} /></Field>}</>}
      {formType !== 'campaigns' && <Field label="Customer (optional)"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.customerId} onChange={e => updateField('customerId', e.target.value)}><option value="">Unlinked</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>}
      {formType === 'leads' && <><Field label="Stage"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm capitalize" value={form.stage} onChange={e => updateField('stage', e.target.value)}>{stages.filter(stage => stage !== 'won' || form.stage === 'won').map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></Field><Field label="Estimated value"><Input type="number" min="0" step="0.01" value={form.estimatedValue} onChange={e => updateField('estimatedValue', e.target.value)} /></Field><Field label="Source"><Input value={form.source} onChange={e => updateField('source', e.target.value)} placeholder="Referral, campaign, walk-in…" /></Field><Field label="Next action"><Input value={form.nextAction} onChange={e => updateField('nextAction', e.target.value)} /></Field><Field label="Next action date"><Input type="datetime-local" value={form.nextActionAt} onChange={e => updateField('nextActionAt', e.target.value)} /></Field><Field label="Notes"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.notes} onChange={e => updateField('notes', e.target.value)} /></Field></>}
      {formType === 'activities' && <><Field label="Type"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm capitalize" value={form.kind} onChange={e => updateField('kind', e.target.value)}>{kinds.map(kind => <option key={kind} value={kind}>{kind.replace('_', ' ')}</option>)}</select></Field><Field label="Interaction date"><Input type="datetime-local" required value={form.occurredAt} onChange={e => updateField('occurredAt', e.target.value)} /></Field><Field label="Follow-up date"><Input type="datetime-local" value={form.nextFollowUpAt} onChange={e => updateField('nextFollowUpAt', e.target.value)} /></Field><ColorPicker value={form.color} onChange={value => updateField('color', value)} /><Field label="Notes"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={form.details} onChange={e => updateField('details', e.target.value)} /></Field></>}
      {formType === 'cases' && <><Field label="Details"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={form.details} onChange={e => updateField('details', e.target.value)} /></Field><Field label="Status"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.status || 'open'} onChange={e => updateField('status', e.target.value)}>{['open', 'in_progress', 'waiting', 'resolved', 'closed'].map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></Field><Field label="Priority"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.priority} onChange={e => updateField('priority', e.target.value)}>{['low', 'normal', 'high', 'urgent'].map(priority => <option key={priority}>{priority}</option>)}</select></Field><Field label="Due date"><Input type="datetime-local" value={form.dueAt} onChange={e => updateField('dueAt', e.target.value)} /></Field><ColorPicker value={form.color} onChange={value => updateField('color', value)} /></>}
      {formType === 'campaigns' && <><Field label="Audience segment"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.segment} onChange={e => updateField('segment', e.target.value)}>{['all', 'active', 'overdue', 'loyal', 'inactive'].map(segment => <option key={segment} value={segment}>{segment} ({segmentCounts[segment] ?? '—'})</option>)}</select></Field><Field label="Email subject"><Input value={form.subject} onChange={e => updateField('subject', e.target.value)} /></Field><Field label="Draft content"><textarea className="min-h-36 w-full rounded-md border bg-background p-3 text-sm" value={form.content} onChange={e => updateField('content', e.target.value)} /></Field></>}
      <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
    </form></DialogContent></Dialog>

    <Dialog open={conversionOpen} onOpenChange={setConversionOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Convert prospect to customer</DialogTitle><DialogDescription>Link this prospect to an existing customer or create a customer record. The CRM history stays linked after conversion.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={convertProspect}><div className="rounded-md bg-muted/50 p-3 text-sm"><p className="font-medium">{conversionLead?.prospectName || conversionLead?.contactName || conversionLead?.title}</p><p className="text-muted-foreground">{conversionLead?.title}</p></div><div className="flex flex-wrap gap-2 border-b pb-3"><Button type="button" variant={conversionMode === 'create' ? 'default' : 'outline'} onClick={() => setConversionMode('create')}>Create customer</Button>{canViewCustomer && <Button type="button" variant={conversionMode === 'link' ? 'default' : 'outline'} onClick={() => setConversionMode('link')}>Link existing</Button>}</div>{conversionMode === 'create' ? <><Field label="Customer name"><Input required maxLength={180} value={conversionCustomerName} onChange={e => setConversionCustomerName(e.target.value)} /></Field><Field label="Credit limit"><Input type="number" min="0.01" step="0.01" required value={conversionCreditLimit} onChange={e => setConversionCreditLimit(e.target.value)} /></Field><p className="text-xs text-muted-foreground">A positive credit limit is required for customer records. Conversion creates no sale or opening balance.</p></> : <><Field label="Search existing customers"><Input value={conversionSearch} onChange={e => { setConversionSearch(e.target.value); setConversionCustomerId('') }} placeholder="Type at least two characters" /></Field>{conversionLoading && <p className="text-sm text-muted-foreground">Searching customers…</p>}<select aria-label="Matching customers" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={conversionCustomerId} onChange={e => setConversionCustomerId(e.target.value)}><option value="">Choose customer</option>{conversionCustomers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>{!conversionCustomers.length && conversionSearch.length >= 2 && !conversionLoading && <p className="text-xs text-muted-foreground">No matches. Create a new customer instead.</p>}</>}<div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setConversionOpen(false)}>Cancel</Button><Button type="submit" disabled={conversionSaving || (conversionMode === 'link' && !conversionCustomerId)}>{conversionSaving ? 'Converting…' : conversionMode === 'link' ? 'Link customer' : 'Create customer'}</Button></div></form></DialogContent></Dialog>
  </main>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label> }
function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <Field label="Calendar color"><div className="flex flex-wrap gap-2">{colorNames.map(color => <button key={color} type="button" aria-label={`${color} highlight`} aria-pressed={value === color} onClick={() => onChange(color)} className={`h-7 w-7 rounded-full ${colors[color]} ${value === color ? 'ring-2 ring-foreground ring-offset-2' : ''}`} />)}</div></Field> }
function Metric({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number }) { return <Card><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div><Icon className="h-5 w-5 text-primary" /></CardContent></Card> }
function RecordSection({ canCreate, title, description, action, onAdd, children }: { canCreate: boolean; title: string; description: string; action: string; onAdd: () => void; children: ReactNode }) { return <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>{canCreate && <Button onClick={onAdd}><Plus className="mr-2 h-4 w-4" />{action}</Button>}</div>{children}</section> }
function Empty({ text }: { text: string }) { return <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">{text}</div> }
function RecordActions({ canEdit, canDelete, onEdit, onDelete }: { canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void }) { if (!canEdit && !canDelete) return null; return <div className="flex justify-end gap-2 border-t pt-2">{canEdit && <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>}{canDelete && <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete record"><X className="h-4 w-4" /></Button>}</div> }
function RecordList({ records, customers, canEdit, canDelete, onEdit, onDelete, labelKey, dateKeyName, empty }: { records: CrmRecord[]; customers: Customer[]; canEdit: boolean; canDelete: boolean; onEdit: (record: CrmRecord) => void; onDelete: (record: CrmRecord) => void; labelKey: string; dateKeyName: string; empty: string }) { return records.length ? <div className="divide-y rounded-md border">{[...records].sort((a, b) => +new Date(b[dateKeyName] || b.createdAt) - +new Date(a[dateKeyName] || a.createdAt)).map(record => <div key={record.id} className="flex flex-wrap items-start gap-3 p-4"><i className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${colors[record.color] || colors.blue}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><p className="font-medium">{record.subject}</p><span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{String(record[labelKey] || '').replace('_', ' ')}</span></div><p className="text-sm text-muted-foreground">{customers.find(customer => customer.id === record.customerId)?.name || 'Unlinked customer'} · {dateLabel(record[dateKeyName])}</p>{record.details && <p className="mt-2 whitespace-pre-wrap text-sm">{record.details}</p>}</div><RecordActions canEdit={canEdit} canDelete={canDelete} onEdit={() => onEdit(record)} onDelete={() => onDelete(record)} /></div>)}</div> : <Empty text={empty} /> }
