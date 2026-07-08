import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { UtensilsCrossed, Plus, Trash2, Users, Table2, ChefHat, CalendarClock, Beaker, Bike, Clock, TrendingUp, ArrowRightLeft, CheckCircle, XCircle, AlertCircle, Search, Pencil, Merge, Split, DollarSign, Star, Tag, Wine, Timer, Edit, Eye } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalProducts } from '@/db/hybrid'
import { db } from '@/db/index'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'

interface Table { id: string; name: string; capacity: number; status: string; area: string | null; isActive: boolean; _count?: { orders: number } }
interface Waiter { id: string; name: string; phone: string | null; code: string | null; isActive: boolean; _count?: { orders: number; tips: number } }
interface OrderItem { id: string; productId: string; product: { id: string; name: string; price: number }; quantity: number; price: number; discount: number; total: number; station: string | null; status: string; specialInstructions: string | null }
interface Order { id: string; orderNo: string; status: string; orderType: string; subtotal: number; total: number; tipAmount: number; discount: number; paymentStatus: string; table?: Table | null; waiter?: Waiter | null; items: OrderItem[]; specialInstructions: string | null; createdAt: string }
interface Reservation { id: string; customerName: string; customerPhone: string | null; date: string; time: string; guests: number; status: string; specialRequests: string | null; table?: Table | null }
interface Recipe { id: string; name: string; yield: string | null; isActive: boolean; product: { id: string; name: string }; ingredients: { id: string; productId: string; product: { id: string; name: string }; quantity: number; unit: string }[] }
interface Delivery { id: string; customerName: string; customerPhone: string; address: string; riderName: string | null; riderPhone: string | null; deliveryFee: number; status: string; order?: { id: string; orderNo: string } | null }
interface Product { id: string; name: string; price: number; quantity: number }
interface DashboardStats { ordersToday: number; openTables: number; occupiedTables: number; kitchenOrders: number; barOrders: number; todaySales: number; avgBill: number; completedCount: number }
interface HappyHourRule { id: string; name: string; productId: string; product: { id: string; name: string }; startTime: string; endTime: string; daysOfWeek: string; discountType: string; discountValue: number; isActive: boolean }
interface ComboMeal { id: string; name: string; description: string | null; price: number; isActive: boolean; items: { id: string; productId: string; product: { id: string; name: string }; quantity: number }[] }
interface Tip { id: string; amount: number; createdAt: string; waiter: { id: string; name: string }; order: { id: string; orderNo: string } | null }

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
  const { toast } = useToast()
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
  const [showHappyHourModal, setShowHappyHourModal] = useState(false)
  const [showComboModal, setShowComboModal] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showEditTableModal, setShowEditTableModal] = useState(false)
  const [showEditWaiterModal, setShowEditWaiterModal] = useState(false)
  const [showEditRecipeModal, setShowEditRecipeModal] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [reservationDateFilter, setReservationDateFilter] = useState('')
  const [happyHours, setHappyHours] = useState<HappyHourRule[]>([])
  const [combos, setCombos] = useState<ComboMeal[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [editingTable, setEditingTable] = useState<Table | null>(null)
  const [editingWaiter, setEditingWaiter] = useState<Waiter | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [splitOrder, setSplitOrder] = useState<Order | null>(null)
  const [moveOrder, setMoveOrder] = useState<Order | null>(null)
  const [completeOrderData, setCompleteOrderData] = useState<Order | null>(null)
  const [mergeTableIds, setMergeTableIds] = useState<string[]>([])
  const [mergePrimaryId, setMergePrimaryId] = useState('')
  const [tableForm, setTableForm] = useState({ name: '', capacity: 4, area: '' })
  const [waiterForm, setWaiterForm] = useState({ name: '', phone: '', code: '' })
  const [editTableForm, setEditTableForm] = useState({ name: '', capacity: 4, area: '', status: 'available', isActive: true })
  const [editWaiterForm, setEditWaiterForm] = useState({ name: '', phone: '', code: '', isActive: true })
  const [reservationForm, setReservationForm] = useState({ customerName: '', customerPhone: '', date: '', time: '', guests: 1, tableId: '', specialRequests: '' })
  const [deliveryForm, setDeliveryForm] = useState({ orderId: '', customerName: '', customerPhone: '', address: '', riderName: '', riderPhone: '', deliveryFee: 0, notes: '' })
  const [orderForm, setOrderForm] = useState({ tableId: '', waiterId: '', orderType: 'dine_in', specialInstructions: '' })
  const [orderItems, setOrderItems] = useState<{ productId: string; quantity: number; station: string }[]>([])
  const [recipeForm, setRecipeForm] = useState({ productId: '', name: '', yield: '', ingredients: [{ productId: '', quantity: 0, unit: 'Piece' }] })
  const [happyHourForm, setHappyHourForm] = useState({ name: '', productId: '', startTime: '16:00', endTime: '18:00', daysOfWeek: '1,2,3,4,5', discountType: 'percentage', discountValue: 20 })
  const [comboForm, setComboForm] = useState({ name: '', description: '', price: 0, items: [{ productId: '', quantity: 1 }] })
  const [completeForm, setCompleteForm] = useState({ paymentMethod: 'cash', discount: 0, tipAmount: 0, tipWaiterId: '' })
  const [splitForm, setSplitForm] = useState<{ itemIds: string[]; paymentMethod: string; tipAmount: number }[]>([])

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

  const fetchHappyHours = useCallback(async () => {
    try { const res = await apiFetch('/api/restaurant/happy-hour'); if (res.ok) setHappyHours(await res.json()) } catch (e) { console.error(e) }
  }, [])

  const fetchCombos = useCallback(async () => {
    try { const res = await apiFetch('/api/restaurant/combos'); if (res.ok) setCombos(await res.json()) } catch (e) { console.error(e) }
  }, [])

  const fetchTips = useCallback(async () => {
    try { const res = await apiFetch('/api/restaurant/tips'); if (res.ok) setTips(await res.json()) } catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    if (tab === 'orders') fetchOrders()
    if (tab === 'kitchen') fetchKitchen()
    if (tab === 'reservations') fetchReservations()
    if (tab === 'recipes') fetchRecipes()
    if (tab === 'delivery') fetchDeliveries()
    if (tab === 'happy-hour') fetchHappyHours()
    if (tab === 'combos') fetchCombos()
    if (tab === 'tips') fetchTips()
  }, [tab, fetchOrders, fetchKitchen, fetchReservations, fetchRecipes, fetchDeliveries, fetchHappyHours, fetchCombos, fetchTips])

  // === Table handlers ===
  const createTable = async () => {
    if (!tableForm.name.trim()) { toast({ variant: 'destructive', title: 'Table name is required' }); return }
    if (tableForm.capacity < 1) { toast({ variant: 'destructive', title: 'Capacity must be at least 1' }); return }
    try { const res = await apiFetch('/api/restaurant/tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tableForm) }); if (res.ok) { toast({ title: 'Table added' }); setShowTableModal(false); setTableForm({ name: '', capacity: 4, area: '' }); fetchData() } else { toast({ variant: 'destructive', title: 'Failed to add table' }) } } catch (e) { toast({ variant: 'destructive', title: 'Failed to add table' }) }
  }
  const deleteTable = async (id: string) => {
    try { const res = await apiFetch(`/api/restaurant/tables/${id}`, { method: 'DELETE' }); if (res.ok) { toast({ title: 'Table deleted' }); fetchData() } } catch (e) { console.error(e) }
  }
  const updateTable = async () => {
    if (!editingTable) return
    if (!editTableForm.name.trim()) { toast({ variant: 'destructive', title: 'Table name is required' }); return }
    if (editTableForm.capacity < 1) { toast({ variant: 'destructive', title: 'Capacity must be at least 1' }); return }
    try { const res = await apiFetch(`/api/restaurant/tables/${editingTable.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editTableForm) }); if (res.ok) { toast({ title: 'Table updated' }); setShowEditTableModal(false); setEditingTable(null); fetchData() } } catch (e) { console.error(e) }
  }
  const mergeTables = async () => {
    if (mergeTableIds.length < 2 || !mergePrimaryId) return toast({ variant: 'destructive', title: 'Select at least 2 tables and a primary' })
    try { const res = await apiFetch('/api/restaurant/tables/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableIds: mergeTableIds, primaryTableId: mergePrimaryId }) }); if (res.ok) { toast({ title: 'Tables merged' }); setShowMergeModal(false); setMergeTableIds([]); setMergePrimaryId(''); fetchData() } } catch (e) { console.error(e) }
  }
  const openEditTable = (t: Table) => { setEditingTable(t); setEditTableForm({ name: t.name, capacity: t.capacity, area: t.area || '', status: t.status, isActive: t.isActive }); setShowEditTableModal(true) }

  // === Waiter handlers ===
  const createWaiter = async () => {
    if (!waiterForm.name.trim()) { toast({ variant: 'destructive', title: 'Waiter name is required' }); return }
    try { const res = await apiFetch('/api/restaurant/waiters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(waiterForm) }); if (res.ok) { toast({ title: 'Waiter added' }); setShowWaiterModal(false); setWaiterForm({ name: '', phone: '', code: '' }); fetchData() } } catch (e) { console.error(e) }
  }
  const deleteWaiter = async (id: string) => {
    try { const res = await apiFetch(`/api/restaurant/waiters/${id}`, { method: 'DELETE' }); if (res.ok) { toast({ title: 'Waiter deleted' }); fetchData() } } catch (e) { console.error(e) }
  }
  const updateWaiter = async () => {
    if (!editingWaiter) return
    if (!editWaiterForm.name.trim()) { toast({ variant: 'destructive', title: 'Waiter name is required' }); return }
    try { const res = await apiFetch(`/api/restaurant/waiters/${editingWaiter.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editWaiterForm) }); if (res.ok) { toast({ title: 'Waiter updated' }); setShowEditWaiterModal(false); setEditingWaiter(null); fetchData() } } catch (e) { console.error(e) }
  }
  const openEditWaiter = (w: Waiter) => { setEditingWaiter(w); setEditWaiterForm({ name: w.name, phone: w.phone || '', code: w.code || '', isActive: w.isActive }); setShowEditWaiterModal(true) }

  // === Order handlers ===
  const createOrder = async () => {
    if (!orderForm.tableId && orderForm.orderType === 'dine_in') { toast({ variant: 'destructive', title: 'Select a table for dine-in orders' }); return }
    if (orderItems.length === 0) { toast({ variant: 'destructive', title: 'Add at least one item to the order' }); return }
    if (orderItems.some(i => !i.productId || i.quantity < 1)) { toast({ variant: 'destructive', title: 'All items must have a product and quantity' }); return }
    try {
      const items = orderItems.map(i => {
        const p = products.find(p => p.id === i.productId)
        return { productId: i.productId, quantity: i.quantity, price: p?.price || 0, station: i.station }
      })
      const res = await apiFetch('/api/restaurant/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...orderForm, items }) })
      if (res.ok) { toast({ title: 'Order created' }); setShowOrderModal(false); setOrderForm({ tableId: '', waiterId: '', orderType: 'dine_in', specialInstructions: '' }); setOrderItems([]); fetchOrders() }
    } catch (e) { console.error(e) }
  }
  const updateOrderStatus = async (id: string, status: string) => {
    try { const res = await apiFetch(`/api/restaurant/orders/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); if (res.ok) { toast({ title: `Order ${status}` }); fetchOrders(); if (tab === 'kitchen') fetchKitchen() } } catch (e) { console.error(e) }
  }
  const completeOrder = async () => {
    if (!completeOrderData) return
    try { const res = await apiFetch(`/api/restaurant/orders/${completeOrderData.id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(completeForm) }); if (res.ok) { toast({ title: 'Order completed & sale created' }); setShowCompleteModal(false); setCompleteOrderData(null); setCompleteForm({ paymentMethod: 'cash', discount: 0, tipAmount: 0, tipWaiterId: '' }); fetchOrders() } } catch (e) { console.error(e) }
  }
  const moveOrderTable = async () => {
    if (!moveOrder) return
    if (!orderForm.tableId) { toast({ variant: 'destructive', title: 'Select a new table' }); return }
    try { const res = await apiFetch(`/api/restaurant/orders/${moveOrder.id}/move`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableId: orderForm.tableId }) }); if (res.ok) { toast({ title: 'Order moved to new table' }); setShowMoveModal(false); setMoveOrder(null); fetchOrders() } } catch (e) { console.error(e) }
  }
  const splitBill = async () => {
    if (!splitOrder) return
    try { const res = await apiFetch(`/api/restaurant/orders/${splitOrder.id}/split`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ splits: splitForm }) }); if (res.ok) { toast({ title: 'Bill split successfully' }); setShowSplitModal(false); setSplitOrder(null); fetchOrders() } } catch (e) { console.error(e) }
  }
  const openCompleteModal = (o: Order) => { setCompleteOrderData(o); setCompleteForm({ paymentMethod: 'cash', discount: 0, tipAmount: 0, tipWaiterId: o.waiter?.id || '' }); setShowCompleteModal(true) }
  const openMoveModal = (o: Order) => { setMoveOrder(o); setOrderForm({ ...orderForm, tableId: '' }); setShowMoveModal(true) }
  const openSplitModal = (o: Order) => { setSplitOrder(o); setSplitForm([{ itemIds: [], paymentMethod: 'cash', tipAmount: 0 }]); setShowSplitModal(true) }
  const updateItemStatus = async (orderId: string, itemId: string, status: string) => {
    try { await apiFetch(`/api/restaurant/orders/${orderId}/items/${itemId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); fetchKitchen() } catch (e) { console.error(e) }
  }

  // === Reservation handlers ===
  const createReservation = async () => {
    if (!reservationForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    if (!reservationForm.customerPhone.trim()) { toast({ variant: 'destructive', title: 'Customer phone is required' }); return }
    if (!reservationForm.date) { toast({ variant: 'destructive', title: 'Date is required' }); return }
    if (!reservationForm.time) { toast({ variant: 'destructive', title: 'Time is required' }); return }
    if (reservationForm.guests < 1) { toast({ variant: 'destructive', title: 'Guests must be at least 1' }); return }
    try { const res = await apiFetch('/api/restaurant/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reservationForm) }); if (res.ok) { toast({ title: 'Reservation created' }); setShowReservationModal(false); setReservationForm({ customerName: '', customerPhone: '', date: '', time: '', guests: 1, tableId: '', specialRequests: '' }); fetchReservations() } } catch (e) { console.error(e) }
  }
  const updateReservationStatus = async (id: string, status: string) => {
    try { const res = await apiFetch(`/api/restaurant/reservations/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); if (res.ok) { toast({ title: `Reservation ${status}` }); fetchReservations() } } catch (e) { console.error(e) }
  }
  const deleteReservation = async (id: string) => {
    try { const res = await apiFetch(`/api/restaurant/reservations/${id}`, { method: 'DELETE' }); if (res.ok) { toast({ title: 'Reservation deleted' }); fetchReservations() } } catch (e) { console.error(e) }
  }

  // === Recipe handlers ===
  const createRecipe = async () => {
    if (!recipeForm.productId) { toast({ variant: 'destructive', title: 'Select a product for this recipe' }); return }
    if (!recipeForm.name.trim()) { toast({ variant: 'destructive', title: 'Recipe name is required' }); return }
    if (recipeForm.ingredients.length === 0 || recipeForm.ingredients.some(i => !i.productId || i.quantity < 1)) { toast({ variant: 'destructive', title: 'Add at least one valid ingredient' }); return }
    try { const res = await apiFetch('/api/restaurant/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipeForm) }); if (res.ok) { toast({ title: 'Recipe created' }); setShowRecipeModal(false); setRecipeForm({ productId: '', name: '', yield: '', ingredients: [{ productId: '', quantity: 0, unit: 'Piece' }] }); fetchRecipes() } } catch (e) { console.error(e) }
  }
  const deleteRecipe = async (id: string) => {
    try { const res = await apiFetch(`/api/restaurant/recipes/${id}`, { method: 'DELETE' }); if (res.ok) { toast({ title: 'Recipe deleted' }); fetchRecipes() } } catch (e) { console.error(e) }
  }
  const updateRecipe = async () => {
    if (!editingRecipe) return
    if (!recipeForm.productId) { toast({ variant: 'destructive', title: 'Select a product for this recipe' }); return }
    if (!recipeForm.name.trim()) { toast({ variant: 'destructive', title: 'Recipe name is required' }); return }
    if (recipeForm.ingredients.length === 0 || recipeForm.ingredients.some(i => !i.productId || i.quantity < 1)) { toast({ variant: 'destructive', title: 'Add at least one valid ingredient' }); return }
    try { const res = await apiFetch(`/api/restaurant/recipes/${editingRecipe.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipeForm) }); if (res.ok) { toast({ title: 'Recipe updated' }); setShowEditRecipeModal(false); setEditingRecipe(null); setRecipeForm({ productId: '', name: '', yield: '', ingredients: [{ productId: '', quantity: 0, unit: 'Piece' }] }); fetchRecipes() } } catch (e) { console.error(e) }
  }
  const openEditRecipe = (r: Recipe) => { setEditingRecipe(r); setRecipeForm({ productId: r.product.id, name: r.name, yield: r.yield || '', ingredients: r.ingredients.map(i => ({ productId: i.productId, quantity: i.quantity, unit: i.unit })) }); setShowEditRecipeModal(true) }

  // === Delivery handlers ===
  const createDelivery = async () => {
    if (!deliveryForm.customerName.trim()) { toast({ variant: 'destructive', title: 'Customer name is required' }); return }
    if (!deliveryForm.customerPhone.trim()) { toast({ variant: 'destructive', title: 'Customer phone is required' }); return }
    if (!deliveryForm.address.trim()) { toast({ variant: 'destructive', title: 'Delivery address is required' }); return }
    try { const res = await apiFetch('/api/restaurant/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deliveryForm) }); if (res.ok) { toast({ title: 'Delivery created' }); setShowDeliveryModal(false); setDeliveryForm({ orderId: '', customerName: '', customerPhone: '', address: '', riderName: '', riderPhone: '', deliveryFee: 0, notes: '' }); fetchDeliveries() } } catch (e) { console.error(e) }
  }
  const updateDeliveryStatus = async (id: string, status: string) => {
    try { const res = await apiFetch(`/api/restaurant/deliveries/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); if (res.ok) { toast({ title: `Delivery ${status}` }); fetchDeliveries() } } catch (e) { console.error(e) }
  }

  // === Happy Hour handlers ===
  const createHappyHour = async () => {
    if (!happyHourForm.name.trim()) { toast({ variant: 'destructive', title: 'Rule name is required' }); return }
    if (!happyHourForm.productId) { toast({ variant: 'destructive', title: 'Select a product' }); return }
    if (!happyHourForm.startTime || !happyHourForm.endTime) { toast({ variant: 'destructive', title: 'Start and end times are required' }); return }
    if (happyHourForm.discountValue <= 0) { toast({ variant: 'destructive', title: 'Discount value must be greater than 0' }); return }
    try { const res = await apiFetch('/api/restaurant/happy-hour', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(happyHourForm) }); if (res.ok) { toast({ title: 'Happy hour rule created' }); setShowHappyHourModal(false); setHappyHourForm({ name: '', productId: '', startTime: '16:00', endTime: '18:00', daysOfWeek: '1,2,3,4,5', discountType: 'percentage', discountValue: 20 }); fetchHappyHours() } } catch (e) { console.error(e) }
  }
  const updateHappyHour = async (id: string, data: Partial<HappyHourRule>) => {
    try { const res = await apiFetch(`/api/restaurant/happy-hour/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (res.ok) { toast({ title: 'Happy hour rule updated' }); fetchHappyHours() } } catch (e) { console.error(e) }
  }
  const deleteHappyHour = async (id: string) => {
    try { const res = await apiFetch(`/api/restaurant/happy-hour/${id}`, { method: 'DELETE' }); if (res.ok) { toast({ title: 'Happy hour rule deleted' }); fetchHappyHours() } } catch (e) { console.error(e) }
  }

  // === Combo handlers ===
  const createCombo = async () => {
    if (!comboForm.name.trim()) { toast({ variant: 'destructive', title: 'Combo name is required' }); return }
    if (comboForm.price <= 0) { toast({ variant: 'destructive', title: 'Price must be greater than 0' }); return }
    if (comboForm.items.length === 0 || comboForm.items.some(i => !i.productId || i.quantity < 1)) { toast({ variant: 'destructive', title: 'Add at least one valid item' }); return }
    try { const res = await apiFetch('/api/restaurant/combos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(comboForm) }); if (res.ok) { toast({ title: 'Combo meal created' }); setShowComboModal(false); setComboForm({ name: '', description: '', price: 0, items: [{ productId: '', quantity: 1 }] }); fetchCombos() } } catch (e) { console.error(e) }
  }
  const updateCombo = async (id: string, data: any) => {
    try { const res = await apiFetch(`/api/restaurant/combos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (res.ok) { toast({ title: 'Combo meal updated' }); fetchCombos() } } catch (e) { console.error(e) }
  }
  const deleteCombo = async (id: string) => {
    try { const res = await apiFetch(`/api/restaurant/combos/${id}`, { method: 'DELETE' }); if (res.ok) { toast({ title: 'Combo meal deleted' }); fetchCombos() } } catch (e) { console.error(e) }
  }

  // === Filtered data ===
  const filteredOrders = useMemo(() => orders.filter(o => {
    if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false
    if (searchQuery && !o.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) && !o.items.some(i => i.product.name.toLowerCase().includes(searchQuery.toLowerCase()))) return false
    return true
  }), [orders, orderStatusFilter, searchQuery])

  const { paginatedItems: paginatedOrders, currentPage: ordersPage, totalPages: ordersTotalPages, totalItems: ordersTotal, goToPage: ordersGoToPage } = usePagination(filteredOrders, 8)

  const filteredReservations = useMemo(() => reservations.filter(r => {
    if (reservationDateFilter && r.date !== reservationDateFilter) return false
    return true
  }), [reservations, reservationDateFilter])

  const totalTips = useMemo(() => tips.reduce((sum, t) => sum + t.amount, 0), [tips])

  const addOrderItem = () => setOrderItems([...orderItems, { productId: '', quantity: 1, station: 'kitchen' }])
  const updateOrderItem = (idx: number, field: string, value: string) => setOrderItems(orderItems.map((i, x) => x === idx ? { ...i, [field]: value } : i))
  const removeOrderItem = (idx: number) => setOrderItems(orderItems.filter((_, x) => x !== idx))
  const addRecipeIngredient = () => setRecipeForm({ ...recipeForm, ingredients: [...recipeForm.ingredients, { productId: '', quantity: 0, unit: 'Piece' }] })
  const updateRecipeIngredient = (idx: number, field: string, value: string) => setRecipeForm({ ...recipeForm, ingredients: recipeForm.ingredients.map((i, x) => x === idx ? { ...i, [field]: field === 'quantity' ? Number(value) : value } : i) })
  const removeRecipeIngredient = (idx: number) => setRecipeForm({ ...recipeForm, ingredients: recipeForm.ingredients.filter((_, x) => x !== idx) })
  const addComboItem = () => setComboForm({ ...comboForm, items: [...comboForm.items, { productId: '', quantity: 1 }] })
  const updateComboItem = (idx: number, field: string, value: string) => setComboForm({ ...comboForm, items: comboForm.items.map((i, x) => x === idx ? { ...i, [field]: field === 'quantity' ? Number(value) : value } : i) })
  const removeComboItem = (idx: number) => setComboForm({ ...comboForm, items: comboForm.items.filter((_, x) => x !== idx) })
  const toggleSplitItem = (splitIdx: number, itemId: string) => setSplitForm(splitForm.map((s, i) => i === splitIdx ? { ...s, itemIds: s.itemIds.includes(itemId) ? s.itemIds.filter(id => id !== itemId) : [...s.itemIds, itemId] } : s))
  const addSplitGroup = () => setSplitForm([...splitForm, { itemIds: [], paymentMethod: 'cash', tipAmount: 0 }])

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
          <TabsTrigger value="happy-hour"><Timer className="h-3 w-3 mr-1" /> Happy Hour</TabsTrigger>
          <TabsTrigger value="combos"><Tag className="h-3 w-3 mr-1" /> Combos</TabsTrigger>
          <TabsTrigger value="tips"><DollarSign className="h-3 w-3 mr-1" /> Tips</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard">
        </TabsContent>

        {/* Tables */}
        <TabsContent value="tables">
          <div className="flex justify-between mb-4">
            <Button variant="outline" onClick={() => setShowMergeModal(true)} disabled={tables.length < 2}><Merge className="h-4 w-4 mr-1" /> Merge Tables</Button>
            <Button onClick={() => setShowTableModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Table</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {tables.map(t => (
              <Card key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2"><Table2 className="h-4 w-4" /> {t.name}</span><Badge className={statusColors[t.status]}>{t.status}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">Capacity: {t.capacity} {t.area && `· ${t.area}`}</div>
                  <div className="text-xs text-muted-foreground mt-1">Orders: {t._count?.orders ?? 0}</div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => openEditTable(t)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteTable(t.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {tables.length === 0 && <div className="text-center text-muted-foreground py-8">No tables yet. Add your first table.</div>}
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by order no or item..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="served">Served</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowOrderModal(true)}><Plus className="h-4 w-4 mr-1" /> New Order</Button>
          </div>
          <div className="space-y-3">
            {paginatedOrders.map(o => (
              <Card key={o.id}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2">{o.orderNo} {o.table && <Badge variant="outline">{o.table.name}</Badge>} {o.waiter && <Badge variant="secondary">{o.waiter.name}</Badge>}</span><div className="flex items-center gap-2"><Badge className={statusColors[o.status]}>{o.status}</Badge><Badge variant="outline">{o.orderType}</Badge></div></CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1 mb-3">{o.items.map(i => <div key={i.id} className="flex justify-between text-sm"><span>{i.quantity}× {i.product.name} {i.station && <Badge variant="outline" className="text-xs ml-1">{i.station}</Badge>}</span><span>{i.total.toLocaleString()}</span></div>)}</div>
                  <div className="flex justify-between font-medium border-t pt-2"><span>Subtotal</span><span>{o.subtotal.toLocaleString()}</span></div>
                  {o.discount > 0 && <div className="flex justify-between text-sm text-red-600"><span>Discount</span><span>-{o.discount.toLocaleString()}</span></div>}
                  {o.tipAmount > 0 && <div className="flex justify-between text-sm"><span>Tip</span><span>{o.tipAmount.toLocaleString()}</span></div>}
                  <div className="flex justify-between font-medium border-t pt-2 mt-1"><span>Total</span><span>{o.total.toLocaleString()}</span></div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {o.status === 'pending' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'preparing')}>Start Preparing</Button>}
                    {o.status === 'preparing' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'ready')}>Mark Ready</Button>}
                    {o.status === 'ready' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'served')}>Mark Served</Button>}
                    {o.status === 'served' && <Button size="sm" onClick={() => openCompleteModal(o)}><CheckCircle className="h-3 w-3 mr-1" /> Complete & Pay</Button>}
                    {o.status === 'served' && <Button size="sm" variant="outline" onClick={() => openSplitModal(o)}><Split className="h-3 w-3 mr-1" /> Split Bill</Button>}
                    {o.status !== 'completed' && o.status !== 'cancelled' && o.table && <Button size="sm" variant="outline" onClick={() => openMoveModal(o)}><ArrowRightLeft className="h-3 w-3 mr-1" /> Move Table</Button>}
                    {o.status !== 'completed' && o.status !== 'cancelled' && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => updateOrderStatus(o.id, 'cancelled')}>Cancel</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredOrders.length === 0 && <div className="text-center text-muted-foreground py-8">No orders found.</div>}
          {ordersTotal > 8 && <Pagination currentPage={ordersPage} totalPages={ordersTotalPages} onPageChange={ordersGoToPage} totalItems={ordersTotal} />}
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
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input type="date" value={reservationDateFilter} onChange={e => setReservationDateFilter(e.target.value)} className="sm:w-[180px]" />
            <div className="flex-1" />
            <Button onClick={() => setShowReservationModal(true)}><Plus className="h-4 w-4 mr-1" /> New Reservation</Button>
          </div>
          <div className="space-y-3">
            {filteredReservations.map(r => (
              <Card key={r.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><div className="font-medium">{r.customerName} {r.customerPhone && <span className="text-muted-foreground">· {r.customerPhone}</span>}</div><div className="text-sm text-muted-foreground">{new Date(r.date).toLocaleDateString()} at {r.time} · {r.guests} guests {r.table && `· ${r.table.name}`}</div>{r.specialRequests && <div className="text-sm text-orange-600 mt-1">⚠ {r.specialRequests}</div>}</div>
                    <div className="flex items-center gap-2"><Badge className={statusColors[r.status]}>{r.status}</Badge>
                      {r.status === 'reserved' && <Button size="sm" onClick={() => updateReservationStatus(r.id, 'checked_in')}>Check In</Button>}
                      {r.status === 'checked_in' && <Button size="sm" onClick={() => updateReservationStatus(r.id, 'completed')}>Complete</Button>}
                      {r.status !== 'cancelled' && r.status !== 'completed' && <Button size="sm" variant="outline" onClick={() => updateReservationStatus(r.id, 'cancelled')}>Cancel</Button>}
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteReservation(r.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredReservations.length === 0 && <div className="text-center text-muted-foreground py-8">No reservations found.</div>}
        </TabsContent>

        {/* Recipes */}
        <TabsContent value="recipes">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowRecipeModal(true)}><Plus className="h-4 w-4 mr-1" /> New Recipe</Button></div>
          <div className="space-y-3">
            {recipes.map(r => (
              <Card key={r.id}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2">{r.name} <Badge variant="outline">{r.product.name}</Badge>{!r.isActive && <Badge variant="secondary">Inactive</Badge>}</span><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => openEditRecipe(r)}><Pencil className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteRecipe(r.id)}><Trash2 className="h-3 w-3" /></Button></div></CardTitle></CardHeader>
                <CardContent><div className="text-sm space-y-1">{r.ingredients.map(i => <div key={i.id} className="flex justify-between"><span>{i.product.name}</span><span className="text-muted-foreground">{i.quantity} {i.unit}</span></div>)}</div>{r.yield && <div className="text-xs text-muted-foreground mt-2">Yield: {r.yield}</div>}</CardContent>
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
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Users className="h-4 w-4" /> {w.name}</span><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => openEditWaiter(w)}><Pencil className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteWaiter(w.id)}><Trash2 className="h-3 w-3" /></Button></div></CardTitle></CardHeader>
                <CardContent><div className="text-sm text-muted-foreground">{w.phone || 'No phone'} {w.code && `· Code: ${w.code}`}</div><div className="text-sm mt-1">Orders: {w._count?.orders ?? 0} · Tips: {w._count?.tips ?? 0}</div></CardContent>
              </Card>
            ))}
          </div>
          {waiters.length === 0 && <div className="text-center text-muted-foreground py-8">No waiters yet.</div>}
        </TabsContent>

        {/* Happy Hour */}
        <TabsContent value="happy-hour">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowHappyHourModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Rule</Button></div>
          <div className="space-y-3">
            {happyHours.map(h => (
              <Card key={h.id} className={h.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Timer className="h-4 w-4" /> {h.name} <Badge variant="outline">{h.product.name}</Badge></span><Badge className={h.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>{h.isActive ? 'Active' : 'Inactive'}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">{h.startTime} - {h.endTime} · Days: {h.daysOfWeek} · {h.discountType === 'percentage' ? `${h.discountValue}%` : h.discountValue} off</div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => updateHappyHour(h.id, { isActive: !h.isActive })}>{h.isActive ? 'Disable' : 'Enable'}</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteHappyHour(h.id)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {happyHours.length === 0 && <div className="text-center text-muted-foreground py-8">No happy hour rules yet. Create time-based discounts for products.</div>}
        </TabsContent>

        {/* Combos */}
        <TabsContent value="combos">
          <div className="flex justify-end mb-4"><Button onClick={() => setShowComboModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Combo</Button></div>
          <div className="grid gap-4 md:grid-cols-2">
            {combos.map(c => (
              <Card key={c.id} className={c.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Tag className="h-4 w-4" /> {c.name}</span><Badge className={c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></CardTitle></CardHeader>
                <CardContent>
                  {c.description && <p className="text-sm text-muted-foreground mb-2">{c.description}</p>}
                  <div className="text-sm space-y-1 mb-2">{c.items.map(i => <div key={i.id} className="flex justify-between"><span>{i.quantity}× {i.product.name}</span></div>)}</div>
                  <div className="flex justify-between font-medium border-t pt-2"><span>Combo Price</span><span>{c.price.toLocaleString()}</span></div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => updateCombo(c.id, { isActive: !c.isActive, name: c.name, description: c.description, price: c.price, items: c.items.map(i => ({ productId: i.productId, quantity: i.quantity })) })}>{c.isActive ? 'Disable' : 'Enable'}</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteCombo(c.id)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {combos.length === 0 && <div className="text-center text-muted-foreground py-8">No combo meals yet. Create bundled meal deals.</div>}
        </TabsContent>

        {/* Tips */}
        <TabsContent value="tips">
          <div className="space-y-3">
            {tips.map(t => (
              <Card key={t.id}>
                <CardContent className="pt-4 flex items-center justify-between">
                  <div><div className="font-medium flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600" /> {t.amount.toLocaleString()}</div><div className="text-sm text-muted-foreground">{t.waiter.name} {t.order && `· ${t.order.orderNo}`} · {new Date(t.createdAt).toLocaleString()}</div></div>
                  <Badge variant="secondary">Tip</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
          {tips.length === 0 && <div className="text-center text-muted-foreground py-8">No tips recorded yet. Tips are added when completing orders.</div>}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={reservationForm.date} onChange={e => setReservationForm({ ...reservationForm, date: e.target.value })} /></div>
              <div><Label>Time</Label><Input type="time" value={reservationForm.time} onChange={e => setReservationForm({ ...reservationForm, time: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Rider Name</Label><Input value={deliveryForm.riderName} onChange={e => setDeliveryForm({ ...deliveryForm, riderName: e.target.value })} /></div>
              <div><Label>Rider Phone</Label><Input value={deliveryForm.riderPhone} onChange={e => setDeliveryForm({ ...deliveryForm, riderPhone: e.target.value })} /></div>
            </div>
            <div><Label>Delivery Fee</Label><Input type="number" value={deliveryForm.deliveryFee} onChange={e => setDeliveryForm({ ...deliveryForm, deliveryFee: Number(e.target.value) })} /></div>
            <div><Label>Notes</Label><Input value={deliveryForm.notes} onChange={e => setDeliveryForm({ ...deliveryForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowDeliveryModal(false)}>Cancel</Button><Button onClick={createDelivery}>Create Delivery</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Table Modal */}
      <Dialog open={showEditTableModal} onOpenChange={setShowEditTableModal}>
        <DialogContent><DialogHeader><DialogTitle>Edit Table</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={editTableForm.name} onChange={e => setEditTableForm({ ...editTableForm, name: e.target.value })} /></div>
            <div><Label>Capacity</Label><Input type="number" value={editTableForm.capacity} onChange={e => setEditTableForm({ ...editTableForm, capacity: Number(e.target.value) })} /></div>
            <div><Label>Area</Label><Input value={editTableForm.area} onChange={e => setEditTableForm({ ...editTableForm, area: e.target.value })} /></div>
            <div><Label>Status</Label><Select value={editTableForm.status} onValueChange={v => setEditTableForm({ ...editTableForm, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="occupied">Occupied</SelectItem><SelectItem value="reserved">Reserved</SelectItem><SelectItem value="cleaning">Cleaning</SelectItem></SelectContent></Select></div>
            <div className="flex items-center gap-2"><Label>Active</Label><Switch checked={editTableForm.isActive} onCheckedChange={v => setEditTableForm({ ...editTableForm, isActive: v })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowEditTableModal(false)}>Cancel</Button><Button onClick={updateTable}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Waiter Modal */}
      <Dialog open={showEditWaiterModal} onOpenChange={setShowEditWaiterModal}>
        <DialogContent><DialogHeader><DialogTitle>Edit Waiter</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={editWaiterForm.name} onChange={e => setEditWaiterForm({ ...editWaiterForm, name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={editWaiterForm.phone} onChange={e => setEditWaiterForm({ ...editWaiterForm, phone: e.target.value })} /></div>
            <div><Label>Code</Label><Input value={editWaiterForm.code} onChange={e => setEditWaiterForm({ ...editWaiterForm, code: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Label>Active</Label><Switch checked={editWaiterForm.isActive} onCheckedChange={v => setEditWaiterForm({ ...editWaiterForm, isActive: v })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowEditWaiterModal(false)}>Cancel</Button><Button onClick={updateWaiter}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Recipe Modal */}
      <Dialog open={showEditRecipeModal} onOpenChange={setShowEditRecipeModal}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Edit Recipe</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div><Label>Recipe Name</Label><Input value={recipeForm.name} onChange={e => setRecipeForm({ ...recipeForm, name: e.target.value })} /></div>
            <div><Label>Yield</Label><Input value={recipeForm.yield} onChange={e => setRecipeForm({ ...recipeForm, yield: e.target.value })} /></div>
            <div><Label>Ingredients</Label>
              <div className="space-y-2">{recipeForm.ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Select value={ing.productId} onValueChange={v => updateRecipeIngredient(idx, 'productId', v)}><SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="col-span-3"><Input type="number" step="0.01" value={ing.quantity} onChange={e => updateRecipeIngredient(idx, 'quantity', e.target.value)} /></div>
                  <div className="col-span-2"><Input value={ing.unit} onChange={e => updateRecipeIngredient(idx, 'unit', e.target.value)} /></div>
                  <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeRecipeIngredient(idx)}>✕</Button></div>
                </div>
              ))}</div>
              <Button size="sm" variant="outline" onClick={addRecipeIngredient} className="mt-2"><Plus className="h-3 w-3 mr-1" /> Add Ingredient</Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowEditRecipeModal(false)}>Cancel</Button><Button onClick={updateRecipe}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Tables Modal */}
      <Dialog open={showMergeModal} onOpenChange={setShowMergeModal}>
        <DialogContent><DialogHeader><DialogTitle>Merge Tables</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select tables to merge. The primary table will absorb the others.</p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {tables.filter(t => t.isActive).map(t => (
                <div key={t.id} className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer ${mergeTableIds.includes(t.id) ? 'border-primary bg-primary/5' : ''}`} onClick={() => setMergeTableIds(mergeTableIds.includes(t.id) ? mergeTableIds.filter(id => id !== t.id) : [...mergeTableIds, t.id])}>
                  <input type="checkbox" checked={mergeTableIds.includes(t.id)} readOnly />
                  <Table2 className="h-4 w-4" />
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">Capacity: {t.capacity}</span>
                </div>
              ))}
            </div>
            {mergeTableIds.length >= 2 && (
              <div><Label>Primary Table</Label><Select value={mergePrimaryId} onValueChange={setMergePrimaryId}><SelectTrigger><SelectValue placeholder="Select primary table" /></SelectTrigger><SelectContent>{mergeTableIds.map(id => { const t = tables.find(t => t.id === id); return t ? <SelectItem key={id} value={id}>{t.name}</SelectItem> : null })}</SelectContent></Select></div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setShowMergeModal(false); setMergeTableIds([]); setMergePrimaryId('') }}>Cancel</Button><Button onClick={mergeTables}><Merge className="h-4 w-4 mr-1" /> Merge</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Order Modal */}
      <Dialog open={showCompleteModal} onOpenChange={setShowCompleteModal}>
        <DialogContent><DialogHeader><DialogTitle>Complete Order {completeOrderData?.orderNo}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Payment Method</Label><Select value={completeForm.paymentMethod} onValueChange={v => setCompleteForm({ ...completeForm, paymentMethod: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="wallet">Wallet</SelectItem></SelectContent></Select></div>
            <div><Label>Discount</Label><Input type="number" value={completeForm.discount} onChange={e => setCompleteForm({ ...completeForm, discount: Number(e.target.value) })} /></div>
            <div><Label>Tip Amount</Label><Input type="number" value={completeForm.tipAmount} onChange={e => setCompleteForm({ ...completeForm, tipAmount: Number(e.target.value) })} /></div>
            {completeForm.tipAmount > 0 && (
              <div><Label>Tip Waiter</Label><Select value={completeForm.tipWaiterId} onValueChange={v => setCompleteForm({ ...completeForm, tipWaiterId: v })}><SelectTrigger><SelectValue placeholder="Assign tip to waiter" /></SelectTrigger><SelectContent>{waiters.filter(w => w.isActive).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>
            )}
            <div className="rounded-lg bg-muted p-3 text-sm"><div className="flex justify-between"><span>Order Total</span><span className="font-bold">{completeOrderData?.total.toLocaleString()}</span></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCompleteModal(false)}>Cancel</Button><Button onClick={completeOrder}><CheckCircle className="h-4 w-4 mr-1" /> Complete & Create Sale</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Order Modal */}
      <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
        <DialogContent><DialogHeader><DialogTitle>Move Order {moveOrder?.orderNo}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Current table: {moveOrder?.table?.name || 'None'}</p>
            <div><Label>New Table</Label><Select value={orderForm.tableId} onValueChange={v => setOrderForm({ ...orderForm, tableId: v })}><SelectTrigger><SelectValue placeholder="Select new table" /></SelectTrigger><SelectContent>{tables.filter(t => t.isActive && t.id !== moveOrder?.table?.id).map(t => <SelectItem key={t.id} value={t.id}>{t.name} (Cap: {t.capacity})</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowMoveModal(false)}>Cancel</Button><Button onClick={moveOrderTable}><ArrowRightLeft className="h-4 w-4 mr-1" /> Move Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split Bill Modal */}
      <Dialog open={showSplitModal} onOpenChange={setShowSplitModal}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Split Bill {splitOrder?.orderNo}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground">Select which items go to each split group. Each group becomes a separate sale.</p>
            {splitForm.map((split, sIdx) => (
              <div key={sIdx} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between"><span className="font-medium text-sm">Split Group {sIdx + 1}</span>{splitForm.length > 1 && <Button size="sm" variant="ghost" onClick={() => setSplitForm(splitForm.filter((_, i) => i !== sIdx))}><Trash2 className="h-3 w-3" /></Button>}</div>
                <div className="space-y-1">{splitOrder?.items.map(i => (
                  <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={split.itemIds.includes(i.id)} onChange={() => toggleSplitItem(sIdx, i.id)} />
                    <span>{i.quantity}× {i.product.name}</span>
                    <span className="text-muted-foreground ml-auto">{i.total.toLocaleString()}</span>
                  </label>
                ))}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><Label className="text-xs">Payment</Label><Select value={split.paymentMethod} onValueChange={v => setSplitForm(splitForm.map((s, i) => i === sIdx ? { ...s, paymentMethod: v } : s))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-xs">Tip</Label><Input type="number" value={split.tipAmount} onChange={e => setSplitForm(splitForm.map((s, i) => i === sIdx ? { ...s, tipAmount: Number(e.target.value) } : s))} /></div>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addSplitGroup}><Plus className="h-3 w-3 mr-1" /> Add Split Group</Button>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowSplitModal(false)}>Cancel</Button><Button onClick={splitBill}><Split className="h-4 w-4 mr-1" /> Split Bill</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Happy Hour Modal */}
      <Dialog open={showHappyHourModal} onOpenChange={setShowHappyHourModal}>
        <DialogContent><DialogHeader><DialogTitle>Add Happy Hour Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Rule Name</Label><Input value={happyHourForm.name} onChange={e => setHappyHourForm({ ...happyHourForm, name: e.target.value })} placeholder="Friday Cocktails 50% off" /></div>
            <div><Label>Product</Label><Select value={happyHourForm.productId} onValueChange={v => setHappyHourForm({ ...happyHourForm, productId: v })}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Start Time</Label><Input type="time" value={happyHourForm.startTime} onChange={e => setHappyHourForm({ ...happyHourForm, startTime: e.target.value })} /></div>
              <div><Label>End Time</Label><Input type="time" value={happyHourForm.endTime} onChange={e => setHappyHourForm({ ...happyHourForm, endTime: e.target.value })} /></div>
            </div>
            <div><Label>Days of Week</Label><Input value={happyHourForm.daysOfWeek} onChange={e => setHappyHourForm({ ...happyHourForm, daysOfWeek: e.target.value })} placeholder="1,2,3,4,5 (Mon-Fri)" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Discount Type</Label><Select value={happyHourForm.discountType} onValueChange={v => setHappyHourForm({ ...happyHourForm, discountType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed Amount</SelectItem></SelectContent></Select></div>
              <div><Label>Discount Value</Label><Input type="number" value={happyHourForm.discountValue} onChange={e => setHappyHourForm({ ...happyHourForm, discountValue: Number(e.target.value) })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowHappyHourModal(false)}>Cancel</Button><Button onClick={createHappyHour}>Create Rule</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Combo Modal */}
      <Dialog open={showComboModal} onOpenChange={setShowComboModal}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Add Combo Meal</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div><Label>Combo Name</Label><Input value={comboForm.name} onChange={e => setComboForm({ ...comboForm, name: e.target.value })} placeholder="Lunch Special" /></div>
            <div><Label>Description</Label><Input value={comboForm.description} onChange={e => setComboForm({ ...comboForm, description: e.target.value })} placeholder="Burger + fries + drink" /></div>
            <div><Label>Combo Price</Label><Input type="number" value={comboForm.price} onChange={e => setComboForm({ ...comboForm, price: Number(e.target.value) })} /></div>
            <div><Label>Items</Label>
              <div className="space-y-2">{comboForm.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-8"><Select value={item.productId} onValueChange={v => updateComboItem(idx, 'productId', v)}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="col-span-3"><Input type="number" min={1} value={item.quantity} onChange={e => updateComboItem(idx, 'quantity', e.target.value)} /></div>
                  <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeComboItem(idx)}>✕</Button></div>
                </div>
              ))}</div>
              <Button size="sm" variant="outline" onClick={addComboItem} className="mt-2"><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowComboModal(false)}>Cancel</Button><Button onClick={createCombo}>Create Combo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
