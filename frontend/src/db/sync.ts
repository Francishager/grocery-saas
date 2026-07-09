import { db } from './index'
import { apiFetch } from '@/lib/api'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

let currentStatus: SyncStatus = navigator.onLine ? 'idle' : 'offline'
const listeners = new Set<(s: SyncStatus) => void>()

export function getSyncStatus(): SyncStatus {
  return currentStatus
}

export function onSyncStatusChange(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function setStatus(s: SyncStatus) {
  currentStatus = s
  listeners.forEach(cb => cb(s))
}

// ─── Pull: fetch latest from API and bulk-upsert into IndexedDB ───

function getUserRole(): string | null {
  try {
    const raw = localStorage.getItem('auth_user')
    if (!raw) return null
    const user = JSON.parse(raw)
    return user?.role || null
  } catch {
    return null
  }
}

function getUserPermissions(): string[] {
  try {
    const raw = localStorage.getItem('auth_user')
    if (!raw) return []
    const user = JSON.parse(raw)
    return user?.permissions || []
  } catch {
    return []
  }
}

/** Check if a feature is enabled in cached plan features */
function isFeatureEnabled(featureName: string): boolean {
  try {
    const cached = localStorage.getItem('cachedFeatures')
    if (!cached) return true // No cache yet — allow (backend will 403 if not enabled)
    const features = JSON.parse(cached)
    const entry = features?.[featureName]
    if (entry === undefined) return false // Not in plan
    return entry.enabled === true
  } catch {
    return true // On error, allow
  }
}

/** Check if user has a specific permission (owner/saas_admin bypass) */
function userHasPermission(permission: string): boolean {
  const role = getUserRole()
  if (role === 'owner' || role === 'saas_admin') return true
  const perms = getUserPermissions()
  return perms.includes(permission) || perms.includes('*')
}

/** Check if sync should pull an endpoint based on feature + permission */
function canPull(feature: string | null, permission?: string): boolean {
  if (feature && !isFeatureEnabled(feature)) return false
  if (permission && !userHasPermission(permission)) return false
  return true
}

async function pullTable<T extends { id: string; updatedAt?: string }>(
  endpoint: string,
  table: keyof typeof db,
  mapFn: (raw: any) => T
): Promise<number> {
  try {
    const res = await apiFetch(endpoint)
    if (!res.ok) {
      // 401 = token expired/missing (apiFetch handles redirect), 403/404 = no permission, 500 = server error — all expected, skip silently
      if (res.status !== 401 && res.status !== 403 && res.status !== 404 && res.status !== 500) {
        console.warn(`[sync] ${String(table)}: HTTP ${res.status}`)
      }
      return 0
    }
    const json = await res.json()
    const arr = Array.isArray(json) ? json
      : (json?.products || json?.sales || json?.customers || json?.categories ||
         json?.branches || json?.expenses || json?.suppliers || json?.purchases ||
         json?.payments || json?.transfers || json?.rentals || json?.returns ||
         json?.accounts || json?.entries || json?.journal || json?.employees ||
         json?.leaveRequests || json?.payroll || json?.notifications || json?.logs ||
         json?.staff || json?.cashAccounts || json?.cashTransactions ||
         json?.data || json?.records || [])
    const records: T[] = arr.map(mapFn)
    if (records.length === 0) return 0
    await (db[table] as any).bulkPut(records)
    return records.length
  } catch (e) {
    // Network error (offline, DNS, timeout) — log table name only, no URL
    if (navigator.onLine) {
      console.warn(`[sync] ${String(table)}: network error`)
    }
    return 0
  }
}

export async function pullAll(): Promise<void> {
  setStatus('syncing')
  let total = 0

  total += await pullTable('/api/inventory?limit=500', 'products', (p: any) => ({
    id: p.id, name: p.name, sku: p.sku, barcode: p.barcode,
    price: p.price ?? 0, cost: p.cost ?? 0, quantity: p.quantity ?? 0,
    minStock: p.minStock, baseUnit: p.baseUnit, categoryId: p.categoryId,
    branchId: p.branchId, itemType: p.itemType, isActive: p.isActive,
    description: p.description, units: p.units,
    updatedAt: p.updatedAt || new Date().toISOString(),
  }))

  total += await pullTable('/api/sales?limit=500', 'sales', (s: any) => ({
    id: s.id, receiptNo: s.receiptNo, subtotal: s.subtotal ?? 0,
    discount: s.discount ?? 0, tax: s.tax ?? 0, total: s.total ?? 0,
    paymentMethod: s.paymentMethod, status: s.status,
    userId: s.userId, branchId: s.branchId, items: s.items,
    customerName: s.customerName,
    createdAt: s.createdAt, updatedAt: s.updatedAt || s.createdAt,
  }))

  total += await pullTable('/api/receivables/customers?limit=500', 'customers', (c: any) => ({
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    balance: c.balance ?? 0, branchId: c.branchId,
    status: c.status || 'active', creditLimit: c.creditLimit ?? 0,
    trustScore: c.trustScore ?? 0, address: c.address, notes: c.notes,
    updatedAt: c.updatedAt || new Date().toISOString(),
  }))

  total += await pullTable('/api/inventory/categories', 'categories', (c: any) => ({
    id: c.id, name: c.name, slug: c.slug, categoryType: c.categoryType,
    updatedAt: c.updatedAt || new Date().toISOString(),
  }))

  total += await pullTable('/api/branches', 'branches', (b: any) => ({
    id: b.id, name: b.name, address: b.address, isActive: b.isActive,
    updatedAt: b.updatedAt || new Date().toISOString(),
  }))

  if (canPull('expenses', 'canViewExpense'))
  total += await pullTable('/api/expenses/expenses?limit=500', 'expenses', (e: any) => ({
    id: e.id, category: e.category, description: e.description,
    amount: e.amount, paymentMethod: e.paymentMethod, reference: e.reference,
    notes: e.notes, date: e.date, userId: e.userId,
    user: e.user, updatedAt: e.updatedAt || new Date().toISOString(),
  }))

  if (canPull('payables', 'canViewSupplier'))
  total += await pullTable('/api/payables/suppliers?limit=500', 'suppliers', (s: any) => ({
    id: s.id, name: s.name, email: s.email, phone: s.phone,
    address: s.address, balance: s.balance ?? 0, status: s.status || 'active',
    notes: s.notes,
    updatedAt: s.updatedAt || new Date().toISOString(),
  }))

  if (canPull('payables', 'canViewPurchase'))
  total += await pullTable('/api/payables/purchases?limit=500', 'purchases', (p: any) => ({
    id: p.id, refNo: p.refNo, supplierId: p.supplierId, supplier: p.supplier,
    total: p.total ?? 0, amountPaid: p.amountPaid ?? 0, balance: p.balance ?? 0,
    paymentStatus: p.paymentStatus, dueDate: p.dueDate, notes: p.notes,
    items: p.items,
    createdAt: p.createdAt, updatedAt: p.updatedAt || p.createdAt,
  }))

  if (canPull('payables', 'canViewPayable'))
  total += await pullTable('/api/payables/payments?limit=500', 'payments', (p: any) => ({
    id: p.id, amount: p.amount ?? 0, paymentMethod: p.paymentMethod,
    reference: p.reference, notes: p.notes,
    supplierId: p.supplier?.id || p.supplierId,
    supplier: p.supplier,
    customer: p.customer,
    sale: p.sale,
    createdAt: p.createdAt, updatedAt: p.updatedAt || p.createdAt,
  }))

  if (canPull('inventory.transfers', 'canTransferStock'))
  total += await pullTable('/api/transfers?limit=500', 'transfers', (t: any) => ({
    id: t.id, transferNo: t.transferNo, status: t.status, notes: t.notes,
    fromBranchId: t.fromBranchId || t.fromBranch?.id, toBranchId: t.toBranchId || t.toBranch?.id,
    items: t.items,
    createdAt: t.createdAt, updatedAt: t.updatedAt || t.createdAt,
  }))

  if (canPull('rentals', 'canViewRental'))
  total += await pullTable('/api/rentals?limit=500', 'rentals', (r: any) => ({
    id: r.id, rentalNo: r.rentalNo, customerName: r.customer?.name,
    customerPhone: r.customer?.phone, branchId: r.branch?.id,
    hireDate: r.hireDate, expectedReturnDate: r.expectedReturnDate,
    actualReturnDate: r.actualReturnDate, totalAmount: r.totalAmount ?? 0,
    depositAmount: r.depositAmount ?? 0, amountPaid: r.amountPaid ?? 0,
    balance: r.balance ?? 0, paymentStatus: r.paymentStatus,
    status: r.status, items: r.items, notes: r.notes,
    updatedAt: r.updatedAt || new Date().toISOString(),
  }))

  if (canPull('sales.returns', 'canRefundSale'))
  total += await pullTable('/api/returns?limit=500', 'returns', (r: any) => ({
    id: r.id, returnNo: r.returnNo, total: r.total ?? 0, reason: r.reason,
    refundMethod: r.refundMethod, status: r.status, saleId: r.sale?.id,
    items: r.items,
    createdAt: r.createdAt, updatedAt: r.updatedAt || r.createdAt,
  }))

  if (canPull('accounting', 'canViewAccounting'))
  total += await pullTable('/api/accounting/accounts', 'accounts', (a: any) => ({
    id: a.id, code: a.code, name: a.name, type: a.type, subType: a.subType,
    balance: a.balance ?? 0, isActive: a.isActive, parentId: a.parentId,
    updatedAt: a.updatedAt || new Date().toISOString(),
  }))

  if (canPull('accounting', 'canViewAccounting'))
  total += await pullTable('/api/accounting/journal?limit=500', 'journalEntries', (j: any) => ({
    id: j.id, entryNo: j.entryNo, date: j.date, description: j.description,
    reference: j.reference, status: j.status, lines: j.lines,
    updatedAt: j.updatedAt || new Date().toISOString(),
  }))

  if (canPull('hr', 'canViewStaff')) {
    total += await pullTable('/api/hr?limit=500', 'employees', (e: any) => ({
      id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email,
      phone: e.phone, position: e.position, department: e.department,
      salary: e.salary ?? 0, payFrequency: e.payFrequency, hireDate: e.hireDate,
      status: e.status, branchId: e.branch?.id,
      updatedAt: e.updatedAt || new Date().toISOString(),
    }))
  }

  if (canPull('hr', 'canViewStaff')) {
    total += await pullTable('/api/hr/leave-requests', 'leaveRequests', (l: any) => ({
      id: l.id, leaveType: l.leaveType, startDate: l.startDate, endDate: l.endDate,
      days: l.days, reason: l.reason, status: l.status,
      employeeId: l.employee?.id,
      updatedAt: l.updatedAt || new Date().toISOString(),
    }))
  }

  if (canPull('hr', 'canViewStaff')) {
    total += await pullTable('/api/hr/payroll', 'payroll', (p: any) => ({
      id: p.id, period: p.period, grossSalary: p.grossSalary ?? 0,
      deductions: p.deductions ?? 0, netSalary: p.netSalary ?? 0,
      bonus: p.bonus ?? 0, status: p.status, paidAt: p.paidAt,
      employeeId: p.employee?.id,
      updatedAt: p.updatedAt || new Date().toISOString(),
    }))
  }

  if (canPull('communication', 'canViewCommunication'))
  total += await pullTable('/api/notifications', 'notifications', (n: any) => ({
    id: n.id, channel: n.channel, title: n.title, message: n.message,
    type: n.type, isRead: n.isRead, createdAt: n.createdAt,
  }))

  if (canPull('expenses', 'canViewExpense'))
  total += await pullTable('/api/expenses/cash-accounts', 'cashAccounts', (a: any) => ({
    id: a.id, name: a.name, type: a.type, balance: a.balance ?? 0,
    currency: a.currency, isActive: a.isActive,
    updatedAt: a.updatedAt || new Date().toISOString(),
  }))

  if (canPull('expenses', 'canViewExpense'))
  total += await pullTable('/api/expenses/cash-transactions?limit=500', 'cashTransactions', (t: any) => ({
    id: t.id, amount: t.amount, type: t.type, balanceAfter: t.balanceAfter ?? 0,
    reference: t.reference, description: t.description,
    accountId: t.account?.id || t.accountId,
    account: t.account, user: t.user,
    createdAt: t.createdAt, updatedAt: t.updatedAt || t.createdAt,
  }))

  // Staff — uses staffApi internally, but we pull via the API endpoint
  if (canPull('settings.users', 'canViewStaff')) {
  try {
    const res = await apiFetch('/api/staff')
    if (res.ok) {
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data?.staff || data?.users || [])
      if (arr.length > 0) {
        await db.staff.bulkPut(arr.map((s: any) => ({
          id: s.id, name: `${s.fname || ''} ${s.lname || ''}`.trim() || s.name || s.email,
          email: s.email, phone: s.phone, role: s.role,
          isActive: s.isActive, branchId: s.branchId || s.branch?.id,
          updatedAt: s.updatedAt || new Date().toISOString(),
        })))
        total += arr.length
      }
    }
  } catch (e) {
    if (navigator.onLine) console.warn('[sync] staff: network error')
  }
  }

  if (canPull('settings', 'canViewSettings'))
  try {
    const res = await apiFetch('/api/settings')
    if (res.ok) {
      const data = await res.json()
      await db.settings.put({ id: 'business', ...data, updatedAt: new Date().toISOString() })
      total += 1
    }
  } catch (e) {
    if (navigator.onLine) console.warn('[sync] settings: network error')
  }

  await db.syncMeta.put({ key: 'lastPull', value: new Date().toISOString() })
  // If no records were pulled and we're supposedly online, the server is likely unreachable
  setStatus(total === 0 && navigator.onLine ? 'offline' : (navigator.onLine ? 'idle' : 'offline'))
  // Silent
}

