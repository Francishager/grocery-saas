import Dexie, { Table } from 'dexie'

export interface LocalProduct {
  id: string
  name: string
  sku?: string
  barcode?: string
  batchNumber?: string
  expiryDate?: string
  price: number
  cost?: number
  quantity: number
  minStock?: number
  baseUnit?: string
  categoryId?: string
  branchId?: string
  itemType?: string
  isActive?: boolean
  description?: string
  units?: any[]
  updatedAt: string
}

export interface LocalSale {
  id: string
  receiptNo: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  status: string
  userId?: string
  branchId?: string
  items?: any[]
  customerName?: string
  createdAt: string
  updatedAt: string
}

export interface LocalCustomer {
  id: string
  name: string
  phone?: string
  email?: string
  balance?: number
  branchId?: string
  status?: string
  creditLimit?: number
  trustScore?: number
  address?: string
  notes?: string
  updatedAt: string
}

export interface LocalCategory {
  id: string
  name: string
  slug: string
  categoryType?: string
  updatedAt: string
}

export interface LocalBranch {
  id: string
  name: string
  address?: string
  isActive: boolean
  updatedAt: string
}

export interface LocalSettings {
  id: string
  [key: string]: any
  updatedAt: string
}

export interface LocalExpense {
  id: string
  category: string
  description: string
  amount: number
  paymentMethod: string
  reference?: string
  notes?: string
  date: string
  userId?: string
  user?: { id: string; fname: string; lname: string }
  updatedAt: string
}

export interface LocalSupplier {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  balance: number
  status: string
  notes?: string
  updatedAt: string
}

export interface LocalPurchase {
  id: string
  refNo: string
  supplierId?: string
  supplier?: { id: string; name: string; phone?: string }
  total: number
  amountPaid: number
  balance: number
  paymentStatus: string
  dueDate?: string
  notes?: string
  items?: any[]
  createdAt: string
  updatedAt: string
}

export interface LocalPayment {
  id: string
  amount: number
  paymentMethod: string
  reference?: string
  notes?: string
  supplierId?: string
  supplier?: { id: string; name: string; phone?: string }
  customer?: { id: string; name: string; phone?: string }
  sale?: { id: string; receiptNo: string }
  createdAt: string
  updatedAt: string
}

export interface LocalTransfer {
  id: string
  transferNo: string
  status: string
  notes?: string
  fromBranchId?: string
  toBranchId?: string
  items?: any[]
  createdAt: string
  updatedAt: string
}

export interface LocalRental {
  id: string
  rentalNo: string
  customerName?: string
  customerPhone?: string
  branchId?: string
  hireDate: string
  expectedReturnDate: string
  actualReturnDate?: string
  totalAmount: number
  depositAmount: number
  amountPaid: number
  balance: number
  paymentStatus: string
  status: string
  items?: any[]
  notes?: string
  updatedAt: string
}

export interface LocalReturn {
  id: string
  returnNo: string
  total: number
  reason?: string
  refundMethod: string
  status: string
  saleId?: string
  items?: any[]
  createdAt: string
  updatedAt: string
}

export interface LocalAccount {
  id: string
  code: string
  name: string
  type: string
  subType?: string
  balance: number
  isActive: boolean
  parentId?: string
  updatedAt: string
}

export interface LocalJournalEntry {
  id: string
  entryNo: string
  date: string
  description?: string
  reference?: string
  status: string
  lines?: any[]
  updatedAt: string
}

export interface LocalEmployee {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  position?: string
  department?: string
  salary: number
  payFrequency: string
  hireDate: string
  status: string
  branchId?: string
  updatedAt: string
}

export interface LocalLeaveRequest {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  days: number
  reason?: string
  status: string
  employeeId?: string
  updatedAt: string
}

export interface LocalPayroll {
  id: string
  period: string
  grossSalary: number
  deductions: number
  netSalary: number
  bonus: number
  status: string
  paidAt?: string
  employeeId?: string
  updatedAt: string
}

