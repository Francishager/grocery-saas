import React from 'react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

export interface IsGrantedProps {
  /** Permission to check */
  permission?: string
  /** Role to check */
  role?: string
  /** Multiple permissions (any match) */
  permissions?: string[]
  /** Multiple roles (any match) */
  roles?: string[]
  /** Whether all permissions/roles must match */
  requireAll?: boolean
  /** Children to render if granted */
  children: React.ReactNode
  /** Fallback content if not granted */
  fallback?: React.ReactNode
  /** Whether to invert the check (show if NOT granted) */
  invert?: boolean
}

/**
 * Component that conditionally renders children based on permissions/roles
 */
export const IsGranted: React.FC<IsGrantedProps> = ({
  permission,
  role,
  permissions,
  roles,
  requireAll = false,
  children,
  fallback = null,
  invert = false,
}) => {
  const { hasPermission, hasRole, isAuthenticated } = useJWTAuth()

  // Not authenticated - deny access
  if (!isAuthenticated) {
    return invert ? <>{children}</> : <>{fallback}</>
  }

  let granted = true

  // Check single permission
  if (permission) {
    granted = hasPermission(permission)
  }

  // Check single role
  if (granted && role) {
    granted = hasRole(role)
  }

  // Check multiple permissions
  if (granted && permissions && permissions.length > 0) {
    if (requireAll) {
      granted = permissions.every((p) => hasPermission(p))
    } else {
      granted = permissions.some((p) => hasPermission(p))
    }
  }

  // Check multiple roles
  if (granted && roles && roles.length > 0) {
    if (requireAll) {
      granted = roles.every((r) => hasRole(r))
    } else {
      granted = roles.some((r) => hasRole(r))
    }
  }

  // Invert if specified
  if (invert) {
    granted = !granted
  }

  return granted ? <>{children}</> : <>{fallback}</>
}

export default IsGranted
