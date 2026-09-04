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

type PermissionDefinition = {
  id: string
  name: string
  description?: string
  category: string
}

type PermissionCategoryDefinition = {
  id: string
  name: string
  description?: string
}

type PermissionSchema = {
  keys: string[]
  defaults: Record<string, Record<string, boolean>>
  permissions?: PermissionDefinition[]
  categories?: PermissionCategoryDefinition[]
}

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
  canViewHR:'Can view HR management',
  canCreateHREmployee:'Can create HR employees',
  canEditHREmployee:'Can edit HR employees',
  canDeleteHREmployee:'Can delete HR employees',
  canManageHRStructure:'Can manage HR departments, positions, units and teams',
  canViewHRContracts:'Can view HR contracts',
  canManageHRContracts:'Can manage HR contracts',
  canViewHRDocuments:'Can view HR documents',
  canManageHRDocuments:'Can manage HR documents',
  canViewHRSalaries:'Can view HR salaries',
  canManageHRSalaries:'Can manage HR salary records',
  canViewHRAttendance:'Can view HR attendance',
  canRecordHRAttendance:'Can record employee check-in/check-out',
  canManageHRAttendance:'Can manage HR attendance',
  canEditHRAttendance:'Can edit HR attendance',
  canDeleteHRAttendance:'Can delete HR attendance',
  canImportHRAttendance:'Can import HR attendance',
  canConfigureHRAttendance:'Can configure HR attendance',
  canApproveHRAttendance:'Can approve HR attendance',
  canViewHRShifts:'Can view HR shifts',
  canManageHRShifts:'Can manage HR shifts',
  canAssignHRShifts:'Can assign HR shifts',
  canApproveHRShifts:'Can approve HR shift changes',
  canViewHRLeave:'Can view HR leave',
  canRequestHRLeave:'Can request HR leave',
  canManageHRLeaveTypes:'Can manage HR leave types',
  canApproveHRLeave:'Can approve HR leave',
  canViewHRPayroll:'Can view HR payroll',
  canCreateHRPayroll:'Can create HR payroll drafts',
  canApproveHRPayroll:'Can approve HR payroll',
  canPostHRPayroll:'Can post HR payroll to accounting',
  canPayHRPayroll:'Can pay salaries',
  canManageHRPayrollSettings:'Can manage HR payroll setup',
  canManageHRPayroll:'Can manage HR payroll',
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
  canViewAccounting:'Can view accounting module', canCreateAccounting:'Can create accounting entries', canEditAccounting:'Can edit accounting entries', canDeleteAccounting:'Can delete accounting entries',
  canViewTransactionAccount:'Can view transaction accounts', canUseAnyTransactionAccount:'Can use any transaction account', canUseOtherCashAccount:'Can use other cash accounts', canCreateTransactionAccount:'Can create transaction accounts', canEditTransactionAccount:'Can edit transaction accounts', canDeleteTransactionAccount:'Can deactivate transaction accounts',
  canCreateWithdrawal:'Can record customer withdrawals',
  canAdjustStock:'Can adjust stock', canTransferStock:'Can transfer stock', canViewPriceHistory:'Can view price history',
  canUseCash:'Can use assigned cash', canUseMobileMoney:'Can use mobile money', canUseBank:'Can use bank transfer', canUseCard:'Can use card',
  canImportInventory:'Can import inventory',
}

const ACCOUNTING_ACCESS_KEYS = [
  'canViewAccounting', 'canCreateAccounting', 'canEditAccounting', 'canDeleteAccounting',
]

const TRANSACTION_PERMISSION_KEYS = [
  'canViewTransactionAccount', 'canUseAnyTransactionAccount', 'canUseOtherCashAccount', 'canCreateTransactionAccount',
  'canEditTransactionAccount', 'canDeleteTransactionAccount', 'canCreateWithdrawal',
]

const PAYMENT_METHOD_PERMISSION_KEYS = ['canUseCash', 'canUseMobileMoney', 'canUseBank', 'canUseCard']

