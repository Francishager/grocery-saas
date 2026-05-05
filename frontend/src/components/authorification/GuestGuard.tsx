import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { CustomLoader } from '@/components/ui/CustomLoader'

export interface GuestGuardProps {
  /** Children to render if not authenticated */
  children: React.ReactNode
  /** Redirect path if authenticated */
  redirectTo?: string
  /** Whether to show loading state */
  showLoading?: boolean
  /** Custom loading component */
  loadingComponent?: React.ReactNode
}

export const GuestGuard: React.FC<GuestGuardProps> = ({
  children,
  redirectTo = '/dashboard',
  showLoading = true,
  loadingComponent,
}) => {
  const location = useLocation()
  const { isLoading, isAuthenticated } = useAuth()

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

  // Redirect if already authenticated
  if (isAuthenticated) {
    // Get redirect path from location state or use default
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || redirectTo
    return <Navigate to={from} replace />
  }

  return <>{children}</>
}

export default GuestGuard
