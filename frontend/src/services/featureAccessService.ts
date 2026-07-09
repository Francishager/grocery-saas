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
  private loadedTenantId: string | null = null
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
    // Skip if already loaded for this tenant and not in error state
    if (this.loadedTenantId === tenantId && !this.error && Object.keys(this.features).length > 0) return
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
      this.loadedTenantId = tenantId

      // Cache features in localStorage for offline access
      localStorage.setItem('cachedFeatures', JSON.stringify(this.features))
      
      // Load usage limits
      await this.loadUsageLimits(tenantId)
      
    } catch (error) {
      console.error('Failed to load features:', error)
      // On network failure, try cached features as fallback
      const cached = localStorage.getItem('cachedFeatures')
      if (cached) {
        try { this.features = JSON.parse(cached) } catch {}
      }
      this.loadedTenantId = null
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
        // Cache for offline use
        if (this.usageLimits) {
          localStorage.setItem('cachedUsageLimits', JSON.stringify(this.usageLimits))
        }
      }
    } catch (error) {
      console.error('Failed to load usage limits:', error)
      // Try cached limits
      const cached = localStorage.getItem('cachedUsageLimits')
      if (cached) {
        try { this.usageLimits = JSON.parse(cached) } catch {}
      }
    }
  }

  // Check if feature is enabled (primary API)
  // Returns true if the feature is explicitly enabled.
  // Returns false if the feature is explicitly disabled.
  // If a child feature is requested and the parent module is enabled,
  // that child is treated as accessible as part of the parent module.
  isFeatureEnabled(featureName: string): boolean {
    // Try the exact feature name first
    const entry = this.features[featureName]
    if (entry !== undefined) return entry.enabled === true

    // Try common aliases (underscore <-> hyphen) and module fallbacks
    const aliases = this.generateFeatureAliases(featureName)
    for (const alias of aliases) {
      const e = this.features[alias]
      if (e !== undefined) return e.enabled === true
    }

    // Check parent modules (feature.module -> module enabled)
    const parts = featureName.split('.')
    for (let index = parts.length - 1; index > 0; index -= 1) {
      const parentName = parts.slice(0, index).join('.')
      const parentEntry = this.features[parentName]
      if (parentEntry?.enabled) return true
      // try alias of parent
      const parentAliases = this.generateFeatureAliases(parentName)
      if (parentAliases.some((a) => this.features[a]?.enabled)) return true
    }

    // If the requested feature is a module (no dot) allow access when any child feature is enabled.
    // Example: request 'service' -> allow if 'service.car_wash' or 'service.garage' is enabled.
    if (!featureName.includes('.')) {
      const prefix = `${featureName}.`
      for (const [name, access] of Object.entries(this.features)) {
        if (name.startsWith(prefix) && access.enabled) return true
        // also try alias variants of children
        const childAliases = this.generateFeatureAliases(name)
        if (childAliases.some((a) => a.startsWith(prefix) && this.features[a]?.enabled)) return true
      }
    }

    return false
  }

  // Generate common alias permutations for a feature name
  private generateFeatureAliases(featureName: string): string[] {
    const aliases = new Set<string>()
    aliases.add(featureName)

    // underscore <-> hyphen variants
    aliases.add(featureName.replace(/_/g, '-'))
    aliases.add(featureName.replace(/-/g, '_'))

    // module name fallbacks: service <-> fuel_station
    const parts = featureName.split('.')
    if (parts.length > 0) {
      const module = parts[0]
      const rest = parts.slice(1).join('.')
      if (module === 'service') {
        const alt = ['fuel_station', 'fuel-station']
        alt.forEach((m) => aliases.add(rest ? `${m}.${rest}` : m))
      }
      if (module === 'fuel_station' || module === 'fuel-station') {
        const alt = ['service']
        alt.forEach((m) => aliases.add(rest ? `${m}.${rest}` : m))
      }
    }

    return Array.from(aliases)
  }

  // Check any of the provided feature names for availability
  isAnyFeatureEnabled(featureNames: string[] | string): boolean {
    const names = Array.isArray(featureNames) ? featureNames : [featureNames]
    for (const name of names) {
      if (this.isFeatureEnabled(name)) return true
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
    const advancedModules = ['suppliers', 'receivables', 'payables', 'expenses', 'multi_branch', 'audit', 'rentals', 'hr', 'service', 'accounting', 'restaurant', 'fuel_station', 'manufacturing', 'agriculture', 'production', 'assets', 'developer']
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

    // While features are still loading, allow access (don't block the UI)
    if (this.loading) return true

    // Pure plan-based gating: if the feature is enabled for this tenant
    // (plan + tenant overrides), it is accessible here. Fine-grained user
    // access is controlled via permissions, not hard-coded role lists.
    return this.isFeatureEnabled(featureName)
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
    this.loadedTenantId = null
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

    // Load features if we have a tenant — always reload on user/tenant change
    if (user?.tenantId) {
      if (!featureAccessService.isLoading()) {
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

  const hasAnyFeature = (featureNames: string[] | string) => {
    return featureAccessService.isAnyFeatureEnabled(featureNames)
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
    hasAnyFeature,
    canAccessFeature,
    getFeature,
    getFeaturesByCategory,
    checkUsageLimit,
    getUsageLimit,
    clearError
  }
}
