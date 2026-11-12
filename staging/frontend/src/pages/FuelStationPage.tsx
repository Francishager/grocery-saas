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
import { Fuel, Plus, Trash2, TrendingUp, Gauge, Truck, ClipboardList, History } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'

interface Pump { id: string; name: string; tankId: string | null; tank?: FuelTank | null; nozzleCount: number; isActive: boolean }
interface FuelTank { id: string; name: string; fuelType: string; capacity: number; currentStock: number; unitCost: number; isActive: boolean; pumps?: Pump[] }
interface Delivery { id: string; tankId: string; tank?: FuelTank; supplierName: string | null; supplier?: { id: string; name: string } | null; supplierPurchase?: { id: string; refNo: string; total: number; balance: number; paymentStatus: string } | null; invoiceNo: string | null; litres: number; unitCost: number; totalCost: number; deliveryDate: string }
interface MeterReading { id: string; pumpId: string; pump?: Pump; shiftId?: string | null; openingReading: number; closingReading: number; litresSold: number; amount: number; readingDate: string }
interface ShiftReport { id: string; shiftNo: string; branchId?: string | null; pump?: Pump | null; pumpId?: string; salesMode: string; user: { id: string; fname?: string; lname?: string }; fuelSales?: { sale: { receiptNo: string; total: number; status: string; customer?: { name: string } | null } }[]; openingReading: number; closingReading: number; litresSold: number; cashSales: number; mobileSales: number; creditSales: number; totalSales: number; expectedFuelSales: number; actualTenderTotal: number; reportedSalesTotal: number; reconciliationVariance: number; varianceReason: string | null; lubricantSales: number; carWashIncome: number; expenses: number; netAmount: number; status: string; startDate: string; endDate: string | null }
interface DipstickReading { id: string; tankId: string; tank?: FuelTank; readingDate: string; dipstickLevel: number; bookStock: number; variance: number; attendant: string | null; notes: string | null }
interface Pricing { id: string; fuelType: string; pumpPrice: number; costPrice: number; margin: number; effectiveDate: string; notes: string | null }
interface Compliance { id: string; inspectionDate: string; type: string; result: string; nextDue: string | null; notes: string | null }
interface StockMovement { id: string; movementType: string; litresDelta: number; balanceAfter: number; unitCost: number; stockValueDelta: number; stockValueAfter: number; sourceType: string; reason: string | null; actorId: string | null; createdAt: string }
interface StockAdjustment { id: string; tankId: string; tank?: { name: string; fuelType: string }; litresDelta: number; reason: string; status: string; requestedById: string; reviewNote: string | null; requestedAt: string }
interface FuelPaymentAccount { id: string; name: string; type: string; balance: number; currency: string }
interface FuelSupplier { id: string; name: string }
interface FuelCustomer { id: string; name: string; phone?: string | null; balance: number; creditLimit: number }
const newRequestKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

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
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([])
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<FuelPaymentAccount[]>([])
  const [suppliers, setSuppliers] = useState<FuelSupplier[]>([])
  const [customers, setCustomers] = useState<FuelCustomer[]>([])
  const [movementTank, setMovementTank] = useState<FuelTank | null>(null)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [adjustmentTank, setAdjustmentTank] = useState<FuelTank | null>(null)
  const [adjustmentForm, setAdjustmentForm] = useState({ litresDelta: 0, reason: '' })
  const [reviewContext, setReviewContext] = useState<{ kind: 'shift' | 'adjustment'; id: string; action: 'approve' | 'reject' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPumpModal, setShowPumpModal] = useState(false)
  const [showTankModal, setShowTankModal] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [showMeterModal, setShowMeterModal] = useState(false)
  const [showDipstickModal, setShowDipstickModal] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [showComplianceModal, setShowComplianceModal] = useState(false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [showFuelCreditModal, setShowFuelCreditModal] = useState(false)
  const [savingFuelSale, setSavingFuelSale] = useState(false)
  const [closingShift, setClosingShift] = useState<ShiftReport | null>(null)
  const [fuelCreditForm, setFuelCreditForm] = useState({ shiftId: '', customerId: '', litres: 0, unitPrice: 0 })
  const [fuelCreditRequestKey, setFuelCreditRequestKey] = useState(newRequestKey)
  const [pumpForm, setPumpForm] = useState({ name: '', tankId: '', nozzleCount: 1 })
  const [tankForm, setTankForm] = useState({ name: '', fuelType: 'petrol', capacity: 0, currentStock: 0, unitCost: 0 })
  const [deliveryForm, setDeliveryForm] = useState({ tankId: '', supplierId: '', invoiceNo: '', litres: 0, unitCost: 0 })
  const [shiftForm, setShiftForm] = useState({ shiftNo: '', pumpId: '', openingReading: 0, startDate: '' })
  const [meterForm, setMeterForm] = useState({ pumpId: '', shiftId: '', openingReading: 0, closingReading: 0, litresSold: 0, amount: 0, readingDate: '', priceOverrideReason: '' })
  const [closeShiftForm, setCloseShiftForm] = useState({ cashSales: 0, mobileSales: 0, creditSales: 0, lubricantSales: 0, carWashIncome: 0, expenses: 0, cashAccountId: '', mobileAccountId: '', expenseAccountId: '', notes: '', varianceReason: '' })
  const [dipstickForm, setDipstickForm] = useState({ tankId: '', readingDate: '', dipstickLevel: 0, bookStock: 0, attendant: '', notes: '' })
  const [pricingForm, setPricingForm] = useState({ fuelType: 'petrol', pumpPrice: 0, costPrice: 0, effectiveDate: '', notes: '' })
  const [complianceForm, setComplianceForm] = useState({ type: 'environmental', result: 'pass', inspectionDate: '', nextDue: '', notes: '' })
  const { toast } = useToast()
  const { hasPermission, user } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const requestJson = async (url: string, init?: RequestInit) => {
    const response = await apiFetch(url, init)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'Fuel operation failed')
    return payload
  }
  const isOwner = user?.role === 'owner' || user?.role === 'saas_admin'
  const currentFeature = tab === 'tanks' ? 'fuel_station.pumps' : tab === 'deliveries' ? 'fuel_station.deliveries' : tab === 'meter_readings' ? 'fuel_station.meter_readings' : tab === 'dipstick' ? 'fuel_station.dipstick' : tab === 'shifts' ? 'fuel_station.shift_reports' : tab === 'pricing' ? 'fuel_station.pricing' : tab === 'compliance' ? 'fuel_station.compliance' : 'fuel_station'
  const canViewCurrentTab = hasFeature(currentFeature) && (isOwner || hasPermission('canViewFuelStation'))
  const canCreateCurrentTab = hasFeature(currentFeature) && (isOwner || hasPermission('canCreateFuelStation'))
  const canEditFuel = hasFeature('fuel_station.pumps') && (isOwner || hasPermission('canEditFuelStation'))
  const canDeleteFuel = hasFeature('fuel_station.pumps') && (isOwner || hasPermission('canDeleteFuelStation'))
  const selectedPump = pumps.find(pump => pump.id === meterForm.pumpId)
  const selectedTank = tanks.find(tank => tank.id === selectedPump?.tankId)
  const effectivePrice = pricings.filter(price => price.fuelType.toLowerCase() === selectedTank?.fuelType.toLowerCase() && new Date(price.effectiveDate).getTime() <= (meterForm.readingDate ? new Date(meterForm.readingDate).getTime() : Date.now())).sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0]?.pumpPrice

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [p, tk, d, r, s, ds, pr, cp, adjustments, accounts, supplierRows, customerRows] = await Promise.all([
        apiFetch('/api/fuel/pumps').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/tanks').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/deliveries').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/meter-readings').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/shifts').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/dipstick').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/pricing').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/compliance').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/stock-adjustments').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/payment-accounts').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/suppliers').then(r => r.json()).catch(() => []),
        apiFetch('/api/fuel/customers').then(r => r.json()).catch(() => []),
      ])
      setPumps(Array.isArray(p) ? p : [])
      setTanks(Array.isArray(tk) ? tk : [])
      setDeliveries(Array.isArray(d) ? d : [])
      setReadings(Array.isArray(r) ? r : [])
      setShifts(Array.isArray(s) ? s : [])
      setDipsticks(Array.isArray(ds) ? ds : [])
      setPricings(Array.isArray(pr) ? pr : [])
      setCompliances(Array.isArray(cp) ? cp : [])
      setStockAdjustments(Array.isArray(adjustments) ? adjustments : [])
      setPaymentAccounts(Array.isArray(accounts) ? accounts : [])
      setSuppliers(Array.isArray(supplierRows) ? supplierRows : [])
      setCustomers(Array.isArray(customerRows) ? customerRows : [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const createPump = async () => {
    if (!pumpForm.name.trim()) { toast({ variant: 'destructive', title: 'Pump name is required' }); return }
    if (!pumpForm.tankId) { toast({ variant: 'destructive', title: 'Select a tank' }); return }
    try { await requestJson('/api/fuel/pumps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pumpForm) })
    setShowPumpModal(false); setPumpForm({ name: '', tankId: '', nozzleCount: 1 }); loadData() } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to create pump' }) }
  }
  const createTank = async () => {
    if (!tankForm.name.trim()) { toast({ variant: 'destructive', title: 'Tank name is required' }); return }
    if (tankForm.capacity <= 0) { toast({ variant: 'destructive', title: 'Capacity must be greater than 0' }); return }
    try { await requestJson('/api/fuel/tanks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tankForm) })
    setShowTankModal(false); setTankForm({ name: '', fuelType: 'petrol', capacity: 0, currentStock: 0, unitCost: 0 }); loadData() } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to create tank' }) }
  }
  const createDelivery = async () => {
    if (!deliveryForm.tankId) { toast({ variant: 'destructive', title: 'Select a tank' }); return }
    if (!deliveryForm.supplierId) { toast({ variant: 'destructive', title: 'Select a supplier' }); return }
    if (!deliveryForm.invoiceNo.trim()) { toast({ variant: 'destructive', title: 'Supplier invoice number is required' }); return }
    if (deliveryForm.litres <= 0) { toast({ variant: 'destructive', title: 'Litres must be greater than 0' }); return }
    try { await requestJson('/api/fuel/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deliveryForm) })
    setShowDeliveryModal(false); setDeliveryForm({ tankId: '', supplierId: '', invoiceNo: '', litres: 0, unitCost: 0 }); loadData() } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to record delivery' }) }
  }
  const createShift = async () => {
    if (!shiftForm.pumpId) { toast({ variant: 'destructive', title: 'Select a pump' }); return }
    if (!shiftForm.startDate) { toast({ variant: 'destructive', title: 'Start date is required' }); return }
    try { await requestJson('/api/fuel/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shiftForm) })
    setShowShiftModal(false); setShiftForm({ shiftNo: '', pumpId: '', openingReading: 0, startDate: '' }); loadData() } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to create shift' }) }
  }
  const createFuelCreditSale = async () => {
    if (!fuelCreditForm.shiftId || !fuelCreditForm.customerId || fuelCreditForm.litres <= 0 || fuelCreditForm.unitPrice <= 0) {
      toast({ variant: 'destructive', title: 'Select a shift and customer, then enter litres and unit price' }); return
    }
    setSavingFuelSale(true)
    try {
      const shift = shifts.find(row => row.id === fuelCreditForm.shiftId)
      const sale = await requestJson('/api/fuel/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fuelCreditForm, branchId: shift?.branchId, idempotencyKey: fuelCreditRequestKey }) })
      toast({ title: `Fuel invoice ${sale.receiptNo} recorded to customer receivables`, description: Number(sale.creditApplied || 0) > 0 ? `${Number(sale.creditApplied).toLocaleString()} customer credit applied; no cash was withdrawn or received.` : undefined })
      setShowFuelCreditModal(false); setFuelCreditForm({ shiftId: '', customerId: '', litres: 0, unitPrice: 0 }); setFuelCreditRequestKey(newRequestKey()); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not record fuel credit sale' }) } finally { setSavingFuelSale(false) }
  }
  const createMeterReading = async () => {
    if (!meterForm.pumpId) { toast({ variant: 'destructive', title: 'Select a pump' }); return }
    if (!meterForm.shiftId) { toast({ variant: 'destructive', title: 'Select an open shift' }); return }
    if (!meterForm.readingDate) { toast({ variant: 'destructive', title: 'Reading date is required' }); return }
    try {
      const litresSold = Number(meterForm.closingReading) - Number(meterForm.openingReading)
      await requestJson('/api/fuel/meter-readings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...meterForm, litresSold, amount: Number(meterForm.amount) }) })
      setShowMeterModal(false); setMeterForm({ pumpId: '', shiftId: '', openingReading: 0, closingReading: 0, litresSold: 0, amount: 0, readingDate: '', priceOverrideReason: '' }); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to record meter reading' }) }
  }
  const createDipstickReading = async () => {
    if (!dipstickForm.tankId) { toast({ variant: 'destructive', title: 'Select a tank' }); return }
    try {
      await requestJson('/api/fuel/dipstick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dipstickForm, dipstickLevel: Number(dipstickForm.dipstickLevel), bookStock: Number(dipstickForm.bookStock) }) })
      setShowDipstickModal(false); setDipstickForm({ tankId: '', readingDate: '', dipstickLevel: 0, bookStock: 0, attendant: '', notes: '' }); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to record dipstick reading' }) }
  }
  const createPricingEntry = async () => {
    if (!pricingForm.fuelType.trim()) { toast({ variant: 'destructive', title: 'Fuel type is required' }); return }
    try {
      await requestJson('/api/fuel/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pricingForm, pumpPrice: Number(pricingForm.pumpPrice), costPrice: Number(pricingForm.costPrice) }) })
      setShowPricingModal(false); setPricingForm({ fuelType: '', pumpPrice: 0, costPrice: 0, effectiveDate: '', notes: '' }); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to save pricing' }) }
  }
  const createComplianceEntry = async () => {
    if (!complianceForm.type.trim()) { toast({ variant: 'destructive', title: 'Inspection type is required' }); return }
    if (!complianceForm.result.trim()) { toast({ variant: 'destructive', title: 'Result is required' }); return }
    try {
      await requestJson('/api/fuel/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(complianceForm) })
      setShowComplianceModal(false); setComplianceForm({ inspectionDate: '', type: '', result: '', nextDue: '', notes: '' }); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to save compliance record' }) }
  }
  const submitCloseShift = async () => {
    if (!closingShift) return
    try {
      await requestJson(`/api/fuel/shifts/${closingShift.id}/close`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(closeShiftForm) })
      setShowCloseShiftModal(false); setClosingShift(null)
      setCloseShiftForm({ cashSales: 0, mobileSales: 0, creditSales: 0, lubricantSales: 0, carWashIncome: 0, expenses: 0, cashAccountId: '', mobileAccountId: '', expenseAccountId: '', notes: '', varianceReason: '' })
      toast({ title: 'Shift reconciliation saved' }); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Failed to close shift' }) }
  }
  const approveShift = async (shift: ShiftReport) => {
    setReviewContext({ kind: 'shift', id: shift.id, action: 'approve' }); setReviewNote('')
  }
  const showTankMovements = async (tank: FuelTank) => {
    try {
      const rows = await requestJson(`/api/fuel/tanks/${tank.id}/movements`)
      setStockMovements(Array.isArray(rows) ? rows : [])
      setMovementTank(tank)
      setShowMovementModal(true)
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not load tank history' }) }
  }
  const requestTankAdjustment = async () => {
    if (!adjustmentTank) return
    try {
      await requestJson(`/api/fuel/tanks/${adjustmentTank.id}/adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adjustmentForm) })
      setShowAdjustmentModal(false); setAdjustmentTank(null); setAdjustmentForm({ litresDelta: 0, reason: '' })
      toast({ title: 'Adjustment submitted for independent review' }); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not request adjustment' }) }
  }
  const reviewStockAdjustment = async (adjustment: StockAdjustment, action: 'approve' | 'reject') => {
    setReviewContext({ kind: 'adjustment', id: adjustment.id, action }); setReviewNote('')
  }
  const submitReview = async () => {
    if (!reviewContext) return
    try {
      const endpoint = reviewContext.kind === 'shift'
        ? `/api/fuel/shifts/${reviewContext.id}/reconcile`
        : `/api/fuel/stock-adjustments/${reviewContext.id}/${reviewContext.action}`
      await requestJson(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewNote }) })
      toast({ title: reviewContext.kind === 'shift' ? 'Shift reconciled' : `Adjustment ${reviewContext.action}d` })
      setReviewContext(null); setReviewNote(''); loadData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not save review' }) }
  }
  const deletePump = async (id: string) => { try { const result = await requestJson(`/api/fuel/pumps/${id}`, { method: 'DELETE' }); toast({ title: result?.message || 'Pump removed' }); loadData() } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not remove pump' }) } }
  const deleteTank = async (id: string) => { try { const result = await requestJson(`/api/fuel/tanks/${id}`, { method: 'DELETE' }); toast({ title: result?.message || 'Tank removed' }); loadData() } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not remove tank' }) } }

  const totalStock = tanks.reduce((s, t) => s + t.currentStock, 0)
  const totalCapacity = tanks.reduce((s, t) => s + t.capacity, 0)
  const openShifts = shifts.filter(s => s.status === 'open').length

  if (!canViewCurrentTab) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-xl">Section unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">This fuel-station section is not enabled for your current plan or permissions.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

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
          {tab === 'tanks' && canCreateCurrentTab && <>
            <Button onClick={() => setShowTankModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Tank</Button>
            <Button variant="outline" onClick={() => setShowPumpModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Pump</Button>
          </>}
          {tab === 'deliveries' && canCreateCurrentTab && <Button onClick={() => setShowDeliveryModal(true)}><Plus className="mr-1 h-4 w-4" /> Record Delivery</Button>}
          {tab === 'meter_readings' && canCreateCurrentTab && <Button onClick={() => setShowMeterModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Reading</Button>}
          {tab === 'dipstick' && canCreateCurrentTab && <Button onClick={() => setShowDipstickModal(true)}><Plus className="mr-1 h-4 w-4" /> Record Dipstick</Button>}
          {tab === 'pricing' && canCreateCurrentTab && <Button onClick={() => setShowPricingModal(true)}><Plus className="mr-1 h-4 w-4" /> Set Price</Button>}
          {tab === 'compliance' && canCreateCurrentTab && <Button onClick={() => setShowComplianceModal(true)}><Plus className="mr-1 h-4 w-4" /> Log Inspection</Button>}
          {tab === 'shifts' && canCreateCurrentTab && <>
            <Button variant="outline" onClick={() => setShowFuelCreditModal(true)} disabled={!hasPermission('canCreateReceivable') && !isOwner}><Plus className="mr-1 h-4 w-4" /> Customer Credit Sale</Button>
            <Button onClick={() => setShowShiftModal(true)}><Plus className="mr-1 h-4 w-4" /> New Shift</Button>
          </>}
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
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => showTankMovements(tank)}><History className="mr-2 h-4 w-4" />Stock history</Button>
                    {canEditFuel && <Button variant="outline" size="sm" className="ml-2 mt-2" onClick={() => { setAdjustmentTank(tank); setShowAdjustmentModal(true) }}>Request adjustment</Button>}
                    {canDeleteFuel && <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => deleteTank(tank.id)}><Trash2 className="h-3 w-3" /> Deactivate</Button>}
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
                    <td className="p-2">{canDeleteFuel && <Button variant="ghost" size="sm" title="Deactivate pump" onClick={() => deletePump(p.id)}><Trash2 className="h-3 w-3" /><span className="sr-only">Deactivate pump</span></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stockAdjustments.length > 0 && <section className="space-y-2">
            <h2 className="text-base font-semibold">Stock adjustment approvals</h2>
            <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[700px] text-sm">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Requested</th><th className="p-2 text-left">Tank</th><th className="p-2 text-right">Change</th><th className="p-2 text-left">Reason</th><th className="p-2 text-left">Status</th><th className="p-2"></th></tr></thead>
              <tbody>{stockAdjustments.map(row => <tr key={row.id} className="border-t"><td className="p-2">{new Date(row.requestedAt).toLocaleString()}</td><td className="p-2">{row.tank?.name || 'Tank'}</td><td className="p-2 text-right">{row.litresDelta > 0 ? '+' : ''}{row.litresDelta.toFixed(1)} L</td><td className="p-2">{row.reason}</td><td className="p-2"><Badge variant={row.status === 'pending' ? 'destructive' : 'secondary'}>{row.status}</Badge></td><td className="p-2">{canEditFuel && row.status === 'pending' && <div className="flex gap-2"><Button size="sm" onClick={() => reviewStockAdjustment(row, 'approve')}>Approve</Button><Button size="sm" variant="outline" onClick={() => reviewStockAdjustment(row, 'reject')}>Reject</Button></div>}</td></tr>)}</tbody>
            </table></div>
          </section>}
      </div>

      <div className={cn('space-y-4', tab !== 'deliveries' && 'hidden')}>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Tank</th><th className="p-2 text-left">Supplier / Invoice</th><th className="p-2 text-right">Litres</th><th className="p-2 text-right">Unit Cost</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Payable Balance</th><th className="p-2 text-left">Status</th></tr></thead>
              <tbody>
                {deliveries.map(d => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">{new Date(d.deliveryDate).toLocaleDateString()}</td>
                    <td className="p-2">{d.tank?.name}</td>
                    <td className="p-2">{d.supplier?.name || d.supplierName || '—'}<div className="text-xs text-muted-foreground">{d.invoiceNo || 'Legacy delivery'}</div></td>
                    <td className="p-2 text-right">{d.litres.toFixed(0)}L</td>
                    <td className="p-2 text-right">{d.unitCost.toFixed(0)}</td>
                    <td className="p-2 text-right font-medium">{d.totalCost.toFixed(0)}</td>
                    <td className="p-2 text-right">{Number(d.supplierPurchase?.balance || 0).toFixed(0)}</td>
                    <td className="p-2">{d.supplierPurchase?.paymentStatus || 'Not linked'}</td>
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
              <thead className="bg-muted"><tr><th className="p-2 text-left">Shift No</th><th className="p-2 text-left">Pump</th><th className="p-2 text-right">Litres</th><th className="p-2 text-right">Sales</th><th className="p-2 text-right">Cash + mobile</th><th className="p-2 text-right">Credit</th><th className="p-2 text-right">Net</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2 font-medium">{s.shiftNo}{Boolean(s.fuelSales?.length) && <div className="mt-1 space-y-0.5 font-normal text-xs text-muted-foreground">{s.fuelSales?.filter(row => row.sale.status === 'completed').map(row => <div key={row.sale.receiptNo}>{row.sale.customer?.name || 'Customer'} · {row.sale.receiptNo} · {Number(row.sale.total).toLocaleString()}</div>)}</div>}</td>
                    <td className="p-2">{s.pump?.name || 'All'}</td>
                    <td className="p-2 text-right">{s.litresSold.toFixed(1)}L</td>
                    <td className="p-2 text-right">{s.totalSales.toFixed(0)}</td>
                    <td className="p-2 text-right">{(s.cashSales + s.mobileSales).toFixed(0)}</td>
                    <td className="p-2 text-right">{s.creditSales.toFixed(0)}</td>
                    <td className="p-2 text-right font-medium">{s.netAmount.toFixed(0)}</td>
                    <td className="p-2"><div className="space-y-1"><Badge variant={s.status === 'open' ? 'default' : s.status === 'review_required' ? 'destructive' : 'secondary'}>{s.status.replace('_', ' ')}</Badge>{s.status !== 'open' && <div className={cn('text-xs', Math.abs(s.reconciliationVariance || 0) > 0.01 ? 'text-red-600' : 'text-muted-foreground')}>Variance {Number(s.reconciliationVariance || 0).toFixed(0)}</div>}</div></td>
                    <td className="p-2">{s.status === 'open' ? <Button size="sm" variant="outline" onClick={() => { setClosingShift(s); setCloseShiftForm({ cashSales: 0, mobileSales: 0, creditSales: 0, lubricantSales: 0, carWashIncome: 0, expenses: 0, cashAccountId: '', mobileAccountId: '', expenseAccountId: '', notes: '', varianceReason: '' }); setShowCloseShiftModal(true) }}>Close</Button> : s.status === 'review_required' ? <Button size="sm" variant="outline" onClick={() => approveShift(s)}>Review</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      <Dialog open={showCloseShiftModal} onOpenChange={setShowCloseShiftModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Reconcile shift {closingShift?.shiftNo}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between"><span>Metered litres</span><strong>{readings.filter(r => r.shiftId === closingShift?.id).reduce((sum, r) => sum + r.litresSold, 0).toFixed(1)} L</strong></div>
              <div className="flex justify-between"><span>Fuel meter sales</span><strong>{readings.filter(r => r.shiftId === closingShift?.id).reduce((sum, r) => sum + r.amount, 0).toLocaleString()}</strong></div>
              <p className="mt-1 text-xs text-muted-foreground">Enter collections by tender. Fuel sales and litres are calculated from meter readings.{closingShift?.salesMode === 'ticketed' ? ' Customer invoices already recorded are included automatically; enter only other credit sales below.' : ''}</p>
              {closingShift?.salesMode === 'ticketed' && <div className="mt-2 flex justify-between border-t pt-2"><span>Customer fuel invoices already recorded</span><strong>{Number(closingShift.fuelSales?.reduce((sum, row) => sum + (row.sale.status === 'completed' ? Number(row.sale.total || 0) : 0), 0) || 0).toLocaleString()}</strong></div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['cashSales', 'mobileSales', 'creditSales', 'lubricantSales', 'carWashIncome', 'expenses'] as const).map(key => <div key={key}><Label>{key === 'creditSales' && closingShift?.salesMode === 'ticketed' ? 'Additional credit sales (exclude customer invoices)' : ({ cashSales: 'Cash collected', mobileSales: 'Mobile money collected', creditSales: 'Credit sales', lubricantSales: 'Lubricant sales', carWashIncome: 'Car wash income', expenses: 'Shift expenses' })[key]}</Label><Input type="number" min="0" value={closeShiftForm[key]} onChange={e => setCloseShiftForm({ ...closeShiftForm, [key]: Number(e.target.value) })} /></div>)}
            </div>
            {closeShiftForm.cashSales > 0 && <div><Label>Cash sales account</Label><Select value={closeShiftForm.cashAccountId} onValueChange={cashAccountId => setCloseShiftForm({ ...closeShiftForm, cashAccountId })}><SelectTrigger><SelectValue placeholder="Select permitted cash/safe account" /></SelectTrigger><SelectContent>{paymentAccounts.filter(account => ['cash', 'safe'].includes(account.type)).map(account => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency} {Number(account.balance).toLocaleString()}</SelectItem>)}</SelectContent></Select></div>}
            {closeShiftForm.mobileSales > 0 && <div><Label>Mobile money sales account</Label><Select value={closeShiftForm.mobileAccountId} onValueChange={mobileAccountId => setCloseShiftForm({ ...closeShiftForm, mobileAccountId })}><SelectTrigger><SelectValue placeholder="Select permitted mobile money account" /></SelectTrigger><SelectContent>{paymentAccounts.filter(account => account.type === 'mobile_money').map(account => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency} {Number(account.balance).toLocaleString()}</SelectItem>)}</SelectContent></Select></div>}
            {closeShiftForm.expenses > 0 && <div><Label>Account paid from for shift expenses</Label><Select value={closeShiftForm.expenseAccountId} onValueChange={expenseAccountId => setCloseShiftForm({ ...closeShiftForm, expenseAccountId })}><SelectTrigger><SelectValue placeholder="Select permitted transaction account" /></SelectTrigger><SelectContent>{paymentAccounts.map(account => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency} {Number(account.balance).toLocaleString()}</SelectItem>)}</SelectContent></Select></div>}
            <div><Label>Variance explanation (required when collections differ from sales)</Label><Input value={closeShiftForm.varianceReason} onChange={e => setCloseShiftForm({ ...closeShiftForm, varianceReason: e.target.value })} /></div>
            <div><Label>Shift notes</Label><Input value={closeShiftForm.notes} onChange={e => setCloseShiftForm({ ...closeShiftForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCloseShiftModal(false)}>Cancel</Button><Button onClick={submitCloseShift}>Save Reconciliation</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMovementModal} onOpenChange={setShowMovementModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>{movementTank?.name} stock history</DialogTitle></DialogHeader>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Movement</th><th className="p-2 text-right">Litres</th><th className="p-2 text-right">Unit cost</th><th className="p-2 text-right">Value change</th><th className="p-2 text-right">Stock value</th><th className="p-2 text-right">Balance</th><th className="p-2 text-left">Reference / reason</th></tr></thead>
              <tbody>{stockMovements.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No stock movements found.</td></tr> : stockMovements.map(row => <tr key={row.id} className="border-t"><td className="p-2">{new Date(row.createdAt).toLocaleString()}</td><td className="p-2 capitalize">{row.movementType.replaceAll('_', ' ')}</td><td className={cn('p-2 text-right font-medium', row.litresDelta < 0 ? 'text-red-600' : 'text-green-700')}>{row.litresDelta > 0 ? '+' : ''}{row.litresDelta.toFixed(1)} L</td><td className="p-2 text-right">{row.unitCost.toLocaleString()}</td><td className="p-2 text-right">{row.stockValueDelta.toLocaleString()}</td><td className="p-2 text-right">{row.stockValueAfter.toLocaleString()}</td><td className="p-2 text-right">{row.balanceAfter.toFixed(1)} L</td><td className="p-2">{row.reason || row.sourceType}</td></tr>)}</tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdjustmentModal} onOpenChange={setShowAdjustmentModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request stock adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{adjustmentTank?.name}. Stock will not change until a different authorized user approves this request.</p>
            <div><Label>Litres to add or remove</Label><Input type="number" step="0.1" value={adjustmentForm.litresDelta} onChange={e => setAdjustmentForm({ ...adjustmentForm, litresDelta: Number(e.target.value) })} /></div>
            <div><Label>Reason</Label><Input value={adjustmentForm.reason} onChange={e => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} placeholder="Explain the physical count or correction" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowAdjustmentModal(false)}>Cancel</Button><Button onClick={requestTankAdjustment}>Submit for review</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewContext)} onOpenChange={open => { if (!open) setReviewContext(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewContext?.kind === 'shift' ? 'Review shift variance' : `${reviewContext?.action === 'approve' ? 'Approve' : 'Reject'} stock adjustment`}</DialogTitle></DialogHeader>
          <div><Label>Review note</Label><Input autoFocus value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Explain your review decision" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setReviewContext(null)}>Cancel</Button><Button onClick={submitReview} disabled={reviewNote.trim().length < 8}>{reviewContext?.action === 'reject' ? 'Reject request' : 'Confirm review'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div><Label>Supplier</Label>
              <Select value={deliveryForm.supplierId} onValueChange={v => setDeliveryForm({ ...deliveryForm, supplierId: v })}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent>
                  {suppliers.map(supplier => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {!suppliers.length && <p className="mt-1 text-xs text-muted-foreground">Create an active supplier in Payables before recording a fuel invoice.</p>}
            </div>
            <div><Label>Supplier Invoice No</Label><Input value={deliveryForm.invoiceNo} onChange={e => setDeliveryForm({ ...deliveryForm, invoiceNo: e.target.value })} /></div>
            <div><Label>Litres</Label><Input type="number" value={deliveryForm.litres} onChange={e => setDeliveryForm({ ...deliveryForm, litres: +e.target.value })} /></div>
            <div><Label>Unit Cost</Label><Input type="number" value={deliveryForm.unitCost} onChange={e => setDeliveryForm({ ...deliveryForm, unitCost: +e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createDelivery}>Record Delivery</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Modal */}
      <Dialog open={showFuelCreditModal} onOpenChange={setShowFuelCreditModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Customer Fuel Credit Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Open Shift</Label>
              <Select value={fuelCreditForm.shiftId} onValueChange={v => setFuelCreditForm({ ...fuelCreditForm, shiftId: v })}>
                <SelectTrigger><SelectValue placeholder="Select an open shift" /></SelectTrigger><SelectContent>
                  {shifts.filter(shift => shift.status === 'open').map(shift => <SelectItem key={shift.id} value={shift.id}>{shift.shiftNo} · {shift.pump?.tank?.name || shift.pump?.name || 'Fuel shift'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Customer</Label>
              <Select value={fuelCreditForm.customerId} onValueChange={v => setFuelCreditForm({ ...fuelCreditForm, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>
                  {customers.map(customer => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Litres</Label><Input type="number" min="0.01" step="0.01" value={fuelCreditForm.litres || ''} onChange={e => setFuelCreditForm({ ...fuelCreditForm, litres: Number(e.target.value) })} /></div>
              <div><Label>Unit Price</Label><Input type="number" min="0.01" step="0.01" value={fuelCreditForm.unitPrice || ''} onChange={e => setFuelCreditForm({ ...fuelCreditForm, unitPrice: Number(e.target.value) })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">The invoice updates the customer’s receivable balance and is reconciled against measured litres when the shift is closed. The customer must have a credit limit.</p>
          </div>
          <DialogFooter><Button onClick={createFuelCreditSale} disabled={savingFuelSale}>{savingFuelSale ? 'Recording…' : 'Record Invoice'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Modal */}
      <Dialog open={showShiftModal} onOpenChange={setShowShiftModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Shift Report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Shift No</Label><Input value={shiftForm.shiftNo} onChange={e => setShiftForm({ ...shiftForm, shiftNo: e.target.value })} placeholder="SHIFT-001" /></div>
            <div><Label>Pump</Label>
              <Select value={shiftForm.pumpId} onValueChange={v => {
                const lastReading = readings.filter(row => row.pumpId === v).sort((a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime())[0]
                setShiftForm({ ...shiftForm, pumpId: v, openingReading: lastReading?.closingReading ?? 0 })
              }}>
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
      {/* Meter Reading Modal */}
      <Dialog open={showMeterModal} onOpenChange={setShowMeterModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Meter Reading</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Open Shift</Label>
              <Select value={meterForm.shiftId} onValueChange={value => {
                const shift = shifts.find(row => row.id === value)
                setMeterForm({ ...meterForm, shiftId: value, pumpId: shift?.pumpId || meterForm.pumpId, openingReading: shift?.openingReading || 0 })
              }}>
                <SelectTrigger><SelectValue placeholder="Select an open shift" /></SelectTrigger><SelectContent>
                  {shifts.filter(shift => shift.status === 'open').map(shift => <SelectItem key={shift.id} value={shift.id}>{shift.shiftNo} · {shift.pump?.name || 'Pump'} · opening {shift.openingReading}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Pump</Label>
              <Select value={meterForm.pumpId} onValueChange={v => setMeterForm({ ...meterForm, pumpId: v })}>
                <SelectTrigger><SelectValue placeholder="Select pump" /></SelectTrigger><SelectContent>
                  {pumps.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reading Date</Label><Input type="datetime-local" value={meterForm.readingDate} onChange={e => setMeterForm({ ...meterForm, readingDate: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Opening Reading</Label><Input type="number" value={meterForm.openingReading} onChange={e => setMeterForm({ ...meterForm, openingReading: +e.target.value })} /></div>
              <div><Label>Closing Reading</Label><Input type="number" value={meterForm.closingReading} onChange={e => {
                const closingReading = +e.target.value
                const litres = Math.max(0, closingReading - meterForm.openingReading)
                setMeterForm({ ...meterForm, closingReading, amount: effectivePrice === undefined ? meterForm.amount : Math.round(litres * effectivePrice * 100) / 100 })
              }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Litres Sold (calculated)</Label><Input readOnly value={Math.max(0, meterForm.closingReading - meterForm.openingReading).toFixed(1)} /></div>
              <div><Label>Amount</Label><Input type="number" value={meterForm.amount} onChange={e => setMeterForm({ ...meterForm, amount: +e.target.value })} /></div>
            </div>
            {effectivePrice !== undefined && <p className="text-xs text-muted-foreground">Effective price: {effectivePrice.toLocaleString()} / L. Sale amount is suggested automatically; explain any override below.</p>}
            <div><Label>Price override reason</Label><Input value={meterForm.priceOverrideReason} onChange={e => setMeterForm({ ...meterForm, priceOverrideReason: e.target.value })} placeholder="Required if amount differs from effective price" /></div>
          </div>
          <DialogFooter><Button onClick={createMeterReading}>Save Reading</Button></DialogFooter>
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
          <DialogFooter><Button onClick={createDipstickReading}>Save Dipstick</Button></DialogFooter>
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
          <DialogFooter><Button onClick={createPricingEntry}>Save Price</Button></DialogFooter>
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
          <DialogFooter><Button onClick={createComplianceEntry}>Log Inspection</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
