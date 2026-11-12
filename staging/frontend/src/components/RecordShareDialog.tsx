import { useEffect, useMemo, useState } from 'react'
import { Search, Share2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type SharePerson = { id: string; name: string }
export type RecordShare = { userId: string; role: 'viewer' | 'editor' }
const EMPTY_SHARES: RecordShare[] = []

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  people: SharePerson[]
  initialVisibility?: 'workspace' | 'restricted'
  initialShares?: RecordShare[]
  loading?: boolean
  saving?: boolean
  onSave: (visibility: 'workspace' | 'restricted', sharedWith: RecordShare[]) => void
}

export function RecordShareDialog({ open, onOpenChange, title, people, initialVisibility = 'workspace', initialShares = EMPTY_SHARES, loading = false, saving = false, onSave }: Props) {
  const [visibility, setVisibility] = useState<'workspace' | 'restricted'>(initialVisibility)
  const [shares, setShares] = useState<RecordShare[]>(initialShares)
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (!open) return
    setVisibility(initialVisibility)
    setShares(initialShares)
    setSearch('')
  }, [open, initialVisibility, initialShares])
  const filteredPeople = useMemo(() => people.filter(person => person.name.toLowerCase().includes(search.trim().toLowerCase())), [people, search])
  const setRole = (userId: string, role: 'viewer' | 'editor') => setShares(current => current.map(share => share.userId === userId ? { ...share, role } : share))
  const togglePerson = (userId: string, checked: boolean) => setShares(current => checked
    ? [...current, { userId, role: 'viewer' }]
    : current.filter(share => share.userId !== userId))

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Share2 className="h-5 w-5" />Share {title}</DialogTitle>
        <DialogDescription>Choose who can access this item. Team members still need the relevant module permission.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Access</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <input type="radio" name="share-visibility" checked={visibility === 'workspace'} onChange={() => setVisibility('workspace')} className="mt-1" />
            <span><span className="block text-sm font-medium">Anyone with access to this module</span><span className="text-xs text-muted-foreground">Visible to business users who can open this Planner or CRM area.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <input type="radio" name="share-visibility" checked={visibility === 'restricted'} onChange={() => setVisibility('restricted')} className="mt-1" />
            <span><span className="block text-sm font-medium">Specific people</span><span className="text-xs text-muted-foreground">Only you and the selected team members can access it. No selections keeps it private to you.</span></span>
          </label>
        </fieldset>
        {visibility === 'restricted' && <section className="space-y-2">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a team member" /></div>
          <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
            {loading ? <p className="p-4 text-sm text-muted-foreground">Loading team…</p> : filteredPeople.length ? filteredPeople.map(person => {
              const share = shares.find(row => row.userId === person.id)
              return <div key={person.id} className="flex items-center gap-3 p-3">
                <input type="checkbox" aria-label={`Share with ${person.name}`} checked={Boolean(share)} onChange={event => togglePerson(person.id, event.target.checked)} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
                {share && <select aria-label={`${person.name} access role`} className="h-9 rounded-md border bg-background px-2 text-sm" value={share.role} onChange={event => setRole(person.id, event.target.value as 'viewer' | 'editor')}><option value="viewer">Viewer</option><option value="editor">Editor</option></select>}
              </div>
            }) : <p className="p-4 text-sm text-muted-foreground">No matching team members.</p>}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Editors can change this item only if they already have the module’s manage/edit permission.</p>
        </section>}
        <div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={saving || loading} onClick={() => onSave(visibility, visibility === 'restricted' ? shares : [])}>{saving ? 'Saving…' : 'Save sharing'}</Button></div>
      </div>
    </DialogContent>
  </Dialog>
}
