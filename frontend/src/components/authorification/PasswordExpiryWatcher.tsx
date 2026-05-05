import React, { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import { ModalDialog } from '@/components/ui/Modal/ModalDialog'
import { useAuth } from '@/contexts/AuthContext'

export interface PasswordExpiryWatcherProps {
  /** Days before expiry to show warning */
  warningDays?: number
  /** Password expiry duration in days */
  expiryDays?: number
  /** Callback when password change is requested */
  onPasswordChange?: () => void
  /** Callback when session is expired */
  onSessionExpired?: () => void
  /** Whether to show modal for password change */
  showModal?: boolean
  /** Additional className */
  className?: string
  /** Custom warning message */
  warningMessage?: string
  /** Custom expired message */
  expiredMessage?: string
  /** Whether to auto-logout on expiry */
  autoLogout?: boolean
  /** Auto-logout delay in seconds */
  autoLogoutDelay?: number
}

export const PasswordExpiryWatcher: React.FC<PasswordExpiryWatcherProps> = ({
  warningDays = 7,
  expiryDays = 90,
  onPasswordChange,
  onSessionExpired,
  showModal = true,
  className,
  warningMessage = 'Your password will expire soon. Please change it to maintain access.',
  expiredMessage = 'Your password has expired. Please change it to continue.',
  autoLogout = true,
  autoLogoutDelay = 60,
}) => {
  const [showWarning, setShowWarning] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(autoLogoutDelay)
  const { user, logout } = useAuth()

  const checkPasswordExpiry = useCallback(() => {
    if (!user?.passwordChangedAt) return

    const passwordChangedDate = new Date(user.passwordChangedAt)
    const expiryDate = new Date(passwordChangedDate)
    expiryDate.setDate(expiryDate.getDate() + expiryDays)

    const now = new Date()
    const diffTime = expiryDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    setDaysRemaining(diffDays)

    if (diffDays <= 0) {
      setIsExpired(true)
      setShowWarning(false)
    } else if (diffDays <= warningDays) {
      setShowWarning(true)
      setIsExpired(false)
    } else {
      setShowWarning(false)
      setIsExpired(false)
    }
  }, [user?.passwordChangedAt, expiryDays, warningDays])

  useEffect(() => {
    checkPasswordExpiry()
    const interval = setInterval(checkPasswordExpiry, 60000) // Check every minute
    return () => clearInterval(interval)
  }, [checkPasswordExpiry])

  // Auto-logout countdown
  useEffect(() => {
    if (!isExpired || !autoLogout) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          handleLogout()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isExpired, autoLogout])

  const handlePasswordChange = () => {
    onPasswordChange?.()
    setShowWarning(false)
  }

  const handleLogout = () => {
    logout?.()
    onSessionExpired?.()
  }

  const handleDismiss = () => {
    setShowWarning(false)
  }

  if (!showWarning && !isExpired) return null

  // Warning Banner
  if (showWarning && !showModal) {
    return (
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3 bg-yellow-50 border-b border-yellow-200',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <div>
            <p className="text-sm font-medium text-yellow-800">{warningMessage}</p>
            <p className="text-xs text-yellow-600">
              Days remaining: {daysRemaining}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePasswordChange}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-yellow-800 bg-yellow-100 rounded-lg hover:bg-yellow-200"
          >
            <RefreshCw className="h-4 w-4" />
            Change Password
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-yellow-600 hover:text-yellow-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  // Modal for warning or expired
  return (
    <ModalDialog
      open={showWarning || isExpired}
      onClose={isExpired ? undefined : handleDismiss}
      title={isExpired ? 'Password Expired' : 'Password Expiring Soon'}
      size="sm"
      showCloseButton={!isExpired}
      closeOnOverlayClick={!isExpired}
      closeOnEscape={!isExpired}
      footer={
        <div className="flex justify-end gap-2">
          {!isExpired && (
            <button
              type="button"
              onClick={handleDismiss}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Later
            </button>
          )}
          <button
            type="button"
            onClick={handlePasswordChange}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
          >
            Change Password
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center py-4">
        {isExpired ? (
          <>
            <div className="p-3 bg-red-100 rounded-full mb-4">
              <Clock className="h-8 w-8 text-red-600" />
            </div>
            <p className="text-gray-600 mb-4">{expiredMessage}</p>
            {autoLogout && (
              <p className="text-sm text-red-600">
                Auto-logout in {countdown} seconds
              </p>
            )}
          </>
        ) : (
          <>
            <div className="p-3 bg-yellow-100 rounded-full mb-4">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
            <p className="text-gray-600 mb-2">{warningMessage}</p>
            <div className="flex items-center gap-2 text-yellow-600">
              <Clock className="h-4 w-4" />
              <span className="font-medium">{daysRemaining} days remaining</span>
            </div>
          </>
        )}
      </div>
    </ModalDialog>
  )
}

export default PasswordExpiryWatcher
