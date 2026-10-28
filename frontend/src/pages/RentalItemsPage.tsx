import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Check, ChevronsUpDown, Clock, Edit2, Plus, Search, Trash2 } from 'lucide-react'
import { appConfirm } from '@/lib/appFeedback'
import { branchesApi, categoriesApi, inventoryApi, type BranchOption, type InventoryItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { defaultBranchId } from '@/lib/branchSelection'
import { formatCurrency } from '@/lib/utils'
import { useOnlineStatus } from '@/db/hooks'

type RentalPeriod = 'hourly' | 'daily' | 'weekly' | 'weekend' | 'monthly' | 'custom'
type RentalAssetForm = {
  product_name: string
  sku: string
  categoryId: string
  branchId: string
  quantity: string
  cost_price: string
  rentalPrice: string
  rentalPeriod: RentalPeriod
  depositAmount: string
  replacementValue: string
  description: string
}

const emptyForm: RentalAssetForm = {
  product_name: '', sku: '', categoryId: '', branchId: '', quantity: '1', cost_price: '0',
  rentalPrice: '', rentalPeriod: 'daily', depositAmount: '0', replacementValue: '0', description: '',
}

const periods: RentalPeriod[] = ['hourly', 'daily', 'weekly', 'weekend', 'monthly', 'custom']

export default function RentalItemsPage() {
  const { hasPermission, user } = useJWTAuth()
  const { toast } = useToast()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; categoryType?: string }[]>([])
  const [categoryQuery, setCategoryQuery] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoriesError, setCategoriesError] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState<RentalAssetForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const categoryPickerRef = useRef<HTMLDivElement | null>(null)
  const online = useOnlineStatus()
  const canCreate = hasPermission('canCreateRental')
  const canCreateCategory = canCreate
  const canEdit = hasPermission('canEditRental')
  const canDelete = hasPermission('canDeleteRental')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rentalItems, branchRows, categoryRows] = await Promise.all([
        inventoryApi.list(search.trim() || undefined, undefined, 'rental'),
        branchesApi.active(),
        categoriesApi.list('rental'),
      ])
      setItems(rentalItems)
      setBranches(branchRows || [])
      setCategories(categoryRows || [])
    } catch (error: any) {
      toast({ title: 'Could not load rental items', description: error?.message || 'Retry in a moment.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(event.target as Node)) setCategoryOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const selectedCategory = categories.find(category => category.id === form.categoryId)
  const filteredCategories = useMemo(() => {
    const query = categoryQuery.trim().toLocaleLowerCase()
    return query ? categories.filter(category => category.name.toLocaleLowerCase().includes(query)) : categories
  }, [categories, categoryQuery])

  const loadCategories = async () => {
    setCategoriesLoading(true)
    setCategoriesError('')
    try {
      const rows = await categoriesApi.list('rental')
      setCategories(Array.isArray(rows) ? rows : [])
    } catch (error: any) {
      setCategoriesError(error?.message || 'Unable to load categories')
    } finally {
      setCategoriesLoading(false)
    }
  }

  const createCategory = async () => {
    const name = categoryQuery.normalize('NFKC').trim().replace(/\s+/g, ' ')
    if (!name || !canCreateCategory || categorySaving || !online) return
    setCategorySaving(true)
    try {
      const { category } = await categoriesApi.create({ name, categoryType: 'rental' })
      setCategories(current => [...current.filter(row => row.id !== category.id), category].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(current => ({ ...current, categoryId: category.id }))
      setCategoryQuery('')
      setCategoryOpen(false)
      toast({ title: 'Category saved' })
    } catch (error: any) {
      toast({ title: 'Unable to create category', description: error?.message || 'Try again.', variant: 'destructive' })
    } finally {
      setCategorySaving(false)
    }
  }

  const beginCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, branchId: defaultBranchId(user, branches) || '' })
    setShowForm(true)
  }

  const beginEdit = (item: InventoryItem) => {
    setEditing(item)
    setForm({
      product_name: item.product_name || '', sku: item.sku || item.product_id || '',
      categoryId: item.categoryId || '', branchId: item.branchId || '', quantity: String(item.quantity ?? 0),
      cost_price: String(item.cost_price ?? 0), rentalPrice: String(item.rentalPrice ?? item.unit_price ?? ''),
      rentalPeriod: (periods.includes(item.rentalPeriod as RentalPeriod) ? item.rentalPeriod : 'daily') as RentalPeriod,
      depositAmount: String(item.depositAmount ?? 0), replacementValue: String(item.replacementValue ?? 0),
      description: item.description || '',
    })
    setShowForm(true)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const rate = Number(form.rentalPrice)
    const cost = Number(form.cost_price)
    const quantity = Number(form.quantity)
    if (!form.product_name.trim() || !(rate > 0) || cost < 0 || (!editing && (!Number.isInteger(quantity) || quantity < 0))) {
      toast({ title: 'Check the rental item details', description: 'Enter a name, a positive hire rate, a valid cost, and a whole owned quantity.', variant: 'destructive' })
      return
    }
    if (!form.categoryId) {
      toast({ title: 'Category is required', description: 'Choose a category for this rental item.', variant: 'destructive' })
      return
    }
    if (!editing && !form.branchId) {
      toast({ title: 'Branch required', description: 'Choose the branch that owns this rental item.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        product_name: form.product_name.trim(), product_id: form.sku.trim(), sku: form.sku.trim(),
        itemType: 'rental', categoryId: form.categoryId || null, branchId: form.branchId || null,
        quantity: editing ? editing.quantity : quantity, cost_price: cost, unit_price: rate,
        rentalPrice: rate, rentalPeriod: form.rentalPeriod,
        depositAmount: Math.max(0, Number(form.depositAmount) || 0),
        replacementValue: Math.max(0, Number(form.replacementValue) || 0),
        description: form.description.trim() || null,
        baseUnit: 'Asset', low_stock_alert: 0,
      }
      if (editing) await inventoryApi.update(String(editing.id), payload)
      else await inventoryApi.create(payload)
      toast({ title: editing ? 'Rental item updated' : 'Rental item added', description: 'Rental item details have been saved.' })
      setShowForm(false)
      await load()
    } catch (error: any) {
      toast({ title: 'Could not save rental item', description: error?.message || 'Review the details and try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: InventoryItem) => {
    if (!(await appConfirm(`Move “${item.product_name}” to Trash? Existing rental history will remain.`))) return
    try {
      await inventoryApi.delete(String(item.id))
      toast({ title: 'Rental item moved to Trash' })
      await load()
    } catch (error: any) {
      toast({ title: 'Could not remove rental item', description: error?.message || 'An item with rental history may not be deletable.', variant: 'destructive' })
    }
  }

  return <div className="min-w-0 space-y-5 p-4 md:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-primary">Rentals</p>
        <h1 className="text-2xl font-semibold">Rental Items</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Set up rental items, hire rates, deposits, and replacement values.</p>
      </div>
      {canCreate && <Button onClick={beginCreate}><Plus className="mr-2 h-4 w-4" />Add rental item</Button>}
    </header>

    {showForm && <Card>
      <CardHeader><CardTitle>{editing ? 'Edit rental item' : 'New rental item'}</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="rental-item-name">Asset name *</Label><Input id="rental-item-name" value={form.product_name} onChange={event => setForm(v => ({ ...v, product_name: event.target.value }))} required /></div>
        <div className="space-y-1"><Label htmlFor="rental-item-code">Asset code / SKU</Label><Input id="rental-item-code" value={form.sku} onChange={event => setForm(v => ({ ...v, sku: event.target.value }))} /></div>
        <div className="space-y-1">
          <Label>Category <span className="text-red-500">*</span></Label>
          <div className="relative" ref={categoryPickerRef}>
            <Button type="button" variant="outline" role="combobox" aria-label="Category" aria-expanded={categoryOpen} className="h-auto min-h-10 w-full justify-between whitespace-normal" onClick={() => { setCategoryOpen(value => !value); if (categories.length === 0 && !categoriesLoading) void loadCategories() }}>
              <span className={`min-w-0 break-words text-left ${selectedCategory ? '' : 'text-muted-foreground'}`}>{selectedCategory?.name || 'Select category'}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
            {categoryOpen && <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border bg-popover p-2 text-popover-foreground shadow-lg">
              <div className="relative mb-2"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus aria-label="Search categories" maxLength={160} value={categoryQuery} onChange={event => setCategoryQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }} placeholder="Search categories..." className="pl-8" /></div>
              <div className="max-h-60 overflow-y-auto pr-1">
                {categoriesLoading ? <p role="status" className="px-2 py-4 text-sm text-muted-foreground">Loading categories...</p> : categoriesError ? <div role="alert" className="space-y-2 p-2 text-sm"><p>{categoriesError}</p><Button type="button" variant="outline" onClick={() => void loadCategories()}>Retry</Button></div> : filteredCategories.length === 0 ? <p className="px-2 py-5 text-center text-sm text-muted-foreground">{categories.length ? 'No category found' : 'No categories available'}</p> : filteredCategories.map(category => <button key={category.id} type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${form.categoryId === category.id ? 'bg-muted font-medium' : ''}`} onClick={() => { setForm(value => ({ ...value, categoryId: category.id })); setCategoryQuery(''); setCategoryOpen(false) }}><Check className={`h-4 w-4 ${form.categoryId === category.id ? 'opacity-100' : 'opacity-0'}`} /><span className="min-w-0 flex-1 break-words">{category.name}</span></button>)}
              </div>
              {canCreateCategory && categoryQuery.trim() && !categoriesLoading && !categoriesError && !categories.some(category => category.name.toLocaleLowerCase() === categoryQuery.trim().replace(/\s+/g, ' ').toLocaleLowerCase()) && <Button type="button" variant="outline" disabled={categorySaving || !online} className="mt-2 h-auto min-h-10 w-full justify-start whitespace-normal text-left" onClick={() => void createCategory()}><Plus className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{categorySaving ? 'Saving category...' : `Create rental category: ${categoryQuery.trim()}`}</span></Button>}
            </div>}
          </div>
        </div>
        {!editing && <div className="space-y-1"><Label htmlFor="rental-item-quantity">Owned quantity *</Label><Input id="rental-item-quantity" type="number" min="0" step="1" value={form.quantity} onChange={event => setForm(v => ({ ...v, quantity: event.target.value }))} required /></div>}
        <div className="space-y-1"><Label htmlFor="rental-item-rate">Hire rate per period *</Label><Input id="rental-item-rate" type="number" min="0.01" step="any" value={form.rentalPrice} onChange={event => setForm(v => ({ ...v, rentalPrice: event.target.value }))} required /></div>
        <div className="space-y-1"><Label htmlFor="rental-item-period">Rate period</Label><select id="rental-item-period" value={form.rentalPeriod} onChange={event => setForm(v => ({ ...v, rentalPeriod: event.target.value as RentalPeriod }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{periods.map(period => <option key={period} value={period}>{period[0].toUpperCase() + period.slice(1)}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="rental-item-deposit">Default refundable deposit</Label><Input id="rental-item-deposit" type="number" min="0" step="any" value={form.depositAmount} onChange={event => setForm(v => ({ ...v, depositAmount: event.target.value }))} /></div>
        <div className="space-y-1"><Label htmlFor="rental-item-replacement">Replacement value</Label><Input id="rental-item-replacement" type="number" min="0" step="any" value={form.replacementValue} onChange={event => setForm(v => ({ ...v, replacementValue: event.target.value }))} /></div>
        <div className="space-y-1"><Label htmlFor="rental-item-cost">Acquisition cost *</Label><Input id="rental-item-cost" type="number" min="0" step="any" value={form.cost_price} onChange={event => setForm(v => ({ ...v, cost_price: event.target.value }))} required /></div>
        {!editing && <div className="space-y-1"><Label htmlFor="rental-item-branch">Owning branch *</Label><select id="rental-item-branch" value={form.branchId} onChange={event => setForm(v => ({ ...v, branchId: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm" required><option value="">Select branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>}
        <div className="space-y-1 sm:col-span-2 xl:col-span-3"><Label htmlFor="rental-item-description">Description / identifying details</Label><textarea id="rental-item-description" value={form.description} onChange={event => setForm(v => ({ ...v, description: event.target.value }))} maxLength={2000} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
        {editing && <p className="sm:col-span-2 xl:col-span-3 text-xs text-muted-foreground">Owned quantity is changed through controlled stock movements so availability and asset records remain traceable.</p>}
        <div className="flex justify-end gap-2 sm:col-span-2 xl:col-span-3"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</Button></div>
      </form></CardContent>
    </Card>}

    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Rental item register</CardTitle><p className="text-sm text-muted-foreground">Items available for hire, with branch and rate details.</p></div>
        <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search rental items" placeholder="Search rental items or code" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading rental items…</div> : items.length === 0 ? <div className="py-12 text-center"><Archive className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No rental items yet</p><p className="mt-1 text-sm text-muted-foreground">Add the items your business offers for hire.</p>{canCreate && <Button className="mt-4" onClick={beginCreate}><Plus className="mr-2 h-4 w-4" />Add rental item</Button>}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-3 pr-3">Rental item</th><th className="py-3 pr-3">Category</th><th className="py-3 pr-3">Branch</th><th className="py-3 pr-3 text-right">Owned</th><th className="py-3 pr-3">Hire rate</th><th className="py-3 pr-3 text-right">Deposit</th><th className="py-3 pr-3 text-right">Replacement</th><th className="py-3 text-right">Actions</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-b last:border-0"><td className="py-3 pr-3"><div className="font-medium">{item.product_name}</div><div className="text-xs text-muted-foreground">{item.sku || item.product_id || 'No item code'}</div></td><td className="py-3 pr-3">{item.categoryName || '—'}</td><td className="py-3 pr-3">{item.branch?.name || '—'}</td><td className="py-3 pr-3 text-right tabular-nums">{Number(item.quantity || 0)}</td><td className="py-3 pr-3"><span className="font-medium">{formatCurrency(item.rentalPrice ?? item.unit_price)}</span><span className="text-muted-foreground"> / {item.rentalPeriod || 'daily'}</span></td><td className="py-3 pr-3 text-right tabular-nums">{formatCurrency(item.depositAmount || 0)}</td><td className="py-3 pr-3 text-right tabular-nums">{formatCurrency(item.replacementValue || 0)}</td><td className="py-3 text-right"><div className="flex justify-end gap-1">{canEdit && <Button size="icon" variant="ghost" aria-label={`Edit ${item.product_name}`} title="Edit rental item" onClick={() => beginEdit(item)}><Edit2 className="h-4 w-4" /></Button>}{canDelete && <Button size="icon" variant="ghost" aria-label={`Delete ${item.product_name}`} title="Move to Trash" onClick={() => void remove(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div></td></tr>)}</tbody></table></div>}
      </CardContent>
    </Card>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Bookings and returns update item availability and keep a clear rental history. <Link className="text-primary hover:underline" to="/tenant/rentals/bookings">Go to bookings</Link></p>
  </div>
}
