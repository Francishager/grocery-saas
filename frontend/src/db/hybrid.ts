import { useState, useEffect, useCallback } from 'react'
import { db } from './index'
import { queueMutation } from './sync'
import { useOnlineStatus } from './hooks'

// ─── Hybrid Query: API-first, IndexedDB fallback ───

export function useHybridQuery<T>(
  apiFn: () => Promise<T>,
  localFn: () => Promise<T>,
  deps: any[] = []
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const online = useOnlineStatus()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (online) {
      try {
        const result = await apiFn()
        setData(result)
        // Also update IndexedDB in background for offline use
        // (caller can optionally pass a persistFn)
      } catch (e: any) {
        // API failed, try local
        try {
          const local = await localFn()
          setData(local)
        } catch (le: any) {
          setError(e?.message || 'Failed to load data')
        }
      }
    } else {
      // Offline — use IndexedDB directly
      try {
        const local = await localFn()
        setData(local)
      } catch (le: any) {
        setError('Offline data unavailable')
      }
    }
    setLoading(false)
  }, [online, ...deps])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refetch: load }
}

// ─── Hybrid Mutation: API-first, queue if offline ───

export function useHybridMutation() {
  const online = useOnlineStatus()

  const mutate = useCallback(async (
    apiFn: () => Promise<any>,
    table: string,
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    data?: any
  ): Promise<any> => {
    if (online) {
      // Online — try API, also update IndexedDB
      try {
        const result = await apiFn()
        // Mirror to local DB
        if (operation === 'delete') {
          await (db as any)[table]?.delete(recordId)
        } else if (result && (result.id || result.product?.id)) {
          const id = result.id || result.product?.id
          await (db as any)[table]?.put({ ...data, id, updatedAt: new Date().toISOString() })
        }
        return result
      } catch (e: any) {
        // API failed even though online — queue it
        await queueMutation(table, operation, recordId, data)
        throw e
      }
    } else {
      // Offline — write to IndexedDB, queue for sync
      if (operation === 'delete') {
        await (db as any)[table]?.delete(recordId)
      } else {
        await (db as any)[table]?.put({ ...data, id: recordId, updatedAt: new Date().toISOString() })
      }
      await queueMutation(table, operation, recordId, data)
      return { id: recordId, offline: true }
    }
  }, [online])

  return { mutate, online }
}

// ─── Local data accessors (for offline reads) ───

export async function getLocalProducts(search?: string, branchId?: string, itemType?: string): Promise<any[]> {
  let products = await db.products.toArray()
  if (search) {
    const lower = search.toLowerCase()
    products = products.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      (p.sku || '').toLowerCase().includes(lower) ||
      (p.barcode || '').toLowerCase().includes(lower)
    )
  }
  if (branchId) products = products.filter(p => p.branchId === branchId)
  if (itemType) products = products.filter(p => p.itemType === itemType)
  return products.map(p => ({
    id: p.id,
    product_name: p.name,
    product_id: p.sku || '',
    quantity: p.quantity,
    unit_price: p.price,
    cost_price: p.cost || 0,
    low_stock_alert: p.minStock || 10,
    barcode: p.barcode || '',
    sku: p.sku || '',
    categoryId: p.categoryId || '',
    branchId: p.branchId || null,
    baseUnit: p.baseUnit || 'Piece',
    itemType: p.itemType || 'product',
    description: p.description || '',
    units: p.units || [],
  }))
}

export async function getLocalSales(limit = 50): Promise<any[]> {
  const sales = await db.sales.orderBy('createdAt').reverse().limit(limit).toArray()
  return sales.map(s => ({
    id: s.id,
    receiptNo: s.receiptNo,
    total: s.total,
    paymentMethod: s.paymentMethod,
    status: s.status,
    createdAt: s.createdAt,
    items: s.items || [],
  }))
}

