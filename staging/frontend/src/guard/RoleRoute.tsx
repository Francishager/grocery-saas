import React, { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

export interface RoleRouteProps {
  /** Child elements to render (when used inline) */
  children?: ReactNode
  /** Allowed roles for this route group */
  roles: string[]
  /** Login page to redirect unauthenticated users to */
  loginPath?: string
  /** Fallback element when access is denied */
  fallback?: ReactNode
}

/**
 * Role-based route guard — afriview pattern.
 *
 * When used as a LAYOUT WRAPPER (no children), it renders <Outlet />
 * so nested routes work correctly.
 *
 * When used INLINE (with children), it renders the children directly.
 *
 * Unauthenticated → redirect to loginPath
 * Wrong role → show inline "Access Denied" (no redirect loops)
 */
export const RoleRoute: React.FC<RoleRouteProps> = ({
  children,
  roles,
  loginPath = '/login',
  fallback,
}) => {
  const { isAuthenticated, loading, user } = useJWTAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  if (!roles.includes(user.role)) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">
            You don't have permission to access this page.
          </p>
          <button
            onClick={() => window.history.back()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return children ? <>{children}</> : <Outlet />
}

export default RoleRoute
