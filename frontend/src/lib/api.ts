const API_URL = import.meta.env.VITE_API_URL || 'https://grocery-saas-production-e339.up.railway.app'

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>
  body?: unknown
  headers?: Record<string, string>
  skipAuth?: boolean
}

class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function getAuthToken(): string | null {
  const stored = localStorage.getItem('auth_tokens')
  if (stored) {
    try { return JSON.parse(stored).accessToken } catch { return null }
  }
  return localStorage.getItem('token')
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? '' : '/'}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return url.toString()
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, body, headers, skipAuth } = options
  const url = buildUrl(path, params)
  const token = getAuthToken()

  const fetchHeaders: Record<string, string> = {
    'Accept': 'application/json',
    ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  }

  if (token && !skipAuth) {
    fetchHeaders['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const data = isJson ? await response.json().catch(() => ({})) : await response.text()

  if (!response.ok) {
    if (response.status === 401 || (response.status === 403 && data?.message === 'Invalid token')) {
      localStorage.removeItem('token')
      localStorage.removeItem('auth_tokens')
      localStorage.removeItem('auth_user')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    throw new ApiError(
      data?.error || data?.message || `HTTP ${response.status}`,
      response.status,
      data
    )
  }

  return data
}
// Drop-in fetch replacement  prepends API_URL and adds auth
let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function tryRefreshToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise
  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const stored = localStorage.getItem('auth_tokens')
      if (!stored) return null
      const tokens = JSON.parse(stored)
      if (!tokens?.refreshToken) return null
      const API_BASE = import.meta.env.VITE_API_URL || 'https://grocery-saas-production-e339.up.railway.app'
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (data.tokens?.accessToken) {
        localStorage.setItem('auth_tokens', JSON.stringify(data.tokens))
        if (data.user) localStorage.setItem('auth_user', JSON.stringify(data.user))
        return data.tokens.accessToken
      }
      return null
    } catch {
      return null
    } finally {
      isRefreshing = false
    }
  })()
  return refreshPromise
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`
  return fetch(url, { ...init, headers }).then(async (res) => {
    if (res.status === 401) {
      const data = await res.clone().json().catch(() => ({}))
      const msg = data?.message || ''
      // Token expired or invalid — try refresh once, then redirect if it fails
      if (msg === 'Token expired' || msg === 'Invalid token' || msg === 'Access token required' || msg === 'Invalid or expired refresh token') {
        const newToken = await tryRefreshToken()
        if (newToken) {
          // Retry the original request with the new token
          const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` }
          return fetch(url, { ...init, headers: retryHeaders })
        }
        // Refresh failed — clear auth and redirect
        localStorage.removeItem('token')
        localStorage.removeItem('auth_tokens')
        localStorage.removeItem('auth_user')
        localStorage.removeItem('user')
        if (window.location.pathname !== '/login' && window.location.pathname !== '/saas/login') {
          window.location.href = '/login'
        }
      }
    }
    return res
  })
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>('PUT', path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
}