// ─── Push: send queued mutations to API ───

export async function pushQueue(): Promise<void> {
  const items = await db.syncQueue.orderBy('createdAt').toArray()
  if (items.length === 0) return

  setStatus('syncing')
  let success = 0

  for (const item of items) {
    try {
      const endpoint = resolveEndpoint(item.table, item.operation, item.recordId)
      const method = item.operation === 'create' ? 'POST' : item.operation === 'update' ? 'PUT' : 'DELETE'
      const res = await apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: item.data ? JSON.stringify(item.data) : undefined,
      })

      if (res.ok) {
        await db.syncQueue.delete(item.id!)
        success++
      } else {
        await db.syncQueue.update(item.id!, {
          attempts: item.attempts + 1,
          lastError: `HTTP ${res.status}`,
        })
      }
    } catch (e: any) {
      await db.syncQueue.update(item.id!, {
        attempts: item.attempts + 1,
        lastError: e?.message || 'Network error',
      })
    }
  }

  if (success < items.length) {
    console.warn(`[sync] push: ${success}/${items.length} succeeded`)
  }
  setStatus(navigator.onLine ? 'idle' : 'offline')
}

function resolveEndpoint(table: string, op: string, recordId: string): string {
  const map: Record<string, string> = {
    products: '/api/inventory',
    sales: '/api/sales',
    customers: '/api/receivables/customers',
    categories: '/api/inventory/categories',
    branches: '/api/branches',
    expenses: '/api/expenses/expenses',
    suppliers: '/api/payables/suppliers',
    purchases: '/api/payables/purchases',
    payments: '/api/payables/payments',
    transfers: '/api/transfers',
    rentals: '/api/rentals',
    returns: '/api/returns',
    accounts: '/api/accounting/accounts',
    journalEntries: '/api/accounting/journal',
    employees: '/api/hr',
    leaveRequests: '/api/hr/leave-requests',
    payroll: '/api/hr/payroll',
    notifications: '/api/notifications',
    staff: '/api/staff',
    cashAccounts: '/api/expenses/cash-accounts',
    settings: '/api/settings',
  }
  const base = map[table] || `/api/${table}`
  return op === 'create' ? base : `${base}/${recordId}`
}

// ─── Queue helpers (called by UI when offline) ───

export async function queueMutation(
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string,
  data?: any
): Promise<void> {
  await db.syncQueue.add({
    table, operation, recordId, data,
    createdAt: new Date().toISOString(),
    attempts: 0,
  })
}

// ─── Full sync: pull then push ───

export async function syncAll(): Promise<void> {
  if (!navigator.onLine) {
    setStatus('offline')
    return
  }
  await pushQueue()
  await pullAll()
}

// ─── Auto-sync on reconnect ───

let initialized = false

export function initSync(): void {
  if (initialized) return
  initialized = true

  window.addEventListener('online', () => {
    syncAll()
  })

  window.addEventListener('offline', () => {
    setStatus('offline')
  })

  // Initial sync on app load
  if (navigator.onLine) {
    syncAll()
  } else {
    setStatus('offline')
  }
}

// ─── Stats for UI ───

export async function getSyncStats(): Promise<{ pending: number; lastPull: string | null }> {
  const pending = await db.syncQueue.count()
  const meta = await db.syncMeta.get('lastPull')
  return { pending, lastPull: meta?.value || null }
}
