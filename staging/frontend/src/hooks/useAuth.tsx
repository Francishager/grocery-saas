import { useJWTAuth, User, AuthTokens } from '@/contexts/JWTAuthContext'

export interface UseAuthReturn {
  user: User | null
  tokens: AuthTokens | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (data: { email: string; password: string; name: string }) => Promise<void>
  refreshTokens: () => Promise<void>
  updateUser: (updates: Partial<User>) => void
  hasPermission: (permission: string) => boolean
  hasRole: (role: string) => boolean
  clearError: () => void
  isAdmin: boolean
  isOwner: boolean
  isAccountant: boolean
  isAttendant: boolean
}

/**
 * Hook for authentication state and actions
 */
export const useAuth = (): UseAuthReturn => {
  const {
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
    clearError,
  } = useJWTAuth()

  // Role shortcuts
  const isAdmin = hasRole('saas_admin') || hasRole('admin')
  const isOwner = hasRole('owner')
  const isAccountant = hasRole('accountant')
  const isAttendant = hasRole('attendant')

  return {
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
    clearError,
    isAdmin,
    isOwner,
    isAccountant,
    isAttendant,
  }
}

export default useAuth
