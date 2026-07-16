import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Factory, Plus, Trash2, Beaker, AlertTriangle, ClipboardCheck, Package, TrendingDown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ProductionOrder {
  id: string
  orderNo: string
  product: { id: string; name: string }
  recipe?: { id: string; name: string } | null
  quantity: number
  actualQuantity?: number
  unitCost: number
  laborCost?: number
  overheadCost?: number
  standardCost?: number
  actualCost?: number
  totalCost: number
  wasteQty: number
  expectedYield?: number
  actualYield?: number
  batchNumber?: string | null
  qualityStatus?: string
  qualityNotes?: string | null
  status: string
  startDate: string | null
  endDate: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  user: { id: string; fname?: string; lname?: string }
  notes: string | null
  qualityChecks?: QualityCheck[]
  batches?: ProductionBatch[]
}

interface QualityCheck {
  id: string
  productionOrderId: string
  checkType: string
  status: string
  checkedBy?: string | null
  checkedAt?: string | null
  notes?: string | null
  defectQty?: number
  defectDescription?: string | null
  createdAt: string
  user?: { fname?: string; lname?: string; email?: string } | null
}

interface ProductionBatch {
  id: string
  productionOrderId: string
  batchNumber: string
  quantity: number
  manufacturedDate: string
  expiryDate?: string | null
  status: string
  notes?: string | null
  product?: { id: string; name: string } | null
}

interface BOM {
  id: string
  name: string
  yield: string | null
  isActive: boolean
  product: { id: string; name: string }
  ingredients: { id: string; productId: string; product: { id: string; name: string }; quantity: number; unit: string }[]
}

interface WasteRecord {
  id: string
  productionOrderId: string
  productionOrder?: { orderNo: string }
  product?: { id: string; name: string } | null
  quantity: number
  unitCost: number
  totalCost: number
  reason: string | null
  createdAt: string
}

interface Product { id: string; name: string }
interface IngredientRow { productId: string; quantity: number; unit: string }

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const qcStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  passed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  rework: 'bg-orange-100 text-orange-700',
}

const batchStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  quarantined: 'bg-orange-100 text-orange-700',
  recalled: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-700',
}

