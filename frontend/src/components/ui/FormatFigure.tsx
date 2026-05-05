import React from 'react'
import { cn } from '@/lib/utils'

export interface FormatFigureProps {
  /** Value to format */
  value: number | string
  /** Format type */
  type?: 'number' | 'currency' | 'percent' | 'decimal' | 'compact'
  /** Currency code (for currency type) */
  currency?: string
  /** Locale */
  locale?: string
  /** Minimum fraction digits */
  minimumFractionDigits?: number
  /** Maximum fraction digits */
  maximumFractionDigits?: number
  /** Whether to show prefix/suffix */
  showSymbol?: boolean
  /** Prefix to show */
  prefix?: string
  /** Suffix to show */
  suffix?: string
  /** Text size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  /** Text weight */
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
  /** Text color */
  color?: 'default' | 'muted' | 'success' | 'error' | 'warning' | 'primary'
  /** Additional className */
  className?: string
  /** Whether to animate value changes */
  animate?: boolean
  /** Animation duration in ms */
  animationDuration?: number
}

const sizeClasses = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
}

const weightClasses = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

const colorClasses = {
  default: 'text-gray-900',
  muted: 'text-gray-500',
  success: 'text-green-600',
  error: 'text-red-600',
  warning: 'text-yellow-600',
  primary: 'text-primary',
}

export const FormatFigure: React.FC<FormatFigureProps> = ({
  value,
  type = 'number',
  currency = 'UGX',
  locale = 'en-US',
  minimumFractionDigits = 0,
  maximumFractionDigits = 2,
  showSymbol = true,
  prefix,
  suffix,
  size = 'md',
  weight = 'normal',
  color = 'default',
  className,
  animate = false,
  animationDuration = 500,
}) => {
  const formatValue = () => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    
    if (isNaN(numValue)) return value

    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits,
      maximumFractionDigits,
    }

    switch (type) {
      case 'currency':
        options.style = 'currency'
        options.currency = currency
        break
      case 'percent':
        options.style = 'percent'
        options.minimumFractionDigits = minimumFractionDigits || 1
        break
      case 'compact':
        options.notation = 'compact'
        options.compactDisplay = 'short'
        break
      case 'decimal':
        options.style = 'decimal'
        break
      default:
        options.style = 'decimal'
    }

    return new Intl.NumberFormat(locale, options).format(numValue)
  }

  const formattedValue = formatValue()

  return (
    <span
      className={cn(
        sizeClasses[size],
        weightClasses[weight],
        colorClasses[color],
        animate && 'transition-all',
        className
      )}
      style={animate ? { transitionDuration: `${animationDuration}ms` } : undefined}
    >
      {prefix && <span className="mr-1">{prefix}</span>}
      {formattedValue}
      {suffix && <span className="ml-1">{suffix}</span>}
    </span>
  )
}

export default FormatFigure
