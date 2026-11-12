import React from 'react'
import { cn } from '@/lib/utils'

export interface RequiredFieldLabelProps {
  /** Label text */
  children: React.ReactNode
  /** Whether field is required */
  required?: boolean
  /** Required indicator character */
  requiredChar?: string
  /** Whether to show optional indicator */
  showOptional?: boolean
  /** Optional indicator text */
  optionalText?: string
  /** Label size */
  size?: 'sm' | 'md' | 'lg'
  /** Label weight */
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
  /** Additional className */
  className?: string
  /** Whether label is disabled */
  disabled?: boolean
  /** Label color */
  color?: 'default' | 'primary' | 'muted'
  /** Whether to show tooltip on required indicator */
  tooltip?: string
}

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

const weightClasses = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

const colorClasses = {
  default: 'text-gray-700',
  primary: 'text-primary',
  muted: 'text-gray-500',
}

export const RequiredFieldLabel: React.FC<RequiredFieldLabelProps> = ({
  children,
  required = false,
  requiredChar = '*',
  showOptional = false,
  optionalText = '(optional)',
  size = 'md',
  weight = 'medium',
  className,
  disabled = false,
  color = 'default',
  tooltip,
}) => {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-1',
        sizeClasses[size],
        weightClasses[weight],
        colorClasses[color],
        disabled && 'text-gray-400 cursor-not-allowed',
        className
      )}
    >
      <span>{children}</span>

      {required && (
        <span
          className="text-red-500"
          title={tooltip || 'This field is required'}
        >
          {requiredChar}
        </span>
      )}

      {showOptional && !required && (
        <span className="text-gray-400 text-xs">
          {optionalText}
        </span>
      )}
    </label>
  )
}

export default RequiredFieldLabel
