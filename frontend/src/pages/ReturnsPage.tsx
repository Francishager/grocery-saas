import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'
import { Loader2, Plus, Receipt, RotateCcw, Search } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalReturns } from '@/db/hybrid'

interface SaleReturn {
  id: string
  returnNo: string
  total: number
  reason?: string
  refundMethod: string
  status: string
  createdAt: string
  sale?: { id: string; receiptNo: string; paymentMethod?: string; customerName?: string }
  customer?: { id: string; name: string }
  user?: { id: string; fname: string; lname: string }
  items: { id: string; productId: string; product: { name: string; sku?: string }; quantity: number; price: number; total: number; reason?: string }[]
}

interface ReturnableSaleItem {
  id: string
  productId: string
  productName: string
  sku?: string
  quantity: number
  returnedQuantity: number
  remainingQuantity: number
  unitName?: string
  price: number
}

interface ReturnableSale {
  id: string
  receiptNo: string
  total: number
  paymentMethod: string
  customerName?: string
  createdAt: string
  items: ReturnableSaleItem[]
}

interface ReturnFormItem {
  saleItemId: string
  productId: string
  productName: string
  unitName?: string
  quantity: number
  maxQuantity: number
  price: number
  reason?: string
}

const paymentLabel = (method?: string) => String(method || 'cash').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

