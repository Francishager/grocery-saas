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
import { ArrowRightLeft, Plus, Package, Check, X, Truck } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalTransfers, getLocalBranches, getLocalProducts } from '@/db/hybrid'

interface StockTransfer {
  id: string
  transferNo: string
  status: string
  notes?: string
  createdAt: string
  fromBranch?: { id: string; name: string }
  toBranch?: { id: string; name: string }
  user?: { fname: string; lname: string }
  items: { id: string; productId: string; product: { name: string; sku?: string }; quantity: number; notes?: string }[]
}

interface Branch { id: string; name: string }
interface Product { id: string; name: string; sku?: string; quantity: number; branchId?: string }

export default function TransfersPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const [fromBranchId, setFromBranchId] = useState('')
  const [toBranchId, setToBranchId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([])

  const fetchTransfers = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/transfers')
        if (res.ok) setTransfers(await res.json())
      } else {
        const local = await getLocalTransfers()
        setTransfers(local)
      }
    } catch (err) {
      try { setTransfers(await getLocalTransfers()) } catch {}
    }
    finally { setLoading(false) }
  }

  const fetchBranches = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/branches')
        if (res.ok) {
          const data = await res.json()
          setBranches(Array.isArray(data) ? data : data.branches || [])
        }
      } else {
        const local = await getLocalBranches()
        setBranches(local)
      }
    } catch (err) {
      try { setBranches(await getLocalBranches()) } catch {}
    }
  }

  const fetchProducts = async (branchId?: string) => {
    try {
      if (online) {
        const url = branchId ? `/api/inventory?branchId=${branchId}&limit=200` : '/api/inventory?limit=200'
        const res = await apiFetch(url)
        if (res.ok) {
          const data = await res.json()
          const prods = Array.isArray(data) ? data : data.products || data.items || []
          setProducts(prods)
        }
      } else {
        const local = await getLocalProducts(undefined, branchId)
        setProducts(local as any)
      }
    } catch (err) {
      try {
        const local = await getLocalProducts(undefined, branchId)
        setProducts(local as any)
      } catch {}
    }
  }

  useEffect(() => {
    fetchTransfers()
    fetchBranches()
  }, [])

  useEffect(() => {
    if (showModal && fromBranchId) fetchProducts(fromBranchId)
  }, [showModal, fromBranchId])

  const addItem = () => setItems([...items, { productId: '', quantity: 1 }])
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: field === 'quantity' ? Math.max(1, Number(value)) : value }
    setItems(updated)
  }

  const handleCreate = async () => {
    if (!fromBranchId || !toBranchId) return toast({ variant: 'destructive', title: 'Select source and destination branches' })
    if (fromBranchId === toBranchId) return toast({ variant: 'destructive', title: 'Cannot transfer to same branch' })
    if (!items.length || items.some((i) => !i.productId)) return toast({ variant: 'destructive', title: 'Add at least one valid item' })

    try {
      const res = await apiFetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromBranchId, toBranchId, items, notes }),
      })
      if (res.ok) {
        toast({ title: 'Transfer created' })
        setShowModal(false)
        setFromBranchId(''); setToBranchId(''); setNotes(''); setItems([])
        fetchTransfers()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to create transfer' })
    }
  }

  const handleReceive = async (id: string) => {
    try {
      const res = await apiFetch(`/api/transfers/${id}/receive`, { method: 'PUT' })
      if (res.ok) {
        toast({ title: 'Transfer received' })
        fetchTransfers()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to receive transfer' })
    }
  }

  const handleCancel = async (id: string) => {
    try {
      const res = await apiFetch(`/api/transfers/${id}/cancel`, { method: 'PUT' })
      if (res.ok) {
        toast({ title: 'Transfer cancelled' })
        fetchTransfers()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to cancel' })
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_transit: 'bg-blue-100 text-blue-800',
    received: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Branch Transfers</h1>
          <p className="text-muted-foreground">Transfer stock between branches</p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Transfer</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Create Stock Transfer</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>From Branch</Label>
                  <Select value={fromBranchId} onValueChange={setFromBranchId}>
                    <SelectTrigger><SelectValue placeholder="Source branch" /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To Branch</Label>
                  <Select value={toBranchId} onValueChange={setToBranchId}>
                    <SelectTrigger><SelectValue placeholder="Destination branch" /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Items</Label>
                  <Button size="sm" variant="outline" onClick={addItem} disabled={!fromBranchId}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
                </div>
                {items.map((item, idx) => {
                  const product = products.find((p) => p.id === item.productId)
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-8">
                        <Select value={item.productId} onValueChange={(v) => updateItem(idx, 'productId', v)}>
                          <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3"><Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} /></div>
                      <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeItem(idx)}>✕</Button></div>
                    </div>
                  )
                })}
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleCreate}>Create Transfer</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> Total Transfers</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{transfers.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Truck className="h-4 w-4" /> In Transit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{transfers.filter(t => t.status === 'in_transit').length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Check className="h-4 w-4" /> Received</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{transfers.filter(t => t.status === 'received').length}</div></CardContent></Card>
      </div>

      <div className="space-y-3">
        {transfers.map((tr) => (
          <div key={tr.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{tr.transferNo}</span>
                <Badge className={statusColor[tr.status] || 'bg-gray-100'}>{tr.status}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(tr.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm mb-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span>{tr.fromBranch?.name || '—'}</span>
              <ArrowRightLeft className="h-3 w-3" />
              <span>{tr.toBranch?.name || '—'}</span>
              <span className="text-muted-foreground">• {tr.items.length} item(s)</span>
            </div>
            {tr.notes && <p className="text-sm text-muted-foreground mb-2">{tr.notes}</p>}
            <div className="space-y-1">
              {tr.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm py-1 border-b border-dashed">
                  <span>{item.product.name} {item.product.sku && `(${item.product.sku})`}</span>
                  <span className="font-mono">{item.quantity} units</span>
                </div>
              ))}
            </div>
            {tr.status === 'in_transit' && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => handleReceive(tr.id)}><Check className="h-4 w-4 mr-1" /> Receive</Button>
                <Button size="sm" variant="outline" onClick={() => handleCancel(tr.id)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div>
            )}
          </div>
        ))}
        {transfers.length === 0 && !loading && <div className="text-center py-8 text-muted-foreground">No transfers yet</div>}
      </div>
    </div>
  )
}
