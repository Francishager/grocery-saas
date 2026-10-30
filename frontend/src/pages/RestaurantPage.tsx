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
import { UtensilsCrossed, Plus, Trash2, Users, Table2, ChefHat, CalendarClock, Beaker, Bike, Clock, TrendingUp, ArrowRightLeft, CheckCircle, XCircle, AlertCircle, Search, Pencil, Merge, Split, DollarSign, Star, Tag, Wine, Timer, Edit, Eye, ImagePlus, Printer, Package, RefreshCw } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useFeatureAccess } from '@/services/featureAccessService'
import { getLocalProducts } from '@/db/hybrid'
import { db } from '@/db/index'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'
import { discoverPrintAgent, getPrintAgentPrinters, printReceiptViaAgent, type PrintAgentPrinter } from '@/lib/printAgent'
import { hasNativePrinterBridge, listNativePrinters, printWithNativePrinter } from '@/lib/nativePrinter'

interface Table { id: string; name: string; capacity: number; status: string; area: string | null; isActive: boolean; _count?: { orders: number } }
interface Waiter { id: string; name: string; phone: string | null; code: string | null; isActive: boolean; employeeId?: string | null; hasPin?: boolean; _count?: { orders: number; tips: number } }
interface HrWaiterEmployee { id: string; firstName: string; middleName?: string | null; lastName: string; phone?: string | null; employeeNumber?: string | null; branchId?: string | null }
interface OrderItem { id: string; productId: string; product: { id: string; name: string; price: number }; quantity: number; price: number; discount: number; total: number; station: string | null; status: string; specialInstructions: string | null }
interface Order { id: string; orderNo: string; status: string; orderType: string; subtotal: number; total: number; tipAmount: number; discount: number; paymentStatus: string; table?: Table | null; waiter?: Waiter | null; user?: { fname?: string | null; lname?: string | null } | null; items: OrderItem[]; specialInstructions: string | null; createdAt: string }
interface Reservation { id: string; customerName: string; customerPhone: string | null; date: string; time: string; guests: number; status: string; specialRequests: string | null; table?: Table | null }
interface Recipe { id: string; name: string; yield: string | null; isActive: boolean; product: { id: string; name: string }; ingredients: { id: string; productId: string; product: { id: string; name: string }; quantity: number; unit: string }[] }
interface Delivery { id: string; customerName: string; customerPhone: string; address: string; riderName: string | null; riderPhone: string | null; deliveryFee: number; status: string; order?: { id: string; orderNo: string } | null }
interface Product { id: string; name: string; price: number; quantity: number; image?: string | null; itemType?: string; minStock?: number; baseUnit?: string; expiryDate?: string | null; branchId?: string | null; cost?: number | null }
interface RestaurantMenuEntry { id: string; productId: string; category: string; description: string | null; station: string; price: number; isAvailable: boolean; sortOrder: number; product: Product & { category?: { id: string; name: string } | null } }
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
  const navigate = useNavigate()
  const { tab: routeTab } = useParams()
  const { hasPermission } = useAuth()
  const { hasFeature } = useFeatureAccess()
  const canViewRestaurant = hasPermission('canViewRestaurant')
  const canCreateRestaurant = hasPermission('canCreateRestaurant')
  const canEditRestaurant = hasPermission('canEditRestaurant')
  const canDeleteRestaurant = hasPermission('canDeleteRestaurant')
  const canAdjustStock = hasPermission('canAdjustStock')
  const canLinkWaiterToHr = hasFeature('hr') && ['canViewHR', 'canCreateHREmployee', 'canEditHREmployee'].some(hasPermission)
  const [tab, setActiveTab] = useState(routeTab || 'dashboard')
  const setTab = (nextTab: string) => {
    setActiveTab(nextTab)
    if (routeTab !== nextTab) navigate(`/tenant/restaurant/${nextTab}`)
  }
  const [tables, setTables] = useState<Table[]>([])
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [hrWaiterEmployees, setHrWaiterEmployees] = useState<HrWaiterEmployee[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([])
  const [barOrders, setBarOrders] = useState<Order[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [menuEntries, setMenuEntries] = useState<RestaurantMenuEntry[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activeWaiterId, setActiveWaiterId] = useState(() => sessionStorage.getItem('restaurant.activeWaiterId') || '')
  const [waiterSessionToken, setWaiterSessionToken] = useState(() => sessionStorage.getItem('restaurant.waiterSessionToken') || '')
  const [waiterKioskMode, setWaiterKioskMode] = useState(() => sessionStorage.getItem('restaurant.waiterKioskMode') === 'true')
  const requiresWaiterIdentity = waiters.some(waiter => waiter.isActive)
  const waiterIdentityConfirmed = Boolean(activeWaiterId && waiterSessionToken)
  const waiterMode = waiterKioskMode || waiterIdentityConfirmed
  const canStartOrder = canCreateRestaurant && (waiterKioskMode ? waiterIdentityConfirmed : (!requiresWaiterIdentity || waiterIdentityConfirmed))
  const [pinWaiter, setPinWaiter] = useState<Waiter | null>(null)
  const [waiterPin, setWaiterPin] = useState('')
  const [showWaiterPinDialog, setShowWaiterPinDialog] = useState(false)
  const [verifyingWaiterPin, setVerifyingWaiterPin] = useState(false)
  const [kitchenPrinterId, setKitchenPrinterId] = useState(() => { try { return localStorage.getItem('jibusales_kitchen_printer_id') || '' } catch { return '' } })
  const [availablePrinters, setAvailablePrinters] = useState<PrintAgentPrinter[]>([])
  const [printAgentUrl, setPrintAgentUrl] = useState('')
  const [printerDiscoveryBusy, setPrinterDiscoveryBusy] = useState(false)
  const [printingOrderId, setPrintingOrderId] = useState('')
  const [showPrinterDialog, setShowPrinterDialog] = useState(false)
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
  const [showMenuEntryModal, setShowMenuEntryModal] = useState(false)
  const [showStockAdjustModal, setShowStockAdjustModal] = useState(false)
  const [editingMenuEntry, setEditingMenuEntry] = useState<RestaurantMenuEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [menuSearchQuery, setMenuSearchQuery] = useState('')
  const [stockSearchQuery, setStockSearchQuery] = useState('')
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null)
  const [stockAdjustForm, setStockAdjustForm] = useState({ adjustmentType: 'stock_in', quantity: 1, reason: '' })
  const [savingStockAdjustment, setSavingStockAdjustment] = useState(false)
  const [menuCategoryFilter, setMenuCategoryFilter] = useState('all')
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
  const [menuForm, setMenuForm] = useState({ productId: '', category: 'General', description: '', station: 'kitchen', price: '' })
  const [waiterForm, setWaiterForm] = useState({ name: '', phone: '', code: '', pin: '', employeeId: '' })
  const [editTableForm, setEditTableForm] = useState({ name: '', capacity: 4, area: '', status: 'available', isActive: true })
  const [editWaiterForm, setEditWaiterForm] = useState({ name: '', phone: '', code: '', pin: '', isActive: true, employeeId: '' })
  const [reservationForm, setReservationForm] = useState({ customerName: '', customerPhone: '', date: '', time: '', guests: 1, tableId: '', specialRequests: '' })
  const [deliveryForm, setDeliveryForm] = useState({ orderId: '', customerName: '', customerPhone: '', address: '', riderName: '', riderPhone: '', deliveryFee: 0, notes: '' })
  const [orderForm, setOrderForm] = useState({ tableId: '', waiterId: '', orderType: 'dine_in', specialInstructions: '' })
  const [orderItems, setOrderItems] = useState<{ productId: string; quantity: number; station: string }[]>([])
  const [recipeForm, setRecipeForm] = useState({ productId: '', name: '', yield: '', ingredients: [{ productId: '', quantity: 0, unit: 'Piece' }] })
  const [happyHourForm, setHappyHourForm] = useState({ name: '', productId: '', startTime: '16:00', endTime: '18:00', daysOfWeek: '1,2,3,4,5', discountType: 'percentage', discountValue: 20 })
  const [comboForm, setComboForm] = useState({ name: '', description: '', price: 0, items: [{ productId: '', quantity: 1 }] })
  const [completeForm, setCompleteForm] = useState({ paymentMethod: 'cash', discount: 0, tipAmount: 0, tipWaiterId: '' })
  const [splitForm, setSplitForm] = useState<{ itemIds: string[]; paymentMethod: string; tipAmount: number }[]>([])

  useEffect(() => {
    const syncWaiterSession = () => {
      setActiveWaiterId(sessionStorage.getItem('restaurant.activeWaiterId') || '')
      setWaiterSessionToken(sessionStorage.getItem('restaurant.waiterSessionToken') || '')
      setWaiterKioskMode(sessionStorage.getItem('restaurant.waiterKioskMode') === 'true')
    }
    window.addEventListener('restaurant-waiter-session-changed', syncWaiterSession)
    return () => window.removeEventListener('restaurant-waiter-session-changed', syncWaiterSession)
  }, [])

  const tabFeature: Record<string, string> = {
    dashboard: 'restaurant', tables: 'restaurant.tables', orders: 'restaurant.orders',
    kitchen: 'restaurant.kitchen', bar: 'restaurant.bar', menu: 'restaurant', stockroom: 'restaurant',
    reservations: 'restaurant.reservations', recipes: 'restaurant.recipes', delivery: 'restaurant.delivery',
    waiters: 'restaurant.waiters', 'happy-hour': 'restaurant.happy_hour', combos: 'restaurant.combos', tips: 'restaurant.tips',
  }
  const canAccessTab = (value: string) => canViewRestaurant && hasFeature(tabFeature[value] || 'restaurant') &&
    (value !== 'stockroom' || hasPermission('canViewProduct'))

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [tablesRes, waitersRes, productsRes, statsRes, hrEmployeesRes, menuRes] = await Promise.all([
        hasFeature('restaurant.tables') && canViewRestaurant ? apiFetch('/api/restaurant/tables') : Promise.resolve(null),
        hasFeature('restaurant.waiters') && canViewRestaurant ? apiFetch('/api/restaurant/waiters') : Promise.resolve(null),
        hasFeature('restaurant') && hasPermission('canViewProduct') ? apiFetch('/api/inventory?limit=500') : Promise.resolve(null),
        hasFeature('restaurant') && canViewRestaurant ? apiFetch('/api/restaurant/dashboard') : Promise.resolve(null),
        canLinkWaiterToHr ? apiFetch('/api/restaurant/waiters/hr-employees') : Promise.resolve(null),
        hasFeature('restaurant') && canViewRestaurant ? apiFetch('/api/restaurant/menu') : Promise.resolve(null),
      ])
      if (tablesRes?.ok) setTables(await tablesRes.json())
      else if (!hasFeature('restaurant.tables')) setTables([])
      if (waitersRes?.ok) setWaiters(await waitersRes.json())
      else if (!hasFeature('restaurant.waiters')) setWaiters([])
      if (hrEmployeesRes?.ok) setHrWaiterEmployees(await hrEmployeesRes.json())
      else if (!canLinkWaiterToHr) setHrWaiterEmployees([])
      if (productsRes?.ok) { const p = await productsRes.json(); setProducts(p?.products || p?.records || []) }
      else if (!productsRes && !online && hasPermission('canViewProduct')) { const local = await getLocalProducts(); setProducts(local.map((p: any) => ({ id: p.id, name: p.product_name, price: p.unit_price, quantity: p.quantity }))) }
      if (statsRes?.ok) setStats(await statsRes.json())
      if (menuRes?.ok) setMenuEntries(await menuRes.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [canLinkWaiterToHr, canViewRestaurant, hasFeature, hasPermission, online])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const allowedTabs = ['dashboard', 'tables', 'orders', 'kitchen', 'bar', 'menu', 'stockroom', 'reservations', 'recipes', 'delivery', 'waiters', 'happy-hour', 'combos', 'tips']
    if (!routeTab || !allowedTabs.includes(routeTab)) {
      navigate('/tenant/restaurant/dashboard', { replace: true })
      return
    }
    if (!canAccessTab(routeTab)) {
      const fallback = allowedTabs.find(canAccessTab)
      if (fallback) navigate(`/tenant/restaurant/${fallback}`, { replace: true })
      return
    }
    setActiveTab(routeTab)
  }, [routeTab, navigate, canViewRestaurant, hasFeature, hasPermission])

  useEffect(() => {
    if (activeWaiterId && waiters.length > 0 && !waiters.some(waiter => waiter.id === activeWaiterId && waiter.isActive)) {
      setActiveWaiterId('')
      setWaiterSessionToken('')
      sessionStorage.removeItem('restaurant.activeWaiterId')
      sessionStorage.removeItem('restaurant.waiterSessionToken')
      setWaiterKioskMode(sessionStorage.getItem('restaurant.waiterKioskMode') === 'true')
      window.dispatchEvent(new Event('restaurant-waiter-session-changed'))
      return
    }
    if (activeWaiterId) sessionStorage.setItem('restaurant.activeWaiterId', activeWaiterId)
    else sessionStorage.removeItem('restaurant.activeWaiterId')
    if (waiterSessionToken) sessionStorage.setItem('restaurant.waiterSessionToken', waiterSessionToken)
    else sessionStorage.removeItem('restaurant.waiterSessionToken')
  }, [activeWaiterId, waiterSessionToken, waiters])

  const clearWaiterIdentity = () => {
    setActiveWaiterId('')
    setWaiterSessionToken('')
    sessionStorage.removeItem('restaurant.activeWaiterId')
    sessionStorage.removeItem('restaurant.waiterSessionToken')
    setWaiterKioskMode(sessionStorage.getItem('restaurant.waiterKioskMode') === 'true')
    window.dispatchEvent(new Event('restaurant-waiter-session-changed'))
  }

  const requestWaiterIdentity = (waiterId: string) => {
    if (waiterId === 'unassigned') { clearWaiterIdentity(); return }
    const waiter = waiters.find(candidate => candidate.id === waiterId && candidate.isActive)
    if (!waiter) return
    if (!waiter.hasPin) {
      toast({ variant: 'destructive', title: `A manager must set a PIN for ${waiter.name} first` })
      return
    }
    setPinWaiter(waiter)
    setWaiterPin('')
    setShowWaiterPinDialog(true)
  }

  const confirmWaiterIdentity = async () => {
    if (!pinWaiter || !/^\d{4,8}$/.test(waiterPin)) {
      toast({ variant: 'destructive', title: 'Enter the waiter PIN (4 to 8 digits)' })
      return
    }
    setVerifyingWaiterPin(true)
    try {
      const response = await apiFetch(`/api/restaurant/waiters/${pinWaiter.id}/verify-pin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: waiterPin }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'PIN verification failed')
      setActiveWaiterId(pinWaiter.id)
      setWaiterSessionToken(data.token)
      setWaiterKioskMode(true)
      sessionStorage.setItem('restaurant.activeWaiterId', pinWaiter.id)
      sessionStorage.setItem('restaurant.waiterSessionToken', data.token)
      sessionStorage.setItem('restaurant.waiterKioskMode', 'true')
      window.dispatchEvent(new Event('restaurant-waiter-session-changed'))
      setShowWaiterPinDialog(false)
      setWaiterPin('')
      setPinWaiter(null)
      toast({ title: `${pinWaiter.name} confirmed for this shift` })
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'PIN verification failed' }) }
    finally { setVerifyingWaiterPin(false) }
  }

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
    if (tab === 'stockroom') fetchRecipes()
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
    if (!/^\d{4,8}$/.test(waiterForm.pin)) { toast({ variant: 'destructive', title: 'Set a PIN with 4 to 8 digits' }); return }
    try {
      const payload = canLinkWaiterToHr ? waiterForm : (({ employeeId: _employeeId, ...form }) => form)(waiterForm)
      const res = await apiFetch('/api/restaurant/waiters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not add waiter')
      toast({ title: 'Waiter added' }); setShowWaiterModal(false); setWaiterForm({ name: '', phone: '', code: '', pin: '', employeeId: '' }); fetchData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not add waiter' }) }
  }
  const applyHrEmployeeToWaiterForm = (employeeId: string, editing = false) => {
    const employee = hrWaiterEmployees.find(item => item.id === employeeId)
    const details = employee ? {
      name: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' '),
      phone: employee.phone || '',
    } : null
    if (editing) setEditWaiterForm(form => ({ ...form, employeeId: employeeId === 'manual' ? '' : employeeId, ...(details || {}) }))
    else setWaiterForm(form => ({ ...form, employeeId: employeeId === 'manual' ? '' : employeeId, ...(details || {}) }))
  }
  const deleteWaiter = async (id: string) => {
    try { const res = await apiFetch(`/api/restaurant/waiters/${id}`, { method: 'DELETE' }); if (res.ok) { toast({ title: 'Waiter deleted' }); fetchData() } } catch (e) { console.error(e) }
  }
  const updateWaiter = async () => {
    if (!editingWaiter) return
    if (!editWaiterForm.name.trim()) { toast({ variant: 'destructive', title: 'Waiter name is required' }); return }
    if (editWaiterForm.pin && !/^\d{4,8}$/.test(editWaiterForm.pin)) { toast({ variant: 'destructive', title: 'PIN must contain 4 to 8 digits' }); return }
    try {
      const payload = canLinkWaiterToHr ? editWaiterForm : (({ employeeId: _employeeId, ...form }) => form)(editWaiterForm)
      const res = await apiFetch(`/api/restaurant/waiters/${editingWaiter.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update waiter')
      if (editWaiterForm.pin && activeWaiterId === editingWaiter.id) clearWaiterIdentity()
      toast({ title: 'Waiter updated' }); setShowEditWaiterModal(false); setEditingWaiter(null); fetchData()
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not update waiter' }) }
  }
  const openEditWaiter = (w: Waiter) => { setEditingWaiter(w); setEditWaiterForm({ name: w.name, phone: w.phone || '', code: w.code || '', pin: '', isActive: w.isActive, employeeId: w.employeeId || '' }); setShowEditWaiterModal(true) }

  // === Order handlers ===
  const createOrder = async () => {
    if (!orderForm.tableId && orderForm.orderType === 'dine_in') { toast({ variant: 'destructive', title: 'Select a table for dine-in orders' }); return }
    if (waiters.some(waiter => waiter.isActive) && (!activeWaiterId || !waiterSessionToken)) { toast({ variant: 'destructive', title: 'Select a waiter and confirm their PIN before taking an order' }); return }
    if (orderItems.length === 0) { toast({ variant: 'destructive', title: 'Add at least one item to the order' }); return }
    if (orderItems.some(i => !i.productId || i.quantity < 1)) { toast({ variant: 'destructive', title: 'All items must have a product and quantity' }); return }
    try {
      const items = orderItems.map(i => {
        const menuEntry = menuEntries.find(entry => entry.productId === i.productId)
        return { productId: i.productId, quantity: i.quantity, price: menuEntry?.price || 0, station: menuEntry?.station || i.station }
      })
      const res = await apiFetch('/api/restaurant/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(waiterSessionToken ? { 'X-Restaurant-Waiter-Session': waiterSessionToken } : {}) }, body: JSON.stringify({ ...orderForm, waiterId: activeWaiterId || null, items }) })
      if (res.ok) {
        const createdOrder = await res.json()
        toast({ title: 'Order created' })
        setShowOrderModal(false)
        setOrderForm({ tableId: '', waiterId: '', orderType: 'dine_in', specialInstructions: '' })
        setOrderItems([])
        setMenuSearchQuery('')
        fetchOrders()
        if (kitchenPrinterId) {
          const stations = [...new Set((createdOrder.items || []).map((item: OrderItem) => item.station || 'kitchen'))].filter((station): station is 'kitchen' | 'bar' => station === 'kitchen' || station === 'bar')
          for (const station of stations) void printKitchenTicket(createdOrder, station)
        }
      } else {
        const data = await res.json().catch(() => ({}))
        if (data.code === 'WAITER_PIN_REQUIRED') {
          const waiterId = activeWaiterId
          clearWaiterIdentity()
          if (waiterId) requestWaiterIdentity(waiterId)
        }
        toast({ variant: 'destructive', title: data.error || 'Could not create order' })
      }
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

  const uploadMenuImage = async (productId: string, file?: File) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast({ variant: 'destructive', title: 'Image must be 2 MB or smaller' }); return }
    const body = new FormData()
    body.append('image', file)
    try {
      const response = await apiFetch(`/api/restaurant/menu/${productId}/image`, { method: 'POST', body })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Image upload failed')
      setProducts(current => current.map(product => product.id === productId ? { ...product, image: data.image } : product))
      setMenuEntries(current => current.map(entry => entry.productId === productId ? { ...entry, product: { ...entry.product, image: data.image } } : entry))
      toast({ title: 'Menu image updated' })
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Image upload failed' }) }
  }

  const removeMenuImage = async (productId: string) => {
    try {
      const response = await apiFetch(`/api/restaurant/menu/${productId}/image`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove menu image')
      setProducts(current => current.map(product => product.id === productId ? { ...product, image: null } : product))
      setMenuEntries(current => current.map(entry => entry.productId === productId ? { ...entry, product: { ...entry.product, image: null } } : entry))
      toast({ title: 'Menu image removed' })
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not remove menu image' }) }
  }

  const discoverKitchenPrinters = async () => {
    setPrinterDiscoveryBusy(true)
    try {
      const [connection, nativePrinters] = await Promise.all([
        discoverPrintAgent().catch(() => null),
        hasNativePrinterBridge() ? listNativePrinters().catch(() => []) : Promise.resolve([]),
      ])
      const agentPrinters = connection ? await getPrintAgentPrinters(connection.baseUrl).catch(() => []) : []
      const printers: PrintAgentPrinter[] = [
        ...agentPrinters,
        ...nativePrinters.map(printer => ({
          id: `native:${printer.transport}:${printer.id}`,
          name: printer.name,
          connectionType: printer.details || printer.transport,
          isOnline: true,
        })),
      ]
      setPrintAgentUrl(connection?.baseUrl || '')
      setAvailablePrinters(printers)
      if (!printers.length) throw new Error('No printers found. Connect a supported printer or start the local print service.')
      setShowPrinterDialog(true)
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not find printers' }) }
    finally { setPrinterDiscoveryBusy(false) }
  }

  const printKitchenTicket = async (order: Order, station: 'kitchen' | 'bar') => {
    if (!kitchenPrinterId) { await discoverKitchenPrinters(); return }
    const items = order.items.filter(item => (item.station || 'kitchen') === station)
    if (!items.length) { toast({ variant: 'destructive', title: `No ${station} items on this order` }); return }
    setPrintingOrderId(`${order.id}:${station}`)
    const textHex = (value: string) => Array.from(new TextEncoder().encode(value)).map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
    const line = (value: string) => `${textHex(value)}0A`
    const commands = ['1B40', '1B6101', '1B4501', line(station === 'bar' ? 'BAR TICKET' : 'KITCHEN TICKET'), '1B4500', line(`Order ${order.orderNo}`)]
    if (order.table?.name) commands.push(line(`Table: ${order.table.name}`))
    const serverName = order.waiter?.name || [order.user?.fname, order.user?.lname].filter(Boolean).join(' ').trim() || 'Unassigned'
    commands.push(line(`Served by: ${serverName}`), line(new Date(order.createdAt).toLocaleString()), '1B6100', '1B4501')
    for (const item of items) {
      commands.push(line(`${item.quantity} x ${item.product.name}`))
      if (item.specialInstructions) commands.push(line(`  NOTE: ${item.specialInstructions}`))
    }
    commands.push('1B4500', line('--------------------------------'), line(order.specialInstructions ? `Order note: ${order.specialInstructions}` : ''), '1B6404', '1D5600')
    try {
      if (kitchenPrinterId.startsWith('native:')) {
        const [, transport, ...idParts] = kitchenPrinterId.split(':')
        await printWithNativePrinter({ id: idParts.join(':'), transport: transport as 'usb' | 'bluetooth', name: availablePrinters.find(printer => printer.id === kitchenPrinterId)?.name || 'Kitchen printer' }, commands)
      } else {
        await printReceiptViaAgent({ baseUrl: printAgentUrl || undefined, printerId: kitchenPrinterId, saleId: order.id, receiptNo: `${station.toUpperCase()}-${order.orderNo}`, commands, documentType: station === 'bar' ? 'BAR_TICKET' : 'KITCHEN_TICKET', rememberPrinter: false })
      }
      toast({ title: `${station === 'bar' ? 'Bar' : 'Kitchen'} ticket sent` })
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Ticket printing failed' }) }
    finally { setPrintingOrderId('') }
  }

  const selectKitchenPrinter = (printerId: string) => {
    setKitchenPrinterId(printerId)
    try { localStorage.setItem('jibusales_kitchen_printer_id', printerId) } catch { /* device storage may be disabled */ }
    setShowPrinterDialog(false)
    toast({ title: 'Kitchen printer saved for this device' })
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

  const visibleMenuEntries = useMemo(() => menuEntries.filter(entry => {
    if (menuCategoryFilter !== 'all' && entry.category !== menuCategoryFilter) return false
    const query = menuSearchQuery.trim().toLowerCase()
    return !query || entry.product.name.toLowerCase().includes(query) || entry.category.toLowerCase().includes(query) || (entry.description || '').toLowerCase().includes(query)
  }), [menuEntries, menuCategoryFilter, menuSearchQuery])
  const menuCategories = useMemo(() => [...new Set(menuEntries.map(entry => entry.category).filter(Boolean))].sort(), [menuEntries])
  const stockroomRows = useMemo(() => {
    const menuByProductId = new Map(menuEntries.map(entry => [entry.productId, entry]))
    const recipesByIngredientId = new Map<string, Recipe[]>()
    recipes.filter(recipe => recipe.isActive).forEach(recipe => recipe.ingredients.forEach(ingredient => {
      const linked = recipesByIngredientId.get(ingredient.productId) || []
      if (!linked.some(item => item.id === recipe.id)) linked.push(recipe)
      recipesByIngredientId.set(ingredient.productId, linked)
    }))
    const query = stockSearchQuery.trim().toLowerCase()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return products
      .filter(product => product.itemType !== 'service')
      .map(product => {
        const linkedRecipes = recipesByIngredientId.get(product.id) || []
        const menuEntry = menuByProductId.get(product.id)
        const expiryDays = product.expiryDate ? Math.ceil((new Date(product.expiryDate).getTime() - today.getTime()) / 86400000) : null
        const recipeCapacities = linkedRecipes.map(recipe => {
          const recipeLines = recipe.ingredients.filter(ingredient => ingredient.quantity > 0)
          const unitsMatch = recipeLines.every(ingredient => {
            const ingredientProduct = products.find(item => item.id === ingredient.productId)
            return ingredientProduct && (ingredient.unit || '').trim().toLowerCase() === (ingredientProduct.baseUnit || 'Piece').trim().toLowerCase()
          })
          const portions = unitsMatch && recipeLines.length > 0
            ? Math.min(...recipeLines.map(ingredient => {
              const ingredientProduct = products.find(item => item.id === ingredient.productId)
              return ingredientProduct ? Math.floor(ingredientProduct.quantity / ingredient.quantity) : 0
            }))
            : null
          return { name: recipe.name, portions }
        })
        return { product, linkedRecipes, menuEntry, expiryDays, recipeCapacities }
      })
      .filter(row => !query || row.product.name.toLowerCase().includes(query) || row.linkedRecipes.some(recipe => recipe.name.toLowerCase().includes(query)) || (row.menuEntry?.category || '').toLowerCase().includes(query))
      .sort((a, b) => Number(a.product.quantity > (a.product.minStock ?? 0)) - Number(b.product.quantity > (b.product.minStock ?? 0)) || (a.expiryDays ?? Number.MAX_SAFE_INTEGER) - (b.expiryDays ?? Number.MAX_SAFE_INTEGER) || a.product.name.localeCompare(b.product.name))
  }, [products, recipes, menuEntries, stockSearchQuery])
  const stockroomSummary = useMemo(() => {
    const tracked = products.filter(product => product.itemType !== 'service')
    const ingredientIds = new Set(recipes.filter(recipe => recipe.isActive).flatMap(recipe => recipe.ingredients.map(ingredient => ingredient.productId)))
    const now = Date.now()
    return {
      ingredients: tracked.filter(product => ingredientIds.has(product.id)).length,
      lowStock: tracked.filter(product => product.quantity > 0 && product.quantity <= (product.minStock ?? 0)).length,
      outOfStock: tracked.filter(product => product.quantity <= 0).length,
      expiring: tracked.filter(product => product.expiryDate && new Date(product.expiryDate).getTime() >= now && new Date(product.expiryDate).getTime() <= now + 30 * 86400000).length,
    }
  }, [products, recipes])

  const saveMenuEntry = async () => {
    const selectedProduct = products.find(product => product.id === menuForm.productId)
    if (!editingMenuEntry && !selectedProduct) { toast({ variant: 'destructive', title: 'Select an inventory item to link to the menu' }); return }
    const price = Number(menuForm.price)
    if (!Number.isFinite(price) || price < 0) { toast({ variant: 'destructive', title: 'Enter a valid menu price' }); return }
    try {
      const response = await apiFetch(editingMenuEntry ? `/api/restaurant/menu/${editingMenuEntry.id}` : '/api/restaurant/menu', { method: editingMenuEntry ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...menuForm, price }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not add menu item')
      setMenuEntries(current => editingMenuEntry ? current.map(entry => entry.id === editingMenuEntry.id ? data : entry) : [...current, data])
      setShowMenuEntryModal(false)
      setEditingMenuEntry(null)
      setMenuForm({ productId: '', category: 'General', description: '', station: 'kitchen', price: '' })
      toast({ title: editingMenuEntry ? 'Menu item updated' : 'Menu item added' })
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not add menu item' }) }
  }

  const updateMenuEntry = async (entry: RestaurantMenuEntry, patch: Partial<RestaurantMenuEntry>) => {
    try {
      const response = await apiFetch(`/api/restaurant/menu/${entry.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not update menu item')
      setMenuEntries(current => current.map(item => item.id === entry.id ? data : item))
      toast({ title: 'Menu item updated' })
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not update menu item' }) }
  }

  const deleteMenuEntry = async (entry: RestaurantMenuEntry) => {
    try {
      const response = await apiFetch(`/api/restaurant/menu/${entry.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not remove menu item')
      setMenuEntries(current => current.filter(item => item.id !== entry.id))
      setOrderItems(current => current.filter(item => item.productId !== entry.productId))
      toast({ title: 'Menu item removed' })
    } catch (error) { toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Could not remove menu item' }) }
  }

  const submitStockAdjustment = async () => {
    if (!stockAdjustProduct || !canAdjustStock) return
    if (!Number.isInteger(stockAdjustForm.quantity) || stockAdjustForm.quantity <= 0) {
      toast({ variant: 'destructive', title: 'Enter a positive whole-unit quantity' })
      return
    }
    if (!stockAdjustForm.reason.trim()) {
      toast({ variant: 'destructive', title: 'A reason is required for the stock movement' })
      return
    }
    setSavingStockAdjustment(true)
    try {
      const response = await apiFetch(`/api/inventory/${stockAdjustProduct.id}/stock-adjust`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...stockAdjustForm, branchId: stockAdjustProduct.branchId || undefined }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Stock movement could not be recorded')
      setProducts(current => current.map(product => product.id === stockAdjustProduct.id ? { ...product, quantity: data.adjustment.newQuantity } : product))
      setShowStockAdjustModal(false)
      setStockAdjustProduct(null)
      setStockAdjustForm({ adjustmentType: 'stock_in', quantity: 1, reason: '' })
      toast({ title: stockAdjustForm.adjustmentType === 'stock_in' ? 'Stock received' : 'Stock-out recorded', description: `${stockAdjustProduct.name}: ${data.adjustment.previousQuantity} → ${data.adjustment.newQuantity}` })
    } catch (error) {
      toast({ variant: 'destructive', title: error instanceof Error ? error.message : 'Stock movement could not be recorded' })
    } finally { setSavingStockAdjustment(false) }
  }

  const addMenuEntryToCart = (entry: RestaurantMenuEntry) => {
    if (!entry.isAvailable) return
    setOrderItems(current => {
      const existing = current.find(item => item.productId === entry.productId)
      return existing
        ? current.map(item => item.productId === entry.productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { productId: entry.productId, quantity: 1, station: entry.station }]
    })
  }

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

  if (!canAccessTab(tab)) return <div className="mx-auto max-w-xl py-16 text-center"><h1 className="text-lg font-semibold">Restaurant access unavailable</h1><p className="mt-2 text-sm text-muted-foreground">Your role or this business plan does not include this restaurant area.</p></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UtensilsCrossed className="h-6 w-6" /> Restaurant & Bar</h1>
        {waiters.some(waiter => waiter.isActive) && <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Serving as</span>
          <Select value={activeWaiterId || 'unassigned'} onValueChange={requestWaiterIdentity}>
            <SelectTrigger className="w-[190px]" disabled={waiterIdentityConfirmed} aria-label={waiterIdentityConfirmed ? 'Serving waiter is locked until sign out' : 'Select serving waiter'}><SelectValue /></SelectTrigger>
            <SelectContent>
              {!waiterKioskMode && <SelectItem value="unassigned">No waiter selected</SelectItem>}
              {waiters.filter(waiter => waiter.isActive).map(waiter => <SelectItem key={waiter.id} value={waiter.id}>{waiter.name}{waiter.hasPin ? '' : ' · PIN not set'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>}
      </div>

      <Tabs value={tab === 'bar' ? 'kitchen' : tab} onValueChange={setTab}>
        <TabsList className="hidden">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="stockroom"><Package className="mr-1 h-3 w-3" /> Stockroom</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="kitchen">Kitchen</TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="waiters">Waiters</TabsTrigger>
          <TabsTrigger value="happy-hour"><Timer className="h-3 w-3 mr-1" /> Happy Hour</TabsTrigger>
          <TabsTrigger value="combos"><Tag className="h-3 w-3 mr-1" /> Combos</TabsTrigger>
          <TabsTrigger value="tips"><DollarSign className="h-3 w-3 mr-1" /> Tips</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Service overview</h2>
              <p className="text-sm text-muted-foreground">Today&apos;s restaurant activity and live service status.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canAccessTab('tables') && <Button variant="outline" onClick={() => setTab('tables')}><Table2 className="mr-2 h-4 w-4" /> Floor</Button>}
              {canAccessTab('kitchen') && <Button variant="outline" onClick={() => setTab('kitchen')}><ChefHat className="mr-2 h-4 w-4" /> Kitchen</Button>}
              {canCreateRestaurant && <Button disabled={!canStartOrder} title={!canStartOrder ? 'Confirm Serving as before starting an order' : undefined} onClick={() => { setOrderForm({ tableId: '', waiterId: activeWaiterId, orderType: 'dine_in', specialInstructions: '' }); setOrderItems([]); setShowOrderModal(true) }}><Plus className="mr-2 h-4 w-4" /> Start order</Button>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card role="button" tabIndex={0} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setTab('orders')} onKeyDown={event => { if (event.key === 'Enter') setTab('orders') }}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Sales today</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{(stats?.todaySales || 0).toLocaleString()}</div><p className="mt-1 text-xs text-muted-foreground">{stats?.completedCount || 0} completed checks · Avg. {(stats?.avgBill || 0).toLocaleString()}</p></CardContent>
            </Card>
            <Card role="button" tabIndex={0} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setTab('orders')} onKeyDown={event => { if (event.key === 'Enter') setTab('orders') }}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Orders today</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{stats?.ordersToday ?? 0}</div><p className="mt-1 text-xs text-muted-foreground">All dine-in, takeaway and delivery orders</p></CardContent>
            </Card>
            <Card role="button" tabIndex={0} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setTab('kitchen')} onKeyDown={event => { if (event.key === 'Enter') setTab('kitchen') }}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">In preparation</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{stats?.kitchenOrders ?? 0}</div><p className="mt-1 text-xs text-muted-foreground">Kitchen and bar orders in progress</p></CardContent>
            </Card>
            <Card role="button" tabIndex={0} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setTab('tables')} onKeyDown={event => { if (event.key === 'Enter') setTab('tables') }}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Table availability</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{stats?.openTables ?? 0}<span className="ml-1 text-base font-normal text-muted-foreground">available</span></div><p className="mt-1 text-xs text-muted-foreground">{stats?.occupiedTables ?? 0} occupied · {tables.filter(table => table.status === 'reserved' && table.isActive).length} reserved</p></CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Service queues</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <button className="flex items-center justify-between rounded-md border p-4 text-left hover:bg-muted/40" onClick={() => setTab('kitchen')}><span className="flex items-center gap-3"><ChefHat className="h-5 w-5 text-orange-600" /><span><span className="block font-medium">Kitchen</span><span className="text-xs text-muted-foreground">Open kitchen tickets</span></span></span><Badge>{stats?.kitchenOrders ?? 0}</Badge></button>
                <button className="flex items-center justify-between rounded-md border p-4 text-left hover:bg-muted/40" onClick={() => setTab('bar')}><span className="flex items-center gap-3"><Wine className="h-5 w-5 text-rose-600" /><span><span className="block font-medium">Bar</span><span className="text-xs text-muted-foreground">Open bar tickets</span></span></span><Badge>{stats?.barOrders ?? 0}</Badge></button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Quick access</CardTitle></CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" className="justify-start" onClick={() => setTab('menu')}><UtensilsCrossed className="mr-2 h-4 w-4" /> Menu &amp; pricing</Button>
                <Button variant="outline" className="justify-start" onClick={() => setTab('reservations')}><CalendarClock className="mr-2 h-4 w-4" /> Reservations</Button>
                <Button variant="outline" className="justify-start" onClick={() => setTab('delivery')}><Bike className="mr-2 h-4 w-4" /> Deliveries</Button>
                <Button variant="outline" className="justify-start" onClick={() => setTab('tips')}><DollarSign className="mr-2 h-4 w-4" /> Waiter tips</Button>
              </CardContent>
            </Card>
          </div>
          {!stats && !loading && <div className="text-sm text-muted-foreground">Restaurant summary is not available right now. Refresh to try again.</div>}
        </TabsContent>

        <TabsContent value="stockroom" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-semibold">Restaurant stockroom</h2><p className="text-sm text-muted-foreground">Track recipe ingredients, ready-to-sell stock, replenishment levels and expiry risk in one service-focused view.</p></div>
            <Button variant="outline" onClick={() => { void fetchData(); void fetchRecipes() }} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh stock</Button>
          </div>
          <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Recipe ingredients</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{stockroomSummary.ingredients}</div><p className="text-xs text-muted-foreground">Items used by active recipes</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Below reorder level</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold text-amber-700">{stockroomSummary.lowStock}</div><p className="text-xs text-muted-foreground">On hand, at or below minimum</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Out of stock</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold text-destructive">{stockroomSummary.outOfStock}</div><p className="text-xs text-muted-foreground">May block service or sales</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expiring in 30 days</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{stockroomSummary.expiring}</div><p className="text-xs text-muted-foreground">Based on item expiry dates</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Stock by service use</CardTitle><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={stockSearchQuery} onChange={event => setStockSearchQuery(event.target.value)} placeholder="Search item, recipe or menu category" /></div></div></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-3 pr-4 font-medium">Stock item</th><th className="pb-3 pr-4 font-medium">Service use</th><th className="pb-3 pr-4 font-medium">On hand</th><th className="pb-3 pr-4 font-medium">Reorder at</th><th className="pb-3 pr-4 font-medium">Recipe capacity</th><th className="pb-3 pr-4 font-medium">Expiry</th><th className="pb-3 text-right font-medium">Action</th></tr></thead>
                  <tbody>
                    {stockroomRows.map(({ product, linkedRecipes, menuEntry, expiryDays, recipeCapacities }) => {
                      const low = product.quantity <= (product.minStock ?? 0)
                      const expired = expiryDays !== null && expiryDays < 0
                      const expirySoon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 30
                      return <tr key={product.id} className="border-b last:border-0">
                        <td className="py-3 pr-4"><div className="font-medium">{product.name}</div><div className="text-xs text-muted-foreground">{product.baseUnit || 'Piece'} · {product.branchId ? 'Branch stock' : 'Business stock'}</div></td>
                        <td className="py-3 pr-4"><div className="flex flex-wrap gap-1">{linkedRecipes.length > 0 && <Badge variant="secondary">Ingredient · {linkedRecipes.length} recipe{linkedRecipes.length === 1 ? '' : 's'}</Badge>}{menuEntry && <Badge variant="outline">{menuEntry.station === 'bar' ? 'Bar' : 'Ready item'} · {menuEntry.category}</Badge>}{linkedRecipes.length === 0 && !menuEntry && <span className="text-muted-foreground">Other stock</span>}</div></td>
                        <td className="py-3 pr-4"><span className={`font-semibold ${product.quantity <= 0 ? 'text-destructive' : low ? 'text-amber-700' : ''}`}>{product.quantity}</span> <span className="text-xs text-muted-foreground">{product.baseUnit || 'Piece'}</span></td>
                        <td className="py-3 pr-4">{product.minStock ?? 0} <span className="text-xs text-muted-foreground">{product.baseUnit || 'Piece'}</span>{low && <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700">Reorder</Badge>}</td>
                        <td className="py-3 pr-4">{recipeCapacities.length === 0 ? <span className="text-muted-foreground">Not recipe-linked</span> : <div className="space-y-1">{recipeCapacities.map(capacity => <div key={capacity.name}><span className="text-muted-foreground">{capacity.name}: </span>{capacity.portions === null ? <span className="text-amber-700">check units</span> : <span>{capacity.portions.toLocaleString()} portions</span>}</div>)}</div>}</td>
                        <td className="py-3 pr-4">{expiryDays === null ? <span className="text-muted-foreground">Not set</span> : <span className={expired || expirySoon ? 'font-medium text-amber-700' : ''}>{expired ? `Expired ${Math.abs(expiryDays)}d ago` : expiryDays === 0 ? 'Expires today' : `${expiryDays}d`}</span>}</td>
                        <td className="py-3 text-right">{canAdjustStock ? <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => { setStockAdjustProduct(product); setStockAdjustForm({ adjustmentType: 'stock_in', quantity: 1, reason: '' }); setShowStockAdjustModal(true) }}>Receive</Button><Button size="sm" variant="ghost" disabled={product.quantity <= 0} onClick={() => { setStockAdjustProduct(product); setStockAdjustForm({ adjustmentType: 'stock_out', quantity: 1, reason: 'Waste / spoilage' }); setShowStockAdjustModal(true) }}>Waste / out</Button></div> : <span className="text-xs text-muted-foreground">View only</span>}</td>
                      </tr>
                    })}
                    {stockroomRows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">{products.length ? 'No stock items match this search.' : 'No tracked stock items found.'}</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Recipe capacity is estimated only when ingredient units exactly match the stock item&apos;s base unit. Stock movements are logged; use purchasing to record supplier invoices and financial cost.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tables */}
        <TabsContent value="tables">
          <div className="flex justify-between mb-4">
            {canEditRestaurant && <Button variant="outline" onClick={() => setShowMergeModal(true)} disabled={tables.length < 2}><Merge className="h-4 w-4 mr-1" /> Merge Tables</Button>}
            {canCreateRestaurant && <Button onClick={() => setShowTableModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Table</Button>}
          </div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {tables.map(t => (
              <Card key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2"><Table2 className="h-4 w-4" /> {t.name}</span><Badge className={statusColors[t.status]}>{t.status}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">Capacity: {t.capacity} {t.area && `· ${t.area}`}</div>
                  <div className="text-xs text-muted-foreground mt-1">Orders: {t._count?.orders ?? 0}</div>
                  <div className="flex gap-2 mt-3">
                    {canEditRestaurant && <Button size="sm" variant="outline" onClick={() => openEditTable(t)}><Pencil className="h-3 w-3" /></Button>}
                    {canDeleteRestaurant && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteTable(t.id)}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {tables.length === 0 && <div className="text-center text-muted-foreground py-8">No tables yet. Add your first table.</div>}
        </TabsContent>

        <TabsContent value="menu">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-semibold">Restaurant menu</h2><p className="text-sm text-muted-foreground">Curate what guests can order here; each menu item stays linked to its stock and recipe record.</p></div>
            {canCreateRestaurant && !waiterMode && <Button onClick={() => { setEditingMenuEntry(null); setMenuForm({ productId: '', category: 'General', description: '', station: 'kitchen', price: '' }); setShowMenuEntryModal(true) }}><Plus className="mr-2 h-4 w-4" /> Add menu item</Button>}
          </div>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={menuSearchQuery} onChange={event => setMenuSearchQuery(event.target.value)} placeholder="Search menu items" className="pl-9" /></div>
            <Select value={menuCategoryFilter} onValueChange={setMenuCategoryFilter}><SelectTrigger className="sm:w-52"><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{menuCategories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
          </div>
          {visibleMenuEntries.length === 0 ? <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">{menuEntries.length ? 'No available menu items match this search.' : 'Your restaurant menu is empty. Add items from tracked inventory to start taking orders.'}</div> :
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleMenuEntries.map(entry => <Card key={entry.id} className={`overflow-hidden ${entry.isAvailable ? '' : 'opacity-60'}`}>
                <div className="aspect-[4/3] bg-muted">
                  {entry.product.image ? <img src={entry.product.image} alt={entry.product.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImagePlus className="h-8 w-8" /></div>}
                </div>
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-medium" title={entry.product.name}>{entry.product.name}</p><p className="text-sm text-muted-foreground">{entry.category} · {entry.station === 'bar' ? 'Bar' : 'Kitchen'}</p>{entry.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>}</div><div className="flex flex-col items-end gap-1"><Badge variant="outline">{entry.product.quantity} in stock</Badge>{!entry.isAvailable && <Badge variant="secondary">Paused</Badge>}</div></div>
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{entry.price.toLocaleString()}</span>{canCreateRestaurant && <Button size="sm" disabled={!entry.isAvailable || !canStartOrder} title={!canStartOrder ? 'Confirm Serving as before adding items to an order' : undefined} onClick={() => addMenuEntryToCart(entry)}><Plus className="mr-1 h-4 w-4" /> Add</Button>}</div>
                  <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                    {canEditRestaurant && !waiterMode && <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-xs font-medium hover:bg-accent">
                      <ImagePlus className="h-3.5 w-3.5" /> {entry.product.image ? 'Change photo' : 'Add photo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { void uploadMenuImage(entry.productId, event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
                    </label>}
                    {canEditRestaurant && !waiterMode && <><Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setEditingMenuEntry(entry); setMenuForm({ productId: entry.productId, category: entry.category, description: entry.description || '', station: entry.station, price: String(entry.price) }); setShowMenuEntryModal(true) }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void updateMenuEntry(entry, { isAvailable: !entry.isAvailable })}>{entry.isAvailable ? 'Pause' : 'Resume'}</Button></>}
                    {canDeleteRestaurant && !waiterMode && <Button size="sm" variant="ghost" className="ml-auto h-8 px-2 text-xs text-destructive" onClick={() => void deleteMenuEntry(entry)}>Remove</Button>}
                  </div>
                </CardContent>
              </Card>)}
            </div>}
          {canCreateRestaurant && orderItems.length > 0 && <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3 shadow-lg">
            <div><p className="font-medium">Order cart · {orderItems.reduce((count, item) => count + item.quantity, 0)} items</p><p className="text-sm text-muted-foreground">Estimated total: {orderItems.reduce((sum, item) => sum + item.quantity * (menuEntries.find(entry => entry.productId === item.productId)?.price || 0), 0).toLocaleString()}</p></div>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setOrderItems([])}>Clear cart</Button><Button disabled={!canStartOrder} title={!canStartOrder ? 'Confirm Serving as before continuing' : undefined} onClick={() => { setOrderForm({ tableId: '', waiterId: activeWaiterId, orderType: 'takeaway', specialInstructions: '' }); setShowOrderModal(true) }}>Continue to order</Button></div>
          </div>}
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
            {canCreateRestaurant && <Button disabled={!canStartOrder} title={!canStartOrder ? 'Confirm Serving as before starting an order' : undefined} onClick={() => { setOrderForm({ ...orderForm, waiterId: activeWaiterId }); setShowOrderModal(true) }}><Plus className="h-4 w-4 mr-1" /> New Order</Button>}
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
                    {canEditRestaurant && o.status === 'pending' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'preparing')}>Start Preparing</Button>}
                    {canEditRestaurant && o.status === 'preparing' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'ready')}>Mark Ready</Button>}
                    {canEditRestaurant && o.status === 'ready' && <Button size="sm" onClick={() => updateOrderStatus(o.id, 'served')}>Mark Served</Button>}
                    {canEditRestaurant && o.status === 'served' && <Button size="sm" onClick={() => openCompleteModal(o)}><CheckCircle className="h-3 w-3 mr-1" /> Complete & Pay</Button>}
                    {canEditRestaurant && o.status === 'served' && <Button size="sm" variant="outline" onClick={() => openSplitModal(o)}><Split className="h-3 w-3 mr-1" /> Split Bill</Button>}
                    {canEditRestaurant && o.status !== 'completed' && o.status !== 'cancelled' && o.table && <Button size="sm" variant="outline" onClick={() => openMoveModal(o)}><ArrowRightLeft className="h-3 w-3 mr-1" /> Move Table</Button>}
                    {canDeleteRestaurant && o.status !== 'completed' && o.status !== 'cancelled' && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => updateOrderStatus(o.id, 'cancelled')}>Cancel</Button>}
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div><p className="font-medium">{tab === 'bar' ? 'Bar printer' : 'Kitchen printer'}</p><p className="text-sm text-muted-foreground">{kitchenPrinterId ? `Configured on this device: ${availablePrinters.find(printer => printer.id === kitchenPrinterId)?.name || 'saved printer'}` : `Choose a local printer to send ${tab === 'bar' ? 'bar' : 'kitchen'} tickets directly.`}</p></div>
            <Button variant="outline" onClick={discoverKitchenPrinters} disabled={printerDiscoveryBusy}><Printer className="mr-2 h-4 w-4" />{printerDiscoveryBusy ? 'Searching…' : kitchenPrinterId ? 'Change printer' : 'Set printer'}</Button>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {tab !== 'bar' && <div>
              <h3 className="font-semibold flex items-center gap-2 mb-3"><ChefHat className="h-5 w-5" /> Kitchen Orders</h3>
              <div className="space-y-3">
                {kitchenOrders.map(o => (
                  <Card key={o.id} className="border-l-4 border-l-orange-400">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex justify-between">{o.orderNo} <span className="flex gap-2">{o.table && <Badge variant="outline">{o.table.name}</Badge>}<Badge variant="secondary">{o.waiter?.name || [o.user?.fname, o.user?.lname].filter(Boolean).join(' ') || 'Unassigned'}</Badge></span></CardTitle></CardHeader>
                    <CardContent><div className="space-y-2">{o.items.map(i => (
                      <div key={i.id} className="flex items-center justify-between text-sm">
                        <span>{i.quantity}× {i.product.name} {i.specialInstructions && <span className="text-orange-600">⚠ {i.specialInstructions}</span>}</span>
                        <div className="flex gap-1">
                          {canEditRestaurant && i.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'preparing')}>Start</Button>}
                          {canEditRestaurant && i.status === 'preparing' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'ready')}>Ready</Button>}
                          {canEditRestaurant && i.status === 'ready' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'served')}>Served</Button>}
                          <Badge className={statusColors[i.status]}>{i.status}</Badge>
                        </div>
                      </div>
                    ))}</div><div className="mt-3 border-t pt-3"><Button size="sm" variant="outline" onClick={() => printKitchenTicket(o, 'kitchen')} disabled={printingOrderId === `${o.id}:kitchen`}><Printer className="mr-2 h-4 w-4" />{printingOrderId === `${o.id}:kitchen` ? 'Sending…' : 'Print kitchen ticket'}</Button></div></CardContent>
                  </Card>
                ))}
                {kitchenOrders.length === 0 && <div className="text-center text-muted-foreground py-4">No kitchen orders.</div>}
              </div>
            </div>}
            {tab === 'bar' && <div className="md:col-span-2">
              <h3 className="font-semibold flex items-center gap-2 mb-3"><Beaker className="h-5 w-5" /> Bar Orders</h3>
              <div className="space-y-3">
                {barOrders.map(o => (
                  <Card key={o.id} className="border-l-4 border-l-purple-400">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex justify-between">{o.orderNo} <span className="flex gap-2">{o.table && <Badge variant="outline">{o.table.name}</Badge>}<Badge variant="secondary">{o.waiter?.name || [o.user?.fname, o.user?.lname].filter(Boolean).join(' ') || 'Unassigned'}</Badge></span></CardTitle></CardHeader>
                    <CardContent><div className="space-y-2">{o.items.map(i => (
                      <div key={i.id} className="flex items-center justify-between text-sm">
                        <span>{i.quantity}× {i.product.name}</span>
                        <div className="flex gap-1">
                          {canEditRestaurant && i.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'preparing')}>Start</Button>}
                          {canEditRestaurant && i.status === 'preparing' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'ready')}>Ready</Button>}
                          {canEditRestaurant && i.status === 'ready' && <Button size="sm" variant="outline" onClick={() => updateItemStatus(o.id, i.id, 'served')}>Served</Button>}
                          <Badge className={statusColors[i.status]}>{i.status}</Badge>
                        </div>
                      </div>
                    ))}</div><div className="mt-3 border-t pt-3"><Button size="sm" variant="outline" onClick={() => printKitchenTicket(o, 'bar')} disabled={printingOrderId === `${o.id}:bar`}><Printer className="mr-2 h-4 w-4" />{printingOrderId === `${o.id}:bar` ? 'Sending…' : 'Print bar ticket'}</Button></div></CardContent>
                  </Card>
                ))}
                {barOrders.length === 0 && <div className="text-center text-muted-foreground py-4">No bar orders.</div>}
              </div>
            </div>}
          </div>
        </TabsContent>

        {/* Reservations */}
        <TabsContent value="reservations">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input type="date" value={reservationDateFilter} onChange={e => setReservationDateFilter(e.target.value)} className="sm:w-[180px]" />
            <div className="flex-1" />
            {canCreateRestaurant && <Button onClick={() => setShowReservationModal(true)}><Plus className="h-4 w-4 mr-1" /> New Reservation</Button>}
          </div>
          <div className="space-y-3">
            {filteredReservations.map(r => (
              <Card key={r.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><div className="font-medium">{r.customerName} {r.customerPhone && <span className="text-muted-foreground">· {r.customerPhone}</span>}</div><div className="text-sm text-muted-foreground">{new Date(r.date).toLocaleDateString()} at {r.time} · {r.guests} guests {r.table && `· ${r.table.name}`}</div>{r.specialRequests && <div className="text-sm text-orange-600 mt-1">⚠ {r.specialRequests}</div>}</div>
                    <div className="flex items-center gap-2"><Badge className={statusColors[r.status]}>{r.status}</Badge>
                      {canEditRestaurant && r.status === 'reserved' && <Button size="sm" onClick={() => updateReservationStatus(r.id, 'checked_in')}>Check In</Button>}
                      {canEditRestaurant && r.status === 'checked_in' && <Button size="sm" onClick={() => updateReservationStatus(r.id, 'completed')}>Complete</Button>}
                      {canEditRestaurant && r.status !== 'cancelled' && r.status !== 'completed' && <Button size="sm" variant="outline" onClick={() => updateReservationStatus(r.id, 'cancelled')}>Cancel</Button>}
                      {canDeleteRestaurant && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteReservation(r.id)}><Trash2 className="h-3 w-3" /></Button>}
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
          <div className="flex justify-end mb-4">{canCreateRestaurant && <Button onClick={() => setShowRecipeModal(true)}><Plus className="h-4 w-4 mr-1" /> New Recipe</Button>}</div>
          <div className="space-y-3">
            {recipes.map(r => (
              <Card key={r.id}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2">{r.name} <Badge variant="outline">{r.product.name}</Badge>{!r.isActive && <Badge variant="secondary">Inactive</Badge>}</span><div className="flex gap-1">{canEditRestaurant && <Button size="sm" variant="ghost" onClick={() => openEditRecipe(r)}><Pencil className="h-3 w-3" /></Button>}{canDeleteRestaurant && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteRecipe(r.id)}><Trash2 className="h-3 w-3" /></Button>}</div></CardTitle></CardHeader>
                <CardContent><div className="text-sm space-y-1">{r.ingredients.map(i => <div key={i.id} className="flex justify-between"><span>{i.product.name}</span><span className="text-muted-foreground">{i.quantity} {i.unit}</span></div>)}</div>{r.yield && <div className="text-xs text-muted-foreground mt-2">Yield: {r.yield}</div>}</CardContent>
              </Card>
            ))}
          </div>
          {recipes.length === 0 && <div className="text-center text-muted-foreground py-8">No recipes yet. Recipes auto-deduct ingredients from inventory on sale.</div>}
        </TabsContent>

        {/* Delivery */}
        <TabsContent value="delivery">
          <div className="flex justify-end mb-4">{canCreateRestaurant && <Button onClick={() => setShowDeliveryModal(true)}><Plus className="h-4 w-4 mr-1" /> New Delivery</Button>}</div>
          <div className="space-y-3">
            {deliveries.map(d => (
              <Card key={d.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><div className="font-medium">{d.customerName} · {d.customerPhone}</div><div className="text-sm text-muted-foreground">{d.address}</div><div className="text-sm mt-1">Rider: {d.riderName || 'Unassigned'} {d.riderPhone && `· ${d.riderPhone}`} · Fee: {d.deliveryFee.toLocaleString()}</div>{d.order && <Badge variant="outline" className="mt-1">{d.order.orderNo}</Badge>}</div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[d.status]}>{d.status}</Badge>
                      {canEditRestaurant && d.status === 'pending' && <Button size="sm" onClick={() => updateDeliveryStatus(d.id, 'on_delivery')}>Dispatch</Button>}
                      {canEditRestaurant && d.status === 'on_delivery' && <Button size="sm" onClick={() => updateDeliveryStatus(d.id, 'delivered')}>Delivered</Button>}
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
          <div className="flex justify-end mb-4">{canCreateRestaurant && <Button onClick={() => setShowWaiterModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Waiter</Button>}</div>
          <div className="grid gap-4 md:grid-cols-3">
            {waiters.map(w => (
              <Card key={w.id} className={w.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Users className="h-4 w-4" /> {w.name}<Badge variant={w.hasPin ? 'secondary' : 'outline'}>{w.hasPin ? 'PIN set' : 'PIN needed'}</Badge></span><div className="flex gap-1">{canEditRestaurant && <Button size="sm" variant="ghost" onClick={() => openEditWaiter(w)}><Pencil className="h-3 w-3" /></Button>}{canDeleteRestaurant && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteWaiter(w.id)}><Trash2 className="h-3 w-3" /></Button>}</div></CardTitle></CardHeader>
                <CardContent><div className="text-sm text-muted-foreground">{w.phone || 'No phone'} {w.code && `· Code: ${w.code}`}</div><div className="text-sm mt-1">Orders: {w._count?.orders ?? 0} · Tips: {w._count?.tips ?? 0}</div></CardContent>
              </Card>
            ))}
          </div>
          {waiters.length === 0 && <div className="text-center text-muted-foreground py-8">No waiters yet.</div>}
        </TabsContent>

        {/* Happy Hour */}
        <TabsContent value="happy-hour">
          <div className="flex justify-end mb-4">{canCreateRestaurant && <Button onClick={() => setShowHappyHourModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Rule</Button>}</div>
          <div className="space-y-3">
            {happyHours.map(h => (
              <Card key={h.id} className={h.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Timer className="h-4 w-4" /> {h.name} <Badge variant="outline">{h.product.name}</Badge></span><Badge className={h.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>{h.isActive ? 'Active' : 'Inactive'}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">{h.startTime} - {h.endTime} · Days: {h.daysOfWeek} · {h.discountType === 'percentage' ? `${h.discountValue}%` : h.discountValue} off</div>
                  <div className="flex gap-2 mt-3">
                    {canEditRestaurant && <Button size="sm" variant="outline" onClick={() => updateHappyHour(h.id, { isActive: !h.isActive })}>{h.isActive ? 'Disable' : 'Enable'}</Button>}
                    {canDeleteRestaurant && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteHappyHour(h.id)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {happyHours.length === 0 && <div className="text-center text-muted-foreground py-8">No happy hour rules yet. Create time-based discounts for products.</div>}
        </TabsContent>

        {/* Combos */}
        <TabsContent value="combos">
          <div className="flex justify-end mb-4">{canCreateRestaurant && <Button onClick={() => setShowComboModal(true)}><Plus className="h-4 w-4 mr-1" /> Add Combo</Button>}</div>
          <div className="grid gap-4 md:grid-cols-2">
            {combos.map(c => (
              <Card key={c.id} className={c.isActive ? '' : 'opacity-50'}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Tag className="h-4 w-4" /> {c.name}</span><Badge className={c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></CardTitle></CardHeader>
                <CardContent>
                  {c.description && <p className="text-sm text-muted-foreground mb-2">{c.description}</p>}
                  <div className="text-sm space-y-1 mb-2">{c.items.map(i => <div key={i.id} className="flex justify-between"><span>{i.quantity}× {i.product.name}</span></div>)}</div>
                  <div className="flex justify-between font-medium border-t pt-2"><span>Combo Price</span><span>{c.price.toLocaleString()}</span></div>
                  <div className="flex gap-2 mt-3">
                    {canEditRestaurant && <Button size="sm" variant="outline" onClick={() => updateCombo(c.id, { isActive: !c.isActive, name: c.name, description: c.description, price: c.price, items: c.items.map(i => ({ productId: i.productId, quantity: i.quantity })) })}>{c.isActive ? 'Disable' : 'Enable'}</Button>}
                    {canDeleteRestaurant && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteCombo(c.id)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>}
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

      <Dialog open={showStockAdjustModal} onOpenChange={open => { setShowStockAdjustModal(open); if (!open) setStockAdjustProduct(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{stockAdjustForm.adjustmentType === 'stock_in' ? 'Receive stock' : 'Record stock-out'}{stockAdjustProduct ? ` · ${stockAdjustProduct.name}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Movement</Label><Select value={stockAdjustForm.adjustmentType} onValueChange={adjustmentType => setStockAdjustForm(current => ({ ...current, adjustmentType, reason: adjustmentType === 'stock_in' ? '' : 'Waste / spoilage' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stock_in">Receive / add stock</SelectItem><SelectItem value="stock_out">Waste / remove stock</SelectItem></SelectContent></Select></div>
            <div><Label>Quantity ({stockAdjustProduct?.baseUnit || 'Piece'})</Label><Input type="number" min="1" step="1" value={stockAdjustForm.quantity} onChange={event => setStockAdjustForm(current => ({ ...current, quantity: Number(event.target.value) }))} /></div>
            <div><Label>Reason</Label><Input required value={stockAdjustForm.reason} onChange={event => setStockAdjustForm(current => ({ ...current, reason: event.target.value }))} placeholder={stockAdjustForm.adjustmentType === 'stock_in' ? 'e.g. Opening count correction' : 'e.g. Spoilage, breakage, staff meal'} /></div>
            {stockAdjustForm.adjustmentType === 'stock_out' && stockAdjustProduct && <p className="text-xs text-muted-foreground">Available: {stockAdjustProduct.quantity} {stockAdjustProduct.baseUnit || 'Piece'}. The recorded quantity cannot exceed stock on hand.</p>}
            <p className="text-xs text-muted-foreground">This records an audited quantity movement. Supplier purchases and their costs should still be entered through purchasing.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowStockAdjustModal(false)} disabled={savingStockAdjustment}>Cancel</Button><Button onClick={() => void submitStockAdjustment()} disabled={savingStockAdjustment || !canAdjustStock}>{savingStockAdjustment ? 'Saving…' : 'Record movement'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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
            {canLinkWaiterToHr && <div><Label>HR employee (optional)</Label><Select value={waiterForm.employeeId || 'manual'} onValueChange={value => applyHrEmployeeToWaiterForm(value)}><SelectTrigger><SelectValue placeholder="Create standalone waiter" /></SelectTrigger><SelectContent><SelectItem value="manual">Standalone waiter</SelectItem>{hrWaiterEmployees.map(employee => <SelectItem key={employee.id} value={employee.id}>{[employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ')}{employee.employeeNumber ? ` · ${employee.employeeNumber}` : ''}</SelectItem>)}</SelectContent></Select></div>}
            <div><Label>Name</Label><Input value={waiterForm.name} disabled={Boolean(waiterForm.employeeId)} onChange={e => setWaiterForm({ ...waiterForm, name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={waiterForm.phone} disabled={Boolean(waiterForm.employeeId)} onChange={e => setWaiterForm({ ...waiterForm, phone: e.target.value })} /></div>
            <div><Label>Code</Label><Input value={waiterForm.code} onChange={e => setWaiterForm({ ...waiterForm, code: e.target.value })} placeholder="W1" /></div>
            <div><Label>Waiter PIN</Label><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={waiterForm.pin} onChange={e => setWaiterForm({ ...waiterForm, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="4 to 8 digits" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowWaiterModal(false)}>Cancel</Button><Button onClick={createWaiter}>Add Waiter</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWaiterPinDialog} onOpenChange={open => { setShowWaiterPinDialog(open); if (!open) { setWaiterPin(''); setPinWaiter(null) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Confirm server identity</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter {pinWaiter?.name}’s waiter PIN to assign this shift’s orders to them.</p>
            <div><Label htmlFor="restaurant-waiter-pin">Waiter PIN</Label><Input id="restaurant-waiter-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={waiterPin} onChange={event => setWaiterPin(event.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={event => { if (event.key === 'Enter') void confirmWaiterIdentity() }} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowWaiterPinDialog(false)}>Cancel</Button><Button onClick={confirmWaiterIdentity} disabled={verifyingWaiterPin || waiterPin.length < 4}>{verifyingWaiterPin ? 'Checking…' : 'Confirm'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMenuEntryModal} onOpenChange={open => { setShowMenuEntryModal(open); if (!open) setEditingMenuEntry(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingMenuEntry ? 'Edit restaurant menu item' : 'Add restaurant menu item'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tracked inventory item</Label>
              <Select value={menuForm.productId} disabled={Boolean(editingMenuEntry)} onValueChange={value => {
                const product = products.find(item => item.id === value)
                setMenuForm(current => ({ ...current, productId: value, price: String(product?.price ?? '') }))
              }}>
                <SelectTrigger><SelectValue placeholder="Choose item linked to stock and cost" /></SelectTrigger>
                <SelectContent>{products.filter(product => editingMenuEntry?.productId === product.id || !menuEntries.some(entry => entry.productId === product.id)).map(product => <SelectItem key={product.id} value={product.id}>{product.name} · stock {product.quantity}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Menu pricing and availability are managed here. Stock and recipe ingredients remain linked to inventory.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Menu price</Label><Input type="number" min="0" step="0.01" value={menuForm.price} onChange={event => setMenuForm(current => ({ ...current, price: event.target.value }))} /></div>
              <div><Label>Menu category</Label><Input value={menuForm.category} onChange={event => setMenuForm(current => ({ ...current, category: event.target.value }))} placeholder="Meals, Drinks, Sides" /></div>
              <div><Label>Preparation station</Label><Select value={menuForm.station} onValueChange={station => setMenuForm(current => ({ ...current, station }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kitchen">Kitchen</SelectItem><SelectItem value="bar">Bar</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Description</Label><Input value={menuForm.description} onChange={event => setMenuForm(current => ({ ...current, description: event.target.value }))} placeholder="Menu description or serving notes" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowMenuEntryModal(false)}>Cancel</Button><Button onClick={saveMenuEntry} disabled={editingMenuEntry ? !canEditRestaurant : !canCreateRestaurant}>{editingMenuEntry ? 'Save changes' : 'Add to menu'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Modal */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>New Order</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Table</Label><Select value={orderForm.tableId} onValueChange={v => setOrderForm({ ...orderForm, tableId: v })}><SelectTrigger><SelectValue placeholder="Select table" /></SelectTrigger><SelectContent>{tables.filter(t => t.isActive && t.status === 'available').map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Serving as</Label>{waiters.some(waiter => waiter.isActive) ? <Select value={activeWaiterId || 'unassigned'} onValueChange={requestWaiterIdentity}><SelectTrigger disabled={waiterIdentityConfirmed} aria-label={waiterIdentityConfirmed ? 'Serving waiter is locked until sign out' : 'Select serving waiter'}><SelectValue placeholder="Select waiter" /></SelectTrigger><SelectContent>{!waiterKioskMode && <SelectItem value="unassigned">Select waiter</SelectItem>}{waiters.filter(waiter => waiter.isActive).map(waiter => <SelectItem key={waiter.id} value={waiter.id}>{waiter.name}{waiter.hasPin ? '' : ' · PIN not set'}</SelectItem>)}</SelectContent></Select> : <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">Signed-in cashier</div>}</div>
              <div><Label>Order Type</Label><Select value={orderForm.orderType} onValueChange={v => setOrderForm({ ...orderForm, orderType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dine_in">Dine In</SelectItem><SelectItem value="takeaway">Takeaway</SelectItem><SelectItem value="delivery">Delivery</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Items</Label>
              <Input value={menuSearchQuery} onChange={event => setMenuSearchQuery(event.target.value)} placeholder="Search food and drinks" className="mb-2" />
              <div className="space-y-2">{orderItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Select value={item.productId} onValueChange={v => updateOrderItem(idx, 'productId', v)}><SelectTrigger><SelectValue placeholder="Select menu item" /></SelectTrigger><SelectContent>{menuEntries.filter(entry => entry.isAvailable && entry.product.name.toLowerCase().includes(menuSearchQuery.toLowerCase())).map(entry => <SelectItem key={entry.productId} value={entry.productId}>{entry.product.name} · {entry.price.toLocaleString()}</SelectItem>)}</SelectContent></Select></div>
                  <div className="col-span-2"><Input type="number" min={1} value={item.quantity} onChange={e => updateOrderItem(idx, 'quantity', e.target.value)} /></div>
                  <div className="col-span-3"><Select value={item.station} onValueChange={v => updateOrderItem(idx, 'station', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kitchen">Kitchen</SelectItem><SelectItem value="bar">Bar</SelectItem></SelectContent></Select></div>
                  <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeOrderItem(idx)}>✕</Button></div>
                </div>
              ))}</div>
              <Button size="sm" variant="outline" onClick={addOrderItem} className="mt-2"><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
            </div>
            <div><Label>Special Instructions</Label><Input value={orderForm.specialInstructions} onChange={e => setOrderForm({ ...orderForm, specialInstructions: e.target.value })} placeholder="No onions, extra spicy..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowOrderModal(false)}>Cancel</Button><Button onClick={createOrder} disabled={!canStartOrder || orderItems.length === 0}>Create Order</Button></DialogFooter>
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
            {canLinkWaiterToHr && <div><Label>HR employee (optional)</Label><Select value={editWaiterForm.employeeId || 'manual'} onValueChange={value => applyHrEmployeeToWaiterForm(value, true)}><SelectTrigger><SelectValue placeholder="Choose employee or standalone waiter" /></SelectTrigger><SelectContent><SelectItem value="manual">Standalone waiter</SelectItem>{hrWaiterEmployees.map(employee => <SelectItem key={employee.id} value={employee.id}>{[employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ')}{employee.employeeNumber ? ` · ${employee.employeeNumber}` : ''}</SelectItem>)}</SelectContent></Select></div>}
            <div><Label>Name</Label><Input value={editWaiterForm.name} disabled={Boolean(editWaiterForm.employeeId)} onChange={e => setEditWaiterForm({ ...editWaiterForm, name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={editWaiterForm.phone} disabled={Boolean(editWaiterForm.employeeId)} onChange={e => setEditWaiterForm({ ...editWaiterForm, phone: e.target.value })} /></div>
            <div><Label>Code</Label><Input value={editWaiterForm.code} onChange={e => setEditWaiterForm({ ...editWaiterForm, code: e.target.value })} /></div>
            <div><Label>New waiter PIN</Label><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={editWaiterForm.pin} onChange={e => setEditWaiterForm({ ...editWaiterForm, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="Leave blank to keep the current PIN" /></div>
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

      <Dialog open={showPrinterDialog} onOpenChange={setShowPrinterDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Select kitchen printer</DialogTitle></DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {availablePrinters.map(printer => <Button key={printer.id} variant="outline" className="h-auto w-full justify-between py-3" onClick={() => selectKitchenPrinter(printer.id)}>
              <span className="min-w-0 text-left"><span className="block truncate font-medium">{printer.name}</span><span className="block text-xs text-muted-foreground">{printer.connectionType || 'Local printer'}{printer.status ? ` · ${printer.status}` : ''}</span></span>
              {printer.id === kitchenPrinterId && <Badge>Selected</Badge>}
            </Button>)}
            {availablePrinters.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No printers found. Check that a printer is connected and available to this device.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowPrinterDialog(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
