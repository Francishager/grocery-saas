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
import { UtensilsCrossed, Plus, Trash2, Users, Table2, ChefHat, CalendarClock, Beaker, Bike, Clock, TrendingUp, ArrowRightLeft, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalProducts } from '@/db/hybrid'
import { db } from '@/db/index'

interface Table { id: string; name: string; capacity: number; status: string; area: string | null; isActive: boolean; _count?: { orders: number } }
interface Waiter { id: string; name: string; phone: string | null; code: string | null; isActive: boolean; _count?: { orders: number; tips: number } }
interface OrderItem { id: string; productId: string; product: { id: string; name: string; price: number }; quantity: number; price: number; discount: number; total: number; station: string | null; status: string; specialInstructions: string | null }
interface Order { id: string; orderNo: string; status: string; orderType: string; subtotal: number; total: number; tipAmount: number; discount: number; paymentStatus: string; table?: Table | null; waiter?: Waiter | null; items: OrderItem[]; specialInstructions: string | null; createdAt: string }
interface Reservation { id: string; customerName: string; customerPhone: string | null; date: string; time: string; guests: number; status: string; specialRequests: string | null; table?: Table | null }
interface Recipe { id: string; name: string; yield: string | null; isActive: boolean; product: { id: string; name: string }; ingredients: { id: string; productId: string; product: { id: string; name: string }; quantity: number; unit: string }[] }
interface Delivery { id: string; customerName: string; customerPhone: string; address: string; riderName: string | null; riderPhone: string | null; deliveryFee: number; status: string; order?: { id: string; orderNo: string } | null }
interface Product { id: string; name: string; price: number; quantity: number }
interface DashboardStats { ordersToday: number; openTables: number; occupiedTables: number; kitchenOrders: number; barOrders: number; todaySales: number; avgBill: number; completedCount: number }

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  occupied: 'bg-red-100 text-red-700',
  reserved: 'bg-yellow-100 text-yellow-700',
  cleaning: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  preparing: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  served: 'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
}

