import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, Search, Users, Wallet } from 'lucide-react'
import { rentalsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Pagination } from '@/components/Pagination'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

type CrmCustomer = {
  id: string
  name: string
  phone?: string | null
  rentalCount: number
  activeRentalCount: number
  overdueRentalCount: number
  lifetimeRentalValue: number
  outstandingBalance: number
  lastHireDate?: string | null
  nextReturnDate?: string | null
}

type CalendarRental = {
  id: string
  rentalNo: string
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  hireDate: string
  expectedReturnDate: string
  actualReturnDate?: string | null
  status: string
  bookingState?: string | null
  totalAmount: number
  balance: number
  branch?: { name: string } | null
  items: { quantity: number; product?: { name: string } | null }[]
  payments: { id: string; paymentDate: string; amount: number; kind: string; receiptNo?: string | null }[]
}

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const localDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
const apiDate = (date: Date, end = false) => {
  const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate(), end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0)
  return boundary.toISOString()
}
const displayDate = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'

export default function RentalCRMPage() {
  const { toast } = useToast()
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))
  const [customers, setCustomers] = useState<CrmCustomer[]>([])
  const [calendarRentals, setCalendarRentals] = useState<CalendarRental[]>([])
  const [calendarTruncated, setCalendarTruncated] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)

  const gridDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
  }, [month])

  const load = useCallback(async () => {
    setLoading(true)
    const from = gridDays[0]
    const to = gridDays[gridDays.length - 1]
    try {
      const [crm, dashboard] = await Promise.all([
        rentalsApi.crmOverview({ from: apiDate(from), to: apiDate(to, true), page, limit: 25, search: search.trim() || undefined }),
        rentalsApi.dashboardSummary(),
      ])
      setCustomers(crm?.customers || [])
      setCalendarRentals(crm?.calendarRentals || [])
      setCalendarTruncated(Boolean(crm?.calendarPagination?.truncated))
      setPagination(crm?.customerPagination || { page: 1, limit: 25, total: 0, pages: 0 })
      setSummary(dashboard)
    } catch (error: any) {
      toast({ title: 'Rental CRM could not load', description: error?.message || 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [gridDays, page, search, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  useEffect(() => {
    const timer = window.setInterval(() => { void load() }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const eventsByDay = useMemo(() => {
    const events = new Map<string, { rental: CalendarRental; kind: 'booking' | 'return' | 'returned' | 'payment'; amount?: number }[]>()
    const add = (key: string, event: { rental: CalendarRental; kind: 'booking' | 'return' | 'returned' | 'payment'; amount?: number }) => {
      const list = events.get(key) || []
      list.push(event)
      events.set(key, list)
    }
    calendarRentals.forEach(rental => {
      if (rental.status !== 'cancelled') {
        add(dayKey(localDate(rental.hireDate)), { rental, kind: 'booking' })
        if (rental.status === 'active') add(dayKey(localDate(rental.expectedReturnDate)), { rental, kind: 'return' })
        if (rental.actualReturnDate) add(dayKey(localDate(rental.actualReturnDate)), { rental, kind: 'returned' })
      }
      rental.payments?.forEach(payment => add(dayKey(localDate(payment.paymentDate)), { rental, kind: 'payment', amount: Number(payment.amount) }))
    })
    return events
  }, [calendarRentals])

  const selectedEvents = eventsByDay.get(selectedDay) || []
  const moveMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    setMonth(next)
    setSelectedDay(dayKey(next))
  }
  const today = () => {
    const now = new Date()
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDay(dayKey(now))
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Rentals</p>
          <h1 className="text-2xl font-semibold tracking-tight">Renter CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bookings, renter relationships, balances, and follow-ups in one place.</p>
        </div>
        <Button asChild><Link to="/tenant/rentals/bookings"><CalendarDays className="mr-2 h-4 w-4" />Open bookings</Link></Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Rental relationship summary">
        <Metric icon={Users} label="Active rentals" value={summary?.activeCount ?? '—'} hint={`${summary?.reservationCount ?? 0} reservations`} />
        <Metric icon={AlertTriangle} label="Overdue returns" value={summary?.overdueCount ?? '—'} hint={formatCurrency(summary?.overdueBalance || 0)} alert={Number(summary?.overdueCount) > 0} />
        <Metric icon={Wallet} label="Outstanding rent" value={summary ? formatCurrency(summary.outstandingBalance || 0) : '—'} hint="Open renter balances" />
        <Metric icon={Clock3} label="Collected this month" value={summary ? formatCurrency(summary.collectionsThisMonth || 0) : '—'} hint={`${summary?.receiptsThisMonth ?? 0} receipts`} />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
            <div><h2 className="font-semibold">Booking calendar</h2><p className="text-sm text-muted-foreground">Synced directly from rental bookings and posted receipts.</p></div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" title="Previous month" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="min-w-36 text-center text-sm font-medium">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</div>
              <Button variant="outline" size="icon" title="Next month" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" className="ml-1" onClick={today}>Today</Button>
            </div>
          </div>
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-7 border-l border-t text-center text-xs font-medium text-muted-foreground">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="border-b border-r px-1 py-2">{day}</div>)}
              {gridDays.map(date => {
                const key = dayKey(date)
                const events = eventsByDay.get(key) || []
                const inMonth = date.getMonth() === month.getMonth()
                return <button key={key} onClick={() => setSelectedDay(key)} className={`min-h-[76px] border-b border-r p-1 text-left transition-colors sm:min-h-[100px] sm:p-2 ${inMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'} ${selectedDay === key ? 'relative z-10 outline outline-2 outline-primary -outline-offset-2' : 'hover:bg-muted/50'}`}>
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${key === dayKey(new Date()) ? 'bg-primary text-primary-foreground' : ''}`}>{date.getDate()}</span>
                  <span className="mt-1 flex flex-col gap-1">
                    {events.slice(0, 2).map((event, index) => <span key={`${event.rental.id}-${event.kind}-${index}`} className={`truncate rounded px-1 py-0.5 text-[10px] leading-4 sm:text-xs ${event.kind === 'return' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : event.kind === 'payment' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : event.kind === 'returned' ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200' : 'bg-primary/10 text-primary'}`}>{event.kind === 'payment' ? 'Paid' : event.kind === 'return' ? 'Due' : event.kind === 'returned' ? 'Returned' : 'Booking'} · {event.rental.customerName || event.rental.rentalNo}</span>)}
                    {events.length > 2 && <span className="px-1 text-[10px] text-muted-foreground">+{events.length - 2} more</span>}
                  </span>
                </button>
              })}
            </div>
            {calendarTruncated && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">There are many events in this period; the calendar is showing the first 500.</p>}
            {loading && <p className="mt-3 text-xs text-muted-foreground">Refreshing calendar…</p>}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <div className="border-b p-4"><h2 className="font-semibold">{displayDate(selectedDay)}</h2><p className="text-sm text-muted-foreground">Bookings, expected returns, and receipts</p></div>
          <CardContent className="space-y-3 p-4">
            {selectedEvents.length === 0 ? <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No rental activity scheduled for this date.</div> : selectedEvents.map((event, index) => <Link key={`${event.rental.id}-${event.kind}-${index}`} to="/tenant/rentals/bookings" state={{ openRentalId: event.rental.id }} className="block rounded-md border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-medium">{event.rental.customerName || 'Renter'} <span className="font-normal text-muted-foreground">· {event.rental.rentalNo}</span></p><p className="mt-1 text-xs text-muted-foreground">{event.rental.items.map(item => item.product?.name).filter(Boolean).join(', ') || 'Rental booking'}{event.rental.branch?.name ? ` · ${event.rental.branch.name}` : ''}</p></div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs capitalize">{event.kind === 'return' ? 'Due back' : event.kind}</span></div>
              <p className="mt-2 text-sm">{event.kind === 'payment' ? `Receipt ${formatCurrency(event.amount || 0)}` : `Balance ${formatCurrency(event.rental.balance || 0)}`}</p>
            </Link>)}
          </CardContent>
        </Card>
      </section>

      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div><h2 className="font-semibold">Renter relationships</h2><p className="text-sm text-muted-foreground">Rental history, current exposure, and next follow-up.</p></div>
          <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search renters" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Renter</th><th className="px-4 py-3">Rentals</th><th className="px-4 py-3">Active</th><th className="px-4 py-3">Lifetime value</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Last booking</th><th className="px-4 py-3">Next return</th><th className="px-4 py-3">Follow-up</th></tr></thead>
            <tbody className="divide-y">
              {customers.map(customer => <tr key={customer.id} className="hover:bg-muted/30">
                <td className="px-4 py-3"><Link to={`/tenant/rentals/bookings?customerId=${encodeURIComponent(customer.id)}`} className="font-medium text-primary hover:underline">{customer.name}</Link>{customer.phone && <a className="mt-0.5 block text-xs text-muted-foreground hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a>}</td>
                <td className="px-4 py-3 tabular-nums">{customer.rentalCount}</td><td className="px-4 py-3 tabular-nums">{customer.activeRentalCount}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(customer.lifetimeRentalValue)}</td><td className="px-4 py-3 tabular-nums">{formatCurrency(customer.outstandingBalance)}</td>
                <td className="px-4 py-3">{displayDate(customer.lastHireDate)}</td><td className="px-4 py-3">{displayDate(customer.nextReturnDate)}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs ${customer.overdueRentalCount ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' : customer.outstandingBalance > 0 ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'}`}>{customer.overdueRentalCount ? `${customer.overdueRentalCount} overdue` : customer.outstandingBalance > 0 ? 'Balance due' : customer.activeRentalCount ? 'Active' : 'Clear'}</span></td>
              </tr>)}
              {!loading && customers.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No renters with rental activity match this search.</td></tr>}
            </tbody>
          </table>
          {pagination.total > pagination.limit && <Pagination currentPage={pagination.page} totalPages={pagination.pages} totalItems={pagination.total} pageSize={pagination.limit} onPageChange={setPage} />}
        </div>
      </section>
    </div>
  )
}

function Metric({ icon: Icon, label, value, hint, alert = false }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number; hint: string; alert?: boolean }) {
  return <Card><CardContent className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-1 truncate text-xl font-semibold tabular-nums ${alert ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p></div><span className={`rounded-md p-2 ${alert ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-primary/10 text-primary'}`}><Icon className="h-4 w-4" /></span></CardContent></Card>
}
