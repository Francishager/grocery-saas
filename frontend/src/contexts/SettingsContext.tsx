import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'

export interface Settings {
  general: {
    language: string
    timezone: string
    dateFormat: string
    timeFormat: '12h' | '24h'
    currency: string
    numberFormat: string
  }
  appearance: {
    theme: 'light' | 'dark' | 'system'
    primaryColor: string
    fontSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    fontFamily: string
    borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
    density: 'compact' | 'comfortable' | 'spacious'
    sidebarCollapsed: boolean
    sidebarWidth: number
  }
  notifications: {
    enabled: boolean
    email: boolean
    push: boolean
    sound: boolean
    desktop: boolean
    quietHoursEnabled: boolean
    quietHoursStart: string
    quietHoursEnd: string
  }
  privacy: {
    shareUsageData: boolean
    shareAnalytics: boolean
    allowTracking: boolean
  }
  security: {
    twoFactorEnabled: boolean
    sessionTimeout: number
    passwordExpiryDays: number
    loginNotifications: boolean
  }
}

export interface SettingsContextValue {
  /** Current settings */
  settings: Settings
  /** Loading state */
  loading: boolean
  /** Error state */
  error: string | null
  /** Update settings */
  updateSettings: <K extends keyof Settings>(category: K, updates: Partial<Settings[K]>) => void
  /** Update single setting */
  setSetting: <K extends keyof Settings, SK extends keyof Settings[K]>(category: K, key: SK, value: Settings[K][SK]) => void
  /** Reset settings to defaults */
  resetSettings: () => void
  /** Reset specific category */
  resetCategory: <K extends keyof Settings>(category: K) => void
  /** Save settings to server */
  saveSettings: () => Promise<void>
  /** Load settings from server */
  loadSettings: () => Promise<void>
  /** Get setting value */
  getSetting: <K extends keyof Settings, SK extends keyof Settings[K]>(category: K, key: SK) => Settings[K][SK]
}

const defaultSettings: Settings = {
  general: {
    language: 'en',
    timezone: 'Africa/Kampala',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'UGX',
    numberFormat: '#,##0.00',
  },
  appearance: {
    theme: 'light',
    primaryColor: '#2563eb',
    fontSize: 'md',
    fontFamily: 'inter',
    borderRadius: 'md',
    density: 'comfortable',
    sidebarCollapsed: false,
    sidebarWidth: 260,
  },
  notifications: {
    enabled: true,
    email: true,
    push: true,
    sound: true,
    desktop: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  },
  privacy: {
    shareUsageData: false,
    shareAnalytics: false,
    allowTracking: false,
  },
  security: {
    twoFactorEnabled: false,
    sessionTimeout: 30,
    passwordExpiryDays: 90,
    loginNotifications: true,
  },
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined)

export interface SettingsProviderProps {
  children: ReactNode
  /** Initial settings overrides */
  initialSettings?: Partial<Settings>
  /** Storage key for persisting settings */
  storageKey?: string
  /** API endpoint for settings */
  apiEndpoint?: string
  /** Whether to persist to localStorage */
  persist?: boolean
  /** Callback when settings change */
  onSettingsChange?: (settings: Settings) => void
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({
  children,
  initialSettings,
  storageKey = 'app_settings',
  apiEndpoint,
  persist = true,
  onSettingsChange,
}) => {
  const getInitialSettings = (): Settings => {
    if (persist && typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          return { ...defaultSettings, ...JSON.parse(stored), ...initialSettings }
        } catch {
          // Ignore parse errors
        }
      }
    }
    return { ...defaultSettings, ...initialSettings }
  }

  const [settings, setSettings] = useState<Settings>(getInitialSettings)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist settings changes
  useEffect(() => {
    if (persist && typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(settings))
    }
    onSettingsChange?.(settings)
  }, [settings, storageKey, persist, onSettingsChange])

  const updateSettings = useCallback(<K extends keyof Settings>(category: K, updates: Partial<Settings[K]>) => {
    setSettings((prev) => ({
      ...prev,
      [category]: { ...prev[category], ...updates },
    }))
  }, [])

  const setSetting = useCallback(<K extends keyof Settings, SK extends keyof Settings[K]>(category: K, key: SK, value: Settings[K][SK]) => {
    setSettings((prev) => ({
      ...prev,
      [category]: { ...prev[category], [key]: value },
    }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings)
  }, [])

  const resetCategory = useCallback(<K extends keyof Settings>(category: K) => {
    setSettings((prev) => ({
      ...prev,
      [category]: defaultSettings[category],
    }))
  }, [])

  const saveSettings = useCallback(async () => {
    if (!apiEndpoint) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(apiEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!response.ok) throw new Error('Failed to save settings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
      throw err
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint, settings])

  const loadSettings = useCallback(async () => {
    if (!apiEndpoint) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(apiEndpoint)
      if (!response.ok) throw new Error('Failed to load settings')
      const data = await response.json()
      setSettings({ ...defaultSettings, ...data })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint])

  const getSetting = useCallback(<K extends keyof Settings, SK extends keyof Settings[K]>(category: K, key: SK): Settings[K][SK] => {
    return settings[category][key]
  }, [settings])

  const value: SettingsContextValue = {
    settings,
    loading,
    error,
    updateSettings,
    setSetting,
    resetSettings,
    resetCategory,
    saveSettings,
    loadSettings,
    getSetting,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

export default SettingsContext