const STAFF_PERMISSION_KEYS = ['canCreateStaff', 'canViewStaff', 'canEditStaff', 'canDeleteStaff']
const HR_PERMISSION_KEYS = [
  'canViewHR', 'canCreateHREmployee', 'canEditHREmployee', 'canDeleteHREmployee',
  'canManageHRStructure', 'canViewHRContracts', 'canManageHRContracts',
  'canViewHRDocuments', 'canManageHRDocuments', 'canViewHRSalaries', 'canManageHRSalaries',
  'canViewHRAttendance', 'canRecordHRAttendance', 'canManageHRAttendance',
  'canEditHRAttendance', 'canDeleteHRAttendance', 'canImportHRAttendance',
  'canConfigureHRAttendance', 'canApproveHRAttendance',
  'canViewHRShifts', 'canManageHRShifts', 'canAssignHRShifts', 'canApproveHRShifts',
  'canViewHRLeave', 'canRequestHRLeave', 'canManageHRLeaveTypes', 'canApproveHRLeave',
  'canViewHRPayroll', 'canCreateHRPayroll', 'canApproveHRPayroll',
  'canPostHRPayroll', 'canPayHRPayroll', 'canManageHRPayrollSettings',
  'canManageHRPayroll',
]
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
  { label: 'Products', matcher: (key: string) => key.includes('Product') || key === 'canViewPriceHistory' },
  { label: 'Purchases', prefix: 'Purchase' },
  { label: 'Payables', prefix: 'Payable' },
  { label: 'Expenses', matcher: (key: string) => EXPENSE_PERMISSION_KEYS.includes(key) },
  { label: 'Customers', prefix: 'Customer' },
  { label: 'Receivables', prefix: 'Receivable' },
  { label: 'Suppliers', prefix: 'Supplier' },
  { label: 'Staff', matcher: (key: string) => STAFF_PERMISSION_KEYS.includes(key) },
  { label: 'HR Management', matcher: (key: string) => HR_PERMISSION_KEYS.includes(key) },
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
  { label: 'Transaction Accounts & Cash Movements', matcher: (key: string) => TRANSACTION_PERMISSION_KEYS.includes(key) },
  { label: 'Stock', prefix: 'Stock' },
  { label: 'Payment Methods', matcher: (key: string) => PAYMENT_METHOD_PERMISSION_KEYS.includes(key) },
  { label: 'Data Import', prefix: 'Import' },
]

function matchesPermissionGroup(group: { prefix?: string; matcher?: (key: string) => boolean }, key: string) {
  if (group.matcher) return group.matcher(key)
  if (group.prefix === 'canUse') return key.startsWith('canUse')
  return key.includes(group.prefix || '')
}