export async function getLocalDashboardKpis(): Promise<any> {
  const [products, sales, customers] = await Promise.all([
    db.products.toArray(),
    db.sales.toArray(),
    db.customers.count(),
  ])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthSales = sales.filter(s => new Date(s.createdAt) >= monthStart && s.status === 'completed')

  const revenue = monthSales.reduce((sum, s) => sum + s.total, 0)
  const cogs = monthSales.reduce((sum, s) => {
    return sum + (s.items || []).reduce((itemSum, i: any) => {
      const product = products.find(p => p.id === i.productId)
      return itemSum + ((product?.cost || 0) * i.quantity)
    }, 0)
  }, 0)

  const lowStockCount = products.filter(p => p.quantity <= (p.minStock || 10)).length

  return {
    revenue,
    grossProfit: revenue - cogs,
    netProfit: revenue - cogs,
    expenses: 0,
    salesCount: monthSales.length,
    taxCollected: monthSales.reduce((sum, s) => sum + (s.tax || 0), 0),
    customerCount: customers,
    productCount: products.length,
    receivablesOutstanding: 0,
    receivablesCount: 0,
    lowStockCount,
    revenueChange: null,
  }
}

export async function getLocalDashboardCharts(): Promise<any> {
  const sales = await db.sales.toArray()
  const now = new Date()

  // Last 12 months
  const labels: string[] = []
  const revenue: number[] = []
  const expenses: number[] = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const monthSales = sales.filter(s => {
      const sd = new Date(s.createdAt)
      return sd >= d && sd < next && s.status === 'completed'
    })
    labels.push(d.toLocaleString('en-US', { month: 'short' }))
    revenue.push(monthSales.reduce((sum, s) => sum + s.total, 0))
    expenses.push(0)
  }

  // Top products
  const productMap: Record<string, { name: string; revenue: number; quantity: number }> = {}
  for (const sale of sales) {
    for (const item of (sale.items || [])) {
      const name = item.productName || item.productId || 'Unknown'
      if (!productMap[name]) productMap[name] = { name, revenue: 0, quantity: 0 }
      productMap[name].revenue += item.total || 0
      productMap[name].quantity += item.quantity || 0
    }
  }
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  // Payment methods
  const payMap: Record<string, { total: number; count: number }> = {}
  for (const sale of sales) {
    const m = sale.paymentMethod || 'cash'
    if (!payMap[m]) payMap[m] = { total: 0, count: 0 }
    payMap[m].total += sale.total
    payMap[m].count += 1
  }
  const paymentMethods = Object.entries(payMap).map(([method, v]) => ({ method, ...v }))

  return {
    salesChart: { labels, revenue, expenses },
    profitLoss: { labels: labels.slice(-6), grossProfit: revenue.slice(-6), netProfit: revenue.slice(-6) },
    topProducts,
    paymentMethods,
  }
}

// ─── Expenses ───

export async function getLocalExpenses(search?: string, category?: string): Promise<any[]> {
  let expenses = await db.expenses.orderBy('date').reverse().toArray()
  if (search) {
    const lower = search.toLowerCase()
    expenses = expenses.filter(e => e.description.toLowerCase().includes(lower) || e.category.toLowerCase().includes(lower))
  }
  if (category) expenses = expenses.filter(e => e.category === category)
  return expenses
}

export async function getLocalCashAccounts(): Promise<any[]> {
  return await db.cashAccounts.toArray()
}

export async function getLocalCashTransactions(): Promise<any[]> {
  return await db.cashTransactions.orderBy('createdAt').reverse().toArray()
}

// ─── Suppliers / Purchases / Payments ───

export async function getLocalSuppliers(search?: string, status?: string): Promise<any[]> {
  let suppliers = await db.suppliers.toArray()
  if (search) {
    const lower = search.toLowerCase()
    suppliers = suppliers.filter(s => s.name.toLowerCase().includes(lower) || (s.phone || '').includes(search))
  }
  if (status && status !== 'all') suppliers = suppliers.filter(s => s.status === status)
  return suppliers
}

export async function getLocalPurchases(): Promise<any[]> {
  return await db.purchases.orderBy('createdAt').reverse().toArray()
}

