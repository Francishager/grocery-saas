import React from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, X } from 'lucide-react'

export interface NonFieldErrorsAlertMessageProps {
  /** Array of error messages */
  errors?: string[]
  /** Whether to show close button */
  dismissible?: boolean
  /** Callback when dismissed */
  onDismiss?: () => void
  /** Alert title */
  title?: string
  /** Additional className */
  className?: string
  /** Alert variant */
  variant?: 'filled' | 'outlined' | 'standard'
  /** Whether to show icon */
  showIcon?: boolean
}

export const NonFieldErrorsAlertMessage: React.FC<NonFieldErrorsAlertMessageProps> = ({
  errors = [],
  dismissible = true,
  onDismiss,
  title = 'Please correct the following errors:',
  className,
  variant = 'standard',
  showIcon = true,
}) => {
  if (!errors || errors.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg',
        variant === 'filled' && 'bg-red-600 text-white',
        variant === 'outlined' && 'border border-red-600 bg-red-50 text-red-700',
        variant === 'standard' && 'bg-red-50 border-l-4 border-red-500 text-red-700',
        className
      )}
      role="alert"
    >
      {showIcon && (
        <AlertCircle
          className={cn(
            'h-5 w-5 flex-shrink-0 mt-0.5',
            variant === 'filled' ? 'text-white' : 'text-red-500'
          )}
        />
      )}

      <div className="flex-1">
        {title && (
          <h4 className="text-sm font-semibold mb-2">{title}</h4>
        )}

        <ul className="text-sm space-y-1">
          {errors.map((error, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-red-500">•</span>
              <span>{error}</span>
            </li>
          ))}
        </ul>
      </div>

      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'flex-shrink-0 p-1 rounded transition-colors',
            variant === 'filled'
              ? 'hover:bg-white/20 text-white'
              : 'hover:bg-red-100 text-red-500'
          )}
          aria-label="Dismiss errors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default NonFieldErrorsAlertMessage
