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

// Legacy aliases removed — features are now controlled granularly via PlanFeature and TenantFeature tables.

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
    // Prevent concurrent loads — if already loading, skip
    if (this.loading) return

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
    return this.features[featureName]?.enabled === true
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

  // Force reload — clears cache and reloads (use after plan changes)
  async forceReload(tenantId?: string) {
    this.features = {}
    this.loading = false // reset so loadFeatures doesn't skip
    return this.loadFeatures(tenantId)
  }
}

// Export singleton instance
export const featureAccessService = FeatureAccessService.getInstance()

// Hook for using feature access
export function useFeatureAccess() {
  const { user } = useJWTAuth()
  const [features, setFeatures] = useState<FeatureAccess>({})
  const [usageLimits, setUsageLimits] = useState<UsageLimits | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Subscribe to feature service changes
    const syncState = () => {
      setFeatures({ ...featureAccessService.getFeatureAccess() })
      setUsageLimits(featureAccessService.getUsageLimits())
      setLoading(featureAccessService.isLoading())
      setError(featureAccessService.getError())
    }
    const unsubscribe = featureAccessService.subscribe(syncState)

    // Sync immediately in case the service already has data
    syncState()

    // Load features if we have a tenant and haven't loaded yet
    if (user?.tenantId) {
      if (!featureAccessService.isLoading() && Object.keys(featureAccessService.getFeatureAccess()).length === 0) {
        featureAccessService.loadFeatures(user.tenantId)
      }
    } else {
      // No tenantId — not loading
      setLoading(false)
    }

    return unsubscribe
  }, [user?.tenantId, user?.id])

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
