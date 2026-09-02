import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { creditNotesApi, debitNotesApi, apiFetch, branchesApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, FileText, Pencil, Ban, Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'

type NoteType = 'credit' | 'debit'

interface Note {
  id: string
  noteNo: string
  amount: number
  reason: string
  status: string
  notes?: string
  createdAt: string
  customer?: { id: string; name: string; phone?: string }
  supplier?: { id: string; name: string; phone?: string }
  branch?: { id: string; name: string }
}

interface Entity {
  id: string
  name: string
}

interface LinkedDocItem {
  productId: string
  productName: string
  quantity: number
  maxQuantity: number
  unitAmount: number
  total: number
}

interface LinkedDoc {
  id: string
  refNo: string
  total: number
  createdAt?: string
  items: LinkedDocItem[]
}

const CREDIT_REASONS = ['sales_return', 'price_adjustment', 'overcharge', 'cancellation', 'other']
const DEBIT_REASONS = ['purchase_return', 'short_delivery', 'quality_issue', 'price_adjustment', 'other']

const isStockReturnReason = (tab: NoteType, value: string) => (
  (tab === 'credit' && CREDIT_REASONS.includes(value)) ||
  (tab === 'debit' && value === 'purchase_return')
)

const defaultStockReturnReason = (tab: NoteType) => tab === 'credit' ? 'sales_return' : 'purchase_return'

const money = (value: unknown) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

const lineUnitAmount = (item: any, field: 'price' | 'cost') => {
  const quantity = Number(item.quantity || 0)
  if (quantity > 0 && item.total !== undefined) return money(item.total) / quantity
  return money(item[field])
}

export default function CreditDebitNotesPage({ initialTab }: { initialTab?: NoteType }) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<NoteType>(initialTab || 'credit')
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [entityId, setEntityId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [notesField, setNotesField] = useState('')
  const [branchId, setBranchId] = useState('')
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([])
  const [linkedDocId, setLinkedDocId] = useState('')
  const [returnItems, setReturnItems] = useState<LinkedDocItem[]>([])
  const [loadingLinkedDocs, setLoadingLinkedDocs] = useState(false)
  const stockReturnMode = isStockReturnReason(activeTab, reason)

  const fetchEntities = useCallback(async () => {
    try {
      if (activeTab === 'credit') {
        const res = await apiFetch('/api/receivables/customers?limit=10000')
        if (res.ok) {
          const data = await res.json()
          const list = data?.customers || data || []
          setEntities(list.map((c: any) => ({ id: c.id, name: c.name })))
        } else {
          setEntities([])
          toast({ variant: 'destructive', title: 'Failed to load customers' })
        }
      } else {
        const res = await apiFetch('/api/payables/suppliers?limit=10000')
        if (res.ok) {
          const data = await res.json()
          const list = data?.suppliers || data || []
          setEntities(list.map((s: any) => ({ id: s.id, name: s.name })))
        } else {
          setEntities([])
          toast({ variant: 'destructive', title: 'Failed to load suppliers' })
        }
      }
    } catch {
      setEntities([])
    }
  }, [activeTab, toast])

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try {
      const api = activeTab === 'credit' ? creditNotesApi : debitNotesApi
      const res = await api.list({ search, status: statusFilter || undefined, limit: 100 })
      setNotes(res?.data || [])
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to load notes', description: err.message })
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, statusFilter, toast])

  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  useEffect(() => {
    branchesApi.active().then(setBranches).catch(() => {})
  }, [])

  const fetchLinkedDocs = useCallback(async () => {
    if (!showModal || editNote || !entityId || !stockReturnMode) {
      setLinkedDocs([])
      setLinkedDocId('')
      setReturnItems([])
      return
    }

    setLoadingLinkedDocs(true)
    try {
      const endpoint = activeTab === 'credit'
        ? `/api/receivables/sales?customerId=${entityId}&limit=100`
        : `/api/payables/purchases?supplierId=${entityId}&limit=100`
      const response = await apiFetch(endpoint)
      if (!response.ok) throw new Error('Failed to load original transactions')
      const data = await response.json()
      const responseRows = activeTab === 'credit' ? data.sales : data.purchases
      const sourceRows = Array.isArray(responseRows) ? responseRows : Array.isArray(data) ? data : []
      const docs: LinkedDoc[] = sourceRows
        .filter((row: any) => row?.id && Array.isArray(row.items) && row.items.length > 0 && row.status !== 'cancelled')
        .map((row: any) => ({
          id: row.id,
          refNo: row.receiptNo || row.refNo || row.id.slice(-8),
          total: money(row.total),
          createdAt: row.createdAt,
          items: (row.items || [])
            .map((item: any) => {
              const productId = item.productId || item.product?.id
              const quantity = Math.max(0, Number(item.quantity || 0))
              const unitAmount = lineUnitAmount(item, activeTab === 'credit' ? 'price' : 'cost')
              return {
                productId,
                productName: item.product?.name || item.productName || 'Product',
                quantity,
                maxQuantity: quantity,
                unitAmount,
                total: money(unitAmount * quantity),
              }
            })
            .filter((item: LinkedDocItem) => item.productId && item.maxQuantity > 0),
        }))
        .filter((row: LinkedDoc) => row.items.length > 0)
      setLinkedDocs(docs)
    } catch (err: any) {
      setLinkedDocs([])
      toast({ variant: 'destructive', title: 'Failed to load original transactions', description: err.message })
    } finally {
      setLoadingLinkedDocs(false)
    }
  }, [activeTab, editNote, entityId, showModal, stockReturnMode, toast])

  useEffect(() => {
    fetchLinkedDocs()
  }, [fetchLinkedDocs])

  useEffect(() => {
    if (!stockReturnMode || editNote) return
    const total = returnItems.reduce((sum, item) => sum + money(item.unitAmount * Number(item.quantity || 0)), 0)
    setAmount(total > 0 ? String(total) : '')
  }, [editNote, returnItems, stockReturnMode])

  const resetForm = (nextReason = '') => {
    setEntityId('')
    setAmount('')
    setReason(nextReason)
    setNotesField('')
    setBranchId('')
    setLinkedDocId('')
    setLinkedDocs([])
    setReturnItems([])
    setEditNote(null)
  }

  const openCreate = () => {
    resetForm(defaultStockReturnReason(activeTab))
    setShowModal(true)
  }

  const openEdit = (note: Note) => {
    setEditNote(note)
    setEntityId(note.customer?.id || note.supplier?.id || '')
    setAmount(String(note.amount))
    setReason(note.reason)
    setNotesField(note.notes || '')
    setBranchId(note.branch?.id || '')
    setLinkedDocId('')
    setLinkedDocs([])
    setReturnItems([])
    setShowModal(true)
  }

  const selectLinkedDoc = (docId: string) => {
    setLinkedDocId(docId)
    const doc = linkedDocs.find(row => row.id === docId)
    const items = doc?.items.map(item => ({ ...item })) || []
    setReturnItems(items)
  }

  const updateReturnQuantity = (productId: string, value: string) => {
    const quantity = Math.min(
      returnItems.find(item => item.productId === productId)?.maxQuantity || 0,
      Math.max(0, Number.parseInt(value || '0', 10) || 0)
    )
    setReturnItems(current => current.map(item => (
      item.productId === productId
        ? { ...item, quantity, total: money(item.unitAmount * quantity) }
        : item
    )))
  }

  const handleSubmit = async () => {
    if (!editNote && !entityId) {
      toast({ variant: 'destructive', title: `Please select a ${activeTab === 'credit' ? 'customer' : 'supplier'}` })
      return
    }
    if (!amount || Number(amount) <= 0) {
      toast({ variant: 'destructive', title: 'Amount must be greater than 0' })
      return
    }
    if (!reason) {
      toast({ variant: 'destructive', title: 'Please select a reason' })
      return
    }
    if (!editNote && stockReturnMode) {
      if (!linkedDocId) {
        toast({ variant: 'destructive', title: `Select the original ${activeTab === 'credit' ? 'sale' : 'purchase'}` })
        return
      }
      if (!returnItems.some(item => Number(item.quantity || 0) > 0)) {
        toast({ variant: 'destructive', title: 'Select at least one product quantity to return' })
        return
      }
    }

    setSubmitting(true)
    try {
      const api = activeTab === 'credit' ? creditNotesApi : debitNotesApi
      if (editNote) {
        await api.update(editNote.id, { amount: Number(amount), reason, notes: notesField })
        toast({ title: `${activeTab === 'credit' ? 'Credit' : 'Debit'} note updated` })
      } else {
        const payload: any = { amount: Number(amount), reason, notes: notesField }
        if (branchId) payload.branchId = branchId
        if (stockReturnMode) {
          payload.items = returnItems
            .filter(item => Number(item.quantity || 0) > 0)
            .map(item => ({ productId: item.productId, quantity: Number(item.quantity) }))
        }
        if (activeTab === 'credit') {
          payload.customerId = entityId
          if (stockReturnMode) payload.saleId = linkedDocId
        } else {
          payload.supplierId = entityId
          if (stockReturnMode) payload.purchaseId = linkedDocId
        }
        await api.create(payload)
        toast({ title: `${activeTab === 'credit' ? 'Credit' : 'Debit'} note created` })
      }
      setShowModal(false)
      resetForm()
      fetchNotes()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (note: Note) => {
    if (!confirm(`Cancel ${note.noteNo}? This will reverse the balance adjustment.`)) return
    try {
      const api = activeTab === 'credit' ? creditNotesApi : debitNotesApi
      await api.cancel(note.id)
      toast({ title: `${note.noteNo} cancelled` })
      fetchNotes()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to cancel', description: err.message })
    }
  }

  const reasons = activeTab === 'credit' ? CREDIT_REASONS : DEBIT_REASONS
  const entityLabel = activeTab === 'credit' ? 'Customer' : 'Supplier'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Credit & Debit Notes</h1>
          <p className="text-sm text-muted-foreground">Manage credit notes for customers and debit notes for suppliers</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New {activeTab === 'credit' ? 'Credit' : 'Debit'} Note
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'credit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('credit')}
        >
          <ArrowDownCircle className="h-4 w-4" />
          Credit Notes (Customers)
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'debit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('debit')}
        >
          <ArrowUpCircle className="h-4 w-4" />
          Debit Notes (Suppliers)
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by note no, reason, or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="issued">Issued</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No {activeTab === 'credit' ? 'credit' : 'debit'} notes found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Note No</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{entityLabel}</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Branch</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map(note => (
                    <tr key={note.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{note.noteNo}</td>
                      <td className="px-4 py-3">{note.customer?.name || note.supplier?.name || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(note.amount)}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize">{note.reason.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-3">{note.branch?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={note.status === 'cancelled' ? 'destructive' : 'default'} className="capitalize">
                          {note.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{new Date(note.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {note.status !== 'cancelled' && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(note)} title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleCancel(note)} title="Cancel">
                                <Ban className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
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

      {/* Create/Edit Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editNote ? 'Edit' : 'New'} {activeTab === 'credit' ? 'Credit' : 'Debit'} Note
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editNote && (
              <div>
                <Label>{entityLabel} <span className="text-red-500">*</span></Label>
                <Select value={entityId} onValueChange={(value) => {
                  setEntityId(value)
                  setLinkedDocId('')
                  setReturnItems([])
                }}>
                  <SelectTrigger><SelectValue placeholder={`Select ${entityLabel}...`} /></SelectTrigger>
                  <SelectContent>
                    {entities.length === 0 ? (
                      <SelectItem value="_none" disabled>No {entityLabel.toLowerCase()}s available</SelectItem>
                    ) : (
                      entities.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Select value={reason} onValueChange={(value) => {
                setReason(value)
                setLinkedDocId('')
                setReturnItems([])
                if (!isStockReturnReason(activeTab, value)) setAmount('')
              }}>
                <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                <SelectContent>
                  {reasons.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="amount">Amount <span className="text-red-500">*</span></Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                readOnly={stockReturnMode && !editNote}
              />
            </div>
            {!editNote && stockReturnMode && (
              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <Label>Original {activeTab === 'credit' ? 'Sale' : 'Purchase'} <span className="text-red-500">*</span></Label>
                  <Select value={linkedDocId} onValueChange={selectLinkedDoc} disabled={!entityId || loadingLinkedDocs}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingLinkedDocs ? 'Loading...' : `Select original ${activeTab === 'credit' ? 'sale' : 'purchase'}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {linkedDocs.length === 0 ? (
                        <SelectItem value="_none" disabled>No original transactions found</SelectItem>
                      ) : (
                        linkedDocs.map(doc => (
                          <SelectItem key={doc.id} value={doc.id}>
                            {doc.refNo} - {formatCurrency(doc.total)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {returnItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="hidden grid-cols-[minmax(0,1fr)_96px_112px] gap-3 text-xs font-medium text-muted-foreground sm:grid">
                      <span>Product</span>
                      <span>Qty</span>
                      <span className="text-right">Amount</span>
                    </div>
                    {returnItems.map(item => (
                      <div key={item.productId} className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_96px_112px] sm:gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium leading-snug">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">Max {item.maxQuantity}</p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          max={item.maxQuantity}
                          value={item.quantity}
                          onChange={event => updateReturnQuantity(item.productId, event.target.value)}
                        />
                        <div className="col-span-2 text-right text-sm font-medium sm:col-span-1">{formatCurrency(item.total)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!editNote && (
              <div>
                <Label>Branch <span className="text-red-500">*</span></Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="Select branch..." /></SelectTrigger>
                  <SelectContent>
                    {branches.length === 0 ? (
                      <SelectItem value="_none" disabled>No branches available</SelectItem>
                    ) : (
                      branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                value={notesField}
                onChange={e => setNotesField(e.target.value)}
                placeholder="Additional details..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={submitting || (!editNote && (!entityId || !amount || Number(amount) <= 0 || !reason || !branchId || (stockReturnMode && (!linkedDocId || !returnItems.some(item => Number(item.quantity || 0) > 0))))) || (editNote && (!amount || Number(amount) <= 0 || !reason))}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editNote ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
