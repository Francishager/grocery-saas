import React from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react'

export interface AlertMessageProps {
  /** Alert severity/type */
  severity?: 'success' | 'error' | 'warning' | 'info'
  /** Alert title */
  title?: string
  /** Alert message */
  message?: string
  /** Whether to show close button */
  onClose?: () => void
  /** Whether the alert is dismissible */
  dismissible?: boolean
  /** Whether to show icon */
  showIcon?: boolean
  /** Custom icon */
  icon?: React.ReactNode
  /** Additional className */
  className?: string
  /** Alert variant style */
  variant?: 'filled' | 'outlined' | 'standard'
  /** Action button */
  action?: React.ReactNode
  /** Children content */
  children?: React.ReactNode
}

const severityConfig = {
  success: {
    icon: CheckCircle,
    filledClass: 'bg-green-600 text-white',
    outlinedClass: 'border-green-600 text-green-600 bg-green-50',
    standardClass: 'bg-green-50 text-green-800 border-l-4 border-green-500',
  },
  error: {
    icon: XCircle,
    filledClass: 'bg-red-600 text-white',
    outlinedClass: 'border-red-600 text-red-600 bg-red-50',
    standardClass: 'bg-red-50 text-red-800 border-l-4 border-red-500',
  },
  warning: {
    icon: AlertCircle,
    filledClass: 'bg-yellow-500 text-white',
    outlinedClass: 'border-yellow-500 text-yellow-700 bg-yellow-50',
    standardClass: 'bg-yellow-50 text-yellow-800 border-l-4 border-yellow-500',
  },
  info: {
    icon: Info,
    filledClass: 'bg-blue-600 text-white',
    outlinedClass: 'border-blue-600 text-blue-600 bg-blue-50',
    standardClass: 'bg-blue-50 text-blue-800 border-l-4 border-blue-500',
  },
}

export const AlertMessage: React.FC<AlertMessageProps> = ({
  severity = 'info',
  title,
  message,
  onClose,
  dismissible = true,
  showIcon = true,
  icon,
  className,
  variant = 'standard',
  action,
  children,
}) => {
  const config = severityConfig[severity]
  const IconComponent = config.icon

  const variantClass = {
    filled: config.filledClass,
    outlined: config.outlinedClass,
    standard: config.standardClass,
  }[variant]

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg',
        variantClass,
        className
      )}
      role="alert"
    >
      {showIcon && (
        <div className="flex-shrink-0 mt-0.5">
          {icon || <IconComponent className="h-5 w-5" />}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="text-sm font-semibold mb-1">{title}</h4>
        )}
        {message && (
          <p className="text-sm">{message}</p>
        )}
        {children}
        {action && (
          <div className="mt-2">{action}</div>
        )}
      </div>

      {dismissible && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
          aria-label="Close alert"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default AlertMessage
