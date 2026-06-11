const API_URL = import.meta.env.VITE_API_URL || 'https://grocery-saas-backend.up.railway.app'

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
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`
  return fetch(url, { ...init, headers }).then(async (res) => {
    if (res.status === 401 || res.status === 403) {
      const data = await res.clone().json().catch(() => ({}))
      if (data?.message === 'Invalid token' || data?.message === 'Token expired') {
        localStorage.removeItem('token')
        localStorage.removeItem('auth_tokens')
        localStorage.removeItem('auth_user')
        localStorage.removeItem('user')
        window.location.href = '/login'
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
    api.post<{ message: string }>('/api/auth/request-reset', {
      body: { email },
      skipAuth: true,
    }),

  validateToken: () =>
    api.get<{ valid: boolean; user: User }>('/api/auth/me'),

  logout: () =>
    api.post<{ message: string }>('/api/auth/logout'),
}

// Dashboard endpoints
export const dashboardApi = {
  getKpis: () =>
    api.get<DashboardKpis>('/api/dashboard/kpis'),
}

// Inventory endpoints
export const inventoryApi = {
  list: async (q?: string) => {
    const data = await api.get<any>('/api/inventory', { params: { search: q } })
    const products = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : []
    return products.map(mapProductToInventory)
  },

  get: async (id: string) => {
    const data = await api.get<any>(`/api/inventory/${id}`)
    return mapProductToInventory(data)
  },

  create: (data: Partial<InventoryItem>) =>
    api.post<InventoryItem>('/api/inventory', { body: {
      name: data.product_name,
      price: data.unit_price,
      cost: data.cost_price,
      quantity: data.quantity,
      minStock: data.low_stock_alert,
      sku: data.product_id,
    } }),

  update: (id: string, data: Partial<InventoryItem>) =>
    api.put<InventoryItem>(`/api/inventory/${id}`, { body: {
      name: data.product_name,
      price: data.unit_price,
      cost: data.cost_price,
      quantity: data.quantity,
      minStock: data.low_stock_alert,
      sku: data.product_id,
    } }),

  delete: (id: string) =>
    api.delete<{ message: string }>(`/api/inventory/${id}`),
}

// Map backend Product model to frontend InventoryItem
function mapProductToInventory(p: any): InventoryItem {
  return {
    id: p.id,
    business_id: p.tenantId,
    product_id: p.id,
    product_name: p.name,
    quantity: p.quantity ?? 0,
    unit_price: p.price ?? 0,
    cost_price: p.cost ?? 0,
    low_stock_alert: p.minStock ?? 10,
    updated_at: p.updatedAt || p.createdAt,
  }
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

  checkout: (cart: CartItem[], payment_mode: string) =>
    api.post<{ message: string; count: number; total: number; sale: any }>('/api/sales/checkout', {
      body: {
        cart: cart.map(c => ({
          productId: c.product_id || c.id,
          qty: c.qty,
          price: c.selling_price,
          discount: c.discount || 0,
        })),
        paymentMethod: payment_mode,
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

  checkout: (items: PurchaseItem[], vendor_name: string, invoice_no: string, date?: string) =>
    api.post<{ message: string; count: number; total: number; purchase: any }>('/api/purchases/checkout', {
      body: { items, supplier: vendor_name, refNo: invoice_no, notes: date },
    }),
}

// Reports endpoints
export const reportsApi = {
  getProducts: () =>
    api.get<TopProduct[]>('/api/reports/sales'),

  getStaff: () =>
    api.get<StaffLeaderboard[]>('/api/reports/sales'),

  getDaily: () =>
    api.get<DailyReport[]>('/api/reports/sales'),

  getMonthly: () =>
    api.get<MonthlyReport[]>('/api/reports/sales'),
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
  purchases: number
  productCount: number
  lowStockCount: number
  customerCount: number
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
  updated_at: string
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
  product_id: string
  name: string
  qty: number
  selling_price: number
  cost_price: number
  discount?: number
  tax?: number
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