export interface LocalNotification {
  id: string
  channel: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

export interface LocalAuditLog {
  id: string
  action: string
  model: string
  modelId?: string
  userId?: string
  details?: any
  createdAt: string
}

export interface LocalStaff {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  isActive: boolean
  branchId?: string
  updatedAt: string
}

export interface LocalCashAccount {
  id: string
  name: string
  type: string
  balance: number
  currency: string
  isActive: boolean
  updatedAt: string
}

export interface LocalCashTransaction {
  id: string
  amount: number
  type: string
  balanceAfter: number
  reference?: string
  description?: string
  accountId?: string
  account?: { id: string; name: string; type: string }
  user?: { id: string; fname: string; lname: string }
  createdAt: string
  updatedAt: string
}

export interface SyncQueueItem {
  id?: number
  table: string
  operation: 'create' | 'update' | 'delete'
  recordId: string
  data?: any
  createdAt: string
  attempts: number
  lastError?: string
}

export interface SyncMeta {
  key: string
  value: any
}

class GroceryDB extends Dexie {
  products!: Table<LocalProduct, string>
  sales!: Table<LocalSale, string>
  customers!: Table<LocalCustomer, string>
  categories!: Table<LocalCategory, string>
  branches!: Table<LocalBranch, string>
  settings!: Table<LocalSettings, string>
  expenses!: Table<LocalExpense, string>
  suppliers!: Table<LocalSupplier, string>
  purchases!: Table<LocalPurchase, string>
  payments!: Table<LocalPayment, string>
  transfers!: Table<LocalTransfer, string>
  rentals!: Table<LocalRental, string>
  returns!: Table<LocalReturn, string>
  accounts!: Table<LocalAccount, string>
  journalEntries!: Table<LocalJournalEntry, string>
  employees!: Table<LocalEmployee, string>
  leaveRequests!: Table<LocalLeaveRequest, string>
  payroll!: Table<LocalPayroll, string>
  notifications!: Table<LocalNotification, string>
  auditLogs!: Table<LocalAuditLog, string>
  staff!: Table<LocalStaff, string>
  cashAccounts!: Table<LocalCashAccount, string>
  cashTransactions!: Table<LocalCashTransaction, string>
  syncQueue!: Table<SyncQueueItem, number>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('jibuSalesDB')

    this.version(1).stores({
      products: 'id, name, sku, barcode, categoryId, branchId, itemType, updatedAt',
      sales: 'id, receiptNo, status, branchId, createdAt, updatedAt',
      customers: 'id, name, phone, branchId, updatedAt',
      categories: 'id, name, slug, categoryType, updatedAt',
      branches: 'id, name, isActive, updatedAt',
      settings: 'id, updatedAt',
      syncQueue: '++id, table, operation, recordId, createdAt, attempts',
      syncMeta: 'key',
    })

    this.version(2).stores({
      products: 'id, name, sku, barcode, categoryId, branchId, itemType, updatedAt',
      sales: 'id, receiptNo, status, branchId, createdAt, updatedAt',
      customers: 'id, name, phone, branchId, updatedAt',
      categories: 'id, name, slug, categoryType, updatedAt',
      branches: 'id, name, isActive, updatedAt',
      settings: 'id, updatedAt',
      expenses: 'id, category, date, userId, updatedAt',
      suppliers: 'id, name, phone, status, updatedAt',
      purchases: 'id, refNo, supplierId, paymentStatus, createdAt, updatedAt',
      payments: 'id, paymentMethod, createdAt, updatedAt',
      transfers: 'id, transferNo, status, fromBranchId, toBranchId, createdAt, updatedAt',
      rentals: 'id, rentalNo, status, branchId, hireDate, updatedAt',
      returns: 'id, returnNo, status, saleId, createdAt, updatedAt',
      accounts: 'id, code, type, isActive, updatedAt',
      journalEntries: 'id, entryNo, date, status, updatedAt',
      employees: 'id, firstName, lastName, status, branchId, updatedAt',
      leaveRequests: 'id, leaveType, status, employeeId, updatedAt',
      payroll: 'id, period, status, employeeId, updatedAt',
      notifications: 'id, channel, type, isRead, createdAt',
      auditLogs: 'id, action, model, userId, createdAt',
      staff: 'id, name, email, role, isActive, branchId, updatedAt',
      cashAccounts: 'id, name, type, isActive, updatedAt',
      cashTransactions: 'id, type, accountId, createdAt, updatedAt',
      syncQueue: '++id, table, operation, recordId, createdAt, attempts',
      syncMeta: 'key',
    })
  }
}

export const db = new GroceryDB()

/** Clear all tenant-scoped tables — call on logout to prevent cross-tenant data leakage */
export async function clearTenantData() {
  await Promise.all([
    db.products.clear(),
    db.sales.clear(),
    db.customers.clear(),
    db.categories.clear(),
    db.branches.clear(),
    db.settings.clear(),
    db.expenses.clear(),
    db.suppliers.clear(),
    db.purchases.clear(),
    db.payments.clear(),
    db.transfers.clear(),
    db.rentals.clear(),
    db.returns.clear(),
    db.accounts.clear(),
    db.journalEntries.clear(),
    db.employees.clear(),
    db.leaveRequests.clear(),
    db.payroll.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
    db.staff.clear(),
    db.cashAccounts.clear(),
    db.cashTransactions.clear(),
    db.syncQueue.clear(),
    db.syncMeta.clear(),
  ])
}

export type { Table }
