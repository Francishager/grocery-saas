import { useEffect, useState, useRef } from 'react'
import { Shield, Plus, MoreVertical, Edit, Ban, Key, Trash2, CheckCheck, Square, Wallet } from 'lucide-react'
import { staffApi, branchesApi } from '@/lib/api'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { getLocalStaff, getLocalBranches } from '@/db/hybrid'

const PERM_LABELS: Record<string, string> = {
  canViewDashboard:'Can view dashboard',
  canCreateSale:'Can create sales', canViewSale:'Can view sales', canEditSale:'Can edit sales', canDeleteSale:'Can delete sales', canRefundSale:'Can refund sales',
  canCreateProduct:'Can create products', canViewProduct:'Can view products', canEditProduct:'Can edit products', canDeleteProduct:'Can delete products',
  canCreatePurchase:'Can create purchases', canViewPurchase:'Can view purchases', canEditPurchase:'Can edit purchases', canDeletePurchase:'Can delete purchases',
  canCreatePayable:'Can create bills', canViewPayable:'Can view bills', canEditPayable:'Can edit bills', canDeletePayable:'Can delete bills',
  canCreateExpense:'Can create expense records', canViewExpense:'Can view expense records', canEditExpense:'Can edit expense records', canDeleteExpense:'Can delete expense records', canViewStaffTillSheet:'Can view staff till sheet',
  canCreateCustomer:'Can create customers', canViewCustomer:'Can view customers', canEditCustomer:'Can edit customers', canDeleteCustomer:'Can delete customers',
  canCreateReceivable:'Can create credit sales', canViewReceivable:'Can view receivables', canEditReceivable:'Can edit receivables', canDeleteReceivable:'Can delete receivables',
  canCreateSupplier:'Can create suppliers', canViewSupplier:'Can view suppliers', canEditSupplier:'Can edit suppliers', canDeleteSupplier:'Can delete suppliers',
  canCreateStaff:'Can create staff', canViewStaff:'Can view staff', canEditStaff:'Can edit staff', canDeleteStaff:'Can delete staff',
  canCreateBranch:'Can create branches', canViewBranch:'Can view branches', canEditBranch:'Can edit branches', canDeleteBranch:'Can delete branches',
  canViewSalesReport:'Can view sales reports', canViewInventoryReport:'Can view inventory reports', canViewFinancialReport:'Can view financial reports', canViewCustomerReport:'Can view customer reports', canViewSupplierReport:'Can view supplier reports', canViewReceivablesReport:'Can view receivables reports', canViewPayablesReport:'Can view payables reports', canViewPerformanceReport:'Can view business performance reports', canViewAuditReport:'Can view audit log', canExportReport:'Can export reports',
  canViewSettings:'Can view settings', canEditSettings:'Can edit settings', canGiveDiscount:'Can give discounts',
  canViewReceipt:'Can view receipts', canCreateReceipt:'Can create receipts',
  canViewTax:'Can view tax', canManageTax:'Can manage tax',
  canViewService:'Can view services', canCreateService:'Can create services', canEditService:'Can edit services', canDeleteService:'Can delete services', canManageServiceCategory:'Can manage service categories', canViewServiceReport:'Can view service reports',
  canViewRental:'Can view rentals', canCreateRental:'Can create rentals', canEditRental:'Can edit rentals', canDeleteRental:'Can cancel rentals', canProcessRentalReturn:'Can process returns', canViewRentalReport:'Can view rental reports',
  canViewRestaurant:'Can view restaurant', canCreateRestaurant:'Can create restaurant entries', canEditRestaurant:'Can edit restaurant entries', canDeleteRestaurant:'Can delete restaurant entries', canViewRestaurantReport:'Can view restaurant reports',
  canViewFuelStation:'Can view fuel station', canCreateFuelStation:'Can create fuel station entries', canEditFuelStation:'Can edit fuel station entries', canDeleteFuelStation:'Can delete fuel station entries', canViewFuelStationReport:'Can view fuel station reports',
  canViewManufacturing:'Can view manufacturing', canCreateManufacturing:'Can create manufacturing entries', canEditManufacturing:'Can edit manufacturing entries', canDeleteManufacturing:'Can delete manufacturing entries', canViewManufacturingReport:'Can view manufacturing reports',
  canViewAgriculture:'Can view agriculture', canCreateAgriculture:'Can create agriculture entries', canEditAgriculture:'Can edit agriculture entries', canDeleteAgriculture:'Can delete agriculture entries', canViewAgricultureReport:'Can view agriculture reports',
  canViewServiceBusiness:'Can view service business', canCreateServiceBusiness:'Can create service business entries', canEditServiceBusiness:'Can edit service business entries', canDeleteServiceBusiness:'Can delete service business entries', canViewServiceBusinessReport:'Can view service business reports',
  canViewCommunication:'Can view communication', canCreateCommunication:'Can create communication', canEditCommunication:'Can edit communication', canDeleteCommunication:'Can delete communication',
  canViewAccounting:'Can view accounting module', canCreateAccounting:'Can create transaction accounts', canEditAccounting:'Can edit transaction accounts', canDeleteAccounting:'Can delete transaction accounts',
  canAdjustStock:'Can adjust stock', canTransferStock:'Can transfer stock',
  canUseCash:'Can use cash', canUseMobileMoney:'Can use mobile money', canUseBank:'Can use bank transfer', canUseCard:'Can use card',
  canImportInventory:'Can import inventory',
}

