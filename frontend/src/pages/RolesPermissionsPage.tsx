import { useEffect, useState, useRef } from 'react'
import { Shield, Plus, MoreVertical, Edit, Ban, Key, Trash2 } from 'lucide-react'
import { staffApi, branchesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

const PERM_LABELS: Record<string, string> = {
  canCreateSale:'Create Sale', canViewSale:'View Sale', canEditSale:'Edit Sale', canDeleteSale:'Delete Sale', canRefundSale:'Refund Sale',
  canCreateProduct:'Create Product', canViewProduct:'View Product', canEditProduct:'Edit Product', canDeleteProduct:'Delete Product',
  canCreatePurchase:'Create Purchase', canViewPurchase:'View Purchase', canEditPurchase:'Edit Purchase', canDeletePurchase:'Delete Purchase',
  canCreatePayable:'Create Payable', canViewPayable:'View Payable', canEditPayable:'Edit Payable', canDeletePayable:'Delete Payable',
  canCreateExpense:'Create Expense', canViewExpense:'View Expense', canEditExpense:'Edit Expense', canDeleteExpense:'Delete Expense',
  canCreateCustomer:'Create Customer', canViewCustomer:'View Customer', canEditCustomer:'Edit Customer', canDeleteCustomer:'Delete Customer',
  canCreateReceivable:'Create Receivable', canViewReceivable:'View Receivable', canEditReceivable:'Edit Receivable', canDeleteReceivable:'Delete Receivable',
  canCreateSupplier:'Create Supplier', canViewSupplier:'View Supplier', canEditSupplier:'Edit Supplier', canDeleteSupplier:'Delete Supplier',
  canCreateStaff:'Create Staff', canViewStaff:'View Staff', canEditStaff:'Edit Staff', canDeleteStaff:'Delete Staff',
  canCreateBranch:'Create Branch', canViewBranch:'View Branch', canEditBranch:'Edit Branch', canDeleteBranch:'Delete Branch',
  canViewSalesReport:'View Sales Report',canViewInventoryReport:'View Inventory Report',canViewFinancialReport:'View Financial Report',canViewCustomerReport:'View Customer Report',canViewSupplierReport:'View Supplier Report',canViewReceivablesReport:'View Receivables Report',canViewPayablesReport:'View Payables Report',canViewPerformanceReport:'View Performance Report',canExportReport:'Export Reports',
  canViewSettings:'View Settings', canEditSettings:'Edit Settings', canGiveDiscount:'Give Discount',
}

const PERM_GROUPS = [
  { label: 'Sales', prefix: 'Sale' },
  { label: 'Products', prefix: 'Product' },
  { label: 'Purchases', prefix: 'Purchase' },
  { label: 'Payables', prefix: 'Payable' },
  { label: 'Expenses', prefix: 'Expense' },
  { label: 'Customers', prefix: 'Customer' },
  { label: 'Receivables', prefix: 'Receivable' },
  { label: 'Suppliers', prefix: 'Supplier' },
  { label: 'Staff', prefix: 'Staff' },
  { label: 'Branches', prefix: 'Branch' },
  { label: 'Reports', prefix: 'Report' },
]

export default function RolesPermissionsPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [permSchema, setPermSchema] = useState<{ keys: string[]; defaults: Record<string, Record<string, boolean>> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedPermId, setExpandedPermId] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'attendant' as 'attendant' | 'manager' | 'accountant', branchId: '', phone: '' })
  const [formPerms, setFormPerms] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', role: 'attendant' as 'attendant' | 'manager' | 'accountant', branchId: '' })
  const [dropdownId, setDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => { loadStaff(); loadBranches(); loadPermSchema() }, [])
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const loadStaff = async () => {
    try {
      const data = await staffApi.list()
      setStaff(data)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to load staff', description: err?.message })
    } finally { setLoading(false) }
  }

  const loadBranches = async () => {
    try {
      const data = await branchesApi.active()
      setBranches(data)
    } catch {}
  }

  const loadPermSchema = async () => {
    try {
      const data = await staffApi.getPermissionsSchema()
      setPermSchema(data)
    } catch {}
  }

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.branchId) {
      toast({ variant: 'destructive', title: 'Email, password, and branch are required' })
      return
    }
    try {
      await staffApi.create({ ...form, name: form.name || form.email.split('@')[0], permissions: formPerms })
      toast({ title: 'Staff created' })
      setShowAddForm(false)
      setForm({ name: '', email: '', password: '', role: 'attendant' as 'attendant' | 'manager' | 'accountant', branchId: '', phone: '' })
      setFormPerms({})
      loadStaff()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to create staff', description: err?.message })
    }
  }

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this staff member?')) return
    try {
      await staffApi.deactivate(id)
      toast({ title: 'Staff deactivated' })
      loadStaff()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message })
    }
  }

  const startEdit = (s: any) => {
    setEditingId(s.id)
    setEditForm({ name: s.name || '', email: s.email || '', phone: s.phone || '', role: s.role || 'attendant', branchId: s.branchId || '' })
    setDropdownId(null)
  }

  const handleSaveEdit = async (id: string) => {
    try {
      await staffApi.update(id, editForm)
      toast({ title: 'Staff updated' })
      setEditingId(null)
      loadStaff()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to update', description: err?.message })
    }
  }

  const handleUpdateRole = async (id: string, role: 'attendant' | 'manager' | 'accountant') => {
    try {
      await staffApi.update(id, { role })
      toast({ title: 'Role updated' })
      loadStaff()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message })
    }
  }

  const togglePermissions = async (id: string) => {
    if (expandedPermId === id) {
      setExpandedPermId(null)
      setPermissions({})
      return
    }
    try {
      const perms = await staffApi.getPermissions(id)
      setPermissions(perms)
      setExpandedPermId(id)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to load permissions', description: err?.message })
    }
  }

  const handleSavePermissions = async (id: string) => {
    try {
      await staffApi.updatePermissions(id, permissions)
      toast({ title: 'Permissions updated' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message })
    }
  }

  const roleBadgeColor: Record<string, string> = {
    owner: 'bg-amber-100 text-amber-700',
    manager: 'bg-blue-100 text-blue-700',
    accountant: 'bg-purple-100 text-purple-700',
    attendant: 'bg-gray-100 text-gray-700',
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-muted-foreground">Manage staff, assign roles, and configure permissions</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-4 w-4 mr-2" />Add Staff
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader><CardTitle>Create New Staff</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" /></div>
              <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 chars" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+256..." /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="manager">Manager</option>
                  <option value="accountant">Accountant</option>
                  <option value="attendant">Attendant</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select branch</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            {/* Permissions checkboxes on create form */}
            <div className="mt-4 border rounded-lg p-4">
              <p className="text-sm font-medium mb-3">Permissions (tick to grant access)</p>
              <div className="space-y-3">
                {PERM_GROUPS.map(g => {
                  const groupKeys = (permSchema?.keys || Object.keys(PERM_LABELS)).filter(k => k.endsWith(g.prefix))
                  if (!groupKeys.length) return null
                  return (
                    <div key={g.prefix}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{g.label}</p>
                      <div className="grid gap-1 grid-cols-4">
                        {groupKeys.map(key => (
                          <label key={key} className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" checked={!!formPerms[key]} onChange={e => setFormPerms(p => ({ ...p, [key]: e.target.checked }))} className="rounded" />
                            {PERM_LABELS[key]?.replace(g.label + ' ', '').replace(g.prefix, '') || key}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Other</p>
                  <div className="grid gap-1 grid-cols-4">
                    {['canViewSettings','canEditSettings','canGiveDiscount'].map(key => (
                      <label key={key} className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={!!formPerms[key]} onChange={e => setFormPerms(p => ({ ...p, [key]: e.target.checked }))} className="rounded" />
                        {PERM_LABELS[key] || key}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreate}>Create Staff</Button>
              <Button onClick={() => setShowAddForm(false)} variant="outline">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Staff Members ({staff.length})</CardTitle></CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No staff members yet</p>
          ) : (
            <div className="space-y-3">
              {staff.map((s: any) => (
                <div key={s.id} className="border rounded-lg p-4 group">
                  {editingId === s.id ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Edit Staff</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><Label className="text-xs">Name</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" /></div>
                        <div><Label className="text-xs">Email</Label><Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="h-8 text-sm" /></div>
                        <div><Label className="text-xs">Phone</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="h-8 text-sm" /></div>
                        <div><Label className="text-xs">Role</Label>
                          <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
                            <option value="manager">Manager</option>
                            <option value="accountant">Accountant</option>
                            <option value="attendant">Attendant</option>
                          </select>
                        </div>
                        <div><Label className="text-xs">Branch</Label>
                          <select value={editForm.branchId} onChange={e => setEditForm(f => ({ ...f, branchId: e.target.value }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
                            <option value="">Select branch</option>
                            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleSaveEdit(s.id)} size="sm">Save</Button>
                        <Button onClick={() => setEditingId(null)} variant="outline" size="sm">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {(s.name || s.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{s.name || s.email}</p>
                          <p className="text-sm text-muted-foreground">{s.email} {s.branch?.name && `· ${s.branch.name}`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${roleBadgeColor[s.role] || 'bg-gray-100 text-gray-700'}`}>{s.role}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                        <div className="relative" ref={dropdownId === s.id ? dropdownRef : undefined}>
                          <button
                            onClick={() => setDropdownId(dropdownId === s.id ? null : s.id)}
                            className="p-1.5 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </button>
                          {dropdownId === s.id && (
                            <div className="absolute right-0 top-8 z-50 w-44 rounded-md border bg-popover p-1 shadow-md">
                              <button onClick={() => startEdit(s)} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted">
                                <Edit className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button onClick={() => { togglePermissions(s.id); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted">
                                <Key className="h-3.5 w-3.5" /> Permissions
                              </button>
                              <button onClick={() => { handleDeactivate(s.id); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted text-orange-600">
                                <Ban className="h-3.5 w-3.5" /> {s.isActive ? 'Suspend' : 'Reactivate'}
                              </button>
                              <button onClick={() => { handleDeactivate(s.id); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted text-destructive">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {expandedPermId === s.id && (
                    <div className="mt-4 border-t pt-4">
                      <p className="text-sm font-medium mb-3">Permissions for {s.name || s.email}</p>
                      <div className="space-y-3">
                        {PERM_GROUPS.map(g => {
                          const groupKeys = (permSchema?.keys || Object.keys(PERM_LABELS)).filter(k => k.endsWith(g.prefix))
                          if (!groupKeys.length) return null
                          return (
                            <div key={g.prefix}>
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{g.label}</p>
                              <div className="grid gap-1 grid-cols-4">
                                {groupKeys.map(key => (
                                  <label key={key} className="flex items-center gap-1.5 text-xs">
                                    <input type="checkbox" checked={!!permissions[key]} onChange={e => setPermissions(p => ({ ...p, [key]: e.target.checked }))} className="rounded" />
                                    {PERM_LABELS[key]?.replace(g.label + ' ', '').replace(g.prefix, '') || key}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Other</p>
                          <div className="grid gap-1 grid-cols-4">
                            {['canViewSettings','canEditSettings','canGiveDiscount'].map(key => (
                              <label key={key} className="flex items-center gap-1.5 text-xs">
                                <input type="checkbox" checked={!!permissions[key]} onChange={e => setPermissions(p => ({ ...p, [key]: e.target.checked }))} className="rounded" />
                                {PERM_LABELS[key] || key}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <Button onClick={() => handleSavePermissions(s.id)} size="sm" className="mt-3">Save Permissions</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
