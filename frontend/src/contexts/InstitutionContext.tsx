import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'

export interface Institution {
  id: string
  name: string
  code: string
  type: 'business' | 'organization' | 'institution'
  logo?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  currency: string
  timezone: string
  locale: string
  settings: InstitutionSettings
  features: string[]
  subscription?: {
    plan: string
    status: 'active' | 'inactive' | 'trial' | 'expired'
    expiresAt?: string
    features: string[]
  }
}

export interface InstitutionSettings {
  taxRate: number
  taxEnabled: boolean
  receiptFooter?: string
  lowStockThreshold: number
  enableInventory: boolean
  enableSales: boolean
  enablePurchases: boolean
  enableReports: boolean
  enableMultiBranch: boolean
  maxUsers: number
  maxBranches: number
}

export interface InstitutionContextValue {
  /** Current institution */
  institution: Institution | null
  /** Loading state */
  loading: boolean
  /** Error state */
  error: string | null
  /** Set institution */
  setInstitution: (institution: Institution | null) => void
  /** Update institution */
  updateInstitution: (updates: Partial<Institution>) => void
  /** Update institution settings */
  updateSettings: (settings: Partial<InstitutionSettings>) => void
  /** Clear institution */
  clearInstitution: () => void
  /** Fetch institution by ID */
  fetchInstitution: (id: string) => Promise<void>
  /** Check if feature is enabled */
  hasFeature: (feature: string) => boolean
  /** Check if subscription is active */
  isSubscriptionActive: () => boolean
  /** Get setting value */
  getSetting: <K extends keyof InstitutionSettings>(key: K) => InstitutionSettings[K]
}

const InstitutionContext = createContext<InstitutionContextValue | undefined>(undefined)

export interface InstitutionProviderProps {
  children: ReactNode
  /** Initial institution */
  initialInstitution?: Institution | null
  /** API endpoint for fetching institution */
  apiEndpoint?: string
  /** Storage key for persisting institution */
  storageKey?: string
  /** Callback when institution changes */
  onInstitutionChange?: (institution: Institution | null) => void
}

export const InstitutionProvider: React.FC<InstitutionProviderProps> = ({
  children,
  initialInstitution = null,
  apiEndpoint,
  storageKey = 'institution',
  onInstitutionChange,
}) => {
  const [institution, setInstitutionState] = useState<Institution | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch {
          // Ignore parse errors
        }
      }
    }
    return initialInstitution
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setInstitution = useCallback((newInstitution: Institution | null) => {
    setInstitutionState(newInstitution)
    if (typeof window !== 'undefined') {
      if (newInstitution) {
        localStorage.setItem(storageKey, JSON.stringify(newInstitution))
      } else {
        localStorage.removeItem(storageKey)
      }
    }
    onInstitutionChange?.(newInstitution)
  }, [storageKey, onInstitutionChange])

  const updateInstitution = useCallback((updates: Partial<Institution>) => {
    setInstitutionState((prev) => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(updated))
      }
      onInstitutionChange?.(updated)
      return updated
    })
  }, [storageKey, onInstitutionChange])

  const updateSettings = useCallback((settings: Partial<InstitutionSettings>) => {
    setInstitutionState((prev) => {
      if (!prev) return prev
      const updated = { ...prev, settings: { ...prev.settings, ...settings } }
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(updated))
      }
      onInstitutionChange?.(updated)
      return updated
    })
  }, [storageKey, onInstitutionChange])

  const clearInstitution = useCallback(() => {
    setInstitutionState(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey)
    }
    onInstitutionChange?.(null)
  }, [storageKey, onInstitutionChange])

  const fetchInstitution = useCallback(async (id: string) => {
    if (!apiEndpoint) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiEndpoint}/${id}`)
      if (!response.ok) throw new Error('Failed to fetch institution')
      const data = await response.json()
      setInstitution(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch institution')
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint, setInstitution])

  const hasFeature = useCallback((feature: string): boolean => {
    if (!institution) return false
    const features = institution.features || []
    const subFeatures = institution.subscription?.features || []
    return features.includes(feature) || subFeatures.includes(feature)
  }, [institution])

  const isSubscriptionActive = useCallback((): boolean => {
    if (!institution?.subscription) return false
    const { status, expiresAt } = institution.subscription
    if (status === 'active' || status === 'trial') {
      if (expiresAt) {
        return new Date(expiresAt) > new Date()
      }
      return true
    }
    return false
  }, [institution])

  const getSetting = useCallback(<K extends keyof InstitutionSettings>(key: K): InstitutionSettings[K] => {
    return institution?.settings[key] as InstitutionSettings[K]
  }, [institution])

  const value: InstitutionContextValue = {
    institution,
    loading,
    error,
    setInstitution,
    updateInstitution,
    updateSettings,
    clearInstitution,
    fetchInstitution,
    hasFeature,
    isSubscriptionActive,
    getSetting,
  }

  return (
    <InstitutionContext.Provider value={value}>
      {children}
    </InstitutionContext.Provider>
  )
}

export const useInstitutionContext = (): InstitutionContextValue => {
  const context = useContext(InstitutionContext)
  if (!context) {
    throw new Error('useInstitutionContext must be used within an InstitutionProvider')
  }
  return context
}

export default InstitutionContext
