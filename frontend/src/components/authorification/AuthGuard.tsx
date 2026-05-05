import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { CustomLoader } from '@/components/ui/CustomLoader'

export interface AuthGuardProps {
  /** Children to render if authenticated */
  children: React.ReactNode
  /** Required roles for access */
  roles?: string[]
  /** Required permissions for access */
  permissions?: string[]
  /** Redirect path if not authenticated */
  redirectTo?: string
  /** Whether to show loading state */
  showLoading?: boolean
  /** Custom loading component */
  loadingComponent?: React.ReactNode
  /** Custom unauthorized component */
  unauthorizedComponent?: React.ReactNode
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  roles,
  permissions,
  redirectTo = '/login',
  showLoading = true,
  loadingComponent,
  unauthorizedComponent,
}) => {
  const location = useLocation()
  const { user, isLoading, isAuthenticated, hasRole, hasPermission } = useAuth()

  // Show loading state
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>
    }
    if (showLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <CustomLoader size="lg" text="Loading..." />
        </div>
      )
    }
    return null
  }

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />
  }

  // Check roles
  if (roles && roles.length > 0) {
    const hasRequiredRole = roles.some((role) => hasRole(role))
    if (!hasRequiredRole) {
      if (unauthorizedComponent) {
        return <>{unauthorizedComponent}</>
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      )
    }
  }

  // Check permissions
  if (permissions && permissions.length > 0) {
    const hasRequiredPermission = permissions.some((permission) => hasPermission(permission))
    if (!hasRequiredPermission) {
      if (unauthorizedComponent) {
        return <>{unauthorizedComponent}</>
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      )
    }
  }

  return <>{children}</>
}

export default AuthGuard
