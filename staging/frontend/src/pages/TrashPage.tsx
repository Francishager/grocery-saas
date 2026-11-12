import { useCallback, useEffect, useRef, useState } from 'react'
import { ArchiveRestore, MoreVertical, RefreshCw, Search, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { appConfirm } from '@/lib/appFeedback'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { trashPermissions } from '@/lib/trashPermissions'
import { useToast } from '@/hooks/use-toast'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/Pagination'
import { Root as DropdownMenu, Content as DropdownMenuContent, Item as DropdownMenuItem, Trigger as DropdownMenuTrigger, Portal as DropdownMenuPortal } from '@radix-ui/react-dropdown-menu'

interface TrashItem { id: string; label: string; type: string; deletedBy: string; deletedAt: string; expiresAt: string }
interface Failure { id: string; label: string; error: string }
const pageSize = 20
const menuClass = 'z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md'
const menuItemClass = 'flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground'
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value))
async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Unable to update Trash.')
  return body
}

export default function TrashPage() {
  const { hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const allowed = trashPermissions.some(hasPermission)
  const [items, setItems] = useState<TrashItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [failures, setFailures] = useState<Failure[]>([])
  const [progress, setProgress] = useState(0)
  const requestVersion = useRef(0)
  const actionInFlight = useRef(false)
  const load = useCallback(async () => {
    if (!allowed) return
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    try {
      const body = await request(`/api/trash?page=${page}&limit=${pageSize}&search=${encodeURIComponent(query)}`)
      if (version !== requestVersion.current) return
      setItems(body.items || [])
      setTotal(body.total || 0)
      if (page > Math.max(1, Math.ceil(body.total / pageSize))) setPage(Math.max(1, Math.ceil(body.total / pageSize)))
    } catch (err) { if (version === requestVersion.current) { setItems([]); setError((err as Error).message) } }
    finally { if (version === requestVersion.current) setLoading(false) }
  }, [allowed, page, query])
  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setQuery(search.trim()) }, 250)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => { void load(); return () => { requestVersion.current++ } }, [load])

  const act = async (action: 'restore' | 'delete', item?: TrashItem) => {
    if (actionInFlight.current || !allowed) return
    actionInFlight.current = true
    const target = item ? `"${item.label}"` : 'all items you are permitted to manage, across every page and regardless of the search filter'
    try {
      const confirmed = await appConfirm(action === 'restore' ? `Restore ${target}?`
        : `Delete ${target} from Trash? Recovery will no longer be available. Existing transaction and audit history will be retained.`)
      if (!confirmed) return
      setBusy(true)
      setActionError('')
      setFailures([])
      setProgress(0)
      let succeeded = 0
      const failed: Failure[] = []
      if (item) {
        await request(`/api/trash/${encodeURIComponent(item.id)}${action === 'restore' ? '/restore' : ''}`, { method: action === 'restore' ? 'POST' : 'DELETE' })
        succeeded = 1
      } else {
        let cursor: string | undefined, before: string | undefined, hasMore = true
        while (hasMore) {
          const body = await request('/api/trash/bulk', { method: 'POST', body: JSON.stringify({ action, cursor, before }) })
          succeeded += body.succeeded
          failed.push(...body.failed)
          setFailures([...failed])
          cursor = body.cursor
          before = body.before
          hasMore = body.hasMore
          setProgress(succeeded + failed.length)
        }
      }
      toast({ title: action === 'restore' ? 'Restore complete' : 'Trash updated', description: `${succeeded} ${action === 'restore' ? 'restored' : 'removed'}${failed.length ? `; ${failed.length} need review` : ''}.` })
    } catch (err) { setActionError((err as Error).message); toast({ title: 'Trash action failed', description: (err as Error).message, variant: 'destructive' }) }
    finally { actionInFlight.current = false; setBusy(false); await load() }
  }

  if (!allowed) return <div role="alert" className="p-6 text-sm text-muted-foreground">A delete permission is required to access Trash.</div>
  return <div className="min-w-0 space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Trash</h1><p className="mt-1 text-sm text-muted-foreground">30-day recovery period</p></div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" title="Refresh Trash" aria-label="Refresh Trash" disabled={busy || loading} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        <DropdownMenu><DropdownMenuTrigger className={buttonVariants({ variant: 'outline' })} disabled={busy || loading || total === 0}>All Items <MoreVertical className="ml-2 h-4 w-4" /></DropdownMenuTrigger>
          <DropdownMenuPortal><DropdownMenuContent align="end" sideOffset={4} className={menuClass}>
            <DropdownMenuItem className={menuItemClass} onSelect={() => void act('restore')}><ArchiveRestore className="mr-2 h-4 w-4" />Restore All</DropdownMenuItem>
            <DropdownMenuItem className={`${menuItemClass} text-destructive`} onSelect={() => void act('delete')}><Trash2 className="mr-2 h-4 w-4" />Delete All</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search Trash" placeholder="Search deleted records" value={search} onChange={e => setSearch(e.target.value)} disabled={busy} className="pl-9" /></div>
      <span className="text-sm tabular-nums text-muted-foreground">{total} {total === 1 ? 'item' : 'items'}</span>
    </div>
    {(error || actionError) && <p role="alert" className="text-sm text-destructive">{error || actionError}</p>}
    {busy && <p role="status" className="text-sm">Processing{progress ? `: ${progress} items` : '...'}</p>}
    {failures.length > 0 && <section role="alert" className="space-y-2 border-l-2 border-destructive pl-3"><h2 className="text-sm font-semibold">Needs Review</h2>{failures.map(failure => <p key={failure.id} className="break-words text-sm">{failure.label}: {failure.error}</p>)}</section>}
    <div className="overflow-x-auto border-y">
      <table className="w-full min-w-[660px] text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Record</th><th className="p-3 font-medium">Deleted By</th><th className="p-3 font-medium">Deleted</th><th className="p-3 font-medium">Expires</th><th className="w-14 p-3"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id} className="border-b last:border-0">
          <td className="max-w-xs p-3"><div className="break-words font-medium">{item.label}</div><div className="text-xs text-muted-foreground">{item.type}</div></td>
          <td className="max-w-40 break-words p-3">{item.deletedBy}</td><td className="whitespace-nowrap p-3 tabular-nums">{date(item.deletedAt)}</td>
          <td className="whitespace-nowrap p-3 tabular-nums">{date(item.expiresAt)}<div className="text-xs text-muted-foreground">{Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000))} days left</div></td>
          <td className="p-2"><DropdownMenu><DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Record actions" aria-label={`Actions for ${item.label}`} disabled={busy || loading}><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuPortal><DropdownMenuContent align="end" sideOffset={4} className={menuClass}><DropdownMenuItem className={menuItemClass} onSelect={() => void act('restore', item)}><ArchiveRestore className="mr-2 h-4 w-4" />Restore</DropdownMenuItem><DropdownMenuItem className={`${menuItemClass} text-destructive`} onSelect={() => void act('delete', item)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenuPortal>
          </DropdownMenu></td>
        </tr>)}</tbody>
      </table>
      {!items.length && <div role="status" className="py-12 text-center text-sm text-muted-foreground">{loading ? 'Loading Trash...' : query ? 'No matching records.' : 'Trash is empty.'}</div>}
    </div>
    <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} totalItems={total} pageSize={pageSize} onPageChange={value => { if (!busy) setPage(value) }} />
  </div>
}
