import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Fuel, Plus, Trash2, TrendingUp, Gauge, Truck, ClipboardList } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface Pump { id: string; name: string; tankId: string | null; tank?: FuelTank | null; nozzleCount: number; isActive: boolean }
interface FuelTank { id: string; name: string; fuelType: string; capacity: number; currentStock: number; unitCost: number; isActive: boolean; pumps?: Pump[] }
interface Delivery { id: string; tankId: string; tank?: FuelTank; supplierName: string | null; invoiceNo: string | null; litres: number; unitCost: number; totalCost: number; deliveryDate: string }
interface MeterReading { id: string; pumpId: string; pump?: Pump; openingReading: number; closingReading: number; litresSold: number; amount: number; readingDate: string }
interface ShiftReport { id: string; shiftNo: string; pump?: Pump | null; user: { id: string; fname?: string; lname?: string }; openingReading: number; closingReading: number; litresSold: number; cashSales: number; mobileSales: number; creditSales: number; totalSales: number; lubricantSales: number; carWashIncome: number; expenses: number; netAmount: number; status: string; startDate: string; endDate: string | null }
interface DipstickReading { id: string; tankId: string; tank?: FuelTank; readingDate: string; dipstickLevel: number; bookStock: number; variance: number; attendant: string | null; notes: string | null }
interface Pricing { id: string; fuelType: string; pumpPrice: number; costPrice: number; margin: number; effectiveDate: string; notes: string | null }
interface Compliance { id: string; inspectionDate: string; type: string; result: string; nextDue: string | null; notes: string | null }

