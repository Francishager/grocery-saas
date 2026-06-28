import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronsUpDown, Plus, Search, Edit, Trash2, ScanBarcode, Package, Wrench, Clock } from 'lucide-react'
import { inventoryApi, categoriesApi, branchesApi, type BranchOption, type InventoryItem } from '@/lib/api'
import BarcodeScanner from '@/components/BarcodeScanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

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
  quantity: number
  unit_price: number
  cost_price: number
  low_stock_alert: number
  barcode: string
  sku: string
  categoryId: string
  branchId: string
  baseUnit: string
  itemType: 'product' | 'service' | 'rental'
  serviceCategory: string
  estimatedHours: number
  duration: string
  description: string
  rentalPrice: number
  rentalPeriod: string
  depositAmount: number
  replacementValue: number
}

const initialFormData: FormData = {
  product_id: '',
  product_name: '',
  quantity: 0,
  unit_price: 0,
  cost_price: 0,
  low_stock_alert: 5,
  barcode: '',
  sku: '',
  categoryId: '',
  branchId: '',
  baseUnit: 'Piece',
  itemType: 'product',
  serviceCategory: '',
  estimatedHours: 0,
  duration: '',
  description: '',
  rentalPrice: 0,
  rentalPeriod: 'daily',
  depositAmount: 0,
  replacementValue: 0,
}

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
  const [sellingUnits, setSellingUnits] = useState<SellingUnit[]>([])
  const [newUnit, setNewUnit] = useState<SellingUnit>({ unitName: '', conversionFactor: 1, sellingPrice: 0, isDefault: false })
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [scannerFailed, setScannerFailed] = useState(false)
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'product' | 'service' | 'rental'>('all')
  const [searchParams] = useSearchParams()
  const lockedType = searchParams.get('type') as 'product' | 'service' | 'rental' | null
  const categoryPickerRef = useRef<HTMLDivElement | null>(null)
  const { toast } = useToast()
  const { user, hasPermission } = useJWTAuth()
  const canCreateProduct = hasPermission('canCreateProduct')
  const canEditProduct = hasPermission('canEditProduct')
  const canCreateService = hasPermission('canCreateService')
  const canEditService = hasPermission('canEditService')
  const canCreateRental = hasPermission('canCreateRental')
  const canEditRental = hasPermission('canEditRental')
  const canDeleteProduct = hasPermission('canDeleteProduct')
  const canDeleteService = hasPermission('canDeleteService')
  const canDeleteRental = hasPermission('canDeleteRental')
  const canAdjustStock = hasPermission('canAdjustStock')

  // Determine create/edit/delete permission based on the active item type
  const activeType = lockedType || itemTypeFilter
  const canCreateCurrent =
    activeType === 'service' ? canCreateService :
    activeType === 'rental' ? canCreateRental :
    activeType === 'product' ? canCreateProduct :
    canCreateProduct || canCreateService || canCreateRental
  const canEditCurrent =
    activeType === 'service' ? canEditService :
    activeType === 'rental' ? canEditRental :
    activeType === 'product' ? canEditProduct :
    canEditProduct || canEditService || canEditRental
  const canDeleteCurrent =
    activeType === 'service' ? canDeleteService :
    activeType === 'rental' ? canDeleteRental :
    activeType === 'product' ? canDeleteProduct :
    canDeleteProduct || canDeleteService || canDeleteRental
  const canManageInventory = canCreateCurrent || canEditCurrent

  useEffect(() => {
    if (lockedType) setItemTypeFilter(lockedType)
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
  }, [branchFilter, itemTypeFilter])

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
      const data = await branchesApi.active()
      setBranches(data)
    } catch (error) {
      console.error('Failed to load branches:', error)
      toast({
        variant: 'destructive',
        title: 'Failed to load branches',
        description: 'Branch selection is unavailable. Please refresh and try again.',
      })
    }
  }

  const loadInventory = async () => {
    setLoading(true)
    try {
      const typeFilter = itemTypeFilter === 'all' ? undefined : itemTypeFilter
      const data = await inventoryApi.list(searchQuery, canManageInventory ? branchFilter : undefined, typeFilter)
      setItems(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load inventory',
        description: error?.message || 'Unknown error',
      })
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
        await inventoryApi.update(String(editingItem.id), formData)
        // Save selling units only for products
        if (formData.itemType === 'product') await saveSellingUnits(String(editingItem.id))
        toast({ title: 'Item updated successfully' })
      } else {
        const result = await inventoryApi.create(formData)
        // Save selling units only for new products
        if (formData.itemType === 'product') {
          const newId = result?.id || (result as any)?.product?.id
          if (newId) await saveSellingUnits(String(newId))
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
      await inventoryApi.delete(String(id))
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
      categoryId: (item as any).categoryId ? String((item as any).categoryId) : '',
      branchId: (item as any).branchId || (item as any).branch?.id || (branches.length === 1 ? branches[0].id : ''),
      baseUnit: (item as any).baseUnit || 'Piece',
      itemType: (item as any).itemType || 'product',
      serviceCategory: (item as any).serviceCategory || '',
      estimatedHours: (item as any).estimatedHours || 0,
      duration: (item as any).duration || '',
      description: (item as any).description || '',
      rentalPrice: (item as any).rentalPrice || 0,
      rentalPeriod: (item as any).rentalPeriod || 'daily',
      depositAmount: (item as any).depositAmount || 0,
      replacementValue: (item as any).replacementValue || 0,
    })
    // Load selling units for this product
    const units = (item as any).units || []
    setSellingUnits(units.map((u: any) => ({ id: u.id, unitName: u.unitName, conversionFactor: u.conversionFactor, sellingPrice: u.sellingPrice, isDefault: u.isDefault })))
    setCategoryOpen(false)
    setCategoryQuery('')
    setShowForm(true)
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {lockedType === 'service' ? 'Services' : lockedType === 'rental' ? 'Rental Items' : lockedType === 'product' ? 'Products' : 'Items'}
          </h1>
          <p className="text-muted-foreground">
            {lockedType === 'service' ? 'Manage your service offerings' : lockedType === 'rental' ? 'Manage your rental/hire inventory' : lockedType === 'product' ? 'Manage your product inventory' : 'Manage your products, services and rentals'}
          </p>
        </div>
        {canManageInventory && (
          <Button onClick={openNewForm}>
            <Plus className="mr-2 h-4 w-4" />
            {lockedType === 'service' ? 'Add Service' : lockedType === 'rental' ? 'Add Rental Item' : 'Add Item'}
          </Button>
        )}
      </div>

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
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {/* Add/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              {/* Item Type Toggle */}
              {!lockedType && (
              <div className="sm:col-span-2 space-y-2">
                <Label>Item Type</Label>
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
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, itemType: 'service' }))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                      formData.itemType === 'service'
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Wrench className="h-4 w-4" />
                    Service
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, itemType: 'rental' }))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                      formData.itemType === 'rental'
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Clock className="h-4 w-4" />
                    Rental
                  </button>
                </div>
              </div>
              )}

              {/* Common: Name */}
              <div className="space-y-2">
                <Label htmlFor="product_name">{formData.itemType === 'service' ? 'Service Name' : formData.itemType === 'rental' ? 'Rental Item Name' : 'Product Name'}</Label>
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
                <Label htmlFor="unit_price">{formData.itemType === 'service' ? 'Service Price' : formData.itemType === 'rental' ? 'Default Price' : 'Selling Price'}</Label>
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

              {/* Product & Rental fields */}
              {(formData.itemType === 'product' || formData.itemType === 'rental') && (
                <>
              <div className="space-y-2">
                <Label htmlFor="product_id">SKU / Product ID</Label>
                <Input
                  id="product_id"
                  value={formData.product_id}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, product_id: e.target.value }))
                  }
                />
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

              {/* Category - shared but filtered by type */}
              <div className="space-y-2">
                <Label>Category</Label>

                <div className="relative" ref={categoryPickerRef}>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryOpen}
                    className="w-full justify-between"
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

              {/* Product & Rental: Quantity, Low Stock, Cost Price, Base Unit */}
              {(formData.itemType === 'product' || formData.itemType === 'rental') && (
                <>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: parseFloat(e.target.value) || 0,
                    }))
                  }
                  required
                />
              </div>
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
                <Label htmlFor="cost_price">Cost Price</Label>
                <Input
                  id="cost_price"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.cost_price}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      cost_price: parseFloat(e.target.value) || 0,
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

              {/* Service-only fields */}
              {formData.itemType === 'service' && (
                <>
              <div className="space-y-2">
                <Label htmlFor="estimatedHours">Estimated Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.estimatedHours}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      estimatedHours: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="e.g. 40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Input
                  id="duration"
                  value={formData.duration}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, duration: e.target.value }))
                  }
                  placeholder="e.g. 2 hours, 1 week, 3 days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Brief description of the service"
                />
              </div>
                </>
              )}

              {/* Rental-only fields */}
              {formData.itemType === 'rental' && (
                <>
              <div className="space-y-2">
                <Label htmlFor="rentalPrice">Rental Price (per period)</Label>
                <Input
                  id="rentalPrice"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.rentalPrice}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, rentalPrice: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="e.g. 50000 per day"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rentalPeriod">Rental Period</Label>
                <select
                  id="rentalPeriod"
                  value={formData.rentalPeriod}
                  onChange={(e) => setFormData((prev) => ({ ...prev, rentalPeriod: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="weekend">Weekend</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="depositAmount">Security Deposit</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.depositAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, depositAmount: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="Deposit required from customer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replacementValue">Replacement Value</Label>
                <Input
                  id="replacementValue"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.replacementValue}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, replacementValue: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="Cost if item is lost/damaged"
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="description">Item Description</Label>
                <textarea
                  id="description"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Describe the rental item, condition, terms, etc."
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
                {lockedType === 'service' ? 'Add First Service' : lockedType === 'rental' ? 'Add First Rental Item' : 'Add First Item'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    {!lockedType && <th className="pb-3 font-medium">Type</th>}
                    <th className="pb-3 font-medium">SKU</th>
                    <th className="pb-3 font-medium">Name</th>
                    {canManageInventory && <th className="pb-3 font-medium">Branch</th>}
                    <th className="pb-3 font-medium text-right">Qty</th>
                    <th className="pb-3 font-medium text-right">Cost</th>
                    <th className="pb-3 font-medium text-right">Price</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isService = (item as any).itemType === 'service'
                    const isRental = (item as any).itemType === 'rental'
                    return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                      {!lockedType && (
                      <td className="py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          isService
                            ? "bg-blue-100 text-blue-700"
                            : isRental
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                        )}
                        >
                          {isService ? <Wrench className="h-3 w-3" /> : isRental ? <Clock className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                          {isService ? 'Service' : isRental ? 'Rental' : 'Product'}
                        </span>
                      </td>
                      )}
                      <td className="py-3">{item.product_id || '-'}</td>
                      <td className="py-3 font-medium">{item.product_name}</td>
                      {canManageInventory && (
                        <td className="py-3 text-sm text-muted-foreground">
                          {item.branch?.name || branchNameById.get(String(item.branchId || '')) || '-'}
                        </td>
                      )}
                      <td className="py-3 text-right">
                        {isService ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={
                              item.quantity <= item.low_stock_alert
                                ? 'text-orange-600 font-bold'
                                : ''
                            }
                          >
                            {item.quantity}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {isService ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatCurrency(item.cost_price)
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {formatCurrency(isRental ? (item as any).rentalPrice || item.unit_price : item.unit_price)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {canManageInventory && (
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
