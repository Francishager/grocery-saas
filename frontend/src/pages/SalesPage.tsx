 import { useEffect, useState, useRef, useMemo } from 'react'
import { ShoppingCart, Plus, Search, Trash2, Receipt, RefreshCw, ScanBarcode, WifiOff, Pencil, X, Check, ChevronsUpDown } from 'lucide-react'
import { inventoryApi, salesApi, barcodeApi, receiptsApi, settingsApi, categoriesApi, type InventoryItem, type CartItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { cn, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import BarcodeScanner from '@/components/BarcodeScanner'
import ReceiptViewer from '@/components/ReceiptViewer'
import { BluetoothThermalPrinter, ThermalPrinter, isBluetoothSupported, isSerialSupported } from '@/lib/thermalPrinter'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalProducts, getLocalSales } from '@/db/hybrid'
import { queueMutation } from '@/db/sync'
import { db } from '@/db/index'

interface RecentSale {
  id: string
  receiptNo: string
  total: number
  paymentMethod: string
  createdAt: string
  items: { productId: string; quantity: number; price: number; total: number }[]
  user?: { fname: string; lname: string }
}

export default function SalesPage() {
  const { hasPermission } = useJWTAuth()
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMode, setPaymentMode] = useState('cash')
  const [mobileProvider, setMobileProvider] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [invoiceCashDiscount, setInvoiceCashDiscount] = useState(0)
  const [amountPaid, setAmountPaid] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [quickEditItem, setQuickEditItem] = useState<InventoryItem | null>(null)
  const [quickEditForm, setQuickEditForm] = useState({ name: '', barcode: '', cost_price: '', unit_price: '', categoryId: '', expiryDate: '' })
  const [quickEditSaving, setQuickEditSaving] = useState(false)
  const [showQuickEditScanner, setShowQuickEditScanner] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const categoryPickerRef = useRef<HTMLDivElement | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerFailed, setScannerFailed] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [taxConfig, setTaxConfig] = useState<{ taxEnabled: boolean; taxRate: number; taxId: string } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 20
  const { toast } = useToast()
  const online = useOnlineStatus()

  useEffect(() => {
    loadInventory()
    loadRecentSales()
    loadTaxConfig()
  }, [])

  const filteredCategories = useMemo(() => {
    const query = categoryQuery.trim().toLowerCase()
    if (!query) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(query))
  }, [categories, categoryQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(e.target as Node)) {
        setCategoryOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadInventory = async () => {
    setLoading(true)
    try {
      if (online) {
        const data = await inventoryApi.list(searchQuery)
        setInventory(data)
      } else {
        const local = await getLocalProducts(searchQuery)
        setInventory(local)
      }
    } catch (error: any) {
      // API failed — fall back to local
      try {
        const local = await getLocalProducts(searchQuery)
        setInventory(local)
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load inventory', description: error.message })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)  // Reset to first page when searching
    loadInventory()
  }

  const addToCart = (item: InventoryItem, unitName?: string, conversionFactor?: number, sellingPrice?: number) => {
    const isUncategorized = Boolean((item as any).isUncategorized || (!item.categoryId && !((item as any).category?.id) && !((item as any).category)))

    if (isUncategorized) {
      toast({
        variant: 'destructive',
        title: 'Item needs categorization',
        description: 'This product cannot be added to the cart until a category is assigned in inventory.',
      })
      return false
    }

    setCart((prev) => {
      const cartKey = unitName ? `${item.id}-${unitName}` : String(item.id)
      const existing = prev.find((c) => c.id === cartKey)
      if (existing) {
        return prev.map((c) =>
          c.id === cartKey ? { ...c, qty: c.qty + 1 } : c
        )
      }
      return [
        ...prev,
        {
          id: cartKey,
          productId: item.id,
          product_id: item.product_id,
          name: unitName ? `${item.product_name} (${unitName})` : item.product_name,
          qty: 1,
          selling_price: sellingPrice || item.unit_price,
          cost_price: item.cost_price,
          unitName: unitName || null,
          conversionFactor: conversionFactor ?? null,
          cashDiscount: 0,
        },
      ]
    })

    return true
  }

  const updateCartQty = (id: string | number, qty: number) => {
    if (qty < 1) {
      removeFromCart(id)
      return
    }
    setCart((prev) =>
      prev.map((c) => (c.id === id ? { ...c, qty } : c))
    )
  }

  const removeFromCart = (id: string | number) => {
    setCart((prev) => prev.filter((c) => c.id !== id))
  }

  const loadTaxConfig = async () => {
    try {
      const data = await settingsApi.getTaxConfig()
      setTaxConfig({ taxEnabled: data.taxEnabled, taxRate: data.taxRate || 0, taxId: data.taxId || '' })
    } catch {}
  }

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.selling_price * item.qty,
    0
  )
  const lineCashDiscounts = cart.reduce(
    (sum, item) => sum + (item.cashDiscount || 0),
    0
  )
  const taxableAmount = Math.max(0, cartSubtotal - lineCashDiscounts - invoiceCashDiscount)
  const cartTax = (taxConfig?.taxEnabled && taxConfig?.taxRate) ? Math.round(taxableAmount * taxConfig.taxRate / 100 * 100) / 100 : 0
  const cartTotal = Math.max(0, cartSubtotal - lineCashDiscounts - invoiceCashDiscount + cartTax)
  const changeDue = amountPaid !== '' && amountPaid >= cartTotal ? amountPaid - cartTotal : 0

  const autoPrintReceipt = async (saleId: string) => {
    if (!isSerialSupported() && !isBluetoothSupported()) return

    let printer: BluetoothThermalPrinter | ThermalPrinter | null = null
    try {
      if (isSerialSupported()) {
        const serialPrinter = new ThermalPrinter()
        if (await serialPrinter.connectToKnownPort()) {
          printer = serialPrinter
        } else {
          await serialPrinter.disconnect()
        }
      }

      if (!printer && isBluetoothSupported()) {
        const bluetoothPrinter = new BluetoothThermalPrinter()
        if (await bluetoothPrinter.connectToKnownDevice()) {
          printer = bluetoothPrinter
        } else {
          await bluetoothPrinter.disconnect()
        }
      }

      if (!printer) return

      const { commands } = await receiptsApi.getEscPos(saleId)
      await printer.printFromCommands(commands)
      toast({ title: 'Receipt printed' })
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Auto print failed',
        description: error?.message || 'Open the receipt and print manually.',
      })
    } finally {
      await printer?.disconnect()
    }
  }

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast({ variant: 'destructive', title: 'Cart is empty', description: 'Add at least one item to checkout.' })
      return
    }

    setProcessing(true)

    if (!online) {
      // Offline checkout — save locally, queue for sync
      try {
        const saleId = `offline-${Date.now()}`
        const receiptNo = `OFF-${String(Date.now()).slice(-5)}`
        const subtotal = cart.reduce((sum, item) => sum + item.selling_price * item.qty, 0)
        const total = Math.max(0, subtotal - lineCashDiscounts - invoiceCashDiscount + cartTax)

        const saleData = {
          id: saleId,
          receiptNo,
          subtotal,
          discount: invoiceCashDiscount,
          tax: cartTax,
          total,
          paymentMethod: paymentMode,
          status: 'completed',
          items: cart.map(c => ({
            productId: c.productId,
            quantity: c.qty,
            price: c.selling_price,
            discount: c.cashDiscount || 0,
            total: c.selling_price * c.qty - (c.cashDiscount || 0),
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        await db.sales.put(saleData)

        // Deduct stock locally
        for (const item of cart) {
          const product = await db.products.get(item.productId)
          if (product) {
            await db.products.update(item.productId, {
              quantity: Math.max(0, product.quantity - item.qty),
            })
          }
        }

        // Queue for sync
        await queueMutation('sales', 'create', saleId, {
          cart: cart.map(c => ({
            productId: c.productId,
            qty: c.qty,
            price: c.selling_price,
            discount: c.discount || 0,
            cashDiscount: c.cashDiscount || 0,
            unitName: c.unitName || null,
            conversionFactor: c.conversionFactor ?? null,
          })),
          paymentMethod: paymentMode,
          cashDiscount: invoiceCashDiscount,
          amountPaid: amountPaid !== '' ? amountPaid : undefined,
          changeGiven: amountPaid !== '' && changeDue > 0 ? changeDue : undefined,
        })

        toast({
          title: 'Sale recorded offline',
          description: `${cart.length} items — will sync when online`,
        })
        setCart([])
        setInvoiceCashDiscount(0)
        setAmountPaid('')
        setMobileProvider('')
        setPhoneNumber('')
        setTransactionId('')
        loadRecentSales()
        loadInventory()
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Offline checkout failed', description: error.message })
      } finally {
        setProcessing(false)
      }
      return
    }

    try {
      const result = await salesApi.checkout(cart, paymentMode, invoiceCashDiscount, {
        mobileProvider: paymentMode === 'mobile_money' ? mobileProvider : undefined,
        phoneNumber: paymentMode === 'mobile_money' ? phoneNumber : undefined,
        transactionId: ['mobile_money', 'card'].includes(paymentMode) ? transactionId : undefined,
        amountPaid: amountPaid !== '' ? amountPaid : undefined,
        changeGiven: amountPaid !== '' && changeDue > 0 ? changeDue : undefined,
      })
      toast({
        title: 'Sale completed!',
        description: `${cart.length} items sold for ${formatCurrency(cartTotal)}`,
      })
      setCart([])
      setInvoiceCashDiscount(0)
      setAmountPaid('')
      setMobileProvider('')
      setPhoneNumber('')
      setTransactionId('')
      if (result?.sale?.id) void autoPrintReceipt(String(result.sale.id))
      loadRecentSales()
      loadInventory()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Checkout failed',
        description: error.message,
      })
    } finally {
      setProcessing(false)
    }
  }

  const loadRecentSales = async () => {
    setSalesLoading(true)
    try {
      if (online) {
        const data = await salesApi.list()
        setRecentSales(Array.isArray(data) ? data : [])
      } else {
        const local = await getLocalSales(50)
        setRecentSales(local)
      }
    } catch {
      // API failed — try local
      try {
        const local = await getLocalSales(50)
        setRecentSales(local)
      } catch {
        // silently fail — sales history is secondary
      }
    } finally {
      setSalesLoading(false)
    }
  }

  const filteredInventory = inventory.filter((item) =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const canEditItem = (item: InventoryItem) => {
    const itemType = (item as any).itemType || 'product'
    if (itemType === 'service') return hasPermission('canEditService')
    if (itemType === 'rental') return hasPermission('canEditRental')
    return hasPermission('canEditProduct')
  }

  const openQuickEdit = (item: InventoryItem) => {
    setQuickEditItem(item)
    setQuickEditForm({
      name: item.product_name || '',
      barcode: (item as any).barcode || '',
      cost_price: String(item.cost_price ?? ''),
      unit_price: String(item.unit_price ?? ''),
      categoryId: (item as any).categoryId || '',
      expiryDate: (item as any).expiryDate ? new Date((item as any).expiryDate).toISOString().split('T')[0] : '',
    })
    setShowQuickEditScanner(false)
    // Load categories if not already loaded
    if (categories.length === 0) {
      categoriesApi.list().then((data: any) => setCategories(Array.isArray(data) ? data : [])).catch(() => {})
    }
  }

  const handleQuickEditSave = async () => {
    if (!quickEditItem) return
    setQuickEditSaving(true)
    try {
      const itemType = (quickEditItem as any).itemType || 'product'
      await inventoryApi.update(String(quickEditItem.id), {
        ...quickEditItem,
        product_name: quickEditForm.name,
        barcode: quickEditForm.barcode || null,
        cost_price: quickEditForm.cost_price !== '' ? Number(quickEditForm.cost_price) : 0,
        unit_price: quickEditForm.unit_price !== '' ? Number(quickEditForm.unit_price) : 0,
        categoryId: quickEditForm.categoryId || null,
        expiryDate: quickEditForm.expiryDate || null,
        itemType,
      } as any)
      toast({ title: 'Item updated', description: quickEditItem.product_name })
      setQuickEditItem(null)
      loadInventory()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message })
    } finally {
      setQuickEditSaving(false)
    }
  }

  // Pagination calculation
  const totalPages = Math.ceil(filteredInventory.length / ITEMS_PER_PAGE)
  const pageStartIdx = (currentPage - 1) * ITEMS_PER_PAGE
  const pageEndIdx = pageStartIdx + ITEMS_PER_PAGE
  const paginatedInventory = filteredInventory.slice(pageStartIdx, pageEndIdx)

  // Separate items by type for display
  const sellableItems = paginatedInventory.filter((item) => (item as any).itemType !== 'rental')
  const serviceItems = sellableItems.filter((item) => (item as any).itemType === 'service')
  const productItems = sellableItems.filter((item) => (item as any).itemType !== 'service')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
        <p className="text-muted-foreground">
          Process sales and manage transactions
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Inventory List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Products & Services</CardTitle>
              <CardDescription>
                Click on an item to add it to the cart
              </CardDescription>
              <form onSubmit={handleSearch} className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Search
                </Button>
                <Button
                  type="button"
                  variant={showScanner ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => { setShowScanner(!showScanner); if (!showScanner) setScannerFailed(false) }}
                  title="Scan barcode"
                >
                  <ScanBarcode className="h-4 w-4" />
                </Button>
              </form>

              {/* Fallback barcode input — only visible when scanner fails */}
              {scannerFailed && !showScanner && (
                <div className="flex gap-2 mt-2">
                  <div className="relative flex-1">
                    <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Type barcode manually..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && barcodeInput.trim()) {
                          e.preventDefault()
                          try {
                            const result = await barcodeApi.lookup(barcodeInput.trim())
                            const products = Array.isArray(result?.products) ? result.products : []
                            if (products.length > 0) {
                              const added = addToCart(products[0])
                              if (added) {
                                toast({ title: `Added: ${products[0].product_name}` })
                              }
                            } else {
                              toast({ variant: 'destructive', title: 'Product not found', description: `No product with barcode: ${barcodeInput.trim()}` })
                            }
                          } catch {
                            toast({ variant: 'destructive', title: 'Barcode lookup failed' })
                          }
                          setBarcodeInput('')
                        }
                      }}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                  <Button
                    onClick={async () => {
                      if (!barcodeInput.trim()) return
                      try {
                        const result = await barcodeApi.lookup(barcodeInput.trim())
                        const products = Array.isArray(result?.products) ? result.products : []
                        if (products.length > 0) {
                          const added = addToCart(products[0])
                          if (added) {
                            toast({ title: `Added: ${products[0].product_name}` })
                          }
                        } else {
                          toast({ variant: 'destructive', title: 'Product not found', description: `No product with barcode: ${barcodeInput.trim()}` })
                        }
                      } catch {
                        toast({ variant: 'destructive', title: 'Barcode lookup failed' })
                      }
                      setBarcodeInput('')
                    }}
                    size="sm"
                  >
                    Search
                  </Button>
                </div>
              )}

              {showScanner && (
                <div className="mt-3">
                  <BarcodeScanner
                    onScan={async (code) => {
                      try {
                        const result = await barcodeApi.lookup(code)
                        const products = Array.isArray(result?.products) ? result.products : []
                        if (products.length > 0) {
                          const added = addToCart(products[0])
                          if (added) {
                            toast({ title: `Added: ${products[0].product_name}` })
                          }
                        } else {
                          toast({ variant: 'destructive', title: 'Product not found', description: `No product with barcode: ${code}` })
                        }
                      } catch {
                        toast({ variant: 'destructive', title: 'Barcode lookup failed' })
                      }
                    }}
                    onClose={() => setShowScanner(false)}
                    onFail={() => { setShowScanner(false); setScannerFailed(true) }}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : sellableItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No items found
                </p>
              ) : (
                <div className="space-y-4">
                  {productItems.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Products</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {productItems.map((item) => {
                          const units = (item as any).units || []
                          const baseUnit = (item as any).baseUnit || 'Piece'
                          const isUncategorized = (item as any).isUncategorized
                          return (
                            <div key={item.id} className={`rounded-lg border p-3 transition-colors ${isUncategorized ? 'bg-yellow-50 border-yellow-200' : 'hover:bg-muted'}`}>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium truncate" title={item.product_name}>{item.product_name}</p>
                                    {isUncategorized && (
                                      <span className="shrink-0 px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-semibold rounded">
                                        Uncategorized
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {item.quantity} {baseUnit} in stock
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <p className="font-bold text-primary whitespace-nowrap">
                                    {formatCurrency(item.unit_price)}
                                  </p>
                                  {canEditItem(item) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openQuickEdit(item) }}
                                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                                      title="Quick edit barcode & prices"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isUncategorized && (
                                <p className="text-xs text-yellow-700 mb-2">
                                  This product needs to be categorized before adding to cart. Edit in inventory.
                                </p>
                              )}
                              {units.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  <button
                                    onClick={() => !isUncategorized && addToCart(item)}
                                    disabled={isUncategorized}
                                    className={`rounded border px-2 py-1 text-xs transition-colors ${isUncategorized ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' : 'hover:bg-primary hover:text-primary-foreground'}`}
                                  >
                                    {baseUnit} (1)
                                  </button>
                                  {units.map((u: any) => (
                                    <button
                                      key={u.id}
                                      onClick={() => !isUncategorized && addToCart(item, u.unitName, u.conversionFactor, u.sellingPrice)}
                                      disabled={isUncategorized}
                                      className={`rounded border px-2 py-1 text-xs transition-colors ${isUncategorized ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' : 'hover:bg-primary hover:text-primary-foreground'}`}
                                    >
                                      {u.unitName} ({u.conversionFactor})
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <button
                                  onClick={() => !isUncategorized && addToCart(item)}
                                  disabled={isUncategorized}
                                  className={`mt-2 w-full rounded border px-2 py-1 text-xs transition-colors ${isUncategorized ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' : 'hover:bg-primary hover:text-primary-foreground'}`}
                                >
                                  {isUncategorized ? 'Needs Categorization' : 'Add to Cart'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {serviceItems.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Services</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {serviceItems.map((item) => {
                          const isUncategorized = (item as any).isUncategorized
                          return (
                            <div key={item.id} className={`rounded-lg border p-3 transition-colors ${isUncategorized ? 'bg-yellow-50 border-yellow-200' : 'hover:bg-muted'}`}>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium truncate" title={item.product_name}>{item.product_name}</p>
                                    {isUncategorized && (
                                      <span className="shrink-0 px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-semibold rounded">
                                        Uncategorized
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">Service</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <p className="font-bold text-primary whitespace-nowrap">
                                    {formatCurrency(item.unit_price)}
                                  </p>
                                  {canEditItem(item) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openQuickEdit(item) }}
                                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                                      title="Quick edit price"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isUncategorized && (
                                <p className="text-xs text-yellow-700 mb-2">
                                  This service needs to be categorized before adding to cart. Edit in inventory.
                                </p>
                              )}
                              <button
                                onClick={() => !isUncategorized && addToCart(item)}
                                disabled={isUncategorized}
                                className={`mt-2 w-full rounded border px-2 py-1 text-xs transition-colors ${isUncategorized ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' : 'hover:bg-primary hover:text-primary-foreground'}`}
                              >
                                {isUncategorized ? 'Needs Categorization' : 'Add to Cart'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Pagination Controls */}
              {filteredInventory.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {pageStartIdx + 1} to {Math.min(pageStartIdx + ITEMS_PER_PAGE, filteredInventory.length)} of {filteredInventory.length} items
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-2 py-1 rounded text-sm ${
                            currentPage === page
                              ? 'bg-primary text-primary-foreground'
                              : 'border hover:bg-muted'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cart */}
        <div className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                <CardTitle>Cart</CardTitle>
              </div>
              <CardDescription>
                {cart.length} item{cart.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Cart is empty
                </p>
              ) : (
                <>
                  <div className="space-y-3 mb-4">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border p-2"
                      >
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(item.selling_price)} each
                            {item.unitName && <span className="ml-1 text-xs">({item.unitName})</span>}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-muted-foreground">Disc:</span>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={item.cashDiscount || 0}
                              onChange={(e) =>
                                setCart((prev) => prev.map((c) => c.id === item.id ? { ...c, cashDiscount: parseFloat(e.target.value) || 0 } : c))
                              }
                              className="w-20 h-6 text-xs"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) =>
                              updateCartQty(item.id, parseInt(e.target.value) || 0)
                            }
                            className="w-16 h-8 text-center"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeFromCart(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">Subtotal</span>
                      <span>{formatCurrency(cartSubtotal)}</span>
                    </div>
                    {lineCashDiscounts > 0 && (
                      <div className="flex justify-between mb-1 text-sm text-muted-foreground">
                        <span>Line Discounts</span>
                        <span>-{formatCurrency(lineCashDiscounts)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="text-sm font-medium">Invoice Discount</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={invoiceCashDiscount}
                        onChange={(e) => setInvoiceCashDiscount(parseFloat(e.target.value) || 0)}
                        className="w-28 h-8 text-sm text-right"
                        placeholder="0"
                      />
                    </div>
                    {cartTax > 0 && (
                      <div className="flex justify-between mb-1 text-sm">
                        <span className="font-medium">Tax{taxConfig?.taxId ? ` (${taxConfig.taxId})` : ''}</span>
                        <span>{formatCurrency(cartTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">Total</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(cartTotal)}
                      </span>
                    </div>

                    {/* Amount Paid + Change */}
                    <div className="space-y-2 mb-4 p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-medium">Amount Paid</label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                          className="w-32 h-8 text-sm text-right"
                          placeholder="0"
                        />
                      </div>
                      {amountPaid !== '' && amountPaid > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className={changeDue > 0 ? 'font-medium text-green-600' : 'font-medium text-muted-foreground'}>
                            {changeDue > 0 ? 'Change Due' : amountPaid < cartTotal ? 'Shortfall' : 'Change Due'}
                          </span>
                          <span className={changeDue > 0 ? 'font-bold text-green-600' : 'font-bold text-red-600'}>
                            {changeDue > 0 ? formatCurrency(changeDue) : formatCurrency(amountPaid - cartTotal)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mb-4">
                      <label className="text-sm font-medium">Payment Mode</label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="card">Card</option>
                      </select>
                    </div>

                    {/* Mobile Money fields */}
                    {paymentMode === 'mobile_money' && (
                      <div className="space-y-3 mb-4 p-3 rounded-lg border bg-muted/30">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mobile Money Details</p>
                        <div>
                          <label className="text-sm font-medium">Network Provider *</label>
                          <select
                            value={mobileProvider}
                            onChange={(e) => setMobileProvider(e.target.value)}
                            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="">Select provider</option>
                            <option value="MTN">MTN</option>
                            <option value="Airtel">Airtel</option>
                            <option value="Zamtel">Zamtel</option>
                            <option value="Vodafone">Vodafone</option>
                            <option value="M-Pesa">M-Pesa</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Phone Number *</label>
                          <Input
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="e.g. 0977123456"
                            type="tel"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Transaction ID *</label>
                          <Input
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                            placeholder="e.g. TXN123456789"
                          />
                        </div>
                      </div>
                    )}

                    {/* Card fields */}
                    {paymentMode === 'card' && (
                      <div className="space-y-3 mb-4 p-3 rounded-lg border bg-muted/30">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Card Payment Details</p>
                        <div>
                          <label className="text-sm font-medium">Transaction ID *</label>
                          <Input
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                            placeholder="e.g. TXN123456789"
                          />
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      onClick={handleCheckout}
                      disabled={processing || (
                        paymentMode === 'mobile_money' ? (!mobileProvider || !phoneNumber.trim() || !transactionId.trim()) :
                        paymentMode === 'card' ? !transactionId.trim() :
                        false
                      )}
                    >
                      {processing ? 'Processing...' : 'Complete Sale'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Sales */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              <CardTitle>Recent Sales</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={loadRecentSales}>
              <RefreshCw className={`h-4 w-4 ${salesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {salesLoading ? (
            <div className="flex items-center justify-center h-20">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
           </div>
          ) : recentSales.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No sales recorded yet</p>
          ) : (
            <div className="space-y-2">
              {recentSales.slice(0, 10).map((sale) => {
                const payLabel = (sale.paymentMethod || "cash").split("_").join(" ")
                const staff = sale.user ? [sale.user.fname, sale.user.lname].filter(Boolean).join(" ") || "—" : "—"
                const dateStr = new Date(sale.createdAt).toLocaleString("en-US", {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"})
                return (
                  <div key={sale.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-medium">{sale.receiptNo}</p>
                      <p className="text-xs text-muted-foreground">{sale.items ? sale.items.length : 0} items &middot; {payLabel} &middot; {staff}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatCurrency(sale.total)}</span>
                      <span className="text-xs text-muted-foreground">{dateStr}</span>
                      <ReceiptViewer saleId={String(sale.id)} receiptNo={sale.receiptNo} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Edit Dialog — edit barcode & prices inline from sales */}
      <Dialog open={!!quickEditItem} onOpenChange={(open) => { if (!open) setQuickEditItem(null) }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto z-[100]">
          <DialogHeader>
            <DialogTitle>Quick Edit: {quickEditItem?.product_name}</DialogTitle>
            <DialogDescription>Update item name, category, barcode, or prices. Other fields remain unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Item Name</Label>
              <Input
                value={quickEditForm.name}
                onChange={(e) => setQuickEditForm({ ...quickEditForm, name: e.target.value })}
                placeholder="Item name"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Category</Label>
              <div className="relative" ref={categoryPickerRef}>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={categoryOpen}
                  className="w-full justify-between mt-1"
                  onClick={() => setCategoryOpen((current) => !current)}
                >
                  <span className={cn("truncate", !quickEditForm.categoryId && "text-muted-foreground")}>
                    {categories.find((c) => c.id === quickEditForm.categoryId)?.name || "Select category"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>

                {categoryOpen && (
                  <div className="absolute left-0 right-0 z-[110] mt-1 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
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

                    <div className="max-h-48 overflow-y-auto pr-1">
                      {filteredCategories.length === 0 ? (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                          {categories.length === 0 ? 'No categories available' : 'No category found'}
                        </div>
                      ) : (
                        filteredCategories.map((category) => {
                          const categoryId = String(category.id)
                          const isSelected = quickEditForm.categoryId === categoryId
                          return (
                            <button
                              key={categoryId}
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                                isSelected && "bg-muted font-medium"
                              )}
                              onClick={() => {
                                setQuickEditForm((prev) => ({ ...prev, categoryId }))
                                setCategoryQuery('')
                                setCategoryOpen(false)
                              }}
                            >
                              <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
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
            <div>
              <Label>Barcode</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={quickEditForm.barcode}
                  onChange={(e) => setQuickEditForm({ ...quickEditForm, barcode: e.target.value })}
                  placeholder="Scan or enter barcode"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowQuickEditScanner(!showQuickEditScanner)}
                >
                  <ScanBarcode className="h-4 w-4" />
                </Button>
              </div>
              {showQuickEditScanner && (
                <div className="mt-2">
                  <BarcodeScanner
                    onScan={(code) => {
                      setQuickEditForm((prev) => ({ ...prev, barcode: code }))
                      setShowQuickEditScanner(false)
                      toast({ title: 'Barcode captured', description: code })
                    }}
                    onClose={() => setShowQuickEditScanner(false)}
                    placeholder="Scan barcode for this item..."
                  />
                </div>
              )}
            </div>
            <div>
              <Label>Cost Price</Label>
              <Input
                type="number"
                step="0.01"
                value={quickEditForm.cost_price}
                onChange={(e) => setQuickEditForm({ ...quickEditForm, cost_price: e.target.value })}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Selling Price</Label>
              <Input
                type="number"
                step="0.01"
                value={quickEditForm.unit_price}
                onChange={(e) => setQuickEditForm({ ...quickEditForm, unit_price: e.target.value })}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={quickEditForm.expiryDate}
                onChange={(e) => setQuickEditForm({ ...quickEditForm, expiryDate: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickEditItem(null)}>Cancel</Button>
            <Button onClick={handleQuickEditSave} disabled={quickEditSaving}>
              {quickEditSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
