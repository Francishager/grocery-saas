import React from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export interface ProgressCardProps {
  /** Card title */
  title: string
  /** Main value */
  value: string | number
  /** Subtitle or description */
  subtitle?: string
  /** Progress percentage (0-100) */
  progress?: number
  /** Trend direction */
  trend?: 'up' | 'down' | 'neutral'
  /** Trend value (e.g., "+12%" or "-5%") */
  trendValue?: string
  /** Icon */
  icon?: React.ReactNode
  /** Card color theme */
  color?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'
  /** Whether to show progress bar */
  showProgress?: boolean
  /** Progress bar color */
  progressColor?: string
  /** Additional className */
  className?: string
  /** Click handler */
  onClick?: () => void
  /** Whether card is loading */
  loading?: boolean
  /** Footer content */
  footer?: React.ReactNode
}

const colorClasses = {
  default: {
    bg: 'bg-white',
    border: 'border-gray-200',
    icon: 'bg-gray-100 text-gray-600',
    title: 'text-gray-500',
    value: 'text-gray-900',
  },
  primary: {
    bg: 'bg-white',
    border: 'border-primary/20',
    icon: 'bg-primary/10 text-primary',
    title: 'text-gray-500',
    value: 'text-primary',
  },
  success: {
    bg: 'bg-white',
    border: 'border-green-200',
    icon: 'bg-green-100 text-green-600',
    title: 'text-gray-500',
    value: 'text-green-600',
  },
  warning: {
    bg: 'bg-white',
    border: 'border-yellow-200',
    icon: 'bg-yellow-100 text-yellow-600',
    title: 'text-gray-500',
    value: 'text-yellow-600',
  },
  error: {
    bg: 'bg-white',
    border: 'border-red-200',
    icon: 'bg-red-100 text-red-600',
    title: 'text-gray-500',
    value: 'text-red-600',
  },
  info: {
    bg: 'bg-white',
    border: 'border-blue-200',
    icon: 'bg-blue-100 text-blue-600',
    title: 'text-gray-500',
    value: 'text-blue-600',
  },
}

export const ProgressCard: React.FC<ProgressCardProps> = ({
  title,
  value,
  subtitle,
  progress = 0,
  trend,
  trendValue,
  icon,
  color = 'default',
  showProgress = true,
  progressColor,
  className,
  onClick,
  loading = false,
  footer,
}) => {
  const config = colorClasses[color]

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  const trendColor = trend === 'up' 
    ? 'text-green-600' 
    : trend === 'down' 
    ? 'text-red-600' 
    : 'text-gray-500'

  return (
    <div
      className={cn(
        'rounded-lg border p-4 shadow-sm',
        config.bg,
        config.border,
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={cn('text-sm font-medium', config.title)}>{title}</p>
          
          {loading ? (
            <div className="mt-2 h-8 w-24 bg-gray-200 animate-pulse rounded" />
          ) : (
            <p className={cn('mt-2 text-2xl font-bold', config.value)}>{value}</p>
          )}

          {(subtitle || trendValue) && (
            <div className="mt-1 flex items-center gap-2">
              {subtitle && (
                <span className="text-sm text-gray-500">{subtitle}</span>
              )}
              {trendValue && trend && (
                <span className={cn('flex items-center gap-1 text-sm font-medium', trendColor)}>
                  <TrendIcon className="h-3 w-3" />
                  {trendValue}
                </span>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div className={cn('p-2 rounded-lg', config.icon)}>
            {icon}
          </div>
        )}
      </div>

      {showProgress && progress > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                progressColor || config.icon.replace('bg-', 'bg-').split(' ')[0]
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {footer && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          {footer}
        </div>
      )}
    </div>
  )
}

export default ProgressCard
