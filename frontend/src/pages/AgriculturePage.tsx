import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sprout, Plus, Trash2, Wheat, Beef, TrendingUp, DollarSign } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface FarmField { id: string; name: string; areaSize: number; areaUnit: string; cropType: string | null; status: string; notes: string | null; _count?: { harvests: number; fieldExpenses: number } }
interface Livestock { id: string; name: string; type: string; breed: string | null; count: number; notes: string | null; _count?: { harvests: number } }
interface Harvest { id: string; type: string; productName: string | null; product?: { id: string; name: string } | null; field?: { name: string } | null; livestock?: { name: string } | null; quantity: number; unit: string; quality: string | null; harvestDate: string }
interface FarmExpense { id: string; category: string; description: string; amount: number; date: string; field?: { name: string } | null; livestock?: { name: string } | null }

export default function AgriculturePage() {
  const [tab, setTab] = useState('fields')
  const [fields, setFields] = useState<FarmField[]>([])
  const [livestock, setLivestock] = useState<Livestock[]>([])
  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [expenses, setExpenses] = useState<FarmExpense[]>([])
  const [showFieldModal, setShowFieldModal] = useState(false)
  const [showLivestockModal, setShowLivestockModal] = useState(false)
  const [showHarvestModal, setShowHarvestModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [fieldForm, setFieldForm] = useState({ name: '', areaSize: 0, areaUnit: 'acre', cropType: '', notes: '' })
  const [livestockForm, setLivestockForm] = useState({ name: '', type: 'cattle', breed: '', count: 0, notes: '' })
  const [harvestForm, setHarvestForm] = useState({ fieldId: '', livestockId: '', type: 'crop', productName: '', productId: '', quantity: 0, unit: 'kg', quality: '' })
  const [expenseForm, setExpenseForm] = useState({ fieldId: '', livestockId: '', category: 'seeds', description: '', amount: 0 })
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      const [f, l, h, e] = await Promise.all([
        apiFetch('/api/agriculture/fields').then(r => r.json()).catch(() => []),
        apiFetch('/api/agriculture/livestock').then(r => r.json()).catch(() => []),
        apiFetch('/api/agriculture/harvests').then(r => r.json()).catch(() => []),
        apiFetch('/api/agriculture/expenses').then(r => r.json()).catch(() => []),
      ])
      setFields(Array.isArray(f) ? f : [])
      setLivestock(Array.isArray(l) ? l : [])
      setHarvests(Array.isArray(h) ? h : [])
      setExpenses(Array.isArray(e) ? e : [])
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const createField = async () => {
    if (!fieldForm.name.trim()) { toast({ variant: 'destructive', title: 'Field name is required' }); return }
    try { await apiFetch('/api/agriculture/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fieldForm) }); setShowFieldModal(false); setFieldForm({ name: '', areaSize: 0, areaUnit: 'acre', cropType: '', notes: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create field' }) }
  }
  const createLivestock = async () => {
    if (!livestockForm.name.trim()) { toast({ variant: 'destructive', title: 'Livestock name is required' }); return }
    if (livestockForm.count < 1) { toast({ variant: 'destructive', title: 'Count must be at least 1' }); return }
    try { await apiFetch('/api/agriculture/livestock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(livestockForm) }); setShowLivestockModal(false); setLivestockForm({ name: '', type: 'cattle', breed: '', count: 0, notes: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to create livestock' }) }
  }
  const createHarvest = async () => {
    if (!harvestForm.productName.trim()) { toast({ variant: 'destructive', title: 'Product name is required' }); return }
    if (harvestForm.quantity < 1) { toast({ variant: 'destructive', title: 'Quantity must be at least 1' }); return }
    try { await apiFetch('/api/agriculture/harvests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(harvestForm) }); setShowHarvestModal(false); setHarvestForm({ fieldId: '', livestockId: '', type: 'crop', productName: '', productId: '', quantity: 0, unit: 'kg', quality: '' }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to record harvest' }) }
  }
  const createExpense = async () => {
    if (!expenseForm.description.trim()) { toast({ variant: 'destructive', title: 'Description is required' }); return }
    if (expenseForm.amount <= 0) { toast({ variant: 'destructive', title: 'Amount must be greater than 0' }); return }
    try { await apiFetch('/api/agriculture/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expenseForm) }); setShowExpenseModal(false); setExpenseForm({ fieldId: '', livestockId: '', category: 'seeds', description: '', amount: 0 }); loadData() } catch { toast({ variant: 'destructive', title: 'Failed to add expense' }) }
  }
  const deleteField = async (id: string) => { try { await apiFetch(`/api/agriculture/fields/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }
  const deleteLivestock = async (id: string) => { try { await apiFetch(`/api/agriculture/livestock/${id}`, { method: 'DELETE' }) } catch {} ; loadData() }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const totalHarvestQty = harvests.reduce((s, h) => s + h.quantity, 0)

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sprout className="h-7 w-7" /> Agriculture</h1>
        <p className="text-sm text-muted-foreground">Field management, livestock, harvests, and farm expenses</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{fields.length}</div><p className="text-xs text-muted-foreground">Fields</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{livestock.length}</div><p className="text-xs text-muted-foreground">Livestock</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalHarvestQty.toFixed(0)}</div><p className="text-xs text-muted-foreground">Total Harvest</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalExpenses.toFixed(0)}</div><p className="text-xs text-muted-foreground">Farm Expenses</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="fields"><Wheat className="mr-1 h-4 w-4" /> Fields</TabsTrigger>
          <TabsTrigger value="livestock"><Beef className="mr-1 h-4 w-4" /> Livestock</TabsTrigger>
          <TabsTrigger value="harvests"><TrendingUp className="mr-1 h-4 w-4" /> Harvests</TabsTrigger>
          <TabsTrigger value="expenses"><DollarSign className="mr-1 h-4 w-4" /> Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4">
          <Button onClick={() => setShowFieldModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Field</Button>
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map(f => (
              <Card key={f.id}>
                <CardHeader><CardTitle className="flex items-center justify-between text-base">{f.name} <Badge variant="secondary">{f.status}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between"><span>Area:</span><span>{f.areaSize} {f.areaUnit}</span></div>
                    <div className="flex justify-between"><span>Crop:</span><span>{f.cropType || '—'}</span></div>
                    <Button variant="ghost" size="sm" className="mt-2 text-red-500" onClick={() => deleteField(f.id)}><Trash2 className="h-3 w-3" /> Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="livestock" className="space-y-4">
          <Button onClick={() => setShowLivestockModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Livestock</Button>
          <div className="grid gap-4 md:grid-cols-2">
            {livestock.map(l => (
              <Card key={l.id}>
                <CardHeader><CardTitle className="flex items-center justify-between text-base">{l.name} <Badge variant="secondary">{l.type}</Badge></CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between"><span>Breed:</span><span>{l.breed || '—'}</span></div>
                    <div className="flex justify-between"><span>Count:</span><span>{l.count}</span></div>
                    <Button variant="ghost" size="sm" className="mt-2 text-red-500" onClick={() => deleteLivestock(l.id)}><Trash2 className="h-3 w-3" /> Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="harvests" className="space-y-4">
          <Button onClick={() => setShowHarvestModal(true)}><Plus className="mr-1 h-4 w-4" /> Record Harvest</Button>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Product</th><th className="p-2 text-left">Source</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Quality</th></tr></thead>
              <tbody>
                {harvests.map(h => (
                  <tr key={h.id} className="border-t">
                    <td className="p-2">{new Date(h.harvestDate).toLocaleDateString()}</td>
                    <td className="p-2"><Badge variant="secondary">{h.type}</Badge></td>
                    <td className="p-2">{h.productName || h.product?.name || '—'}</td>
                    <td className="p-2">{h.field?.name || h.livestock?.name || '—'}</td>
                    <td className="p-2 text-right font-medium">{h.quantity} {h.unit}</td>
                    <td className="p-2">{h.quality || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <Button onClick={() => setShowExpenseModal(true)}><Plus className="mr-1 h-4 w-4" /> Add Farm Expense</Button>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Category</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">Source</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id} className="border-t">
                    <td className="p-2">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="p-2"><Badge variant="secondary">{e.category}</Badge></td>
                    <td className="p-2">{e.description}</td>
                    <td className="p-2">{e.field?.name || e.livestock?.name || '—'}</td>
                    <td className="p-2 text-right font-medium">{e.amount.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showFieldModal} onOpenChange={setShowFieldModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Farm Field</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={fieldForm.name} onChange={e => setFieldForm({ ...fieldForm, name: e.target.value })} placeholder="North Field" /></div>
            <div><Label>Area Size</Label><Input type="number" value={fieldForm.areaSize} onChange={e => setFieldForm({ ...fieldForm, areaSize: +e.target.value })} /></div>
            <div><Label>Area Unit</Label>
              <Select value={fieldForm.areaUnit} onValueChange={v => setFieldForm({ ...fieldForm, areaUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="acre">Acre</SelectItem><SelectItem value="hectare">Hectare</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Crop Type</Label><Input value={fieldForm.cropType} onChange={e => setFieldForm({ ...fieldForm, cropType: e.target.value })} placeholder="Maize" /></div>
            <div><Label>Notes</Label><Input value={fieldForm.notes} onChange={e => setFieldForm({ ...fieldForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createField}>Create Field</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLivestockModal} onOpenChange={setShowLivestockModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Livestock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={livestockForm.name} onChange={e => setLivestockForm({ ...livestockForm, name: e.target.value })} placeholder="Cattle Herd" /></div>
            <div><Label>Type</Label>
              <Select value={livestockForm.type} onValueChange={v => setLivestockForm({ ...livestockForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="cattle">Cattle</SelectItem><SelectItem value="poultry">Poultry</SelectItem><SelectItem value="goats">Goats</SelectItem><SelectItem value="sheep">Sheep</SelectItem><SelectItem value="pigs">Pigs</SelectItem><SelectItem value="fish">Fish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Breed</Label><Input value={livestockForm.breed} onChange={e => setLivestockForm({ ...livestockForm, breed: e.target.value })} /></div>
            <div><Label>Count</Label><Input type="number" value={livestockForm.count} onChange={e => setLivestockForm({ ...livestockForm, count: +e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createLivestock}>Create Livestock</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHarvestModal} onOpenChange={setShowHarvestModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Harvest</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Type</Label>
              <Select value={harvestForm.type} onValueChange={v => setHarvestForm({ ...harvestForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="crop">Crop</SelectItem><SelectItem value="milk">Milk</SelectItem><SelectItem value="eggs">Eggs</SelectItem><SelectItem value="meat">Meat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Product Name</Label><Input value={harvestForm.productName} onChange={e => setHarvestForm({ ...harvestForm, productName: e.target.value })} placeholder="Maize" /></div>
            <div><Label>Field</Label>
              <Select value={harvestForm.fieldId} onValueChange={v => setHarvestForm({ ...harvestForm, fieldId: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>
                  {fields.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Livestock</Label>
              <Select value={harvestForm.livestockId} onValueChange={v => setHarvestForm({ ...harvestForm, livestockId: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>
                  {livestock.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={harvestForm.quantity} onChange={e => setHarvestForm({ ...harvestForm, quantity: +e.target.value })} /></div>
            <div><Label>Unit</Label><Input value={harvestForm.unit} onChange={e => setHarvestForm({ ...harvestForm, unit: e.target.value })} placeholder="kg, litres, trays" /></div>
            <div><Label>Quality</Label><Input value={harvestForm.quality} onChange={e => setHarvestForm({ ...harvestForm, quality: e.target.value })} placeholder="Grade A" /></div>
          </div>
          <DialogFooter><Button onClick={createHarvest}>Record Harvest</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpenseModal} onOpenChange={setShowExpenseModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Farm Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Category</Label>
              <Select value={expenseForm.category} onValueChange={v => setExpenseForm({ ...expenseForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="seeds">Seeds</SelectItem><SelectItem value="fertilizer">Fertilizer</SelectItem><SelectItem value="feed">Feed</SelectItem><SelectItem value="veterinary">Veterinary</SelectItem><SelectItem value="labour">Labour</SelectItem><SelectItem value="fuel">Fuel</SelectItem><SelectItem value="irrigation">Irrigation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Input value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} /></div>
            <div><Label>Amount</Label><Input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: +e.target.value })} /></div>
            <div><Label>Field</Label>
              <Select value={expenseForm.fieldId} onValueChange={v => setExpenseForm({ ...expenseForm, fieldId: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>
                  {fields.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Livestock</Label>
              <Select value={expenseForm.livestockId} onValueChange={v => setExpenseForm({ ...expenseForm, livestockId: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>
                  {livestock.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={createExpense}>Add Expense</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
