import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { RefreshCw, X, Download, AlertCircle } from 'lucide-react'

export interface VersionUpdateProps {
  /** Current version */
  currentVersion: string
  /** Latest version available */
  latestVersion?: string
  /** Whether an update is available */
  updateAvailable?: boolean
  /** Callback when update is triggered */
  onUpdate?: () => void
  /** Callback when dismissed */
  onDismiss?: () => void
  /** Whether to auto-check for updates */
  autoCheck?: boolean
  /** Auto-check interval in milliseconds */
  checkInterval?: number
  /** Whether update is in progress */
  updating?: boolean
  /** Update progress percentage */
  progress?: number
  /** Release notes */
  releaseNotes?: string
  /** Whether update is critical */
  critical?: boolean
  /** Additional className */
  className?: string
  /** Position of the notification */
  position?: 'top' | 'bottom'
  /** Whether to show dismiss button */
  dismissible?: boolean
}

export const VersionUpdate: React.FC<VersionUpdateProps> = ({
  currentVersion,
  latestVersion,
  updateAvailable = false,
  onUpdate,
  onDismiss,
  autoCheck = false,
  checkInterval = 60000,
  updating = false,
  progress,
  releaseNotes,
  critical = false,
  className,
  position = 'top',
  dismissible = true,
}) => {
  const [isVisible, setIsVisible] = useState(updateAvailable)

  useEffect(() => {
    setIsVisible(updateAvailable)
  }, [updateAvailable])

  useEffect(() => {
    if (autoCheck && checkInterval > 0) {
      const interval = setInterval(() => {
        // Version check logic would go here
        console.log('Checking for updates...')
      }, checkInterval)

      return () => clearInterval(interval)
    }
  }, [autoCheck, checkInterval])

  const handleDismiss = () => {
    if (!critical) {
      setIsVisible(false)
      onDismiss?.()
    }
  }

  const handleUpdate = () => {
    onUpdate?.()
  }

  if (!isVisible) return null

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50 p-4',
        position === 'top' ? 'top-0' : 'bottom-0',
        critical ? 'bg-red-600' : 'bg-primary',
        'text-white shadow-lg',
        className
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {critical ? (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <RefreshCw className={cn('h-5 w-5 flex-shrink-0', updating && 'animate-spin')} />
          )}

          <div>
            <p className="font-medium">
              {critical
                ? 'Critical update required'
                : `Update available: v${latestVersion}`}
            </p>
            <p className="text-sm opacity-90">
              Current version: v{currentVersion}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {releaseNotes && (
            <button
              type="button"
              className="text-sm underline hover:no-underline"
              onClick={() => {/* Show release notes */}}
            >
              View release notes
            </button>
          )}

          {updating ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">Updating...</span>
              {progress !== undefined && (
                <div className="w-24 h-2 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleUpdate}
              className="flex items-center gap-2 px-4 py-2 bg-white text-primary rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              <Download className="h-4 w-4" />
              Update now
            </button>
          )}

          {dismissible && !critical && !updating && (
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default VersionUpdate
