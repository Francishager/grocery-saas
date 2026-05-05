import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, Clock, LogOut, RefreshCw } from 'lucide-react'
import { ModalDialog } from '@/components/ui/Modal/ModalDialog'
import { useAuth } from '@/contexts/AuthContext'

export interface SessionMonitorProps {
  /** Session timeout in milliseconds */
  timeout?: number
  /** Warning time before timeout in milliseconds */
  warningTime?: number
  /** Callback when session expires */
  onSessionExpire?: () => void
  /** Callback when session is extended */
  onSessionExtend?: () => void
  /** Whether to show warning dialog */
  showWarningDialog?: boolean
  /** Whether to auto logout */
  autoLogout?: boolean
  /** Events that reset the timer */
  resetEvents?: string[]
  /** Additional className */
  className?: string
  /** Custom warning message */
  warningMessage?: string
  /** Extend session button text */
  extendButtonText?: string
  /** Logout button text */
  logoutButtonText?: string
}

export const SessionMonitor: React.FC<SessionMonitorProps> = ({
  timeout = 30 * 60 * 1000, // 30 minutes
  warningTime = 5 * 60 * 1000, // 5 minutes before timeout
  onSessionExpire,
  onSessionExtend,
  showWarningDialog = true,
  autoLogout = true,
  resetEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'],
  className,
  warningMessage = 'Your session is about to expire due to inactivity.',
  extendButtonText = 'Extend Session',
  logoutButtonText = 'Logout Now',
}) => {
  const [showWarning, setShowWarning] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(timeout)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null)
  const { logout } = useAuth()

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
    }

    setTimeRemaining(timeout)
    setShowWarning(false)

    // Set warning timer
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
    }, timeout - warningTime)

    // Set timeout timer
    timerRef.current = setTimeout(() => {
      handleSessionExpire()
    }, timeout)
  }, [timeout, warningTime])

  const handleSessionExpire = useCallback(() => {
    setShowWarning(false)
    onSessionExpire?.()
    if (autoLogout) {
      logout?.()
    }
  }, [autoLogout, logout, onSessionExpire])

  const handleExtendSession = useCallback(() => {
    resetTimer()
    onSessionExtend?.()
  }, [resetTimer, onSessionExtend])

  const handleLogout = useCallback(() => {
    logout?.()
    onSessionExpire?.()
  }, [logout, onSessionExpire])

  // Initialize timer and event listeners
  useEffect(() => {
    resetTimer()

    const handleActivity = () => {
      resetTimer()
    }

    resetEvents.forEach((event) => {
      document.addEventListener(event, handleActivity)
    })

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current)
      }
      resetEvents.forEach((event) => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [resetTimer, resetEvents])

  // Update time remaining display
  useEffect(() => {
    if (!showWarning) return

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1000) {
          return 0
        }
        return prev - 1000
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [showWarning])

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (!showWarning) return null

  if (showWarningDialog) {
    return (
      <ModalDialog
        open={showWarning}
        onClose={() => {}}
        title="Session Warning"
        showCloseButton={false}
        closeOnOverlayClick={false}
        closeOnEscape={false}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              {logoutButtonText}
            </button>
            <button
              type="button"
              onClick={handleExtendSession}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
            >
              {extendButtonText}
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="p-3 bg-yellow-100 rounded-full mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
          <p className="text-gray-600 mb-4">{warningMessage}</p>
          <div className="flex items-center gap-2 text-yellow-600">
            <Clock className="h-5 w-5" />
            <span className="text-xl font-semibold">
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
      </ModalDialog>
    )
  }

  // Banner style warning
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 p-4 bg-yellow-50 border-t border-yellow-200',
        className
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <p className="text-sm text-yellow-800">{warningMessage}</p>
          <span className="text-sm font-semibold text-yellow-600">
            {formatTime(timeRemaining)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm text-yellow-800 hover:bg-yellow-100 rounded"
          >
            {logoutButtonText}
          </button>
          <button
            type="button"
            onClick={handleExtendSession}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700"
          >
            <RefreshCw className="h-4 w-4" />
            {extendButtonText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SessionMonitor
