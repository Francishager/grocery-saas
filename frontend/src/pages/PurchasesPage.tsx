import { useEffect, useState } from 'react'
import { FileText, Plus, Search, ShoppingCart } from 'lucide-react'
import { inventoryApi, purchasesApi, type InventoryItem, type PurchaseItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export default function PurchasesPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<PurchaseItem[]>([])
  const [vendorName, setVendorName] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadInventory()
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
          unit_cost: item.cost_price,
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
    (sum, item) => sum + item.unit_cost * item.qty,
    0
  )

  const handleCheckout = async () => {
    if (cart.length === 0) return
    if (!vendorName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Vendor name required',
      })
      return
    }

    setProcessing(true)
    try {
      await purchasesApi.checkout(cart, vendorName, invoiceNo, undefined, paymentMode)
      toast({
        title: 'Purchase recorded!',
        description: `${cart.length} items purchased for ${formatCurrency(cartTotal)}`,
      })
      setCart([])
      setVendorName('')
      setInvoiceNo('')
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

  const filteredInventory = inventory.filter((item) =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Purchases</h1>
        <p className="text-muted-foreground">
          Record purchases and restock inventory
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Inventory List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
              <CardDescription>
                Click on a product to add it to the purchase
              </CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
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
                        {formatCurrency(item.cost_price)}
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
                <CardTitle>Purchase</CardTitle>
              </div>
              <CardDescription>
                {cart.length} item{cart.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No items added
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
                            {formatCurrency(item.unit_cost)} each
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
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="vendor">Vendor Name</Label>
                      <Input
                        id="vendor"
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        placeholder="Enter vendor name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invoice">Invoice Number (Optional)</Label>
                      <Input
                        id="invoice"
                        value={invoiceNo}
                        onChange={(e) => setInvoiceNo(e.target.value)}
                        placeholder="Enter invoice number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paymentMode">Payment Method</Label>
                      <select
                        id="paymentMode"
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="cash">Cash</option>
                        <option value="credit">Credit</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="mobile_money">Mobile Money</option>
                      </select>
                    </div>

                    <div className="flex justify-between py-2">
                      <span className="font-medium">Total Cost</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(cartTotal)}
                      </span>
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleCheckout}
                      disabled={processing || !vendorName.trim()}
                    >
                      {processing ? 'Processing...' : 'Record Purchase'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