function fallbackPermissionName(key: string) {
  if (PERM_LABELS[key]) return PERM_LABELS[key]
  return key
    .replace(/^can/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

function fallbackPermissionCategory(key: string) {
  const group = PERM_GROUPS.find(g => matchesPermissionGroup(g, key))
  return group?.label || 'Other'
}

function getPermissionGroups(schema: PermissionSchema | null, search: string) {
  const keys = [...new Set([...(schema?.keys || []), ...Object.keys(PERM_LABELS)])]
  const definitions = new Map((schema?.permissions || []).map(permission => [permission.id, permission]))
  const categories = new Map((schema?.categories || []).map(category => [category.id, category]))
  const query = search.trim().toLowerCase()
  const groups = new Map<string, { id: string; name: string; permissions: PermissionDefinition[] }>()

  keys.forEach((key) => {
    const definition = definitions.get(key)
    const fallbackCategory = fallbackPermissionCategory(key)
    const categoryId = definition?.category || fallbackCategory
    const categoryName = categories.get(categoryId)?.name || fallbackCategory
    const permission: PermissionDefinition = {
      id: key,
      name: definition?.name || PERM_LABELS[key] || fallbackPermissionName(key),
      description: definition?.description,
      category: categoryId,
    }

    if (query) {
      const searchable = `${permission.name} ${permission.description || ''} ${permission.id} ${categoryName}`.toLowerCase()
      if (!searchable.includes(query)) return
    }

    if (!groups.has(categoryId)) {
      groups.set(categoryId, { id: categoryId, name: categoryName, permissions: [] })
    }
    groups.get(categoryId)?.permissions.push(permission)
  })

  const backendOrder = (schema?.categories || []).map(category => category.id)
  const fallbackOrder = PERM_GROUPS.map(group => group.label)
  const order = [...backendOrder, ...fallbackOrder, 'Other']

  return [...groups.values()].sort((a, b) => {
    const aIndex = order.indexOf(a.id)
    const bIndex = order.indexOf(b.id)
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
}

function PermissionMatrix({
  title,
  description,
  schema,
  values,
  onChange,
  search,
  onSearch,
}: {
  title: string
  description?: string
  schema: PermissionSchema | null
  values: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
  search: string
  onSearch: (value: string) => void
}) {
  const allKeys = [...new Set([...(schema?.keys || []), ...Object.keys(PERM_LABELS)])]
  const groups = getPermissionGroups(schema, search)

  const setAll = (checked: boolean) => {
    if (!checked) {
      onChange({})
      return
    }
    const next: Record<string, boolean> = {}
    allKeys.forEach((key) => {
      next[key] = true
    })
    onChange(next)
  }

  const setGroup = (keys: string[], checked: boolean) => {
    const next = { ...values }
    keys.forEach((key) => {
      if (checked) next[key] = true
      else delete next[key]
    })
    onChange(next)
  }

  const setPermission = (key: string, checked: boolean) => {
    const next = { ...values }
    if (checked) next[key] = true
    else delete next[key]
    onChange(next)
  }

  return (
    <div className="mt-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 w-full text-xs sm:w-48" placeholder="Search permissions..." value={search} onChange={e => onSearch(e.target.value)} />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAll(true)}><CheckCheck className="h-3 w-3 mr-1" /> All</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAll(false)}><Square className="h-3 w-3 mr-1" /> None</Button>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {groups.map((group) => {
          const groupKeys = group.permissions.map(permission => permission.id)
          const selectedCount = groupKeys.filter(key => values[key]).length
          const allSelected = groupKeys.length > 0 && selectedCount === groupKeys.length
          return (
            <div key={group.id} className="rounded-md border bg-muted/20 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => setGroup(groupKeys, e.target.checked)}
                    className="rounded"
                  />
                  {group.name}
                </span>
                <span className="text-xs font-normal text-muted-foreground">{selectedCount}/{groupKeys.length}</span>
              </label>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.permissions.map(permission => (
                  <label key={permission.id} className="flex min-h-16 cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!values[permission.id]}
                      onChange={e => setPermission(permission.id, e.target.checked)}
                      className="mt-0.5 rounded"
                    />
                    <span className="min-w-0 leading-5">
                      <span className="block font-medium text-foreground">{permission.name}</span>
                      {permission.description && (
                        <span className="mt-0.5 block text-muted-foreground">{permission.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
        {!groups.length && (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No permissions match your search.</p>
        )}
      </div>
    </div>
  )
}

export default function RolesPermissionsPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [permSchema, setPermSchema] = useState<PermissionSchema | null>(null)
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
            <PermissionMatrix
              title="Permissions"
              description="Tick a whole module or choose only the actions this staff member should access."
              schema={permSchema}
              values={formPerms}
              onChange={setFormPerms}
              search={permSearch}
              onSearch={setPermSearch}
            />
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
                      <PermissionMatrix
                        title={`Permissions for ${s.name || s.email}`}
                        description="Tick a whole module or choose only the actions this staff member should access."
                        schema={permSchema}
                        values={permissions}
                        onChange={setPermissions}
                        search={permSearch}
                        onSearch={setPermSearch}
                      />
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
