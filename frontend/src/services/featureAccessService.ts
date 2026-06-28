import { useState, useEffect } from 'react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { apiFetch } from '@/lib/api'

export interface Feature {
  name: string
  displayName: string
  description?: string
  category: string
  icon?: string
  enabled: boolean
  source: 'plan' | 'override' | 'default'
}

export interface FeatureAccess {
  [featureName: string]: {
    enabled: boolean
    source: 'plan' | 'override' | 'default'
  }
}

export interface UsageLimits {
  maxProducts: number
  maxUsers: number
  maxBranches: number
  maxCustomers: number
  maxSuppliers: number
}

const FEATURE_ALIASES: Record<string, string[]> = {
  credit: ['receivables', 'receivables.payments', 'receivables.aging'],
  receivables: ['receivables.payments', 'receivables.aging'],
  suppliers: ['suppliers', 'suppliers.purchase_orders', 'suppliers.grn', 'payables', 'payables.payments', 'payables.aging'],
  payables: ['payables.payments', 'payables.aging'],
  pos: ['sales', 'sales.pos'],
  pos_sales: ['sales', 'sales.pos'],
  sales_tracking: ['sales'],
  invoice_generation: ['sales'],
  customer_transactions: ['sales', 'customers'],
  payment_management: ['sales'],
  product_tracking: ['inventory', 'inventory.products'],
  stock_movement: ['inventory', 'inventory.products'],
  low_stock_alerts: ['inventory', 'inventory.products'],
  purchase_management: ['suppliers', 'suppliers.purchase_orders'],
  supplier_management: ['suppliers'],
  inventory_valuation: ['inventory', 'inventory.products'],
  bookkeeping: ['reports'],
  income_tracking: ['financial.income'],
  expense_management: ['expenses'],
  payables_management: ['payables', 'payables.payments'],
  receivables_management: ['receivables', 'receivables.payments'],
  cash_flow_monitoring: ['expenses', 'financial.cashbook'],
  profitability_analysis: ['reports', 'reports.financial'],
  staff_management: ['settings', 'settings.roles', 'settings.users'],
  role_access_control: ['settings', 'settings.roles'],
  activity_logs: ['audit'],
  branch_management: ['multi_branch'],
  workflow_organization: ['settings'],
  financial_reports: ['reports', 'reports.financial'],
  sales_reports: ['reports', 'reports.sales'],
  inventory_reports: ['reports', 'reports.inventory'],
  performance_dashboards: ['reports', 'reports.performance'],
  decision_analytics: ['reports'],
  multi_branch: ['multi_branch', 'multi_branch.transfers', 'multi_branch.reports'],
  advanced_reports: ['reports', 'reports.performance'],
  cash_flow: ['financial.cashbook'],
  sms: ['communication.sms'],
  whatsapp: ['communication.whatsapp'],
  offline_mode: ['integrations.api_access'],
}

class FeatureAccessService {
  private static instance: FeatureAccessService
  private features: FeatureAccess = {}
  private usageLimits: UsageLimits | null = null
  private loading = false
  private error: string | null = null
  private listeners: Array<() => void> = []

  private constructor() {}

  static getInstance(): FeatureAccessService {
    if (!FeatureAccessService.instance) {
      FeatureAccessService.instance = new FeatureAccessService()
    }
    return FeatureAccessService.instance
  }