export default function ReturnsPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [returns, setReturns] = useState<SaleReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [returnableSales, setReturnableSales] = useState<ReturnableSale[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [saleSearch, setSaleSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [saleId, setSaleId] = useState('')
  const [reason, setReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('cash')
  const [items, setItems] = useState<ReturnFormItem[]>([])

  const selectedSale = useMemo(
    () => returnableSales.find((sale) => sale.id === saleId) || null,
    [returnableSales, saleId]
  )

  const fetchReturns = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/returns')
        if (!res.ok) throw new Error('Failed to load returns')
        const data = await res.json()
        setReturns(Array.isArray(data) ? data : [])
      } else {
        const local = await getLocalReturns()
        setReturns(local as any)
      }
    } catch {
      try {
        setReturns(await getLocalReturns() as any)
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load returns' })
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchReturnableSales = async () => {
    if (!online) {
      setReturnableSales([])
      return
    }

    setSalesLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (saleSearch.trim()) params.set('search', saleSearch.trim())
      const res = await apiFetch(`/api/returns/eligible-sales?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load sale receipts')
      const data = await res.json()
      setReturnableSales(Array.isArray(data.sales) ? data.sales : [])
    } catch (err: any) {
      setReturnableSales([])
      toast({ variant: 'destructive', title: 'Failed to load sale receipts', description: err.message })
    } finally {
      setSalesLoading(false)
    }
  }

  useEffect(() => {
    fetchReturns()
  }, [])

  useEffect(() => {
    if (showModal) fetchReturnableSales()
  }, [showModal, saleSearch, online])

  const resetForm = () => {
    setSaleId('')
    setReason('')
    setRefundMethod('cash')
    setItems([])
    setSaleSearch('')
  }

  const handleModalOpen = (open: boolean) => {
    setShowModal(open)
    if (!open) resetForm()
  }

  const selectSale = (id: string) => {
    setSaleId(id)
    const sale = returnableSales.find((row) => row.id === id)
    setRefundMethod(sale?.paymentMethod || 'cash')
    setItems((sale?.items || []).map((item) => ({
      saleItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      unitName: item.unitName,
      quantity: 0,
      maxQuantity: item.remainingQuantity,
      price: money(item.price),
      reason: '',
    })))
  }

  const updateItem = (idx: number, field: keyof ReturnFormItem, value: string | number) => {
    setItems(current => current.map((item, index) => {
      if (index !== idx) return item
      if (field === 'quantity') {
        const quantity = Math.min(item.maxQuantity, Math.max(0, Number.parseInt(String(value || '0'), 10) || 0))
        return { ...item, quantity }
      }
      return { ...item, [field]: value }
    }))
  }

  const selectedTotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const hasReturnQuantity = items.some((item) => item.quantity > 0)

  const handleSubmit = async () => {
    if (!saleId) {
      toast({ variant: 'destructive', title: 'Select the original sale receipt' })
      return
    }
    if (!hasReturnQuantity) {
      toast({ variant: 'destructive', title: 'Enter at least one return quantity' })
      return
    }

    setSubmitting(true)
    try {
      const res = await apiFetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          reason,
          refundMethod,
          items: items
            .filter((item) => item.quantity > 0)
            .map((item) => ({
              saleItemId: item.saleItemId,
              productId: item.productId,
              quantity: item.quantity,
              reason: item.reason,
            })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to process return')

      toast({ title: 'Return processed successfully' })
      setShowModal(false)
      resetForm()
      fetchReturns()
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message || 'Failed to process return' })
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = returns.filter((ret) => {
    const query = search.toLowerCase()
    return (
      ret.returnNo.toLowerCase().includes(query) ||
      ret.sale?.receiptNo?.toLowerCase().includes(query) ||
      ret.sale?.customerName?.toLowerCase().includes(query) ||
      ret.customer?.name?.toLowerCase().includes(query)
    )
  })

  const totalAmount = filtered.reduce((sum, ret) => sum + money(ret.total), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Returns & Refunds</h1>
          <p className="text-muted-foreground">Process returns from recorded sales receipts</p>
        </div>
        <Dialog open={showModal} onOpenChange={handleModalOpen}>
          <DialogTrigger asChild>
            <Button disabled={!online}><Plus className="h-4 w-4 mr-2" /> New Return</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Process Sales Return</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
                <div>
                  <Label>Find Sale Receipt</Label>
                  <Input
                    value={saleSearch}
                    onChange={(event) => setSaleSearch(event.target.value)}
                    placeholder="Search receipt or customer name..."
                  />
                </div>
                <div>
                  <Label>Refund Method</Label>
                  <Input value={paymentLabel(refundMethod)} readOnly />
                </div>
              </div>

              <div>
                <Label>Original Sale <span className="text-red-500">*</span></Label>
                <Select value={saleId} onValueChange={selectSale} disabled={salesLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={salesLoading ? 'Loading receipts...' : 'Select a returnable sale receipt...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {returnableSales.length === 0 ? (
                      <SelectItem value="_none" disabled>No returnable sales found</SelectItem>
                    ) : (
                      returnableSales.map((sale) => (
                        <SelectItem key={sale.id} value={sale.id}>
                          {sale.receiptNo} - {sale.customerName || 'Walk-in Customer'} - {formatCurrency(sale.total)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedSale && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedSale.receiptNo}</span>
                    <Badge variant="outline">{paymentLabel(selectedSale.paymentMethod)}</Badge>
                    <span className="text-muted-foreground">{formatDisplayDate(selectedSale.createdAt)}</span>
                  </div>
                </div>
              )}

              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Return reason" />
              </div>

              <div className="space-y-2">
                <Label>Returned Items</Label>
                {items.length === 0 ? (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">
                    Select a sale receipt to show returnable items.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Item</th>
                          <th className="px-3 py-2 text-right font-medium">Sold Left</th>
                          <th className="px-3 py-2 text-right font-medium">Return Qty</th>
                          <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                          <th className="px-3 py-2 text-right font-medium">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={item.saleItemId} className="border-t">
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.productName}</div>
                              {item.unitName && <div className="text-xs text-muted-foreground">{item.unitName}</div>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{item.maxQuantity}</td>
                            <td className="px-3 py-2">
                              <Input
                                className="ml-auto w-24 text-right"
                                type="number"
                                min={0}
                                max={item.maxQuantity}
                                value={item.quantity}
                                onChange={(event) => updateItem(idx, 'quantity', event.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.price)}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(item.quantity * item.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {items.length > 0 && (
                  <div className="text-right text-sm font-medium">
                    Refund Total: {formatCurrency(selectedTotal)}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting || !saleId || !hasReturnQuantity}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Process Return
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Returns</div>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Refunded Amount</div>
            <div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Scope</div>
            <div className="text-lg font-semibold">Sales only</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search returns..." value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No sales returns found</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((ret) => (
                <div key={ret.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      <p className="font-mono text-sm font-medium">{ret.returnNo}</p>
                      {ret.sale && <Badge variant="outline">{ret.sale.receiptNo}</Badge>}
                      <Badge variant={ret.refundMethod === 'cash' ? 'default' : 'secondary'}>{paymentLabel(ret.refundMethod)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(ret.sale?.customerName || ret.customer?.name || 'Walk-in Customer')} - {ret.items.length} item(s) - {ret.reason || 'No reason provided'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDisplayDate(ret.createdAt)} - by {[ret.user?.fname, ret.user?.lname].filter(Boolean).join(' ') || 'Staff'}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-bold">{formatCurrency(ret.total)}</p>
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
