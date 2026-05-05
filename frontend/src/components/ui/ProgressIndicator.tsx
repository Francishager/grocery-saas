import React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressIndicatorProps {
  /** Current progress value (0-100) */
  value: number
  /** Maximum value */
  max?: number
  /** Minimum value */
  min?: number
  /** Progress bar size */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Progress bar color */
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info'
  /** Whether to show label */
  showLabel?: boolean
  /** Label position */
  labelPosition?: 'top' | 'bottom' | 'inside' | 'right'
  /** Custom label */
  label?: string
  /** Whether to animate progress */
  animated?: boolean
  /** Whether to show striped pattern */
  striped?: boolean
  /** Whether progress is indeterminate */
  indeterminate?: boolean
  /** Additional className */
  className?: string
  /** Progress bar shape */
  shape?: 'rounded' | 'square' | 'circle'
  /** Circle size (for circular progress) */
  circleSize?: number
  /** Circle stroke width */
  strokeWidth?: number
}

const sizeClasses = {
  xs: 'h-1',
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
}

const colorClasses = {
  primary: 'bg-primary',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  value,
  max = 100,
  min = 0,
  size = 'md',
  color = 'primary',
  showLabel = false,
  labelPosition = 'top',
  label,
  animated = false,
  striped = false,
  indeterminate = false,
  className,
  shape = 'rounded',
  circleSize = 120,
  strokeWidth = 8,
}) => {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  // Circular progress
  if (shape === 'circle') {
    const radius = (circleSize - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const offset = circumference - (percentage / 100) * circumference

    return (
      <div className={cn('inline-flex flex-col items-center', className)}>
        {showLabel && labelPosition === 'top' && (
          <span className="text-sm text-gray-600 mb-2">
            {label || `${Math.round(percentage)}%`}
          </span>
        )}

        <div className="relative" style={{ width: circleSize, height: circleSize }}>
          <svg
            className="transform -rotate-90"
            width={circleSize}
            height={circleSize}
          >
            {/* Background circle */}
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="none"
              className="text-gray-200"
            />
            {/* Progress circle */}
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={indeterminate ? circumference * 0.25 : offset}
              strokeLinecap="round"
              className={cn(
                colorClasses[color].replace('bg-', 'text-'),
                indeterminate && 'animate-spin'
              )}
              style={{
                transition: indeterminate ? 'none' : 'stroke-dashoffset 0.5s ease-in-out',
              }}
            />
          </svg>

          {showLabel && labelPosition === 'inside' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-semibold text-gray-700">
                {label || `${Math.round(percentage)}%`}
              </span>
            </div>
          )}
        </div>

        {showLabel && labelPosition === 'bottom' && (
          <span className="text-sm text-gray-600 mt-2">
            {label || `${Math.round(percentage)}%`}
          </span>
        )}
      </div>
    )
  }

  // Linear progress
  return (
    <div className={cn('w-full', className)}>
      {showLabel && labelPosition === 'top' && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-600">{label}</span>
          <span className="text-sm font-medium text-gray-700">{Math.round(percentage)}%</span>
        </div>
      )}

      <div className={cn('relative w-full bg-gray-200 overflow-hidden', shape === 'rounded' ? 'rounded-full' : 'rounded')}>
        <div
          className={cn(
            sizeClasses[size],
            colorClasses[color],
            'transition-all duration-300',
            animated && 'animate-pulse',
            striped && 'bg-stripes',
            indeterminate && 'animate-progress-indeterminate'
          )}
          style={{
            width: indeterminate ? '25%' : `${percentage}%`,
          }}
        >
          {showLabel && labelPosition === 'inside' && size === 'lg' && (
            <span className="flex items-center justify-center h-full text-xs font-medium text-white">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      </div>

      {showLabel && labelPosition === 'bottom' && (
        <span className="text-sm text-gray-600 mt-1">
          {label || `${Math.round(percentage)}%`}
        </span>
      )}

      {showLabel && labelPosition === 'right' && (
        <span className="text-sm text-gray-600 ml-2">
          {label || `${Math.round(percentage)}%`}
        </span>
      )}
    </div>
  )
}

export default ProgressIndicator
