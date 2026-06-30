import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { featureAccessService } from '@/services/featureAccessService'

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
  apiEndpoint = '/api/auth',
  tokenStorageKey = 'auth_tokens',
  userStorageKey = 'auth_user',
  onLogin,
  onLogout,
  onTokenRefresh,
  autoRefresh = true,
  refreshThreshold = 300, // 5 minutes before expiry
}) => {
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

  const isAuthenticated = !!user && !!tokens

  const persistAuth = (newUser: User | null, newTokens: AuthTokens | null) => {
    if (typeof window !== 'undefined') {
      if (newUser && newTokens) {
        localStorage.setItem(userStorageKey, JSON.stringify(newUser))
        localStorage.setItem(tokenStorageKey, JSON.stringify(newTokens))
      } else {
        localStorage.removeItem(userStorageKey)
        localStorage.removeItem(tokenStorageKey)
      }
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiEndpoint}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
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
      // Reset feature access service on login so stale features from previous session don't persist
      featureAccessService.reset()
      onLogin?.(userData, tokenData)
      return { user: userData, tokens: tokenData }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      throw err
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint, onLogin])

  const logout = useCallback(async () => {
    setLoading(true)

    try {
      if (tokens?.accessToken) {
        await fetch(`${apiEndpoint}/logout`, {
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
      setLoading(false)
      onLogout?.()
    }
  }, [apiEndpoint, tokens, onLogout])

  const register = useCallback(async (data: { email: string; password: string; name: string }) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiEndpoint}/register`, {
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
  }, [apiEndpoint, onLogin])

  const refreshTokens = useCallback(async () => {
    if (!tokens?.refreshToken) return

    try {
      const response = await fetch(`${apiEndpoint}/refresh`, {
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
      setTokens(data)
      persistAuth(user, data)
      onTokenRefresh?.(data)
    } catch {
      // Network error (offline, DNS failure, timeout, etc.) — keep cached session
      // The user can still use the app offline with their existing token
      console.log('[auth] Token refresh failed (network error) — keeping cached session for offline access')
    }
  }, [apiEndpoint, tokens, user, logout, onTokenRefresh])

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

  // Refresh user data from server on mount (syncs avatar, permissions, etc. across devices)
  useEffect(() => {
    if (!tokens?.accessToken || !user) return

    const refreshUser = async () => {
      try {
        const response = await fetch(`${apiEndpoint}/me`, {
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
