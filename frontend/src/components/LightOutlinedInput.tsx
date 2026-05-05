import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface LightOutlinedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Input label */
  label?: string
  /** Error message */
  error?: string
  /** Helper text */
  helperText?: string
  /** Whether input is required */
  required?: boolean
  /** Whether input is full width */
  fullWidth?: boolean
  /** Start adornment */
  startAdornment?: React.ReactNode
  /** End adornment */
  endAdornment?: React.ReactNode
  /** Input size */
  size?: 'sm' | 'md' | 'lg'
  /** Container className */
  containerClassName?: string
  /** Label className */
  labelClassName?: string
}

const sizeClasses = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-sm px-4',
  lg: 'h-12 text-base px-4',
}

export const LightOutlinedInput = forwardRef<HTMLInputElement, LightOutlinedInputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      fullWidth = true,
      startAdornment,
      endAdornment,
      size = 'md',
      className,
      containerClassName,
      labelClassName,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `light-input-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div
        className={cn(
          fullWidth ? 'w-full' : 'inline-block',
          containerClassName
        )}
      >
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block text-sm font-medium text-gray-700 mb-1',
              labelClassName
            )}
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {startAdornment && (
            <div className="absolute left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              {startAdornment}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              'w-full rounded-lg border bg-white outline-none transition-all',
              'placeholder:text-gray-400',
              'focus:ring-2 focus:ring-primary/20 focus:border-primary',
              'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
              sizeClasses[size],
              error
                ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500'
                : 'border-gray-300 hover:border-gray-400',
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

        {error && (
          <p className="mt-1 text-sm text-red-500">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

LightOutlinedInput.displayName = 'LightOutlinedInput'

export default LightOutlinedInput
