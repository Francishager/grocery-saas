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
import { Factory, Plus, Trash2, Beaker, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ProductionOrder {
  id: string
  orderNo: string
  product: { id: string; name: string }
  recipe?: { id: string; name: string } | null
  quantity: number
  unitCost: number
  totalCost: number
  wasteQty: number
  status: string
  startDate: string | null
  endDate: string | null
  user: { id: string; fname?: string; lname?: string }
  notes: string | null
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

export default function ManufacturingPage() {
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [boms, setBoms] = useState<BOM[]>([])
  const [waste, setWaste] = useState<WasteRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showWasteModal, setShowWasteModal] = useState(false)
  const [showBomModal, setShowBomModal] = useState(false)
  const [orderForm, setOrderForm] = useState({ orderNo: '', productId: '', recipeId: '', quantity: 1, unitCost: 0, notes: '' })
  const [wasteForm, setWasteForm] = useState({ productionOrderId: '', productId: '', quantity: 1, unitCost: 0, reason: '' })
  const [bomForm, setBomForm] = useState({ productId: '', name: '', yield: '', notes: '' })
  const [bomIngredients, setBomIngredients] = useState<IngredientRow[]>([{ productId: '', quantity: 1, unit: 'Piece' }])
  const { toast } = useToast()

  const resetOrderForm = useCallback(() => {
    setOrderForm({ orderNo: '', productId: '', recipeId: '', quantity: 1, unitCost: 0, notes: '' })
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
      const [o, b, w, p] = await Promise.all([
        apiFetch('/api/manufacturing/orders').then((r) => r.json()).catch(() => []),
        apiFetch('/api/manufacturing/bom').then((r) => r.json()).catch(() => []),
        apiFetch('/api/manufacturing/waste').then((r) => r.json()).catch(() => []),
        apiFetch('/api/inventory?limit=100').then((r) => r.json()).catch(() => []),
      ])
      setOrders(Array.isArray(o) ? o : [])
      setBoms(Array.isArray(b) ? b : [])
      setWaste(Array.isArray(w) ? w : [])
      setProducts(Array.isArray(p) ? p : p?.products || [])
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
  const filteredBoms = orderForm.productId ? boms.filter((bom) => bom.product?.id === orderForm.productId) : boms
  const getProductName = (product: Product | null | undefined) => product?.name || 'Unknown product'
  const getOrderProductName = (order: ProductionOrder) => order.product?.name || 'Unknown product'
  const getRecipeName = (order: ProductionOrder) => order.recipe?.name || '—'
  const getWasteProductName = (record: WasteRecord) => record.product?.name || '—'
  const getBomProductName = (bom: BOM) => bom.product?.name || 'Unknown product'
  const getIngredientName = (ingredient: BOM['ingredients'][number]) => ingredient.product?.name || 'Unspecified ingredient'

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
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-muted"><tr><th className="p-2 text-left">Order No</th><th className="p-2 text-left">Product</th><th className="p-2 text-left">Recipe</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Cost</th><th className="p-2 text-left">Status</th><th></th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-2 font-medium">{o.orderNo}</td>
                      <td className="p-2">{getOrderProductName(o)}</td>
                      <td className="p-2">{getRecipeName(o)}</td>
                      <td className="p-2 text-right">{o.quantity}</td>
                      <td className="p-2 text-right">{Number(o.totalCost || 0).toFixed(0)}</td>
                      <td className="p-2"><Badge className={statusColors[o.status] || statusColors.pending}>{o.status}</Badge></td>
                      <td className="p-2 space-x-1">
                        {o.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateOrderStatus(o.id, 'in_progress')}>Start</Button>}
                        {o.status === 'in_progress' && <Button size="sm" variant="outline" onClick={() => updateOrderStatus(o.id, 'completed')}>Complete</Button>}
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteOrder(o.id)}><Trash2 className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  ))}
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
            <div><Label>Quantity</Label><Input type="number" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: +e.target.value })} /></div>
            <div><Label>Unit Cost</Label><Input type="number" value={orderForm.unitCost} onChange={(e) => setOrderForm({ ...orderForm, unitCost: +e.target.value })} /></div>
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
        <DialogContent>
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
    </div>
  )
}
