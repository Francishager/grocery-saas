const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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
    if (response.status === 401) {
      localStorage.removeItem('token')
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

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
}

// Auth endpoints
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ message: string; token: string; user: User }>('/login', {
      body: { email, password },
      skipAuth: true,
    }),

  register: (data: RegisterData) =>
    api.post<{ message: string; user: User }>('/register', {
      body: data,
      skipAuth: true,
    }),

  requestReset: (email: string) =>
    api.post<{ message: string }>('/auth/request-reset', {
      body: { email },
      skipAuth: true,
    }),

  validateToken: () =>
    api.get<{ valid: boolean; user: User }>('/validate-token'),

  logout: () =>
    api.post<{ message: string }>('/logout'),
}

// Dashboard endpoints
export const dashboardApi = {
  getKpis: () =>
    api.get<DashboardKpis>('/dashboard/kpis'),
}

// Inventory endpoints
export const inventoryApi = {
  list: (q?: string) =>
    api.get<InventoryItem[]>('/inventory', { params: { q } }),

  get: (id: string) =>
    api.get<InventoryItem>(`/inventory/${id}`),

  create: (data: Partial<InventoryItem>) =>
    api.post<InventoryItem>('/inventory', { body: data }),

  update: (id: string, data: Partial<InventoryItem>) =>
    api.patch<InventoryItem>(`/inventory/${id}`, { body: data }),

  delete: (id: string) =>
    api.delete<{ message: string }>(`/inventory/${id}`),
}

// Sales endpoints
export const salesApi = {
  list: (params?: { start?: string; end?: string }) =>
    api.get<Sale[]>('/sales', { params }),

  create: (data: Partial<Sale>) =>
    api.post<Sale>('/sales', { body: data }),

  checkout: (cart: CartItem[], payment_mode: string) =>
    api.post<{ message: string; count: number; total: number; sales: Sale[] }>('/sales/checkout', {
      body: { cart, payment_mode },
    }),
}

// Purchases endpoints
export const purchasesApi = {
  list: (params?: { start?: string; end?: string }) =>
    api.get<Purchase[]>('/purchases', { params }),

  create: (data: Partial<Purchase>) =>
    api.post<Purchase>('/purchases', { body: data }),

  checkout: (items: PurchaseItem[], vendor_name: string, invoice_no: string, date?: string) =>
    api.post<{ message: string; count: number; total_cost: number; purchases: Purchase[] }>('/purchases/checkout', {
      body: { items, vendor_name, invoice_no, date },
    }),
}

// Reports endpoints
export const reportsApi = {
  getProducts: () =>
    api.get<TopProduct[]>('/reports/products'),

  getStaff: () =>
    api.get<StaffLeaderboard[]>('/reports/staff'),

  getDaily: () =>
    api.get<DailyReport[]>('/reports/daily'),

  getMonthly: () =>
    api.get<MonthlyReport[]>('/reports/monthly'),
}

// Admin endpoints
export const adminApi = {
  getMetrics: () =>
    api.get<AdminMetrics>('/admin/metrics'),

  getBusinesses: () =>
    api.get<Business[]>('/admin/businesses'),

  createBusiness: (data: Partial<Business>) =>
    api.post<Business>('/admin/businesses', { body: data }),

  createOwner: (data: CreateOwnerData) =>
    api.post<{ message: string; email: string; business_id: string }>('/admin/owners', { body: data }),

  getSubscriptions: () =>
    api.get<Subscription[]>('/admin/subscriptions'),

  createSubscription: (data: Partial<Subscription>) =>
    api.post<Subscription>('/admin/subscriptions', { body: data }),

  getInvoices: () =>
    api.get<Invoice[]>('/admin/invoices'),

  schemaCheck: () =>
    api.get<{ ok: boolean; tables: SchemaTable[]; report: string }>('/admin/schema-check'),
}

// Types
export interface User {
  id: string | number
  email: string
  role: 'SaaS Admin' | 'Owner' | 'Manager' | 'Accountant' | 'Attendant'
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
  total_sales: number
  total_profit: number
  total_discount: number
  total_tax: number
  low_stock: InventoryItem[]
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