const ACCOUNTING_ACCESS_KEYS = [
  'canViewAccounting', 'canCreateAccounting', 'canEditAccounting', 'canDeleteAccounting',
  'canViewExpense', 'canCreateExpense', 'canEditExpense', 'canDeleteExpense', 'canViewStaffTillSheet',
]

const STAFF_PERMISSION_KEYS = ['canCreateStaff', 'canViewStaff', 'canEditStaff', 'canDeleteStaff']
const EXPENSE_PERMISSION_KEYS = ['canCreateExpense', 'canViewExpense', 'canEditExpense', 'canDeleteExpense']

const REPORT_PERMISSION_KEYS = [
  'canViewSalesReport', 'canViewInventoryReport', 'canViewFinancialReport', 'canViewCustomerReport',
  'canViewSupplierReport', 'canViewReceivablesReport', 'canViewPayablesReport', 'canViewPerformanceReport',
  'canViewAuditReport', 'canExportReport', 'canViewServiceReport', 'canViewRentalReport',
  'canViewRestaurantReport', 'canViewFuelStationReport', 'canViewManufacturingReport', 'canViewAgricultureReport',
  'canViewServiceBusinessReport',
]

const PERM_GROUPS = [
  { label: 'Dashboard', prefix: 'Dashboard' },
  { label: 'Sales', prefix: 'Sale' },
  { label: 'Products', prefix: 'Product' },
  { label: 'Purchases', prefix: 'Purchase' },
  { label: 'Payables', prefix: 'Payable' },
  { label: 'Expenses', matcher: (key: string) => EXPENSE_PERMISSION_KEYS.includes(key) },
  { label: 'Customers', prefix: 'Customer' },
  { label: 'Receivables', prefix: 'Receivable' },
  { label: 'Suppliers', prefix: 'Supplier' },
  { label: 'Staff', matcher: (key: string) => STAFF_PERMISSION_KEYS.includes(key) },
  { label: 'Branches', prefix: 'Branch' },
  { label: 'Reports', matcher: (key: string) => REPORT_PERMISSION_KEYS.includes(key) },
  { label: 'Settings', prefix: 'Settings' },
  { label: 'Receipts', prefix: 'Receipt' },
  { label: 'Discounts', prefix: 'Discount' },
  { label: 'Tax', prefix: 'Tax' },
  { label: 'Services', prefix: 'Service' },
  { label: 'Rentals', prefix: 'Rental' },
  { label: 'Restaurant', prefix: 'Restaurant' },
  { label: 'Fuel Station', prefix: 'FuelStation' },
  { label: 'Manufacturing', prefix: 'Manufacturing' },
  { label: 'Agriculture', prefix: 'Agriculture' },
  { label: 'Service Business', prefix: 'ServiceBusiness' },
  { label: 'Communication', prefix: 'Communication' },
  { label: 'Accounting', matcher: (key: string) => ACCOUNTING_ACCESS_KEYS.includes(key) },
  { label: 'Stock', prefix: 'Stock' },
  { label: 'Payment Methods', prefix: 'canUse' },
  { label: 'Data Import', prefix: 'Import' },
]