// Auth endpoints
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ message: string; tokens: { accessToken: string }; user: User }>('/api/auth/login', {
      body: { email, password },
      skipAuth: true,
    }),

  register: (data: RegisterData) =>
    api.post<{ message: string; user: User }>('/api/auth/register', {
      body: data,
      skipAuth: true,
    }),

  requestReset: (email: string) =>
    api.post<{ message: string; emailSent?: boolean; emailError?: string; otp?: string }>('/api/auth/request-reset', {
      body: { email },
      skipAuth: true,
    }),

  resetPassword: (data: { email: string; otp: string; newPassword: string }) =>
    api.post<{ message: string }>('/api/auth/reset-password', {
      body: data,
      skipAuth: true,
    }),

  validateToken: () =>
    api.get<{ valid: boolean; user: User }>('/api/auth/me'),

  logout: () =>
    api.post<{ message: string }>('/api/auth/logout'),

  updateProfile: (data: { fname?: string; lname?: string; phone?: string }) =>
    api.put<{ message: string; user: any }>('/api/auth/profile', { body: data }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ message: string }>('/api/auth/change-password', { body: { currentPassword, newPassword } }),

  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return fetch(`${API_URL}/api/auth/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: formData,
    }).then(r => r.json())
  },
}

// Dashboard endpoints
export const dashboardApi = {
  getKpis: () =>
    api.get<DashboardKpis>('/api/dashboard/kpis'),

  getSalesChart: () =>
    api.get<SalesChartData>('/api/dashboard/sales-chart'),

  getProfitLoss: () =>
    api.get<ProfitLossData>('/api/dashboard/profit-loss'),

  getTopProducts: () =>
    api.get<TopProduct[]>('/api/dashboard/top-products'),

  getPaymentMethods: () =>
    api.get<PaymentMethodData[]>('/api/dashboard/payment-methods'),
}

// Inventory endpoints
export const inventoryApi = {
  list: async (q?: string, branchId?: string, itemType?: string) => {
    const data = await api.get<any>('/api/inventory', { params: { search: q, branchId, itemType } })
    const products = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : []
    return products.map(mapProductToInventory)
  },

  get: async (id: string) => {
    const data = await api.get<any>(`/api/inventory/${id}`)
    return mapProductToInventory(data)
  },

  create: (data: any) =>
    api.post<InventoryItem>('/api/inventory', { body: {
      name: data.product_name,
      price: data.unit_price,
      cost: data.cost_price !== '' && data.cost_price != null ? Number(data.cost_price) : 0,
      quantity: data.quantity !== '' && data.quantity != null ? Number(data.quantity) : 0,
      minStock: data.low_stock_alert,
      sku: data.product_id || data.sku,
      barcode: data.barcode || null,
      categoryId: data.categoryId || null,
      branchId: data.branchId || null,
      baseUnit: data.baseUnit || 'Piece',
      itemType: data.itemType || 'product',
      serviceCategory: data.serviceCategory || null,
      estimatedHours: data.estimatedHours || null,
      duration: data.duration || null,
      description: data.description || null,
      rentalPrice: data.rentalPrice || null,
      rentalPeriod: data.rentalPeriod || null,
      depositAmount: data.depositAmount || null,
      replacementValue: data.replacementValue || null,
    } }),

  update: (id: string, data: any) =>
    api.put<InventoryItem>(`/api/inventory/${id}`, { body: {
      name: data.product_name,
      price: data.unit_price,
      cost: data.cost_price !== '' && data.cost_price != null ? Number(data.cost_price) : 0,
      quantity: data.quantity !== '' && data.quantity != null ? Number(data.quantity) : 0,
      minStock: data.low_stock_alert,
      sku: data.product_id || data.sku,
      barcode: data.barcode || null,
      categoryId: data.categoryId || null,
      branchId: data.branchId || null,
      baseUnit: data.baseUnit || 'Piece',
      itemType: data.itemType || 'product',
      serviceCategory: data.serviceCategory || null,
      estimatedHours: data.estimatedHours || null,
      duration: data.duration || null,
      description: data.description || null,
      rentalPrice: data.rentalPrice || null,
      rentalPeriod: data.rentalPeriod || null,
      depositAmount: data.depositAmount || null,
      replacementValue: data.replacementValue || null,
    } }),

  delete: (id: string) =>
    api.delete<{ message: string }>(`/api/inventory/${id}`),

  // Product Units (Multi-UOM)
  getUnits: (productId: string) =>
    api.get<any>(`/api/inventory/${productId}/units`),

  addUnit: (productId: string, data: { unitName: string; conversionFactor: number; sellingPrice: number; isDefault?: boolean }) =>
    api.post<any>(`/api/inventory/${productId}/units`, { body: data }),

  updateUnit: (productId: string, unitId: string, data: { unitName?: string; conversionFactor?: number; sellingPrice?: number; isDefault?: boolean }) =>
    api.put<any>(`/api/inventory/${productId}/units/${unitId}`, { body: data }),

  deleteUnit: (productId: string, unitId: string) =>
    api.delete<any>(`/api/inventory/${productId}/units/${unitId}`),
}

// Map backend Product model to frontend InventoryItem
function mapProductToInventory(p: any): InventoryItem {
  return {
    id: p.id,
    business_id: p.tenantId,
    product_id: p.sku || '',
    product_name: p.name,
    quantity: p.quantity ?? 0,
    unit_price: p.price ?? 0,
    cost_price: p.cost ?? 0,
    low_stock_alert: p.minStock ?? 10,
    barcode: p.barcode || '',
    sku: p.sku || '',
    categoryId: p.categoryId ? String(p.categoryId) : p.category?.id ? String(p.category.id) : '',
    branchId: p.branchId || p.branch?.id || null,
    branch: p.branch || null,
    updated_at: p.updatedAt || p.createdAt,
    baseUnit: p.baseUnit || 'Piece',
    units: p.units || [],
    itemType: p.itemType || 'product',
    serviceCategory: p.serviceCategory || null,
    estimatedHours: p.estimatedHours || null,
    duration: p.duration || null,
    description: p.description || null,
    rentalPrice: p.rentalPrice || null,
    rentalPeriod: p.rentalPeriod || null,
    depositAmount: p.depositAmount || null,
    replacementValue: p.replacementValue || null,
  }
}

// Rentals endpoints
export const rentalsApi = {
  list: async (params?: { status?: string; customerId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const data = await api.get<any>('/api/rentals', { params })
    return data
  },

  get: async (id: string) => {
    const data = await api.get<any>(`/api/rentals/${id}`)
    return data
  },

  create: (data: any) =>
    api.post<any>('/api/rentals', { body: data }),

  return: (id: string, data: { items?: any[]; depositStatus?: string; damageFees?: Record<string, number> }) =>
    api.post<any>(`/api/rentals/${id}/return`, { body: data }),

  update: (id: string, data: any) =>
    api.put<any>(`/api/rentals/${id}`, { body: data }),

  cancel: (id: string) =>
    api.delete<any>(`/api/rentals/${id}`),

  summary: () =>
    api.get<any>('/api/rentals/report/summary'),
}

// Sales endpoints
export const salesApi = {
  list: async (params?: { start?: string; end?: string }) => {
    const mappedParams: Record<string, string | number | boolean | undefined> = {}
    if (params?.start) mappedParams.from = params.start
    if (params?.end) mappedParams.to = params.end
    const data = await api.get<any>('/api/sales', { params: mappedParams })
    return Array.isArray(data?.sales) ? data.sales : Array.isArray(data) ? data : []
  },

  create: (data: Partial<Sale>) =>
    api.post<Sale>('/api/sales', { body: data }),

  checkout: (cart: CartItem[], payment_mode: string, cashDiscount?: number, paymentDetails?: { mobileProvider?: string; phoneNumber?: string; transactionId?: string; amountPaid?: number; changeGiven?: number }) =>
    api.post<{ message: string; count: number; total: number; sale: any }>('/api/sales/checkout', {
      body: {
        cart: cart.map(c => ({
          productId: c.productId || c.id,
          qty: c.qty,
          price: c.selling_price,
          discount: c.discount || 0,
          cashDiscount: c.cashDiscount || 0,
          unitName: c.unitName || null,
          conversionFactor: c.conversionFactor ?? null,
        })),
        paymentMethod: payment_mode,
        cashDiscount: cashDiscount || 0,
        mobileProvider: paymentDetails?.mobileProvider,
        phoneNumber: paymentDetails?.phoneNumber,
        transactionId: paymentDetails?.transactionId,
        amountPaid: paymentDetails?.amountPaid,
        changeGiven: paymentDetails?.changeGiven,
      },
    }),
}

// Purchases endpoints
export const purchasesApi = {
  list: async (params?: { start?: string; end?: string }) => {
    const mappedParams: Record<string, string | number | boolean | undefined> = {}
    if (params?.start) mappedParams.from = params.start
    if (params?.end) mappedParams.to = params.end
    const data = await api.get<any>('/api/purchases', { params: mappedParams })
    return Array.isArray(data?.purchases) ? data.purchases : Array.isArray(data) ? data : []
  },

  create: (data: Partial<Purchase>) =>
    api.post<Purchase>('/api/purchases', { body: data }),

  checkout: (items: PurchaseItem[], vendor_name: string, invoice_no: string, date?: string, paymentMethod?: string) =>
    api.post<{ message: string; count: number; total: number; purchase: any }>('/api/purchases/checkout', {
      body: {
        cart: items.map((item) => ({
          productId: item.id,
          quantity: item.qty,
          cost: item.unit_cost,
        })),
        supplier: vendor_name,
        refNo: invoice_no,
        notes: date,
        paymentMethod: paymentMethod || 'cash',
      },
    }),
}

// Categories endpoint
export const categoriesApi = {
  list: async (type?: string) => {
    const url = type ? `/api/inventory/categories?type=${type}` : '/api/inventory/categories'
    const data = await api.get<any>(url)
    const categories = Array.isArray(data)
      ? data
      : Array.isArray(data?.categories)
        ? data.categories
        : Array.isArray(data?.data)
          ? data.data
          : []

    return categories
      .filter((category: any) => category?.id && category?.name)
      .map((category: any) => ({
        ...category,
        id: String(category.id),
        name: String(category.name),
      })) as Array<{ id: string; name: string; slug?: string }>
  },
  create: (data: { name: string; slug: string }) =>
    api.post('/api/inventory/categories', { body: data }),
}

// Reports endpoints
export const reportsApi = {
  getProducts: async () => {
    const data = await api.get<any>('/api/reports/sales')
    const sales = Array.isArray(data?.sales) ? data.sales : Array.isArray(data) ? data : []
    // Aggregate top products from sale items
    const productMap: Record<string, { product: string; quantity: number; revenue: number; profit: number }> = {}
    for (const sale of sales) {
      for (const item of sale.items || []) {
        const name = item.product?.name || item.productId || 'Unknown'
        if (!productMap[name]) productMap[name] = { product: name, quantity: 0, revenue: 0, profit: 0 }
        productMap[name].quantity += item.quantity || 0
        productMap[name].revenue += item.total || 0
        productMap[name].profit += (item.total || 0) - ((item.product?.cost || 0) * (item.quantity || 0))
      }
    }
    return Object.values(productMap).sort((a, b) => b.profit - a.profit)
  },

  getStaff: async () => {
    const data = await api.get<any>('/api/reports/sales')
    const sales = Array.isArray(data?.sales) ? data.sales : Array.isArray(data) ? data : []
    // Aggregate staff performance from sales
    const staffMap: Record<string, { staff: string; sales_count: number; total_revenue: number; profit: number }> = {}
    for (const sale of sales) {
      const name = sale.user ? `${sale.user.fname || ''} ${sale.user.lname || ''}`.trim() || 'Unknown' : 'Unknown'
      if (!staffMap[name]) staffMap[name] = { staff: name, sales_count: 0, total_revenue: 0, profit: 0 }
      staffMap[name].sales_count += 1
      staffMap[name].total_revenue += sale.total || 0
      const itemProfit = (sale.items || []).reduce((s: number, i: any) => s + ((i.total || 0) - ((i.product?.cost || 0) * (i.quantity || 0))), 0)
      staffMap[name].profit += itemProfit
    }
    return Object.values(staffMap).sort((a, b) => b.profit - a.profit)
  },

  getDaily: async () => {
    const data = await api.get<any>('/api/reports/sales')
    const sales = Array.isArray(data?.sales) ? data.sales : Array.isArray(data) ? data : []
    // Group by day
    const dayMap: Record<string, { date: string; gross: number; discount: number; tax: number; cost: number; profit: number }> = {}
    for (const sale of sales) {
      const day = new Date(sale.createdAt).toISOString().slice(0, 10)
      if (!dayMap[day]) dayMap[day] = { date: day, gross: 0, discount: 0, tax: 0, cost: 0, profit: 0 }
      dayMap[day].gross += sale.total || 0
      dayMap[day].discount += sale.discount || 0
      dayMap[day].tax += sale.tax || 0
      const cost = (sale.items || []).reduce((s: number, i: any) => s + ((i.product?.cost || 0) * (i.quantity || 0)), 0)
      dayMap[day].cost += cost
      dayMap[day].profit += (sale.total || 0) - cost - (sale.discount || 0)
    }
    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))
  },

  getMonthly: async () => {
    const data = await api.get<any>('/api/reports/sales')
    const sales = Array.isArray(data?.sales) ? data.sales : Array.isArray(data) ? data : []
    // Group by month
    const monthMap: Record<string, { month: string; gross: number; discount: number; tax: number; cost: number; profit: number }> = {}
    for (const sale of sales) {
      const m = new Date(sale.createdAt).toISOString().slice(0, 7)
      if (!monthMap[m]) monthMap[m] = { month: m, gross: 0, discount: 0, tax: 0, cost: 0, profit: 0 }
      monthMap[m].gross += sale.total || 0
      monthMap[m].discount += sale.discount || 0
      monthMap[m].tax += sale.tax || 0
      const cost = (sale.items || []).reduce((s: number, i: any) => s + ((i.product?.cost || 0) * (i.quantity || 0)), 0)
      monthMap[m].cost += cost
      monthMap[m].profit += (sale.total || 0) - cost - (sale.discount || 0)
    }
    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))
  },
}

// ==================== NEW REPORTS API (v2) ====================
export type ReportParams = Record<string, string | number | boolean | undefined>

export const reportsApiV2 = {
  // Sales Reports
  salesSummary: (params?: ReportParams) => api.get<any>('/api/reports/sales/summary', { params }),
  salesDaily: (params?: ReportParams) => api.get<any>('/api/reports/sales/daily', { params }),
  salesWeekly: (params?: ReportParams) => api.get<any>('/api/reports/sales/weekly', { params }),
  salesMonthly: (params?: ReportParams) => api.get<any>('/api/reports/sales/monthly', { params }),
  salesByProduct: (params?: ReportParams) => api.get<any>('/api/reports/sales/by-product', { params }),
  salesByCategory: (params?: ReportParams) => api.get<any>('/api/reports/sales/by-category', { params }),
  salesByCustomer: (params?: ReportParams) => api.get<any>('/api/reports/sales/by-customer', { params }),
  salesByUser: (params?: ReportParams) => api.get<any>('/api/reports/sales/by-user', { params }),
  salesByBranch: (params?: ReportParams) => api.get<any>('/api/reports/sales/by-branch', { params }),
  salesDiscounts: (params?: ReportParams) => api.get<any>('/api/reports/sales/discounts', { params }),
  salesReturns: (params?: ReportParams) => api.get<any>('/api/reports/sales/returns', { params }),

  // Inventory Reports
  inventoryStock: (params?: ReportParams) => api.get<any>('/api/reports/inventory/stock', { params }),
  inventoryValuation: (params?: ReportParams) => api.get<any>('/api/reports/inventory/valuation', { params }),
  inventoryLowStock: (params?: ReportParams) => api.get<any>('/api/reports/inventory/low-stock', { params }),
  inventoryOutOfStock: (params?: ReportParams) => api.get<any>('/api/reports/inventory/out-of-stock', { params }),
  inventoryStockMovement: (params?: ReportParams) => api.get<any>('/api/reports/inventory/stock-movement', { params }),
  inventoryAdjustments: (params?: ReportParams) => api.get<any>('/api/reports/inventory/adjustments', { params }),
  inventoryExpiry: (params?: ReportParams) => api.get<any>('/api/reports/inventory/expiry', { params }),
  inventoryDamaged: (params?: ReportParams) => api.get<any>('/api/reports/inventory/damaged', { params }),
  inventoryFastMoving: (params?: ReportParams) => api.get<any>('/api/reports/inventory/fast-moving', { params }),
  inventorySlowMoving: (params?: ReportParams) => api.get<any>('/api/reports/inventory/slow-moving', { params }),

  // Financial Reports
  financialProfitLoss: (params?: ReportParams) => api.get<any>('/api/reports/financial/profit-loss', { params }),
  financialIncome: (params?: ReportParams) => api.get<any>('/api/reports/financial/income', { params }),
  financialExpense: (params?: ReportParams) => api.get<any>('/api/reports/financial/expense', { params }),
  financialCashFlow: (params?: ReportParams) => api.get<any>('/api/reports/financial/cash-flow', { params }),
  financialTrialBalance: (params?: ReportParams) => api.get<any>('/api/reports/financial/trial-balance', { params }),
  financialBalanceSheet: (params?: ReportParams) => api.get<any>('/api/reports/financial/balance-sheet', { params }),
  financialGeneralLedger: (params?: ReportParams) => api.get<any>('/api/reports/financial/general-ledger', { params }),
  financialBankTransactions: (params?: ReportParams) => api.get<any>('/api/reports/financial/bank-transactions', { params }),
  financialTax: (params?: ReportParams) => api.get<any>('/api/reports/financial/tax', { params }),

  // Customer Reports
  customersList: (params?: ReportParams) => api.get<any>('/api/reports/customers/list', { params }),
  customersSales: (params?: ReportParams) => api.get<any>('/api/reports/customers/sales', { params }),
  customersBalance: (params?: ReportParams) => api.get<any>('/api/reports/customers/balance', { params }),
  customersReceivables: (params?: ReportParams) => api.get<any>('/api/reports/customers/receivables', { params }),
  customersTop: (params?: ReportParams) => api.get<any>('/api/reports/customers/top', { params }),

  // Supplier Reports
  suppliersList: (params?: ReportParams) => api.get<any>('/api/reports/suppliers/list', { params }),
  suppliersPurchases: (params?: ReportParams) => api.get<any>('/api/reports/suppliers/purchases', { params }),
  suppliersPayables: (params?: ReportParams) => api.get<any>('/api/reports/suppliers/payables', { params }),
  suppliersBalance: (params?: ReportParams) => api.get<any>('/api/reports/suppliers/balance', { params }),

  // Receivables Reports
  receivablesOutstanding: (params?: ReportParams) => api.get<any>('/api/reports/receivables/outstanding', { params }),
  receivablesAging: (params?: ReportParams) => api.get<any>('/api/reports/receivables/aging', { params }),
  receivablesCollection: (params?: ReportParams) => api.get<any>('/api/reports/receivables/collection', { params }),
  receivablesOverdue: (params?: ReportParams) => api.get<any>('/api/reports/receivables/overdue', { params }),

  // Payables Reports
  payablesOutstanding: (params?: ReportParams) => api.get<any>('/api/reports/payables/outstanding', { params }),
  payablesAging: (params?: ReportParams) => api.get<any>('/api/reports/payables/aging', { params }),
  payablesPaymentHistory: (params?: ReportParams) => api.get<any>('/api/reports/payables/payment-history', { params }),
  payablesOverdue: (params?: ReportParams) => api.get<any>('/api/reports/payables/overdue', { params }),

  // Business Performance Reports
  performanceBranch: (params?: ReportParams) => api.get<any>('/api/reports/performance/branch', { params }),
  performanceProduct: (params?: ReportParams) => api.get<any>('/api/reports/performance/product', { params }),
  performanceCategory: (params?: ReportParams) => api.get<any>('/api/reports/performance/category', { params }),
  performanceUserActivity: (params?: ReportParams) => api.get<any>('/api/reports/performance/user-activity', { params }),
  performanceTopProducts: (params?: ReportParams) => api.get<any>('/api/reports/performance/top-products', { params }),
  performanceLeastProducts: (params?: ReportParams) => api.get<any>('/api/reports/performance/least-products', { params }),

  // Service Reports
  servicesSummary: (params?: ReportParams) => api.get<any>('/api/reports/services/summary', { params }),
  servicesList: (params?: ReportParams) => api.get<any>('/api/reports/services/list', { params }),
  servicesSales: (params?: ReportParams) => api.get<any>('/api/reports/services/sales', { params }),
  servicesByCategory: (params?: ReportParams) => api.get<any>('/api/reports/services/by-category', { params }),
  servicesByBranch: (params?: ReportParams) => api.get<any>('/api/reports/services/by-branch', { params }),
  servicesTop: (params?: ReportParams) => api.get<any>('/api/reports/services/top', { params }),

  // Rental Reports
  rentalsSummary: (params?: ReportParams) => api.get<any>('/api/reports/rentals/summary', { params }),
  rentalsList: (params?: ReportParams) => api.get<any>('/api/reports/rentals/list', { params }),
  rentalsByItem: (params?: ReportParams) => api.get<any>('/api/reports/rentals/by-item', { params }),
  rentalsByCustomer: (params?: ReportParams) => api.get<any>('/api/reports/rentals/by-customer', { params }),
  rentalsByBranch: (params?: ReportParams) => api.get<any>('/api/reports/rentals/by-branch', { params }),
  rentalsActive: (params?: ReportParams) => api.get<any>('/api/reports/rentals/active', { params }),
  rentalsOverdue: (params?: ReportParams) => api.get<any>('/api/reports/rentals/overdue', { params }),
  rentalsReturns: (params?: ReportParams) => api.get<any>('/api/reports/rentals/returns', { params }),
  rentalsDaily: (params?: ReportParams) => api.get<any>('/api/reports/rentals/daily', { params }),
  rentalsMonthly: (params?: ReportParams) => api.get<any>('/api/reports/rentals/monthly', { params }),

  // Fuel Station Reports
  fuelSalesSummary: (params?: ReportParams) => api.get<any>('/api/reports/fuel/sales-summary', { params }),
  fuelSalesByPump: (params?: ReportParams) => api.get<any>('/api/reports/fuel/sales-by-pump', { params }),
  fuelTankStock: (params?: ReportParams) => api.get<any>('/api/reports/fuel/tank-stock', { params }),
  fuelDeliveries: (params?: ReportParams) => api.get<any>('/api/reports/fuel/deliveries', { params }),
  fuelShiftSummary: (params?: ReportParams) => api.get<any>('/api/reports/fuel/shift-summary', { params }),
  fuelLubricantSales: (params?: ReportParams) => api.get<any>('/api/reports/fuel/lubricant-sales', { params }),
  fuelCarWashIncome: (params?: ReportParams) => api.get<any>('/api/reports/fuel/car-wash-income', { params }),
  fuelMeterReadings: (params?: ReportParams) => api.get<any>('/api/reports/fuel/meter-readings', { params }),
}

// Admin endpoints
export const adminApi = {
  getMetrics: () =>
    api.get<AdminMetrics>('/api/admin/metrics'),

  getBusinesses: () =>
    api.get<Business[]>('/api/admin/businesses'),

  createBusiness: (data: Partial<Business>) =>
    api.post<Business>('/api/admin/businesses', { body: data }),

  createOwner: (data: CreateOwnerData) =>
    api.post<{ message: string; email: string; business_id: string }>('/api/admin/owners', { body: data }),

  getSubscriptions: () =>
    api.get<Subscription[]>('/api/admin/subscriptions'),

  createSubscription: (data: Partial<Subscription>) =>
    api.post<Subscription>('/api/admin/subscriptions', { body: data }),

  getInvoices: () =>
    api.get<Invoice[]>('/api/admin/invoices'),

  schemaCheck: () =>
    api.get<{ ok: boolean; tables: SchemaTable[]; report: string }>('/api/admin/schema-check'),

  getOwners: (params?: { search?: string }) =>
    api.get<any[]>('/api/admin/owners', { params }),

  resetOwnerPassword: (id: string, password: string) =>
    api.post<{ message: string }>(`/api/admin/owners/${id}/reset-password`, { body: { password } }),

  updateSubscription: (id: string, data: { planId?: string; status?: string }) =>
    api.patch<any>(`/api/admin/subscriptions/${id}`, { body: data }),
}

// Platform endpoints
export const platformApi = {
  getStats: () =>
    api.get<any>('/api/platform/stats'),

  getPlans: () =>
    api.get<any[]>('/api/platform/plans'),

  createPlan: (data: any) =>
    api.post<any>('/api/platform/plans', { body: data }),

  updatePlan: (id: string, data: any) =>
    api.put<any>(`/api/platform/plans/${id}`, { body: data }),

  deletePlan: (id: string) =>
    api.delete<{ message: string }>(`/api/platform/plans/${id}`),

  getFeatures: () =>
    api.get<any[]>('/api/platform/features'),

  createFeature: (data: any) =>
    api.post<any>('/api/platform/features', { body: data }),

  deleteFeature: (id: string) =>
    api.delete<{ message: string }>(`/api/platform/features/${id}`),

  getPlanFeatures: (planId: string) =>
    api.get<any[]>(`/api/platform/plans/${planId}/features`),

  togglePlanFeature: (planId: string, featureId: string, enabled: boolean) =>
    api.post<any>(`/api/platform/plans/${planId}/features/${featureId}`, { body: { enabled } }),
}

// Tenant endpoints
export const tenantsApi = {
  list: (params?: { status?: string; search?: string }) =>
    api.get<any>('/api/tenants', { params }),

  get: (id: string) =>
    api.get<any>(`/api/tenants/${id}`),

  activate: (id: string) =>
    api.post<any>(`/api/tenants/${id}/activate`),

  suspend: (id: string) =>
    api.post<any>(`/api/tenants/${id}/suspend`),

  updatePlan: (id: string, planId: string) =>
    api.put<any>(`/api/tenants/${id}/plan`, { body: { planId } }),
}

// Branch endpoints
export const branchesApi = {
  active: async () => {
    const data = await api.get<any>('/api/branches/active')
    return (Array.isArray(data?.branches) ? data.branches : Array.isArray(data) ? data : []) as BranchOption[]
  },
  list: async () => {
    const data = await api.get<any>('/api/branches')
    return (Array.isArray(data?.branches) ? data.branches : Array.isArray(data) ? data : []) as BranchOption[]
  },
  create: (data: { name: string; address?: string; isActive?: boolean }) =>
    api.post<{ message: string; branch: any }>('/api/branches', { body: data }),
  update: (id: string, data: { name?: string; address?: string; isActive?: boolean }) =>
    api.put<{ message: string; branch: any }>(`/api/branches/${id}`, { body: data }),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/api/branches/${id}`),
}

