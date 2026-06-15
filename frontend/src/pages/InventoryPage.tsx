import { useEffect, useState } from 'react'
import { Package, Plus, Search, Edit, Trash2 } from 'lucide-react'
import { inventoryApi, categoriesApi, type InventoryItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [formData, setFormData] = useState({
    product_id: '',
    product_name: '',
    quantity: 0,
    unit_price: 0,
    cost_price: 0,
    low_stock_alert: 5,
    barcode: '',
    sku: '',
    categoryId: '',
  })
  const { toast } = useToast()

  useEffect(() => {
    loadInventory()
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const data = await categoriesApi.list()
      setCategories(Array.isArray(data) ? data : [])
    } catch { }
  }

  const loadInventory = async () => {
    setLoading(true)
    try {
      const data = await inventoryApi.list(searchQuery)
      setItems(data)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingItem) {
        await inventoryApi.update(String(editingItem.id), formData)
        toast({ title: 'Item updated successfully' })
      } else {
        await inventoryApi.create(formData)
        toast({ title: 'Item created successfully' })
      }
      setShowForm(false)
      setEditingItem(null)
      resetForm()
      loadInventory()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to save item',
        description: error.message,
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
        description: error.message,
      })
    }
  }

  const openEditForm = (item: InventoryItem) => {
    setEditingItem(item)
    setFormData({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      cost_price: item.cost_price,
      low_stock_alert: item.low_stock_alert,
      barcode: (item as any).barcode || '',
      sku: (item as any).sku || '',
      categoryId: (item as any).categoryId || '',
    })
    setShowForm(true)
  }

  const resetForm = () => {
    setFormData({
      product_id: '',
      product_name: '',
      quantity: 0,
      unit_price: 0,
      cost_price: 0,
      low_stock_alert: 5,
      barcode: '',
      sku: '',
      categoryId: '',
    })
  }

  return (
    <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
              <p className="text-muted-foreground">
                Manage your products and stock levels
              </p>
            </div>
            <Button onClick={() => { resetForm(); setEditingItem(null); setShowForm(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search inventory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
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
                  <div className="space-y-2">
                    <Label htmlFor="product_id">SKU / Product ID</Label>
                    <Input
                      id="product_id"
                      value={formData.product_id}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, product_id: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input
                      id="barcode"
                      value={formData.barcode}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, barcode: e.target.value }))
                      }
                      placeholder="Scan or enter barcode"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoryId">Category</Label>
                    <select
                      id="categoryId"
                      value={formData.categoryId}
                      onChange={(e) => setFormData((prev) => ({ ...prev, categoryId: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">No category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
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
                      required
                    />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <Button type="submit">
                      {editingItem ? 'Update Item' : 'Add Item'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowForm(false)
                        setEditingItem(null)
                        resetForm()
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Inventory Table */}
          <Card>
            <CardHeader>
              <CardTitle>Products ({items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : items.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No items found
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium">SKU</th>
                        <th className="pb-3 font-medium">Product</th>
                        <th className="pb-3 font-medium text-right">Qty</th>
                        <th className="pb-3 font-medium text-right">Cost</th>
                        <th className="pb-3 font-medium text-right">Price</th>
                        <th className="pb-3 font-medium text-right">Alert</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-3">{item.product_id}</td>
                          <td className="py-3 font-medium">{item.product_name}</td>
                          <td className="py-3 text-right">
                            <span
                              className={
                                item.quantity <= item.low_stock_alert
                                  ? 'text-orange-600 font-bold'
                                  : ''
                              }
                            >
                              {item.quantity}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(item.cost_price)}
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="py-3 text-right">{item.low_stock_alert}</td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditForm(item)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )
}