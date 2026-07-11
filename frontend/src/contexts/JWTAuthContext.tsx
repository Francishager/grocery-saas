import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { featureAccessService } from '@/services/featureAccessService'
import { clearTenantData } from '@/db/index'
import { getApiAuthEndpoint } from '@/lib/apiConfig'

export interface User {
  id: string
  email: string
  name: string
  fname?: string
  lname?: string
  phone?: string
  role: string
  permissions: string[]
  avatar?: string
  institutionId?: string
  branchId?: string
  preferences?: Record<string, any>
  /** Whether this user is a platform-level user (SaaS Admin) */
  isPlatformUser?: boolean
  /** Tenant ID for business users */
  tenantId?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
}

export interface LoginResult {
  user?: User
  tokens?: AuthTokens
  forceReset?: boolean
  email?: string
  message?: string
}

export interface JWTAuthContextValue {
  /** Current user */
  user: User | null
  /** Authentication tokens */
  tokens: AuthTokens | null
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Loading state */
  loading: boolean
  /** Error state */
  error: string | null
  /** Login */
  login: (email: string, password: string) => Promise<LoginResult>
  /** Logout */
  logout: () => Promise<void>
  /** Register */
  register: (data: { email: string; password: string; name: string }) => Promise<void>
  /** Refresh tokens */
  refreshTokens: () => Promise<void>
  /** Update user */
  updateUser: (updates: Partial<User>) => void
  /** Check if user has permission */
  hasPermission: (permission: string) => boolean
  /** Check if user has role */
  hasRole: (role: string) => boolean
  /** Check if user is SaaS Admin (platform user) */
  isPlatformUser: () => boolean
  /** Check if user can access business data */
  canAccessBusinessData: () => boolean
  /** Clear error */
  clearError: () => void
  /** Set tokens manually */
  setTokens: (tokens: AuthTokens) => void
  /** Onboarding status */
  hasCompletedOnboarding: boolean
  /** Refresh onboarding status from backend */
  refreshOnboardingStatus: () => Promise<void>
}

const JWTAuthContext = createContext<JWTAuthContextValue | undefined>(undefined)

export interface JWTAuthProviderProps {
  children: ReactNode
  /** API endpoint for authentication */
  apiEndpoint?: string
  /** Storage key for tokens */
  tokenStorageKey?: string
  /** Storage key for user */
  userStorageKey?: string
  /** Callback when user logs in */
  onLogin?: (user: User, tokens: AuthTokens) => void
  /** Callback when user logs out */
  onLogout?: () => void
  /** Callback when tokens are refreshed */
  onTokenRefresh?: (tokens: AuthTokens) => void
  /** Auto refresh tokens before expiry */
  autoRefresh?: boolean
  /** Refresh threshold in seconds before expiry */
  refreshThreshold?: number
}

