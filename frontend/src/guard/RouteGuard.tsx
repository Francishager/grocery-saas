import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

export interface RouteGuardProps {
  /** Children to render if access is granted */
  children: React.ReactNode
  /** Required permission to access route */
  permission?: string
  /** Required role to access route */
  role?: string
  /** Multiple permissions (any match) */
  permissions?: string[]
  /** Multiple roles (any match) */
  roles?: string[]
  /** Whether all permissions/roles must match */
  requireAll?: boolean
  /** Redirect path if not authenticated */
  loginPath?: string
  /** Redirect path if not authorized */
  unauthorizedPath?: string
  /** Custom unauthorized component */
  unauthorizedComponent?: React.ReactNode
  /** Custom loading component */
  loadingComponent?: React.ReactNode
  /** Whether to check institution access */
  checkInstitution?: boolean
  /** Whether to check branch access */
  checkBranch?: boolean
}

/**
 * Route guard component that protects routes based on authentication and authorization
 */
export const RouteGuard: React.FC<RouteGuardProps> = ({
  children,
  permission,
  role,
  permissions,
  roles,
  requireAll = false,
  loginPath = '/login',
  unauthorizedPath = '/unauthorized',
  unauthorizedComponent,
  loadingComponent,
  checkInstitution = false,
  checkBranch = false,
}) => {
  const { isAuthenticated, loading, hasPermission, hasRole, user } = useJWTAuth()
  const location = useLocation()

  // Show loading state
  if (loading) {
    return loadingComponent ? <>{loadingComponent}</> : <div>Loading...</div>
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  // Check institution access
  if (checkInstitution && !user?.institutionId) {
    return unauthorizedComponent ? (
      <>{unauthorizedComponent}</>
    ) : (
      <Navigate to={unauthorizedPath} replace />
    )
  }

  // Check branch access
  if (checkBranch && !user?.branchId) {
    return unauthorizedComponent ? (
      <>{unauthorizedComponent}</>
    ) : (
      <Navigate to={unauthorizedPath} replace />
    )
  }

  // Check single permission
  if (permission && !hasPermission(permission)) {
    return unauthorizedComponent ? (
      <>{unauthorizedComponent}</>
    ) : (
      <Navigate to={unauthorizedPath} replace />
    )
  }

  // Check single role
  if (role && !hasRole(role)) {
    return unauthorizedComponent ? (
      <>{unauthorizedComponent}</>
    ) : (
      <Navigate to={unauthorizedPath} replace />
    )
  }

  // Check multiple permissions
  if (permissions && permissions.length > 0) {
    let hasAccess = false
    if (requireAll) {
      hasAccess = permissions.every((p) => hasPermission(p))
    } else {
      hasAccess = permissions.some((p) => hasPermission(p))
    }
    if (!hasAccess) {
      return unauthorizedComponent ? (
        <>{unauthorizedComponent}</>
      ) : (
        <Navigate to={unauthorizedPath} replace />
      )
    }
  }

  // Check multiple roles
  if (roles && roles.length > 0) {
    let hasAccess = false
    if (requireAll) {
      hasAccess = roles.every((r) => hasRole(r))
    } else {
      hasAccess = roles.some((r) => hasRole(r))
    }
    if (!hasAccess) {
      return unauthorizedComponent ? (
        <>{unauthorizedComponent}</>
      ) : (
        <Navigate to={unauthorizedPath} replace />
      )
    }
  }

  // All checks passed - render children
  return <>{children}</>
}

export default RouteGuard
