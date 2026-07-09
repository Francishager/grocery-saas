import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Wrench, Plus, Trash2, CalendarClock, ClipboardList, FileText, Droplet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Appointment { id: string; customerName: string; customerPhone: string | null; title: string; scheduledDate: string; scheduledTime: string; duration: string | null; status: string; price: number; product?: { id: string; name: string } | null; customer?: { id: string; name: string } | null }
interface WorkOrder { id: string; orderNo: string; customerName: string; customerPhone: string | null; title: string; status: string; priority: string; estimatedCost: number; actualCost: number; startDate: string | null; endDate: string | null; product?: { id: string; name: string } | null }
interface ServiceContract { id: string; contractNo: string; title: string; customer: { id: string; name: string }; startDate: string; endDate: string | null; value: number; billingCycle: string; status: string }
interface CarWashRecord { id: string; createdAt: string; customerName: string; title: string; estimatedCost: number; technicianId?: string | null; notes?: string | null }
interface GarageRecord { id: string; createdAt: string; customerName: string; title: string; estimatedCost: number; status?: string | null; technicianId?: string | null; notes?: string | null }

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
  open: 'bg-blue-100 text-blue-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
}

export default function ServiceBusinessPage() {
  const { tab: urlTab } = useParams()
  const navigate = useNavigate()
  const tab = urlTab || 'appointments'
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [contracts, setContracts] = useState<ServiceContract[]>([])
  const [carWashRecords, setCarWashRecords] = useState<CarWashRecord[]>([])
  const [garageRecords, setGarageRecords] = useState<GarageRecord[]>([])
  const [showCarWashModal, setShowCarWashModal] = useState(false)
  const [showGarageModal, setShowGarageModal] = useState(false)
  const [carWashForm, setCarWashForm] = useState({ vehicle: '', serviceType: '', amount: 0, attendantId: '', notes: '' })
  const [garageForm, setGarageForm] = useState({ vehicle: '', service: '', cost: 0, attendantId: '', notes: '' })
  const [editingCarWashId, setEditingCarWashId] = useState<string | null>(null)
  const [editingGarageId, setEditingGarageId] = useState<string | null>(null)
  const [showApptModal, setShowApptModal] = useState(false)
  const [showWOModal, setShowWOModal] = useState(false)
  const [showContractModal, setShowContractModal] = useState(false)
  const [apptForm, setApptForm] = useState({ customerName: '', customerPhone: '', productId: '', title: '', scheduledDate: '', scheduledTime: '', duration: '', price: 0, notes: '' })
  const [woForm, setWoForm] = useState({ orderNo: '', customerName: '', customerPhone: '', productId: '', title: '', description: '', priority: 'normal', estimatedCost: 0 })
  const [contractForm, setContractForm] = useState({ contractNo: '', customerId: '', title: '', description: '', startDate: '', endDate: '', value: 0, billingCycle: 'monthly' })
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      const [a, w, c, car, gar] = await Promise.all([
        apiFetch('/api/service/appointments').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/work-orders').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/contracts').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/car-wash').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/garage').then(r => r.json()).catch(() => []),
      ])
      setAppointments(Array.isArray(a) ? a : [])
      setWorkOrders(Array.isArray(w) ? w : [])
      setContracts(Array.isArray(c) ? c : [])
      setCarWashRecords(Array.isArray(car) ? car : [])
      setGarageRecords(Array.isArray(gar) ? gar : [])
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const createAppt = async () => {
    if (!apptForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    if (!apptForm.productId) { toast({ variant: 'destructive', title: 'Select a service' }); return }
    if (!apptForm.scheduledDate) { toast({ variant: 'destructive', title: 'Date is required' }); return }
    if (!apptForm.scheduledTime) { toast({ variant: 'destructive', title: 'Time is required' }); return }
    try { await apiFetch('/api/service/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(apptForm) })
    setShowApptModal(false); setApptForm({ customerName: '', customerPhone: '', productId: '', title: '', scheduledDate: '', scheduledTime: '', duration: '', price: 0, notes: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create appointment' }) }
  }
  const createWO = async () => {
    if (!woForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    if (!woForm.title.trim()) { toast({ variant: 'destructive', title: 'Title is required' }); return }
    try { await apiFetch('/api/service/work-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(woForm) })
    setShowWOModal(false); setWoForm({ orderNo: '', customerName: '', customerPhone: '', productId: '', title: '', description: '', priority: 'normal', estimatedCost: 0 }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create work order' }) }
  }
  const createContract = async () => {
    if (!contractForm.title.trim()) { toast({ variant: 'destructive', title: 'Title is required' }); return }
    if (!contractForm.customerId) { toast({ variant: 'destructive', title: 'Select a customer' }); return }
    if (!contractForm.startDate) { toast({ variant: 'destructive', title: 'Start date is required' }); return }
    try { await apiFetch('/api/service/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractForm) })
    setShowContractModal(false); setContractForm({ contractNo: '', customerId: '', title: '', description: '', startDate: '', endDate: '', value: 0, billingCycle: 'monthly' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create contract' }) }
  }
  const updateApptStatus = async (id: string, status: string) => {
    await apiFetch(`/api/service/appointments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); loadData()
  }
  const updateWOStatus = async (id: string, status: string) => {
    await apiFetch(`/api/service/work-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); loadData()
  }
  const deleteAppt = async (id: string) => { try { await apiFetch(`/api/service/appointments/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }
  const deleteWO = async (id: string) => { try { await apiFetch(`/api/service/work-orders/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }
  const deleteContract = async (id: string) => { try { await apiFetch(`/api/service/contracts/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }

  const deleteCarWash = async (id: string) => { try { await apiFetch(`/api/service/car-wash/${id}`, { method: 'DELETE' }) } catch (e) { console.error(e) } ; loadData() }
  const deleteGarage = async (id: string) => { try { await apiFetch(`/api/service/garage/${id}`, { method: 'DELETE' }) } catch (e) { console.error(e) } ; loadData() }

  const openEditCarWash = (r: CarWashRecord) => {
    setEditingCarWashId(r.id)
    setCarWashForm({ vehicle: r.customerName || '', serviceType: r.title || '', amount: r.estimatedCost || 0, attendantId: r.technicianId || '', notes: r.notes || '' })
    setShowCarWashModal(true)
  }

  const openEditGarage = (g: GarageRecord) => {
    setEditingGarageId(g.id)
    setGarageForm({ vehicle: g.customerName || '', service: g.title || '', cost: g.estimatedCost || 0, attendantId: g.technicianId || '', notes: g.notes || '' })
    setShowGarageModal(true)
  }

  const upcomingAppts = appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length
  const openWOs = workOrders.filter(w => w.status === 'open' || w.status === 'in_progress').length
  const activeContracts = contracts.filter(c => c.status === 'active').length

  const sectionLabels: Record<string, string> = {
    appointments: 'Appointments',
    'work-orders': 'Work Orders',
    contracts: 'Contracts',
    'car-wash': 'Car Wash',
    garage: 'Garage Services',
  }
  const sectionDescription: Record<string, string> = {
    appointments: 'Manage scheduled service appointments and confirmations.',
    'work-orders': 'Track work orders, priorities, and status updates.',
    contracts: 'Manage service contracts and billing cycles.',
    'car-wash': 'Record and manage car wash services.',
    garage: 'Record and manage garage services and repairs.',
  }
  const currentSectionLabel = sectionLabels[tab] || 'Appointments'
  const currentSectionDescription = sectionDescription[tab] || 'Manage scheduled service appointments and confirmations.'

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-7 w-7" /> Service Business</h1>
            <p className="text-sm text-muted-foreground">{currentSectionLabel}</p>
          </div>
          <div className="rounded-xl border border-muted/50 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {currentSectionDescription}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{upcomingAppts}</div><p className="text-xs text-muted-foreground">Upcoming Appts</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{openWOs}</div><p className="text-xs text-muted-foreground">Open Work Orders</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{activeContracts}</div><p className="text-xs text-muted-foreground">Active Contracts</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{contracts.reduce((s, c) => s + c.value, 0).toFixed(0)}</div><p className="text-xs text-muted-foreground">Contract Value</p></CardContent></Card>
      </div>

      {tab === 'appointments' && (
        <div className="space-y-4">
          <Button onClick={() => setShowApptModal(true)}><Plus className="mr-1 h-4 w-4" /> New Appointment</Button>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Time</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Title</th><th className="p-2 text-right">Price</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2">{new Date(a.scheduledDate).toLocaleDateString()}</td>
                    <td className="p-2">{a.scheduledTime}</td>
                    <td className="p-2">{a.customerName}</td>
                    <td className="p-2">{a.title}</td>
                    <td className="p-2 text-right">{a.price.toFixed(0)}</td>
                    <td className="p-2"><Badge className={statusColors[a.status]}>{a.status}</Badge></td>
                    <td className="p-2 space-x-1">
                      {a.status === 'scheduled' && <Button size="sm" variant="outline" onClick={() => updateApptStatus(a.id, 'confirmed')}>Confirm</Button>}
                      {a.status === 'confirmed' && <Button size="sm" variant="outline" onClick={() => updateApptStatus(a.id, 'completed')}>Complete</Button>}
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteAppt(a.id)}><Trash2 className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'work-orders' && (
        <div className="space-y-4">
          <Button onClick={() => setShowWOModal(true)}><Plus className="mr-1 h-4 w-4" /> New Work Order</Button>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Order No</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Title</th><th className="p-2 text-left">Priority</th><th className="p-2 text-right">Est. Cost</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {workOrders.map(w => (
                  <tr key={w.id} className="border-t">
                    <td className="p-2 font-medium">{w.orderNo}</td>
                    <td className="p-2">{w.customerName}</td>
                    <td className="p-2">{w.title}</td>
                    <td className="p-2"><Badge variant={w.priority === 'urgent' ? 'destructive' : 'secondary'}>{w.priority}</Badge></td>
                    <td className="p-2 text-right">{w.estimatedCost.toFixed(0)}</td>
                    <td className="p-2"><Badge className={statusColors[w.status]}>{w.status}</Badge></td>
                    <td className="p-2 space-x-1">
                      {w.status === 'open' && <Button size="sm" variant="outline" onClick={() => updateWOStatus(w.id, 'in_progress')}>Start</Button>}
                      {w.status === 'in_progress' && <Button size="sm" variant="outline" onClick={() => updateWOStatus(w.id, 'completed')}>Complete</Button>}
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteWO(w.id)}><Trash2 className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'contracts' && (
        <div className="space-y-4">
          <Button onClick={() => setShowContractModal(true)}><Plus className="mr-1 h-4 w-4" /> New Contract</Button>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Contract No</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Title</th><th className="p-2 text-right">Value</th><th className="p-2 text-left">Billing</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 font-medium">{c.contractNo}</td>
                    <td className="p-2">{c.customer.name}</td>
                    <td className="p-2">{c.title}</td>
                    <td className="p-2 text-right">{c.value.toFixed(0)}</td>
                    <td className="p-2">{c.billingCycle}</td>
                    <td className="p-2"><Badge className={statusColors[c.status]}>{c.status}</Badge></td>
                    <td className="p-2"><Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteContract(c.id)}><Trash2 className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'car-wash' && (
        <div className="space-y-4">
          <Button onClick={() => { setEditingCarWashId(null); setCarWashForm({ vehicle: '', serviceType: '', amount: 0, attendantId: '', notes: '' }); setShowCarWashModal(true) }}><Plus className="mr-1 h-4 w-4" /> New Car Wash</Button>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Vehicle</th><th className="p-2 text-left">Service Type</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Attendant</th><th></th></tr></thead>
              <tbody>
                {carWashRecords.length === 0 && <tr className="border-t"><td colSpan={6} className="p-8 text-center text-muted-foreground">Car wash records will appear here once logged</td></tr>}
                {carWashRecords.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="p-2">{r.customerName}</td>
                    <td className="p-2">{r.title}</td>
                    <td className="p-2 text-right">{(r.estimatedCost || 0).toFixed(0)}</td>
                    <td className="p-2">{r.technicianId || '-'}</td>
                    <td className="p-2 space-x-1">
                      <Button size="sm" variant="outline" onClick={() => openEditCarWash(r)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteCarWash(r.id)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'garage' && (
        <div className="space-y-4">
          <Button onClick={() => { setEditingGarageId(null); setGarageForm({ vehicle: '', service: '', cost: 0, attendantId: '', notes: '' }); setShowGarageModal(true) }}><Plus className="mr-1 h-4 w-4" /> New Garage Service</Button>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Vehicle</th><th className="p-2 text-left">Service</th><th className="p-2 text-right">Cost</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {garageRecords.length === 0 && <tr className="border-t"><td colSpan={6} className="p-8 text-center text-muted-foreground">Garage service records will appear here once logged</td></tr>}
                {garageRecords.map(g => (
                  <tr key={g.id} className="border-t">
                    <td className="p-2">{new Date(g.createdAt).toLocaleDateString()}</td>
                    <td className="p-2">{g.customerName}</td>
                    <td className="p-2">{g.title}</td>
                    <td className="p-2 text-right">{(g.estimatedCost || 0).toFixed(0)}</td>
                    <td className="p-2">{g.status || '-'}</td>
                    <td className="p-2 space-x-1">
                      <Button size="sm" variant="outline" onClick={() => openEditGarage(g)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteGarage(g.id)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showCarWashModal} onOpenChange={setShowCarWashModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Car Wash</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Vehicle</Label><Input value={carWashForm.vehicle} onChange={e => setCarWashForm({ ...carWashForm, vehicle: e.target.value })} placeholder="Plate or description" /></div>
            <div><Label>Service Type</Label><Input value={carWashForm.serviceType} onChange={e => setCarWashForm({ ...carWashForm, serviceType: e.target.value })} placeholder="Exterior, Full, Valet" /></div>
            <div><Label>Amount</Label><Input type="number" value={carWashForm.amount} onChange={e => setCarWashForm({ ...carWashForm, amount: +e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={carWashForm.notes} onChange={e => setCarWashForm({ ...carWashForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={async () => {
            if (!carWashForm.vehicle.trim() || !carWashForm.serviceType.trim()) { toast({ variant: 'destructive', title: 'Vehicle and service type required' }); return }
            try {
              if (editingCarWashId) {
                await apiFetch(`/api/service/car-wash/${editingCarWashId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(carWashForm) })
                setEditingCarWashId(null)
              } else {
                await apiFetch('/api/service/car-wash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(carWashForm) })
              }
              setShowCarWashModal(false); setCarWashForm({ vehicle: '', serviceType: '', amount: 0, attendantId: '', notes: '' }); loadData()
            } catch { toast({ variant: 'destructive', title: 'Failed to record car wash' }) }
          }}>{editingCarWashId ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGarageModal} onOpenChange={setShowGarageModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Garage Service</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Vehicle</Label><Input value={garageForm.vehicle} onChange={e => setGarageForm({ ...garageForm, vehicle: e.target.value })} placeholder="Plate or description" /></div>
            <div><Label>Service</Label><Input value={garageForm.service} onChange={e => setGarageForm({ ...garageForm, service: e.target.value })} placeholder="Brake repair, Oil change" /></div>
            <div><Label>Cost</Label><Input type="number" value={garageForm.cost} onChange={e => setGarageForm({ ...garageForm, cost: +e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={garageForm.notes} onChange={e => setGarageForm({ ...garageForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={async () => {
            if (!garageForm.vehicle.trim() || !garageForm.service.trim()) { toast({ variant: 'destructive', title: 'Vehicle and service required' }); return }
            try {
              if (editingGarageId) {
                await apiFetch(`/api/service/garage/${editingGarageId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(garageForm) })
                setEditingGarageId(null)
              } else {
                await apiFetch('/api/service/garage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(garageForm) })
              }
              setShowGarageModal(false); setGarageForm({ vehicle: '', service: '', cost: 0, attendantId: '', notes: '' }); loadData()
            } catch { toast({ variant: 'destructive', title: 'Failed to record garage service' }) }
          }}>{editingGarageId ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApptModal} onOpenChange={setShowApptModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Appointment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer Name</Label><Input value={apptForm.customerName} onChange={e => setApptForm({ ...apptForm, customerName: e.target.value })} /></div>
            <div><Label>Customer Phone</Label><Input value={apptForm.customerPhone} onChange={e => setApptForm({ ...apptForm, customerPhone: e.target.value })} /></div>
            <div><Label>Title</Label><Input value={apptForm.title} onChange={e => setApptForm({ ...apptForm, title: e.target.value })} placeholder="Oil Change" /></div>
            <div><Label>Date</Label><Input type="date" value={apptForm.scheduledDate} onChange={e => setApptForm({ ...apptForm, scheduledDate: e.target.value })} /></div>
            <div><Label>Time</Label><Input type="time" value={apptForm.scheduledTime} onChange={e => setApptForm({ ...apptForm, scheduledTime: e.target.value })} /></div>
            <div><Label>Duration</Label><Input value={apptForm.duration} onChange={e => setApptForm({ ...apptForm, duration: e.target.value })} placeholder="1 hour" /></div>
            <div><Label>Price</Label><Input type="number" value={apptForm.price} onChange={e => setApptForm({ ...apptForm, price: +e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createAppt}>Create Appointment</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWOModal} onOpenChange={setShowWOModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Order No</Label><Input value={woForm.orderNo} onChange={e => setWoForm({ ...woForm, orderNo: e.target.value })} placeholder="WO-001" /></div>
            <div><Label>Customer Name</Label><Input value={woForm.customerName} onChange={e => setWoForm({ ...woForm, customerName: e.target.value })} /></div>
            <div><Label>Customer Phone</Label><Input value={woForm.customerPhone} onChange={e => setWoForm({ ...woForm, customerPhone: e.target.value })} /></div>
            <div><Label>Title</Label><Input value={woForm.title} onChange={e => setWoForm({ ...woForm, title: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={woForm.description} onChange={e => setWoForm({ ...woForm, description: e.target.value })} /></div>
            <div><Label>Priority</Label>
              <Select value={woForm.priority} onValueChange={v => setWoForm({ ...woForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Estimated Cost</Label><Input type="number" value={woForm.estimatedCost} onChange={e => setWoForm({ ...woForm, estimatedCost: +e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createWO}>Create Work Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContractModal} onOpenChange={setShowContractModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Service Contract</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Contract No</Label><Input value={contractForm.contractNo} onChange={e => setContractForm({ ...contractForm, contractNo: e.target.value })} placeholder="CON-001" /></div>
            <div><Label>Customer ID</Label><Input value={contractForm.customerId} onChange={e => setContractForm({ ...contractForm, customerId: e.target.value })} placeholder="Customer ID" /></div>
            <div><Label>Title</Label><Input value={contractForm.title} onChange={e => setContractForm({ ...contractForm, title: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={contractForm.description} onChange={e => setContractForm({ ...contractForm, description: e.target.value })} /></div>
            <div><Label>Start Date</Label><Input type="date" value={contractForm.startDate} onChange={e => setContractForm({ ...contractForm, startDate: e.target.value })} /></div>
            <div><Label>End Date</Label><Input type="date" value={contractForm.endDate} onChange={e => setContractForm({ ...contractForm, endDate: e.target.value })} /></div>
            <div><Label>Value</Label><Input type="number" value={contractForm.value} onChange={e => setContractForm({ ...contractForm, value: +e.target.value })} /></div>
            <div><Label>Billing Cycle</Label>
              <Select value={contractForm.billingCycle} onValueChange={v => setContractForm({ ...contractForm, billingCycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="one_time">One Time</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={createContract}>Create Contract</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
