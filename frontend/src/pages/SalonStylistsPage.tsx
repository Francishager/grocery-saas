import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, RefreshCw } from 'lucide-react'

type Stylist = { id: string; name: string; employeeId?: string | null; phone?: string | null; email?: string | null; role?: string; isActive: boolean }
const emptyForm = { name: '', employeeId: '', phone: '', email: '', role: 'stylist' }

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export default function SalonStylistsPage() {
  const { hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const [stylists, setStylists] = useState<Stylist[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const rows = await request('/api/salon/stylists'); setStylists(Array.isArray(rows) ? rows : []) }
    catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not load stylists' }) }
    finally { setLoading(false) }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!form.name.trim()) return toast({ variant: 'destructive', title: 'Enter the stylist name' })
    setSaving(true)
    try {
      await request(editingId ? `/api/salon/stylists/${editingId}` : '/api/salon/stylists', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, skills: [], specializations: [] }),
      })
      toast({ title: editingId ? 'Stylist updated' : 'Stylist added' })
      setForm(emptyForm); setEditingId(null); await load()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not save stylist' }) }
    finally { setSaving(false) }
  }

  const deactivate = async (stylist: Stylist) => {
    setSaving(true)
    try { await request(`/api/salon/stylists/${stylist.id}/deactivate`, { method: 'POST' }); toast({ title: 'Stylist deactivated' }); await load() }
    catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not deactivate stylist' }) }
    finally { setSaving(false) }
  }

  return <main className="mx-auto w-full max-w-[1440px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Stylists</h1><p className="text-sm text-muted-foreground">Manage the team assigned to salon appointments and commissions.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></header>
    {(hasPermission('canCreateSalonStylist') || hasPermission('canEditSalonStylist')) && <Card className="rounded-md"><CardHeader><CardTitle className="text-base">{editingId ? 'Edit stylist' : 'Add stylist'}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="Stylist name" /></div>
      <div><Label>HR employee ID (optional)</Label><Input value={form.employeeId} onChange={e => setForm(v => ({ ...v, employeeId: e.target.value }))} placeholder="Only if HR is enabled" /><p className="mt-1 text-xs text-muted-foreground">Salon staffing, appointments, and direct commission payments work without HR.</p></div>
      <div><Label>Role</Label><Input value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))} /></div>
      <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(v => ({ ...v, phone: e.target.value }))} /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} /></div>
      <div className="flex items-end gap-2"><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{editingId ? 'Save changes' : 'Add stylist'}</Button>{editingId && <Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm) }}>Cancel</Button>}</div>
    </CardContent></Card>}
    <Card className="rounded-md"><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[680px] text-sm"><thead className="bg-muted/60 text-left"><tr><th className="p-3">Stylist</th><th className="p-3">Role</th><th className="p-3">Phone</th><th className="p-3">Email</th><th className="p-3">Employee</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{stylists.map(person => <tr key={person.id} className="border-t"><td className="p-3 font-medium">{person.name}</td><td className="p-3">{person.role || 'Stylist'}</td><td className="p-3">{person.phone || '—'}</td><td className="p-3">{person.email || '—'}</td><td className="p-3">{person.employeeId || '—'}</td><td className="p-3"><Badge variant={person.isActive ? 'default' : 'secondary'}>{person.isActive ? 'Active' : 'Inactive'}</Badge></td><td className="p-3"><div className="flex justify-end gap-2">{person.isActive && hasPermission('canEditSalonStylist') && <Button size="sm" variant="outline" onClick={() => { setEditingId(person.id); setForm({ name: person.name, employeeId: person.employeeId || '', phone: person.phone || '', email: person.email || '', role: person.role || 'stylist' }) }}>Edit</Button>}{person.isActive && hasPermission('canDeactivateSalonStylist') && <Button size="sm" variant="outline" disabled={saving} onClick={() => void deactivate(person)}>Deactivate</Button>}</div></td></tr>)}</tbody></table>{loading && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}{!loading && stylists.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No stylists have been added yet.</p>}</CardContent></Card>
  </main>
}