  // Subscribe to feature changes
  subscribe(listener: () => void) {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener())
  }

  // Load features for current tenant
  async loadFeatures(tenantId?: string) {
    if (!tenantId) return

    this.loading = true
    this.error = null
    this.notifyListeners()

    try {
      const response = await apiFetch('/api/admin/me/features')
      
      if (!response.ok) {
        throw new Error('Failed to load features')
      }

      const data = await response.json()
      this.features = this.normalizeFeatures(data.features || {})
      
      // Load usage limits
      await this.loadUsageLimits(tenantId)
      
    } catch (error) {
      console.error('Failed to load features:', error)
      this.error = error instanceof Error ? error.message : 'Failed to load features'
    } finally {
      this.loading = false
      this.notifyListeners()
    }
  }

  private normalizeFeatures(rawFeatures: string[] | FeatureAccess): FeatureAccess {
    const normalized: FeatureAccess = {}

    const setFeature = (name: string, enabled: boolean = true, source: 'plan' | 'override' | 'default' = 'plan') => {
      if (!name) return
      normalized[name] = { enabled, source }
      ;(FEATURE_ALIASES[name] || []).forEach((alias) => {
        if (!normalized[alias] || enabled) normalized[alias] = { enabled, source }
      })
    }

    if (Array.isArray(rawFeatures)) {
      rawFeatures.forEach((name) => setFeature(name, true, 'plan'))
      return normalized
    }

    Object.entries(rawFeatures).forEach(([name, access]) => {
      setFeature(name, access.enabled, access.source)
    })

    return normalized
  }

  // Load usage limits
  private async loadUsageLimits(tenantId: string) {
    try {
      const response = await apiFetch(`/api/tenants/${tenantId}/limits`)
      
      if (response.ok) {
        const data = await response.json()
        this.usageLimits = data.usageLimit
      }
    } catch (error) {
      console.error('Failed to load usage limits:', error)
    }
  }

  // Check if feature is enabled (primary API)
  isFeatureEnabled(featureName: string): boolean {
    if (this.features[featureName]?.enabled) return true
    // Check if a parent module is enabled (e.g., 'inventory' covers 'inventory.products')
    const parts = featureName.split('.')
    if (parts.length > 1) {
      const parent = parts[0]
      if (this.features[parent]?.enabled) return true
    }
    return false
  }

  // Alias for isFeatureEnabled — matches spec naming convention hasFeature('inventory.products')
  hasFeature(featureName: string): boolean {
    return this.isFeatureEnabled(featureName)
  }

  // Get feature info
  getFeature(featureName: string): Feature | null {
    const featureAccess = this.features[featureName]
    if (!featureAccess) return null

    return {
      name: featureName,
      displayName: featureName.charAt(0).toUpperCase() + featureName.slice(1).replace(/_/g, ' '),
      category: this.getFeatureCategory(featureName),
      enabled: featureAccess.enabled,
      source: featureAccess.source
    }
  }

  // Get feature category — derived from module name
  private getFeatureCategory(featureName: string): string {
    const module = featureName.split('.')[0]
    const coreModules = ['dashboard', 'sales', 'inventory', 'customers', 'reports', 'settings']
    const advancedModules = ['suppliers', 'receivables', 'payables', 'expenses', 'multi_branch', 'audit', 'rentals', 'hr', 'service', 'accounting']
    const integrationModules = ['communication', 'integrations']
    if (coreModules.includes(module)) return 'core'
    if (advancedModules.includes(module)) return 'advanced'
    if (integrationModules.includes(module)) return 'integration'
    return 'other'
  }

  // Check if user can access feature
  canAccessFeature(featureName: string, userRole?: string): boolean {
    // SaaS Admin can access everything
    if (userRole === 'saas_admin' || userRole === 'SaaS Admin') return true

    // Check if feature is enabled
    if (!this.isFeatureEnabled(featureName)) return false

    // Role-based restrictions
    const featureRoleRestrictions: Record<string, string[]> = {
      credit: ['owner', 'manager', 'accountant'],
      payables: ['owner', 'manager', 'accountant'],
      receivables: ['owner', 'manager', 'accountant'],
      suppliers: ['owner', 'manager', 'accountant'],
      expenses: ['owner', 'manager', 'accountant'],
      cash_flow: ['owner', 'manager', 'accountant'],
      advanced_reports: ['owner', 'accountant'],
      multi_branch: ['owner'],
      staff: ['owner', 'manager'],
      audit: ['owner', 'manager', 'accountant'],
      sms: ['owner'],
      whatsapp: ['owner'],
      offline_mode: ['owner', 'manager', 'accountant', 'attendant']
    }

    const allowedRoles = featureRoleRestrictions[featureName]
    if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
      return false
    }

    return true
  }

  // Get all features by category
  getFeaturesByCategory(category: string): Feature[] {
    return Object.entries(this.features)
      .filter(([name, _]) => this.getFeatureCategory(name) === category)
      .map(([name, access]) => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
        category: this.getFeatureCategory(name),
        enabled: access.enabled,
        source: access.source
      }))
  }

  // Check usage limits
  checkUsageLimit(type: keyof UsageLimits, current: number): boolean {
    if (!this.usageLimits) return true
    return current <= this.usageLimits[type]
  }

  // Get usage limit
  getUsageLimit(type: keyof UsageLimits): number {
    return this.usageLimits?.[type] || 0
  }

  // Get normalized feature access map
  getFeatureAccess(): FeatureAccess {
    return this.features
  }

  // Get all usage limits
  getUsageLimits(): UsageLimits | null {
    return this.usageLimits
  }

  // Get loading state
  isLoading(): boolean {
    return this.loading
  }

  // Get error
  getError(): string | null {
    return this.error
  }

  // Clear error
  clearError() {
    this.error = null
    this.notifyListeners()
  }

  // Reset service
  reset() {
    this.features = {}
    this.usageLimits = null
    this.loading = false
    this.error = null
    this.notifyListeners()
  }
}

// Export singleton instance
export const featureAccessService = FeatureAccessService.getInstance()

// Hook for using feature access
export function useFeatureAccess() {
  const { user } = useJWTAuth()
  const [features, setFeatures] = useState<FeatureAccess>({})
  const [usageLimits, setUsageLimits] = useState<UsageLimits | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Subscribe to feature service changes
    const unsubscribe = featureAccessService.subscribe(() => {
      setFeatures({ ...featureAccessService.getFeatureAccess() })
      setUsageLimits(featureAccessService.getUsageLimits())
      setLoading(featureAccessService.isLoading())
      setError(featureAccessService.getError())
    })

    // Initial load
    if (user?.tenantId) {
      featureAccessService.loadFeatures(user.tenantId)
    }

    return unsubscribe
  }, [user?.tenantId])

  const isFeatureEnabled = (featureName: string) => {
    return featureAccessService.isFeatureEnabled(featureName)
  }

  const hasFeature = (featureName: string) => {
    return featureAccessService.hasFeature(featureName)
  }

  const canAccessFeature = (featureName: string) => {
    return featureAccessService.canAccessFeature(featureName, user?.role)
  }

  const getFeature = (featureName: string) => {
    return featureAccessService.getFeature(featureName)
  }

  const getFeaturesByCategory = (category: string) => {
    return featureAccessService.getFeaturesByCategory(category)
  }

  const checkUsageLimit = (type: keyof UsageLimits, current: number) => {
    return featureAccessService.checkUsageLimit(type, current)
  }

  const getUsageLimit = (type: keyof UsageLimits) => {
    return featureAccessService.getUsageLimit(type)
  }

  const clearError = () => {
    featureAccessService.clearError()
  }

  return {
    features,
    usageLimits,
    loading,
    error,
    isFeatureEnabled,
    hasFeature,
    canAccessFeature,
    getFeature,
    getFeaturesByCategory,
    checkUsageLimit,
    getUsageLimit,
    clearError
  }
}
