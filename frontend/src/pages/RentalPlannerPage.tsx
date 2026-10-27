import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Clock3, Flag, ListTodo, NotebookPen, Pencil, Plus, Search, Target, Trash2 } from 'lucide-react'
import { plannerApi } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'

type PlannerKind = 'task' | 'appointment' | 'goal' | 'note' | 'habit'
type PlannerPriority = 'low' | 'normal' | 'high'
type PlannerColor = 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'purple'

type PlannerEntry = {
  id: string
  kind: PlannerKind
  title: string
  details: string
  startAt: string | null
  endAt: string | null
  dueAt: string | null
  reminderAt: string | null
  goalId?: string | null
  priority: PlannerPriority
  color: PlannerColor
  completed: boolean
  createdAt: string
  updatedAt: string
}

const colors: Record<PlannerColor, { bg: string; edge: string; dot: string; name: string }> = {
  yellow: { bg: '#fef9c3', edge: '#fde047', dot: '#ca8a04', name: 'Yellow' },
  pink: { bg: '#fce7f3', edge: '#f9a8d4', dot: '#be185d', name: 'Pink' },
  blue: { bg: '#dbeafe', edge: '#93c5fd', dot: '#1d4ed8', name: 'Blue' },
  green: { bg: '#dcfce7', edge: '#86efac', dot: '#15803d', name: 'Green' },
  orange: { bg: '#ffedd5', edge: '#fdba74', dot: '#c2410c', name: 'Orange' },
  purple: { bg: '#f3e8ff', edge: '#c084fc', dot: '#7e22ce', name: 'Purple' },
}

