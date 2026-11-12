import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface StyledInputBaseProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Input size */
  size?: 'sm' | 'md' | 'lg'
  /** Input variant */
  variant?: 'outlined' | 'filled' | 'standard'
  /** Whether input has error */
  error?: boolean
  /** Whether input is full width */
  fullWidth?: boolean
  /** Start adornment */
  startAdornment?: React.ReactNode
  /** End adornment */
  endAdornment?: React.ReactNode
  /** Additional className */
  className?: string
  /** Input container className */
  containerClassName?: string
}

const sizeClasses = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-sm px-4',
  lg: 'h-12 text-base px-4',
}

const variantClasses = {
  outlined: 'border border-gray-300 bg-white focus:border-primary focus:ring-1 focus:ring-primary',
  filled: 'border-0 bg-gray-100 focus:bg-white focus:ring-2 focus:ring-primary',
  standard: 'border-0 border-b-2 border-gray-300 bg-transparent rounded-none focus:border-primary',
}

export const StyledInputBase = forwardRef<HTMLInputElement, StyledInputBaseProps>(
  (
    {
      size = 'md',
      variant = 'outlined',
      error = false,
      fullWidth = true,
      startAdornment,
      endAdornment,
      className,
      containerClassName,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div
        className={cn(
          'relative inline-flex items-center',
          fullWidth && 'w-full',
          containerClassName
        )}
      >
        {startAdornment && (
          <div className="absolute left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            {startAdornment}
          </div>
        )}

        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full rounded-md outline-none transition-all',
            'placeholder:text-gray-400',
            'disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500',
            sizeClasses[size],
            variantClasses[variant],
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            startAdornment && 'pl-10',
            endAdornment && 'pr-10',
            className
          )}
          {...props}
        />

        {endAdornment && (
          <div className="absolute right-0 pr-3 flex items-center text-gray-400">
            {endAdornment}
          </div>
        )}
      </div>
    )
  }
)

StyledInputBase.displayName = 'StyledInputBase'

export default StyledInputBase
