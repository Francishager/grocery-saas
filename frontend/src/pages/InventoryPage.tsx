import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, ChevronsUpDown, Plus, Search, Edit, Trash2, ScanBarcode, Package, WifiOff } from 'lucide-react'
import { inventoryApi, categoriesApi, branchesApi, type BranchOption, type InventoryItem, type InventoryMovementDetail } from '@/lib/api'
import BarcodeScanner from '@/components/BarcodeScanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalProducts, getLocalBranches } from '@/db/hybrid'
import { queueMutation } from '@/db/sync'
import { UsageLimitBanner } from '@/components/UsageLimitBanner'
import { Pagination } from '@/components/Pagination'
import { usePagination } from '@/hooks/usePagination'
import { db } from '@/db/index'

interface SellingUnit {
  id?: string
  unitName: string
  conversionFactor: number
  sellingPrice: number
  isDefault: boolean
}

interface FormData {
  product_id: string
  product_name: string
  quantity: number | ''
  unit_price: number
  cost_price: number | ''
  low_stock_alert: number
  barcode: string
  sku: string
  batchNumber: string
  expiryDate: string
  categoryId: string
  branchId: string
  baseUnit: string
  itemType: 'product' | 'service' | 'rental'
  description: string
}

type MovementPreset = 'today' | 'yesterday' | 'week' | 'custom'
type StockAdjustmentType = 'stock_in' | 'stock_out'

interface MovementSummary {
  productsSold: number
  unitsSold: number
  receivableUnitsSold: number
  stockReceived: number
  otherStockOut: number
  returns: number
  lowStockProducts: number
  outOfStockProducts: number
}

interface MovementModalState {
  title: string
  rows: InventoryMovementDetail[]
  total: number
}

interface StockAdjustState {
  item: InventoryItem
  adjustmentType: StockAdjustmentType
  quantity: string
  reason: string
}

const initialFormData: FormData = {
  product_id: '',
  product_name: '',
  quantity: '',
  unit_price: 0,
  cost_price: '',
  low_stock_alert: 5,
  barcode: '',
  sku: '',
  batchNumber: '',
  expiryDate: '',
  categoryId: '',
  branchId: '',
  baseUnit: 'Piece',
  itemType: 'product',
  description: '',
}

const emptyMovementSummary: MovementSummary = {
  productsSold: 0,
  unitsSold: 0,
  receivableUnitsSold: 0,
  stockReceived: 0,
  otherStockOut: 0,
  returns: 0,
  lowStockProducts: 0,
  outOfStockProducts: 0,
}

const formatDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const movementParamsForPreset = (preset: MovementPreset, customDate: string) => {
  const today = new Date()
  const start = new Date(today)
  const end = new Date(today)

  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  } else if (preset === 'week') {
    const day = start.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + mondayOffset)
  } else if (preset === 'custom' && customDate) {
    return { from: customDate, to: customDate }
  }

  return { from: formatDateInput(start), to: formatDateInput(end) }
}

const defaultMovementForItem = (item: InventoryItem) => ({
  openingStock: item.quantity || 0,
  stockIn: 0,
  soldToday: 0,
  posSold: 0,
  receivableSold: 0,
  otherStockOut: 0,
  returns: 0,
  closingStock: item.quantity || 0,
  currentStock: item.quantity || 0,
  stockInDetails: [],
  soldDetails: [],
  otherStockOutDetails: [],
  returnDetails: [],
})

const formatQty = (value: number | undefined | null) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0))

