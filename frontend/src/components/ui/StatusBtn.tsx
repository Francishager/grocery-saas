import React from 'react'
import { cn } from '@/lib/utils'

export type StatusType = 'success' | 'error' | 'warning' | 'info' | 'default' | 'pending' | 'processing'

export interface StatusBtnProps {
  /** Status type */
  status: StatusType
  /** Status label */
  label?: string
  /** Size */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Variant */
  variant?: 'filled' | 'outlined' | 'text'
  /** Whether to show dot indicator */
  showDot?: boolean
  /** Whether button is clickable */
  clickable?: boolean
  /** Click handler */
  onClick?: () => void
  /** Additional className */
  className?: string
  /** Icon */
  icon?: React.ReactNode
  /** Whether to pulse the dot */
  pulse?: boolean
}

const statusConfig = {
  success: {
    filled: 'bg-green-100 text-green-700',
    outlined: 'border border-green-500 text-green-600 bg-white',
    text: 'text-green-600',
    dot: 'bg-green-500',
  },
  error: {
    filled: 'bg-red-100 text-red-700',
    outlined: 'border border-red-500 text-red-600 bg-white',
    text: 'text-red-600',
    dot: 'bg-red-500',
  },
  warning: {
    filled: 'bg-yellow-100 text-yellow-700',
    outlined: 'border border-yellow-500 text-yellow-600 bg-white',
    text: 'text-yellow-600',
    dot: 'bg-yellow-500',
  },
  info: {
    filled: 'bg-blue-100 text-blue-700',
    outlined: 'border border-blue-500 text-blue-600 bg-white',
    text: 'text-blue-600',
    dot: 'bg-blue-500',
  },
  default: {
    filled: 'bg-gray-100 text-gray-700',
    outlined: 'border border-gray-500 text-gray-600 bg-white',
    text: 'text-gray-600',
    dot: 'bg-gray-500',
  },
  pending: {
    filled: 'bg-orange-100 text-orange-700',
    outlined: 'border border-orange-500 text-orange-600 bg-white',
    text: 'text-orange-600',
    dot: 'bg-orange-500',
  },
  processing: {
    filled: 'bg-purple-100 text-purple-700',
    outlined: 'border border-purple-500 text-purple-600 bg-white',
    text: 'text-purple-600',
    dot: 'bg-purple-500',
  },
}

const sizeClasses = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
}

const dotSizeClasses = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
}

export const StatusBtn: React.FC<StatusBtnProps> = ({
  status,
  label,
  size = 'md',
  variant = 'filled',
  showDot = true,
  clickable = false,
  onClick,
  className,
  icon,
  pulse = false,
}) => {
  const config = statusConfig[status]

  const Component = clickable ? 'button' : 'span'

  return (
    <Component
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onClick : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        config[variant],
        sizeClasses[size],
        clickable && 'cursor-pointer hover:opacity-80 transition-opacity',
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            'rounded-full',
            config.dot,
            dotSizeClasses[size],
            pulse && 'animate-pulse'
          )}
        />
      )}
      {icon}
      {label && <span>{label}</span>}
    </Component>
  )
}

export default StatusBtn