export default function FuelStationPage() {
  const { tab: urlTab } = useParams()
  const tab = urlTab || 'tanks'
  const [pumps, setPumps] = useState<Pump[]>([])
  const [tanks, setTanks] = useState<FuelTank[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [readings, setReadings] = useState<MeterReading[]>([])
  const [shifts, setShifts] = useState<ShiftReport[]>([])
  const [dipsticks, setDipsticks] = useState<DipstickReading[]>([])
  const [pricings, setPricings] = useState<Pricing[]>([])
  const [compliances, setCompliances] = useState<Compliance[]>([])
  const [loading, setLoading] = useState(false)
  const [showPumpModal, setShowPumpModal] = useState(false)
  const [showTankModal, setShowTankModal] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [showReadingModal, setShowReadingModal] = useState(false)
  const [showDipstickModal, setShowDipstickModal] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [showComplianceModal, setShowComplianceModal] = useState(false)
  const [pumpForm, setPumpForm] = useState({ name: '', tankId: '', nozzleCount: 1 })
  const [tankForm, setTankForm] = useState({ name: '', fuelType: 'petrol', capacity: 0, currentStock: 0, unitCost: 0 })
  const [deliveryForm, setDeliveryForm] = useState({ tankId: '', supplierName: '', invoiceNo: '', litres: 0, unitCost: 0 })
  const [shiftForm, setShiftForm] = useState({ shiftNo: '', pumpId: '', openingReading: 0, startDate: '' })
  const [readingForm, setReadingForm] = useState({ pumpId: '', openingReading: 0, closingReading: 0, litresSold: 0, amount: 0 })
  const [dipstickForm, setDipstickForm] = useState({ tankId: '', dipstickLevel: 0, bookStock: 0, attendant: '', notes: '' })
  const [pricingForm, setPricingForm] = useState({ fuelType: 'petrol', pumpPrice: 0, costPrice: 0, notes: '' })
  const [complianceForm, setComplianceForm] = useState({ type: 'environmental', result: 'pass', inspectionDate: '', nextDue: '', notes: '' })
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [p, tk, d, r, s, ds, pr, cp] = await Promise.all([
        apiFetch('/api/fuel/pumps').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/tanks').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/deliveries').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/meter-readings').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/shifts').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/dipstick').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/pricing').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/compliance').then(r => r.json()).catch(() => []),
      ])
      setPumps(Array.isArray(p) ? p : [])
      setTanks(Array.isArray(tk) ? tk : [])
      setDeliveries(Array.isArray(d) ? d : [])
      setReadings(Array.isArray(r) ? r : [])
      setShifts(Array.isArray(s) ? s : [])
      setDipsticks(Array.isArray(ds) ? ds : [])
      setPricings(Array.isArray(pr) ? pr : [])
      setCompliances(Array.isArray(cp) ? cp : [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const createPump = async () => {
    if (!pumpForm.name.trim()) { toast({ variant: 'destructive', title: 'Pump name is required' }); return }
    if (!pumpForm.tankId) { toast({ variant: 'destructive', title: 'Select a tank' }); return }
    try { await apiFetch('/api/fuel/pumps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pumpForm) })
    setShowPumpModal(false); setPumpForm({ name: '', tankId: '', nozzleCount: 1 }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create pump' }) }
  }
  const createTank = async () => {
    if (!tankForm.name.trim()) { toast({ variant: 'destructive', title: 'Tank name is required' }); return }
    if (tankForm.capacity <= 0) { toast({ variant: 'destructive', title: 'Capacity must be greater than 0' }); return }
    try { await apiFetch('/api/fuel/tanks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tankForm) })
    setShowTankModal(false); setTankForm({ name: '', fuelType: 'petrol', capacity: 0, currentStock: 0, unitCost: 0 }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create tank' }) }
  }
  const createDelivery = async () => {
    if (!deliveryForm.tankId) { toast({ variant: 'destructive', title: 'Select a tank' }); return }
    if (!deliveryForm.supplierName.trim()) { toast({ variant: 'destructive', title: 'Supplier name is required' }); return }
    if (deliveryForm.litres <= 0) { toast({ variant: 'destructive', title: 'Litres must be greater than 0' }); return }
    try { await apiFetch('/api/fuel/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deliveryForm) })
    setShowDeliveryModal(false); setDeliveryForm({ tankId: '', supplierName: '', invoiceNo: '', litres: 0, unitCost: 0 }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to record delivery' }) }
  }
  const createShift = async () => {
    if (!shiftForm.pumpId) { toast({ variant: 'destructive', title: 'Select a pump' }); return }
    if (!shiftForm.startDate) { toast({ variant: 'destructive', title: 'Start date is required' }); return }
    try { await apiFetch('/api/fuel/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shiftForm) })
    setShowShiftModal(false); setShiftForm({ shiftNo: '', pumpId: '', openingReading: 0, startDate: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create shift' }) }
  }
  const closeShift = async (id: string, data: Record<string, unknown>) => {
    await apiFetch(`/api/fuel/shifts/${id}/close`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    loadData()
  }
  const createReading = async () => {
    if (!readingForm.pumpId) { toast({ variant: 'destructive', title: 'Select a pump' }); return }
    try { await apiFetch('/api/fuel/meter-readings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(readingForm) })
    setShowReadingModal(false); setReadingForm({ pumpId: '', openingReading: 0, closingReading: 0, litresSold: 0, amount: 0 }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to record reading' }) }
  }
  const createDipstick = async () => {
    if (!dipstickForm.tankId) { toast({ variant: 'destructive', title: 'Select a tank' }); return }
    try { await apiFetch('/api/fuel/dipstick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dipstickForm) })
    setShowDipstickModal(false); setDipstickForm({ tankId: '', dipstickLevel: 0, bookStock: 0, attendant: '', notes: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to record dipstick reading' }) }
  }
  const createPricing = async () => {
    if (!pricingForm.fuelType.trim()) { toast({ variant: 'destructive', title: 'Fuel type is required' }); return }
    if (pricingForm.pumpPrice <= 0) { toast({ variant: 'destructive', title: 'Pump price must be greater than 0' }); return }
    try { await apiFetch('/api/fuel/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pricingForm) })
    setShowPricingModal(false); setPricingForm({ fuelType: 'petrol', pumpPrice: 0, costPrice: 0, notes: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to save price' }) }
  }
  const createCompliance = async () => {
    if (!complianceForm.type.trim()) { toast({ variant: 'destructive', title: 'Inspection type is required' }); return }
    if (!complianceForm.result.trim()) { toast({ variant: 'destructive', title: 'Result is required' }); return }
    try { await apiFetch('/api/fuel/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(complianceForm) })
    setShowComplianceModal(false); setComplianceForm({ type: 'environmental', result: 'pass', inspectionDate: '', nextDue: '', notes: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to log compliance' }) }
  }
  const deletePump = async (id: string) => { try { await apiFetch(`/api/fuel/pumps/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }
  const deleteTank = async (id: string) => { try { await apiFetch(`/api/fuel/tanks/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }

  const totalStock = tanks.reduce((s, t) => s + t.currentStock, 0)
  const totalCapacity = tanks.reduce((s, t) => s + t.capacity, 0)
  const openShifts = shifts.filter(s => s.status === 'open').length

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Fuel className="h-7 w-7" /> Fuel Station</h1>
          <p className="text-sm text-muted-foreground">{
            tab === 'tanks' ? 'Manage fuel tanks and pumps' :
            tab === 'deliveries' ? 'Record and track fuel deliveries' :
            tab === 'meter_readings' ? 'Pump meter readings' :
            tab === 'dipstick' ? 'Tank dipstick readings and variance' :
            tab === 'shifts' ? 'Shift reports and closures' :
            tab === 'pricing' ? 'Fuel price management' :
            tab === 'compliance' ? 'Environmental compliance tracking' :
            'Fuel station management'
          }</p>
        </div>
        <div className="flex gap-2">
          {tab === 'tanks' && <>
            <Button onClick={() => setShowTankModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Tank</Button>
            <Button variant="outline" onClick={() => setShowPumpModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Pump</Button>
          </>}
          {tab === 'deliveries' && <Button onClick={() => setShowDeliveryModal(true)}><Plus className="mr-1 h-4 w-4" /> Record Delivery</Button>}
          {tab === 'meter_readings' && <Button onClick={() => setShowReadingModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Reading</Button>}
          {tab === 'dipstick' && <Button onClick={() => setShowDipstickModal(true)}><Plus className="mr-1 h-4 w-4" /> Record Dipstick</Button>}
          {tab === 'pricing' && <Button onClick={() => setShowPricingModal(true)}><Plus className="mr-1 h-4 w-4" /> Set Price</Button>}
          {tab === 'compliance' && <Button onClick={() => setShowComplianceModal(true)}><Plus className="mr-1 h-4 w-4" /> Log Inspection</Button>}
          {tab === 'shifts' && <Button onClick={() => setShowShiftModal(true)}><Plus className="mr-1 h-4 w-4" /> New Shift</Button>}
        </div>
      </div>

      <div className={cn('space-y-4', tab !== 'tanks' && 'hidden')}>
        {/* Tanks & Pumps sub-page */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{tanks.length}</div><p className="text-xs text-muted-foreground">Tanks</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{pumps.length}</div><p className="text-xs text-muted-foreground">Pumps</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalStock.toFixed(0)}L</div><p className="text-xs text-muted-foreground">Current Stock</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{openShifts}</div><p className="text-xs text-muted-foreground">Open Shifts</p></CardContent></Card>
        </div>
          <div className="grid gap-4 md:grid-cols-2">
            {tanks.map(tank => (
              <Card key={tank.id}>
                <CardHeader><CardTitle className="flex items-center justify-between text-base">{tank.name} <Badge variant={tank.isActive ? 'default' : 'secondary'}>{tank.fuelType}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Stock:</span><span className="font-medium">{tank.currentStock.toFixed(0)}L / {tank.capacity.toFixed(0)}L</span></div>
                    <div className="flex justify-between"><span>Unit Cost:</span><span className="font-medium">{tank.unitCost.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span>Pumps:</span><span className="font-medium">{tank.pumps?.length || 0}</span></div>
                    <Button variant="ghost" size="sm" className="mt-2 text-red-500" onClick={() => deleteTank(tank.id)}><Trash2 className="h-3 w-3" /> Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Pump</th><th className="p-2 text-left">Tank</th><th className="p-2 text-left">Nozzles</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {pumps.map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 font-medium">{p.name}</td>
                    <td className="p-2">{p.tank?.name || '—'}</td>
                    <td className="p-2">{p.nozzleCount}</td>
                    <td className="p-2"><Badge variant={p.isActive ? 'default' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="p-2"><Button variant="ghost" size="sm" className="text-red-500" onClick={() => deletePump(p.id)}><Trash2 className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      <div className={cn('space-y-4', tab !== 'deliveries' && 'hidden')}>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Tank</th><th className="p-2 text-left">Supplier</th><th className="p-2 text-right">Litres</th><th className="p-2 text-right">Unit Cost</th><th className="p-2 text-right">Total</th></tr></thead>
              <tbody>
                {deliveries.map(d => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">{new Date(d.deliveryDate).toLocaleDateString()}</td>
                    <td className="p-2">{d.tank?.name}</td>
                    <td className="p-2">{d.supplierName || '—'}</td>
                    <td className="p-2 text-right">{d.litres.toFixed(0)}L</td>
                    <td className="p-2 text-right">{d.unitCost.toFixed(0)}</td>
                    <td className="p-2 text-right font-medium">{d.totalCost.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      <div className={cn('space-y-4', tab !== 'meter_readings' && 'hidden')}>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Pump</th><th className="p-2 text-right">Opening</th><th className="p-2 text-right">Closing</th><th className="p-2 text-right">Litres Sold</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {readings.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{new Date(r.readingDate).toLocaleDateString()}</td>
                    <td className="p-2">{r.pump?.name}</td>
                    <td className="p-2 text-right">{r.openingReading.toFixed(1)}</td>
                    <td className="p-2 text-right">{r.closingReading.toFixed(1)}</td>
                    <td className="p-2 text-right font-medium">{r.litresSold.toFixed(1)}L</td>
                    <td className="p-2 text-right">{r.amount.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      <div className={cn('space-y-4', tab !== 'dipstick' && 'hidden')}>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Tank</th><th className="p-2 text-right">Dipstick Level</th><th className="p-2 text-right">Book Stock</th><th className="p-2 text-right">Variance</th><th className="p-2 text-left">Attendant</th></tr></thead>
              <tbody>
                {dipsticks.length === 0 && <tr className="border-t"><td colSpan={6} className="p-8 text-center text-muted-foreground">No dipstick readings yet. Click "Record Dipstick" to add one.</td></tr>}
                {dipsticks.map(d => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">{new Date(d.readingDate).toLocaleDateString()}</td>
                    <td className="p-2">{d.tank?.name || '—'}</td>
                    <td className="p-2 text-right">{d.dipstickLevel.toFixed(1)}L</td>
                    <td className="p-2 text-right">{d.bookStock.toFixed(1)}L</td>
                    <td className={cn('p-2 text-right font-medium', d.variance < 0 ? 'text-red-500' : 'text-green-600')}>{d.variance.toFixed(1)}L</td>
                    <td className="p-2">{d.attendant || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      <div className={cn('space-y-4', tab !== 'shifts' && 'hidden')}>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Shift No</th><th className="p-2 text-left">Pump</th><th className="p-2 text-right">Litres</th><th className="p-2 text-right">Total Sales</th><th className="p-2 text-right">Net</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2 font-medium">{s.shiftNo}</td>
                    <td className="p-2">{s.pump?.name || 'All'}</td>
                    <td className="p-2 text-right">{s.litresSold.toFixed(1)}L</td>
                    <td className="p-2 text-right">{s.totalSales.toFixed(0)}</td>
                    <td className="p-2 text-right font-medium">{s.netAmount.toFixed(0)}</td>
                    <td className="p-2"><Badge variant={s.status === 'open' ? 'default' : 'secondary'}>{s.status}</Badge></td>
                    <td className="p-2">{s.status === 'open' && <Button size="sm" variant="outline" onClick={() => closeShift(s.id, { closingReading: 0, litresSold: 0, cashSales: 0, mobileSales: 0, creditSales: 0, lubricantSales: 0, carWashIncome: 0, expenses: 0 })}>Close</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      <div className={cn('space-y-4', tab !== 'pricing' && 'hidden')}>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Fuel Type</th><th className="p-2 text-right">Pump Price</th><th className="p-2 text-right">Cost Price</th><th className="p-2 text-right">Margin</th><th className="p-2 text-left">Effective Date</th></tr></thead>
              <tbody>
                {pricings.length === 0 && <tr className="border-t"><td colSpan={5} className="p-8 text-center text-muted-foreground">No prices set. Click "Set Price" to add one.</td></tr>}
                {pricings.map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 font-medium capitalize">{p.fuelType}</td>
                    <td className="p-2 text-right">{p.pumpPrice.toFixed(0)}</td>
                    <td className="p-2 text-right">{p.costPrice.toFixed(0)}</td>
                    <td className={cn('p-2 text-right font-medium', p.margin < 0 ? 'text-red-500' : 'text-green-600')}>{p.margin.toFixed(0)}</td>
                    <td className="p-2">{new Date(p.effectiveDate).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      <div className={cn('space-y-4', tab !== 'compliance' && 'hidden')}>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Inspection Date</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Result</th><th className="p-2 text-left">Next Due</th><th className="p-2 text-left">Notes</th></tr></thead>
              <tbody>
                {compliances.length === 0 && <tr className="border-t"><td colSpan={5} className="p-8 text-center text-muted-foreground">No compliance records. Click "Log Inspection" to add one.</td></tr>}
                {compliances.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">{new Date(c.inspectionDate).toLocaleDateString()}</td>
                    <td className="p-2">{c.type}</td>
                    <td className="p-2"><Badge variant={c.result === 'pass' ? 'default' : c.result === 'fail' ? 'destructive' : 'secondary'}>{c.result}</Badge></td>
                    <td className="p-2">{c.nextDue ? new Date(c.nextDue).toLocaleDateString() : '—'}</td>
                    <td className="p-2">{c.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      {/* Tank Modal */}
      <Dialog open={showTankModal} onOpenChange={setShowTankModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fuel Tank</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={tankForm.name} onChange={e => setTankForm({ ...tankForm, name: e.target.value })} placeholder="Tank 1 - Petrol" /></div>
            <div><Label>Fuel Type</Label>
              <Select value={tankForm.fuelType} onValueChange={v => setTankForm({ ...tankForm, fuelType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="petrol">Petrol</SelectItem><SelectItem value="diesel">Diesel</SelectItem><SelectItem value="kerosene">Kerosene</SelectItem><SelectItem value="gas">Gas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Capacity (Litres)</Label><Input type="number" value={tankForm.capacity} onChange={e => setTankForm({ ...tankForm, capacity: +e.target.value })} /></div>
            <div><Label>Current Stock (Litres)</Label><Input type="number" value={tankForm.currentStock} onChange={e => setTankForm({ ...tankForm, currentStock: +e.target.value })} /></div>
            <div><Label>Unit Cost</Label><Input type="number" value={tankForm.unitCost} onChange={e => setTankForm({ ...tankForm, unitCost: +e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createTank}>Create Tank</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pump Modal */}
      <Dialog open={showPumpModal} onOpenChange={setShowPumpModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fuel Pump</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={pumpForm.name} onChange={e => setPumpForm({ ...pumpForm, name: e.target.value })} placeholder="Pump 1" /></div>
            <div><Label>Tank</Label>
              <Select value={pumpForm.tankId} onValueChange={v => setPumpForm({ ...pumpForm, tankId: v })}>
                <SelectTrigger><SelectValue placeholder="Select tank" /></SelectTrigger><SelectContent>
                  {tanks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Nozzle Count</Label><Input type="number" value={pumpForm.nozzleCount} onChange={e => setPumpForm({ ...pumpForm, nozzleCount: +e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createPump}>Create Pump</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Modal */}
      <Dialog open={showDeliveryModal} onOpenChange={setShowDeliveryModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Fuel Delivery</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tank</Label>
              <Select value={deliveryForm.tankId} onValueChange={v => setDeliveryForm({ ...deliveryForm, tankId: v })}>
                <SelectTrigger><SelectValue placeholder="Select tank" /></SelectTrigger><SelectContent>
                  {tanks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Supplier Name</Label><Input value={deliveryForm.supplierName} onChange={e => setDeliveryForm({ ...deliveryForm, supplierName: e.target.value })} /></div>
            <div><Label>Invoice No</Label><Input value={deliveryForm.invoiceNo} onChange={e => setDeliveryForm({ ...deliveryForm, invoiceNo: e.target.value })} /></div>
            <div><Label>Litres</Label><Input type="number" value={deliveryForm.litres} onChange={e => setDeliveryForm({ ...deliveryForm, litres: +e.target.value })} /></div>
            <div><Label>Unit Cost</Label><Input type="number" value={deliveryForm.unitCost} onChange={e => setDeliveryForm({ ...deliveryForm, unitCost: +e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createDelivery}>Record Delivery</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Modal */}
      <Dialog open={showShiftModal} onOpenChange={setShowShiftModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Shift Report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Shift No</Label><Input value={shiftForm.shiftNo} onChange={e => setShiftForm({ ...shiftForm, shiftNo: e.target.value })} placeholder="SHIFT-001" /></div>
            <div><Label>Pump</Label>
              <Select value={shiftForm.pumpId} onValueChange={v => setShiftForm({ ...shiftForm, pumpId: v })}>
                <SelectTrigger><SelectValue placeholder="All pumps" /></SelectTrigger><SelectContent>
                  {pumps.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Opening Reading</Label><Input type="number" value={shiftForm.openingReading} onChange={e => setShiftForm({ ...shiftForm, openingReading: +e.target.value })} /></div>
            <div><Label>Start Date</Label><Input type="datetime-local" value={shiftForm.startDate} onChange={e => setShiftForm({ ...shiftForm, startDate: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createShift}>Start Shift</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meter Reading Modal */}
      <Dialog open={showReadingModal} onOpenChange={setShowReadingModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Meter Reading</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Pump</Label>
              <Select value={readingForm.pumpId} onValueChange={v => setReadingForm({ ...readingForm, pumpId: v })}>
                <SelectTrigger><SelectValue placeholder="Select pump" /></SelectTrigger><SelectContent>
                  {pumps.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Opening Reading</Label><Input type="number" value={readingForm.openingReading} onChange={e => setReadingForm({ ...readingForm, openingReading: +e.target.value })} /></div>
              <div><Label>Closing Reading</Label><Input type="number" value={readingForm.closingReading} onChange={e => setReadingForm({ ...readingForm, closingReading: +e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Litres Sold</Label><Input type="number" value={readingForm.litresSold} onChange={e => setReadingForm({ ...readingForm, litresSold: +e.target.value })} /></div>
              <div><Label>Amount</Label><Input type="number" value={readingForm.amount} onChange={e => setReadingForm({ ...readingForm, amount: +e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={createReading}>Save Reading</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dipstick Modal */}
      <Dialog open={showDipstickModal} onOpenChange={setShowDipstickModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Dipstick Reading</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tank</Label>
              <Select value={dipstickForm.tankId} onValueChange={v => setDipstickForm({ ...dipstickForm, tankId: v })}>
                <SelectTrigger><SelectValue placeholder="Select tank" /></SelectTrigger><SelectContent>
                  {tanks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dipstick Level (L)</Label><Input type="number" value={dipstickForm.dipstickLevel} onChange={e => setDipstickForm({ ...dipstickForm, dipstickLevel: +e.target.value })} /></div>
              <div><Label>Book Stock (L)</Label><Input type="number" value={dipstickForm.bookStock} onChange={e => setDipstickForm({ ...dipstickForm, bookStock: +e.target.value })} /></div>
            </div>
            <div><Label>Attendant</Label><Input value={dipstickForm.attendant} onChange={e => setDipstickForm({ ...dipstickForm, attendant: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={dipstickForm.notes} onChange={e => setDipstickForm({ ...dipstickForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createDipstick}>Save Reading</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Modal */}
      <Dialog open={showPricingModal} onOpenChange={setShowPricingModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Fuel Price</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Fuel Type</Label>
              <Select value={pricingForm.fuelType} onValueChange={v => setPricingForm({ ...pricingForm, fuelType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="petrol">Petrol</SelectItem><SelectItem value="diesel">Diesel</SelectItem><SelectItem value="kerosene">Kerosene</SelectItem><SelectItem value="gas">Gas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pump Price</Label><Input type="number" value={pricingForm.pumpPrice} onChange={e => setPricingForm({ ...pricingForm, pumpPrice: +e.target.value })} /></div>
              <div><Label>Cost Price</Label><Input type="number" value={pricingForm.costPrice} onChange={e => setPricingForm({ ...pricingForm, costPrice: +e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={pricingForm.notes} onChange={e => setPricingForm({ ...pricingForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createPricing}>Save Price</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compliance Modal */}
      <Dialog open={showComplianceModal} onOpenChange={setShowComplianceModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Compliance Inspection</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label>
                <Select value={complianceForm.type} onValueChange={v => setComplianceForm({ ...complianceForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="environmental">Environmental</SelectItem><SelectItem value="safety">Safety</SelectItem><SelectItem value="calibration">Calibration</SelectItem><SelectItem value="fire">Fire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Result</Label>
                <Select value={complianceForm.result} onValueChange={v => setComplianceForm({ ...complianceForm, result: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Inspection Date</Label><Input type="datetime-local" value={complianceForm.inspectionDate} onChange={e => setComplianceForm({ ...complianceForm, inspectionDate: e.target.value })} /></div>
              <div><Label>Next Due</Label><Input type="date" value={complianceForm.nextDue} onChange={e => setComplianceForm({ ...complianceForm, nextDue: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={complianceForm.notes} onChange={e => setComplianceForm({ ...complianceForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createCompliance}>Log Inspection</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
