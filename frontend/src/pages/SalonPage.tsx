import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Armchair, Award, Loader2, Plus, RefreshCw, Save } from 'lucide-react'

type Chair = { id: string; name: string; code?: string | null; location?: string | null; branchId?: string | null; branch?: { id: string; name: string } | null; isActive: boolean; notes?: string | null }
type Stylist = { id: string; name: string; employeeId?: string | null; commissionType: 'percent' | 'fixed'; commissionValue: number }
type Commission = { id: string; stylistName: string; serviceName: string; serviceRevenue: number; commissionAmount: number; status: string; completedAt: string; payrollReference?: string | null; appointment: { customerName: string; scheduledDate: string; scheduledTime: string; branch?: { name: string } | null } }
type Branch = { id: string; name: string }

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export default function SalonPage({ section }: { section: 'chairs' | 'commissions' }) {
  const { hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const [chairs, setChairs] = useState<Chair[]>([])
  const [technicians, setTechnicians] = useState<Stylist[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [chairForm, setChairForm] = useState({ name: '', code: '', location: '', branchId: '', notes: '' })
  const [editingChair, setEditingChair] = useState<string | null>(null)
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, { type: 'percent' | 'fixed'; value: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (section === 'chairs') {
        const [rows, branchData] = await Promise.all([
          request('/api/salon/chairs'),
          request('/api/branches/options').catch(() => ({ branches: [] })),
        ])
        setChairs(Array.isArray(rows) ? rows : [])
        setBranches(Array.isArray(branchData?.branches) ? branchData.branches : Array.isArray(branchData) ? branchData : [])
      } else {
        const data = await request('/api/salon/commissions')
        setTechnicians(data.technicians || [])
        setCommissions(data.commissions || [])
        setRuleDrafts(Object.fromEntries((data.technicians || []).map((person: Stylist) => [person.id, { type: person.commissionType || 'percent', value: String(person.commissionValue || 0) }])))
      }
    } catch (error) {
      toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Unable to load Salon & Spa data' })
    } finally { setLoading(false) }
  }, [section, toast])

  useEffect(() => { void load() }, [load])

  const saveChair = async () => {
    if (!chairForm.name.trim()) return toast({ variant: 'destructive', title: 'Enter a chair or station name' })
    setSaving(true)
    try {
      await request(editingChair ? `/api/salon/chairs/${editingChair}` : '/api/salon/chairs', {
        method: editingChair ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chairForm),
      })
      setChairForm({ name: '', code: '', location: '', branchId: '', notes: '' }); setEditingChair(null)
      toast({ title: editingChair ? 'Chair updated' : 'Chair created' }); await load()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not save chair' }) }
    finally { setSaving(false) }
  }

  const saveRule = async (stylist: Stylist) => {
    const draft = ruleDrafts[stylist.id]
    if (!draft) return
    setSaving(true)
    try {
      await request(`/api/salon/technicians/${stylist.id}/commission`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commissionType: draft.type, commissionValue: Number(draft.value) }) })
      toast({ title: 'Commission rule saved' }); await load()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not save commission rule' }) }
    finally { setSaving(false) }
  }

  const approve = async (commission: Commission) => {
    setSaving(true)
    try {
      await request(`/api/salon/commissions/${commission.id}/approve`, { method: 'POST' })
      toast({ title: 'Commission approved for payroll' }); await load()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not approve commission' }) }
    finally { setSaving(false) }
  }

  const deactivateChair = async (chair: Chair) => {
    setSaving(true)
    try { await request(`/api/salon/chairs/${chair.id}/deactivate`, { method: 'POST' }); toast({ title: 'Chair deactivated' }); await load() }
    catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not deactivate chair' }) }
    finally { setSaving(false) }
  }

  const title = section === 'chairs' ? 'Chair Schedule' : 'Stylist Commissions'
  const canManageChairs = hasPermission('canCreateSalonChair') || hasPermission('canEditSalonChair')
  const canConfigureCommissions = hasPermission('canConfigureSalonCommission')

  return <div className="mx-auto w-full max-w-[1440px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-200">{section === 'chairs' ? <Armchair className="h-5 w-5" /> : <Award className="h-5 w-5" />}</div><div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{section === 'chairs' ? 'Manage bookable chairs and stations by branch.' : 'Set commission rules and review completed-service earnings for payroll.'}</p></div></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </header>

    {section === 'chairs' && canManageChairs && <Card className="rounded-md"><CardHeader><CardTitle className="text-base">{editingChair ? 'Edit chair or station' : 'Add chair or station'}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div><Label>Name</Label><Input value={chairForm.name} onChange={e => setChairForm(v => ({ ...v, name: e.target.value }))} placeholder="Chair 1" /></div>
      <div><Label>Code</Label><Input value={chairForm.code} onChange={e => setChairForm(v => ({ ...v, code: e.target.value }))} placeholder="Optional" /></div>
      <div><Label>Branch</Label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={chairForm.branchId} onChange={e => setChairForm(v => ({ ...v, branchId: e.target.value }))}><option value="">All branches</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
      <div><Label>Location</Label><Input value={chairForm.location} onChange={e => setChairForm(v => ({ ...v, location: e.target.value }))} placeholder="Main floor" /></div>
      <div className="flex items-end gap-2"><Button onClick={() => void saveChair()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{editingChair ? 'Save changes' : 'Add chair'}</Button>{editingChair && <Button variant="outline" onClick={() => { setEditingChair(null); setChairForm({ name: '', code: '', location: '', branchId: '', notes: '' }) }}>Cancel</Button>}</div>
    </CardContent></Card>}

    {loading ? <div className="flex min-h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading {title.toLowerCase()}…</div> : section === 'chairs' ? <Card className="rounded-md"><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[680px] text-sm"><thead className="bg-muted/60 text-left"><tr><th className="p-3">Chair</th><th className="p-3">Code</th><th className="p-3">Location</th><th className="p-3">Branch</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{chairs.map(chair => <tr key={chair.id} className="border-t"><td className="p-3 font-medium">{chair.name}</td><td className="p-3">{chair.code || '—'}</td><td className="p-3">{chair.location || '—'}</td><td className="p-3">{chair.branch?.name || 'All branches'}</td><td className="p-3"><Badge variant={chair.isActive ? 'default' : 'secondary'}>{chair.isActive ? 'Active' : 'Inactive'}</Badge></td><td className="p-3 text-right">{chair.isActive && <div className="flex justify-end gap-2">{hasPermission('canEditSalonChair') && <Button size="sm" variant="outline" onClick={() => { setEditingChair(chair.id); setChairForm({ name: chair.name, code: chair.code || '', location: chair.location || '', branchId: chair.branchId || '', notes: chair.notes || '' }) }}>Edit</Button>}{hasPermission('canDeactivateSalonChair') && <Button size="sm" variant="outline" disabled={saving} onClick={() => void deactivateChair(chair)}>Deactivate</Button>}</div>}</td></tr>)}</tbody></table>{chairs.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No chairs configured yet.</p>}</CardContent></Card> : <>
      {canConfigureCommissions && <Card className="rounded-md"><CardHeader><CardTitle className="text-base">Stylist commission rules</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/60 text-left"><tr><th className="p-3">Stylist</th><th className="p-3">Employee</th><th className="p-3">Basis</th><th className="p-3">Value</th><th className="p-3" /></tr></thead><tbody>{technicians.map(person => <tr key={person.id} className="border-t"><td className="p-3 font-medium">{person.name}</td><td className="p-3">{person.employeeId || 'Not linked to HR'}</td><td className="p-3"><select className="h-9 rounded-md border bg-background px-2" value={ruleDrafts[person.id]?.type || 'percent'} onChange={e => setRuleDrafts(v => ({ ...v, [person.id]: { ...v[person.id], type: e.target.value as 'percent' | 'fixed' } }))}><option value="percent">Percent of service price</option><option value="fixed">Fixed per completed service</option></select></td><td className="p-3"><Input className="w-32" type="number" min="0" max={ruleDrafts[person.id]?.type === 'percent' ? 100 : undefined} step="0.01" value={ruleDrafts[person.id]?.value || '0'} onChange={e => setRuleDrafts(v => ({ ...v, [person.id]: { ...v[person.id], value: e.target.value } }))} /></td><td className="p-3 text-right"><Button size="sm" onClick={() => void saveRule(person)} disabled={saving}><Save className="mr-2 h-4 w-4" />Save</Button></td></tr>)}</tbody></table>{technicians.length === 0 && <p className="p-6 text-sm text-muted-foreground">Create and link stylists in Service Business → Technicians first.</p>}</CardContent></Card>}
      <Card className="rounded-md"><CardHeader><CardTitle className="text-base">Completed service commissions</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/60 text-left"><tr><th className="p-3">Completed</th><th className="p-3">Stylist</th><th className="p-3">Client</th><th className="p-3">Service</th><th className="p-3 text-right">Service revenue</th><th className="p-3 text-right">Commission</th><th className="p-3">Status</th><th className="p-3" /></tr></thead><tbody>{commissions.map(item => <tr key={item.id} className="border-t"><td className="p-3">{new Date(item.completedAt).toLocaleDateString()}</td><td className="p-3">{item.stylistName}</td><td className="p-3">{item.appointment?.customerName || '—'}</td><td className="p-3">{item.serviceName}</td><td className="p-3 text-right tabular-nums">{item.serviceRevenue.toLocaleString()}</td><td className="p-3 text-right font-semibold tabular-nums">{item.commissionAmount.toLocaleString()}</td><td className="p-3"><Badge variant={item.status === 'approved' ? 'default' : item.status === 'voided' ? 'destructive' : 'secondary'}>{item.status.replace(/_/g, ' ')}</Badge></td><td className="p-3 text-right">{item.status === 'pending' && hasPermission('canApproveSalonCommission') && <Button size="sm" variant="outline" onClick={() => void approve(item)} disabled={saving}>Approve</Button>}</td></tr>)}</tbody></table>{commissions.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Commissions are recorded when a salon appointment is completed and the assigned stylist has a commission rule.</p>}</CardContent></Card>
      <p className="text-xs text-muted-foreground">Approved commissions can be selected into an employee’s payroll for the same service-completion month. They are not treated as paid until payroll is posted and paid.</p>
    </>}
  </div>
}
