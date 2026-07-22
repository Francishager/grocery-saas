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

const CREDIT_REASONS = ['sales_return', 'price_adjustment', 'overcharge', 'cancellation', 'other']
const DEBIT_REASONS = ['purchase_return', 'short_delivery', 'quality_issue', 'price_adjustment', 'other']

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

  const resetForm = () => {
    setEntityId('')
    setAmount('')
    setReason('')
    setNotesField('')
    setBranchId('')
    setEditNote(null)
  }

  const openCreate = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (note: Note) => {
    setEditNote(note)
    setEntityId(note.customer?.id || note.supplier?.id || '')
    setAmount(String(note.amount))
    setReason(note.reason)
    setNotesField(note.notes || '')
    setBranchId(note.branch?.id || '')
    setShowModal(true)
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

    setSubmitting(true)
    try {
      const api = activeTab === 'credit' ? creditNotesApi : debitNotesApi
      if (editNote) {
        await api.update(editNote.id, { amount: Number(amount), reason, notes: notesField })
        toast({ title: `${activeTab === 'credit' ? 'Credit' : 'Debit'} note updated` })
      } else {
        const payload: any = { amount: Number(amount), reason, notes: notesField }
        if (branchId) payload.branchId = branchId
        if (activeTab === 'credit') payload.customerId = entityId
        else payload.supplierId = entityId
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editNote ? 'Edit' : 'New'} {activeTab === 'credit' ? 'Credit' : 'Debit'} Note
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editNote && (
              <div>
                <Label>{entityLabel} <span className="text-red-500">*</span></Label>
                <Select value={entityId} onValueChange={setEntityId}>
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
              <Label htmlFor="amount">Amount <span className="text-red-500">*</span></Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                <SelectContent>
                  {reasons.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
              disabled={submitting || (!editNote && (!entityId || !amount || Number(amount) <= 0 || !reason || !branchId)) || (editNote && (!amount || Number(amount) <= 0 || !reason))}
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