export default function ManufacturingPage() {
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [boms, setBoms] = useState<BOM[]>([])
  const [waste, setWaste] = useState<WasteRecord[]>([])
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([])
  const [batches, setBatches] = useState<ProductionBatch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showWasteModal, setShowWasteModal] = useState(false)
  const [showBomModal, setShowBomModal] = useState(false)
  const [showQcModal, setShowQcModal] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completingOrder, setCompletingOrder] = useState<ProductionOrder | null>(null)
  const [orderForm, setOrderForm] = useState({ orderNo: '', productId: '', recipeId: '', quantity: 1, unitCost: 0, laborCost: 0, overheadCost: 0, batchNumber: '', expectedYield: 0, plannedStartDate: '', plannedEndDate: '', notes: '' })
  const [wasteForm, setWasteForm] = useState({ productionOrderId: '', productId: '', quantity: 1, unitCost: 0, reason: '' })
  const [bomForm, setBomForm] = useState({ productId: '', name: '', yield: '', notes: '' })
  const [bomIngredients, setBomIngredients] = useState<IngredientRow[]>([{ productId: '', quantity: 1, unit: 'Piece' }])
  const [qcForm, setQcForm] = useState({ productionOrderId: '', checkType: 'final_inspection', status: 'pending', notes: '', defectQty: 0, defectDescription: '' })
  const [batchForm, setBatchForm] = useState({ productionOrderId: '', productId: '', batchNumber: '', quantity: 0, manufacturedDate: '', expiryDate: '', notes: '' })
  const [completeForm, setCompleteForm] = useState({ actualQuantity: 0, actualYield: 0, laborCost: 0, overheadCost: 0, qualityStatus: 'pending', qualityNotes: '', batchNumber: '' })
  const { toast } = useToast()

  const resetOrderForm = useCallback(() => {
    setOrderForm({ orderNo: '', productId: '', recipeId: '', quantity: 1, unitCost: 0, laborCost: 0, overheadCost: 0, batchNumber: '', expectedYield: 0, plannedStartDate: '', plannedEndDate: '', notes: '' })
  }, [])

  const resetWasteForm = useCallback(() => {
    setWasteForm({ productionOrderId: '', productId: '', quantity: 1, unitCost: 0, reason: '' })
  }, [])

  const resetBomForm = useCallback(() => {
    setBomForm({ productId: '', name: '', yield: '', notes: '' })
    setBomIngredients([{ productId: '', quantity: 1, unit: 'Piece' }])
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [o, b, w, p, qc, bt] = await Promise.all([
        apiFetch('/api/manufacturing/orders').then((r) => r.json()).catch(() => []),
        apiFetch('/api/manufacturing/bom').then((r) => r.json()).catch(() => []),
        apiFetch('/api/manufacturing/waste').then((r) => r.json()).catch(() => []),
        apiFetch('/api/inventory?limit=1000000').then((r) => r.json()).catch(() => []),
        apiFetch('/api/manufacturing/quality-checks').then((r) => r.json()).catch(() => []),
        apiFetch('/api/manufacturing/batches').then((r) => r.json()).catch(() => []),
      ])
      setOrders(Array.isArray(o) ? o : [])
      setBoms(Array.isArray(b) ? b : [])
      setWaste(Array.isArray(w) ? w : [])
      setProducts(Array.isArray(p) ? p : p?.products || [])
      setQualityChecks(Array.isArray(qc) ? qc : [])
      setBatches(Array.isArray(bt) ? bt : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const createOrder = async () => {
    if (!orderForm.productId) {
      toast({ variant: 'destructive', title: 'Select a product' })
      return
    }
    if (orderForm.quantity < 1) {
      toast({ variant: 'destructive', title: 'Quantity must be at least 1' })
      return
    }

    try {
      await apiFetch('/api/manufacturing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...orderForm,
          recipeId: orderForm.recipeId || null,
        }),
      })
      setShowOrderModal(false)
      resetOrderForm()
      await loadData()
    } catch {
      toast({ variant: 'destructive', title: 'Failed to create order' })
    }
  }

  const updateOrderStatus = async (id: string, status: string) => {
    await apiFetch(`/api/manufacturing/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await loadData()
  }

  const openCompleteModal = (order: ProductionOrder) => {
    setCompletingOrder(order)
    setCompleteForm({
      actualQuantity: order.quantity,
      actualYield: order.expectedYield || order.quantity,
      laborCost: order.laborCost || 0,
      overheadCost: order.overheadCost || 0,
      qualityStatus: 'pending',
      qualityNotes: '',
      batchNumber: order.batchNumber || '',
    })
    setShowCompleteModal(true)
  }

  const completeOrder = async () => {
    if (!completingOrder) return
    try {
      await apiFetch(`/api/manufacturing/orders/${completingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          ...completeForm,
        }),
      })
      setShowCompleteModal(false)
      setCompletingOrder(null)
      await loadData()
      toast({ title: 'Production completed', description: 'Stock has been updated and batch recorded.' })
    } catch {
      toast({ variant: 'destructive', title: 'Failed to complete order' })
    }
  }

  const createQualityCheck = async () => {
    if (!qcForm.productionOrderId) {
      toast({ variant: 'destructive', title: 'Select a production order' })
      return
    }
    try {
      await apiFetch('/api/manufacturing/quality-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qcForm),
      })
      setShowQcModal(false)
      setQcForm({ productionOrderId: '', checkType: 'final_inspection', status: 'pending', notes: '', defectQty: 0, defectDescription: '' })
      await loadData()
    } catch {
      toast({ variant: 'destructive', title: 'Failed to create quality check' })
    }
  }

  const createBatch = async () => {
    if (!batchForm.productionOrderId || !batchForm.batchNumber.trim()) {
      toast({ variant: 'destructive', title: 'Production order and batch number are required' })
      return
    }
    try {
      await apiFetch('/api/manufacturing/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchForm),
      })
      setShowBatchModal(false)
      setBatchForm({ productionOrderId: '', productId: '', batchNumber: '', quantity: 0, manufacturedDate: '', expiryDate: '', notes: '' })
      await loadData()
    } catch {
      toast({ variant: 'destructive', title: 'Failed to create batch' })
    }
  }

  const createWaste = async () => {
    if (!wasteForm.productId) {
      toast({ variant: 'destructive', title: 'Select a product' })
      return
    }
    if (wasteForm.quantity < 1) {
      toast({ variant: 'destructive', title: 'Quantity must be at least 1' })
      return
    }

    try {
      await apiFetch('/api/manufacturing/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wasteForm),
      })
      setShowWasteModal(false)
      resetWasteForm()
      await loadData()
    } catch {
      toast({ variant: 'destructive', title: 'Failed to record waste' })
    }
  }

  const createBom = async () => {
    if (!bomForm.productId || !bomForm.name.trim()) {
      toast({ variant: 'destructive', title: 'Provide a finished product and recipe name' })
      return
    }

    const ingredients = bomIngredients.filter((item) => item.productId)
    if (ingredients.length === 0) {
      toast({ variant: 'destructive', title: 'Add at least one ingredient' })
      return
    }

    try {
      await apiFetch('/api/manufacturing/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: bomForm.productId,
          name: bomForm.name,
          yield: bomForm.yield || null,
          ingredients,
        }),
      })
      setShowBomModal(false)
      resetBomForm()
      await loadData()
      toast({ title: 'Recipe saved', description: 'The BOM/recipe is now available for production orders.' })
    } catch {
      toast({ variant: 'destructive', title: 'Failed to save recipe' })
    }
  }

  const deleteOrder = async (id: string) => {
    try {
      await apiFetch(`/api/manufacturing/orders/${id}`, { method: 'DELETE' })
    } catch {}
    await loadData()
  }

  const totalWasteCost = waste.reduce((s, w) => s + (Number(w.totalCost) || 0), 0)
  const completedOrders = orders.filter((o) => o.status === 'completed').length
  const inProgressOrders = orders.filter((o) => o.status === 'in_progress').length
  const pendingQcChecks = qualityChecks.filter((qc) => qc.status === 'pending').length
  const activeBatches = batches.filter((b) => b.status === 'active').length
  const filteredBoms = orderForm.productId ? boms.filter((bom) => bom.product?.id === orderForm.productId) : boms
  const getProductName = (product: Product | null | undefined) => product?.name || 'Unknown product'
  const getOrderProductName = (order: ProductionOrder) => order.product?.name || 'Unknown product'
  const getRecipeName = (order: ProductionOrder) => order.recipe?.name || '—'
  const getWasteProductName = (record: WasteRecord) => record.product?.name || '—'
  const getBomProductName = (bom: BOM) => bom.product?.name || 'Unknown product'
  const getIngredientName = (ingredient: BOM['ingredients'][number]) => ingredient.product?.name || 'Unspecified ingredient'
  const costVariance = (order: ProductionOrder) => {
    const std = Number(order.standardCost || 0)
    const actual = Number(order.actualCost || order.totalCost || 0)
    if (!std) return null
    return actual - std
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Factory className="h-7 w-7" /> Manufacturing</h1>
        <p className="text-sm text-muted-foreground">Production orders, BOMs, waste tracking, and costing</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{orders.length}</div><p className="text-xs text-muted-foreground">Production Orders</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{completedOrders}</div><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{boms.length}</div><p className="text-xs text-muted-foreground">BOM / Recipes</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalWasteCost.toFixed(0)}</div><p className="text-xs text-muted-foreground">Waste Cost</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders"><Factory className="mr-1 h-4 w-4" /> Production Orders</TabsTrigger>
          <TabsTrigger value="bom"><Beaker className="mr-1 h-4 w-4" /> BOM</TabsTrigger>
          <TabsTrigger value="waste"><AlertTriangle className="mr-1 h-4 w-4" /> Waste</TabsTrigger>
          <TabsTrigger value="qc"><ClipboardCheck className="mr-1 h-4 w-4" /> Quality Checks</TabsTrigger>
          <TabsTrigger value="batches"><Package className="mr-1 h-4 w-4" /> Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowOrderModal(true)}><Plus className="mr-1 h-4 w-4" /> New Production Order</Button>
            <Button variant="outline" onClick={() => setShowBomModal(true)}><Beaker className="mr-1 h-4 w-4" /> Create BOM</Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            {orders.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No production orders yet. Create one to get the workflow started.</div>
            ) : (
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted"><tr><th className="p-2 text-left">Order No</th><th className="p-2 text-left">Product</th><th className="p-2 text-left">Recipe</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Std Cost</th><th className="p-2 text-right">Actual Cost</th><th className="p-2 text-right">Variance</th><th className="p-2 text-left">QC</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
                <tbody>
                  {orders.map((o) => {
                    const variance = costVariance(o)
                    return (
                    <tr key={o.id} className="border-t">
                      <td className="p-2 font-medium">{o.orderNo}</td>
                      <td className="p-2">{getOrderProductName(o)}</td>
                      <td className="p-2">{getRecipeName(o)}</td>
                      <td className="p-2 text-right">{o.quantity}{o.actualQuantity ? `/${o.actualQuantity}` : ''}</td>
                      <td className="p-2 text-right">{Number(o.standardCost || 0).toFixed(0)}</td>
                      <td className="p-2 text-right">{Number(o.actualCost || o.totalCost || 0).toFixed(0)}</td>
                      <td className="p-2 text-right">{variance === null ? '—' : <span className={variance > 0 ? 'text-red-500' : 'text-green-600'}>{variance > 0 ? '+' : ''}{variance.toFixed(0)}</span>}</td>
                      <td className="p-2"><Badge className={qcStatusColors[o.qualityStatus || 'pending'] || qcStatusColors.pending}>{o.qualityStatus || 'pending'}</Badge></td>
                      <td className="p-2"><Badge className={statusColors[o.status] || statusColors.pending}>{o.status}</Badge></td>
                      <td className="p-2 space-x-1">
                        {o.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateOrderStatus(o.id, 'in_progress')}>Start</Button>}
                        {o.status === 'in_progress' && <Button size="sm" variant="outline" onClick={() => openCompleteModal(o)}>Complete</Button>}
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteOrder(o.id)}><Trash2 className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="bom" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowBomModal(true)}><Plus className="mr-1 h-4 w-4" /> Add BOM / Recipe</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {boms.length === 0 ? (
              <div className="md:col-span-2 rounded-md border p-6 text-sm text-muted-foreground">No BOMs or recipes yet. Create one to connect products with ingredients.</div>
            ) : boms.map((b) => (
              <Card key={b.id}>
                <CardHeader><CardTitle className="text-base">{b.name} <Badge variant="secondary" className="ml-2">{getBomProductName(b)}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">Yield: {b.yield || '—'}</p>
                    <p className="font-medium mt-2">Ingredients:</p>
                    {b.ingredients.map((ing) => (
                      <div key={ing.id || `${ing.productId}-${ing.quantity}`} className="flex justify-between gap-2">
                        <span>{getIngredientName(ing)}</span><span>{ing.quantity} {ing.unit}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="waste" className="space-y-4">
          <Button onClick={() => setShowWasteModal(true)}><Plus className="mr-1 h-4 w-4" /> Record Waste</Button>
          <div className="rounded-md border overflow-x-auto">
            {waste.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No waste recorded yet. Log waste whenever production losses occur.</div>
            ) : (
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Order</th><th className="p-2 text-left">Product</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Cost</th><th className="p-2 text-left">Reason</th></tr></thead>
                <tbody>
                  {waste.map((w) => (
                    <tr key={w.id} className="border-t">
                      <td className="p-2">{new Date(w.createdAt).toLocaleDateString()}</td>
                      <td className="p-2">{w.productionOrder?.orderNo || '—'}</td>
                      <td className="p-2">{getWasteProductName(w)}</td>
                      <td className="p-2 text-right">{w.quantity}</td>
                      <td className="p-2 text-right text-red-500">{Number(w.totalCost || 0).toFixed(0)}</td>
                      <td className="p-2">{w.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="qc" className="space-y-4">
          <Button onClick={() => setShowQcModal(true)}><Plus className="mr-1 h-4 w-4" /> New Quality Check</Button>
          <div className="rounded-md border overflow-x-auto">
            {qualityChecks.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No quality checks recorded yet.</div>
            ) : (
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Order</th><th className="p-2 text-left">Product</th><th className="p-2 text-left">Check Type</th><th className="p-2 text-left">Status</th><th className="p-2 text-right">Defects</th><th className="p-2 text-left">Notes</th></tr></thead>
                <tbody>
                  {qualityChecks.map((qc) => (
                    <tr key={qc.id} className="border-t">
                      <td className="p-2">{new Date(qc.createdAt).toLocaleDateString()}</td>
                      <td className="p-2">{qc.productionOrder?.orderNo || '—'}</td>
                      <td className="p-2">{qc.productionOrder?.product?.name || '—'}</td>
                      <td className="p-2">{qc.checkType.replace(/_/g, ' ')}</td>
                      <td className="p-2"><Badge className={qcStatusColors[qc.status] || qcStatusColors.pending}>{qc.status}</Badge></td>
                      <td className="p-2 text-right">{qc.defectQty || 0}</td>
                      <td className="p-2 max-w-[200px] truncate">{qc.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="batches" className="space-y-4">
          <Button onClick={() => setShowBatchModal(true)}><Plus className="mr-1 h-4 w-4" /> New Batch</Button>
          <div className="rounded-md border overflow-x-auto">
            {batches.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No batches recorded yet. Track production lots and expiry dates here.</div>
            ) : (
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-muted"><tr><th className="p-2 text-left">Batch No</th><th className="p-2 text-left">Product</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Mfg Date</th><th className="p-2 text-left">Expiry</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Notes</th></tr></thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="p-2 font-medium">{b.batchNumber}</td>
                      <td className="p-2">{b.product?.name || b.productionOrder?.product?.name || '—'}</td>
                      <td className="p-2 text-right">{b.quantity}</td>
                      <td className="p-2">{new Date(b.manufacturedDate).toLocaleDateString()}</td>
                      <td className="p-2">{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : '—'}</td>
                      <td className="p-2"><Badge className={batchStatusColors[b.status] || batchStatusColors.active}>{b.status}</Badge></td>
                      <td className="p-2 max-w-[200px] truncate">{b.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Production Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Order No</Label><Input value={orderForm.orderNo} onChange={(e) => setOrderForm({ ...orderForm, orderNo: e.target.value })} placeholder="PROD-001" /></div>
            <div><Label>Finished Product</Label>
              <Select value={orderForm.productId} onValueChange={(value) => setOrderForm({ ...orderForm, productId: value, recipeId: '' })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>BOM / Recipe</Label>
              <Select value={orderForm.recipeId} onValueChange={(value) => setOrderForm({ ...orderForm, recipeId: value })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>
                  {filteredBoms.map((bom) => <SelectItem key={bom.id} value={bom.id}>{bom.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity</Label><Input type="number" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: +e.target.value })} /></div>
              <div><Label>Expected Yield</Label><Input type="number" value={orderForm.expectedYield} onChange={(e) => setOrderForm({ ...orderForm, expectedYield: +e.target.value })} placeholder="Same as qty" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Unit Material Cost</Label><Input type="number" value={orderForm.unitCost} onChange={(e) => setOrderForm({ ...orderForm, unitCost: +e.target.value })} /></div>
              <div><Label>Batch Number</Label><Input value={orderForm.batchNumber} onChange={(e) => setOrderForm({ ...orderForm, batchNumber: e.target.value })} placeholder="BATCH-001" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Labor Cost</Label><Input type="number" value={orderForm.laborCost} onChange={(e) => setOrderForm({ ...orderForm, laborCost: +e.target.value })} /></div>
              <div><Label>Overhead Cost</Label><Input type="number" value={orderForm.overheadCost} onChange={(e) => setOrderForm({ ...orderForm, overheadCost: +e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Planned Start Date</Label><Input type="date" value={orderForm.plannedStartDate} onChange={(e) => setOrderForm({ ...orderForm, plannedStartDate: e.target.value })} /></div>
              <div><Label>Planned End Date</Label><Input type="date" value={orderForm.plannedEndDate} onChange={(e) => setOrderForm({ ...orderForm, plannedEndDate: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setShowBomModal(true)}>Create BOM</Button>
            <Button onClick={createOrder}>Create Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBomModal} onOpenChange={setShowBomModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create BOM / Recipe</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Finished Product</Label>
              <Select value={bomForm.productId} onValueChange={(value) => setBomForm({ ...bomForm, productId: value })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Recipe Name</Label><Input value={bomForm.name} onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })} placeholder="Morning Blend" /></div>
            <div><Label>Yield</Label><Input value={bomForm.yield} onChange={(e) => setBomForm({ ...bomForm, yield: e.target.value })} placeholder="1 batch" /></div>
            <div className="space-y-2">
              <Label>Ingredients</Label>
              {bomIngredients.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
                  <Select value={item.productId} onValueChange={(value) => {
                    const next = [...bomIngredients]
                    next[index] = { ...next[index], productId: value }
                    setBomIngredients(next)
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={item.quantity} onChange={(e) => {
                    const next = [...bomIngredients]
                    next[index] = { ...next[index], quantity: +e.target.value }
                    setBomIngredients(next)
                  }} />
                  <Input value={item.unit} onChange={(e) => {
                    const next = [...bomIngredients]
                    next[index] = { ...next[index], unit: e.target.value }
                    setBomIngredients(next)
                  }} placeholder="Piece" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => {
                    const next = bomIngredients.filter((_, idx) => idx !== index)
                    setBomIngredients(next.length ? next : [{ productId: '', quantity: 1, unit: 'Piece' }])
                  }}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setBomIngredients([...bomIngredients, { productId: '', quantity: 1, unit: 'Piece' }])}>Add ingredient</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBomModal(false)}>Cancel</Button>
            <Button onClick={createBom}>Save BOM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWasteModal} onOpenChange={setShowWasteModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Production Waste</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Production Order</Label>
              <Select value={wasteForm.productionOrderId} onValueChange={(value) => setWasteForm({ ...wasteForm, productionOrderId: value })}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger><SelectContent>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} - {o.product.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Product (Wasted Ingredient)</Label>
              <Select value={wasteForm.productId} onValueChange={(value) => setWasteForm({ ...wasteForm, productId: value })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={wasteForm.quantity} onChange={(e) => setWasteForm({ ...wasteForm, quantity: +e.target.value })} /></div>
            <div><Label>Unit Cost</Label><Input type="number" value={wasteForm.unitCost} onChange={(e) => setWasteForm({ ...wasteForm, unitCost: +e.target.value })} /></div>
            <div><Label>Reason</Label><Input value={wasteForm.reason} onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createWaste}>Record Waste</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQcModal} onOpenChange={setShowQcModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Quality Check</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Production Order</Label>
              <Select value={qcForm.productionOrderId} onValueChange={(value) => setQcForm({ ...qcForm, productionOrderId: value })}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger><SelectContent>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} - {o.product.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Check Type</Label>
              <Select value={qcForm.checkType} onValueChange={(value) => setQcForm({ ...qcForm, checkType: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="incoming_material">Incoming Material</SelectItem>
                  <SelectItem value="in_process">In-Process</SelectItem>
                  <SelectItem value="final_inspection">Final Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Status</Label>
              <Select value={qcForm.status} onValueChange={(value) => setQcForm({ ...qcForm, status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="rework">Rework</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Defect Quantity</Label><Input type="number" value={qcForm.defectQty} onChange={(e) => setQcForm({ ...qcForm, defectQty: +e.target.value })} /></div>
            <div><Label>Defect Description</Label><Input value={qcForm.defectDescription} onChange={(e) => setQcForm({ ...qcForm, defectDescription: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={qcForm.notes} onChange={(e) => setQcForm({ ...qcForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createQualityCheck}>Save Check</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchModal} onOpenChange={setShowBatchModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Production Batch</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Production Order</Label>
              <Select value={batchForm.productionOrderId} onValueChange={(value) => setBatchForm({ ...batchForm, productionOrderId: value })}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger><SelectContent>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} - {o.product.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Batch Number</Label><Input value={batchForm.batchNumber} onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })} placeholder="BATCH-001" /></div>
            <div><Label>Quantity</Label><Input type="number" value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: +e.target.value })} /></div>
            <div><Label>Manufactured Date</Label><Input type="date" value={batchForm.manufacturedDate} onChange={(e) => setBatchForm({ ...batchForm, manufacturedDate: e.target.value })} /></div>
            <div><Label>Expiry Date</Label><Input type="date" value={batchForm.expiryDate} onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={batchForm.notes} onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createBatch}>Save Batch</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCompleteModal} onOpenChange={setShowCompleteModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Complete Production Order</DialogTitle></DialogHeader>
          {completingOrder && (
            <div className="text-sm text-muted-foreground mb-2">
              Order <span className="font-medium">{completingOrder.orderNo}</span> — {completingOrder.product.name}
            </div>
          )}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Actual Quantity Produced</Label><Input type="number" value={completeForm.actualQuantity} onChange={(e) => setCompleteForm({ ...completeForm, actualQuantity: +e.target.value })} /></div>
              <div><Label>Actual Yield</Label><Input type="number" value={completeForm.actualYield} onChange={(e) => setCompleteForm({ ...completeForm, actualYield: +e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Labor Cost</Label><Input type="number" value={completeForm.laborCost} onChange={(e) => setCompleteForm({ ...completeForm, laborCost: +e.target.value })} /></div>
              <div><Label>Overhead Cost</Label><Input type="number" value={completeForm.overheadCost} onChange={(e) => setCompleteForm({ ...completeForm, overheadCost: +e.target.value })} /></div>
            </div>
            <div><Label>Batch Number</Label><Input value={completeForm.batchNumber} onChange={(e) => setCompleteForm({ ...completeForm, batchNumber: e.target.value })} placeholder="BATCH-001" /></div>
            <div><Label>Quality Status</Label>
              <Select value={completeForm.qualityStatus} onValueChange={(value) => setCompleteForm({ ...completeForm, qualityStatus: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="rework">Rework</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quality Notes</Label><Input value={completeForm.qualityNotes} onChange={(e) => setCompleteForm({ ...completeForm, qualityNotes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={completeOrder}>Complete Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
