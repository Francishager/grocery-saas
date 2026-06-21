 import { useEffect, useState } from 'react'
import { ShoppingCart, Plus, Search, Trash2, Receipt, RefreshCw, ScanBarcode } from 'lucide-react'
import { inventoryApi, salesApi, barcodeApi, receiptsApi, type InventoryItem, type CartItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import BarcodeScanner from '@/components/BarcodeScanner'
import ReceiptViewer from '@/components/ReceiptViewer'
import { BluetoothThermalPrinter, ThermalPrinter, isBluetoothSupported, isSerialSupported } from '@/lib/thermalPrinter'

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
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMode, setPaymentMode] = useState('cash')
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadInventory()
    loadRecentSales()
  }, [])

  const loadInventory = async () => {
    setLoading(true)
    try {
      const data = await inventoryApi.list(searchQuery)
      setInventory(data)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load inventory',
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadInventory()
  }

  const addToCart = (item: InventoryItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.id === item.id ? { ...c, qty: c.qty + 1 } : c
        )
      }
      return [
        ...prev,
        {
          id: item.id,
          product_id: item.product_id,
          name: item.product_name,
          qty: 1,
          selling_price: item.unit_price,
          cost_price: item.cost_price,
        },
      ]
    })
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

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.selling_price * item.qty,
    0
  )

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
    if (cart.length === 0) return

    setProcessing(true)
    try {
      const result = await salesApi.checkout(cart, paymentMode)
      toast({
        title: 'Sale completed!',
        description: `${cart.length} items sold for ${formatCurrency(cartTotal)}`,
      })
      setCart([])
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
      const data = await salesApi.list()
      setRecentSales(Array.isArray(data) ? data : [])
    } catch {
      // silently fail — sales history is secondary
    } finally {
      setSalesLoading(false)
    }
  }

  const filteredInventory = inventory.filter((item) =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
        <p className="text-muted-foreground">
          Process sales and manage transactions
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Inventory List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
              <CardDescription>
                Click on a product to add it to the cart
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
                  onClick={() => setShowScanner(!showScanner)}
                >
                  <ScanBarcode className="h-4 w-4" />
                </Button>
              </form>

              {showScanner && (
                <div className="mt-3">
                  <BarcodeScanner
                    onScan={async (code) => {
                      try {
                        const result = await barcodeApi.lookup(code)
                        const products = Array.isArray(result?.products) ? result.products : []
                        if (products.length > 0) {
                          addToCart(products[0])
                          toast({ title: `Added: ${products[0].product_name}` })
                        } else {
                          toast({ variant: 'destructive', title: 'Product not found', description: `No product with barcode: ${code}` })
                        }
                      } catch {
                        toast({ variant: 'destructive', title: 'Barcode lookup failed' })
                      }
                    }}
                    onClose={() => setShowScanner(false)}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : filteredInventory.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No products found
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredInventory.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} in stock
                        </p>
                      </div>
                      <p className="font-bold text-primary">
                        {formatCurrency(item.unit_price)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cart */}
        <div>
          <Card className="sticky top-20">
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
                          </p>
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
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">Total</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(cartTotal)}
                      </span>
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

                    <Button
                      className="w-full"
                      onClick={handleCheckout}
                      disabled={processing}
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
              {recentSales.slice(0, 20).map((sale) => {
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
    </div>
  )
}
