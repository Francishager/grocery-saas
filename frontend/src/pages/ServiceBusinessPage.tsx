import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Wrench, Plus, Trash2, CalendarClock, ClipboardList, FileText, Droplet, Star, UserCog, ThumbsUp, Edit } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Appointment { id: string; customerName: string; customerPhone: string | null; customerEmail?: string | null; title: string; description?: string | null; scheduledDate: string; scheduledTime: string; endTime?: string | null; duration: string | null; status: string; price: number; actualPrice: number; notes?: string | null; product?: { id: string; name: string } | null; customer?: { id: string; name: string } | null; technician?: { id: string; fname: string; lname: string } | null }
interface WorkOrder { id: string; orderNo: string; customerName: string; customerPhone: string | null; customerEmail?: string | null; title: string; description?: string | null; status: string; priority: string; serviceCategory?: string | null; estimatedCost: number; actualCost: number; laborCost: number; partsCost: number; startDate: string | null; endDate: string | null; diagnostics?: string | null; warrantyInfo?: string | null; notes?: string | null; product?: { id: string; name: string } | null; technician?: { id: string; fname: string; lname: string } | null }
interface ServiceContract { id: string; contractNo: string; title: string; description?: string | null; serviceCategory?: string | null; customer: { id: string; name: string }; startDate: string; endDate: string | null; renewalDate?: string | null; autoRenew: boolean; nextBillingDate?: string | null; value: number; billingCycle: string; discountPercent: number; status: string; terms?: string | null }
interface CarWashRecord { id: string; createdAt: string; customerName: string; title: string; estimatedCost: number; technicianId?: string | null; notes?: string | null }
interface GarageRecord { id: string; createdAt: string; customerName: string; title: string; estimatedCost: number; status?: string | null; technicianId?: string | null; notes?: string | null }
interface ServiceTechnician { id: string; name: string; email?: string | null; phone?: string | null; role: string; skills: string[]; specializations: string[]; hourlyRate: number; availability: string; rating: number; totalJobs: number; completedJobs: number; isActive: boolean; hireDate?: string | null; notes?: string | null; branch?: { name: string } | null; user?: { id: string; fname: string; lname: string } | null }
interface ServiceJobCard { id: string; cardNo: string; appointmentId?: string | null; workOrderId?: string | null; technicianId?: string | null; customerName: string; customerPhone?: string | null; serviceTitle: string; serviceDescription?: string | null; status: string; priority: string; scheduledStart?: string | null; scheduledEnd?: string | null; actualStart?: string | null; actualEnd?: string | null; laborHours: number; laborCost: number; partsCost: number; totalCost: number; partsUsed?: any; qualityCheckPassed: boolean; qualityNotes?: string | null; completionNotes?: string | null; technician?: ServiceTechnician | null; appointment?: { id: string; title: string } | null; workOrder?: { id: string; orderNo: string; title: string } | null }
interface ServiceFeedback { id: string; customerName: string; customerPhone?: string | null; rating: number; serviceQuality: number; timeliness: number; professionalism: number; valueForMoney: number; comment?: string | null; wouldRecommend: boolean; status: string; response?: string | null; respondedAt?: string | null; createdAt: string; appointment?: { id: string; title: string } | null; workOrder?: { id: string; orderNo: string } | null; contract?: { id: string; contractNo: string } | null; customer?: { id: string; name: string } | null }

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
  open: 'bg-blue-100 text-blue-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
  pending_renewal: 'bg-orange-100 text-orange-700',
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
  const [technicians, setTechnicians] = useState<ServiceTechnician[]>([])
  const [jobCards, setJobCards] = useState<ServiceJobCard[]>([])
  const [feedback, setFeedback] = useState<ServiceFeedback[]>([])
  const [showCarWashModal, setShowCarWashModal] = useState(false)
  const [showGarageModal, setShowGarageModal] = useState(false)
  const [carWashForm, setCarWashForm] = useState({ vehicle: '', serviceType: '', amount: 0, attendantId: '', notes: '' })
  const [garageForm, setGarageForm] = useState({ vehicle: '', service: '', cost: 0, attendantId: '', notes: '' })
  const [editingCarWashId, setEditingCarWashId] = useState<string | null>(null)
  const [editingGarageId, setEditingGarageId] = useState<string | null>(null)
  const [showApptModal, setShowApptModal] = useState(false)
  const [showWOModal, setShowWOModal] = useState(false)
  const [showContractModal, setShowContractModal] = useState(false)
  const [showTechModal, setShowTechModal] = useState(false)
  const [showJobCardModal, setShowJobCardModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [apptForm, setApptForm] = useState({ customerName: '', customerPhone: '', customerEmail: '', productId: '', technicianId: '', title: '', description: '', scheduledDate: '', scheduledTime: '', endTime: '', duration: '', price: 0, notes: '' })
  const [woForm, setWoForm] = useState({ orderNo: '', customerName: '', customerPhone: '', customerEmail: '', productId: '', technicianId: '', title: '', description: '', priority: 'normal', serviceCategory: '', estimatedCost: 0 })
  const [contractForm, setContractForm] = useState({ contractNo: '', customerId: '', title: '', description: '', serviceCategory: '', startDate: '', endDate: '', renewalDate: '', autoRenew: false, value: 0, billingCycle: 'monthly', discountPercent: 0, terms: '' })
  const [techForm, setTechForm] = useState({ name: '', email: '', phone: '', role: 'technician', skills: '', specializations: '', hourlyRate: 0, availability: 'full_time', hireDate: '', notes: '' })
  const [jobCardForm, setJobCardForm] = useState({ appointmentId: '', workOrderId: '', technicianId: '', customerName: '', customerPhone: '', serviceTitle: '', serviceDescription: '', priority: 'normal', scheduledStart: '', scheduledEnd: '', laborCost: 0, partsCost: 0 })
  const [feedbackForm, setFeedbackForm] = useState({ appointmentId: '', workOrderId: '', contractId: '', customerName: '', customerPhone: '', rating: 5, serviceQuality: 5, timeliness: 5, professionalism: 5, valueForMoney: 5, comment: '', wouldRecommend: true })
  const [editingTechId, setEditingTechId] = useState<string | null>(null)
  const [editingJobCardId, setEditingJobCardId] = useState<string | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      const [a, w, c, car, gar, tech, jc, fb] = await Promise.all([
        apiFetch('/api/service/appointments').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/work-orders').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/contracts').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/car-wash').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/garage').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/technicians').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/job-cards').then(r => r.json()).catch(() => []),
        apiFetch('/api/service/feedback').then(r => r.json()).catch(() => []),
      ])
      setAppointments(Array.isArray(a) ? a : [])
      setWorkOrders(Array.isArray(w) ? w : [])
      setContracts(Array.isArray(c) ? c : [])
      setCarWashRecords(Array.isArray(car) ? car : [])
      setGarageRecords(Array.isArray(gar) ? gar : [])
      setTechnicians(Array.isArray(tech) ? tech : [])
      setJobCards(Array.isArray(jc) ? jc : [])
      setFeedback(Array.isArray(fb) ? fb : [])
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const createAppt = async () => {
    if (!apptForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    if (!apptForm.scheduledDate) { toast({ variant: 'destructive', title: 'Date is required' }); return }
    if (!apptForm.scheduledTime) { toast({ variant: 'destructive', title: 'Time is required' }); return }
    try { await apiFetch('/api/service/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(apptForm) })
    setShowApptModal(false); setApptForm({ customerName: '', customerPhone: '', customerEmail: '', productId: '', technicianId: '', title: '', description: '', scheduledDate: '', scheduledTime: '', endTime: '', duration: '', price: 0, notes: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create appointment' }) }
  }
  const createWO = async () => {
    if (!woForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    if (!woForm.title.trim()) { toast({ variant: 'destructive', title: 'Title is required' }); return }
    try { await apiFetch('/api/service/work-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(woForm) })
    setShowWOModal(false); setWoForm({ orderNo: '', customerName: '', customerPhone: '', customerEmail: '', productId: '', technicianId: '', title: '', description: '', priority: 'normal', serviceCategory: '', estimatedCost: 0 }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create work order' }) }
  }
  const createContract = async () => {
    if (!contractForm.title.trim()) { toast({ variant: 'destructive', title: 'Title is required' }); return }
    if (!contractForm.customerId) { toast({ variant: 'destructive', title: 'Select a customer' }); return }
    if (!contractForm.startDate) { toast({ variant: 'destructive', title: 'Start date is required' }); return }
    try { await apiFetch('/api/service/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractForm) })
    setShowContractModal(false); setContractForm({ contractNo: '', customerId: '', title: '', description: '', serviceCategory: '', startDate: '', endDate: '', renewalDate: '', autoRenew: false, value: 0, billingCycle: 'monthly', discountPercent: 0, terms: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create contract' }) }
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

  const saveTechnician = async () => {
    if (!techForm.name.trim()) { toast({ variant: 'destructive', title: 'Technician name is required' }); return }
    try {
      const payload = { ...techForm, skills: techForm.skills.split(',').map(s => s.trim()).filter(Boolean), specializations: techForm.specializations.split(',').map(s => s.trim()).filter(Boolean) }
      if (editingTechId) {
        await apiFetch(`/api/service/technicians/${editingTechId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        setEditingTechId(null)
      } else {
        await apiFetch('/api/service/technicians', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      setShowTechModal(false); setTechForm({ name: '', email: '', phone: '', role: 'technician', skills: '', specializations: '', hourlyRate: 0, availability: 'full_time', hireDate: '', notes: '' }); loadData()
    } catch { toast({ variant: 'destructive', title: 'Failed to save technician' }) }
  }
  const deleteTechnician = async (id: string) => { try { await apiFetch(`/api/service/technicians/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }

  const saveJobCard = async () => {
    if (!jobCardForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    if (!jobCardForm.serviceTitle.trim()) { toast({ variant: 'destructive', title: 'Service title is required' }); return }
    try {
      if (editingJobCardId) {
        await apiFetch(`/api/service/job-cards/${editingJobCardId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jobCardForm) })
        setEditingJobCardId(null)
      } else {
        await apiFetch('/api/service/job-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jobCardForm) })
      }
      setShowJobCardModal(false); setJobCardForm({ appointmentId: '', workOrderId: '', technicianId: '', customerName: '', customerPhone: '', serviceTitle: '', serviceDescription: '', priority: 'normal', scheduledStart: '', scheduledEnd: '', laborCost: 0, partsCost: 0 }); loadData()
    } catch { toast({ variant: 'destructive', title: 'Failed to save job card' }) }
  }
  const updateJobCardStatus = async (id: string, status: string) => { await apiFetch(`/api/service/job-cards/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); loadData() }
  const deleteJobCard = async (id: string) => { try { await apiFetch(`/api/service/job-cards/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }

  const saveFeedback = async () => {
    if (!feedbackForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    try { await apiFetch('/api/service/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(feedbackForm) })
    setShowFeedbackModal(false); setFeedbackForm({ appointmentId: '', workOrderId: '', contractId: '', customerName: '', customerPhone: '', rating: 5, serviceQuality: 5, timeliness: 5, professionalism: 5, valueForMoney: 5, comment: '', wouldRecommend: true }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to save feedback' }) }
  }
  const deleteFeedback = async (id: string) => { try { await apiFetch(`/api/service/feedback/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }

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
    technicians: 'Technicians',
    'job-cards': 'Job Cards',
    feedback: 'Feedback & Ratings',
    'car-wash': 'Car Wash',
    garage: 'Garage Services',
  }
  const sectionDescription: Record<string, string> = {
    appointments: 'Manage scheduled service appointments and confirmations.',
    'work-orders': 'Track work orders, priorities, and status updates.',
    contracts: 'Manage service contracts, billing cycles, and renewals.',
    technicians: 'Manage technician profiles, skills, and assignments.',
    'job-cards': 'Track detailed job cards with time, parts, and quality control.',
    feedback: 'Customer ratings, reviews, and feedback management.',
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
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{feedback.length > 0 ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1) : '0.0'}<Star className="inline h-4 w-4 ml-1 text-yellow-400" /></div><p className="text-xs text-muted-foreground">Avg Rating ({feedback.length})</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {[
          { key: 'appointments', label: 'Appointments', icon: CalendarClock },
          { key: 'work-orders', label: 'Work Orders', icon: ClipboardList },
          { key: 'contracts', label: 'Contracts', icon: FileText },
          { key: 'technicians', label: 'Technicians', icon: UserCog },
          { key: 'job-cards', label: 'Job Cards', icon: ClipboardList },
          { key: 'feedback', label: 'Feedback', icon: Star },
          { key: 'car-wash', label: 'Car Wash', icon: Droplet },
          { key: 'garage', label: 'Garage', icon: Wrench },
        ].map(t => (
          <button key={t.key} onClick={() => navigate(`/tenant/service/${t.key}`)}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'appointments' && (
        <div className="space-y-4">
          <Button onClick={() => setShowApptModal(true)}><Plus className="mr-1 h-4 w-4" /> New Appointment</Button>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Time</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Title</th><th className="p-2 text-left">Technician</th><th className="p-2 text-right">Price</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {appointments.length === 0 && <tr className="border-t"><td colSpan={8} className="p-8 text-center text-muted-foreground">No appointments yet</td></tr>}
                {appointments.map(a => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2">{new Date(a.scheduledDate).toLocaleDateString()}</td>
                    <td className="p-2">{a.scheduledTime}{a.endTime ? `-${a.endTime}` : ''}</td>
                    <td className="p-2">{a.customerName}<div className="text-xs text-muted-foreground">{a.customerPhone}</div></td>
                    <td className="p-2">{a.title}</td>
                    <td className="p-2">{a.technician ? `${a.technician.fname} ${a.technician.lname}` : '-'}</td>
                    <td className="p-2 text-right">{a.status === 'completed' ? (a.actualPrice || a.price).toFixed(0) : a.price.toFixed(0)}</td>
                    <td className="p-2"><Badge className={statusColors[a.status]}>{a.status}</Badge></td>
                    <td className="p-2 space-x-1">
                      {a.status === 'scheduled' && <Button size="sm" variant="outline" onClick={() => updateApptStatus(a.id, 'confirmed')}>Confirm</Button>}
                      {a.status === 'confirmed' && <Button size="sm" variant="outline" onClick={() => updateApptStatus(a.id, 'in_progress')}>Start</Button>}
                      {a.status === 'in_progress' && <Button size="sm" variant="outline" onClick={() => updateApptStatus(a.id, 'completed')}>Complete</Button>}
                      {a.status !== 'completed' && a.status !== 'cancelled' && <Button size="sm" variant="ghost" className="text-orange-500" onClick={() => updateApptStatus(a.id, 'cancelled')}>Cancel</Button>}
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
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Order No</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Title</th><th className="p-2 text-left">Category</th><th className="p-2 text-left">Tech</th><th className="p-2 text-left">Priority</th><th className="p-2 text-right">Est. Cost</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {workOrders.length === 0 && <tr className="border-t"><td colSpan={9} className="p-8 text-center text-muted-foreground">No work orders yet</td></tr>}
                {workOrders.map(w => (
                  <tr key={w.id} className="border-t">
                    <td className="p-2 font-medium">{w.orderNo}</td>
                    <td className="p-2">{w.customerName}</td>
                    <td className="p-2">{w.title}</td>
                    <td className="p-2">{w.serviceCategory || '-'}</td>
                    <td className="p-2">{w.technician ? `${w.technician.fname} ${w.technician.lname}` : '-'}</td>
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
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Contract No</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Title</th><th className="p-2 text-left">Category</th><th className="p-2 text-right">Value</th><th className="p-2 text-left">Billing</th><th className="p-2 text-left">Auto-Renew</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {contracts.length === 0 && <tr className="border-t"><td colSpan={9} className="p-8 text-center text-muted-foreground">No contracts yet</td></tr>}
                {contracts.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 font-medium">{c.contractNo}</td>
                    <td className="p-2">{c.customer.name}</td>
                    <td className="p-2">{c.title}</td>
                    <td className="p-2">{c.serviceCategory || '-'}</td>
                    <td className="p-2 text-right">{c.value.toFixed(0)}{c.discountPercent > 0 ? <span className="text-xs text-green-600"> (-{c.discountPercent}%)</span> : ''}</td>
                    <td className="p-2">{c.billingCycle}</td>
                    <td className="p-2">{c.autoRenew ? <Badge className="bg-green-100 text-green-700">Yes</Badge> : '-'}</td>
                    <td className="p-2"><Badge className={statusColors[c.status]}>{c.status}</Badge></td>
                    <td className="p-2"><Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteContract(c.id)}><Trash2 className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'technicians' && (
        <div className="space-y-4">
          <Button onClick={() => { setEditingTechId(null); setTechForm({ name: '', email: '', phone: '', role: 'technician', skills: '', specializations: '', hourlyRate: 0, availability: 'full_time', hireDate: '', notes: '' }); setShowTechModal(true) }}><Plus className="mr-1 h-4 w-4" /> Add Technician</Button>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {technicians.length === 0 && <div className="col-span-full text-center text-muted-foreground py-8">No technicians yet. Add your first technician to get started.</div>}
            {technicians.map(tech => (
              <Card key={tech.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">{tech.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <p className="font-medium">{tech.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{tech.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {tech.rating > 0 && <span className="flex items-center gap-0.5 text-sm font-medium"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{tech.rating.toFixed(1)}</span>}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    {tech.phone && <p className="text-muted-foreground">{tech.phone}</p>}
                    {tech.email && <p className="text-muted-foreground">{tech.email}</p>}
                    {tech.skills.length > 0 && <div className="flex flex-wrap gap-1">{tech.skills.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}</div>}
                    {tech.specializations.length > 0 && <div className="flex flex-wrap gap-1">{tech.specializations.map(s => <Badge key={s} className="bg-purple-100 text-purple-700 text-xs">{s}</Badge>)}</div>}
                    <div className="flex items-center justify-between pt-2">
                      <Badge className={tech.availability === 'full_time' ? 'bg-green-100 text-green-700' : tech.availability === 'part_time' ? 'bg-blue-100 text-blue-700' : tech.availability === 'on_call' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}>{tech.availability.replace('_', ' ')}</Badge>
                      <span className="text-xs text-muted-foreground">{tech.completedJobs}/{tech.totalJobs} jobs</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Rate: {tech.hourlyRate.toFixed(0)}/hr</div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingTechId(tech.id); setTechForm({ name: tech.name, email: tech.email || '', phone: tech.phone || '', role: tech.role, skills: tech.skills.join(', '), specializations: tech.specializations.join(', '), hourlyRate: tech.hourlyRate, availability: tech.availability, hireDate: tech.hireDate ? new Date(tech.hireDate).toISOString().split('T')[0] : '', notes: tech.notes || '' }); setShowTechModal(true) }}><Edit className="h-3 w-3 mr-1" /> Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteTechnician(tech.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'job-cards' && (
        <div className="space-y-4">
          <Button onClick={() => { setEditingJobCardId(null); setJobCardForm({ appointmentId: '', workOrderId: '', technicianId: '', customerName: '', customerPhone: '', serviceTitle: '', serviceDescription: '', priority: 'normal', scheduledStart: '', scheduledEnd: '', laborCost: 0, partsCost: 0 }); setShowJobCardModal(true) }}><Plus className="mr-1 h-4 w-4" /> New Job Card</Button>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Card No</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Service</th><th className="p-2 text-left">Technician</th><th className="p-2 text-right">Total Cost</th><th className="p-2 text-left">Priority</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {jobCards.length === 0 && <tr className="border-t"><td colSpan={8} className="p-8 text-center text-muted-foreground">No job cards yet</td></tr>}
                {jobCards.map(jc => (
                  <tr key={jc.id} className="border-t">
                    <td className="p-2 font-medium">{jc.cardNo}</td>
                    <td className="p-2">{jc.customerName}</td>
                    <td className="p-2">{jc.serviceTitle}</td>
                    <td className="p-2">{jc.technician?.name || '-'}</td>
                    <td className="p-2 text-right">{jc.totalCost.toFixed(0)}</td>
                    <td className="p-2"><Badge variant={jc.priority === 'urgent' ? 'destructive' : 'secondary'}>{jc.priority}</Badge></td>
                    <td className="p-2"><Badge className={statusColors[jc.status]}>{jc.status}</Badge></td>
                    <td className="p-2 space-x-1">
                      {jc.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateJobCardStatus(jc.id, 'in_progress')}>Start</Button>}
                      {jc.status === 'in_progress' && <Button size="sm" variant="outline" onClick={() => updateJobCardStatus(jc.id, 'completed')}>Complete</Button>}
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteJobCard(jc.id)}><Trash2 className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'feedback' && (
        <div className="space-y-4">
          <Button onClick={() => setShowFeedbackModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Feedback</Button>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {feedback.length === 0 && <div className="col-span-full text-center text-muted-foreground py-8">No feedback yet. Customer reviews will appear here.</div>}
            {feedback.map(fb => (
              <Card key={fb.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{fb.customerName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(fb.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn('h-4 w-4', n <= fb.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300')} />)}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>Quality: <span className="font-medium">{fb.serviceQuality}/5</span></div>
                    <div>Timeliness: <span className="font-medium">{fb.timeliness}/5</span></div>
                    <div>Professional: <span className="font-medium">{fb.professionalism}/5</span></div>
                    <div>Value: <span className="font-medium">{fb.valueForMoney}/5</span></div>
                  </div>
                  {fb.comment && <p className="mt-3 text-sm text-muted-foreground italic">"{fb.comment}"</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {fb.wouldRecommend ? <Badge className="bg-green-100 text-green-700"><ThumbsUp className="h-3 w-3 mr-1" /> Recommends</Badge> : <Badge variant="secondary">Does not recommend</Badge>}
                      {fb.appointment && <span className="text-xs text-muted-foreground">Appt: {fb.appointment.title}</span>}
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteFeedback(fb.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  {fb.response && <div className="mt-3 rounded-md bg-muted p-2 text-xs"><span className="font-medium">Response:</span> {fb.response}</div>}
                </CardContent>
              </Card>
            ))}
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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={apptForm.customerPhone} onChange={e => setApptForm({ ...apptForm, customerPhone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={apptForm.customerEmail} onChange={e => setApptForm({ ...apptForm, customerEmail: e.target.value })} /></div>
            </div>
            <div><Label>Title</Label><Input value={apptForm.title} onChange={e => setApptForm({ ...apptForm, title: e.target.value })} placeholder="e.g. Bridal Makeup, Consultation" /></div>
            <div><Label>Description</Label><Input value={apptForm.description} onChange={e => setApptForm({ ...apptForm, description: e.target.value })} /></div>
            <div><Label>Technician</Label>
              <Select value={apptForm.technicianId} onValueChange={v => setApptForm({ ...apptForm, technicianId: v })}>
                <SelectTrigger><SelectValue placeholder="Assign technician" /></SelectTrigger><SelectContent>
                  {technicians.map(tech => <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={apptForm.scheduledDate} onChange={e => setApptForm({ ...apptForm, scheduledDate: e.target.value })} /></div>
              <div><Label>Time</Label><Input type="time" value={apptForm.scheduledTime} onChange={e => setApptForm({ ...apptForm, scheduledTime: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>End Time</Label><Input type="time" value={apptForm.endTime} onChange={e => setApptForm({ ...apptForm, endTime: e.target.value })} /></div>
              <div><Label>Duration</Label><Input value={apptForm.duration} onChange={e => setApptForm({ ...apptForm, duration: e.target.value })} placeholder="1 hour" /></div>
            </div>
            <div><Label>Price</Label><Input type="number" value={apptForm.price} onChange={e => setApptForm({ ...apptForm, price: +e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={apptForm.notes} onChange={e => setApptForm({ ...apptForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createAppt}>Create Appointment</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWOModal} onOpenChange={setShowWOModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Order No</Label><Input value={woForm.orderNo} onChange={e => setWoForm({ ...woForm, orderNo: e.target.value })} placeholder="Auto-generated if empty" /></div>
            <div><Label>Customer Name</Label><Input value={woForm.customerName} onChange={e => setWoForm({ ...woForm, customerName: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={woForm.customerPhone} onChange={e => setWoForm({ ...woForm, customerPhone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={woForm.customerEmail} onChange={e => setWoForm({ ...woForm, customerEmail: e.target.value })} /></div>
            </div>
            <div><Label>Title</Label><Input value={woForm.title} onChange={e => setWoForm({ ...woForm, title: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={woForm.description} onChange={e => setWoForm({ ...woForm, description: e.target.value })} /></div>
            <div><Label>Service Category</Label><Input value={woForm.serviceCategory} onChange={e => setWoForm({ ...woForm, serviceCategory: e.target.value })} placeholder="repair, installation, maintenance" /></div>
            <div><Label>Technician</Label>
              <Select value={woForm.technicianId} onValueChange={v => setWoForm({ ...woForm, technicianId: v })}>
                <SelectTrigger><SelectValue placeholder="Assign technician" /></SelectTrigger><SelectContent>
                  {technicians.map(tech => <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Service Contract</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Contract No</Label><Input value={contractForm.contractNo} onChange={e => setContractForm({ ...contractForm, contractNo: e.target.value })} placeholder="Auto-generated if empty" /></div>
            <div><Label>Customer ID</Label><Input value={contractForm.customerId} onChange={e => setContractForm({ ...contractForm, customerId: e.target.value })} placeholder="Customer ID" /></div>
            <div><Label>Title</Label><Input value={contractForm.title} onChange={e => setContractForm({ ...contractForm, title: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={contractForm.description} onChange={e => setContractForm({ ...contractForm, description: e.target.value })} /></div>
            <div><Label>Service Category</Label><Input value={contractForm.serviceCategory} onChange={e => setContractForm({ ...contractForm, serviceCategory: e.target.value })} placeholder="maintenance, consulting, cleaning" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={contractForm.startDate} onChange={e => setContractForm({ ...contractForm, startDate: e.target.value })} /></div>
              <div><Label>End Date</Label><Input type="date" value={contractForm.endDate} onChange={e => setContractForm({ ...contractForm, endDate: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Renewal Date</Label><Input type="date" value={contractForm.renewalDate} onChange={e => setContractForm({ ...contractForm, renewalDate: e.target.value })} /></div>
              <div><Label>Discount %</Label><Input type="number" value={contractForm.discountPercent} onChange={e => setContractForm({ ...contractForm, discountPercent: +e.target.value })} /></div>
            </div>
            <div><Label>Value</Label><Input type="number" value={contractForm.value} onChange={e => setContractForm({ ...contractForm, value: +e.target.value })} /></div>
            <div><Label>Billing Cycle</Label>
              <Select value={contractForm.billingCycle} onValueChange={v => setContractForm({ ...contractForm, billingCycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="one_time">One Time</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoRenew" checked={contractForm.autoRenew} onChange={e => setContractForm({ ...contractForm, autoRenew: e.target.checked })} />
              <Label htmlFor="autoRenew">Auto-renew</Label>
            </div>
            <div><Label>Terms</Label><Input value={contractForm.terms} onChange={e => setContractForm({ ...contractForm, terms: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createContract}>Create Contract</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTechModal} onOpenChange={setShowTechModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingTechId ? 'Edit Technician' : 'Add Technician'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={techForm.name} onChange={e => setTechForm({ ...techForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={techForm.phone} onChange={e => setTechForm({ ...techForm, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={techForm.email} onChange={e => setTechForm({ ...techForm, email: e.target.value })} /></div>
            </div>
            <div><Label>Role</Label>
              <Select value={techForm.role} onValueChange={v => setTechForm({ ...techForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="technician">Technician</SelectItem><SelectItem value="specialist">Specialist</SelectItem><SelectItem value="senior_technician">Senior Technician</SelectItem><SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Skills (comma-separated)</Label><Input value={techForm.skills} onChange={e => setTechForm({ ...techForm, skills: e.target.value })} placeholder="electrical, plumbing, HVAC" /></div>
            <div><Label>Specializations (comma-separated)</Label><Input value={techForm.specializations} onChange={e => setTechForm({ ...techForm, specializations: e.target.value })} placeholder="bridal makeup, color treatment" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Hourly Rate</Label><Input type="number" value={techForm.hourlyRate} onChange={e => setTechForm({ ...techForm, hourlyRate: +e.target.value })} /></div>
              <div><Label>Availability</Label>
                <Select value={techForm.availability} onValueChange={v => setTechForm({ ...techForm, availability: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem><SelectItem value="part_time">Part Time</SelectItem><SelectItem value="on_call">On Call</SelectItem><SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Hire Date</Label><Input type="date" value={techForm.hireDate} onChange={e => setTechForm({ ...techForm, hireDate: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={techForm.notes} onChange={e => setTechForm({ ...techForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={saveTechnician}>{editingTechId ? 'Update' : 'Add'} Technician</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showJobCardModal} onOpenChange={setShowJobCardModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingJobCardId ? 'Edit Job Card' : 'New Job Card'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer Name</Label><Input value={jobCardForm.customerName} onChange={e => setJobCardForm({ ...jobCardForm, customerName: e.target.value })} /></div>
            <div><Label>Customer Phone</Label><Input value={jobCardForm.customerPhone} onChange={e => setJobCardForm({ ...jobCardForm, customerPhone: e.target.value })} /></div>
            <div><Label>Service Title</Label><Input value={jobCardForm.serviceTitle} onChange={e => setJobCardForm({ ...jobCardForm, serviceTitle: e.target.value })} /></div>
            <div><Label>Service Description</Label><Input value={jobCardForm.serviceDescription} onChange={e => setJobCardForm({ ...jobCardForm, serviceDescription: e.target.value })} /></div>
            <div><Label>Technician</Label>
              <Select value={jobCardForm.technicianId} onValueChange={v => setJobCardForm({ ...jobCardForm, technicianId: v })}>
                <SelectTrigger><SelectValue placeholder="Assign technician" /></SelectTrigger><SelectContent>
                  {technicians.map(tech => <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Priority</Label>
              <Select value={jobCardForm.priority} onValueChange={v => setJobCardForm({ ...jobCardForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Scheduled Start</Label><Input type="datetime-local" value={jobCardForm.scheduledStart} onChange={e => setJobCardForm({ ...jobCardForm, scheduledStart: e.target.value })} /></div>
              <div><Label>Scheduled End</Label><Input type="datetime-local" value={jobCardForm.scheduledEnd} onChange={e => setJobCardForm({ ...jobCardForm, scheduledEnd: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Labor Cost</Label><Input type="number" value={jobCardForm.laborCost} onChange={e => setJobCardForm({ ...jobCardForm, laborCost: +e.target.value })} /></div>
              <div><Label>Parts Cost</Label><Input type="number" value={jobCardForm.partsCost} onChange={e => setJobCardForm({ ...jobCardForm, partsCost: +e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveJobCard}>{editingJobCardId ? 'Update' : 'Create'} Job Card</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Customer Feedback</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer Name</Label><Input value={feedbackForm.customerName} onChange={e => setFeedbackForm({ ...feedbackForm, customerName: e.target.value })} /></div>
            <div><Label>Customer Phone</Label><Input value={feedbackForm.customerPhone} onChange={e => setFeedbackForm({ ...feedbackForm, customerPhone: e.target.value })} /></div>
            <div><Label>Overall Rating</Label>
              <Select value={String(feedbackForm.rating)} onValueChange={v => setFeedbackForm({ ...feedbackForm, rating: +v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="1">1 - Poor</SelectItem><SelectItem value="2">2 - Fair</SelectItem><SelectItem value="3">3 - Good</SelectItem><SelectItem value="4">4 - Very Good</SelectItem><SelectItem value="5">5 - Excellent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Service Quality (1-5)</Label><Input type="number" min={1} max={5} value={feedbackForm.serviceQuality} onChange={e => setFeedbackForm({ ...feedbackForm, serviceQuality: +e.target.value })} /></div>
              <div><Label>Timeliness (1-5)</Label><Input type="number" min={1} max={5} value={feedbackForm.timeliness} onChange={e => setFeedbackForm({ ...feedbackForm, timeliness: +e.target.value })} /></div>
              <div><Label>Professionalism (1-5)</Label><Input type="number" min={1} max={5} value={feedbackForm.professionalism} onChange={e => setFeedbackForm({ ...feedbackForm, professionalism: +e.target.value })} /></div>
              <div><Label>Value for Money (1-5)</Label><Input type="number" min={1} max={5} value={feedbackForm.valueForMoney} onChange={e => setFeedbackForm({ ...feedbackForm, valueForMoney: +e.target.value })} /></div>
            </div>
            <div><Label>Comment</Label><Input value={feedbackForm.comment} onChange={e => setFeedbackForm({ ...feedbackForm, comment: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="wouldRecommend" checked={feedbackForm.wouldRecommend} onChange={e => setFeedbackForm({ ...feedbackForm, wouldRecommend: e.target.checked })} />
              <Label htmlFor="wouldRecommend">Would recommend</Label>
            </div>
          </div>
          <DialogFooter><Button onClick={saveFeedback}>Add Feedback</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