export async function getLocalPayablePayments(): Promise<any[]> {
  return await db.payments.orderBy('createdAt').reverse().toArray()
}

// ─── Receivables ───

export async function getLocalReceivableCustomers(search?: string, status?: string): Promise<any[]> {
  let customers = await db.customers.toArray()
  if (search) {
    const lower = search.toLowerCase()
    customers = customers.filter(c => c.name.toLowerCase().includes(lower) || (c.phone || '').includes(search))
  }
  if (status && status !== 'all') customers = customers.filter(c => (c as any).status === status)
  return customers
}

export async function getLocalReceivableSales(): Promise<any[]> {
  const sales = await db.sales.toArray()
  return sales.filter(s => s.paymentMethod === 'credit' || s.status === 'credit')
}

export async function getLocalReceivablePayments(): Promise<any[]> {
  return await db.payments.orderBy('createdAt').reverse().toArray()
}

// ─── Transfers ───

export async function getLocalTransfers(): Promise<any[]> {
  return await db.transfers.orderBy('createdAt').reverse().toArray()
}

export async function getLocalBranches(): Promise<any[]> {
  return await db.branches.toArray()
}

// ─── Rentals ───

export async function getLocalRentals(status?: string): Promise<any[]> {
  let rentals = await db.rentals.toArray()
  if (status && status !== 'all') rentals = rentals.filter(r => r.status === status)
  return rentals
}

// ─── Returns ───

export async function getLocalReturns(): Promise<any[]> {
  return await db.returns.orderBy('createdAt').reverse().toArray()
}

// ─── Accounting ───

export async function getLocalAccounts(): Promise<any[]> {
  return await db.accounts.toArray()
}

export async function getLocalJournalEntries(): Promise<any[]> {
  return await db.journalEntries.orderBy('date').reverse().toArray()
}

// ─── HR ───

export async function getLocalEmployees(): Promise<any[]> {
  return await db.employees.toArray()
}

export async function getLocalLeaveRequests(): Promise<any[]> {
  return await db.leaveRequests.toArray()
}

export async function getLocalPayroll(): Promise<any[]> {
  return await db.payroll.toArray()
}

// ─── Notifications ───

export async function getLocalNotifications(): Promise<any[]> {
  return await db.notifications.orderBy('createdAt').reverse().toArray()
}

// ─── Staff ───

export async function getLocalStaff(): Promise<any[]> {
  return await db.staff.toArray()
}

// ─── Settings ───

export async function getLocalSettings(): Promise<any | null> {
  const s = await db.settings.get('business')
  return s || null
}

// ─── Audit Logs ───

export async function getLocalAuditLogs(limit = 50): Promise<any[]> {
  return await db.auditLogs.orderBy('createdAt').reverse().limit(limit).toArray()
}

// ─── Generic offline report generator ───

