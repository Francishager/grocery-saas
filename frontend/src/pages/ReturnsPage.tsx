import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { RotateCcw, Plus, Search, DollarSign } from 'lucide-react'

interface SaleReturn {
  id: string
  returnNo: string
  total: number
  reason?: string
  refundMethod: string
  status: string
  createdAt: string
  sale?: { id: string; receiptNo: string }
  customer?: { id: string; name: string }
  user?: { id: string; fname: string; lname: string }
  items: { id: string; productId: string; product: { name: string; sku?: string }; quantity: number; price: number; total: number; reason?: string }[]
}

interface Product {
  id: string
  name: string
  sku?: string
  price: number
  quantity: number
}

export default function ReturnsPage() {
  const { toast } = useToast()
  const [returns, setReturns] = useState<SaleReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')

  // New return form
  const [saleId, setSaleId] = useState('')
  const [reason, setReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('cash')
  const [items, setItems] = useState<{ productId: string; quantity: number; price: number; reason?: string }[]>([])

  const fetchReturns = async () => {
    try {
      const res = await apiFetch('/api/returns')
      if (res.ok) {
        const data = await res.json()
        setReturns(data)
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to load returns' })
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/inventory?limit=100')
      if (res.ok) {
        const data = await res.json()
        const prods = Array.isArray(data) ? data : data.products || data.items || []
        setProducts(prods)
      }
    } catch (err) {
      // ignore
    }
  }

  useEffect(() => {
    fetchReturns()
  }, [])

  useEffect(() => {
    if (showModal) fetchProducts()
  }, [showModal])

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1, price: 0, reason: '' }])
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    if (field === 'productId') {
      const product = products.find((p) => p.id === value)
      updated[idx] = { ...updated[idx], productId: value, price: product?.price || 0 }
    } else if (field === 'quantity') {
      updated[idx] = { ...updated[idx], quantity: Math.max(1, Number(value)) }
    } else {
      updated[idx] = { ...updated[idx], [field]: value }
    }
    setItems(updated)
  }

  const handleSubmit = async () => {
    if (!items.length || items.some((i) => !i.productId)) {
      toast({ variant: 'destructive', title: 'Please add at least one valid item' })
      return
    }
    try {
      const res = await apiFetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: saleId || undefined, items, reason, refundMethod }),
      })
      if (res.ok) {
        toast({ title: 'Return processed successfully' })
        setShowModal(false)
        setSaleId('')
        setReason('')
        setItems([])
        fetchReturns()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to process return' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to process return' })
    }
  }

  const filtered = returns.filter((r) =>
    r.returnNo.toLowerCase().includes(search.toLowerCase()) ||
    r.sale?.receiptNo?.toLowerCase().includes(search.toLowerCase())
  )

  const totalAmount = filtered.reduce((sum, r) => sum + r.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Returns & Refunds</h1>
          <p className="text-muted-foreground">Process customer returns and refunds</p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Return</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Process New Return</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sale Receipt No (optional)</Label>
                  <Input value={saleId} onChange={(e) => setSaleId(e.target.value)} placeholder="Link to original sale" />
                </div>
                <div>
                  <Label>Refund Method</Label>
                  <Select value={refundMethod} onValueChange={setRefundMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="credit">Store Credit</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Return reason" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Select value={item.productId} onValueChange={(v) => updateItem(idx, 'productId', v)}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} placeholder="Qty" />
                    </div>
                    <div className="col-span-3">
                      <Input type="number" value={item.price} onChange={(e) => updateItem(idx, 'price', e.target.value)} placeholder="Price" />
                    </div>
                    <div className="col-span-1">
                      <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}>✕</Button>
                    </div>
                  </div>
                ))}
                {items.length > 0 && (
                  <div className="text-right text-sm font-medium pt-2">
                    Total: {(items.reduce((s, i) => s + i.quantity * i.price, 0)).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Process Return</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{filtered.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Refund Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalAmount.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Return Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{filtered.length ? (totalAmount / filtered.length).toFixed(2) : '0.00'}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search returns..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No returns found</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((ret) => (
                <div key={ret.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-medium">{ret.returnNo}</p>
                      {ret.sale && <Badge variant="outline">{ret.sale.receiptNo}</Badge>}
                      <Badge variant={ret.refundMethod === 'cash' ? 'default' : 'secondary'}>{ret.refundMethod}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {ret.items.length} item(s) • {ret.reason || 'No reason provided'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(ret.createdAt).toLocaleString()} • by {ret.user?.fname} {ret.user?.lname}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{ret.total.toFixed(2)}</p>
                    <Badge variant="default">{ret.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