export default function RestaurantPage() {
  const [tab, setTab] = useState('dashboard')
  const [tables, setTables] = useState<Table[]>([])
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([])
  const [barOrders, setBarOrders] = useState<Order[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const online = useOnlineStatus()
  const [showTableModal, setShowTableModal] = useState(false)
  const [showWaiterModal, setShowWaiterModal] = useState(false)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showReservationModal, setShowReservationModal] = useState(false)
  const [showRecipeModal, setShowRecipeModal] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [tableForm, setTableForm] = useState({ name: '', capacity: 4, area: '' })
  const [waiterForm, setWaiterForm] = useState({ name: '', phone: '', code: '' })
  const [reservationForm, setReservationForm] = useState({ customerName: '', customerPhone: '', date: '', time: '', guests: 1, tableId: '', specialRequests: '' })
  const [deliveryForm, setDeliveryForm] = useState({ orderId: '', customerName: '', customerPhone: '', address: '', riderName: '', riderPhone: '', deliveryFee: 0, notes: '' })
  const [orderForm, setOrderForm] = useState({ tableId: '', waiterId: '', orderType: 'dine_in', specialInstructions: '' })
  const [orderItems, setOrderItems] = useState<{ productId: string; quantity: number; station: string }[]>([])
  const [recipeForm, setRecipeForm] = useState({ productId: '', name: '', yield: '', ingredients: [{ productId: '', quantity: 0, unit: 'Piece' }] })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [tablesRes, waitersRes, productsRes, statsRes] = await Promise.all([
        apiFetch('/api/restaurant/tables'),
        apiFetch('/api/restaurant/waiters'),
        apiFetch('/api/inventory?limit=100'),
        apiFetch('/api/restaurant/dashboard'),
      ])
      if (tablesRes.ok) setTables(await tablesRes.json())
      if (waitersRes.ok) setWaiters(await waitersRes.json())
      if (productsRes.ok) { const p = await productsRes.json(); setProducts(p?.products || p?.records || []) }
      else if (!online) { const local = await getLocalProducts(); setProducts(local.map((p: any) => ({ id: p.id, name: p.product_name, price: p.unit_price, quantity: p.quantity }))) }
      if (statsRes.ok) setStats(await statsRes.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchOrders = useCallback(async () => {
    try { const res = await apiFetch('/api/restaurant/orders'); if (res.ok) setOrders(await res.json()) } catch (e) { console.error(e) }
  }, [])

  const fetchKitchen = useCallback(async () => {
    try {
      const [kRes, bRes] = await Promise.all([apiFetch('/api/restaurant/kitchen/orders'), apiFetch('/api/restaurant/bar/orders')])
      if (kRes.ok) setKitchenOrders(await kRes.json())
      if (bRes.ok) setBarOrders(await bRes.json())
    } catch (e) { console.error(e) }
  }, [])

  const fetchReservations = useCallback(async () => {
    try { const res = await apiFetch('/api/restaurant/reservations'); if (res.ok) setReservations(await res.json()) } catch (e) { console.error(e) }
  }, [])

  const fetchRecipes = useCallback(async () => {
    try { const res = await apiFetch('/api/restaurant/recipes'); if (res.ok) setRecipes(await res.json()) } catch (e) { console.error(e) }
  }, [])

  const fetchDeliveries = useCallback(async () => {
    try { const res = await apiFetch('/api/restaurant/deliveries'); if (res.ok) setDeliveries(await res.json()) } catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    if (tab === 'orders') fetchOrders()
    if (tab === 'kitchen') fetchKitchen()
    if (tab === 'reservations') fetchReservations()
    if (tab === 'recipes') fetchRecipes()
    if (tab === 'delivery') fetchDeliveries()
  }, [tab, fetchOrders, fetchKitchen, fetchReservations, fetchRecipes, fetchDeliveries])

  // === Table handlers ===
  const createTable = async () => {
    try { await apiFetch('/api/restaurant/tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tableForm) }); setShowTableModal(false); setTableForm({ name: '', capacity: 4, area: '' }); fetchData() } catch (e) { console.error(e) }
  }
  const deleteTable = async (id: string) => {
    try { await apiFetch(`/api/restaurant/tables/${id}`, { method: 'DELETE' }); fetchData() } catch (e) { console.error(e) }
  }

  // === Waiter handlers ===
  const createWaiter = async () => {
    try { await apiFetch('/api/restaurant/waiters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(waiterForm) }); setShowWaiterModal(false); setWaiterForm({ name: '', phone: '', code: '' }); fetchData() } catch (e) { console.error(e) }
  }
  const deleteWaiter = async (id: string) => {
    try { await apiFetch(`/api/restaurant/waiters/${id}`, { method: 'DELETE' }); fetchData() } catch (e) { console.error(e) }
  }

  // === Order handlers ===
  const createOrder = async () => {
    try {
      const items = orderItems.map(i => {
        const p = products.find(p => p.id === i.productId)
        return { productId: i.productId, quantity: i.quantity, price: p?.price || 0, station: i.station }
      })
      await apiFetch('/api/restaurant/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...orderForm, items }) })
      setShowOrderModal(false); setOrderForm({ tableId: '', waiterId: '', orderType: 'dine_in', specialInstructions: '' }); setOrderItems([]); fetchOrders()
    } catch (e) { console.error(e) }
  }
  const updateOrderStatus = async (id: string, status: string) => {
    try { await apiFetch(`/api/restaurant/orders/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); fetchOrders(); if (tab === 'kitchen') fetchKitchen() } catch (e) { console.error(e) }
  }
  const completeOrder = async (id: string) => {
    try { await apiFetch(`/api/restaurant/orders/${id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: 'cash' }) }); fetchOrders() } catch (e) { console.error(e) }
  }
  const updateItemStatus = async (orderId: string, itemId: string, status: string) => {
    try { await apiFetch(`/api/restaurant/orders/${orderId}/items/${itemId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); fetchKitchen() } catch (e) { console.error(e) }
  }

  // === Reservation handlers ===
  const createReservation = async () => {
    try { await apiFetch('/api/restaurant/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reservationForm) }); setShowReservationModal(false); setReservationForm({ customerName: '', customerPhone: '', date: '', time: '', guests: 1, tableId: '', specialRequests: '' }); fetchReservations() } catch (e) { console.error(e) }
  }
  const updateReservationStatus = async (id: string, status: string) => {
    try { await apiFetch(`/api/restaurant/reservations/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); fetchReservations() } catch (e) { console.error(e) }
  }

  // === Recipe handlers ===
  const createRecipe = async () => {
    try { await apiFetch('/api/restaurant/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipeForm) }); setShowRecipeModal(false); setRecipeForm({ productId: '', name: '', yield: '', ingredients: [{ productId: '', quantity: 0, unit: 'Piece' }] }); fetchRecipes() } catch (e) { console.error(e) }
  }
  const deleteRecipe = async (id: string) => {
    try { await apiFetch(`/api/restaurant/recipes/${id}`, { method: 'DELETE' }); fetchRecipes() } catch (e) { console.error(e) }
  }

  // === Delivery handlers ===
  const createDelivery = async () => {
    try { await apiFetch('/api/restaurant/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deliveryForm) }); setShowDeliveryModal(false); setDeliveryForm({ orderId: '', customerName: '', customerPhone: '', address: '', riderName: '', riderPhone: '', deliveryFee: 0, notes: '' }); fetchDeliveries() } catch (e) { console.error(e) }
  }
  const updateDeliveryStatus = async (id: string, status: string) => {
    try { await apiFetch(`/api/restaurant/deliveries/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); fetchDeliveries() } catch (e) { console.error(e) }
  }

  const addOrderItem = () => setOrderItems([...orderItems, { productId: '', quantity: 1, station: 'kitchen' }])
  const updateOrderItem = (idx: number, field: string, value: string) => setOrderItems(orderItems.map((i, x) => x === idx ? { ...i, [field]: value } : i))
  const removeOrderItem = (idx: number) => setOrderItems(orderItems.filter((_, x) => x !== idx))
  const addRecipeIngredient = () => setRecipeForm({ ...recipeForm, ingredients: [...recipeForm.ingredients, { productId: '', quantity: 0, unit: 'Piece' }] })
  const updateRecipeIngredient = (idx: number, field: string, value: string) => setRecipeForm({ ...recipeForm, ingredients: recipeForm.ingredients.map((i, x) => x === idx ? { ...i, [field]: field === 'quantity' ? Number(value) : value } : i) })
  const removeRecipeIngredient = (idx: number) => setRecipeForm({ ...recipeForm, ingredients: recipeForm.ingredients.filter((_, x) => x !== idx) })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UtensilsCrossed className="h-6 w-6" /> Restaurant & Bar</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="kitchen">Kitchen / Bar</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="waiters">Waiters</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard">
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Orders Today</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.ordersToday ?? 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Table2 className="h-4 w-4" /> Open Tables</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.openTables ?? 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Occupied Tables</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.occupiedTables ?? 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Today's Sales</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{(stats?.todaySales ?? 0).toLocaleString()}</div></CardContent></Card>
          </div>
          <div className="grid gap-4 md:grid-cols-4 mt-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><ChefHat className="h-4 w-4" /> Kitchen Orders</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.kitchenOrders ?? 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Avg Bill</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{(stats?.avgBill ?? 0).toLocaleString()}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Completed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.completedCount ?? 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Bike className="h-4 w-4" /> Deliveries</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{deliveries.length}</div></CardContent></Card>
          </div>
        </TabsContent>

        {/* Tables */}
        <TabsContent value="tables">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowTableModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Table</Button></div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {tables.map(t => (
              <Card key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2"><Table2 className="h-4 w-4" /> {t.name}</span><Badge className={statusColors[t.status]}>{t.status}</Badge></CardTitle></CardHeader>
                <CardContent><div className="text-sm text-muted-foreground">Capacity: {t.capacity} {t.area && `· ${t.area}`}</div><div className="flex gap-2 mt-3"><Button size="sm" variant="outline" onClick={() => deleteTable(t.id)}><Trash2 className="h-3 w-3" /></Button></div></CardContent>
              </Card>
            ))}
          </div>
          {tables.length === 0 && <div className="text-center text-muted-foreground py-8">No tables yet. Add your first table.</div>}
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowOrderModal(true)}><Plus className="h-4 w-4 mr-1" /> New Order</Button></div>
          <div className="space-y-3">
            {orders.map(o => (
              <Card key={o.id}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2">{o.orderNo} {o.table && <Badge variant="outline">{o.table.name}</Badge>} {o.waiter && <Badge variant="secondary">{o.waiter.name}</Badge>}</span><div className="flex items-center gap-2"><Badge className={statusColors[o.status]}>{o.status}</Badge><Badge variant="outline">{o.orderType}</Badge></div></CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1 mb-3">{o.items.map(i => <div key={i.id} className="flex justify-between text-sm"><span>{i.quantity}× {i.product.name}</span><span>{i.total.toLocaleString()}</span></div>)}</div>
                  <div className="flex justify-between font-medium border-t pt-2"><span>Total</span><span>{o.total.toLocaleString()}</span></div>
                  <div className="flex gap-2 mt-3">
                    {o.status === 'pending' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'preparing')}>Start Preparing</Button>}
                    {o.status === 'preparing' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'ready')}>Mark Ready</Button>}
                    {o.status === 'ready' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'served')}>Mark Served</Button>}
                    {o.status === 'served' && <Button size="sm" onClick={() => completeOrder(o.id)}><CheckCircle className="h-3 w-3 mr-1" /> Complete & Pay</Button>}
                    {o.status !== 'completed' && o.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => updateOrderStatus(o.id, 'cancelled')}>Cancel</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {orders.length === 0 && <div className="text-center text-muted-foreground py-8">No orders yet.</div>}
        </TabsContent>

        {/* Kitchen / Bar Display */}
        <TabsContent value="kitchen">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-3"><ChefHat className="h-5 w-5" /> Kitchen Orders</h3>
              <div className="space-y-3">
                {kitchenOrders.map(o => (
                  <Card key={o.id} className="border-l-4 border-l-orange-400">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex justify-between">{o.orderNo} {o.table && <Badge variant="outline">{o.table.name}</Badge>}</CardTitle></CardHeader>
                    <CardContent><div className="space-y-2">{o.items.map(i => (
                      <div key={i.id} className="flex items-center justify-between text-sm">
                        <span>{i.quantity}× {i.product.name} {i.specialInstructions && <span className="text-orange-600">⚠ {i.specialInstructions}</span>}</span>
                        <div className="flex gap-1">
                          {i.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'preparing')}>Start</Button>}
                          {i.status === 'preparing' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'ready')}>Ready</Button>}
                          {i.status === 'ready' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'served')}>Served</Button>}
                          <Badge className={statusColors[i.status]}>{i.status}</Badge>
                        </div>
                      </div>
                    ))}</div></CardContent>
                  </Card>
                ))}
                {kitchenOrders.length === 0 && <div className="text-center text-muted-foreground py-4">No kitchen orders.</div>}
              </div>
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-3"><Beaker className="h-5 w-5" /> Bar Orders</h3>
              <div className="space-y-3">
                {barOrders.map(o => (
                  <Card key={o.id} className="border-l-4 border-l-purple-400">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex justify-between">{o.orderNo} {o.table && <Badge variant="outline">{o.table.name}</Badge>}</CardTitle></CardHeader>
                    <CardContent><div className="space-y-2">{o.items.map(i => (
                      <div key={i.id} className="flex items-center justify-between text-sm">
                        <span>{i.quantity}× {i.product.name}</span>
                        <div className="flex gap-1">
                          {i.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'preparing')}>Start</Button>}
                          {i.status === 'preparing' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'ready')}>Ready</Button>}
                          {i.status === 'ready' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'served')}>Served</Button>}
                          <Badge className={statusColors[i.status]}>{i.status}</Badge>
                        </div>
                      </div>
                    ))}</div></CardContent>
                  </Card>
                ))}
                {barOrders.length === 0 && <div className="text-center text-muted-foreground py-4">No bar orders.</div>}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Reservations */}
        <TabsContent value="reservations">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowReservationModal(true)}><Plus className="h-4 w-4 mr-1" /> New Reservation</Button></div>
          <div className="space-y-3">
            {reservations.map(r => (
              <Card key={r.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><div className="font-medium">{r.customerName} {r.customerPhone && <span className="text-muted-foreground">· {r.customerPhone}</span>}</div><div className="text-sm text-muted-foreground">{new Date(r.date).toLocaleDateString()} at {r.time} · {r.guests} guests {r.table && `· ${r.table.name}`}</div>{r.specialRequests && <div className="text-sm text-orange-600 mt-1">⚠ {r.specialRequests}</div>}</div>
                    <div className="flex items-center gap-2"><Badge className={statusColors[r.status]}>{r.status}</Badge>
                      {r.status === 'reserved' && <Button size="sm" onClick={() => updateReservationStatus(r.id, 'checked_in')}>Check In</Button>}
                      {r.status === 'checked_in' && <Button size="sm" onClick={() => updateReservationStatus(r.id, 'completed')}>Complete</Button>}
                      {r.status !== 'cancelled' && r.status !== 'completed' && <Button size="sm" variant="outline" onClick={() => updateReservationStatus(r.id, 'cancelled')}>Cancel</Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {reservations.length === 0 && <div className="text-center text-muted-foreground py-8">No reservations yet.</div>}
        </TabsContent>

        {/* Recipes */}
        <TabsContent value="recipes">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowRecipeModal(true)}><Plus className="h-4 w-4 mr-1" /> New Recipe</Button></div>
          <div className="space-y-3">
            {recipes.map(r => (
              <Card key={r.id}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span>{r.name} ({r.product.name})</span><Button size="sm" variant="ghost" onClick={() => deleteRecipe(r.id)}><Trash2 className="h-3 w-3" /></Button></CardTitle></CardHeader>
                <CardContent><div className="text-sm space-y-1">{r.ingredients.map(i => <div key={i.id} className="flex justify-between"><span>{i.product.name}</span><span className="text-muted-foreground">{i.quantity} {i.unit}</span></div>)}</div></CardContent>
              </Card>
            ))}
          </div>
          {recipes.length === 0 && <div className="text-center text-muted-foreground py-8">No recipes yet. Recipes auto-deduct ingredients from inventory on sale.</div>}
        </TabsContent>

        {/* Delivery */}
        <TabsContent value="delivery">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowDeliveryModal(true)}><Plus className="h-4 w-4 mr-1" /> New Delivery</Button></div>
          <div className="space-y-3">
            {deliveries.map(d => (
              <Card key={d.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><div className="font-medium">{d.customerName} · {d.customerPhone}</div><div className="text-sm text-muted-foreground">{d.address}</div><div className="text-sm mt-1">Rider: {d.riderName || 'Unassigned'} {d.riderPhone && `· ${d.riderPhone}`} · Fee: {d.deliveryFee.toLocaleString()}</div>{d.order && <Badge variant="outline" className="mt-1">{d.order.orderNo}</Badge>}</div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[d.status]}>{d.status}</Badge>
                      {d.status === 'pending' && <Button size="sm" onClick={() => updateDeliveryStatus(d.id, 'on_delivery')}>Dispatch</Button>}
                      {d.status === 'on_delivery' && <Button size="sm" onClick={() => updateDeliveryStatus(d.id, 'delivered')}>Delivered</Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {deliveries.length === 0 && <div className="text-center text-muted-foreground py-8">No deliveries yet.</div>}
        </TabsContent>

        {/* Waiters */}
        <TabsContent value="waiters">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowWaiterModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Waiter</Button></div>
          <div className="grid gap-4 md:grid-cols-3">
            {waiters.map(w => (
              <Card key={w.id} className={w.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Users className="h-4 w-4" /> {w.name}</span><Button size="sm" variant="ghost" onClick={() => deleteWaiter(w.id)}><Trash2 className="h-3 w-3" /></Button></CardTitle></CardHeader>
                <CardContent><div className="text-sm text-muted-foreground">{w.phone || 'No phone'} {w.code && `· Code: ${w.code}`}</div><div className="text-sm mt-1">Orders: {w._count?.orders ?? 0} · Tips: {w._count?.tips ?? 0}</div></CardContent>
              </Card>
            ))}
          </div>
          {waiters.length === 0 && <div className="text-center text-muted-foreground py-8">No waiters yet.</div>}
        </TabsContent>
      </Tabs>

      {/* Table Modal */}
      <Dialog open={showTableModal} onOpenChange={setShowTableModal}>
        <DialogContent><DialogHeader><DialogTitle>Add Table</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={tableForm.name} onChange={e => setTableForm({ ...tableForm, name: e.target.value })} placeholder="Table 1" /></div>
            <div><Label>Capacity</Label><Input type="number" value={tableForm.capacity} onChange={e => setTableForm({ ...tableForm, capacity: Number(e.target.value) })} /></div>
            <div><Label>Area</Label><Input value={tableForm.area} onChange={e => setTableForm({ ...tableForm, area: e.target.value })} placeholder="Main Hall, Terrace, Garden" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowTableModal(false)}>Cancel</Button><Button onClick={createTable}>Add Table</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waiter Modal */}
      <Dialog open={showWaiterModal} onOpenChange={setShowWaiterModal}>
        <DialogContent><DialogHeader><DialogTitle>Add Waiter</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={waiterForm.name} onChange={e => setWaiterForm({ ...waiterForm, name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={waiterForm.phone} onChange={e => setWaiterForm({ ...waiterForm, phone: e.target.value })} /></div>
            <div><Label>Code</Label><Input value={waiterForm.code} onChange={e => setWaiterForm({ ...waiterForm, code: e.target.value })} placeholder="W1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowWaiterModal(false)}>Cancel</Button><Button onClick={createWaiter}>Add Waiter</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Modal */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>New Order</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Table</Label><Select value={orderForm.tableId} onValueChange={v => setOrderForm({ ...orderForm, tableId: v })}><SelectTrigger><SelectValue placeholder="Select table" /></SelectTrigger><SelectContent>{tables.filter(t => t.isActive && t.status === 'available').map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Waiter</Label><Select value={orderForm.waiterId} onValueChange={v => setOrderForm({ ...orderForm, waiterId: v })}><SelectTrigger><SelectValue placeholder="Select waiter" /></SelectTrigger><SelectContent>{waiters.filter(w => w.isActive).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Order Type</Label><Select value={orderForm.orderType} onValueChange={v => setOrderForm({ ...orderForm, orderType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dine_in">Dine In</SelectItem><SelectItem value="takeaway">Takeaway</SelectItem><SelectItem value="delivery">Delivery</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Items</Label>
              <div className="space-y-2">{orderItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Select value={item.productId} onValueChange={v => updateOrderItem(idx, 'productId', v)}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="col-span-2"><Input type="number" min={1} value={item.quantity} onChange={e => updateOrderItem(idx, 'quantity', e.target.value)} /></div>
                  <div className="col-span-3"><Select value={item.station} onValueChange={v => updateOrderItem(idx, 'station', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kitchen">Kitchen</SelectItem><SelectItem value="bar">Bar</SelectItem></SelectContent></Select></div>
                  <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeOrderItem(idx)}>✕</Button></div>
                </div>
              ))}</div>
              <Button size="sm" variant="outline" onClick={addOrderItem} className="mt-2"><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
            </div>
            <div><Label>Special Instructions</Label><Input value={orderForm.specialInstructions} onChange={e => setOrderForm({ ...orderForm, specialInstructions: e.target.value })} placeholder="No onions, extra spicy..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowOrderModal(false)}>Cancel</Button><Button onClick={createOrder}>Create Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reservation Modal */}
      <Dialog open={showReservationModal} onOpenChange={setShowReservationModal}>
        <DialogContent><DialogHeader><DialogTitle>New Reservation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer Name</Label><Input value={reservationForm.customerName} onChange={e => setReservationForm({ ...reservationForm, customerName: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={reservationForm.customerPhone} onChange={e => setReservationForm({ ...reservationForm, customerPhone: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={reservationForm.date} onChange={e => setReservationForm({ ...reservationForm, date: e.target.value })} /></div>
              <div><Label>Time</Label><Input type="time" value={reservationForm.time} onChange={e => setReservationForm({ ...reservationForm, time: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Guests</Label><Input type="number" min={1} value={reservationForm.guests} onChange={e => setReservationForm({ ...reservationForm, guests: Number(e.target.value) })} /></div>
              <div><Label>Table</Label><Select value={reservationForm.tableId} onValueChange={v => setReservationForm({ ...reservationForm, tableId: v })}><SelectTrigger><SelectValue placeholder="Any table" /></SelectTrigger><SelectContent>{tables.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>Special Requests</Label><Input value={reservationForm.specialRequests} onChange={e => setReservationForm({ ...reservationForm, specialRequests: e.target.value })} placeholder="Birthday, window seat..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowReservationModal(false)}>Cancel</Button><Button onClick={createReservation}>Create Reservation</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recipe Modal */}
      <Dialog open={showRecipeModal} onOpenChange={setShowRecipeModal}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>New Recipe</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div><Label>Menu Item (Product)</Label><Select value={recipeForm.productId} onValueChange={v => setRecipeForm({ ...recipeForm, productId: v, name: products.find(p => p.id === v)?.name || '' })}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Recipe Name</Label><Input value={recipeForm.name} onChange={e => setRecipeForm({ ...recipeForm, name: e.target.value })} /></div>
            <div><Label>Yield</Label><Input value={recipeForm.yield} onChange={e => setRecipeForm({ ...recipeForm, yield: e.target.value })} placeholder="1 plate, 2 servings" /></div>
            <div><Label>Ingredients</Label>
              <div className="space-y-2">{recipeForm.ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Select value={ing.productId} onValueChange={v => updateRecipeIngredient(idx, 'productId', v)}><SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="col-span-3"><Input type="number" step="0.01" value={ing.quantity} onChange={e => updateRecipeIngredient(idx, 'quantity', e.target.value)} placeholder="Qty" /></div>
                  <div className="col-span-2"><Input value={ing.unit} onChange={e => updateRecipeIngredient(idx, 'unit', e.target.value)} placeholder="Unit" /></div>
                  <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeRecipeIngredient(idx)}>✕</Button></div>
                </div>
              ))}</div>
              <Button size="sm" variant="outline" onClick={addRecipeIngredient} className="mt-2"><Plus className="h-3 w-3 mr-1" /> Add Ingredient</Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowRecipeModal(false)}>Cancel</Button><Button onClick={createRecipe}>Create Recipe</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Modal */}
      <Dialog open={showDeliveryModal} onOpenChange={setShowDeliveryModal}>
        <DialogContent><DialogHeader><DialogTitle>New Delivery</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer Name</Label><Input value={deliveryForm.customerName} onChange={e => setDeliveryForm({ ...deliveryForm, customerName: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={deliveryForm.customerPhone} onChange={e => setDeliveryForm({ ...deliveryForm, customerPhone: e.target.value })} /></div>
            <div><Label>Address</Label><Input value={deliveryForm.address} onChange={e => setDeliveryForm({ ...deliveryForm, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Rider Name</Label><Input value={deliveryForm.riderName} onChange={e => setDeliveryForm({ ...deliveryForm, riderName: e.target.value })} /></div>
              <div><Label>Rider Phone</Label><Input value={deliveryForm.riderPhone} onChange={e => setDeliveryForm({ ...deliveryForm, riderPhone: e.target.value })} /></div>
            </div>
            <div><Label>Delivery Fee</Label><Input type="number" value={deliveryForm.deliveryFee} onChange={e => setDeliveryForm({ ...deliveryForm, deliveryFee: Number(e.target.value) })} /></div>
            <div><Label>Notes</Label><Input value={deliveryForm.notes} onChange={e => setDeliveryForm({ ...deliveryForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowDeliveryModal(false)}>Cancel</Button><Button onClick={createDelivery}>Create Delivery</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