function matchesPermissionGroup(group: { prefix?: string; matcher?: (key: string) => boolean }, key: string) {
  if (group.matcher) return group.matcher(key)
  if (group.prefix === 'canUse') return key.startsWith('canUse')
  return key.includes(group.prefix || '')
}

export default function RolesPermissionsPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [permSchema, setPermSchema] = useState<{ keys: string[]; defaults: Record<string, Record<string, boolean>> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedPermId, setExpandedPermId] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'attendant' as 'attendant' | 'manager' | 'accountant', branchId: '', phone: '', cashAccountId: '' })
  const [formPerms, setFormPerms] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', role: 'attendant' as 'attendant' | 'manager' | 'accountant', branchId: '', cashAccountId: '' })
  const [cashAccounts, setCashAccounts] = useState<any[]>([])
  const [dropdownId, setDropdownId] = useState<string | null>(null)
  const [createdPassword, setCreatedPassword] = useState<{ name: string; email: string; password: string } | null>(null)
  const [permSearch, setPermSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => { loadStaff(); loadBranches(); loadPermSchema(); loadCashAccounts() }, [])
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
      try { setStaff(await getLocalStaff() as any) } catch {
        toast({ variant: 'destructive', title: 'Failed to load staff', description: err?.message })
      }
    } finally { setLoading(false) }
  }

  const loadBranches = async () => {
    try {
      const data = await branchesApi.active()
      setBranches(data)
    } catch {
      try { setBranches(await getLocalBranches() as any) } catch {}
    }
  }

  const loadPermSchema = async () => {
    try {
      const data = await staffApi.getPermissionsSchema()
      setPermSchema(data)
    } catch {}
  }

  const loadCashAccounts = async () => {
    try {
      const res = await apiFetch('/api/expenses/cash-accounts')
      if (res.ok) {
        const data = await res.json()
        setCashAccounts(data)
      }
    } catch {}
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'Name is required' })
      return
    }
    if (!form.email.trim()) {
      toast({ variant: 'destructive', title: 'Email is required' })
      return
    }
    if (!form.password || form.password.length < 6) {
      toast({ variant: 'destructive', title: 'Password required', description: 'Use at least 6 characters.' })
      return
    }
    if (!form.branchId) {
      toast({ variant: 'destructive', title: 'Branch is required' })
      return
    }
    try {
      const result = await staffApi.create({ ...form, name: form.name || form.email.split('@')[0], permissions: formPerms })
      toast({ title: 'Staff created successfully' })
      setShowAddForm(false)
      setForm({ name: '', email: '', password: '', role: 'attendant' as 'attendant' | 'manager' | 'accountant', branchId: '', phone: '', cashAccountId: '' })
      setFormPerms({})
      loadStaff()
      if (result?.password) {
        setCreatedPassword({ name: result.staff?.name || form.name || form.email, email: form.email, password: result.password })
      }
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
    setEditForm({ name: s.name || '', email: s.email || '', phone: s.phone || '', role: s.role || 'attendant', branchId: s.branchId || '', cashAccountId: s.cashAccountId || '' })
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
    <div className="space-y-6 p-4 lg:p-6">
      {createdPassword && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/30">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-400">Staff Created — Save These Credentials</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Share these login credentials with <strong>{createdPassword.name}</strong>. They will need them to log in.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-mono text-sm font-medium">{createdPassword.email}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Password</p>
                  <p className="font-mono text-sm font-medium">{createdPassword.password}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard?.writeText(`Email: ${createdPassword.email}\nPassword: ${createdPassword.password}`)
                  toast({ title: 'Credentials copied to clipboard' })
                }}>
                  Copy Credentials
                </Button>
                <Button size="sm" onClick={() => setCreatedPassword(null)}>Done</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Staff Access & Permissions</h1>
          <p className="text-muted-foreground">Choose what each staff member can see, create, edit, or manage in the business.</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />Add Staff
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader><CardTitle>Create New Staff</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" required /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" required /></div>
              <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 chars" required minLength={6} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+256..." /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'attendant' | 'manager' | 'accountant' }))}
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
              <div className="space-y-2">
                <Label>Cash Account</Label>
                <select value={form.cashAccountId} onChange={e => setForm(f => ({ ...f, cashAccountId: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">No cash account (cannot transact)</option>
                  {cashAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Required for staff who handle cash, record sales, or make payments</p>
              </div>
            </div>
            {/* Permissions checkboxes on create form */}
            <div className="mt-4 border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Permissions (tick to allow this staff member to do these tasks)</p>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                For accounting, choose the exact action clearly: view, create, edit, or delete for transaction accounts and expense records.
              </p>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Input className="h-7 w-40 text-xs" placeholder="Search permissions..." value={permSearch} onChange={e => setPermSearch(e.target.value)} />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    const allKeys = permSchema?.keys || Object.keys(PERM_LABELS)
                    const allTrue: Record<string, boolean> = {}
                    allKeys.forEach((k: string) => allTrue[k] = true)
                    setFormPerms(allTrue)
                  }}><CheckCheck className="h-3 w-3 mr-1" /> All</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFormPerms({})}><Square className="h-3 w-3 mr-1" /> None</Button>
                </div>
              </div>
              <div className="space-y-3">
                {PERM_GROUPS.map(g => {
                  let groupKeys = (permSchema?.keys || Object.keys(PERM_LABELS)).filter(k => matchesPermissionGroup(g, k))
                  if (permSearch) {
                    const q = permSearch.toLowerCase()
                    groupKeys = groupKeys.filter(k => (PERM_LABELS[k] || k).toLowerCase().includes(q))
                  }
                  if (!groupKeys.length) return null
                  return (
                    <div key={g.prefix}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{g.label}</p>
                      <div className="grid gap-1 grid-cols-2 sm:grid-cols-4">
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
                          <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as 'attendant' | 'manager' | 'accountant' }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
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
                        <div><Label className="text-xs">Cash Account</Label>
                          <select value={editForm.cashAccountId} onChange={e => setEditForm(f => ({ ...f, cashAccountId: e.target.value }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
                            <option value="">No cash account (cannot transact)</option>
                            {cashAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleSaveEdit(s.id)} size="sm">Save</Button>
                        <Button onClick={() => setEditingId(null)} variant="outline" size="sm">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {(s.name || s.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{s.name || s.email}</p>
                          <p className="text-sm text-muted-foreground">{s.email} {s.branch?.name && `· ${s.branch.name}`}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {s.cashAccount ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center gap-1">
                                <Wallet className="h-3 w-3" /> {s.cashAccount.name}
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 inline-flex items-center gap-1">
                                <Wallet className="h-3 w-3" /> No cash account
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${roleBadgeColor[s.role] || 'bg-gray-100 text-gray-700'}`}>{s.role}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                        <div className="relative" ref={dropdownId === s.id ? dropdownRef : undefined}>
                          <button
                            onClick={() => setDropdownId(dropdownId === s.id ? null : s.id)}
                            className="p-1.5 rounded-md hover:bg-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium">Permissions for {s.name || s.email}</p>
                        <div className="flex items-center gap-2">
                          <Input className="h-7 w-40 text-xs" placeholder="Search permissions..." value={permSearch} onChange={e => setPermSearch(e.target.value)} />
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                            const allKeys = permSchema?.keys || Object.keys(PERM_LABELS)
                            const allTrue: Record<string, boolean> = {}
                            allKeys.forEach((k: string) => allTrue[k] = true)
                            setPermissions(allTrue)
                          }}><CheckCheck className="h-3 w-3 mr-1" /> All</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPermissions({})}><Square className="h-3 w-3 mr-1" /> None</Button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {PERM_GROUPS.map(g => {
                          let groupKeys = (permSchema?.keys || Object.keys(PERM_LABELS)).filter(k => matchesPermissionGroup(g, k))
                          if (permSearch) {
                            const q = permSearch.toLowerCase()
                            groupKeys = groupKeys.filter(k => (PERM_LABELS[k] || k).toLowerCase().includes(q))
                          }
                          if (!groupKeys.length) return null
                          return (
                            <div key={g.prefix}>
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{g.label}</p>
                              <div className="grid gap-1 grid-cols-2 sm:grid-cols-4">
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