// Staff endpoints
export const staffApi = {
  list: async () => {
    const data = await api.get<any>('/api/staff')
    return (Array.isArray(data?.staff) ? data.staff : Array.isArray(data) ? data : []) as StaffMember[]
  },

  create: (data: StaffPayload) =>
    api.post<{ message: string; staff: StaffMember; password?: string }>('/api/staff', { body: data }),

  update: (id: string, data: Partial<StaffPayload> & { isActive?: boolean }) =>
    api.patch<{ message: string; staff: StaffMember }>(`/api/staff/${id}`, { body: data }),

  deactivate: (id: string) =>
    api.delete<{ message: string; staff: StaffMember }>(`/api/staff/${id}`),

  getPermissions: (id: string) =>
    api.get<any>(`/api/staff/${id}/permissions`),

  getPermissionsSchema: () =>
    api.get<{ keys: string[]; defaults: Record<string, Record<string, boolean>> }>('/api/staff/permissions/schema'),

  updatePermissions: (id: string, data: Record<string, boolean>) =>
    api.put<{ message: string; permissions: any }>(`/api/staff/${id}/permissions`, { body: data }),
}

// Settings endpoints
export const settingsApi = {
  get: () =>
    api.get<any>('/api/settings'),

  getTaxConfig: () =>
    api.get<any>('/api/settings/tax-config'),

  update: (data: Record<string, any>) =>
    api.put<{ message: string; tenant: any }>('/api/settings', { body: data }),

  uploadLogo: (file: File) => {
    const formData = new FormData()
    formData.append('logo', file)
    return fetch(`${API_URL}/api/settings/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: formData,
    }).then(r => r.json())
  },
}

// Receipt endpoints
export const receiptsApi = {
  get: async (saleId: string) => {
    const data = await api.get<any>(`/api/receipts/${saleId}`)
    return (data?.receipt || data) as ReceiptPreview
  },

  getPdf: (saleId: string) => {
    const token = getAuthToken()
    return `${API_URL}/api/receipts/${saleId}/pdf${token ? `?token=${token}` : ''}`
  },

  getEscPos: (saleId: string) =>
    api.get<{ commands: string[]; receiptNo: string }>(`/api/receipts/${saleId}/escpos`),
}

// Audit endpoints
export const auditApi = {
  list: (params?: { model?: string; action?: string; userId?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    api.get<AuditLogList>('/api/audit', { params }),

  summary: () =>
    api.get<AuditSummary>('/api/audit/summary'),
}

// Barcode lookup
export const barcodeApi = {
  lookup: (barcode: string) =>
    api.get<{ products: InventoryItem[]; total: number }>('/api/inventory', { params: { barcode } }),
}

// Types
export interface User {
  id: string | number
  email: string
  role: 'saas_admin' | 'owner' | 'manager' | 'accountant' | 'attendant'
  fname: string
  lname: string
  mname?: string
  business_id?: string
  business_name?: string
  phone_number?: string
  is_active?: boolean
}

export interface BranchOption {
  id: string
  name: string
  address?: string | null
  isActive?: boolean
}

export interface StaffMember {
  id: string
  email: string
  name: string
  fname?: string
  lname?: string
  phone?: string | null
  role: 'manager' | 'accountant' | 'attendant'
  isActive: boolean
  branchId?: string | null
  branch?: BranchOption | null
  branches?: Array<{ id: string; name: string; isPrimary?: boolean }>
  cashAccountId?: string | null
  cashAccount?: { id: string; name: string; type: string } | null
}

export interface StaffPayload {
  name?: string
  fname?: string
  lname?: string
  email?: string
  password?: string
  phone?: string
  role: 'manager' | 'accountant' | 'attendant'
  branchId: string
  permissions?: Record<string, boolean>
  cashAccountId?: string | null
}

export interface RegisterData {
  email: string
  password: string
  fname: string
  lname: string
  role: string
  business_name?: string
  business_id?: string
}

export interface DashboardKpis {
  revenue: number
  revenueChange: number
  salesCount: number
  taxCollected: number
  totalDiscount: number
  purchases: number
  expenses: number
  grossProfit: number
  netProfit: number
  productCount: number
  lowStockCount: number
  customerCount: number
  receivablesOutstanding: number
  receivablesCount: number
}

export interface SalesChartData {
  labels: string[]
  revenue: number[]
  expenses: number[]
}

export interface ProfitLossData {
  labels: string[]
  grossProfit: number[]
  netProfit: number[]
}

export interface TopProduct {
  productId: string
  name: string
  quantity: number
  revenue: number
  salesCount: number
}

export interface PaymentMethodData {
  method: string
  total: number
  count: number
}

export interface InventoryItem {
  id: string | number
  business_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  cost_price: number
  low_stock_alert: number
  barcode?: string
  sku?: string
  categoryId?: string
  branchId?: string | null
  branch?: BranchOption | null
  updated_at: string
  baseUnit?: string
  units?: any[]
  itemType?: 'product' | 'service' | 'rental'
  serviceCategory?: string | null
  estimatedHours?: number | null
  duration?: string | null
  description?: string | null
  rentalPrice?: number | null
  rentalPeriod?: string | null
  depositAmount?: number | null
  replacementValue?: number | null
}

export interface ReceiptPreview {
  id: string
  receiptNo: string
  business: {
    name: string
    email?: string | null
    phone?: string | null
    address?: string | null
    logo?: string | null
    receiptHeader?: string | null
    receiptFooter?: string | null
  }
  branch?: BranchOption | null
  cashier?: string
  paymentMethod: string
  createdAt: string
  subtotal: number
  discount: number
  tax: number
  total: number
  amountPaid?: number | null
  changeGiven?: number | null
  items: Array<{
    id: string
    name: string
    sku?: string | null
    quantity: number
    price: number
    total: number
  }>
}

export interface Sale {
  id: string | number
  business_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  tax: number
  total: number
  cost_of_goods: number
  staff_name: string
  date: string
  payment_mode?: string
  notes?: string
}

export interface Purchase {
  id: string | number
  business_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_cost: number
  total_cost: number
  vendor_name: string
  invoice_no: string
  date: string
  staff_name: string
}

export interface CartItem {
  id: string | number
  productId?: string | number
  product_id: string
  name: string
  qty: number
  selling_price: number
  cost_price: number
  discount?: number
  tax?: number
  cashDiscount?: number
  unitName?: string | null
  conversionFactor?: number | null
}

export interface PurchaseItem {
  id: string | number
  product_id: string
  name: string
  qty: number
  unit_cost: number
}

export interface TopProduct {
  product: string
  quantity: number
  revenue: number
  profit: number
}

export interface StaffLeaderboard {
  staff: string
  sales_count: number
  total_revenue: number
  profit: number
}

export interface DailyReport {
  date: string
  gross: number
  discount: number
  tax: number
  cost: number
  profit: number
}

export interface MonthlyReport {
  month: string
  gross: number
  discount: number
  tax: number
  cost: number
  profit: number
}

export interface Business {
  id: string | number
  name: string
  business_id: string
  owner_id?: string
  subscription_id?: string
  subscription_tier?: string
  start_date?: string
  end_date?: string
  logo_url?: string
  status?: string
  is_active?: boolean
  created_at: string
}

export interface Subscription {
  id: string | number
  business_id?: string
  owner_email?: string
  plan: string
  billing_cycle: string
  amount: number
  status: string
  start_date?: string
  renewed_at?: string
  is_active?: boolean
  created_at?: string
}

export interface Invoice {
  id: string | number
  date: string
  amount: number
  status: 'paid' | 'pending' | 'overdue'
}

export interface CreateOwnerData {
  email: string
  password: string
  fname: string
  lname: string
  mname?: string
  business_id: string
  business_name?: string
}

export interface SchemaTable {
  table: string
  present: boolean
  columns: string[]
  missingColumns: string[]
  extraColumns: string[]
}

export interface AdminMetrics {
  cards: {
    totalBusinesses: number
    totalRegistered: number
    activeSubscriptions: number
    monthlyRevenue: number
  }
  charts: {
    revenue: { labels: string[]; data: number[] }
    plans: { labels: string[]; data: number[] }
  }
  recent: Array<{ name: string; tier: string; created_at: string | null }>
  churnRate: number
  uptimeHours: number
}

export interface AuditLogEntry {
  id: string
  tenantId: string
  userId: string
  userEmail: string
  action: string
  model: string
  recordId: string | null
  changes: { before?: Record<string, any>; after?: Record<string, any>; data?: Record<string, any> } | null
  ip: string | null
  createdAt: string
}

export interface AuditLogList {
  logs: AuditLogEntry[]
  total: number
  page: number
  limit: number
}

export interface AuditSummary {
  byModel: Record<string, number>
  byAction: Record<string, number>
  byDay: Record<string, number>
  total: number
}

// =====================
// Referral System
// =====================

export interface ReferralStats {
  totalReferrals: number
  pending: number
  signedUp: number
  subscribed: number
  completed: number
  rewardsClaimed: number
  rewardsPending: number
}

export interface Referral {
  id: string
  referralCodeId: string
  referrerTenantId: string
  referredTenantId: string | null
  referredEmail: string
  status: 'pending' | 'invited' | 'signed_up' | 'subscribed' | 'completed' | 'expired' | 'cancelled'
  rewardType: 'subscription_discount' | 'free_months' | 'credit' | 'feature_unlock'
  rewardValue: number
  rewardStatus: 'unclaimed' | 'claimed' | 'expired'
  appliedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  referredTenant?: { id: string; name: string; slug: string; status: string } | null
  referrerTenant?: { id: string; name: string; slug: string } | null
  referralCode?: { code: string } | null
}

export interface ReferralReward {
  id: string
  referralId: string
  tenantId: string
  type: string
  value: number
  description: string | null
  claimedAt: string
  referral?: { referredEmail: string; status: string }
}

export interface MyReferralData {
  code: string
  referrals: Referral[]
  stats: ReferralStats
}

export interface AdminReferralStats {
  totalCodes: number
  totalReferrals: number
  pendingReferrals: number
  signedUpReferrals: number
  completedReferrals: number
  conversionRate: string
  claimedRewards: number
  totalRewards: number
}

export interface TopReferrer {
  tenant: { id: string; name: string; slug: string; email: string }
  code: string
  totalReferrals: number
  completed: number
  rewardsClaimed: number
}

export const referralApi = {
  getMyCode: () =>
    api.get<MyReferralData>('/api/referrals/my-code'),

  regenerateCode: () =>
    api.post<{ code: string }>('/api/referrals/regenerate-code', { body: {} }),

  refer: (email: string, rewardType?: string, rewardValue?: number) =>
    api.post<{ message: string; referral: Partial<Referral> }>('/api/referrals/refer', {
      body: { email, rewardType, rewardValue },
    }),

  claimReward: (referralId: string) =>
    api.post<{ message: string; reward: Partial<ReferralReward> }>(`/api/referrals/claim-reward/${referralId}`, { body: {} }),

  getRewards: () =>
    api.get<{ rewards: ReferralReward[] }>('/api/referrals/rewards'),

  trackSignup: (code: string, email: string, tenantId: string) =>
    api.post<{ message: string }>('/api/referrals/track-signup', { body: { code, email, tenantId } }),

  adminStats: () =>
    api.get<{ stats: AdminReferralStats; topReferrers: TopReferrer[]; recentReferrals: Referral[] }>('/api/referrals/admin/stats'),

  adminAll: (page = 1, limit = 20) =>
    api.get<{ referrals: Referral[]; pagination: { page: number; limit: number; total: number; pages: number } }>('/api/referrals/admin/all', { params: { page, limit } }),
}