export default function InventoryPage() {
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [showUncategorizedOnly, setShowUncategorizedOnly] = useState(false)
  const [sellingUnits, setSellingUnits] = useState<SellingUnit[]>([])
  const [newUnit, setNewUnit] = useState<SellingUnit>({ unitName: '', conversionFactor: 1, sellingPrice: 0, isDefault: false })
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [scannerFailed, setScannerFailed] = useState(false)
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'product'>('all')
  const [movementPreset, setMovementPreset] = useState<MovementPreset>('today')
  const [customMovementDate, setCustomMovementDate] = useState(formatDateInput(new Date()))
  const [movementSummary, setMovementSummary] = useState<MovementSummary>(emptyMovementSummary)
  const [movementModal, setMovementModal] = useState<MovementModalState | null>(null)
  const [stockAdjust, setStockAdjust] = useState<StockAdjustState | null>(null)
  const [stockAdjustSaving, setStockAdjustSaving] = useState(false)
  const { tab: urlTab } = useParams()
  const lockedType = urlTab === 'products' ? 'product' as const : null
  const categoryPickerRef = useRef<HTMLDivElement | null>(null)
  const formRef = useRef<HTMLDivElement | null>(null)
  const { toast } = useToast()
  const { user, hasPermission } = useJWTAuth()
  const online = useOnlineStatus()
  const canCreateProduct = hasPermission('canCreateProduct')
  const canEditProduct = hasPermission('canEditProduct')
  const canDeleteProduct = hasPermission('canDeleteProduct')
  const canAdjustStock = hasPermission('canAdjustStock')

  // Determine create/edit/delete permission based on the active item type
  const activeType = lockedType || itemTypeFilter
  const canCreateCurrent = canCreateProduct
  const canEditCurrent = canEditProduct
  const canDeleteCurrent = canDeleteProduct
  const canManageInventory = canCreateCurrent || canEditCurrent

  const filteredItems = useMemo(() => {
    let result = items
    if (showUncategorizedOnly) {
      result = result.filter((item) => (item as any).isUncategorized)
    }
    return result
  }, [items, showUncategorizedOnly])

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(filteredItems, 10)

  useEffect(() => {
    if (lockedType) setItemTypeFilter(lockedType as 'all' | 'product')
  }, [lockedType])

  useEffect(() => {
    loadCategories()
  }, [lockedType, itemTypeFilter])

  useEffect(() => {
    if (canManageInventory) {
      loadBranches()
      return
    }

    setBranches([])
    setBranchFilter('')
  }, [canManageInventory])

  useEffect(() => {
    loadInventory()
  }, [branchFilter, itemTypeFilter, movementPreset, customMovementDate])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryPickerRef.current &&
        !categoryPickerRef.current.contains(event.target as Node)
      ) {
        setCategoryOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadCategories = async () => {
    try {
      const typeFilter = lockedType || (itemTypeFilter !== 'all' ? itemTypeFilter : undefined)
      const data = await categoriesApi.list(typeFilter)
      setCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load categories:', error)
      toast({
        variant: 'destructive',
        title: 'Failed to load categories',
        description: 'Please refresh the page and try again.',
      })
    }
  }

  const loadBranches = async () => {
    try {
      if (online) {
        const data = await branchesApi.active()
        setBranches(data)
      } else {
        const local = await getLocalBranches()
        setBranches(local as any)
      }
    } catch (error) {
      try {
        const local = await getLocalBranches()
        setBranches(local as any)
      } catch {
        console.error('Failed to load branches:', error)
        toast({
          variant: 'destructive',
          title: 'Failed to load branches',
          description: 'Branch selection is unavailable. Please refresh and try again.',
        })
      }
    }
  }

  const loadInventory = async () => {
    setLoading(true)
    try {
      if (online) {
        const typeFilter = itemTypeFilter === 'all' ? undefined : itemTypeFilter
        const data = await inventoryApi.listWithDailyMovements(
          searchQuery,
          canManageInventory ? branchFilter : undefined,
          typeFilter,
          movementParams
        )
        setItems(Array.isArray(data?.products) ? data.products : [])
        setMovementSummary({ ...emptyMovementSummary, ...(data?.movementSummary || {}) })
      } else {
        const typeFilter = itemTypeFilter === 'all' ? undefined : itemTypeFilter
        const local = await getLocalProducts(searchQuery, canManageInventory ? branchFilter : undefined, typeFilter)
        setItems(local)
        setMovementSummary(emptyMovementSummary)
      }
    } catch (error: any) {
      // API failed — fall back to local
      try {
        const local = await getLocalProducts(searchQuery, canManageInventory ? branchFilter : undefined, itemTypeFilter === 'all' ? undefined : itemTypeFilter)
        setItems(local)
        setMovementSummary(emptyMovementSummary)
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load inventory', description: error?.message || 'Unknown error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadInventory()
  }

  const saveSellingUnits = async (productId: string) => {
    // For edit: delete existing units that were removed, add new ones
    // Simple approach: delete all existing then recreate
    if (editingItem) {
      const existing = (editingItem as any).units || []
      for (const u of existing) {
        if (u.id) await inventoryApi.deleteUnit(productId, u.id)
      }
    }
    for (const u of sellingUnits) {
      await inventoryApi.addUnit(productId, {
        unitName: u.unitName,
        conversionFactor: u.conversionFactor,
        sellingPrice: u.sellingPrice,
        isDefault: u.isDefault,
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.product_name.trim()) {
      toast({ variant: 'destructive', title: 'Product name is required' })
      return
    }
    if (!formData.categoryId) {
      toast({ variant: 'destructive', title: 'Category is required' })
      return
    }
    if (!editingItem && (formData.quantity === '' || typeof formData.quantity !== 'number' || !Number.isFinite(formData.quantity) || formData.quantity < 0)) {
      toast({ variant: 'destructive', title: 'Stock quantity is required and must be a non-negative number' })
      return
    }
    if (!['product', 'service', 'rental'].includes(formData.itemType)) {
      toast({ variant: 'destructive', title: 'Item type is required' })
      return
    }
    if (formData.cost_price === '' || typeof formData.cost_price !== 'number' || !Number.isFinite(formData.cost_price) || formData.cost_price < 0) {
      toast({ variant: 'destructive', title: 'Cost price is required and must be a non-negative number' })
      return
    }
    if (formData.unit_price <= 0) {
      toast({ variant: 'destructive', title: 'Selling price must be greater than 0' })
      return
    }
    if (canManageInventory && branches.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No active branch',
        description: 'Create an active branch before adding branch inventory.',
      })
      return
    }

    if (canManageInventory && !formData.branchId) {
      toast({
        variant: 'destructive',
        title: 'Select a branch',
        description: 'Choose the branch this inventory item belongs to.',
      })
      return
    }

    try {
      if (editingItem) {
        if (!canEditCurrent) {
          toast({ variant: 'destructive', title: 'You do not have permission to edit products' })
          return
        }
        if (online) {
          await inventoryApi.update(String(editingItem.id), formData)
          if (formData.itemType === 'product') await saveSellingUnits(String(editingItem.id))
        } else {
          await db.products.put({
            id: String(editingItem.id),
            name: formData.product_name,
            sku: formData.sku,
            barcode: formData.barcode,
            batchNumber: formData.batchNumber || undefined,
            expiryDate: formData.expiryDate || undefined,
            price: formData.unit_price,
            cost: formData.cost_price,
            quantity: editingItem.quantity,
            minStock: formData.low_stock_alert,
            baseUnit: formData.baseUnit,
            categoryId: formData.categoryId || undefined,
            branchId: formData.branchId || undefined,
            itemType: formData.itemType,
            description: formData.description,
            updatedAt: new Date().toISOString(),
          })
          await queueMutation('products', 'update', String(editingItem.id), {
            ...formData,
            quantity: editingItem.quantity,
          })
        }
        toast({ title: 'Item updated successfully' })
      } else {
        if (!canCreateCurrent) {
          toast({ variant: 'destructive', title: 'You do not have permission to create products' })
          return
        }
        if (online) {
          const result = await inventoryApi.create(formData)
          if (formData.itemType === 'product') {
            const newId = result?.id || (result as any)?.product?.id
            if (newId) await saveSellingUnits(String(newId))
          }
        } else {
          const newId = `offline-${Date.now()}`
          await db.products.put({
            id: newId,
            name: formData.product_name,
            sku: formData.sku,
            barcode: formData.barcode,
            batchNumber: formData.batchNumber || undefined,
            expiryDate: formData.expiryDate || undefined,
            price: formData.unit_price,
            cost: formData.cost_price,
            quantity: formData.quantity,
            minStock: formData.low_stock_alert,
            baseUnit: formData.baseUnit,
            categoryId: formData.categoryId || undefined,
            branchId: formData.branchId || undefined,
            itemType: formData.itemType,
            description: formData.description,
            updatedAt: new Date().toISOString(),
          })
          await queueMutation('products', 'create', newId, formData)
        }
        toast({ title: 'Item created successfully' })
      }
      closeForm()
      loadInventory()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to save item',
        description: error?.message || 'Unknown error',
      })
    }
  }

  const handleDelete = async (id: string | number) => {
    if (!confirm('Are you sure you want to delete this item?')) return

    try {
      if (online) {
        await inventoryApi.delete(String(id))
      } else {
        await db.products.delete(String(id))
        await queueMutation('products', 'delete', String(id))
      }
      toast({ title: 'Item deleted successfully' })
      loadInventory()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete item',
        description: error?.message || 'Unknown error',
      })
    }
  }

  const openStockAdjust = (item: InventoryItem, adjustmentType: StockAdjustmentType = 'stock_in') => {
    if (!canAdjustStock) {
      toast({ variant: 'destructive', title: 'You do not have permission to adjust stock' })
      return
    }
    if (!online) {
      toast({ variant: 'destructive', title: 'Stock adjustment requires an internet connection' })
      return
    }
    setStockAdjust({
      item,
      adjustmentType,
      quantity: '',
      reason: adjustmentType === 'stock_in' ? 'Restock' : '',
    })
  }

  const closeStockAdjust = () => {
    setStockAdjust(null)
    setStockAdjustSaving(false)
  }

  const handleStockAdjustSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!stockAdjust) return

    const quantity = Number(stockAdjust.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast({ variant: 'destructive', title: 'Enter a positive whole-number quantity' })
      return
    }
    if (stockAdjust.adjustmentType === 'stock_out' && quantity > Number(stockAdjust.item.quantity || 0)) {
      toast({ variant: 'destructive', title: 'Stock out cannot exceed current stock' })
      return
    }

    setStockAdjustSaving(true)
    try {
      await inventoryApi.adjustStock(String(stockAdjust.item.id), {
        adjustmentType: stockAdjust.adjustmentType,
        quantity,
        reason: stockAdjust.reason.trim() || undefined,
        branchId: stockAdjust.item.branchId || stockAdjust.item.branch?.id || null,
      })
      toast({ title: stockAdjust.adjustmentType === 'stock_in' ? 'Stock received' : 'Stock adjusted' })
      closeStockAdjust()
      loadInventory()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to adjust stock',
        description: error?.message || 'Unknown error',
      })
    } finally {
      setStockAdjustSaving(false)
    }
  }

  const openEditForm = (item: InventoryItem) => {
    setEditingItem(item)
    setFormData({
      product_id: item.product_id || '',
      product_name: item.product_name || '',
      quantity: item.quantity || 0,
      unit_price: item.unit_price || 0,
      cost_price: item.cost_price || 0,
      low_stock_alert: item.low_stock_alert || 5,
      barcode: (item as any).barcode || '',
      sku: (item as any).sku || '',
      batchNumber: (item as any).batchNumber || '',
      expiryDate: (item as any).expiryDate ? String((item as any).expiryDate).slice(0, 10) : '',
      categoryId: (item as any).categoryId ? String((item as any).categoryId) : '',
      branchId: (item as any).branchId || (item as any).branch?.id || (branches.length === 1 ? branches[0].id : ''),
      baseUnit: (item as any).baseUnit || 'Piece',
      itemType: item.itemType || 'product',
      description: (item as any).description || '',
    })
    // Load selling units for this product
    const units = (item as any).units || []
    setSellingUnits(units.map((u: any) => ({ id: u.id, unitName: u.unitName, conversionFactor: u.conversionFactor, sellingPrice: u.sellingPrice, isDefault: u.isDefault })))
    setCategoryOpen(false)
    setCategoryQuery('')
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const openNewForm = () => {
    setEditingItem(null)
    setFormData({
      ...initialFormData,
      itemType: lockedType || 'product',
      branchId: branches.length === 1 ? branches[0].id : '',
    })
    setSellingUnits([])
    setNewUnit({ unitName: '', conversionFactor: 1, sellingPrice: 0, isDefault: false })
    setCategoryOpen(false)
    setCategoryQuery('')
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingItem(null)
    setFormData(initialFormData)
    setSellingUnits([])
    setNewUnit({ unitName: '', conversionFactor: 1, sellingPrice: 0, isDefault: false })
    setShowBarcodeScanner(false)
    setScannerFailed(false)
    setCategoryOpen(false)
    setCategoryQuery('')
  }

  const addSellingUnit = () => {
    if (!newUnit.unitName || newUnit.conversionFactor <= 0) return
    setSellingUnits(prev => [...prev, { ...newUnit }])
    setNewUnit({ unitName: '', conversionFactor: 1, sellingPrice: 0, isDefault: false })
  }

  const removeSellingUnit = (idx: number) => {
    setSellingUnits(prev => prev.filter((_, i) => i !== idx))
  }

  const selectedCategory = categories.find(
    (category) => String(category.id) === formData.categoryId
  )

  const filteredCategories = useMemo(() => {
    const query = categoryQuery.trim().toLowerCase()

    if (!query) return categories

    return categories.filter((category) =>
      category.name.toLowerCase().includes(query)
    )
  }, [categories, categoryQuery])

  const branchNameById = useMemo(() => {
    return new Map(branches.map((branch) => [String(branch.id), branch.name]))
  }, [branches])

  const movementParams = useMemo(
    () => movementParamsForPreset(movementPreset, customMovementDate),
    [movementPreset, customMovementDate]
  )

  const movementPeriodLabel = useMemo(() => {
    if (movementPreset === 'today') return 'Today'
    if (movementPreset === 'yesterday') return 'Yesterday'
    if (movementPreset === 'week') return 'This Week'
    return customMovementDate ? new Date(customMovementDate).toLocaleDateString() : 'Custom Date'
  }, [movementPreset, customMovementDate])

  const openMovementModal = (item: InventoryItem, kind: 'sold' | 'other' | 'stock_in') => {
    const movement = item.dailyMovement || defaultMovementForItem(item)
    const rows = kind === 'sold'
      ? movement.soldDetails || []
      : kind === 'stock_in'
        ? movement.stockInDetails || []
        : movement.otherStockOutDetails || []
    setMovementModal({
      title: `${item.product_name} - ${kind === 'sold' ? 'Sold Today' : kind === 'stock_in' ? 'Stock In' : 'Other Stock Out'}`,
      rows,
      total: kind === 'sold' ? movement.soldToday : kind === 'stock_in' ? movement.stockIn : movement.otherStockOut,
    })
  }

  const movementCards = [
    { label: 'Products Sold', value: movementSummary.productsSold },
    { label: 'Units Sold', value: movementSummary.unitsSold },
    { label: 'Receivable Units', value: movementSummary.receivableUnitsSold },
    { label: 'Stock Received', value: movementSummary.stockReceived },
    { label: 'Other Stock Out', value: movementSummary.otherStockOut },
    { label: 'Returns', value: movementSummary.returns },
    { label: 'Low Stock', value: movementSummary.lowStockProducts },
    { label: 'Out of Stock', value: movementSummary.outOfStockProducts },
  ]

  const stockAdjustQuantity = Number(stockAdjust?.quantity || 0)
  const stockAdjustProjectedQuantity = stockAdjust
    ? stockAdjust.adjustmentType === 'stock_in'
      ? Number(stockAdjust.item.quantity || 0) + (Number.isFinite(stockAdjustQuantity) ? stockAdjustQuantity : 0)
      : Number(stockAdjust.item.quantity || 0) - (Number.isFinite(stockAdjustQuantity) ? stockAdjustQuantity : 0)
    : 0

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {urlTab === 'products' ? 'Products' :
             urlTab === 'services' ? 'Services' :
             urlTab === 'rentals' ? 'Rental Items' :
             urlTab === 'lubricants' ? 'Lubricants & Dry Stock' :
             urlTab === 'convenience' ? 'Convenience Shop' :
             'Items'}
          </h1>
          <p className="text-muted-foreground">
            {urlTab === 'products' ? 'Manage your product inventory' :
             urlTab === 'services' ? 'Manage service items' :
             urlTab === 'rentals' ? 'Manage rental items' :
             urlTab === 'lubricants' ? 'Manage lubricants and dry stock inventory' :
             urlTab === 'convenience' ? 'Manage convenience shop inventory' :
             'Manage your products'}
          </p>
        </div>
        {canCreateCurrent && (
          <Button onClick={openNewForm}>
            <Plus className="mr-2 h-4 w-4" />
            {lockedType === 'product' ? 'Add Product' : 'Add Item'}
          </Button>
        )}
      </div>

      <UsageLimitBanner resource="products" label="Products" currentCount={items.length} />

      {/* Search + Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {!lockedType && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setItemTypeFilter('all')}
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              itemTypeFilter === 'all'
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setItemTypeFilter('product')}
            className={cn(
              "flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              itemTypeFilter === 'product'
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Products
          </button>
        </div>
        )}
        {canManageInventory && branches.length > 1 && (
          <select
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
            className="h-10 min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm"
            aria-label="Filter by branch"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        )}
        <div className="flex flex-wrap gap-1">
          {([
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['week', 'This Week'],
            ['custom', 'Custom Date'],
          ] as Array<[MovementPreset, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMovementPreset(value)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                movementPreset === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {movementPreset === 'custom' && (
          <Input
            type="date"
            value={customMovementDate}
            onChange={(event) => setCustomMovementDate(event.target.value)}
            className="h-10 w-auto"
          />
        )}
        <button
          type="button"
          onClick={() => setShowUncategorizedOnly(!showUncategorizedOnly)}
          className={cn(
            "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            showUncategorizedOnly
              ? "border-yellow-300 bg-yellow-100 text-yellow-700"
              : "border-input bg-background text-muted-foreground hover:bg-muted"
          )}
        >
          {showUncategorizedOnly ? '✓ Uncategorized Only' : 'Show Uncategorized'}
        </button>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {!online && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <WifiOff className="h-4 w-4" />
          Daily movement figures are available when the device is online.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {movementCards.map((card) => (
          <div key={card.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-xl font-bold">{formatQty(card.value)}</p>
            <p className="text-[11px] text-muted-foreground">{movementPeriodLabel}</p>
          </div>
        ))}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card ref={formRef as any}>
          <CardHeader>
            <CardTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              {/* Item Type Toggle - removed service/rental, only product */}
              {!lockedType && (
              <div className="sm:col-span-2 space-y-2">
                <Label>Item Type <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, itemType: 'product' }))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                      formData.itemType === 'product'
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Package className="h-4 w-4" />
                    Product
                  </button>
                </div>
              </div>
              )}

              {/* Common: Name */}
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, product_name: e.target.value }))
                  }
                  required
                />
              </div>

              {/* Common: Selling Price */}
              <div className="space-y-2">
                <Label htmlFor="unit_price">Selling Price</Label>
                <Input
                  id="unit_price"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.unit_price}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      unit_price: parseFloat(e.target.value) || 0,
                    }))
                  }
                  required
                />
              </div>

              {/* Product fields */}
              {formData.itemType === 'product' && (
                <>
              <div className="space-y-2">
                <Label htmlFor="product_id">SKU / Product ID</Label>
                <Input
                  id="product_id"
                  value={formData.product_id || 'Auto-generated from product name'}
                  disabled
                  className="bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">A unique SKU will be generated automatically when the item is saved, using the category and product name with a dynamic identifier.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">Barcode</Label>
                <div className="flex gap-2">
                  <Input
                    id="barcode"
                    value={formData.barcode}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, barcode: e.target.value }))
                    }
                    placeholder="Scan or enter barcode"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => { setShowBarcodeScanner(!showBarcodeScanner); if (!showBarcodeScanner) setScannerFailed(false) }}
                  >
                    <ScanBarcode className="h-4 w-4" />
                  </Button>
                </div>
                {showBarcodeScanner && (
                  <div className="mt-2">
                    <BarcodeScanner
                      onScan={(code) => {
                        setFormData((prev) => ({ ...prev, barcode: code }))
                        setShowBarcodeScanner(false)
                        setScannerFailed(false)
                        toast({ title: 'Barcode captured', description: code })
                      }}
                      onClose={() => setShowBarcodeScanner(false)}
                      onFail={() => { setShowBarcodeScanner(false); setScannerFailed(true) }}
                      placeholder="Scan barcode for this item..."
                    />
                  </div>
                )}
              </div>
                </>
              )}

              {formData.itemType === 'product' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="batchNumber">Batch Number</Label>
                    <Input
                      id="batchNumber"
                      value={formData.batchNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, batchNumber: e.target.value }))}
                      placeholder="e.g. BATCH-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiryDate">Expiry Date</Label>
                    <Input
                      id="expiryDate"
                      type="date"
                      value={formData.expiryDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, expiryDate: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {/* Category - shared but filtered by type */}
              <div className="space-y-2">
                <Label>Category <span className="text-red-500">*</span></Label>

                <div className="relative" ref={categoryPickerRef}>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryOpen}
                    className={cn("w-full justify-between", !formData.categoryId && "border-red-500")}
                    onClick={() => setCategoryOpen((current) => !current)}
                  >
                    <span className={cn("truncate", !selectedCategory && "text-muted-foreground")}>
                      {selectedCategory?.name || "Select category"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>

                  {categoryOpen && (
                    <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={categoryQuery}
                          onChange={(e) => setCategoryQuery(e.target.value)}
                          placeholder="Search category..."
                          className="pl-8"
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto pr-1">
                        {filteredCategories.length === 0 ? (
                          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                            {categories.length === 0
                              ? 'No categories available'
                              : 'No category found'}
                          </div>
                        ) : (
                          filteredCategories.map((category) => {
                            const categoryId = String(category.id)
                            const isSelected = formData.categoryId === categoryId

                            return (
                              <button
                                key={categoryId}
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                                  isSelected && "bg-muted font-medium"
                                )}
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    categoryId,
                                  }))
                                  setCategoryQuery('')
                                  setCategoryOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "h-4 w-4",
                                    isSelected ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="truncate">{category.name}</span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {canManageInventory && (
                <div className="space-y-2">
                  <Label htmlFor="branchId">Branch</Label>
                  <select
                    id="branchId"
                    value={formData.branchId}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, branchId: e.target.value }))
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    disabled={branches.length === 0}
                    required
                  >
                    <option value="">
                      {branches.length === 0 ? 'No active branches' : 'Select branch'}
                    </option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Product: Quantity, Low Stock, Cost Price, Base Unit */}
              {formData.itemType === 'product' && (
                <>
              {editingItem ? (
                <div className="space-y-2">
                  <Label>Current Stock</Label>
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <span className="font-semibold tabular-nums">
                      {formatQty(editingItem.quantity)} {formData.baseUnit || 'Piece'}
                    </span>
                    {canAdjustStock && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => openStockAdjust(editingItem, 'stock_in')}>
                        <Plus className="h-3.5 w-3.5" />
                        Stock In
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="quantity">Opening Stock <span className="text-red-500">*</span></Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    required
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        quantity: e.target.value === '' ? '' : parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="low_stock_alert">Low Stock Alert</Label>
                <Input
                  id="low_stock_alert"
                  type="number"
                  min="0"
                  value={formData.low_stock_alert}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      low_stock_alert: parseInt(e.target.value) || 5,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost_price">Cost Price <span className="text-red-500">*</span></Label>
                <Input
                  id="cost_price"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={formData.cost_price}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      cost_price: e.target.value === '' ? '' : parseFloat(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseUnit">Base Unit</Label>
                <Input
                  id="baseUnit"
                  value={formData.baseUnit}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, baseUnit: e.target.value }))
                  }
                  placeholder="e.g. KG, Bottle, Piece, Tablet"
                />
              </div>
                </>
              )}

              {/* Selling Units - product only */}
              {formData.itemType === 'product' && (
              <div className="sm:col-span-2 space-y-3 border rounded-lg p-4">
                <Label className="text-base font-semibold">Selling Units (Multi-UOM)</Label>
                <p className="text-xs text-muted-foreground">Add different selling units with conversion factors and prices. Stock is tracked in the base unit ({formData.baseUnit || 'Piece'}).</p>
                {sellingUnits.length > 0 && (
                  <div className="space-y-2">
                    {sellingUnits.map((u, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                        <span className="flex-1 text-sm font-medium">{u.unitName}</span>
                        <span className="text-xs text-muted-foreground">{u.conversionFactor} {formData.baseUnit}</span>
                        <span className="text-sm">{formatCurrency(u.sellingPrice)}</span>
                        {u.isDefault && <span className="text-xs text-primary font-medium">Default</span>}
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSellingUnit(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs">Unit Name</Label>
                    <Input value={newUnit.unitName} onChange={e => setNewUnit(prev => ({ ...prev, unitName: e.target.value }))} placeholder="e.g. Half KG" className="h-8 text-sm" />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs">Factor</Label>
                    <Input type="number" step="any" min="0.01" value={newUnit.conversionFactor} onChange={e => setNewUnit(prev => ({ ...prev, conversionFactor: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">Price</Label>
                    <Input type="number" step="any" min="0" value={newUnit.sellingPrice} onChange={e => setNewUnit(prev => ({ ...prev, sellingPrice: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm" />
                  </div>
                  <label className="flex items-center gap-1 text-xs h-8">
                    <input type="checkbox" checked={newUnit.isDefault} onChange={e => setNewUnit(prev => ({ ...prev, isDefault: e.target.checked }))} className="rounded" />
                    Default
                  </label>
                  <Button type="button" variant="secondary" size="sm" onClick={addSellingUnit} className="h-8" disabled={!newUnit.unitName || newUnit.conversionFactor <= 0}>
                    <Plus className="h-3 w-3 mr-1" />Add
                  </Button>
                </div>
              </div>
              )}

              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit">
                  {editingItem ? 'Update Item' : 'Add Item'}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {itemTypeFilter === 'all' ? 'All Items' : itemTypeFilter === 'product' ? 'Products' : itemTypeFilter === 'service' ? 'Services' : 'Rentals'} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No items found</p>
              <Button onClick={openNewForm}>
                <Plus className="mr-2 h-4 w-4" />
                {lockedType === 'product' ? 'Add First Product' : 'Add First Item'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] hidden md:table">
                <thead>
                  <tr className="border-b text-left">
                    {!lockedType && <th className="pb-3 font-medium">Type</th>}
                    <th className="pb-3 font-medium">SKU</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Category</th>
                    {canManageInventory && <th className="pb-3 font-medium">Branch</th>}
                    <th className="pb-3 font-medium text-right">Opening Stock</th>
                    <th className="pb-3 font-medium text-right">Stock In</th>
                    <th className="pb-3 font-medium text-right">Sold Today</th>
                    <th className="pb-3 font-medium text-right">Other Stock Out</th>
                    <th className="pb-3 font-medium text-right">Returns</th>
                    <th className="pb-3 font-medium text-right">{movementPreset === 'today' ? 'Current Stock' : 'Closing Stock'}</th>
                    <th className="pb-3 font-medium">Batch</th>
                    <th className="pb-3 font-medium">Expiry</th>
                    <th className="pb-3 font-medium text-right">Cost</th>
                    <th className="pb-3 font-medium text-right">Price</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    const movement = item.dailyMovement || defaultMovementForItem(item)
                    const stockStatus = movement.currentStock <= 0
                      ? 'Out of Stock'
                      : movement.currentStock <= item.low_stock_alert
                        ? 'Low Stock'
                        : 'In Stock'
                    return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                      {!lockedType && (
                      <td className="py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          "bg-green-100 text-green-700"
                        )}
                        >
                          <Package className="h-3 w-3" />
                          Product
                        </span>
                      </td>
                      )}
                      <td className="py-3">{item.product_id || '-'}</td>
                      <td className="py-3 font-medium">{item.product_name}</td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {item.categoryName || categoryNameById.get(String(item.categoryId || '')) || '-'}
                      </td>
                      {canManageInventory && (
                        <td className="py-3 text-sm text-muted-foreground">
                          {item.branch?.name || branchNameById.get(String(item.branchId || '')) || '-'}
                        </td>
                      )}
                      <td className="py-3 text-right tabular-nums">{formatQty(movement.openingStock)}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openMovementModal(item, 'stock_in')}
                          disabled={!movement.stockIn}
                          className={cn(
                            "rounded px-2 py-1 text-right font-semibold tabular-nums",
                            movement.stockIn ? "text-green-700 hover:bg-green-100" : "cursor-default text-muted-foreground"
                          )}
                        >
                          {formatQty(movement.stockIn)}
                        </button>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openMovementModal(item, 'sold')}
                          disabled={!movement.soldToday}
                          className={cn(
                            "rounded px-2 py-1 text-right font-semibold tabular-nums",
                            movement.soldToday ? "text-primary hover:bg-primary/10" : "cursor-default text-muted-foreground"
                          )}
                        >
                          {formatQty(movement.soldToday)}
                        </button>
                        {movement.receivableSold > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {formatQty(movement.receivableSold)} receivable
                          </p>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openMovementModal(item, 'other')}
                          disabled={!movement.otherStockOut}
                          className={cn(
                            "rounded px-2 py-1 text-right font-semibold tabular-nums",
                            movement.otherStockOut ? "text-orange-700 hover:bg-orange-100" : "cursor-default text-muted-foreground"
                          )}
                        >
                          {formatQty(movement.otherStockOut)}
                        </button>
                      </td>
                      <td className="py-3 text-right tabular-nums">{formatQty(movement.returns)}</td>
                      <td className="py-3 text-right">
                        <span className={cn(
                          "font-bold tabular-nums",
                          movement.currentStock <= item.low_stock_alert ? "text-orange-600" : ""
                        )}>
                          {formatQty(movementPreset === 'today' ? movement.currentStock : movement.closingStock)}
                        </span>
                        {movementPreset !== 'today' && (
                          <p className="text-[11px] text-muted-foreground">
                            Current today: {formatQty(movement.currentStock)}
                          </p>
                        )}
                      </td>
                      <td className="py-3">{(item as any).batchNumber || '-'}</td>
                      <td className="py-3">{(item as any).expiryDate ? new Date((item as any).expiryDate).toLocaleDateString() : '-'}</td>
                      <td className="py-3 text-right">
                        {formatCurrency(item.cost_price)}
                      </td>
                      <td className="py-3 text-right">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="py-3">
                        <span className={cn(
                          "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                          stockStatus === 'Out of Stock'
                            ? "bg-red-100 text-red-700"
                            : stockStatus === 'Low Stock'
                              ? "bg-orange-100 text-orange-700"
                              : "bg-green-100 text-green-700"
                        )}>
                          {stockStatus}
                        </span>
                        {(item as any).isUncategorized && (
                          <span className="ml-1 inline-block px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-semibold rounded">
                            Uncategorized
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {canAdjustStock && item.itemType !== 'service' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Stock In"
                              onClick={() => openStockAdjust(item, 'stock_in')}
                            >
                              <Plus className="h-4 w-4 text-green-700" />
                            </Button>
                          )}
                          {canEditCurrent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditForm(item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeleteCurrent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Mobile card layout */}
              <div className="md:hidden space-y-3">
                {paginatedItems.map((item) => {
                  const movement = item.dailyMovement || defaultMovementForItem(item)
                  const stockStatus = movement.currentStock <= 0
                    ? 'Out of Stock'
                    : movement.currentStock <= item.low_stock_alert
                      ? 'Low Stock'
                      : 'In Stock'
                  return (
                  <div key={item.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{item.product_id || '-'}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {canAdjustStock && item.itemType !== 'service' && (
                          <Button variant="ghost" size="icon" title="Stock In" className="h-8 w-8" onClick={() => openStockAdjust(item, 'stock_in')}>
                            <Plus className="h-4 w-4 text-green-700" />
                          </Button>
                        )}
                        {canEditCurrent && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {canDeleteCurrent && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-sm">
                      <div>
                        <span className="text-muted-foreground">Category: </span>
                        {item.categoryName || categoryNameById.get(String(item.categoryId || '')) || '-'}
                      </div>
                      {canManageInventory && (
                        <div>
                          <span className="text-muted-foreground">Branch: </span>
                          {item.branch?.name || branchNameById.get(String(item.branchId || '')) || '-'}
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Qty: </span>
                        <span className={item.quantity <= item.low_stock_alert ? 'text-orange-600 font-bold' : ''}>
                          {item.quantity}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Opening: </span>
                        {formatQty(movement.openingStock)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stock In: </span>
                        <button
                          type="button"
                          disabled={!movement.stockIn}
                          onClick={() => openMovementModal(item, 'stock_in')}
                          className={cn("font-semibold", movement.stockIn ? "text-green-700 underline-offset-2 hover:underline" : "text-muted-foreground")}
                        >
                          {formatQty(movement.stockIn)}
                        </button>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sold Today: </span>
                        <button
                          type="button"
                          disabled={!movement.soldToday}
                          onClick={() => openMovementModal(item, 'sold')}
                          className={cn("font-semibold", movement.soldToday ? "text-primary underline-offset-2 hover:underline" : "text-muted-foreground")}
                        >
                          {formatQty(movement.soldToday)}
                        </button>
                        {movement.receivableSold > 0 && (
                          <span className="text-muted-foreground"> ({formatQty(movement.receivableSold)} receivable)</span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Other Out: </span>
                        <button
                          type="button"
                          disabled={!movement.otherStockOut}
                          onClick={() => openMovementModal(item, 'other')}
                          className={cn("font-semibold", movement.otherStockOut ? "text-orange-700 underline-offset-2 hover:underline" : "text-muted-foreground")}
                        >
                          {formatQty(movement.otherStockOut)}
                        </button>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Returns: </span>
                        {formatQty(movement.returns)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{movementPreset === 'today' ? 'Current Stock' : 'Closing Stock'}: </span>
                        <span className={movement.currentStock <= item.low_stock_alert ? 'text-orange-600 font-bold' : 'font-semibold'}>
                          {formatQty(movementPreset === 'today' ? movement.currentStock : movement.closingStock)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status: </span>
                        {stockStatus}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Expiry: </span>
                        {(item as any).expiryDate ? new Date((item as any).expiryDate).toLocaleDateString() : '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Price: </span>
                        {formatCurrency(item.unit_price)}
                      </div>
                    </div>
                    {(item as any).isUncategorized && (
                      <span className="inline-block px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-semibold rounded">
                        Uncategorized
                      </span>
                    )}
                  </div>
                  )
                })}
              </div>
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={goToPage}
          />
        </CardContent>
      </Card>

      {stockAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-background shadow-xl">
            <form onSubmit={handleStockAdjustSubmit}>
              <div className="border-b px-4 py-3">
                <h2 className="text-lg font-semibold">Adjust Stock</h2>
                <p className="text-sm text-muted-foreground">{stockAdjust.item.product_name}</p>
              </div>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Current Stock</p>
                    <p className="mt-1 font-bold tabular-nums">{formatQty(stockAdjust.item.quantity)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">New Stock</p>
                    <p className={cn("mt-1 font-bold tabular-nums", stockAdjustProjectedQuantity < 0 && "text-destructive")}>
                      {formatQty(stockAdjustProjectedQuantity)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Operation</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['stock_in', 'Stock In'],
                      ['stock_out', 'Stock Out'],
                    ] as Array<[StockAdjustmentType, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStockAdjust((prev) => prev ? { ...prev, adjustmentType: value, reason: value === 'stock_in' && !prev.reason ? 'Restock' : prev.reason } : prev)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          stockAdjust.adjustmentType === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stockAdjustQuantity">Quantity</Label>
                  <Input
                    id="stockAdjustQuantity"
                    type="number"
                    min="1"
                    step="1"
                    value={stockAdjust.quantity}
                    onChange={(event) => setStockAdjust((prev) => prev ? { ...prev, quantity: event.target.value } : prev)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stockAdjustReason">Reason</Label>
                  <Input
                    id="stockAdjustReason"
                    value={stockAdjust.reason}
                    onChange={(event) => setStockAdjust((prev) => prev ? { ...prev, reason: event.target.value } : prev)}
                    placeholder={stockAdjust.adjustmentType === 'stock_in' ? 'Restock' : 'Damage, expiry, correction'}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t px-4 py-3">
                <Button type="button" variant="outline" onClick={closeStockAdjust} disabled={stockAdjustSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={stockAdjustSaving || stockAdjustProjectedQuantity < 0}>
                  {stockAdjustSaving ? 'Saving...' : stockAdjust.adjustmentType === 'stock_in' ? 'Record Stock In' : 'Record Stock Out'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {movementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">{movementModal.title}</h2>
                <p className="text-sm text-muted-foreground">{movementPeriodLabel} total: {formatQty(movementModal.total)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMovementModal(null)}>
                Close
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-4">
              {movementModal.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No movement details for this period.</p>
              ) : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Time</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Reference</th>
                      <th className="pb-2 text-right font-medium">Qty</th>
                      <th className="pb-2 font-medium">Reason/Status</th>
                      <th className="pb-2 font-medium">Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementModal.rows.map((row, index) => (
                      <tr key={`${row.reference || index}-${index}`} className="border-b last:border-0">
                        <td className="py-2">{row.time ? new Date(row.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                        <td className="py-2">{row.type || '-'}</td>
                        <td className="py-2 font-mono text-xs">{row.reference || '-'}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{formatQty(row.quantity)}</td>
                        <td className="py-2">{row.reason || row.status || '-'}</td>
                        <td className="py-2">{row.staff || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-bold">
                      <td className="py-2" colSpan={3}>Total</td>
                      <td className="py-2 text-right tabular-nums">{formatQty(movementModal.total)}</td>
                      <td className="py-2" colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
