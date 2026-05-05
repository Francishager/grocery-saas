import React, { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, RefreshCw, X } from 'lucide-react'

export interface InternetConnectionProps {
  /** Whether to show status indicator */
  showIndicator?: boolean
  /** Whether to show notification on status change */
  showNotification?: boolean
  /** Notification position */
  notificationPosition?: 'top' | 'bottom'
  /** Auto-hide notification duration (ms), 0 for no auto-hide */
  autoHideDuration?: number
  /** Callback when connection status changes */
  onStatusChange?: (isOnline: boolean) => void
  /** Custom online message */
  onlineMessage?: string
  /** Custom offline message */
  offlineMessage?: string
  /** Retry button text */
  retryButtonText?: string
  /** Retry callback */
  onRetry?: () => void
  /** Additional className */
  className?: string
  /** Children to render when online */
  children?: React.ReactNode
}

export const InternetConnection: React.FC<InternetConnectionProps> = ({
  showIndicator = true,
  showNotification = true,
  notificationPosition = 'top',
  autoHideDuration = 5000,
  onStatusChange,
  onlineMessage = 'You are back online',
  offlineMessage = 'You are currently offline',
  retryButtonText = 'Retry',
  onRetry,
  className,
  children,
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showOfflineNotification, setShowOfflineNotification] = useState(false)
  const [showOnlineNotification, setShowOnlineNotification] = useState(false)

  const handleOnline = useCallback(() => {
    setIsOnline(true)
    onStatusChange?.(true)
    if (showNotification) {
      setShowOnlineNotification(true)
      setShowOfflineNotification(false)
      if (autoHideDuration > 0) {
        setTimeout(() => setShowOnlineNotification(false), autoHideDuration)
      }
    }
  }, [onStatusChange, showNotification, autoHideDuration])

  const handleOffline = useCallback(() => {
    setIsOnline(false)
    onStatusChange?.(false)
    if (showNotification) {
      setShowOfflineNotification(true)
      setShowOnlineNotification(false)
    }
  }, [onStatusChange, showNotification])

  useEffect(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check initial state
    if (!navigator.onLine) {
      handleOffline()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  const handleRetry = () => {
    if (isOnline) return
    window.location.reload()
    onRetry?.()
  }

  const positionClasses = {
    top: 'top-0 left-0 right-0',
    bottom: 'bottom-0 left-0 right-0',
  }

  // Render children only when online
  if (children && isOnline) {
    return <>{children}</>
  }

  return (
    <>
      {/* Status Indicator */}
      {showIndicator && (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            isOnline
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700',
            className
          )}
        >
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4" />
              <span>Offline</span>
            </>
          )}
        </div>
      )}

      {/* Offline Notification */}
      {showNotification && showOfflineNotification && (
        <div
          className={cn(
            'fixed z-50 p-4 bg-red-600 text-white shadow-lg',
            positionClasses[notificationPosition]
          )}
        >
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <WifiOff className="h-5 w-5" />
              <span className="font-medium">{offlineMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                {retryButtonText}
              </button>
              <button
                type="button"
                onClick={() => setShowOfflineNotification(false)}
                className="p-1 hover:bg-white/20 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Online Notification */}
      {showNotification && showOnlineNotification && (
        <div
          className={cn(
            'fixed z-50 p-4 bg-green-600 text-white shadow-lg',
            positionClasses[notificationPosition]
          )}
        >
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <Wifi className="h-5 w-5" />
              <span className="font-medium">{onlineMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowOnlineNotification(false)}
              className="p-1 hover:bg-white/20 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Offline Content */}
      {!isOnline && !showIndicator && (
        <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
          <WifiOff className="h-16 w-16 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Internet Connection</h3>
          <p className="text-gray-500 mb-4">{offlineMessage}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            {retryButtonText}
          </button>
        </div>
      )}
    </>
  )
}

export default InternetConnection