const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateKey = (value?: string | null) => value ? todayKey(new Date(value)) : ''
const toDateTimeInput = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return `${todayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
const fromDateTimeInput = (value: string) => value ? new Date(value).toISOString() : null
const prettyDate = (value?: string | null, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) => value ? new Intl.DateTimeFormat(undefined, options).format(new Date(value)) : ''
const itemDate = (item: PlannerEntry) => item.startAt || item.dueAt || item.reminderAt || ''
const kindLabels: Record<PlannerKind, string> = { task: 'Task', appointment: 'Appointment', goal: 'Goal', note: 'Note', habit: 'Habit' }
const kindIcons = { task: ListTodo, appointment: CalendarDays, goal: Target, note: NotebookPen, habit: Circle }

const blankForm = () => ({ kind: 'task' as PlannerKind, title: '', details: '', startAt: '', endAt: '', dueAt: '', reminderAt: '', goalId: '', priority: 'normal' as PlannerPriority, color: 'yellow' as PlannerColor })

export default function RentalPlannerPage() {
  const { toast } = useToast()
  const { hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const canManage = hasPermission('canManagePlanner') || (hasFeature('rentals') && hasPermission('canViewRental'))
  const [entries, setEntries] = useState<PlannerEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const [openCalendar, setOpenCalendar] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [dateFilter, setDateFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | PlannerKind>('all')
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const data = await plannerApi.list()
      setEntries(Array.isArray(data?.items) ? data.items : [])
      setLoaded(true)
    } catch (error: any) {
      setLoadError(true)
      toast({ title: 'Planner could not load', description: error?.message || 'Try again when connected.', variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const saveEntries = useCallback((next: PlannerEntry[]) => {
    setEntries(next)
    if (!loaded) return
    setSaving(true)
    setSaveError(false)
    saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(() => plannerApi.save(next)).then(() => {
      setSaving(false)
    }).catch((error: any) => {
      setSaving(false)
      setSaveError(true)
      toast({ title: 'Planner changes not saved', description: error?.message || 'Check your connection and retry.', variant: 'destructive' })
    })
  }, [loaded, toast])

  const retrySave = () => {
    setSaving(true)
    setSaveError(false)
    saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(() => plannerApi.save(entries)).then(() => setSaving(false)).catch((error: any) => {
      setSaving(false)
      setSaveError(true)
      toast({ title: 'Planner changes not saved', description: error?.message || 'Check your connection and retry.', variant: 'destructive' })
    })
  }

  const monthDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
  }, [calendarMonth])

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, PlannerEntry[]>()
    entries.forEach(entry => {
      const keys = [...new Set([entry.startAt, entry.endAt, entry.dueAt, entry.reminderAt].map(dateKey).filter(Boolean))]
      keys.forEach(key => grouped.set(key, [...(grouped.get(key) || []), entry]))
    })
    return grouped
  }, [entries])

  const today = todayKey()
  const todayEntries = entries.filter(item => !item.completed && (dateKey(item.startAt) === today || dateKey(item.dueAt) === today))
  const overdueCount = entries.filter(item => !item.completed && item.dueAt && new Date(item.dueAt).getTime() < Date.now() && dateKey(item.dueAt) !== today).length
  const activeGoals = entries.filter(item => item.kind === 'goal' && !item.completed).length
  const upcomingCount = entries.filter(item => !item.completed && item.reminderAt && new Date(item.reminderAt).getTime() > Date.now()).length

  const visibleEntries = useMemo(() => entries
    .filter(item => kindFilter === 'all' || item.kind === kindFilter)
    .filter(item => !dateFilter || [item.startAt, item.dueAt, item.reminderAt].some(value => dateKey(value) === dateFilter))
    .filter(item => !query.trim() || `${item.title} ${item.details}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]) || (itemDate(a) ? new Date(itemDate(a)).getTime() : Infinity) - (itemDate(b) ? new Date(itemDate(b)).getTime() : Infinity) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [entries, kindFilter, dateFilter, query])

  const beginCreate = (kind: PlannerKind = 'task') => {
    const date = dateFilter || today
    setEditingId(null)
    setForm({ ...blankForm(), kind, dueAt: kind === 'task' || kind === 'habit' ? `${date}T17:00` : '', startAt: kind === 'appointment' ? `${date}T09:00` : '' })
    setFormOpen(true)
  }

  const beginEdit = (entry: PlannerEntry) => {
    setEditingId(entry.id)
    setForm({ kind: entry.kind, title: entry.title, details: entry.details, startAt: toDateTimeInput(entry.startAt), endAt: toDateTimeInput(entry.endAt), dueAt: toDateTimeInput(entry.dueAt), reminderAt: toDateTimeInput(entry.reminderAt), goalId: entry.goalId || '', priority: entry.priority, color: entry.color })
    setFormOpen(true)
  }

  const saveForm = (event: React.FormEvent) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) return
    const existing = entries.find(item => item.id === editingId)
    const now = new Date().toISOString()
    const entry: PlannerEntry = {
      id: editingId || crypto.randomUUID(), kind: form.kind, title, details: form.details.trim(),
      startAt: fromDateTimeInput(form.startAt), endAt: fromDateTimeInput(form.endAt), dueAt: fromDateTimeInput(form.dueAt), reminderAt: fromDateTimeInput(form.reminderAt),
      goalId: form.goalId || null, priority: form.priority, color: form.color, completed: existing?.completed || false, createdAt: existing?.createdAt || now, updatedAt: now,
    }
    saveEntries([entry, ...entries.filter(item => item.id !== editingId)])
    setFormOpen(false)
    toast({ title: editingId ? 'Planner entry updated' : 'Added to planner', description: title })
  }

  const toggleComplete = (id: string) => saveEntries(entries.map(item => item.id === id ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() } : item))
  const deleteEntry = (id: string) => saveEntries(entries.filter(item => item.id !== id).map(item => item.goalId === id ? { ...item, goalId: null } : item))

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-muted-foreground">Rentals</p><h1 className="text-2xl font-semibold tracking-tight">Planner</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Keep appointments, priorities, goals, reminders, and working notes together.</p></div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setOpenCalendar(true)} title="Open calendar">
            <CalendarDays className="mr-2 h-4 w-4" /><span>{dateFilter ? prettyDate(`${dateFilter}T12:00:00`, { day: 'numeric', month: 'short' }) : `Today · ${new Date().getDate()}`}</span>
          </Button>
          {canManage && <Button onClick={() => beginCreate()} disabled={!loaded}><Plus className="mr-2 h-4 w-4" />Add to planner</Button>}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary icon={ListTodo} label="Today's focus" value={todayEntries.length} note="Tasks and plans scheduled today" />
        <Summary icon={AlertCircle} label="Overdue" value={overdueCount} note="Items past their due time" danger={overdueCount > 0} />
        <Summary icon={Target} label="Active goals" value={activeGoals} note="Goals still in progress" />
        <Summary icon={Clock3} label="Upcoming reminders" value={upcomingCount} note="Scheduled notifications" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.7fr)]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div><h2 className="text-lg font-semibold">{dateFilter ? `Plan for ${prettyDate(`${dateFilter}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` : 'Your planner'}</h2><p className="text-sm text-muted-foreground">{saving ? 'Saving…' : saveError ? 'Changes need saving' : loaded ? 'All changes saved' : 'Loading your planner…'}</p></div>
            {dateFilter && <Button variant="ghost" size="sm" onClick={() => setDateFilter('')}>Show all dates</Button>}
            {saveError && <Button variant="outline" size="sm" onClick={retrySave}>Retry save</Button>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search tasks, goals, and notes" value={query} onChange={event => setQuery(event.target.value)} /></div>
            <select value={kindFilter} onChange={event => setKindFilter(event.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-44"><option value="all">All planner items</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}s</option>)}</select>
          </div>
          <div className="space-y-3">
            {!loaded ? <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">{loadError ? <><p>Planner data could not be loaded, so nothing has been overwritten.</p><Button className="mt-3" variant="outline" onClick={() => void load()}>Retry loading</Button></> : 'Loading planner…'}</div> : visibleEntries.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center"><NotebookPen className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">Nothing on this list yet</p><p className="mt-1 text-sm text-muted-foreground">{canManage ? 'Add a task, appointment, goal, habit, or note to get started.' : 'There are no planner entries to show.'}</p>{canManage && <Button className="mt-4" onClick={() => beginCreate()}><Plus className="mr-2 h-4 w-4" />Create an entry</Button>}</div> : visibleEntries.map(entry => <PlannerCard key={entry.id} entry={entry} canManage={canManage} linkedGoalTitle={entries.find(goal => goal.id === entry.goalId)?.title} onToggle={() => toggleComplete(entry.id)} onEdit={() => beginEdit(entry)} onDelete={() => deleteEntry(entry.id)} />)}
          </div>
        </div>

        <aside className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Quick capture</h2><p className="text-sm text-muted-foreground">Drop it into the right list in one step.</p></div><NotebookPen className="h-5 w-5 text-muted-foreground" /></div>
            <CardContent className="grid grid-cols-2 gap-2 p-4">{canManage ? (['task', 'appointment', 'goal', 'note', 'habit'] as PlannerKind[]).map(kind => { const Icon = kindIcons[kind]; return <Button key={kind} variant="outline" className="justify-start" disabled={!loaded} onClick={() => beginCreate(kind)}><Icon className="mr-2 h-4 w-4" />{kindLabels[kind]}</Button> }) : <p className="col-span-2 text-sm text-muted-foreground">View-only access</p>}</CardContent>
          </Card>
          <Card>
            <div className="border-b p-4"><h2 className="font-semibold">Today</h2><p className="text-sm text-muted-foreground">A short view of today's commitments.</p></div>
            <CardContent className="space-y-2 p-4">{todayEntries.length ? todayEntries.slice(0, 6).map(item => <button key={item.id} onClick={() => canManage && beginEdit(item)} className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted/50"><span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[item.color].dot }} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{kindLabels[item.kind]}{item.startAt ? ` · ${prettyDate(item.startAt, { hour: '2-digit', minute: '2-digit' })}` : ''}</span></span></button>) : <p className="py-4 text-center text-sm text-muted-foreground">Your day is clear. Capture a task or plan when ready.</p>}</CardContent>
          </Card>
          <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"><p className="font-medium">Keep the next step small</p><p className="mt-1 opacity-80">Break a larger goal into one action you can complete today.</p></div>
        </aside>
      </section>

      <Dialog open={openCalendar} onOpenChange={setOpenCalendar}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Calendar</DialogTitle><DialogDescription>Choose a date to focus the planner. Colored dots show your saved entries.</DialogDescription></DialogHeader>
          <div className="flex items-center justify-between"><Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button><p className="font-medium">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarMonth)}</p><Button variant="outline" size="icon" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button></div>
          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div key={`${day}-${index}`} className="py-2">{day}</div>)}{monthDays.map(date => { const key = todayKey(date); const dayEntries = entriesByDate.get(key) || []; const colorsForDay = [...new Set(dayEntries.map(item => item.color))].slice(0, 3); return <button key={key} onClick={() => { setDateFilter(key); setOpenCalendar(false) }} aria-label={`${prettyDate(`${key}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}${dayEntries.length ? `, ${dayEntries.length} planner entries` : ''}`} className={cn('mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-md text-sm transition-colors hover:bg-muted', date.getMonth() !== calendarMonth.getMonth() && 'text-muted-foreground/50', key === today && 'font-semibold ring-1 ring-primary', key === dateFilter && 'bg-primary text-primary-foreground hover:bg-primary')}>{date.getDate()}<span className="mt-0.5 flex h-1 gap-0.5">{colorsForDay.map(color => <span key={color} className="h-1 w-1 rounded-full" style={{ background: key === dateFilter ? 'currentColor' : colors[color].dot }} />)}</span></button>})}</div>
          <div className="flex justify-between gap-2"><Button variant="ghost" onClick={() => { setDateFilter(''); setOpenCalendar(false) }}>All planner items</Button><Button variant="outline" onClick={() => { setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setDateFilter(today); setOpenCalendar(false) }}>Today</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit planner entry' : 'Add to planner'}</DialogTitle><DialogDescription>Capture an appointment, task, goal, habit, or reference note.</DialogDescription></DialogHeader>
          <form onSubmit={saveForm} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="planner-kind">Type</Label><select id="planner-kind" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as PlannerKind }))}>{Object.entries(kindLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="space-y-2"><Label htmlFor="planner-priority">Priority</Label><select id="planner-priority" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as PlannerPriority }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></div></div>
            <div className="space-y-2"><Label htmlFor="planner-title">Title</Label><Input id="planner-title" autoFocus maxLength={160} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} required placeholder={form.kind === 'appointment' ? 'Meeting or appointment' : form.kind === 'goal' ? 'Goal to work toward' : form.kind === 'note' ? 'Note title' : 'What needs your attention?'} /></div>
            {form.kind === 'appointment' && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="planner-start">Starts</Label><Input id="planner-start" type="datetime-local" value={form.startAt} onChange={event => setForm(current => ({ ...current, startAt: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="planner-end">Ends</Label><Input id="planner-end" type="datetime-local" min={form.startAt || undefined} value={form.endAt} onChange={event => setForm(current => ({ ...current, endAt: event.target.value }))} /></div></div>}
            {(form.kind === 'task' || form.kind === 'habit' || form.kind === 'goal') && <div className="space-y-2"><Label htmlFor="planner-due">{form.kind === 'goal' ? 'Target date' : 'Due / tracking date'}</Label><Input id="planner-due" type="datetime-local" value={form.dueAt} onChange={event => setForm(current => ({ ...current, dueAt: event.target.value }))} /></div>}
            {(form.kind === 'task' || form.kind === 'habit') && entries.some(item => item.kind === 'goal' && !item.completed) && <div className="space-y-2"><Label htmlFor="planner-goal">Linked goal</Label><select id="planner-goal" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.goalId} onChange={event => setForm(current => ({ ...current, goalId: event.target.value }))}><option value="">No linked goal</option>{entries.filter(item => item.kind === 'goal' && !item.completed).map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></div>}
            <div className="space-y-2"><Label htmlFor="planner-reminder">Reminder</Label><Input id="planner-reminder" type="datetime-local" value={form.reminderAt} onChange={event => setForm(current => ({ ...current, reminderAt: event.target.value }))} /><p className="text-xs text-muted-foreground">A reminder pops up in JibuSales while you are signed in.</p></div>
            <div className="space-y-2"><Label htmlFor="planner-details">Notes / next steps</Label><Textarea id="planner-details" value={form.details} onChange={event => setForm(current => ({ ...current, details: event.target.value }))} rows={4} maxLength={5000} placeholder="Details, checklist, meeting notes, or the next small step…" /></div>
            <div className="space-y-2"><Label>Note color</Label><div className="flex flex-wrap gap-2">{Object.entries(colors).map(([color, value]) => <button type="button" key={color} title={value.name} aria-label={`${value.name} color`} aria-pressed={form.color === color} onClick={() => setForm(current => ({ ...current, color: color as PlannerColor }))} className={cn('h-8 w-8 rounded-full border transition-transform hover:scale-110', form.color === color && 'ring-2 ring-offset-2')} style={{ background: value.bg, borderColor: value.edge, outlineColor: value.dot }} />)}</div></div>
            <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" disabled={!form.title.trim()}>{editingId ? 'Save changes' : 'Add entry'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlannerCard({ entry, linkedGoalTitle, canManage, onToggle, onEdit, onDelete }: { entry: PlannerEntry; linkedGoalTitle?: string; canManage: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const paper = colors[entry.color] || colors.yellow
  const Icon = kindIcons[entry.kind]
  return <article className="overflow-hidden rounded-md border shadow-sm" style={{ borderColor: paper.edge, borderLeftWidth: 4, background: paper.bg, color: '#1c1917' }}>
    <div className="flex items-start gap-3 p-4">
      {(entry.kind === 'task' || entry.kind === 'habit' || entry.kind === 'goal') ? <button type="button" disabled={!canManage} onClick={onToggle} aria-label={entry.completed ? 'Mark incomplete' : 'Mark complete'} className={cn('mt-0.5 rounded-full', entry.completed ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground')}>{entry.completed ? <Check className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</button> : <span className="mt-0.5 rounded-md p-2" style={{ color: paper.dot, background: paper.bg }}><Icon className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={cn('font-semibold', entry.completed && 'text-muted-foreground line-through')}>{entry.title}</h3><span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: paper.dot, background: paper.bg }}>{kindLabels[entry.kind]}</span>{entry.priority === 'high' && <span className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400"><Flag className="h-3 w-3" />High priority</span>}</div>
        {entry.details && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{entry.details}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-700">{entry.startAt && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{prettyDate(entry.startAt)}</span>}{entry.dueAt && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Due {prettyDate(entry.dueAt)}</span>}{entry.reminderAt && !entry.completed && <span className="inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Reminder {prettyDate(entry.reminderAt)}</span>}{linkedGoalTitle && <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5" />Goal: {linkedGoalTitle}</span>}</div>
      </div>
      {canManage && <div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon" title="Edit entry" aria-label="Edit entry" onClick={onEdit}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Delete entry" aria-label="Delete entry" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></div>}
    </div>
  </article>
}

function Summary({ icon: Icon, label, value, note, danger = false }: { icon: typeof ListTodo; label: string; value: number; note: string; danger?: boolean }) {
  return <Card><CardContent className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className={cn('mt-1 text-2xl font-semibold tabular-nums', danger && 'text-red-600 dark:text-red-400')}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><span className={cn('rounded-md p-2', danger ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-primary/10 text-primary')}><Icon className="h-4 w-4" /></span></CardContent></Card>
}