export const JWTAuthProvider: React.FC<JWTAuthProviderProps> = ({
  children,
  apiEndpoint,
  tokenStorageKey = 'auth_tokens',
  userStorageKey = 'auth_user',
  onLogin,
  onLogout,
  onTokenRefresh,
  autoRefresh = true,
  refreshThreshold = 300, // 5 minutes before expiry
}) => {
  const resolvedApiEndpoint = apiEndpoint || getApiAuthEndpoint()
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(userStorageKey)
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch {
          // Ignore parse errors
        }
      }
    }
    return null
  })

  const [tokens, setTokens] = useState<AuthTokens | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(tokenStorageKey)
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch {
          // Ignore parse errors
        }
      }
    }
    return null
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false)

  const isAuthenticated = !!user && !!tokens

  const offlineCacheKey = 'offline_auth_cache'

  const refreshOnboardingStatus = useCallback(async () => {
    if (!tokens?.accessToken) {
      setHasCompletedOnboarding(false)
      return
    }

    try {
      const response = await fetch(`${resolvedApiEndpoint.replace(/\/api\/auth$/, '')}/api/onboarding/status`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (response.ok) {
        const data = await response.json()
        setHasCompletedOnboarding(Boolean(data?.completed))
      }
    } catch {
      setHasCompletedOnboarding(false)
    }
  }, [resolvedApiEndpoint, tokens?.accessToken])

  const persistAuth = (newUser: User | null, newTokens: AuthTokens | null) => {
    if (typeof window !== 'undefined') {
      if (newUser && newTokens) {
        localStorage.setItem(userStorageKey, JSON.stringify(newUser))
        localStorage.setItem(tokenStorageKey, JSON.stringify(newTokens))
        // Also persist to offline cache — survives logout so user can log in offline later
        localStorage.setItem(offlineCacheKey, JSON.stringify({
          email: newUser.email,
          user: newUser,
          tokens: newTokens,
          savedAt: new Date().toISOString(),
        }))
      } else {
        localStorage.removeItem(userStorageKey)
        localStorage.removeItem(tokenStorageKey)
        // NOTE: do NOT remove offlineCacheKey here — it persists for offline login
      }
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${resolvedApiEndpoint}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Login failed')
      }

      const data = await response.json()

      // Handle force-reset response from backend
      if (data.forceReset) {
        return data
      }

      const { user: userData, tokens: tokenData } = data

      setUser(userData)
      setTokens(tokenData)
      persistAuth(userData, tokenData)
      await refreshOnboardingStatus()
      // Reset feature access service on login so stale features from previous session don't persist
      featureAccessService.reset()
      onLogin?.(userData, tokenData)
      return { user: userData, tokens: tokenData }
    } catch (err) {
      // Network error — try offline login with cached credentials
      // Covers: Chrome "Failed to fetch", Firefox "NetworkError", Safari "Load failed",
      //         AbortError (timeout), ERR_CONNECTION_TIMED_OUT
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && /fetch|network|load|connect|offline|abort|timeout/i.test(err.message)) ||
        !navigator.onLine

      if (isNetworkError) {
        // Check offline cache first (survives logout), then fall back to active session keys
        const offlineCacheStr = localStorage.getItem(offlineCacheKey)
        const cachedUserStr = localStorage.getItem(userStorageKey)
        const cachedTokensStr = localStorage.getItem(tokenStorageKey)
        // Silent — checking cached credentials for offline login

        // Try offline cache (persists even after logout)
        if (offlineCacheStr) {
          try {
            const cache = JSON.parse(offlineCacheStr)
            const cachedUser = cache.user
            const cachedTokens = cache.tokens
            // Silent
            if (cachedUser?.email?.toLowerCase() === email.toLowerCase()) {
              setUser(cachedUser)
              setTokens(cachedTokens)
              persistAuth(cachedUser, cachedTokens)
              // Silent
              return { user: cachedUser, tokens: cachedTokens }
            }
          } catch {
            // Ignore parse errors
          }
        }

        // Fall back to active session keys (in case logout didn't clear them)
        if (cachedUserStr && cachedTokensStr) {
          try {
            const cachedUser = JSON.parse(cachedUserStr)
            const cachedTokens = JSON.parse(cachedTokensStr)
            // Silent
            if (cachedUser.email?.toLowerCase() === email.toLowerCase()) {
              setUser(cachedUser)
              setTokens(cachedTokens)
              persistAuth(cachedUser, cachedTokens)
              // Silent
              return { user: cachedUser, tokens: cachedTokens }
            }
          } catch {
            // Ignore parse errors
          }
        }
        throw new Error('Unable to reach the server. Check your connection or try again later. If you have logged in before on this device, use the same email to sign in offline.')
      }
      setError(err instanceof Error ? err.message : 'Login failed')
      throw err
    } finally {
      setLoading(false)
    }
  }, [resolvedApiEndpoint, onLogin, tokenStorageKey, userStorageKey, refreshOnboardingStatus])

  const logout = useCallback(async () => {
    setLoading(true)

    try {
      if (tokens?.accessToken) {
        await fetch(`${resolvedApiEndpoint}/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        })
      }
    } catch {
      // Ignore logout API errors
    } finally {
      setUser(null)
      setTokens(null)
      persistAuth(null, null)
      // Reset feature access service on logout
      featureAccessService.reset()
      // Clear IndexedDB to prevent cross-tenant data leakage
      clearTenantData().catch(() => {})
      setLoading(false)
      onLogout?.()
    }
  }, [resolvedApiEndpoint, tokens, onLogout])

  const register = useCallback(async (data: { email: string; password: string; name: string }) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${resolvedApiEndpoint}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const resData = await response.json()
        throw new Error(resData.message || 'Registration failed')
      }

      const resData = await response.json()
      const { user: userData, tokens: tokenData } = resData

      setUser(userData)
      setTokens(tokenData)
      persistAuth(userData, tokenData)
      onLogin?.(userData, tokenData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
      throw err
    } finally {
      setLoading(false)
    }
  }, [resolvedApiEndpoint, onLogin])

  const refreshTokens = useCallback(async () => {
    if (!tokens?.refreshToken) return

    try {
      const response = await fetch(`${resolvedApiEndpoint}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      })

      if (!response.ok) {
        // 401/403 means the refresh token is actually invalid/expired — logout
        if (response.status === 401 || response.status === 403) {
          logout()
        }
        // Other status codes (5xx, etc.) — server issue, keep cached session
        return
      }

      const data = await response.json()
      // /refresh returns { user, tokens } — update both
      if (data.tokens) {
        setTokens(data.tokens)
        if (data.user) {
          setUser(data.user)
          persistAuth(data.user, data.tokens)
        } else {
          persistAuth(user, data.tokens)
        }
        onTokenRefresh?.(data.tokens)
      }
    } catch {
      // Network error (offline, DNS failure, timeout, etc.) — keep cached session
      // The user can still use the app offline with their existing token
      // Silent
    }
  }, [resolvedApiEndpoint, tokens, user, logout, onTokenRefresh])

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      persistAuth(updated, tokens)
      return updated
    })
  }, [tokens])

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false
    if (user.role === 'owner' || user.role === 'saas_admin') return true
    const perms = user.permissions || []
    return perms.includes(permission) || perms.includes('*')
  }, [user])

  const hasRole = useCallback((role: string): boolean => {
    if (!user) return false
    return user.role === role
  }, [user])

  const isPlatformUser = useCallback((): boolean => {
    if (!user) return false
    return user.isPlatformUser === true || user.role === 'saas_admin'
  }, [user])

  const canAccessBusinessData = useCallback((): boolean => {
    if (!user) return false
    // Platform users (SaaS Admin) cannot access business data
    if (isPlatformUser()) return false
    // Business users: must have a tenant ID or a business role
    return !!user.tenantId || !!user.institutionId || ['owner', 'manager', 'accountant', 'attendant'].includes(user.role)
  }, [user, isPlatformUser])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const setTokensManually = useCallback((newTokens: AuthTokens) => {
    setTokens(newTokens)
    persistAuth(user, newTokens)
  }, [user])

  // Check if access token is expired on mount and refresh if needed
  useEffect(() => {
    if (!tokens?.accessToken || !tokens?.refreshToken) return
    try {
      const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]))
      if (payload.exp * 1000 < Date.now()) {
        refreshTokens()
      }
    } catch {
      refreshTokens()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh user data from server on mount (syncs avatar, permissions, etc. across devices)
  useEffect(() => {
    if (!tokens?.accessToken || !user) return

    const refreshUser = async () => {
      try {
        const response = await fetch(`${resolvedApiEndpoint}/me`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        if (response.ok) {
          const data = await response.json()
          if (data.user) {
            setUser(data.user)
            persistAuth(data.user, tokens)
          }
        }
      } catch {
        // Silently ignore - stale localStorage data is still usable
      }
    }

    refreshUser()
    refreshOnboardingStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount

  // Auto refresh tokens before expiry
  useEffect(() => {
    if (!autoRefresh || !tokens) return

    const expiresIn = tokens.expiresIn * 1000 // Convert to milliseconds
    const refreshTime = expiresIn - refreshThreshold * 1000

    const timeoutId = setTimeout(() => {
      refreshTokens()
    }, refreshTime)

    return () => clearTimeout(timeoutId)
  }, [autoRefresh, tokens, refreshThreshold, refreshTokens])

  const value: JWTAuthContextValue = {
    user,
    tokens,
    isAuthenticated,
    loading,
    error,
    login,
    logout,
    register,
    refreshTokens,
    updateUser,
    hasPermission,
    hasRole,
    isPlatformUser,
    canAccessBusinessData,
    clearError,
    setTokens: setTokensManually,
    hasCompletedOnboarding,
    refreshOnboardingStatus,
  }

  return (
    <JWTAuthContext.Provider value={value}>
      {children}
    </JWTAuthContext.Provider>
  )
}

export const useJWTAuth = (): JWTAuthContextValue => {
  const context = useContext(JWTAuthContext)
  if (!context) {
    throw new Error('useJWTAuth must be used within a JWTAuthProvider')
  }
  return context
}

export default JWTAuthContext
