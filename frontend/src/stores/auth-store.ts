import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/api'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean

  // Actions
  setAuth: (user: User, token: string) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) => {
        // Also store in localStorage for API client
        localStorage.setItem('token', token)
        localStorage.setItem('user', JSON.stringify(user))
        set({ user, token, isAuthenticated: true })
      },

      logout: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        set({ user: null, token: null, isAuthenticated: false })
      },

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Permission helpers
export function hasRole(user: User | null, roles: string[]): boolean {
  if (!user) return false
  return roles.includes(user.role)
}

export function isSaaSAdmin(user: User | null): boolean {
  return user?.role === 'saas_admin'
}

export function isOwner(user: User | null): boolean {
  return user?.role === 'owner'
}

export function canViewReports(user: User | null): boolean {
  return hasRole(user, ['saas_admin', 'owner', 'accountant'])
}

export function canManageSales(user: User | null): boolean {
  return hasRole(user, ['saas_admin', 'owner', 'manager', 'attendant'])
}

export function canManageInventory(user: User | null): boolean {
  return hasRole(user, ['saas_admin', 'owner', 'manager', 'accountant'])
}

export function canManagePurchases(user: User | null): boolean {
  return hasRole(user, ['saas_admin', 'owner', 'manager', 'accountant'])
}