export async function getLocalReportData(reportId: string, params?: any): Promise<any> {
  const [sales, products, expenses, customers] = await Promise.all([
    db.sales.toArray(),
    db.products.toArray(),
    db.expenses.toArray(),
    db.customers.toArray(),
  ])

  const from = params?.from ? new Date(params.from) : new Date(0)
  const to = params?.to ? new Date(params.to + 'T23:59:59') : new Date()
  const filterByDate = (r: any) => {
    const d = new Date(r.createdAt || r.date)
    return d >= from && d <= to
  }

  const filteredSales = sales.filter(filterByDate)
  const filteredExpenses = expenses.filter(filterByDate)

  switch (reportId) {
    case 'salesSummary': {
      const count = filteredSales.length
      const totalRevenue = filteredSales.reduce((s, x) => s + x.total, 0)
      const totalSubtotal = filteredSales.reduce((s, x) => s + x.subtotal, 0)
      const totalDiscount = filteredSales.reduce((s, x) => s + (x.discount || 0), 0)
      const totalTax = filteredSales.reduce((s, x) => s + (x.tax || 0), 0)
      return { count, totalRevenue, totalSubtotal, totalDiscount, totalTax, avgSale: count ? totalRevenue / count : 0 }
    }
    case 'salesDaily': {
      const map: Record<string, any> = {}
      for (const s of filteredSales) {
        const d = new Date(s.createdAt).toISOString().split('T')[0]
        if (!map[d]) map[d] = { date: d, count: 0, revenue: 0, discount: 0, tax: 0 }
        map[d].count++; map[d].revenue += s.total; map[d].discount += s.discount || 0; map[d].tax += s.tax || 0
      }
      return Object.values(map)
    }
    case 'salesByProduct': {
      const map: Record<string, any> = {}
      for (const s of filteredSales) {
        for (const item of (s.items || [])) {
          const p = products.find(p => p.id === item.productId)
          const name = p?.name || item.productId
          if (!map[name]) map[name] = { product: name, quantity: 0, revenue: 0, cost: 0, profit: 0 }
          map[name].quantity += item.quantity || 0
          map[name].revenue += item.total || 0
          map[name].cost += (p?.cost || 0) * (item.quantity || 0)
          map[name].profit = map[name].revenue - map[name].cost
        }
      }
      return Object.values(map)
    }
    case 'salesByCategory': {
      const map: Record<string, any> = {}
      for (const s of filteredSales) {
        for (const item of (s.items || [])) {
          const p = products.find(p => p.id === item.productId)
          const cat = p?.categoryId || 'Uncategorized'
          if (!map[cat]) map[cat] = { category: cat, quantity: 0, revenue: 0 }
          map[cat].quantity += item.quantity || 0
          map[cat].revenue += item.total || 0
        }
      }
      return Object.values(map)
    }
    case 'salesByCustomer': {
      const map: Record<string, any> = {}
      for (const s of filteredSales) {
        const name = s.customerName || 'Walk-in'
        if (!map[name]) map[name] = { customer: name, count: 0, total: 0, balance: 0 }
        map[name].count++; map[name].total += s.total
      }
      return Object.values(map)
    }
    case 'salesByBranch': {
      const map: Record<string, any> = {}
      for (const s of filteredSales) {
        const b = s.branchId || 'Main'
        if (!map[b]) map[b] = { branch: b, count: 0, revenue: 0, discount: 0 }
        map[b].count++; map[b].revenue += s.total; map[b].discount += s.discount || 0
      }
      return Object.values(map)
    }
    case 'inventorySummary': {
      return {
        totalProducts: products.length,
        totalValue: products.reduce((s, p) => s + (p.cost || p.price || 0) * p.quantity, 0),
        lowStock: products.filter(p => p.quantity <= (p.minStock || 10)).length,
        outOfStock: products.filter(p => p.quantity <= 0).length,
      }
    }
    case 'inventoryList': {
      return products.map(p => ({
        name: p.name, sku: p.sku || '', quantity: p.quantity,
        cost: p.cost || 0, price: p.price, value: (p.cost || p.price || 0) * p.quantity,
      }))
    }
    case 'expenseSummary': {
      const total = filteredExpenses.reduce((s, e) => s + e.amount, 0)
      const byCat: Record<string, number> = {}
      for (const e of filteredExpenses) byCat[e.category] = (byCat[e.category] || 0) + e.amount
      return { total, byCategory: Object.entries(byCat).map(([category, amount]) => ({ category, amount })) }
    }
    case 'expenseList': {
      return filteredExpenses.map(e => ({
        date: e.date, category: e.category, description: e.description,
        amount: e.amount, paymentMethod: e.paymentMethod,
      }))
    }
    case 'profitLoss': {
      const revenue = filteredSales.reduce((s, x) => s + x.total, 0)
      const cogs = filteredSales.reduce((s, x) => {
        return s + (x.items || []).reduce((is: number, i: any) => {
          const p = products.find(p => p.id === i.productId)
          return is + (p?.cost || 0) * (i.quantity || 0)
        }, 0)
      }, 0)
      const expenses = filteredExpenses.reduce((s, e) => s + e.amount, 0)
      return { revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses }
    }
    default:
      // For unhandled report types, return empty data
      return { data: [], summary: {} }
  }
}
